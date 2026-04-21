// tests/unit/pickups.test.ts
// M7 pickup validation + application behavior.

import { describe, expect, it } from 'vitest'
import { createMatch } from '../../src/server/GameEngine.js'
import { applyUsePickup, validateUsePickup } from '../../src/server/pickups.js'
import {
  ENERGY_CRYSTAL_GAIN,
  HEALTH_FLASK_HEAL,
  USE_PICKUP_COST,
} from '../../src/shared/constants.js'
import {
  matchId,
  playerId,
  unitId,
  type GameAction,
  type MatchState,
  type Pickup,
  type Position,
} from '../../src/shared/types.js'

const PA = playerId('player-a')
const PB = playerId('player-b')
const MID = matchId('match-1')

function base(overrides: { pickups?: Pickup[] } = {}): MatchState {
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    firstTurn: 'A',
    now: () => 0,
    ...(overrides.pickups ? { pickups: overrides.pickups } : {}),
  })
}

function place(state: MatchState, a: Position, b: Position): MatchState {
  return {
    ...state,
    units: state.units.map((u) => (u.ownerId === PA ? { ...u, pos: a } : { ...u, pos: b })),
  }
}

function pickup(kind: Pickup['kind'], pos: Position, id = `p_${kind}`): Pickup {
  return { id, pos, kind }
}

describe('validateUsePickup', () => {
  it('rejects when the unit is not standing on a pickup', () => {
    const state = base({ pickups: [pickup('health_flask', { x: 5, y: 5 })] })
    const r = validateUsePickup(state, PA, {
      kind: 'usePickup',
      unitId: unitId('u_match-1_a'),
    })
    expect(r).toEqual({ ok: false, code: 'bad_message' })
  })

  it('accepts when standing on a pickup, costs 1 energy', () => {
    let state = base({ pickups: [pickup('health_flask', { x: 1, y: 4 })] })
    state = place(state, { x: 1, y: 4 }, { x: 6, y: 3 })
    const r = validateUsePickup(state, PA, {
      kind: 'usePickup',
      unitId: unitId('u_match-1_a'),
    })
    expect(r).toEqual({ ok: true, cost: USE_PICKUP_COST })
  })
})

describe('applyUsePickup', () => {
  const pickupAction: Extract<GameAction, { kind: 'usePickup' }> = {
    kind: 'usePickup',
    unitId: unitId('u_match-1_a'),
  }

  it('health_flask heals up to maxHp and consumes the pickup', () => {
    let state = base({ pickups: [pickup('health_flask', { x: 1, y: 4 })] })
    state = place(state, { x: 1, y: 4 }, { x: 6, y: 3 })
    state = { ...state, units: state.units.map((u) => (u.ownerId === PA ? { ...u, hp: 10 } : u)) }
    const res = applyUsePickup(state, pickupAction, USE_PICKUP_COST)
    const me = res.state.units.find((u) => u.ownerId === PA)
    expect(me?.hp).toBe(10 + HEALTH_FLASK_HEAL)
    expect(res.state.pickups).toHaveLength(0)
    expect(res.state.energy[PA]).toBe(5 - USE_PICKUP_COST)
  })

  it('energy_crystal grants +2 energy this turn', () => {
    let state = base({ pickups: [pickup('energy_crystal', { x: 1, y: 4 })] })
    state = place(state, { x: 1, y: 4 }, { x: 6, y: 3 })
    const res = applyUsePickup(state, pickupAction, USE_PICKUP_COST)
    expect(res.state.energy[PA]).toBe(5 - USE_PICKUP_COST + ENERGY_CRYSTAL_GAIN)
  })

  it('scroll_of_sight registers a full-map reveal', () => {
    let state = base({ pickups: [pickup('scroll_of_sight', { x: 1, y: 4 })] })
    state = place(state, { x: 1, y: 4 }, { x: 6, y: 3 })
    const res = applyUsePickup(state, pickupAction, USE_PICKUP_COST)
    expect(res.state.scoutReveals).toHaveLength(1)
    expect(res.state.scoutReveals[0]?.tiles.length).toBe(64)
    expect(res.state.scoutReveals[0]?.ownerId).toBe(PA)
  })

  it('chest rolls a sub-item deterministically with injected rng', () => {
    let state = base({ pickups: [pickup('chest', { x: 1, y: 4 })] })
    state = place(state, { x: 1, y: 4 }, { x: 2, y: 4 })
    // rng() < 0.34 → index 0 → smoke_bomb
    const smoke = applyUsePickup(state, pickupAction, USE_PICKUP_COST, () => 0.1)
    expect(smoke.chestItem).toBe('smoke_bomb')
    expect(smoke.state.ashClouds).toHaveLength(1)
    // rng() ~ 0.5 → index 1 → flash → stuns adjacent foe
    const flash = applyUsePickup(state, pickupAction, USE_PICKUP_COST, () => 0.5)
    expect(flash.chestItem).toBe('flash')
    const foe = flash.state.units.find((u) => u.ownerId === PB)
    expect(foe?.statuses.some((s) => s.kind === 'stunned')).toBe(true)
    // rng() ~ 0.9 → index 2 → whetstone
    const whet = applyUsePickup(state, pickupAction, USE_PICKUP_COST, () => 0.9)
    expect(whet.chestItem).toBe('whetstone')
    const me = whet.state.units.find((u) => u.ownerId === PA)
    expect(me?.statuses.some((s) => s.kind === 'whetstone')).toBe(true)
  })
})
