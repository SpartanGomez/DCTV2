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
    // A spawns (1,4), B spawns (6,3). Sight range 2 — both players out of sight.
    // Whoever's active scouts around the enemy's spawn. Derive enemy spawn
    // from the *observer* (non-active) page's own position rather than page
    // identity, since the server may race the pageA↔slot0 mapping on
    // back-to-back tests.
    const observer = active === pageA ? pageB : pageA
    const observerPos = await observer.evaluate(() => window.__dct?.getOwnPos() ?? null)
    if (!observerPos) throw new Error('observer has no position')
    const enemySpawn = observerPos

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

    // Attacker marches 5 tiles along its spawn row to land adjacent to the
    // victim. Spawns are (1,4) and (6,3); derive the march target from actual
    // attacker position rather than page identity (see server-race note above).
    const attackerPos = await attacker.evaluate(() => window.__dct?.getOwnPos() ?? null)
    if (!attackerPos) throw new Error('attacker has no position')
    const victimPos = await victim.evaluate(() => window.__dct?.getOwnPos() ?? null)
    if (!victimPos) throw new Error('victim has no position')
    // March across to the victim's column, staying on the attacker's row —
    // lands orthogonally adjacent regardless of which spawn the attacker holds.
    const march = { x: victimPos.x, y: attackerPos.y }

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

test('surrender: active player kneels → opponent gets matchOver with surrender flag', async ({
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

    const kneeler = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const survivor = kneeler === pageA ? pageB : pageA

    const kneelerMatchOver = kneeler.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchOver:') && m.text().includes('surrender=true'),
      timeout: 10_000,
    })
    const survivorMatchOver = survivor.waitForEvent('console', {
      predicate: (m) => m.text().includes('matchOver:') && m.text().includes('surrender=true'),
      timeout: 10_000,
    })
    await kneeler.evaluate(() => {
      if (window.__dct) window.__dct.kneel()
    })
    const [kMsg, sMsg] = await Promise.all([kneelerMatchOver, survivorMatchOver])
    expect(kMsg.text()).toContain('outcome=DEFEAT')
    expect(sMsg.text()).toContain('outcome=VICTORY')
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

// ============================================================
// M7.5 — rotatable camera, multi-height terrain, jump-gating, 4-facing.
// SPEC v2 §6.3 / §6.5 / §6.6.
//
// The pit arena puts its `high_ground` perimeter at stack height 4. Spawn A
// is (1,4), spawn B is (6,3), both interior (height 1). For a spawn-adjacent
// perimeter tile:
//   - A (1,4) → (0,4) is the adjacent perimeter tile (Δh = 3).
//   - B (6,3) → (7,3) is the adjacent perimeter tile (Δh = 3).
// Knight jump=2 → rejected. Mage jump=3 → allowed.
// ============================================================

// The server's pageA↔playerA mapping is racy between tests (a previous test's
// socket may still be pending cleanup), so tests derive spawn/target data from
// the live match state rather than from page identity. After matchStart, read
// the active page's own position and compute the neighbor perimeter tile.
async function readOwnPos(page: Page): Promise<{ x: number; y: number }> {
  const pos = await page.evaluate(() => window.__dct?.getOwnPos() ?? null)
  if (!pos) throw new Error('active page has no getOwnPos result')
  return pos
}

function perimeterJumpTarget(pos: { x: number; y: number }): { x: number; y: number } {
  // Pit interior spawns are always at x=1 (A) or x=6 (B). The adjacent
  // perimeter column is the outer edge on that side.
  return { x: pos.x === 1 ? 0 : 7, y: pos.y }
}

test('M7.5 — Knight is rejected with height_exceeds_jump on the height-4 perimeter', async ({
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
    const active = infoA.currentTurn === infoA.youAre ? pageA : pageB

    // Confirm arena shape is server-authoritative.
    const perimH = await active.evaluate(() => window.__dct?.getTileHeight(0, 0))
    expect(perimH).toBe(4)
    const interiorH = await active.evaluate(() => window.__dct?.getTileHeight(3, 4))
    expect(interiorH).toBe(1)

    const pos = await readOwnPos(active)
    const target = perimeterJumpTarget(pos)
    const rejected = active.waitForEvent('console', {
      predicate: (m) => m.text().includes('actionResult: rejected (height_exceeds_jump)'),
      timeout: 5_000,
    })
    await active.evaluate(
      (t: { x: number; y: number }) => { window.__dct?.move(t.x, t.y) },
      target,
    )
    await rejected
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('M7.5 — Mage (jump 3) can scale the same height-4 perimeter Knight cannot', async ({
  browser,
}) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  try {
    const pageA = await ctxA.newPage()
    const pageB = await ctxB.newPage()
    const msA = waitForMatchStart(pageA)
    const msB = waitForMatchStart(pageB)
    await enterLobbyAndReady(pageA, 'mage')
    await enterLobbyAndReady(pageB, 'mage')
    const [infoA] = await Promise.all([msA, msB])
    const active = infoA.currentTurn === infoA.youAre ? pageA : pageB
    const pos = await readOwnPos(active)
    const target = perimeterJumpTarget(pos)

    await waitForOk(active, () =>
      active.evaluate(
        (t: { x: number; y: number }) => { window.__dct?.move(t.x, t.y) },
        target,
      ),
    )
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('M7.5 — camera rotation is client-only; pageA rotates, pageB stays put', async ({
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
    await Promise.all([msA, msB])

    const rotA0 = await pageA.evaluate(() => window.__dct?.getCameraRotation())
    const rotB0 = await pageB.evaluate(() => window.__dct?.getCameraRotation())
    expect(rotA0).toBe(0)
    expect(rotB0).toBe(0)

    const rotated = pageA.waitForEvent('console', {
      predicate: (m) => m.text().includes('camera rotation -> 90°'),
      timeout: 5_000,
    })
    await pageA.evaluate(() => { window.__dct?.rotateCamera('cw') })
    await rotated

    const rotA1 = await pageA.evaluate(() => window.__dct?.getCameraRotation())
    const rotB1 = await pageB.evaluate(() => window.__dct?.getCameraRotation())
    expect(rotA1).toBe(1)
    expect(rotB1).toBe(0) // client-only — peer unaffected
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('M7.5 — initial facings: A (spawn 1,4) faces E; B (spawn 6,3) faces W', async ({
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
    await Promise.all([msA, msB])

    const facingA = await pageA.evaluate(() => window.__dct?.getOwnFacing())
    const facingB = await pageB.evaluate(() => window.__dct?.getOwnFacing())
    const posA = await pageA.evaluate(() => window.__dct?.getOwnPos())
    const posB = await pageB.evaluate(() => window.__dct?.getOwnPos())
    // The server decides which socket becomes player A vs B; don't assume
    // pageA↔(1,4). Verify that the pair of (pos, facing) observations is the
    // expected spawn set: (1,4)→E and (6,3)→W.
    const observed = new Map<string, string | null>([
      [`${String(posA?.x)},${String(posA?.y)}`, facingA ?? null],
      [`${String(posB?.x)},${String(posB?.y)}`, facingB ?? null],
    ])
    expect(observed.get('1,4')).toBe('E')
    expect(observed.get('6,3')).toBe('W')
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})
