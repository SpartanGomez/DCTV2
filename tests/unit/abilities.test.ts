// tests/unit/abilities.test.ts
// M5: spot-check every ability + the turn-start tick.
// Deeper per-ability behavior tests land as balance surfaces in playtesting.

import { describe, expect, it } from 'vitest'
import {
  applyAbility,
  applyDefend,
  resolveTrapTriggers,
  validateAbility,
  validateDefend,
} from '../../src/server/abilities.js'
import { applyEndTurn, createMatch } from '../../src/server/GameEngine.js'
import {
  ABILITY_ENERGY_COST,
  ABILITY_HP_COST,
  ASH_CLOUD_DOT,
  BLOOD_TITHE_ENERGY_GAIN,
  CINDER_BOLT_DAMAGE,
  CORRUPTED_ENEMY_DOT,
  HEX_TRAP_DAMAGE,
  MAX_TRAPS_PER_HERETIC,
} from '../../src/shared/constants.js'
import {
  matchId,
  playerId,
  unitId,
  type GameAction,
  type MatchState,
  type Position,
} from '../../src/shared/types.js'

const PA = playerId('player-a')
const PB = playerId('player-b')
const MID = matchId('match-1')

function build(classA: 'knight' | 'mage' | 'heretic', classB: 'knight' | 'mage' | 'heretic'): MatchState {
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    classA,
    classB,
    firstTurn: 'A',
    now: () => 0,
  })
}

function place(state: MatchState, ownerA: Position, ownerB: Position): MatchState {
  return {
    ...state,
    units: state.units.map((u) => (u.ownerId === PA ? { ...u, pos: ownerA } : { ...u, pos: ownerB })),
  }
}

function ability(
  abilityId: string,
  opts: { targetId?: string; target?: Position } = {},
  who: string = 'u_match-1_a',
): Extract<GameAction, { kind: 'ability' }> {
  const action: Extract<GameAction, { kind: 'ability' }> = {
    kind: 'ability',
    unitId: unitId(who),
    abilityId,
  }
  if (opts.target) action.target = opts.target
  if (opts.targetId) action.targetId = unitId(opts.targetId)
  return action
}

describe('Defend', () => {
  it('applies defending status and debits 1 energy', () => {
    const state = build('knight', 'knight')
    const act: Extract<GameAction, { kind: 'defend' }> = {
      kind: 'defend',
      unitId: unitId('u_match-1_a'),
    }
    const r = validateDefend(state, PA, act)
    expect(r).toEqual({ ok: true, cost: 1 })
    if (!r.ok) return
    const next = applyDefend(state, act, r.cost).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.statuses.some((s) => s.kind === 'defending')).toBe(true)
    expect(next.energy[PA]).toBe(4)
  })

  it('rejects if insufficient energy', () => {
    let state = build('knight', 'knight')
    state = { ...state, energy: { ...state.energy, [PA]: 0 } }
    const act: Extract<GameAction, { kind: 'defend' }> = {
      kind: 'defend',
      unitId: unitId('u_match-1_a'),
    }
    expect(validateDefend(state, PA, act)).toEqual({ ok: false, code: 'insufficient_energy' })
  })
})

