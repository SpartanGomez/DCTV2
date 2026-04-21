// src/server/validators.ts
// Pure action validation. Called by the engine before mutating state.
// SPEC §19: never trust the client. SPEC §8.5: re-validate every step of a path.

import {
  ATTACK_COST,
  CLASS_STATS,
  IRON_STANCE_EXTRA_MOVE_COST,
  MOVE_COST_DEFAULT,
  MOVE_COST_DIFFICULT,
} from '../shared/constants.js'
import { isInBounds, manhattanDistance, positionKey, positionsEqual } from '../shared/grid.js'
import type {
  GameAction,
  MatchState,
  PlayerId,
  Position,
  ServerErrorCode,
  TerrainTile,
  Unit,
} from '../shared/types.js'

export type ValidationResult =
  | { ok: true; cost: number }
  | { ok: false; code: ServerErrorCode }

/** SPEC §10: cost to *enter* a tile, conditional on the departure tile. */
export function moveCostInto(from: TerrainTile, to: TerrainTile): number {
  if (to.type === 'rubble') return MOVE_COST_DIFFICULT
  if (to.type === 'high_ground' && from.type !== 'high_ground') return MOVE_COST_DIFFICULT
  return MOVE_COST_DEFAULT
}

function getTile(state: MatchState, pos: Position): TerrainTile | null {
  const row = state.grid.tiles[pos.y]
  if (!row) return null
  return row[pos.x] ?? null
}

function isOrthogonalStep(from: Position, to: Position): boolean {
  const dx = Math.abs(from.x - to.x)
  const dy = Math.abs(from.y - to.y)
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
}

function ownUnit(state: MatchState, actorId: PlayerId, id: Unit['id']): Unit | ServerErrorCode {
  const unit = state.units.find((u) => u.id === id)
  if (!unit) return 'unit_not_owned'
  if (unit.ownerId !== actorId) return 'unit_not_owned'
  if (unit.hp <= 0) return 'unit_dead'
  return unit
}

function actorPreflight(state: MatchState, actorId: PlayerId): ServerErrorCode | null {
  if (state.phase !== 'active') return 'match_not_active'
  if (state.currentTurn !== actorId) return 'not_your_turn'
  return null
}

export function validateMove(
  state: MatchState,
  actorId: PlayerId,
  action: Extract<GameAction, { kind: 'move' }>,
): ValidationResult {
  const pre = actorPreflight(state, actorId)
  if (pre) return { ok: false, code: pre }

  const unitOrErr = ownUnit(state, actorId, action.unitId)
  if (typeof unitOrErr === 'string') return { ok: false, code: unitOrErr }
  const unit = unitOrErr

  if (action.path.length === 0) return { ok: false, code: 'invalid_path' }

  const occupied = new Set<string>()
  for (const u of state.units) {
    if (u.id !== unit.id && u.hp > 0) occupied.add(positionKey(u.pos))
  }

  let prev = unit.pos
  let prevTile = getTile(state, unit.pos)
  if (!prevTile) return { ok: false, code: 'invalid_path' }

  const ironStanceTax = unit.statuses.some((s) => s.kind === 'iron_stance')
    ? IRON_STANCE_EXTRA_MOVE_COST
    : 0
  let totalCost = 0
  for (const step of action.path) {
    if (!isInBounds(step)) return { ok: false, code: 'invalid_path' }
    if (!isOrthogonalStep(prev, step)) return { ok: false, code: 'invalid_path' }
    const tile = getTile(state, step)
    if (!tile) return { ok: false, code: 'invalid_path' }
    if (tile.type === 'pillar' || tile.type === 'wall') {
      return { ok: false, code: 'tile_impassable' }
    }
    if (occupied.has(positionKey(step))) return { ok: false, code: 'tile_occupied' }
    totalCost += moveCostInto(prevTile, tile) + ironStanceTax
    prev = step
    prevTile = tile
  }

  const remaining = state.energy[actorId] ?? 0
  if (totalCost > remaining) return { ok: false, code: 'insufficient_energy' }

  // No-op guard: path that returns to the starting tile is invalid.
  if (positionsEqual(prev, unit.pos)) return { ok: false, code: 'invalid_path' }

  return { ok: true, cost: totalCost }
}

export function validateEndTurn(
  state: MatchState,
  actorId: PlayerId,
): ValidationResult {
  const pre = actorPreflight(state, actorId)
  if (pre) return { ok: false, code: pre }
  return { ok: true, cost: 0 }
}

export function validateScout(
  state: MatchState,
  actorId: PlayerId,
  action: Extract<GameAction, { kind: 'scout' }>,
): ValidationResult {
  const pre = actorPreflight(state, actorId)
  if (pre) return { ok: false, code: pre }
  const remaining = state.energy[actorId] ?? 0
  if (remaining < 1) return { ok: false, code: 'insufficient_energy' }
  if (!isInBounds(action.center)) return { ok: false, code: 'invalid_path' }
  return { ok: true, cost: 1 }
}

export function validateAttack(
  state: MatchState,
  actorId: PlayerId,
  action: Extract<GameAction, { kind: 'attack' }>,
): ValidationResult {
  const pre = actorPreflight(state, actorId)
  if (pre) return { ok: false, code: pre }

  const unitOrErr = ownUnit(state, actorId, action.unitId)
  if (typeof unitOrErr === 'string') return { ok: false, code: unitOrErr }
  const attacker = unitOrErr

  const target = state.units.find((u) => u.id === action.targetId)
  if (!target || target.hp <= 0) return { ok: false, code: 'unit_dead' }
  if (target.ownerId === actorId) return { ok: false, code: 'bad_message' }

  const remaining = state.energy[actorId] ?? 0
  if (ATTACK_COST > remaining) return { ok: false, code: 'insufficient_energy' }

  const dist = manhattanDistance(attacker.pos, target.pos)
  const range = CLASS_STATS[attacker.classId].attackRange
  if (dist > range) return { ok: false, code: 'out_of_range' }

  // Shadow tile conceals the occupant from direct single-target attacks
  // (SPEC §10). Area effects ignore this — we'll implement those at M5+.
  const targetTile = state.grid.tiles[target.pos.y]?.[target.pos.x]
  if (targetTile?.type === 'shadow') return { ok: false, code: 'target_untargetable' }

  // LoS check for ranged classes. Until M7 pillars/walls are placed on
  // real arenas, the stone grid has no LoS blockers and this always
  // passes. When arenas land, add the Bresenham check in grid.ts.
  // (SPEC §8.5: LoS is required for ranged attacks; melee is unconditional.)

  return { ok: true, cost: ATTACK_COST }
}
