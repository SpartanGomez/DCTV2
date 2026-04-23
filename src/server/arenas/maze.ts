// The Maze — winding paths with shadow tiles. Information warfare. Heretic's home.
// SPEC v2 §6.3 — intentionally flat (all height 1). The maze's identity is
// LoS-driven (shadow + pillars); height would muddy that. Other arenas supply
// the vertical play, so M11 "each plays distinctly" is preserved.
import type { ArenaDef } from '../../shared/types.js'

export const maze: ArenaDef = {
  slug: 'maze',
  name: 'The Maze',
  tiles: [
    // y=0
    ['stone','pillar','shadow','stone','stone','shadow','pillar','stone'],
    // y=1
    ['stone','stone','stone','pillar','pillar','stone','stone','stone'],
    // y=2
    ['shadow','stone','pillar','stone','stone','pillar','stone','shadow'],
    // y=3
    ['stone','stone','stone','shadow','shadow','stone','stone','stone'],
    // y=4
    ['stone','shadow','stone','stone','stone','stone','shadow','stone'],
    // y=5
    ['shadow','stone','pillar','stone','stone','pillar','stone','shadow'],
    // y=6
    ['stone','stone','stone','pillar','pillar','stone','stone','stone'],
    // y=7
    ['stone','pillar','shadow','stone','stone','shadow','pillar','stone'],
  ],
  spawns: [{ x: 0, y: 3 }, { x: 7, y: 4 }],
  pickupSlots: [
    { x: 2, y: 0 },
    { x: 5, y: 7 },
    { x: 0, y: 6 },
    { x: 7, y: 1 },
  ],
}
