// src/shared/grid.ts
// SPEC v2 §6 — one canonical copy of every grid helper. Used by both server and client.
// Includes the 3D-aware LoS + height rules (v2 M7.5).

import { CLASS_STATS, DEFAULT_TILE_HEIGHT, GRID_HEIGHT, GRID_WIDTH } from './constants.js'
import type { Facing, MatchState, PlayerId, Position } from './types.js'

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
 * Bresenham line between two grid tiles, inclusive of both endpoints.
 * Used by LoS + fog-of-war vision. Returns the sequence of cells the
 * line crosses, in order.
 */
export function bresenhamLine(from: Position, to: Position): Position[] {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const sx = from.x < to.x ? 1 : -1
  const sy = from.y < to.y ? 1 : -1
  let err = dx - dy
  let x = from.x
  let y = from.y
  const cells: Position[] = [{ x, y }]
  while (x !== to.x || y !== to.y) {
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
    cells.push({ x, y })
  }
  return cells
}

/**
 * The set of tiles a given viewer can see in `state`. SPEC v2 §6.4:
 *   - each owned unit reveals tiles within its class sightRange (Manhattan)
 *     that have unblocked LoS from the unit's tile
 *   - active Scout reveals add to the set (LoS-ignoring)
 *   - LoS is 3D-aware (SPEC v2 §6.3): heights, pillars, walls, ash-clouds
 *     all participate in the per-column blocking-height map
 *
 * Server (pre-broadcast filter) and client (fog overlay) use this.
 */
export function computeVisibleTiles(state: MatchState, viewer: PlayerId): Set<string> {
  const visible = new Set<string>()
  const heights = visionBlockerHeights(state)

  for (const unit of state.units) {
    if (unit.ownerId !== viewer || unit.hp <= 0) continue
    const range = CLASS_STATS[unit.classId].sightRange
    const fromH = tileHeight(state, unit.pos)
    visible.add(positionKey(unit.pos))
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx === 0 && dy === 0) continue
        if (Math.abs(dx) + Math.abs(dy) > range) continue
        const p: Position = { x: unit.pos.x + dx, y: unit.pos.y + dy }
        if (!isInBounds(p)) continue
        const toH = tileHeight(state, p)
        if (!lineOfSight3D(unit.pos, fromH, p, toH, heights)) continue
        visible.add(positionKey(p))
      }
    }
  }

  for (const reveal of state.scoutReveals) {
    if (reveal.ownerId !== viewer) continue
    for (const t of reveal.tiles) {
      if (isInBounds(t)) visible.add(positionKey(t))
    }
  }

  return visible
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

// ============================================================
// SPEC v2 — 3D terrain helpers (M7.5)
// ============================================================

/**
 * SPEC v2 §6.3 — resolve a tile's stack height, defaulting when absent.
 * Tiles are expected to always carry `height` post-M7.5, but this helper
 * tolerates undefined for transitional callers.
 */
export function tileHeight(state: MatchState, pos: Position): number {
  const row = state.grid.tiles[pos.y]
  if (!row) return DEFAULT_TILE_HEIGHT
  const t = row[pos.x]
  if (!t) return DEFAULT_TILE_HEIGHT
  return t.height
}

/**
 * SPEC v2 §6.3 — can a unit with `jump` stat traverse `fromH` → `toH` in one
 * step? `|Δh| ≤ 1` is free; anything greater requires `jump ≥ |Δh|`.
 */
export function canTraverseHeight(fromH: number, toH: number, jump: number): boolean {
  const dh = Math.abs(toH - fromH)
  if (dh <= 1) return true
  return jump >= dh
}

/**
 * SPEC v2 §6.3, §6.5 — build an effective-blocking-height map for every column.
 * Used by `lineOfSight3D`. Pillar/wall contribute `Infinity` regardless of
 * stack height (they're walls, not step-ups). Ash Cloud footprints also
 * contribute `Infinity`. Everything else contributes its `Tile.height`.
 *
 * Position key format: same as `positionKey` (e.g. "3,5").
 */
export function visionBlockerHeights(state: MatchState): Map<string, number> {
  const heights = new Map<string, number>()
  for (let y = 0; y < state.grid.tiles.length; y++) {
    const row = state.grid.tiles[y]
    if (!row) continue
    for (let x = 0; x < row.length; x++) {
      const t = row[x]
      if (!t) continue
      if (t.type === 'pillar' || t.type === 'wall') {
        heights.set(positionKey({ x, y }), Number.POSITIVE_INFINITY)
      } else {
        heights.set(positionKey({ x, y }), t.height)
      }
    }
  }
  for (const ac of state.ashClouds) {
    for (const t of ac.tiles) heights.set(positionKey(t), Number.POSITIVE_INFINITY)
  }
  return heights
}

/**
 * SPEC v2 §5.5 / §6.3 — 3D-aware line of sight. Draws the Bresenham cell line
 * from `from` → `to` and checks each intermediate column. An intermediate cell
 * blocks the line iff its effective blocking height (from `heights`) is
 * strictly greater than the line's height as it passes over that column.
 *
 * Line height interpolates linearly between `fromH` and `toH` at the fractional
 * position of each cell along the line. Endpoints never block (a unit standing
 * on a pillar — not a real case, but defensively — still "sees out" of its
 * own tile).
 *
 * Grazing the top of an obstruction (line height equals obstruction height)
 * does NOT block. "Strictly greater than" is the threshold.
 *
 * `heights` is typically built via `visionBlockerHeights(state)`; callers may
 * substitute a custom map for unit tests or fog filtering.
 */
export function lineOfSight3D(
  from: Position,
  fromH: number,
  to: Position,
  toH: number,
  heights: ReadonlyMap<string, number>,
): boolean {
  const cells = bresenhamLine(from, to)
  if (cells.length <= 2) return true // adjacent or same cell — no intermediates
  const denom = cells.length - 1
  for (let i = 1; i < cells.length - 1; i++) {
    const cell = cells[i]
    if (!cell) continue
    const t = i / denom
    const lineZ = fromH + (toH - fromH) * t
    const colH = heights.get(positionKey(cell)) ?? DEFAULT_TILE_HEIGHT
    if (colH > lineZ) return false
  }
  return true
}

// ============================================================
// SPEC v2 §6.6 — Facing
// ============================================================

/**
 * Compute the cardinal facing `from` should assume to face toward `to`.
 * Uses the dominant axis: if `|dx| >= |dy|` → east/west; else → north/south.
 * If `from` and `to` are identical, returns 'S' (arbitrary stable default).
 *
 * Y-axis convention: `+y` is south (matches the iso grid origin at top-left of
 * the diamond). `-y` is north.
 */
export function facingToward(from: Position, to: Position): Facing {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return 'S'
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'E' : 'W'
  }
  return dy > 0 ? 'S' : 'N'
}
