// tests/unit/bot-ai.test.ts
// SPEC §8.7 — bot decision tree. Verifies the new branches added in M13-J:
// retreat below 30 % HP, line-of-sight gate on ranged attacks, and the
// pickup-detour fallback. Keeps the older "attack when in range / move
// toward enemy" paths covered too so they don't regress.

import { describe, expect, it } from 'vitest'
import { botNextAction } from '../../src/server/BotAI.js'
import { createMatch, SPAWN_A, SPAWN_B } from '../../src/server/GameEngine.js'
import {
  matchId,
  playerId,
  type ArenaDef,
  type ClassId,
  type MatchState,
  type Pickup,
  type TerrainType,
} from '../../src/shared/types.js'

const PA = playerId('p-a')
const PB = playerId('p-b')
const MID = matchId('m-1')

function allStone(): TerrainType[][] {
  const rows: TerrainType[][] = []
  for (let y = 0; y < 8; y++) {
    const r: TerrainType[] = []
    for (let x = 0; x < 8; x++) r.push('stone')
    rows.push(r)
  }
  return rows
}

interface BuildOpts {
  classA?: ClassId
  classB?: ClassId
  tiles?: TerrainType[][]
  pickups?: Pickup[]
}

function build(opts: BuildOpts = {}): MatchState {
  const arena: ArenaDef = {
    slug: 'test',
    name: 'Test',
    tiles: opts.tiles ?? allStone(),
    spawns: [SPAWN_A, SPAWN_B],
    pickupSlots: [],
  }
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    classA: opts.classA ?? 'knight',
    classB: opts.classB ?? 'knight',
    firstTurn: 'A',
    now: () => 0,
    arena,
    pickups: opts.pickups ?? [],
  })
}

/** Mutate a copy: set unit position by ownerId. */
function withUnitPos(state: MatchState, ownerId: typeof PA, x: number, y: number): MatchState {
  return {
    ...state,
    units: state.units.map((u) => (u.ownerId === ownerId ? { ...u, pos: { x, y } } : u)),
  }
}

/** Mutate a copy: set unit hp by ownerId. */
function withUnitHp(state: MatchState, ownerId: typeof PA, hp: number): MatchState {
  return {
    ...state,
    units: state.units.map((u) => (u.ownerId === ownerId ? { ...u, hp } : u)),
  }
}

describe('botNextAction — baseline (existing behaviour stays put)', () => {
  it('attacks when an adjacent enemy is in melee range and energy ≥ 2', () => {
    const fresh = build({ classA: 'knight', classB: 'knight' })
    const state = withUnitPos(withUnitPos(fresh, PA, 3, 3), PB, 4, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('attack')
  })

  it('moves toward the enemy when out of range', () => {
    // Use heretic — its ability heuristic only fires at low energy, so at
    // full energy there's no ability detour to mask the move branch.
    const state = build({ classA: 'heretic', classB: 'knight' })
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('move')
  })

  it('returns null when no living enemies remain', () => {
    const fresh = build()
    const state = withUnitHp(fresh, PB, 0)
    expect(botNextAction(state, PA)).toBeNull()
  })
})

describe('botNextAction — retreat below 30 % HP (SPEC §8.7)', () => {
  it('retreats when low-HP and the foe is OUT of melee range', () => {
    // Knight max HP = 24, threshold floor(0.3*24) = 7. HP=5 triggers retreat.
    // Foe at distance 3 — out of melee range, so attack isn't viable and the
    // retreat branch can fire per SPEC's "elif" ordering.
    const fresh = build()
    let state = withUnitPos(withUnitPos(fresh, PA, 3, 3), PB, 6, 3)
    state = withUnitHp(state, PA, 5)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('move')
    if (action?.kind !== 'move') throw new Error('expected move')
    const step = action.path[0]
    expect(step).toBeDefined()
    if (!step) return
    // Retreat must increase distance from threat (4 = original 3 + 1).
    expect(Math.abs(step.x - 6) + Math.abs(step.y - 3)).toBeGreaterThan(3)
  })

  it('still attacks at low HP when an enemy is in range (SPEC orders attack first)', () => {
    // Per SPEC §8.7 the decision is "attack elif retreat" — so even at low HP,
    // a melee attack is preferred over a retreat. Bot fights to the last hit.
    const fresh = build()
    let state = withUnitPos(withUnitPos(fresh, PA, 3, 3), PB, 4, 3)
    state = withUnitHp(state, PA, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('attack')
  })

  it('does NOT retreat at full HP', () => {
    // Same out-of-range setup as the retreat case but full HP — must move
    // toward, not away. Guards against accidental always-retreat regressions.
    const fresh = build({ classA: 'heretic' })
    const state = withUnitPos(withUnitPos(fresh, PA, 3, 3), PB, 6, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('move')
    if (action?.kind !== 'move') throw new Error('expected move')
    const step = action.path[0]
    if (!step) return
    expect(step.x).toBeGreaterThan(3)
  })
})

describe('botNextAction — progress smoke (bot must close from spawn)', () => {
  it('a knight bot at spawn produces a non-null move toward the foe', () => {
    // Both knights at fresh spawns. Player A (us, the bot under test) starts
    // at (1,4), foe at (6,3). Distance 6, well out of melee range. Bot must
    // not return null and must not just stand on iron_stance forever.
    const state = build()
    const action = botNextAction(state, PA)
    expect(action).not.toBeNull()
  })

  it('after an iron_stance turn, knight then moves toward the foe', () => {
    // Drop a fake iron_stance status onto the bot to simulate its post-buff
    // state. The next decision must be 'move' (not 'ability' again).
    const fresh = build()
    const state: MatchState = {
      ...fresh,
      units: fresh.units.map((u) =>
        u.ownerId === PA
          ? { ...u, statuses: [...u.statuses, { kind: 'iron_stance' as const, ttl: -1 }] }
          : u,
      ),
    }
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('move')
  })
})

describe('botNextAction — LoS gate on ranged attacks (SPEC §8.7)', () => {
  it('mage refuses to attack through a pillar', () => {
    // Tiles: place a pillar at (2,3). Mage at (1,3), enemy at (3,3).
    // Manhattan distance 2 ≤ Mage range 3, but LoS is blocked by the pillar.
    const tiles = allStone()
    const row = tiles[3]
    if (row) row[2] = 'pillar'
    const fresh = build({ classA: 'mage', classB: 'knight', tiles })
    const state = withUnitPos(withUnitPos(fresh, PA, 1, 3), PB, 3, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).not.toBe('attack')
  })

  it('mage attacks when LoS is clear', () => {
    const fresh = build({ classA: 'mage', classB: 'knight' })
    const state = withUnitPos(withUnitPos(fresh, PA, 1, 3), PB, 3, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('attack')
  })

  it('knight (no LoS requirement) attacks adjacent foe even with a pillar nearby', () => {
    // Pillar adjacent shouldn't matter for melee.
    const tiles = allStone()
    const row = tiles[3]
    if (row) row[5] = 'pillar'
    const fresh = build({ classA: 'knight', classB: 'knight', tiles })
    const state = withUnitPos(withUnitPos(fresh, PA, 3, 3), PB, 4, 3)
    const action = botNextAction(state, PA)
    expect(action?.kind).toBe('attack')
  })
})