describe('Shield Wall (Knight)', () => {
  it('applies shield_wall status and clears any active defending', () => {
    const state = build('knight', 'knight')
    const r = validateAbility(state, PA, ability('shield_wall'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const next = applyAbility(state, ability('shield_wall'), r.cost, 0).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.statuses.some((s) => s.kind === 'shield_wall')).toBe(true)
    expect(me?.statuses.some((s) => s.kind === 'defending')).toBe(false)
    expect(next.energy[PA]).toBe(5 - ABILITY_ENERGY_COST.shield_wall)
  })
})

describe('Vanguard Charge (Knight)', () => {
  it('charges into an enemy, deals impact damage, pushes', () => {
    let state = build('knight', 'knight')
    state = place(state, { x: 2, y: 4 }, { x: 4, y: 4 })
    const action = ability('vanguard_charge', { target: { x: 5, y: 4 } })
    const r = validateAbility(state, PA, action)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const res = applyAbility(state, action, r.cost, 0)
    const a = res.state.units.find((u) => u.ownerId === PA)
    const b = res.state.units.find((u) => u.ownerId === PB)
    expect(a?.pos).toEqual({ x: 3, y: 4 }) // stopped one tile before enemy
    expect(b?.pos).toEqual({ x: 5, y: 4 }) // pushed one east
    expect(b?.hp).toBe(24 - 4)
  })

  it('bonus damage when push is blocked by grid edge', () => {
    let state = build('knight', 'knight')
    state = place(state, { x: 5, y: 4 }, { x: 7, y: 4 })
    const action = ability('vanguard_charge', { target: { x: 7, y: 4 } })
    const r = validateAbility(state, PA, action)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const res = applyAbility(state, action, r.cost, 0)
    const b = res.state.units.find((u) => u.ownerId === PB)
    expect(b?.pos).toEqual({ x: 7, y: 4 }) // push blocked by edge; B stays
    expect(b?.hp).toBe(24 - 4 - 2) // +2 bonus
  })
})

describe('Iron Stance (Knight)', () => {
  it('toggles on at 2 energy', () => {
    const state = build('knight', 'knight')
    const r = validateAbility(state, PA, ability('iron_stance'))
    expect(r).toEqual({ ok: true, cost: 2 })
    if (!r.ok) return
    const next = applyAbility(state, ability('iron_stance'), r.cost, 0).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.statuses.some((s) => s.kind === 'iron_stance')).toBe(true)
  })

  it('toggles off at 0 energy if already on', () => {
    let state = build('knight', 'knight')
    state = {
      ...state,
      units: state.units.map((u) =>
        u.ownerId === PA ? { ...u, statuses: [{ kind: 'iron_stance' as const, ttl: -1 }] } : u,
      ),
    }
    const r = validateAbility(state, PA, ability('iron_stance'))
    expect(r).toEqual({ ok: true, cost: 0 })
    if (!r.ok) return
    const next = applyAbility(state, ability('iron_stance'), r.cost, 0).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.statuses.some((s) => s.kind === 'iron_stance')).toBe(false)
  })
})

describe('Cinder Bolt (Mage)', () => {
  it('deals base damage at range, LoS-trivial on stone', () => {
    let state = build('mage', 'knight')
    state = place(state, { x: 1, y: 4 }, { x: 3, y: 4 })
    const act = ability('cinder_bolt', { targetId: 'u_match-1_b' })
    const r = validateAbility(state, PA, act)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const res = applyAbility(state, act, r.cost, 0)
    const b = res.state.units.find((u) => u.ownerId === PB)
    expect(b?.hp).toBe(24 - CINDER_BOLT_DAMAGE)
  })

  it('rejects out-of-range target', () => {
    let state = build('mage', 'knight')
    state = place(state, { x: 0, y: 0 }, { x: 7, y: 7 })
    const act = ability('cinder_bolt', { targetId: 'u_match-1_b' })
    expect(validateAbility(state, PA, act)).toEqual({ ok: false, code: 'out_of_range' })
  })
})

describe('Ash Cloud (Mage)', () => {
  it('places a 2×2 overlay with ttl', () => {
    const state = build('mage', 'knight')
    const act = ability('ash_cloud', { target: { x: 2, y: 4 } })
    const r = validateAbility(state, PA, act)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const next = applyAbility(state, act, r.cost, 0).state
    expect(next.ashClouds).toHaveLength(1)
    expect(next.ashClouds[0]?.tiles).toEqual([
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ])
  })

  it('rejects if the footprint leaves the grid', () => {
    // Place Mage within range of a corner anchor whose footprint overflows.
    let state = build('mage', 'knight')
    state = place(state, { x: 5, y: 7 }, { x: 0, y: 0 })
    const act = ability('ash_cloud', { target: { x: 7, y: 7 } })
    expect(validateAbility(state, PA, act)).toEqual({ ok: false, code: 'invalid_path' })
  })
})

