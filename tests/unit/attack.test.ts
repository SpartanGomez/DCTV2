// tests/unit/attack.test.ts
// M3: validateAttack, applyAttack, resolveMatchEnd coverage.

import { describe, expect, it } from 'vitest'
import {
  applyAttack,
  applyMove,
  createMatch,
  resolveMatchEnd,
} from '../../src/server/GameEngine.js'
import { validateAttack } from '../../src/server/validators.js'
import { ATTACK_COST, CLASS_STATS } from '../../src/shared/constants.js'
import {
  matchId,
  playerId,
  unitId,
  type GameAction,
  type MatchState,
} from '../../src/shared/types.js'

const PA = playerId('player-a')
const PB = playerId('player-b')
const MID = matchId('match-1')

function fresh(overrides?: { classA?: 'knight' | 'mage' | 'heretic' }): MatchState {
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    firstTurn: 'A',
    now: () => 0,
    ...(overrides?.classA ? { classA: overrides.classA } : {}),
  })
}

function attackAction(targetId: string): Extract<GameAction, { kind: 'attack' }> {
  return {
    kind: 'attack',
    unitId: unitId('u_match-1_a'),
    targetId: unitId(targetId),
  }
}

function placeAdjacent(state: MatchState): MatchState {
  // Move A next to B for melee tests. B stays at (6,3), put A at (5,3).
  const a = state.units.find((u) => u.ownerId === PA)
  if (!a) throw new Error('unit A missing')
  return {
    ...state,
    units: state.units.map((u) => (u.id === a.id ? { ...u, pos: { x: 5, y: 3 } } : u)),
  }
}

describe('validateAttack', () => {
  it('rejects if not in range', () => {
    const state = fresh()
    const r = validateAttack(state, PA, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'out_of_range' })
  })

  it('rejects attacking your own unit', () => {
    const state = placeAdjacent(fresh())
    const r = validateAttack(state, PA, {
      kind: 'attack',
      unitId: unitId('u_match-1_a'),
      targetId: unitId('u_match-1_a'),
    })
    expect(r).toEqual({ ok: false, code: 'bad_message' })
  })

  it('rejects attacking a dead unit', () => {
    const state = placeAdjacent(fresh())
    const withDead: MatchState = {
      ...state,
      units: state.units.map((u) => (u.ownerId === PB ? { ...u, hp: 0 } : u)),
    }
    const r = validateAttack(withDead, PA, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'unit_dead' })
  })

  it('rejects when energy is insufficient', () => {
    const state = placeAdjacent(fresh())
    const drained: MatchState = { ...state, energy: { ...state.energy, [PA]: 1 } }
    const r = validateAttack(drained, PA, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'insufficient_energy' })
  })

  it("rejects when it's not the actor's turn", () => {
    const state = placeAdjacent(fresh())
    const r = validateAttack(state, PB, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'not_your_turn' })
  })

  it('rejects a target on a shadow tile', () => {
    const state = placeAdjacent(fresh())
    const shadowed: MatchState = {
      ...state,
      grid: {
        ...state.grid,
        tiles: state.grid.tiles.map((row, y) =>
          row.map((tile, x) => (x === 6 && y === 3 ? { type: 'shadow' as const, height: 1 } : tile)),
        ),
      },
    }
    const r = validateAttack(shadowed, PA, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'target_untargetable' })
  })

  it('accepts an adjacent, in-turn, energy-funded attack', () => {
    const state = placeAdjacent(fresh())
    const r = validateAttack(state, PA, attackAction('u_match-1_b'))
    expect(r).toEqual({ ok: true, cost: ATTACK_COST })
  })
})

