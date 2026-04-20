// src/server/GameEngine.ts
// Pure game logic: create match, apply actions, resolve turn ticks.
// Must stay testable without the ws transport — tests instantiate it directly.
//
// M1 scope: createMatch only. Actions (move/attack/etc.) arrive in M2+.

import {
  BASE_ENERGY_PER_TURN,
  CLASS_STATS,
  COVER_RUBBLE_REDUCTION,
  DEFEND_REDUCTION,
  FORTIFY_REDUCTION,
  GRID_HEIGHT,
  GRID_WIDTH,
  HIGH_GROUND_DAMAGE_BONUS,
  MIN_DIRECT_DAMAGE,
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
  /**
   * Per-turn ms budget. Defaults to the locked SPEC value (30_000).
   * Tests and dev (`DCT_TURN_TIMER_MS`) can shorten this; never override
   * in production.
   */
  turnTimerMs?: number
}

export function createMatch(input: CreateMatchInput): MatchState {
  const classA: ClassId = input.classA ?? 'knight'
  const classB: ClassId = input.classB ?? 'knight'
  const rng = input.rng ?? Math.random
  const firstTurn = input.firstTurn ?? (rng() < 0.5 ? 'A' : 'B')
  const now = (input.now ?? Date.now)()
  const turnTimerMs = input.turnTimerMs ?? TURN_TIMER_MS

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
    turnEndsAt: now + turnTimerMs,
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

export interface AttackResult {
  state: MatchState
  damage: number
  killed: boolean
}

/**
 * Apply a validated `attack`. Returns the next state plus the damage dealt
 * and whether the target died. Caller runs `validateAttack` first.
 *
 * Damage formula (SPEC §12):
 *   base = CLASS_STATS[attacker].baseAttackDamage
 *   × (1 − defend)          — 0.5 for Defend, 0.25 for Shield Wall/Fortify
 *   × (1 − rubble cover)    — 0.15 on Rubble
 *   × (1 + high-ground)     — +25% when attacker elevation > target's
 *   rounded half-up, clamped to MIN_DIRECT_DAMAGE.
 */
export function applyAttack(
  state: MatchState,
  action: Extract<GameAction, { kind: 'attack' }>,
  cost: number,
): AttackResult {
  const attacker = state.units.find((u) => u.id === action.unitId)
  const target = state.units.find((u) => u.id === action.targetId)
  if (!attacker || !target) return { state, damage: 0, killed: false }

  let damage = CLASS_STATS[attacker.classId].baseAttackDamage

  const shieldWall = target.statuses.some((s) => s.kind === 'shield_wall')
  const defending = target.statuses.some((s) => s.kind === 'defending')
  if (shieldWall) damage *= 1 - FORTIFY_REDUCTION
  else if (defending) damage *= 1 - DEFEND_REDUCTION

  const targetTile = state.grid.tiles[target.pos.y]?.[target.pos.x]
  if (targetTile?.type === 'rubble') damage *= 1 - COVER_RUBBLE_REDUCTION

  const attackerTile = state.grid.tiles[attacker.pos.y]?.[attacker.pos.x]
  if (attackerTile?.type === 'high_ground' && targetTile?.type !== 'high_ground') {
    damage *= 1 + HIGH_GROUND_DAMAGE_BONUS
  }

  const finalDamage = Math.max(MIN_DIRECT_DAMAGE, Math.round(damage))
  const nextHp = Math.max(0, target.hp - finalDamage)
  const killed = nextHp <= 0

  const units = state.units
    .map((u) => (u.id === target.id ? { ...u, hp: nextHp } : u))
    .filter((u) => u.hp > 0)

  const actorEnergy = (state.energy[attacker.ownerId] ?? 0) - cost
  const energy: Record<PlayerId, number> = { ...state.energy, [attacker.ownerId]: actorEnergy }

  return { state: { ...state, units, energy }, damage: finalDamage, killed }
}

/**
 * Determine match-end state. SPEC §8.7 covers double-KO and forfeit edges;
 * M3 needs only the knockout case (survivor wins). Returns `{ over: true, winner }`
 * when exactly one side still has living units, `{ over: false }` otherwise.
 * A tie (both sides 0 living) is deferred to §8.7 handling in M5+.
 */
export function resolveMatchEnd(
  state: MatchState,
): { over: false } | { over: true; winner: PlayerId | null } {
  const livingByOwner = new Map<PlayerId, number>()
  for (const u of state.units) {
    if (u.hp > 0) livingByOwner.set(u.ownerId, (livingByOwner.get(u.ownerId) ?? 0) + 1)
  }
  const owners = Array.from(livingByOwner.keys())
  if (owners.length === 1) {
    const winner = owners[0] ?? null
    return { over: true, winner }
  }
  if (owners.length === 0) {
    return { over: true, winner: null }
  }
  return { over: false }
}

export interface EndTurnResult {
  state: MatchState
  nextPlayer: PlayerId
}

/**
 * Apply a validated `endTurn`: hand the turn to the other player and refresh
 * their energy. Turn timer resets from the injected clock.
 */
export function applyEndTurn(
  state: MatchState,
  now: number,
  turnTimerMs: number = TURN_TIMER_MS,
): EndTurnResult {
  const players = Array.from(new Set(state.units.map((u) => u.ownerId)))
  const next = players.find((p) => p !== state.currentTurn) ?? state.currentTurn
  const refreshed = state.maxEnergy[next] ?? BASE_ENERGY_PER_TURN
  const energy: Record<PlayerId, number> = { ...state.energy, [next]: refreshed }
  return {
    state: {
      ...state,
      currentTurn: next,
      turnNumber: state.turnNumber + 1,
      turnEndsAt: now + turnTimerMs,
      energy,
    },
    nextPlayer: next,
  }
}
