// src/shared/constants.ts
// SPEC §4, §18 — every game number lives here. No inline magic values anywhere else.

import type { AbilityId, ClassId } from './types.js'

/** Bumped per release; reported in the `hello` message. */
export const SERVER_VERSION = '0.1.0-m0' as const

// --- Grid ---
export const GRID_WIDTH = 8 as const
export const GRID_HEIGHT = 8 as const

// --- Turn economy ---
export const BASE_ENERGY_PER_TURN = 5 as const
export const ENERGY_SURGE_PER_TURN = 6 as const
export const TURN_TIMER_MS = 30_000 as const

// --- Network / session ---
export const RECONNECT_GRACE_MS = 30_000 as const
export const BOT_FILL_WAIT_MS = 15_000 as const
export const PERK_DRAFT_TIMER_MS = 20_000 as const
export const RATE_LIMIT_ACTIONS_PER_SEC = 10 as const

// --- Traps ---
export const MAX_TRAPS_PER_HERETIC = 2 as const

// --- Class stats (SPEC §13) ---
export const CLASS_STATS: Record<
  ClassId,
  {
    hp: number
    baseAttackDamage: number
    attackRange: number
    sightRange: number
    requiresLoS: boolean
  }
> = {
  knight: { hp: 24, baseAttackDamage: 5, attackRange: 1, sightRange: 2, requiresLoS: false },
  mage: { hp: 16, baseAttackDamage: 3, attackRange: 3, sightRange: 3, requiresLoS: true },
  heretic: { hp: 20, baseAttackDamage: 4, attackRange: 2, sightRange: 2, requiresLoS: false },
}

// --- Action costs (SPEC §8.3) ---
export const MOVE_COST_DEFAULT = 1 as const
export const MOVE_COST_DIFFICULT = 2 as const // rubble, climbing onto high ground
export const ATTACK_COST = 2 as const
export const DEFEND_COST = 1 as const
export const SCOUT_COST = 1 as const
export const USE_PICKUP_COST = 1 as const

// --- Damage math (SPEC §12) ---
export const DEFEND_REDUCTION = 0.5 as const
export const FORTIFY_REDUCTION = 0.75 as const // Fortify perk
export const COVER_RUBBLE_REDUCTION = 0.15 as const
export const HIGH_GROUND_DAMAGE_BONUS = 0.25 as const
export const MIN_DIRECT_DAMAGE = 1 as const

// --- DoT ticks (SPEC §10) ---
export const HAZARD_DOT = 1 as const
export const ASH_CLOUD_DOT = 1 as const
export const CORRUPTED_ENEMY_DOT = 2 as const
export const CORRUPTED_HERETIC_HEAL = 1 as const

// --- Render (SPEC §21.4) ---
export const TILE_WIDTH = 64 as const
export const TILE_HEIGHT = 32 as const
export const TILE_DEPTH = 28 as const
export const SPRITE_CANVAS = 64 as const

// --- Abilities (SPEC §13) ---
export const CLASS_ABILITIES: Record<ClassId, readonly [AbilityId, AbilityId, AbilityId]> = {
  knight: ['shield_wall', 'vanguard_charge', 'iron_stance'],
  mage: ['cinder_bolt', 'ash_cloud', 'blink'],
  heretic: ['blood_tithe', 'hex_trap', 'desecrate'],
}

export const ABILITY_ENERGY_COST: Record<AbilityId, number> = {
  shield_wall: 1,
  vanguard_charge: 3,
  iron_stance: 2, // to turn on; toggling off is 0 — server checks state
  cinder_bolt: 2,
  ash_cloud: 3,
  blink: 2,
  blood_tithe: 0,
  hex_trap: 2,
  desecrate: 3,
}

// HP sacrifices live separately so validators can gate self-kill (SPEC §8.4).
export const ABILITY_HP_COST: Partial<Record<AbilityId, number>> = {
  blood_tithe: 4,
}

// --- Ability-specific values (SPEC §13) ---
export const VANGUARD_CHARGE_MAX_TILES = 3 as const
export const VANGUARD_CHARGE_IMPACT_DAMAGE = 4 as const
export const VANGUARD_CHARGE_BLOCKED_BONUS = 2 as const
export const IRON_STANCE_EXTRA_MOVE_COST = 1 as const
export const CINDER_BOLT_DAMAGE = 5 as const
export const CINDER_BOLT_RANGE = 3 as const
export const ASH_CLOUD_RANGE = 3 as const
export const ASH_CLOUD_TTL = 2 as const
export const BLINK_RANGE = 2 as const
export const BLOOD_TITHE_ENERGY_GAIN = 2 as const
export const BLOOD_TITHE_HP_FLOOR = 1 as const
export const HEX_TRAP_RANGE = 2 as const
export const HEX_TRAP_DAMAGE = 4 as const
export const HEX_TRAP_REVEAL_TTL = 2 as const
export const DESECRATE_RANGE = 2 as const
export const DESECRATE_TTL = 3 as const

// --- Scout / Fog of war (SPEC §11) ---
export const SCOUT_RADIUS = 1 as const // 3×3 footprint = center + 1 in each dimension

// --- Pickups (SPEC §16) ---
export const HEALTH_FLASK_HEAL = 5 as const
export const ENERGY_CRYSTAL_GAIN = 2 as const
/** Chest sub-item: Smoke Bomb — place a 1-tile fog on any tile in range 2, 2 turns. */
export const SMOKE_BOMB_RANGE = 2 as const
export const SMOKE_BOMB_TTL = 2 as const
/** Chest sub-item: Flash — stun adjacent enemy 1 turn. */
export const FLASH_STUN_TTL = 1 as const
/** Chest sub-item: Whetstone — +2 damage on the holder's next attack only. */
export const WHETSTONE_DAMAGE_BONUS = 2 as const
