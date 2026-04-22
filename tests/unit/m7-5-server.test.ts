// tests/unit/m7-5-server.test.ts
// SPEC v2 §6.3 / §6.6 — server enforcement of jump-gated movement, ranged
// 3D LoS, and facing updates on move/attack/ability.

import { describe, expect, it } from 'vitest'
import {
  applyAttack,
  applyMove,
  createMatch,
  SPAWN_A,
  SPAWN_B,
} from '../../src/server/GameEngine.js'
import { applyAbility } from '../../src/server/abilities.js'
import { validateAttack, validateMove } from '../../src/server/validators.js'
import {
  ABILITY_ENERGY_COST,
  CINDER_BOLT_RANGE,
} from '../../src/shared/constants.js'
import {
  matchId,
  playerId,
  unitId,
  type ArenaDef,
  type GameAction,
  type MatchState,
  type TerrainType,
  type UnitId,
} from '../../src/shared/types.js'

const PA = playerId('p-a')
const PB = playerId('p-b')
const MID = matchId('m-1')

/** All-stone tiles. */
function allStone(): TerrainType[][] {
  const rows: TerrainType[][] = []
  for (let y = 0; y < 8; y++) {
    const r: TerrainType[] = []
    for (let x = 0; x < 8; x++) r.push('stone')
    rows.push(r)
  }
  return rows
}

/** Build a fresh match with a custom heights table and class picks. */
function buildMatch(opts: {
  classA?: 'knight' | 'mage' | 'heretic'
  classB?: 'knight' | 'mage' | 'heretic'
  heights?: number[][]
  tiles?: TerrainType[][]
}): MatchState {
  const arena: ArenaDef = {
    slug: 'test',
    name: 'Test Arena',
    tiles: opts.tiles ?? allStone(),
    spawns: [SPAWN_A, SPAWN_B],
    pickupSlots: [],
    ...(opts.heights ? { heights: opts.heights } : {}),
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
    pickups: [],
  })
}

const A_ID = unitId('u_m-1_a')
const B_ID = unitId('u_m-1_b')

describe('movement: height-jump gate (SPEC v2 §6.3)', () => {
  it('Knight (jump 2) can step from height 1 onto height 3 (Δ2)', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    // Knight stands at SPAWN_A (1,4). Make (2,4) be height 3.
    const row = heights[4]
    if (!row) throw new Error('row')
    row[2] = 3
    const state = buildMatch({ classA: 'knight', heights })
    const r = validateMove(state, PA, {
      kind: 'move',
      unitId: A_ID,
      path: [{ x: 2, y: 4 }],
    })
    expect(r.ok).toBe(true)
  })

  it('Knight (jump 2) cannot step from height 1 onto height 4 (Δ3)', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    const row = heights[4]
    if (!row) throw new Error('row')
    row[2] = 4
    const state = buildMatch({ classA: 'knight', heights })
    const r = validateMove(state, PA, {
      kind: 'move',
      unitId: A_ID,
      path: [{ x: 2, y: 4 }],
    })
    expect(r).toEqual({ ok: false, code: 'height_exceeds_jump' })
  })

  it('Mage (jump 3) CAN step from height 1 onto height 4 (Δ3)', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    const row = heights[4]
    if (!row) throw new Error('row')
    row[2] = 4
    const state = buildMatch({ classA: 'mage', heights })
    const r = validateMove(state, PA, {
      kind: 'move',
      unitId: A_ID,
      path: [{ x: 2, y: 4 }],
    })
    expect(r.ok).toBe(true)
  })

  it('falling is symmetric: Knight cannot step down |Δh|=3 either', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    // Make Knight stand on a height-4 stack and try to step down to 1.
    const row = heights[4]
    if (!row) throw new Error('row')
    row[1] = 4 // Knight's spawn tile
    const state = buildMatch({ classA: 'knight', heights })
    const r = validateMove(state, PA, {
      kind: 'move',
      unitId: A_ID,
      path: [{ x: 2, y: 4 }],
    })
    expect(r).toEqual({ ok: false, code: 'height_exceeds_jump' })
  })
})

