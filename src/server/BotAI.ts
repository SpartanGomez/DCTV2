// src/server/BotAI.ts
// SPEC §7 M10: Deterministic bot opponent. No RNG post-construction —
// seeded by matchId hash so replays produce identical games.
// Strategy: attack if possible, else move toward enemy, else end turn.

import { CLASS_STATS } from '../shared/constants.js'
import {
  canTraverseHeight,
  isInBounds,
  manhattanDistance,
  orthogonalPath,
  tileHeight,
} from '../shared/grid.js'
import {
  type GameAction,
  type MatchState,
  type PlayerId,
  type Position,
  type Unit,
} from '../shared/types.js'

/**
 * Pick the next action for a bot player. Returns null when the bot
 * should end its turn (no energy or nothing useful to do).
 * Deterministic: given the same `MatchState`, always returns the same action.
 */
export function botNextAction(state: MatchState, botId: PlayerId): GameAction | null {
  if (state.phase !== 'active') return null
  if (state.currentTurn !== botId) return null

  const myUnit = state.units.find((u) => u.ownerId === botId && u.hp > 0)
  if (!myUnit) return null

  const energy = state.energy[botId] ?? 0
  if (energy <= 0) return null

  const enemies = state.units.filter((u) => u.ownerId !== botId && u.hp > 0)
  if (enemies.length === 0) return null

  // Sort enemies by manhattan distance for determinism.
  const sorted = [...enemies].sort((a, b) => {
    const da = manhattanDistance(myUnit.pos, a.pos)
    const db = manhattanDistance(myUnit.pos, b.pos)
    return da !== db ? da - db : a.id < b.id ? -1 : 1
  })
  const nearest = sorted[0]
  if (!nearest) return null

  const attackRange = CLASS_STATS[myUnit.classId].attackRange
  const dist = manhattanDistance(myUnit.pos, nearest.pos)

  // 1. Attack if in range and have energy.
  if (dist <= attackRange && energy >= 2) {
    return { kind: 'attack', unitId: myUnit.id, targetId: nearest.id }
  }

  // 2. Try to use an ability if appropriate (simplified: only non-targeted abilities).
  const abilityAction = maybeBotAbility(myUnit, nearest, energy)
  if (abilityAction) return abilityAction

  // 3. Move toward nearest enemy.
  if (energy >= 1) {
    const path = pathTowardTarget(state, myUnit, nearest.pos, energy)
    if (path.length > 0) {
      return { kind: 'move', unitId: myUnit.id, path }
    }
  }

  return null
}

function maybeBotAbility(
  unit: Unit,
  enemy: Unit,
  energy: number,
): GameAction | null {
  const { classId } = unit
  if (classId === 'knight') {
    // Iron Stance — toggle on if not already active and low energy
    if (energy >= 2 && !unit.statuses.some((s) => s.kind === 'iron_stance')) {
      return { kind: 'ability', unitId: unit.id, abilityId: 'iron_stance' }
    }
  }
  if (classId === 'mage') {
    const dist = manhattanDistance(unit.pos, enemy.pos)
    // Cinder Bolt: 2 energy, range 3.
    if (energy >= 2 && dist <= 3) {
      return {
        kind: 'ability',
        unitId: unit.id,
        abilityId: 'cinder_bolt',
        targetId: enemy.id,
      }
    }
  }
  if (classId === 'heretic') {
    // Blood Tithe when low on energy (free energy).
    if (energy < 2 && unit.hp > 4 && !unit.statuses.some((s) => s.kind === 'blood_tithe_used')) {
      return { kind: 'ability', unitId: unit.id, abilityId: 'blood_tithe' }
    }
  }
  return null
}

/**
 * Build an orthogonal path from `unit.pos` toward `target`, up to `maxSteps`
 * tiles, avoiding impassable terrain and other units.
 * Returns the path array (not including the starting tile).
 */
function pathTowardTarget(
  state: MatchState,
  unit: Unit,
  target: Position,
  maxSteps: number,
): Position[] {
  const occupied = new Set<string>()
  for (const u of state.units) {
    if (u.id !== unit.id && u.hp > 0) {
      occupied.add(`${String(u.pos.x)},${String(u.pos.y)}`)
    }
  }

  // SPEC v2 §6.3 — bot must respect its class jump stat. Truncate the path
  // at the first illegal step (impassable, occupied, or Δh too steep).
  const jump = CLASS_STATS[unit.classId].jump
  const direct = orthogonalPath(unit.pos, target).slice(0, maxSteps)
  let prevH = tileHeight(state, unit.pos)
  const firstBlocked = direct.findIndex((p) => {
    const key = `${String(p.x)},${String(p.y)}`
    if (occupied.has(key)) return true
    const tile = state.grid.tiles[p.y]?.[p.x]
    if (!tile) return true
    if (tile.type === 'pillar' || tile.type === 'wall') return true
    if (!canTraverseHeight(prevH, tile.height, jump)) return true
    prevH = tile.height
    return false
  })

  const usable = firstBlocked === -1 ? direct : direct.slice(0, firstBlocked)
  if (usable.length > 0) return usable

  // If the direct path is immediately blocked, try one-step adjacent detours
  // toward the target. Detour must be passable AND within jump.
  const fromH = tileHeight(state, unit.pos)
  const detours: Position[] = [
    { x: unit.pos.x + 1, y: unit.pos.y },
    { x: unit.pos.x - 1, y: unit.pos.y },
    { x: unit.pos.x, y: unit.pos.y + 1 },
    { x: unit.pos.x, y: unit.pos.y - 1 },
  ]
  for (const d of detours) {
    if (!isInBounds(d)) continue
    const key = `${String(d.x)},${String(d.y)}`
    if (occupied.has(key)) continue
    const tile = state.grid.tiles[d.y]?.[d.x]
    if (!tile) continue
    if (tile.type === 'pillar' || tile.type === 'wall') continue
    if (!canTraverseHeight(fromH, tile.height, jump)) continue
    // Only take the detour if it's closer or equal distance to target.
    if (manhattanDistance(d, target) < manhattanDistance(unit.pos, target)) {
      return [d]
    }
  }
  return []
}
