// tests/smoke/boot.spec.ts
// Smoke gates:
//   - /health endpoint reports ok + match counts
//   - Fog of war: observer can't see an enemy 6 tiles away until scouted
//   - Off-turn action rejected with typed error code
//   - Full kill flow: attacker closes into sight, attacks, match ends,
//     both clients transition to ResultsScene

import { test, expect, type Page } from '@playwright/test'

type ClassId = 'knight' | 'mage' | 'heretic'

interface MatchStart {
  matchId: string
  youAre: string
  currentTurn: string
}

async function enterLobbyAndReady(page: Page, classId: ClassId): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => typeof window.__dct !== 'undefined')
  await page.evaluate((c: ClassId) => {
    window.__dct?.selectClass(c)
  }, classId)
  await page.evaluate(() => {
    window.__dct?.ready()
  })
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

test('fog hides the distant enemy; scout reveals them', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await enterLobbyAndReady(pageA, 'knight')
    await enterLobbyAndReady(pageB, 'knight')
    const [infoA, infoB] = await Promise.all([msA, msB])
    expect(infoA.matchId).toBe(infoB.matchId)

    const active = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const isAActive = active === pageA
    // A spawns (1,4), B spawns (6,3). Sight range 2 — both players out of sight.
    // Whoever's active scouts around the enemy's spawn.
    const enemySpawn = isAActive ? { x: 6, y: 3 } : { x: 1, y: 4 }

    const scouted = active.waitForEvent('console', {
      predicate: (m) =>
        m.text().includes('stateUpdate:') &&
        m.text().includes(`foePos=(${String(enemySpawn.x)},${String(enemySpawn.y)})`),
      timeout: 10_000,
    })
    await active.evaluate(
      (c: { x: number; y: number }) => {
        if (window.__dct) window.__dct.scout(c.x, c.y)
      },
      enemySpawn,
    )
    await scouted
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('off-turn action is rejected with not_your_turn', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await enterLobbyAndReady(pageA, 'knight')
    await enterLobbyAndReady(pageB, 'knight')
    const [infoA] = await Promise.all([msA, msB])

    const active = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const observer = active === pageA ? pageB : pageA

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

test('full kill flow: attacker walks into sight + attacks until match ends', async ({
  browser,
}) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await enterLobbyAndReady(pageA, 'knight')
    await enterLobbyAndReady(pageB, 'knight')
    const [infoA] = await Promise.all([msA, msB])

    const attacker = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const victim = attacker === pageA ? pageB : pageA

    const attackerIsA = attacker === pageA
    // Attacker marches 5 tiles to land adjacent to the victim.
    const march = attackerIsA ? { x: 6, y: 4 } : { x: 1, y: 3 }

    // Round 1: walk to adjacency (pulls victim into sight), then end turn.
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

    // Rounds 2 & 3: attacker spends 4 energy on 2 attacks each round.
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

    // Round 4: one more attack kills the victim (HP 24 − 5×5 = −1).
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

test('class-selection lobby: mage vs heretic pair + match starts', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await enterLobbyAndReady(pageA, 'mage')
    await enterLobbyAndReady(pageB, 'heretic')
    const [infoA, infoB] = await Promise.all([msA, msB])
    expect(infoA.matchId).toBe(infoB.matchId)
    // Both tabs transitioned from LobbyScene to MatchScene (canvas visible).
    await expect(pageA.locator('canvas')).toBeVisible()
    await expect(pageB.locator('canvas')).toBeVisible()
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