describe('movement: facing update (SPEC v2 §6.6)', () => {
  it('updates unit facing toward the final step direction', () => {
    const state = buildMatch({})
    // Knight at (1,4) — initial facing E (toward enemy at (6,3)).
    const u0 = state.units.find((u) => u.id === A_ID)
    expect(u0?.facing).toBe('E')
    // Move (1,4) -> (1,5) -> (1,6) — final step is south.
    const path = [{ x: 1, y: 5 }, { x: 1, y: 6 }]
    const r = validateMove(state, PA, { kind: 'move', unitId: A_ID, path })
    if (!r.ok) throw new Error('expected ok')
    const next = applyMove(state, { kind: 'move', unitId: A_ID, path }, r.cost)
    const u1 = next.units.find((u) => u.id === A_ID)
    expect(u1?.pos).toEqual({ x: 1, y: 6 })
    expect(u1?.facing).toBe('S')
  })

  it('one-step move: facing computed from pos -> step', () => {
    const state = buildMatch({})
    const path = [{ x: 0, y: 4 }] // step west
    const r = validateMove(state, PA, { kind: 'move', unitId: A_ID, path })
    if (!r.ok) throw new Error('expected ok')
    const next = applyMove(state, { kind: 'move', unitId: A_ID, path }, r.cost)
    expect(next.units.find((u) => u.id === A_ID)?.facing).toBe('W')
  })
})

describe('attack: facing update (SPEC v2 §6.6)', () => {
  it('attacker pivots to face the target on a successful attack', () => {
    // Place Knight A at (3,3) and Knight B at (4,3) — adjacent. A attacks B.
    let state = buildMatch({})
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === A_ID ? { ...u, pos: { x: 3, y: 3 }, facing: 'N' as const } : u,
      ),
    }
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u,
      ),
    }
    const action: Extract<GameAction, { kind: 'attack' }> = {
      kind: 'attack',
      unitId: A_ID,
      targetId: B_ID,
    }
    const v = validateAttack(state, PA, action)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const result = applyAttack(state, action, v.cost)
    const a = result.state.units.find((u) => u.id === A_ID)
    expect(a?.facing).toBe('E')
  })
})

describe('attack: melee height ceiling (SPEC v2 §5.5 + §6.3)', () => {
  it('Knight cannot melee a target |Δh| > 1 tiles below', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    // Knight on a height-4 stack, target on height 1 adjacent.
    const row3 = heights[3]
    if (!row3) throw new Error('row')
    row3[3] = 4
    let state = buildMatch({ heights })
    state = {
      ...state,
      units: state.units.map((u) => (u.id === A_ID ? { ...u, pos: { x: 3, y: 3 } } : u)),
    }
    state = {
      ...state,
      units: state.units.map((u) => (u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u)),
    }
    const r = validateAttack(state, PA, { kind: 'attack', unitId: A_ID, targetId: B_ID })
    expect(r).toEqual({ ok: false, code: 'out_of_range' })
  })

  it('Knight CAN melee a target exactly |Δh| == 1 below', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    const row3 = heights[3]
    if (!row3) throw new Error('row')
    row3[3] = 2 // Knight at height 2, target at height 1.
    let state = buildMatch({ heights })
    state = {
      ...state,
      units: state.units.map((u) => (u.id === A_ID ? { ...u, pos: { x: 3, y: 3 } } : u)),
    }
    state = {
      ...state,
      units: state.units.map((u) => (u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u)),
    }
    const r = validateAttack(state, PA, { kind: 'attack', unitId: A_ID, targetId: B_ID })
    expect(r.ok).toBe(true)
  })
})

