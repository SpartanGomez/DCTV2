// tests/unit/grid-3d.test.ts
// SPEC v2 §6.3 / §6.6 — unit tests for the 3D-aware grid helpers introduced
// in M7.5: height traversal, 3D LoS interpolation, blocker-height map, and
// the 4-way facing computation.

import { describe, expect, it } from 'vitest'
import {
  canTraverseHeight,
  DEFAULT_TILE_HEIGHT,
  facingToward,
  lineOfSight3D,
  positionKey,
  visionBlockerHeights,
} from '../../src/shared/index.js'
import type { AshCloud, MatchState, Position, TerrainTile } from '../../src/shared/index.js'

function flatGrid(height = DEFAULT_TILE_HEIGHT): TerrainTile[][] {
  const tiles: TerrainTile[][] = []
  for (let y = 0; y < 8; y++) {
    const row: TerrainTile[] = []
    for (let x = 0; x < 8; x++) row.push({ type: 'stone', height })
    tiles.push(row)
  }
  return tiles
}

function emptyState(tiles: TerrainTile[][], ashClouds: AshCloud[] = []): MatchState {
  // Partial MatchState — the 3D helpers only read grid + ashClouds.
  return {
    grid: { width: 8, height: 8, tiles },
    ashClouds,
  } as unknown as MatchState
}

describe('canTraverseHeight', () => {
  it('allows free travel within |Δh| ≤ 1', () => {
    expect(canTraverseHeight(1, 1, 2)).toBe(true)
    expect(canTraverseHeight(1, 2, 2)).toBe(true)
    expect(canTraverseHeight(3, 2, 2)).toBe(true)
    expect(canTraverseHeight(5, 4, 2)).toBe(true)
  })

  it('requires jump ≥ |Δh| when the delta exceeds 1', () => {
    expect(canTraverseHeight(1, 3, 2)).toBe(true)  // jump 2 covers Δ2
    expect(canTraverseHeight(1, 4, 2)).toBe(false) // jump 2 fails Δ3
    expect(canTraverseHeight(1, 4, 3)).toBe(true)  // jump 3 covers Δ3
  })

  it('is symmetric up vs down', () => {
    expect(canTraverseHeight(3, 0, 2)).toBe(false)
    expect(canTraverseHeight(0, 3, 2)).toBe(false)
    expect(canTraverseHeight(3, 0, 3)).toBe(true)
    expect(canTraverseHeight(0, 3, 3)).toBe(true)
  })

  it('knight (jump 2) cannot climb a 3-stack from floor', () => {
    expect(canTraverseHeight(1, 3, 2)).toBe(true)   // Δ2 is ok
    expect(canTraverseHeight(1, 4, 2)).toBe(false)  // Δ3 requires jump 3
  })

  it('mage / heretic (jump 3) can climb a 4-stack from floor', () => {
    expect(canTraverseHeight(1, 4, 3)).toBe(true)
    expect(canTraverseHeight(1, 5, 3)).toBe(false)  // Δ4 requires jump 4
  })
})

describe('visionBlockerHeights', () => {
  it('maps every tile to its stack height on a flat grid', () => {
    const state = emptyState(flatGrid(1))
    const heights = visionBlockerHeights(state)
    expect(heights.size).toBe(64)
    expect(heights.get(positionKey({ x: 3, y: 5 }))).toBe(1)
  })

  it('treats pillars and walls as infinite blockers regardless of stack', () => {
    const tiles = flatGrid(1)
    // Put a pillar at (2, 2) with stack height 1; should still block as Infinity.
    const row = tiles[2]
    if (!row) throw new Error('row missing')
    row[2] = { type: 'pillar', height: 1 }
    row[5] = { type: 'wall', height: 3 } // height shouldn't matter
    const heights = visionBlockerHeights(emptyState(tiles))
    expect(heights.get(positionKey({ x: 2, y: 2 }))).toBe(Number.POSITIVE_INFINITY)
    expect(heights.get(positionKey({ x: 5, y: 2 }))).toBe(Number.POSITIVE_INFINITY)
  })

  it('overlays ash clouds as infinite blockers', () => {
    const tiles = flatGrid(1)
    const ac: AshCloud = {
      id: 'ac1',
      ownerId: 'p1' as never,
      tiles: [
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
      ],
      ttl: 2,
    }
    const heights = visionBlockerHeights(emptyState(tiles, [ac]))
    expect(heights.get(positionKey({ x: 3, y: 3 }))).toBe(Number.POSITIVE_INFINITY)
    expect(heights.get(positionKey({ x: 4, y: 4 }))).toBe(Number.POSITIVE_INFINITY)
    // Non-cloud tile retains its stack height.
    expect(heights.get(positionKey({ x: 0, y: 0 }))).toBe(1)
  })
})

