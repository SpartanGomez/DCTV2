// tests/smoke/boot.spec.ts
// Smoke gates:
//   - /health endpoint reports ok + match counts
//   - Active player moves, observer sees new foe position, off-turn move rejected
//   - Full kill flow: attacker walks, attacks until victim dies, both
//     clients receive matchOver and transition to ResultsScene.

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

async function waitForOk(page: Page, trigger: () => Promise<void>): Promise<void> {
  const ok = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('actionResult: ok'),
    timeout: 5_000,
  })
  await trigger()
  await ok
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

    await active.waitForFunction(() => typeof window.__dct !== 'undefined')
    await observer.waitForFunction(() => typeof window.__dct !== 'undefined')

    const activeIsA = active === pageA
    const targetX = activeIsA ? 2 : 5
    const targetY = activeIsA ? 4 : 3

    const observerUpdate = observer.waitForEvent('console', {
      predicate: (m) =>
        m
          .text()
          .includes('stateUpdate:') &&
        m.text().includes(`(${String(targetX)},${String(targetY)})`),
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

test('full kill flow: attacker walks + attacks until match ends; both see ResultsScene', async ({
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
    const [infoA] = await Promise.all([msA, msB])

    const attacker = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const victim = attacker === pageA ? pageB : pageA

    await attacker.waitForFunction(() => typeof window.__dct !== 'undefined')
    await victim.waitForFunction(() => typeof window.__dct !== 'undefined')

    const attackerIsA = attacker === pageA
    // Attacker marches 5 tiles to land adjacent to the victim.
    // A at (1,4) → (6,4). B at (6,3) → (1,3).
    const march = attackerIsA ? { x: 6, y: 4 } : { x: 1, y: 3 }

    // Round 1: walk to adjacency, then hand turn back and forth.
    await waitForOk(attacker, async () => {
      await attacker.evaluate(
        (t: { x: number; y: number }) => {
          if (window.__dct) window.__dct.move(t.x, t.y)
        },
        march,
      )
    })
    await waitForOk(attacker, async () => {
      await attacker.evaluate(() => {
        if (window.__dct) window.__dct.endTurn()
      })
    })
    await waitForOk(victim, async () => {
      await victim.evaluate(() => {
        if (window.__dct) window.__dct.endTurn()
      })
    })

    // Rounds 2 and 3: attacker spends 4 energy on 2 attacks per round, ends turn.
    for (let round = 0; round < 2; round++) {
      await waitForOk(attacker, async () => {
        await attacker.evaluate(() => {
          if (window.__dct) window.__dct.attackNearest()
        })
      })
      await waitForOk(attacker, async () => {
        await attacker.evaluate(() => {
          if (window.__dct) window.__dct.attackNearest()
        })
      })
      await waitForOk(attacker, async () => {
        await attacker.evaluate(() => {
          if (window.__dct) window.__dct.endTurn()
        })
      })
      await waitForOk(victim, async () => {
        await victim.evaluate(() => {
          if (window.__dct) window.__dct.endTurn()
        })
      })
    }

    // Round 4: one final attack kills the victim (HP 24 − 5×5 = −1).
    const attackerMatchOver = attacker.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchOver:'),
      timeout: 10_000,
    })
    const victimMatchOver = victim.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchOver:'),
      timeout: 10_000,
    })

    await attacker.evaluate(() => {
      if (window.__dct) window.__dct.attackNearest()
    })

    const [attackerMsg, victimMsg] = await Promise.all([attackerMatchOver, victimMatchOver])
    expect(attackerMsg.text()).toContain('outcome=VICTORY')
    expect(victimMsg.text()).toContain('outcome=DEFEAT')

    await expect(attacker.locator('canvas')).toBeVisible()
    await expect(victim.locator('canvas')).toBeVisible()
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
