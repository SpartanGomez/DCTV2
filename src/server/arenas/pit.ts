// The Pit — open center, high ground rings the edges. Favors ranged.
// SPEC v2 §6.3 — perimeter `high_ground` tiles also stack to height 4 so the
// outer ring is a true ledge: Knight (jump 2) cannot scale it from the interior
// (Δh = 3), Mage (jump 3) can. Interior stays at default height 1.
import type { ArenaDef } from '../../shared/types.js'

export const pit: ArenaDef = {
  slug: 'pit',
  name: 'The Pit',
  tiles: [
    // y=0
    ['high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground'],
    // y=1
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    // y=2
    ['high_ground','stone','rubble','stone','stone','rubble','stone','high_ground'],
    // y=3
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    // y=4
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    // y=5
    ['high_ground','stone','rubble','stone','stone','rubble','stone','high_ground'],
    // y=6
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    // y=7
    ['high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground'],
  ],
  // Perimeter ring (every `high_ground` tile) is height 4. Interior stones and
  // rubbles default to 1. This makes the perimeter a true ledge for the
  // jump-gate smoke test while leaving the interior playable as before.
  heights: [
    [4, 4, 4, 4, 4, 4, 4, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 1, 1, 1, 1, 1, 1, 4],
    [4, 4, 4, 4, 4, 4, 4, 4],
  ],
  spawns: [{ x: 1, y: 4 }, { x: 6, y: 3 }],
  pickupSlots: [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ],
}
