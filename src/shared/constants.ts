// src/shared/constants.ts
// SPEC §4, §18 — every game number lives here. No inline magic values anywhere else.

import type { ClassId } from './types.js'

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
