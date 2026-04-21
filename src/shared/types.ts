// src/shared/types.ts
// SPEC §18 — THE contract. All shared game types live here and nowhere else.
// If you find yourself declaring a game-shape interface in a client or server
// file, stop and move it here.

// Core primitives
export interface Position {
  x: number
  y: number
}

export type UnitId = string & { readonly __brand: 'UnitId' }
export type PlayerId = string & { readonly __brand: 'PlayerId' }
export type MatchId = string & { readonly __brand: 'MatchId' }

export const unitId = (s: string): UnitId => s as UnitId
export const playerId = (s: string): PlayerId => s as PlayerId
export const matchId = (s: string): MatchId => s as MatchId

export type PerkId =
  | 'bloodlust'
  | 'second_wind'
  | 'scouts_eye'
  | 'energy_surge'
  | 'thick_skin'
  | 'ghost_step'
  | 'trap_sense'
  | 'ash_walker'
  | 'first_strike'
  | 'last_stand'
  | 'mist_cloak'
  | 'fortify'
  | 'long_reach'
  | 'pillager'
  | 'counterspell'
  | 'vampiric_touch'

export type ClassId = 'knight' | 'mage' | 'heretic'

/** SPEC §13 — every ability each class can cast. */
export type AbilityId =
  | 'shield_wall'
  | 'vanguard_charge'
  | 'iron_stance'
  | 'cinder_bolt'
  | 'ash_cloud'
  | 'blink'
  | 'blood_tithe'
  | 'hex_trap'
  | 'desecrate'

export type TerrainType =
  | 'stone'
  | 'high_ground'
  | 'rubble'
  | 'hazard_fire'
  | 'hazard_acid'
  | 'hazard_void'
  | 'pillar'
  | 'wall'
  | 'shadow'
  | 'corrupted'

export interface TerrainTile {
  type: TerrainType
  /** Only present for Corrupted / dynamic overlays — turns remaining. */
  ttl?: number
  /** Underlying type for reverting dynamic effects. */
  baseType?: TerrainType
}

export type StatusKind =
  | 'defending'
  | 'shield_wall'
  | 'iron_stance'
  | 'revealed'
  | 'stunned'
  | 'blood_tithe_used'

export interface Status {
  kind: StatusKind
  /** Turns remaining. -1 means "until toggled off" (Iron Stance). */
  ttl: number
}

export interface Unit {
  id: UnitId
  ownerId: PlayerId
  classId: ClassId
  pos: Position
  hp: number
  maxHp: number
  statuses: Status[]
  // No cooldowns field. Ability gating is by energy + HP cost + once-per-turn
  // flags carried inside statuses (e.g. blood_tithe_used). If a future ability
  // needs turn-counting cooldowns, add it here and update validators — don't
  // reach for a Record<string, number> escape hatch.
}

export type PickupKind = 'health_flask' | 'energy_crystal' | 'scroll_of_sight' | 'chest'

export interface Pickup {
  id: string
  pos: Position
  kind: PickupKind
}

export interface HexTrap {
  id: string
  ownerId: PlayerId
  /** Hidden from non-owners via server-side fog filter. */
  pos: Position
}

/** Temporary Ash Cloud overlay. Does not replace TerrainType. */
export interface AshCloud {
  id: string
  ownerId: PlayerId
  /** Fixed 2×2 footprint. */
  tiles: [Position, Position, Position, Position]
  /** Turns remaining. */
  ttl: number
}

export interface ArenaDef {
  /** One of "pit" | "ruins" | "bridge" | "shrine" | "maze". */
  slug: string
  name: string
  /** 8×8 grid, indexed [y][x]. */
  tiles: TerrainType[][]
  /** Mirrored spawn positions per match. */
  spawns: [Position, Position]
  /** Fixed candidate slots; which pickup lands where is rolled at match start. */
  pickupSlots: Position[]
}

export interface MatchState {
  matchId: MatchId
  /** Arena slug. */
  arena: string
  grid: { width: 8; height: 8; tiles: TerrainTile[][] }
  units: Unit[]
  pickups: Pickup[]
  /** Fog-filtered per player. */
  traps: HexTrap[]
  /** Overlays; the renderer draws atop tiles. */
  ashClouds: AshCloud[]
  currentTurn: PlayerId
  /** Monotonic counter from 1. */
  turnNumber: number
  /** Unix ms on the server clock. */
  turnEndsAt: number
  energy: Record<PlayerId, number>
  /** 5, or 6 with Energy Surge. */
  maxEnergy: Record<PlayerId, number>
  perks: Record<PlayerId, PerkId[]>
  phase: 'active' | 'over'
  winner?: PlayerId
  surrender?: { by: PlayerId; at: number }
}

// Actions (client → server)
export type GameAction =
  | { kind: 'move'; unitId: UnitId; path: Position[] }
  | { kind: 'attack'; unitId: UnitId; targetId: UnitId }
  | { kind: 'defend'; unitId: UnitId }
  | { kind: 'scout'; unitId: UnitId; center: Position }
  | {
      kind: 'ability'
      unitId: UnitId
      abilityId: string
      target?: Position
      targetId?: UnitId
    }
  | { kind: 'usePickup'; unitId: UnitId }
  | { kind: 'kneel' }
  | { kind: 'endTurn' }

export type ClientMessage =
  | { type: 'joinTournament'; name: string; sessionToken?: string }
  | { type: 'selectClass'; classId: ClassId }
  | { type: 'ready' }
  | { type: 'action'; action: GameAction }
  | { type: 'selectPerk'; perkId: PerkId }
  | { type: 'spectate'; matchId: MatchId }
  | { type: 'leaveSpectator' }

/** SPEC §19 error codes. Do not invent new codes — add them here first. */
export type ServerErrorCode =
  | 'not_your_turn'
  | 'insufficient_energy'
  | 'out_of_range'
  | 'no_line_of_sight'
  | 'target_untargetable'
  | 'invalid_path'
  | 'tile_impassable'
  | 'tile_occupied'
  | 'duplicate_trap'
  | 'self_kill_prevented'
  | 'unit_dead'
  | 'unit_not_owned'
  | 'match_not_active'
  | 'rate_limited'
  | 'bad_message'
  | 'session_expired'
  | 'server_busy'
  | 'server_error'

export type ServerMessage =
  | { type: 'hello'; serverVersion: string; sessionToken: string }
  | { type: 'error'; code: ServerErrorCode; reason: string }
  | { type: 'tournamentUpdate'; bracket: BracketState }
  | { type: 'matchStart'; match: MatchState; youAre: PlayerId }
  /** Fog-filtered per recipient. */
  | { type: 'stateUpdate'; match: MatchState }
  | { type: 'turnStart'; playerId: PlayerId; endsAt: number }
  | { type: 'actionResult'; ok: boolean; error?: ServerErrorCode; eventId?: string }
  | { type: 'matchOver'; winner: PlayerId; final: MatchState; surrender?: boolean }
  | { type: 'perkOptions'; perks: PerkId[] }
  /** Full state for spectators. */
  | { type: 'spectatorState'; match: MatchState }

export interface BracketState {
  rounds: BracketRound[]
  currentRound: number
}
export interface BracketRound {
  matches: Array<{
    matchId: MatchId
    players: [PlayerId, PlayerId]
    winner?: PlayerId
    status: 'pending' | 'active' | 'done'
  }>
}
