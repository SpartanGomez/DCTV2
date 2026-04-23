// tests/unit/arenas.test.ts
// SPEC §8.3 + §6.3 (v2) + §12 (M11 DoD) — every arena def must be well-shaped
// and at least a majority must carry v2 height data so matches "play
// distinctly" across a tournament's arena rotation. The unit layer verifies
// arena data; the smoke layer verifies one pit arena end-to-end.

import { describe, expect, it } from 'vitest'
import { GRID_HEIGHT, GRID_WIDTH } from '../../src/shared/constants.js'
import { bridge } from '../../src/server/arenas/bridge.js'
import { maze } from '../../src/server/arenas/maze.js'
import { pit } from '../../src/server/arenas/pit.js'
import { ruins } from '../../src/server/arenas/ruins.js'
import { shrine } from '../../src/server/arenas/shrine.js'
import type { ArenaDef } from '../../src/shared/types.js'

const ALL: readonly ArenaDef[] = [pit, ruins, bridge, shrine, maze]

describe('arena defs', () => {
  it.each(ALL.map((a) => [a.slug, a]))('%s: 8x8 tile grid', (_slug, arena) => {
    expect(arena.tiles.length).toBe(GRID_HEIGHT)
    for (const row of arena.tiles) expect(row.length).toBe(GRID_WIDTH)
  })

  it.each(ALL.map((a) => [a.slug, a]))(
    '%s: spawns + pickup slots in bounds',
    (_slug, arena) => {
      for (const s of arena.spawns) {
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.x).toBeLessThan(GRID_WIDTH)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeLessThan(GRID_HEIGHT)
      }
      for (const p of arena.pickupSlots) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThan(GRID_WIDTH)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThan(GRID_HEIGHT)
      }
    },
  )

  it.each(ALL.map((a) => [a.slug, a]))(
    '%s: heights table (if present) matches tile shape and is non-negative',
    (_slug, arena) => {
      if (!arena.heights) return
      expect(arena.heights.length).toBe(GRID_HEIGHT)
      for (const row of arena.heights) {
        expect(row.length).toBe(GRID_WIDTH)
        for (const h of row) {
          expect(Number.isInteger(h)).toBe(true)
          expect(h).toBeGreaterThanOrEqual(0)
        }
      }
    },
  )

  it.each(ALL.map((a) => [a.slug, a]))(
    '%s: every spawn tile has an orthogonal neighbor the Knight (jump 2) can step onto',
    (_slug, arena) => {
      for (const s of arena.spawns) {
        const sh = arena.heights?.[s.y]?.[s.x] ?? 1
        const neighbors: Array<{ x: number; y: number }> = [
          { x: s.x + 1, y: s.y },
          { x: s.x - 1, y: s.y },
          { x: s.x, y: s.y + 1 },
          { x: s.x, y: s.y - 1 },
        ]
        const reachable = neighbors.some((n) => {
          if (n.x < 0 || n.x >= GRID_WIDTH || n.y < 0 || n.y >= GRID_HEIGHT) return false
          const t = arena.tiles[n.y]?.[n.x]
          if (!t) return false
          if (t === 'pillar' || t === 'wall') return false
          if (t === 'hazard_void') return false
          const nh = arena.heights?.[n.y]?.[n.x] ?? 1
          const dh = Math.abs(nh - sh)
          return dh <= 2 // Knight jump
        })
        expect(reachable).toBe(true)
      }
    },
  )
})

describe('M11 — arena rotation variety', () => {
  it('at least 3 of 5 arenas author a v2 heights table', () => {
    const withHeights = ALL.filter((a) => a.heights !== undefined).length
    expect(withHeights).toBeGreaterThanOrEqual(3)
  })

  it('the 5 arenas have distinct slugs and names', () => {
    const slugs = new Set(ALL.map((a) => a.slug))
    const names = new Set(ALL.map((a) => a.name))
    expect(slugs.size).toBe(ALL.length)
    expect(names.size).toBe(ALL.length)
  })
})