describe('lineOfSight3D', () => {
  const from: Position = { x: 0, y: 0 }
  const to: Position = { x: 4, y: 0 } // horizontal line, 3 intermediate cells

  function flatHeights(h = 1): Map<string, number> {
    const m = new Map<string, number>()
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) m.set(positionKey({ x, y }), h)
    }
    return m
  }

  it('clears on fully flat terrain', () => {
    expect(lineOfSight3D(from, 1, to, 1, flatHeights(1))).toBe(true)
  })

  it('is trivially true when from === to', () => {
    expect(lineOfSight3D(from, 1, from, 1, flatHeights(1))).toBe(true)
  })

  it('is trivially true when from and to are adjacent (no intermediate)', () => {
    expect(lineOfSight3D(from, 1, { x: 1, y: 0 }, 1, flatHeights(1))).toBe(true)
  })

  it('blocks when an intermediate column is taller than the line', () => {
    const m = flatHeights(1)
    m.set(positionKey({ x: 2, y: 0 }), 3) // tall stack in the middle
    expect(lineOfSight3D(from, 1, to, 1, m)).toBe(false)
  })

  it('clears when both endpoints are high enough to shoot over a mid-stack', () => {
    const m = flatHeights(1)
    m.set(positionKey({ x: 2, y: 0 }), 2) // stack of 2 in middle
    // Shooter at height 3, target at height 3 — line height at x=2 is 3; 2 < 3 → clears.
    expect(lineOfSight3D(from, 3, to, 3, m)).toBe(true)
  })

  it('grazing (line height == column top) does NOT block', () => {
    const m = flatHeights(1)
    m.set(positionKey({ x: 2, y: 0 }), 2)
    // Both endpoints height 2 → line height 2 at x=2. Column 2 not > line 2 → clears.
    expect(lineOfSight3D(from, 2, to, 2, m)).toBe(true)
  })

  it('diagonal lines interpolate height along the Bresenham path', () => {
    const m = flatHeights(1)
    m.set(positionKey({ x: 2, y: 2 }), 5) // big stack at midpoint
    // Line from (0,0)@1 → (4,4)@1, midpoint at x=2,y=2 has line height 1; 5 > 1 → blocks.
    expect(lineOfSight3D({ x: 0, y: 0 }, 1, { x: 4, y: 4 }, 1, m)).toBe(false)
    // Attacker on a huge stack, target on a huge stack — shoots over.
    expect(lineOfSight3D({ x: 0, y: 0 }, 10, { x: 4, y: 4 }, 10, m)).toBe(true)
  })

  it('pillars (Infinity) block even when the line is very high', () => {
    const m = flatHeights(1)
    m.set(positionKey({ x: 2, y: 0 }), Number.POSITIVE_INFINITY) // pillar
    expect(lineOfSight3D(from, 100, to, 100, m)).toBe(false)
  })
})

describe('facingToward', () => {
  it('picks the dominant axis', () => {
    expect(facingToward({ x: 0, y: 0 }, { x: 5, y: 1 })).toBe('E')
    expect(facingToward({ x: 5, y: 1 }, { x: 0, y: 0 })).toBe('W')
    expect(facingToward({ x: 0, y: 0 }, { x: 1, y: 5 })).toBe('S')
    expect(facingToward({ x: 1, y: 5 }, { x: 0, y: 0 })).toBe('N')
  })

  it('ties break to east/west (|dx| >= |dy|)', () => {
    expect(facingToward({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe('E')
    expect(facingToward({ x: 3, y: 3 }, { x: 0, y: 0 })).toBe('W')
  })

  it('returns S as a stable default when positions are identical', () => {
    expect(facingToward({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe('S')
  })

  it('mirrored spawns face each other', () => {
    // SPEC-canonical fallback spawns: A at (1,4), B at (6,3).
    const a: Position = { x: 1, y: 4 }
    const b: Position = { x: 6, y: 3 }
    expect(facingToward(a, b)).toBe('E')
    expect(facingToward(b, a)).toBe('W')
  })
})