describe('attack: ranged 3D LoS (SPEC v2 §5.5 + §6.3)', () => {
  it('Mage shot is blocked by a tall stack between attacker and target', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    // Place a height-5 column at (3,3) between Mage at (1,3) and target at (4,3).
    const row3 = heights[3]
    if (!row3) throw new Error('row')
    row3[3] = 5
    let state = buildMatch({ classA: 'mage', heights })
    state = {
      ...state,
      units: state.units.map((u) => (u.id === A_ID ? { ...u, pos: { x: 1, y: 3 } } : u)),
    }
    state = {
      ...state,
      units: state.units.map((u) => (u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u)),
    }
    // Range 3 from (1,3) to (4,3) is exactly 3, so range is fine.
    expect(CINDER_BOLT_RANGE).toBe(3)
    const r = validateAttack(state, PA, { kind: 'attack', unitId: A_ID, targetId: B_ID })
    expect(r).toEqual({ ok: false, code: 'no_line_of_sight' })
  })

  it('Mage shot clears when attacker stands on a stack tall enough to shoot over', () => {
    const heights: number[][] = []
    for (let y = 0; y < 8; y++) heights.push(Array.from({ length: 8 }, () => 1))
    const row3 = heights[3]
    if (!row3) throw new Error('row')
    row3[1] = 5 // Mage on a 5-stack
    row3[3] = 2 // Mid-line stack of 2
    row3[4] = 5 // Target on a 5-stack
    let state = buildMatch({ classA: 'mage', heights })
    state = {
      ...state,
      units: state.units.map((u) => (u.id === A_ID ? { ...u, pos: { x: 1, y: 3 } } : u)),
    }
    state = {
      ...state,
      units: state.units.map((u) => (u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u)),
    }
    const r = validateAttack(state, PA, { kind: 'attack', unitId: A_ID, targetId: B_ID })
    expect(r.ok).toBe(true)
  })

  it('Heretic (point-blank, requiresLoS=false) ignores LoS even with a wall in the way', () => {
    const tiles = allStone()
    // Place a wall between Heretic and target.
    const row3 = tiles[3]
    if (!row3) throw new Error('row')
    row3[3] = 'wall'
    let state = buildMatch({ classA: 'heretic', tiles })
    state = {
      ...state,
      units: state.units.map((u) => (u.id === A_ID ? { ...u, pos: { x: 2, y: 3 } } : u)),
    }
    state = {
      ...state,
      units: state.units.map((u) => (u.id === B_ID ? { ...u, pos: { x: 4, y: 3 } } : u)),
    }
    const r = validateAttack(state, PA, { kind: 'attack', unitId: A_ID, targetId: B_ID })
    // Heretic range is 2; (2,3) -> (4,3) is distance 2; LoS is ignored at point-blank.
    expect(r.ok).toBe(true)
  })
})

describe('ability: facing update on cast (SPEC v2 §6.6)', () => {
  it('Mage Cinder Bolt pivots Mage to face target', () => {
    let state = buildMatch({ classA: 'mage' })
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === A_ID ? { ...u, pos: { x: 4, y: 4 }, facing: 'N' as const } : u,
      ),
    }
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === B_ID ? { ...u, pos: { x: 4, y: 6 } } : u,
      ),
    }
    const cost = ABILITY_ENERGY_COST.cinder_bolt
    const result = applyAbility(
      state,
      { kind: 'ability', unitId: A_ID, abilityId: 'cinder_bolt', targetId: B_ID as UnitId },
      cost,
      0,
    )
    const a = result.state.units.find((u) => u.id === A_ID)
    expect(a?.facing).toBe('S')
  })

  it('Heretic Hex Trap pivots Heretic to face the trap tile', () => {
    let state = buildMatch({ classA: 'heretic' })
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === A_ID ? { ...u, pos: { x: 4, y: 4 }, facing: 'N' as const } : u,
      ),
    }
    const cost = ABILITY_ENERGY_COST.hex_trap
    const result = applyAbility(
      state,
      { kind: 'ability', unitId: A_ID, abilityId: 'hex_trap', target: { x: 6, y: 4 } },
      cost,
      0,
    )
    const a = result.state.units.find((u) => u.id === A_ID)
    expect(a?.facing).toBe('E')
  })

  it('Knight Iron Stance (self-cast, no target) leaves facing unchanged', () => {
    let state = buildMatch({ classA: 'knight' })
    state = {
      ...state,
      units: state.units.map((u) =>
        u.id === A_ID ? { ...u, facing: 'N' as const } : u,
      ),
    }
    const cost = ABILITY_ENERGY_COST.iron_stance
    const result = applyAbility(
      state,
      { kind: 'ability', unitId: A_ID, abilityId: 'iron_stance' },
      cost,
      0,
    )
    expect(result.state.units.find((u) => u.id === A_ID)?.facing).toBe('N')
  })
})