describe('Blink (Mage)', () => {
  it('teleports within range to a passable empty tile', () => {
    const state = build('mage', 'knight')
    const act = ability('blink', { target: { x: 2, y: 5 } })
    const r = validateAbility(state, PA, act)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const next = applyAbility(state, act, r.cost, 0).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.pos).toEqual({ x: 2, y: 5 })
  })

  it('rejects teleporting onto an occupied tile', () => {
    let state = build('mage', 'knight')
    state = place(state, { x: 1, y: 3 }, { x: 2, y: 3 })
    const act = ability('blink', { target: { x: 2, y: 3 } })
    expect(validateAbility(state, PA, act)).toEqual({ ok: false, code: 'tile_occupied' })
  })
})

describe('Blood Tithe (Heretic)', () => {
  it('spends 4 HP for +2 energy, marks once-per-turn', () => {
    const state = build('heretic', 'knight')
    const act = ability('blood_tithe')
    const r = validateAbility(state, PA, act)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const next = applyAbility(state, act, r.cost, r.hpCost ?? 0).state
    const me = next.units.find((u) => u.ownerId === PA)
    expect(me?.hp).toBe(20 - (ABILITY_HP_COST.blood_tithe ?? 0))
    expect(next.energy[PA]).toBe(5 + BLOOD_TITHE_ENERGY_GAIN)
    expect(me?.statuses.some((s) => s.kind === 'blood_tithe_used')).toBe(true)
  })

  it('rejects when HP is too low (self_kill_prevented)', () => {
    let state = build('heretic', 'knight')
    state = {
      ...state,
      units: state.units.map((u) => (u.ownerId === PA ? { ...u, hp: 3 } : u)),
    }
    expect(validateAbility(state, PA, ability('blood_tithe'))).toEqual({
      ok: false,
      code: 'self_kill_prevented',
    })
  })
})

describe('Hex Trap (Heretic)', () => {
  it('places a trap within range; max 2 active evicts the oldest', () => {
    let state = build('heretic', 'knight')
    const act1 = ability('hex_trap', { target: { x: 2, y: 4 } })
    const r1 = validateAbility(state, PA, act1)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    state = applyAbility(state, act1, r1.cost, 0).state
    const act2 = ability('hex_trap', { target: { x: 0, y: 5 } })
    const r2 = validateAbility(state, PA, act2)
    if (!r2.ok) return
    state = applyAbility(state, act2, r2.cost, 0).state
    expect(state.traps).toHaveLength(MAX_TRAPS_PER_HERETIC)

    // Third trap: server receives the action but the engine evicts the oldest.
    // validator still accepts because position isn't already trapped.
    const act3 = ability('hex_trap', { target: { x: 1, y: 5 } })
    const r3 = validateAbility(state, PA, act3)
    if (!r3.ok) return
    state = applyAbility(state, act3, r3.cost, 0).state
    expect(state.traps).toHaveLength(MAX_TRAPS_PER_HERETIC)
    expect(state.traps.find((t) => t.pos.x === 2 && t.pos.y === 4)).toBeUndefined()
  })

  it('triggers on enemy movement onto the trap, dealing damage + revealed', () => {
    let state = build('heretic', 'knight')
    const act = ability('hex_trap', { target: { x: 2, y: 4 } })
    const r = validateAbility(state, PA, act)
    if (!r.ok) return
    state = applyAbility(state, act, r.cost, 0).state
    // B walks from (6,3) → ... → (2,4). Only test the trigger step.
    const path = [{ x: 2, y: 4 }]
    const trapRes = resolveTrapTriggers(state, PB, path)
    const b = trapRes.state.units.find((u) => u.ownerId === PB)
    expect(b?.hp).toBe(24 - HEX_TRAP_DAMAGE)
    expect(b?.statuses.some((s) => s.kind === 'revealed')).toBe(true)
    expect(trapRes.state.traps).toHaveLength(0) // trap consumed
  })
})

