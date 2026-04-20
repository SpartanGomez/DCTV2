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