describe('applyAttack', () => {
  it('deals knight base damage and debits energy', () => {
    const state = placeAdjacent(fresh())
    const { state: after, damage, killed } = applyAttack(
      state,
      attackAction('u_match-1_b'),
      ATTACK_COST,
    )
    expect(damage).toBe(CLASS_STATS.knight.baseAttackDamage)
    expect(killed).toBe(false)
    const targetAfter = after.units.find((u) => u.ownerId === PB)
    expect(targetAfter?.hp).toBe(CLASS_STATS.knight.hp - CLASS_STATS.knight.baseAttackDamage)
    expect(after.energy[PA]).toBe(5 - ATTACK_COST)
    expect(after.energy[PB]).toBe(5)
  })

  it('clamps HP at 0 and removes dead units', () => {
    const state = placeAdjacent(fresh())
    const withFragileB: MatchState = {
      ...state,
      units: state.units.map((u) => (u.ownerId === PB ? { ...u, hp: 1 } : u)),
    }
    const result = applyAttack(withFragileB, attackAction('u_match-1_b'), ATTACK_COST)
    expect(result.killed).toBe(true)
    expect(result.state.units.find((u) => u.ownerId === PB)).toBeUndefined()
  })

  it('halves damage vs. a defending target', () => {
    const state = placeAdjacent(fresh())
    const defending: MatchState = {
      ...state,
      units: state.units.map((u) =>
        u.ownerId === PB ? { ...u, statuses: [{ kind: 'defending' as const, ttl: 1 }] } : u,
      ),
    }
    const { damage } = applyAttack(defending, attackAction('u_match-1_b'), ATTACK_COST)
    // 5 × 0.5 = 2.5 → round half-up → 3
    expect(damage).toBe(3)
  })

  it('enforces minimum 1 damage on direct attacks', () => {
    const state = placeAdjacent(fresh())
    // Shield Wall = 75% reduction. 5 × 0.25 = 1.25 → 1 after rounding.
    // Apply a further rubble tile to push below floor, then assert MIN=1.
    const armored: MatchState = {
      ...state,
      units: state.units.map((u) =>
        u.ownerId === PB ? { ...u, statuses: [{ kind: 'shield_wall' as const, ttl: 1 }] } : u,
      ),
      grid: {
        ...state.grid,
        tiles: state.grid.tiles.map((row, y) =>
          row.map((tile, x) => (x === 6 && y === 3 ? { type: 'rubble' as const, height: 1 } : tile)),
        ),
      },
    }
    const { damage } = applyAttack(armored, attackAction('u_match-1_b'), ATTACK_COST)
    expect(damage).toBeGreaterThanOrEqual(1)
  })
})

describe('resolveMatchEnd', () => {
  it('reports ongoing when both sides have living units', () => {
    const state = fresh()
    expect(resolveMatchEnd(state)).toEqual({ over: false })
  })

  it('reports winner when only one side has living units', () => {
    const state = fresh()
    const bKilled: MatchState = { ...state, units: state.units.filter((u) => u.ownerId !== PB) }
    expect(resolveMatchEnd(bKilled)).toEqual({ over: true, winner: PA })
  })
})

describe('full kill flow — attack → resolveMatchEnd', () => {
  it('ends the match when the final unit dies', () => {
    let state = placeAdjacent(fresh())
    state = {
      ...state,
      units: state.units.map((u) => (u.ownerId === PB ? { ...u, hp: 2 } : u)),
    }
    const result = applyAttack(state, attackAction('u_match-1_b'), ATTACK_COST)
    expect(result.killed).toBe(true)
    const end = resolveMatchEnd(result.state)
    expect(end).toEqual({ over: true, winner: PA })
  })

  it('plays nicely with move→attack chains in one turn', () => {
    // Shows that energy drains in order through move + attack.
    let state = fresh()
    const moveToFive: Extract<GameAction, { kind: 'move' }> = {
      kind: 'move',
      unitId: unitId('u_match-1_a'),
      path: [
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ],
    }
    state = applyMove(state, moveToFive, 3)
    expect(state.energy[PA]).toBe(2)
    // Only 2 energy left — attack costs 2. Can still attack... if adjacent.
    // A is at (4,4); B at (6,3). Not adjacent; validator would reject.
    // This test only documents energy accounting, not range.
  })
})
