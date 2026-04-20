// src/server/GameEngine.ts
// Pure game logic: create match, apply actions, resolve turn ticks.
// Must stay testable without the ws transport — tests instantiate it directly.
//
// M1 scope: createMatch only. Actions (move/attack/etc.) arrive in M2+.

import {
  BASE_ENERGY_PER_TURN,
  CLASS_STATS,
  GRID_HEIGHT,
  GRID_WIDTH,
  TURN_TIMER_MS,
} from '../shared/constants.js'
import {
  type ClassId,
  type MatchId,
  type MatchState,
  type PerkId,
  type PlayerId,
  type Position,
  type TerrainTile,
  type Unit,
  unitId,
} from '../shared/types.js'

/** Mirrored spawns per SPEC §7 M1. Fixed for the M1 placeholder arena. */
export const SPAWN_A: Position = { x: 1, y: 4 }
export const SPAWN_B: Position = { x: 6, y: 3 }

export interface CreateMatchInput {
  matchId: MatchId
  playerA: PlayerId
  playerB: PlayerId
  classA?: ClassId
  classB?: ClassId
  /** Who acts first. Defaults to playerA; M2 will supply the coin flip. */
  firstTurn?: 'A' | 'B'
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

export function createMatch(input: CreateMatchInput): MatchState {
  const classA: ClassId = input.classA ?? 'knight'
  const classB: ClassId = input.classB ?? 'knight'
  const firstTurn = input.firstTurn ?? 'A'
  const now = (input.now ?? Date.now)()

  const tiles: TerrainTile[][] = []
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: TerrainTile[] = []
    for (let x = 0; x < GRID_WIDTH; x++) {
      row.push({ type: 'stone' })
    }
    tiles.push(row)
  }

  const unitA: Unit = {
    id: unitId(`u_${input.matchId}_a`),
    ownerId: input.playerA,
    classId: classA,
    pos: SPAWN_A,
    hp: CLASS_STATS[classA].hp,
    maxHp: CLASS_STATS[classA].hp,
    statuses: [],
  }
  const unitB: Unit = {
    id: unitId(`u_${input.matchId}_b`),
    ownerId: input.playerB,
    classId: classB,
    pos: SPAWN_B,
    hp: CLASS_STATS[classB].hp,
    maxHp: CLASS_STATS[classB].hp,
    statuses: [],
  }

  const currentTurn = firstTurn === 'A' ? input.playerA : input.playerB

  const energy: Record<PlayerId, number> = {
    [input.playerA]: BASE_ENERGY_PER_TURN,
    [input.playerB]: BASE_ENERGY_PER_TURN,
  }

  const maxEnergy: Record<PlayerId, number> = {
    [input.playerA]: BASE_ENERGY_PER_TURN,
    [input.playerB]: BASE_ENERGY_PER_TURN,
  }

  const perks: Record<PlayerId, PerkId[]> = {
    [input.playerA]: [],
    [input.playerB]: [],
  }

  return {
    matchId: input.matchId,
    arena: 'pit',
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT, tiles },
    units: [unitA, unitB],
    pickups: [],
    traps: [],
    ashClouds: [],
    currentTurn,
    turnNumber: 1,
    turnEndsAt: now + TURN_TIMER_MS,
    energy,
    maxEnergy,
    perks,
    phase: 'active',
  }
}
