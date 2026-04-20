// tests/unit/validators.test.ts
// Validator coverage per SPEC §19 error codes + §8.5 path re-validation.

import { describe, expect, it } from 'vitest'
import { applyEndTurn, applyMove, createMatch } from '../../src/server/GameEngine.js'
import { validateEndTurn, validateMove } from '../../src/server/validators.js'
import { BASE_ENERGY_PER_TURN } from '../../src/shared/constants.js'
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

function fresh(): MatchState {
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    firstTurn: 'A',
    now: () => 0,
  })
}

function moveAction(path: Position[], id = 'u_match-1_a'): Extract<GameAction, { kind: 'move' }> {
  return { kind: 'move', unitId: unitId(id), path }
}

function requireUnit(state: MatchState, ownerId: MatchState['currentTurn']) {
  const unit = state.units.find((u) => u.ownerId === ownerId)
  if (!unit) throw new Error('unit missing')
  return unit
}

describe('validateMove — actor preflight', () => {
  it('rejects if the match is over', () => {
    const state: MatchState = { ...fresh(), phase: 'over' }
    const r = validateMove(state, PA, moveAction([{ x: 1, y: 5 }]))
    expect(r).toEqual({ ok: false, code: 'match_not_active' })
  })

  it("rejects if it's not the actor's turn", () => {
    const state = fresh()
    const r = validateMove(state, PB, moveAction([{ x: 6, y: 4 }], 'u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'not_your_turn' })
  })

  it('rejects a unit the actor does not own', () => {
    const state = fresh()
    const r = validateMove(state, PA, moveAction([{ x: 6, y: 4 }], 'u_match-1_b'))
    expect(r).toEqual({ ok: false, code: 'unit_not_owned' })
  })

  it('rejects dead units', () => {
    const state = fresh()
    requireUnit(state, PA).hp = 0
    const r = validateMove(state, PA, moveAction([{ x: 1, y: 5 }]))
    expect(r).toEqual({ ok: false, code: 'unit_dead' })
  })
})

describe('validateMove — path shape', () => {
  it('rejects empty path', () => {
    const r = validateMove(fresh(), PA, moveAction([]))
    expect(r).toEqual({ ok: false, code: 'invalid_path' })
  })

  it('rejects a diagonal step', () => {
    const r = validateMove(fresh(), PA, moveAction([{ x: 2, y: 5 }]))
    expect(r).toEqual({ ok: false, code: 'invalid_path' })
  })

  it('rejects a 2-tile jump (non-adjacent step)', () => {
    const r = validateMove(fresh(), PA, moveAction([{ x: 3, y: 4 }]))
    expect(r).toEqual({ ok: false, code: 'invalid_path' })
  })

  it('rejects a step that leaves the grid', () => {
    const state = fresh()
    requireUnit(state, PA).pos = { x: 0, y: 0 }
    const r = validateMove(state, PA, moveAction([{ x: -1, y: 0 }]))
    expect(r).toEqual({ ok: false, code: 'invalid_path' })
  })

  it('rejects a tile occupied by another unit', () => {
    const state = fresh()
    requireUnit(state, PA).pos = { x: 5, y: 3 }
    const r = validateMove(state, PA, moveAction([{ x: 6, y: 3 }]))
    expect(r).toEqual({ ok: false, code: 'tile_occupied' })
  })

  it('rejects pillar / wall tiles', () => {
    const state = fresh()
    const row = state.grid.tiles[4]
    if (!row) throw new Error('row missing')
    row[2] = { type: 'pillar' }
    const r = validateMove(state, PA, moveAction([{ x: 2, y: 4 }]))
    expect(r).toEqual({ ok: false, code: 'tile_impassable' })
  })
})

describe('validateMove — energy', () => {
  it('accepts a 5-tile orthogonal path using all energy', () => {
    const state = fresh()
    const r = validateMove(
      state,
      PA,
      moveAction([
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 3 },
      ]),
    )
    expect(r).toEqual({ ok: true, cost: 5 })
  })

  it('rejects a 6-tile path with only 5 energy', () => {
    const state = fresh()
    const r = validateMove(
      state,
      PA,
      moveAction([
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ]),
    )
    expect(r).toEqual({ ok: false, code: 'insufficient_energy' })
  })
})

describe('applyMove + applyEndTurn — integration', () => {
  it('moves the unit and debits energy by the path cost', () => {
    const state = fresh()
    const action = moveAction([
      { x: 2, y: 4 },
      { x: 3, y: 4 },
    ])
    const r = validateMove(state, PA, action)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const next = applyMove(state, action, r.cost)
    expect(next.units.find((u) => u.ownerId === PA)?.pos).toEqual({ x: 3, y: 4 })
    expect(next.energy[PA]).toBe(BASE_ENERGY_PER_TURN - 2)
    expect(next.energy[PB]).toBe(BASE_ENERGY_PER_TURN)
    expect(next.units.find((u) => u.ownerId === PB)?.pos).toEqual({ x: 6, y: 3 })
  })

  it('endTurn hands the turn to the other player and refreshes their energy', () => {
    const state = fresh()
    const mv = moveAction([{ x: 2, y: 4 }])
    const rMv = validateMove(state, PA, mv)
    expect(rMv.ok).toBe(true)
    if (!rMv.ok) return
    const afterMove = applyMove(state, mv, rMv.cost)
    expect(afterMove.energy[PA]).toBe(BASE_ENERGY_PER_TURN - 1)

    const rEnd = validateEndTurn(afterMove, PA)
    expect(rEnd).toEqual({ ok: true, cost: 0 })
    const ended = applyEndTurn(afterMove, 1_000)
    expect(ended.nextPlayer).toBe(PB)
    expect(ended.state.currentTurn).toBe(PB)
    expect(ended.state.turnNumber).toBe(2)
    expect(ended.state.energy[PB]).toBe(BASE_ENERGY_PER_TURN)
    // A's leftover energy is NOT restored until A's next turn.
    expect(ended.state.energy[PA]).toBe(BASE_ENERGY_PER_TURN - 1)
    expect(ended.state.turnEndsAt).toBe(1_000 + 30_000)
  })

  it('endTurn rejects if not the actor\u2019s turn', () => {
    const state = fresh()
    const r = validateEndTurn(state, PB)
    expect(r).toEqual({ ok: false, code: 'not_your_turn' })
  })

  it('endTurn respects turnTimerMs override', () => {
    const state = fresh()
    const result = applyEndTurn(state, 10_000, 1_500)
    expect(result.state.turnEndsAt).toBe(10_000 + 1_500)
  })
})
