// src/server/pickups.ts
// Pickup action validation + application. SPEC §16.
//
// `Chest` rolls a random sub-item on open: SmokeBomb, Flash, or Whetstone.
// For determinism in tests the engine takes an optional rng().

import {
  ENERGY_CRYSTAL_GAIN,
  FLASH_STUN_TTL,
  GRID_HEIGHT,
  GRID_WIDTH,
  HEALTH_FLASK_HEAL,
  USE_PICKUP_COST,
} from '../shared/constants.js'
import { manhattanDistance, positionKey, positionsEqual } from '../shared/grid.js'
import type {
  ChestItem,
  GameAction,
  MatchState,
  PlayerId,
  Position,
  ServerErrorCode,
  Status,
  Unit,
} from '../shared/types.js'

export type ValidationResult =
  | { ok: true; cost: number }
  | { ok: false; code: ServerErrorCode }

export interface PickupApplyResult {
  state: MatchState
  /** Only meaningful for chest pickups — which sub-item rolled. */
  chestItem?: ChestItem
}

function actorPreflight(state: MatchState, actorId: PlayerId): ServerErrorCode | null {
  if (state.phase !== 'active') return 'match_not_active'
  if (state.currentTurn !== actorId) return 'not_your_turn'
  return null
}

export function validateUsePickup(
  state: MatchState,
  actorId: PlayerId,
  action: Extract<GameAction, { kind: 'usePickup' }>,
): ValidationResult {
  const pre = actorPreflight(state, actorId)
  if (pre) return { ok: false, code: pre }
  const unit = state.units.find((u) => u.id === action.unitId)
  if (!unit || unit.hp <= 0) return { ok: false, code: 'unit_dead' }
  if (unit.ownerId !== actorId) return { ok: false, code: 'unit_not_owned' }
  const pickup = state.pickups.find((p) => positionsEqual(p.pos, unit.pos))
  if (!pickup) return { ok: false, code: 'bad_message' }
  const remaining = state.energy[actorId] ?? 0
  if (USE_PICKUP_COST > remaining) return { ok: false, code: 'insufficient_energy' }
  return { ok: true, cost: USE_PICKUP_COST }
}

const CHEST_ITEMS: readonly ChestItem[] = ['smoke_bomb', 'flash', 'whetstone']

export function applyUsePickup(
  state: MatchState,
  action: Extract<GameAction, { kind: 'usePickup' }>,
  cost: number,
  rng: () => number = Math.random,
): PickupApplyResult {
  const unit = state.units.find((u) => u.id === action.unitId)
  if (!unit) return { state }
  const pickup = state.pickups.find((p) => positionsEqual(p.pos, unit.pos))
  if (!pickup) return { state }

  // Remove the pickup + debit energy up front.
  const pickups = state.pickups.filter((p) => p.id !== pickup.id)
  const actorEnergy = (state.energy[unit.ownerId] ?? 0) - cost
  let working: MatchState = {
    ...state,
    pickups,
    energy: { ...state.energy, [unit.ownerId]: actorEnergy },
  }

  switch (pickup.kind) {
    case 'health_flask': {
      const newHp = Math.min(unit.maxHp, unit.hp + HEALTH_FLASK_HEAL)
      working = {
        ...working,
        units: working.units.map((u) => (u.id === unit.id ? { ...u, hp: newHp } : u)),
      }
      return { state: working }
    }
    case 'energy_crystal': {
      const next = (working.energy[unit.ownerId] ?? 0) + ENERGY_CRYSTAL_GAIN
      working = {
        ...working,
        energy: { ...working.energy, [unit.ownerId]: next },
      }
      return { state: working }
    }
    case 'scroll_of_sight': {
      // Reveal the entire 8×8 grid for one turn. Implemented as a Scout
      // reveal covering every tile.
      const tiles: Position[] = []
      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) tiles.push({ x, y })
      }
      working = {
        ...working,
        scoutReveals: [
          ...working.scoutReveals,
          {
            id: `scroll_${pickup.id}`,
            ownerId: unit.ownerId,
            tiles,
            ttl: 2,
          },
        ],
      }
      return { state: working }
    }
    case 'chest': {
      const idx = Math.min(CHEST_ITEMS.length - 1, Math.floor(rng() * CHEST_ITEMS.length))
      const rolled = CHEST_ITEMS[idx] ?? 'whetstone'
      working = applyChestItem(working, unit, rolled)
      return { state: working, chestItem: rolled }
    }
  }
}

function applyChestItem(state: MatchState, unit: Unit, item: ChestItem): MatchState {
  switch (item) {
    case 'whetstone': {
      const status: Status = { kind: 'whetstone', ttl: 2 }
      return {
        ...state,
        units: state.units.map((u) =>
          u.id === unit.id ? { ...u, statuses: [...u.statuses, status] } : u,
        ),
      }
    }
    case 'flash': {
      // Stun the closest adjacent enemy for 1 turn.
      const adj = state.units
        .filter(
          (u) =>
            u.ownerId !== unit.ownerId &&
            u.hp > 0 &&
            manhattanDistance(u.pos, unit.pos) === 1,
        )
        .sort((a, b) => {
          // Deterministic ordering: by unit id so tests don't depend on array order.
          return a.id.localeCompare(b.id)
        })
      const target = adj[0]
      if (!target) return state
      const status: Status = { kind: 'stunned', ttl: FLASH_STUN_TTL }
      return {
        ...state,
        units: state.units.map((u) =>
          u.id === target.id ? { ...u, statuses: [...u.statuses, status] } : u,
        ),
      }
    }
    case 'smoke_bomb': {
      // Drop an Ash Cloud–style overlay on the holder's tile. Single-tile
      // footprint is modeled as four copies of the same position (the
      // AshCloud.tiles type requires exactly four, and overlap is fine).
      const p = unit.pos
      return {
        ...state,
        ashClouds: [
          ...state.ashClouds,
          {
            id: `smoke_${positionKey(p)}_${String(state.turnNumber)}`,
            ownerId: unit.ownerId,
            tiles: [p, p, p, p],
            ttl: 2,
          },
        ],
      }
    }
  }
}
