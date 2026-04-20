// tests/unit/game-engine.test.ts
// M1 unit coverage: createMatch shape + invariants.

import { describe, expect, it } from 'vitest'
import { createMatch, SPAWN_A, SPAWN_B } from '../../src/server/GameEngine.js'
import {
  BASE_ENERGY_PER_TURN,
  CLASS_STATS,
  GRID_HEIGHT,
  GRID_WIDTH,
  TURN_TIMER_MS,
} from '../../src/shared/constants.js'
import { matchId, playerId } from '../../src/shared/types.js'

const PA = playerId('player-a')
const PB = playerId('player-b')
const MID = matchId('match-1')

describe('createMatch', () => {
  it('produces an 8×8 stone grid', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 0 })
    expect(m.grid.width).toBe(GRID_WIDTH)
    expect(m.grid.height).toBe(GRID_HEIGHT)
    expect(m.grid.tiles).toHaveLength(GRID_HEIGHT)
    for (const row of m.grid.tiles) {
      expect(row).toHaveLength(GRID_WIDTH)
      for (const tile of row) {
        expect(tile.type).toBe('stone')
      }
    }
  })

  it('places both units at the mirrored spawn positions', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 0 })
    expect(m.units).toHaveLength(2)
    const [a, b] = m.units
    expect(a?.ownerId).toBe(PA)
    expect(a?.pos).toEqual(SPAWN_A)
    expect(b?.ownerId).toBe(PB)
    expect(b?.pos).toEqual(SPAWN_B)
  })

  it('gives each unit full class HP', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      classA: 'mage',
      classB: 'heretic',
      now: () => 0,
    })
    const [a, b] = m.units
    expect(a?.hp).toBe(CLASS_STATS.mage.hp)
    expect(a?.maxHp).toBe(CLASS_STATS.mage.hp)
    expect(b?.hp).toBe(CLASS_STATS.heretic.hp)
    expect(b?.maxHp).toBe(CLASS_STATS.heretic.hp)
  })

  it('seeds both players with BASE_ENERGY_PER_TURN', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 0 })
    expect(m.energy[PA]).toBe(BASE_ENERGY_PER_TURN)
    expect(m.energy[PB]).toBe(BASE_ENERGY_PER_TURN)
    expect(m.maxEnergy[PA]).toBe(BASE_ENERGY_PER_TURN)
    expect(m.maxEnergy[PB]).toBe(BASE_ENERGY_PER_TURN)
  })

  it('starts on turn 1, phase active, currentTurn == one of the two players', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 0 })
    expect(m.turnNumber).toBe(1)
    expect(m.phase).toBe('active')
    expect([PA, PB]).toContain(m.currentTurn)
  })

  it('honors explicit firstTurn=A', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      firstTurn: 'A',
      now: () => 0,
    })
    expect(m.currentTurn).toBe(PA)
  })

  it('coin flip picks A when rng() < 0.5', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      now: () => 0,
      rng: () => 0.1,
    })
    expect(m.currentTurn).toBe(PA)
  })

  it('coin flip picks B when rng() >= 0.5', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      now: () => 0,
      rng: () => 0.9,
    })
    expect(m.currentTurn).toBe(PB)
  })

  it('honors explicit firstTurn=B', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      firstTurn: 'B',
      now: () => 0,
    })
    expect(m.currentTurn).toBe(PB)
  })

  it('computes turnEndsAt from injected clock + turn timer', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 1_000_000 })
    expect(m.turnEndsAt).toBe(1_000_000 + TURN_TIMER_MS)
  })

  it('honors turnTimerMs override (M4 dev ergonomics / tests)', () => {
    const m = createMatch({
      matchId: MID,
      playerA: PA,
      playerB: PB,
      now: () => 500,
      turnTimerMs: 2_000,
    })
    expect(m.turnEndsAt).toBe(500 + 2_000)
  })

  it('starts with empty pickup/trap/ashCloud arrays', () => {
    const m = createMatch({ matchId: MID, playerA: PA, playerB: PB, now: () => 0 })
    expect(m.pickups).toEqual([])
    expect(m.traps).toEqual([])
    expect(m.ashClouds).toEqual([])
    expect(m.perks[PA]).toEqual([])
    expect(m.perks[PB]).toEqual([])
  })
})