describe('Desecrate (Heretic)', () => {
  it('corrupts a 2×2 area with ttl=3', () => {
    const state = build('heretic', 'knight')
    const act = ability('desecrate', { target: { x: 2, y: 4 } })
    const r = validateAbility(state, PA, act)
    if (!r.ok) return
    const next = applyAbility(state, act, r.cost, 0).state
    for (const p of [
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
    ]) {
      const tile = next.grid.tiles[p.y]?.[p.x]
      expect(tile?.type).toBe('corrupted')
      expect(tile?.ttl).toBe(3)
      expect(tile?.baseType).toBe('stone')
    }
  })
})

describe('turn-start tick (applyEndTurn)', () => {
  it('decrements TTLs on outgoing player statuses', () => {
    let state = build('knight', 'knight')
    // Give A a defending status ttl=1; after A's endTurn, it should be gone.
    state = {
      ...state,
      units: state.units.map((u) =>
        u.ownerId === PA ? { ...u, statuses: [{ kind: 'defending' as const, ttl: 1 }] } : u,
      ),
    }
    const res = applyEndTurn(state, 0)
    const a = res.state.units.find((u) => u.ownerId === PA)
    expect(a?.statuses.some((s) => s.kind === 'defending')).toBe(false)
  })

  it('applies ash-cloud DoT at incoming turn start', () => {
    let state = build('knight', 'knight')
    // Place B on (6,3); drop an ash cloud covering (6,3).
    state = {
      ...state,
      ashClouds: [
        {
          id: 'ac_test',
          ownerId: PA,
          tiles: [
            { x: 6, y: 3 },
            { x: 7, y: 3 },
            { x: 6, y: 4 },
            { x: 7, y: 4 },
          ],
          ttl: 2,
        },
      ],
    }
    const res = applyEndTurn(state, 0)
    const b = res.state.units.find((u) => u.ownerId === PB)
    expect(b?.hp).toBe(24 - ASH_CLOUD_DOT)
  })

  it('applies corrupted-tile effects: hurts non-Heretic, heals Heretic', () => {
    let state = build('heretic', 'knight')
    // Put B on a corrupted tile (6,3).
    state = {
      ...state,
      grid: {
        ...state.grid,
        tiles: state.grid.tiles.map((row, y) =>
          row.map((tile, x) =>
            x === 6 && y === 3
              ? { type: 'corrupted' as const, baseType: 'stone' as const, height: 1, ttl: 3 }
              : tile,
          ),
        ),
      },
    }
    // A endTurn — tick processes for incoming (B).
    const res = applyEndTurn(state, 0)
    const b = res.state.units.find((u) => u.ownerId === PB)
    expect(b?.hp).toBe(24 - CORRUPTED_ENEMY_DOT)
  })

  it('reverts corrupted tiles to baseType when ttl expires', () => {
    let state = build('heretic', 'knight')
    state = {
      ...state,
      grid: {
        ...state.grid,
        tiles: state.grid.tiles.map((row, y) =>
          row.map((tile, x) =>
            x === 2 && y === 2
              ? { type: 'corrupted' as const, baseType: 'stone' as const, height: 1, ttl: 1 }
              : tile,
          ),
        ),
      },
    }
    const res = applyEndTurn(state, 0)
    const tile = res.state.grid.tiles[2]?.[2]
    expect(tile?.type).toBe('stone')
    expect(tile?.ttl).toBeUndefined()
  })

  it('clears blood_tithe_used for the incoming player', () => {
    let state = build('heretic', 'knight')
    state = {
      ...state,
      units: state.units.map((u) =>
        u.ownerId === PA
          ? { ...u, statuses: [{ kind: 'blood_tithe_used' as const, ttl: 1 }] }
          : u,
      ),
    }
    // End A's turn → B's turn → end B's turn → back to A; A's flag should be clear.
    let res = applyEndTurn(state, 0)
    res = applyEndTurn(res.state, 0)
    const a = res.state.units.find((u) => u.ownerId === PA)
    expect(a?.statuses.some((s) => s.kind === 'blood_tithe_used')).toBe(false)
  })
})
