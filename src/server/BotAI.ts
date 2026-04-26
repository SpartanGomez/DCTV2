// src/server/BotAI.ts
// SPEC §8.7 — Deterministic bot opponent. No RNG post-construction —
// seeded by matchId hash so replays produce identical games.
//
// Decision tree (per turn, looped while energy > 0):
//   1. attack if enemy in range AND has line-of-sight (for ranged classes)
//   2. retreat if own HP < 30 % AND a safer tile exists
//   3. use a class ability if the situation matches
//   4. move toward nearest enemy
//   5. opportunistic detour toward a pickup within 3 tiles
//   6. end turn

import { CLASS_STATS } from '../shared/constants.js'
import {
  canTraverseHeight,
  isInBounds,
  lineOfSight3D,
  manhattanDistance,
  orthogonalPath,
  tileHeight,
  visionBlockerHeights,
} from '../shared/grid.js'
import {
  type GameAction,
  type MatchState,
  type PlayerId,
  type Position,
  type Unit,
} from '../shared/types.js'

/** SPEC §8.7 — retreat threshold. Bot bails when at or below 30 % HP. */
const RETREAT_HP_FRACTION = 0.3
/** SPEC §8.7 — pickup-seeking distance ceiling. */
const PICKUP_SEEK_RANGE = 3

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

  const stats = CLASS_STATS[myUnit.classId]
  const attackRange = stats.attackRange
  const dist = manhattanDistance(myUnit.pos, nearest.pos)
  const inRange = dist <= attackRange
  const hasShot = inRange && (!stats.requiresLoS || hasShotOn(state, myUnit, nearest))

  // 1. Attack if in range, have energy, and (for ranged) have line-of-sight.
  //    Skipping the LoS gate for ranged classes used to make the bot waste
  //    its turn smashing rejected attacks against pillars.
  if (hasShot && energy >= 2) {
    return { kind: 'attack', unitId: myUnit.id, targetId: nearest.id }
  }

  // 2. Retreat if HP is critical. The bot won't simply trade itself dead —
  //    it backs off until healed (Heretic's blood_tithe / pickup) or finished.
  const retreatThreshold = Math.max(1, Math.floor(stats.hp * RETREAT_HP_FRACTION))
  if (myUnit.hp <= retreatThreshold && energy >= 1) {
    const retreat = pathAwayFrom(state, myUnit, nearest.pos, energy)
    if (retreat.length > 0) {
      return { kind: 'move', unitId: myUnit.id, path: retreat }
    }
  }

  // 3. Try to use an ability if appropriate (simplified: only non-targeted abilities).
  const abilityAction = maybeBotAbility(myUnit, nearest, energy)
  if (abilityAction) return abilityAction

  // 4. Move toward nearest enemy.
  if (energy >= 1) {
    const path = pathTowardTarget(state, myUnit, nearest.pos, energy)
    if (path.length > 0) {
      return { kind: 'move', unitId: myUnit.id, path }
    }
  }

  // 5. Opportunistic pickup detour. Lower priority than engagement so bots
  //    don't waste turns hunting consumables when they should be fighting,
  //    but a free Health Flask en route is too valuable to ignore.
  if (energy >= 1) {
    const pickupPath = pathTowardNearestPickup(state, myUnit, energy)
    if (pickupPath.length > 0) {
      return { kind: 'move', unitId: myUnit.id, path: pickupPath }
    }
  }

  return null
}

/** True if the bot has an unobstructed 3D line to its target this turn. */
function hasShotOn(state: MatchState, attacker: Unit, target: Unit): boolean {
  const blockers = visionBlockerHeights(state)
  const fromH = tileHeight(state, attacker.pos)
  const toH = tileHeight(state, target.pos)
  return lineOfSight3D(attacker.pos, fromH, target.pos, toH, blockers)
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

/**
 * Pick a single retreat step that maximises distance from `threat`. Greedy
 * one-tile move — bots aren't path-planners, just self-preserving. Falls
 * back to "no retreat possible" when fully cornered.
 */
function pathAwayFrom(
  state: MatchState,
  unit: Unit,
  threat: Position,
  maxSteps: number,
): Position[] {
  if (maxSteps <= 0) return []
  const occupied = new Set<string>()
  for (const u of state.units) {
    if (u.id !== unit.id && u.hp > 0) {
      occupied.add(`${String(u.pos.x)},${String(u.pos.y)}`)
    }
  }
  const jump = CLASS_STATS[unit.classId].jump
  const fromH = tileHeight(state, unit.pos)
  const candidates: Position[] = [
    { x: unit.pos.x + 1, y: unit.pos.y },
    { x: unit.pos.x - 1, y: unit.pos.y },
    { x: unit.pos.x, y: unit.pos.y + 1 },
    { x: unit.pos.x, y: unit.pos.y - 1 },
  ]
  let best: Position | null = null
  let bestDist = manhattanDistance(unit.pos, threat)
  // Deterministic order: prefer +x, then -x, +y, -y. Already iterates that way.
  for (const c of candidates) {
    if (!isInBounds(c)) continue
    const key = `${String(c.x)},${String(c.y)}`
    if (occupied.has(key)) continue
    const tile = state.grid.tiles[c.y]?.[c.x]
    if (!tile) continue
    if (tile.type === 'pillar' || tile.type === 'wall') continue
    if (!canTraverseHeight(fromH, tile.height, jump)) continue
    const d = manhattanDistance(c, threat)
    if (d > bestDist) {
      best = c
      bestDist = d
    }
  }
  return best ? [best] : []
}

/**
 * SPEC §8.7 step 5 — opportunistic pickup grab. Returns a path toward the
 * nearest pickup within `PICKUP_SEEK_RANGE` tiles and reachable within
 * `maxSteps`. Empty path means "no good detour"; the caller falls through.
 */
function pathTowardNearestPickup(
  state: MatchState,
  unit: Unit,
  maxSteps: number,
): Position[] {
  if (state.pickups.length === 0) return []
  const candidates = [...state.pickups]
    .map((p) => ({ pos: p.pos, d: manhattanDistance(unit.pos, p.pos) }))
    .filter((p) => p.d > 0 && p.d <= PICKUP_SEEK_RANGE)
    .sort((a, b) => (a.d !== b.d ? a.d - b.d : a.pos.x - b.pos.x || a.pos.y - b.pos.y))
  const target = candidates[0]
  if (!target) return []
  return pathTowardTarget(state, unit, target.pos, maxSteps)
}
