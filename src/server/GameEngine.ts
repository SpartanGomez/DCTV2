// src/server/GameEngine.ts
// Pure game logic: create match, apply actions, resolve turn ticks.
// Must stay testable without the ws transport — tests instantiate it directly.
//
// M1 scope: createMatch only. Actions (move/attack/etc.) arrive in M2+.

import {
  ASH_CLOUD_DOT,
  BASE_ENERGY_PER_TURN,
  CLASS_STATS,
  CORRUPTED_ENEMY_DOT,
  CORRUPTED_HERETIC_HEAL,
  COVER_RUBBLE_REDUCTION,
  DEFEND_REDUCTION,
  FORTIFY_REDUCTION,
  GRID_HEIGHT,
  GRID_WIDTH,
  HAZARD_DOT,
  HIGH_GROUND_DAMAGE_BONUS,
  MIN_DIRECT_DAMAGE,
  TURN_TIMER_MS,
} from '../shared/constants.js'
import { positionKey } from '../shared/grid.js'
import {
  type ClassId,
  type GameAction,
  type MatchId,
  type MatchState,
  type PerkId,
  type Pickup,
  type PickupKind,
  type PlayerId,
  type Position,
  type Status,
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
  /** Override the default pickup layout — tests use this. */
  pickups?: Pickup[]
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
    pickups: input.pickups ?? defaultPickups(input.matchId),
    traps: [],
    ashClouds: [],
    scoutReveals: [],
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
 * Default pickup layout for the M7 placeholder arena: one of each pickup
 * kind placed in the center strip. M11 replaces this with real arena
 * `pickupSlots` + a random-kind roller.
 */
function defaultPickups(mid: MatchId): Pickup[] {
  const kinds: PickupKind[] = ['health_flask', 'energy_crystal', 'scroll_of_sight', 'chest']
  const slots: Position[] = [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ]
  return kinds.map((kind, i) => {
    const pos = slots[i] ?? { x: 3, y: 3 }
    return {
      id: `pk_${mid}_${String(i)}`,
      pos,
      kind,
    }
  })
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

  // Whetstone (chest sub-item): one-shot +2 damage on the attacker's next attack.
  const whetstone = attacker.statuses.some((s) => s.kind === 'whetstone')
  let finalDamage = Math.max(MIN_DIRECT_DAMAGE, Math.round(damage))
  if (whetstone) finalDamage += 2
  const nextHp = Math.max(0, target.hp - finalDamage)
  const killed = nextHp <= 0

  const units = state.units
    .map((u) => {
      if (u.id === target.id) return { ...u, hp: nextHp }
      if (whetstone && u.id === attacker.id) {
        return { ...u, statuses: u.statuses.filter((s) => s.kind !== 'whetstone') }
      }
      return u
    })
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

/**
 * Apply a validated `scout` action: register a 3×3 reveal centered on the
 * target, clipped to grid bounds. TTL=2 so the reveal spans the rest of
 * the scout's turn + the opponent's turn; ticks to 0 at the scout's
 * next turn start.
 */
export function applyScout(
  state: MatchState,
  action: Extract<GameAction, { kind: 'scout' }>,
  cost: number,
): MatchState {
  const unit = state.units.find((u) => u.id === action.unitId)
  if (!unit) return state
  const tiles: Position[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p: Position = { x: action.center.x + dx, y: action.center.y + dy }
      if (p.x < 0 || p.x >= GRID_WIDTH || p.y < 0 || p.y >= GRID_HEIGHT) continue
      tiles.push(p)
    }
  }
  const reveal = {
    id: `scout_${unit.ownerId}_${positionKey(action.center)}_${String(state.turnNumber)}`,
    ownerId: unit.ownerId,
    tiles,
    ttl: 2,
  }
  const actorEnergy = (state.energy[unit.ownerId] ?? 0) - cost
  return {
    ...state,
    scoutReveals: [...state.scoutReveals, reveal],
    energy: { ...state.energy, [unit.ownerId]: actorEnergy },
  }
}

export interface EndTurnResult {
  state: MatchState
  nextPlayer: PlayerId
  /** Populated when the turn-start tick (DoTs, corrupted) ended the match. */
  ended?: { winner: PlayerId | null }
}

/**
 * Apply a validated `endTurn` and run the turn-start tick (SPEC §8.6):
 *   1. Decrement TTLs on outgoing player's statuses; remove expired.
 *   2. Decrement Ash Cloud TTLs owned by the outgoing player; remove expired.
 *   3. Decrement Corrupted-tile TTLs; revert expired to their baseType.
 *   4. Apply hazard DoT to incoming units standing on hazards.
 *   5. Apply Ash Cloud DoT.
 *   6. Apply Corrupted tile effects (2 dmg to non-Heretic, +1 heal to the Heretic).
 *   7. Clear the Heretic's `blood_tithe_used` flag for the incoming turn.
 *   8. Refresh incoming player's energy, increment turn number, reset timer.
 *
 * Match-end detection (§8.7) is the caller's job — read `ended` from the
 * return value. `ended.winner === null` signals a draw / double-KO.
 */
export function applyEndTurn(
  state: MatchState,
  now: number,
  turnTimerMs: number = TURN_TIMER_MS,
): EndTurnResult {
  const outgoing = state.currentTurn
  const players = uniquePlayers(state)
  const next = players.find((p) => p !== outgoing) ?? outgoing

  let working: MatchState = state

  working = decrementStatuses(working, outgoing)
  working = tickAshClouds(working, outgoing)
  working = tickCorrupted(working)
  working = tickScoutReveals(working, next)

  working = applyHazardDoT(working, next)
  working = applyAshCloudDoT(working, next)
  working = applyCorruptedEffects(working, next)

  working = clearBloodTitheFlag(working, next)

  const ended = checkEnded(working)
  if (ended) {
    return {
      state: { ...working, phase: 'over', ...(ended.winner ? { winner: ended.winner } : {}) },
      nextPlayer: next,
      ended,
    }
  }

  const refreshed = working.maxEnergy[next] ?? BASE_ENERGY_PER_TURN
  const energy: Record<PlayerId, number> = { ...working.energy, [next]: refreshed }
  return {
    state: {
      ...working,
      currentTurn: next,
      turnNumber: working.turnNumber + 1,
      turnEndsAt: now + turnTimerMs,
      energy,
    },
    nextPlayer: next,
  }
}

// --- tick helpers -------------------------------------------------------

function uniquePlayers(state: MatchState): PlayerId[] {
  const seen = new Set<PlayerId>()
  for (const u of state.units) seen.add(u.ownerId)
  for (const pid of Object.keys(state.energy) as PlayerId[]) seen.add(pid)
  return Array.from(seen)
}

function decrementStatuses(state: MatchState, owner: PlayerId): MatchState {
  const units = state.units.map((u) => {
    if (u.ownerId !== owner) return u
    const kept: Status[] = []
    for (const s of u.statuses) {
      if (s.ttl === -1) {
        kept.push(s)
        continue
      }
      const nextTtl = s.ttl - 1
      if (nextTtl > 0) kept.push({ ...s, ttl: nextTtl })
    }
    if (kept.length === u.statuses.length && kept.every((s, i) => s === u.statuses[i])) return u
    return { ...u, statuses: kept }
  })
  return { ...state, units }
}

function tickAshClouds(state: MatchState, owner: PlayerId): MatchState {
  const next = state.ashClouds
    .map((ac) => (ac.ownerId === owner ? { ...ac, ttl: ac.ttl - 1 } : ac))
    .filter((ac) => ac.ttl > 0)
  if (next.length === state.ashClouds.length) {
    // No expirations; only ttl mutated.
    if (next.every((ac, i) => ac === state.ashClouds[i])) return state
  }
  return { ...state, ashClouds: next }
}

function tickScoutReveals(state: MatchState, incoming: PlayerId): MatchState {
  if (state.scoutReveals.length === 0) return state
  const next = state.scoutReveals
    .map((r) => (r.ownerId === incoming ? { ...r, ttl: r.ttl - 1 } : r))
    .filter((r) => r.ttl > 0)
  if (next.length === state.scoutReveals.length) {
    if (next.every((r, i) => r === state.scoutReveals[i])) return state
  }
  return { ...state, scoutReveals: next }
}

function tickCorrupted(state: MatchState): MatchState {
  let changed = false
  const tiles = state.grid.tiles.map((row) =>
    row.map((tile) => {
      if (tile.type !== 'corrupted') return tile
      const nextTtl = (tile.ttl ?? 0) - 1
      if (nextTtl > 0) {
        changed = true
        return { ...tile, ttl: nextTtl }
      }
      changed = true
      const base = tile.baseType ?? 'stone'
      return { type: base }
    }),
  )
  if (!changed) return state
  return { ...state, grid: { ...state.grid, tiles } }
}

function damageUnitById(state: MatchState, unitIdArg: Unit['id'], damage: number): MatchState {
  const units = state.units
    .map((u) => (u.id === unitIdArg ? { ...u, hp: Math.max(0, u.hp - damage) } : u))
    .filter((u) => u.hp > 0)
  return { ...state, units }
}

function healUnitById(state: MatchState, unitIdArg: Unit['id'], amount: number, cap: number): MatchState {
  const units = state.units.map((u) =>
    u.id === unitIdArg ? { ...u, hp: Math.min(cap, u.hp + amount) } : u,
  )
  return { ...state, units }
}

function applyHazardDoT(state: MatchState, owner: PlayerId): MatchState {
  let working = state
  // Snapshot ids so we don't iterate a mutating array.
  const ids = working.units
    .filter((u) => u.ownerId === owner && u.hp > 0)
    .map((u) => u.id)
  for (const id of ids) {
    const unit = working.units.find((u) => u.id === id)
    if (!unit) continue
    const tile = working.grid.tiles[unit.pos.y]?.[unit.pos.x]
    if (!tile) continue
    if (
      tile.type === 'hazard_fire' ||
      tile.type === 'hazard_acid' ||
      tile.type === 'hazard_void'
    ) {
      working = damageUnitById(working, unit.id, HAZARD_DOT)
    }
  }
  return working
}

function applyAshCloudDoT(state: MatchState, owner: PlayerId): MatchState {
  if (state.ashClouds.length === 0) return state
  let working = state
  const cloudTiles = new Set<string>()
  for (const ac of working.ashClouds) for (const t of ac.tiles) cloudTiles.add(positionKey(t))
  const ids = working.units
    .filter((u) => u.ownerId === owner && u.hp > 0)
    .map((u) => u.id)
  for (const id of ids) {
    const unit = working.units.find((u) => u.id === id)
    if (!unit) continue
    if (cloudTiles.has(positionKey(unit.pos))) {
      working = damageUnitById(working, unit.id, ASH_CLOUD_DOT)
    }
  }
  return working
}

function applyCorruptedEffects(state: MatchState, owner: PlayerId): MatchState {
  let working = state
  const ids = working.units
    .filter((u) => u.ownerId === owner && u.hp > 0)
    .map((u) => u.id)
  for (const id of ids) {
    const unit = working.units.find((u) => u.id === id)
    if (!unit) continue
    const tile = working.grid.tiles[unit.pos.y]?.[unit.pos.x]
    if (tile?.type !== 'corrupted') continue
    if (unit.classId === 'heretic') {
      working = healUnitById(working, unit.id, CORRUPTED_HERETIC_HEAL, unit.maxHp)
    } else {
      working = damageUnitById(working, unit.id, CORRUPTED_ENEMY_DOT)
    }
  }
  return working
}

function clearBloodTitheFlag(state: MatchState, owner: PlayerId): MatchState {
  let changed = false
  const units = state.units.map((u) => {
    if (u.ownerId !== owner) return u
    if (!u.statuses.some((s) => s.kind === 'blood_tithe_used')) return u
    changed = true
    return { ...u, statuses: u.statuses.filter((s) => s.kind !== 'blood_tithe_used') }
  })
  if (!changed) return state
  return { ...state, units }
}

function checkEnded(state: MatchState): { winner: PlayerId | null } | null {
  const livingByOwner = new Map<PlayerId, number>()
  for (const u of state.units) {
    if (u.hp > 0) livingByOwner.set(u.ownerId, (livingByOwner.get(u.ownerId) ?? 0) + 1)
  }
  const owners = Array.from(livingByOwner.keys())
  if (owners.length === 1) return { winner: owners[0] ?? null }
  if (owners.length === 0) return { winner: null }
  return null
}
