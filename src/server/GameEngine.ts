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
  type GameAction,
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
  /** Forces a coin-flip outcome. If omitted, `rng` picks. */
  firstTurn?: 'A' | 'B'
  /** Injectable clock for deterministic tests. */
  now?: () => number
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  rng?: () => number
}

export function createMatch(input: CreateMatchInput): MatchState {
  const classA: ClassId = input.classA ?? 'knight'
  const classB: ClassId = input.classB ?? 'knight'
  const rng = input.rng ?? Math.random
  const firstTurn = input.firstTurn ?? (rng() < 0.5 ? 'A' : 'B')
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

/**
 * Apply a validated `move` action. Returns the next `MatchState`. The caller
 * is responsible for running `validateMove` first and only calling this with
 * a legal action — passing invalid input here is a programmer error.
 */
export function applyMove(
  state: MatchState,
  action: Extract<GameAction, { kind: 'move' }>,
  cost: number,
): MatchState {
  const destination = action.path[action.path.length - 1]
  if (!destination) return state
  const units = state.units.map((u) =>
    u.id === action.unitId ? { ...u, pos: destination } : u,
  )
  const actingUnit = state.units.find((u) => u.id === action.unitId)
  if (!actingUnit) return state
  const actorId = actingUnit.ownerId
  const remaining = (state.energy[actorId] ?? 0) - cost
  const energy: Record<PlayerId, number> = { ...state.energy, [actorId]: remaining }
  return { ...state, units, energy }
}

export interface EndTurnResult {
  state: MatchState
  nextPlayer: PlayerId
}

/**
 * Apply a validated `endTurn`: hand the turn to the other player and refresh
 * their energy. Turn timer resets from the injected clock.
 */
export function applyEndTurn(state: MatchState, now: number): EndTurnResult {
  const players = Array.from(new Set(state.units.map((u) => u.ownerId)))
  const next = players.find((p) => p !== state.currentTurn) ?? state.currentTurn
  const refreshed = state.maxEnergy[next] ?? BASE_ENERGY_PER_TURN
  const energy: Record<PlayerId, number> = { ...state.energy, [next]: refreshed }
  return {
    state: {
      ...state,
      currentTurn: next,
      turnNumber: state.turnNumber + 1,
      turnEndsAt: now + TURN_TIMER_MS,
      energy,
    },
    nextPlayer: next,
  }
}
