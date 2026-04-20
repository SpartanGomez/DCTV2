// src/shared/grid.ts
// SPEC §6 — one canonical copy of every grid helper. Used by both server and client.
// lineOfSight arrives in its own PR when a consumer (M3 attack range / M6 fog) needs it.

import { GRID_HEIGHT, GRID_WIDTH } from './constants.js'
import type { Position } from './types.js'

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function isInBounds(pos: Position): boolean {
  return pos.x >= 0 && pos.x < GRID_WIDTH && pos.y >= 0 && pos.y < GRID_HEIGHT
}

export function positionKey(pos: Position): string {
  return `${String(pos.x)},${String(pos.y)}`
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

/**
 * Orthogonal L-shaped path from `from` to `to`: move along x first, then y.
 * Returns the sequence of tiles walked (not including `from`). Open-grid
 * version — callers must re-validate against terrain + occupancy. M7 replaces
 * this with an A* respecting difficult terrain and impassable tiles.
 */
export function orthogonalPath(from: Position, to: Position): Position[] {
  const path: Position[] = []
  let x = from.x
  let y = from.y
  const sx = Math.sign(to.x - x)
  while (x !== to.x) {
    x += sx
    path.push({ x, y })
  }
  const sy = Math.sign(to.y - y)
  while (y !== to.y) {
    y += sy
    path.push({ x, y })
  }
  return path
}
