// tests/smoke/boot.spec.ts
// M2 smoke gate: two contexts get paired; the active player moves one tile,
// the observer sees the updated state, and an off-turn move is rejected
// with `not_your_turn`.

import { test, expect, type Page } from '@playwright/test'

interface MatchStart {
  matchId: string
  youAre: string
  currentTurn: string
}

async function waitForMatchStart(page: Page): Promise<MatchStart> {
  const msg = await page.waitForEvent('console', {
    predicate: (m) => m.text().includes('matchStart'),
    timeout: 15_000,
  })
  const text = msg.text()
  return {
    matchId: /match=([^\s]+)/.exec(text)?.[1] ?? '',
    youAre: /youAre=([^\s]+)/.exec(text)?.[1] ?? '',
    currentTurn: /currentTurn=([^\s]+)/.exec(text)?.[1] ?? '',
  }
}

test('server /health reports matchesActive count', async ({ request }) => {
  const res = await request.get('http://localhost:8080/health')
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as {
    status: string
    matchesActive: number
    serverVersion: string
  }
  expect(body.status).toBe('ok')
  expect(body.serverVersion).toMatch(/\d+\.\d+\.\d+/)
  expect(typeof body.matchesActive).toBe('number')
})

test('active player moves; observer sees new position; off-turn move rejected', async ({
  browser,
}) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await pageA.goto('/')
    await pageB.goto('/')
    const [infoA, infoB] = await Promise.all([msA, msB])
    expect(infoA.matchId).toBeTruthy()
    expect(infoA.matchId).toBe(infoB.matchId)

    const active = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const observer = active === pageA ? pageB : pageA

    // Wait until the debug hook is installed on both pages.
    await active.waitForFunction(() => typeof window.__dct !== 'undefined')
    await observer.waitForFunction(() => typeof window.__dct !== 'undefined')

    // Knight spawns at (1,4) for A and (6,3) for B. Whichever is active,
    // move one tile east (Knight-A moves to (2,4), Knight-B to (5,3)).
    const activePid = active === pageA ? infoA.youAre : infoB.youAre
    const targetX = activePid === infoA.youAre ? 2 : 5
    const targetY = activePid === infoA.youAre ? 4 : 3

    const observerUpdate = observer.waitForEvent('console', {
      predicate: (m) =>
        m.text().includes('stateUpdate:') && m.text().includes(`(${String(targetX)},${String(targetY)})`),
      timeout: 10_000,
    })
    const activeOk = active.waitForEvent('console', {
      predicate: (m) => m.text().includes('actionResult: ok'),
      timeout: 10_000,
    })

    await active.evaluate(
      ({ x, y }: { x: number; y: number }) => {
        if (window.__dct) window.__dct.move(x, y)
      },
      { x: targetX, y: targetY },
    )

    await Promise.all([observerUpdate, activeOk])

    // Idle-player move attempt during A's turn: expect not_your_turn.
    const rejected = observer.waitForEvent('console', {
      predicate: (m) => m.text().includes('actionResult: rejected (not_your_turn)'),
      timeout: 10_000,
    })
    await observer.evaluate(() => {
      if (window.__dct) window.__dct.move(0, 0)
    })
    await rejected
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
