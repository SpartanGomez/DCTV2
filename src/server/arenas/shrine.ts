// The Shrine — symmetrical, one Scroll of Sight in the exact center. Risk/reward.
// SPEC v2 §6.3 — the 8 `high_ground` tiles around the periphery rise to
// height 2 as raised plinths: Δh = 1 from adjacent floor so any class can
// climb, but the +2 energy `high_ground` entry cost (terrain type, not
// topology) still applies on top. Interior stays at 1.
import type { ArenaDef } from '../../shared/types.js'

export const shrine: ArenaDef = {
  slug: 'shrine',
  name: 'The Shrine',
  tiles: [
    // y=0
    ['stone','stone','high_ground','stone','stone','high_ground','stone','stone'],
    // y=1
    ['stone','pillar','stone','stone','stone','stone','pillar','stone'],
    // y=2
    ['high_ground','stone','stone','rubble','rubble','stone','stone','high_ground'],
    // y=3
    ['stone','stone','rubble','stone','stone','rubble','stone','stone'],
    // y=4
    ['stone','stone','rubble','stone','stone','rubble','stone','stone'],
    // y=5
    ['high_ground','stone','stone','rubble','rubble','stone','stone','high_ground'],
    // y=6
    ['stone','pillar','stone','stone','stone','stone','pillar','stone'],
    // y=7
    ['stone','stone','high_ground','stone','stone','high_ground','stone','stone'],
  ],
  heights: [
    [1, 1, 2, 1, 1, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [2, 1, 1, 1, 1, 1, 1, 2],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [2, 1, 1, 1, 1, 1, 1, 2],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 2, 1, 1, 2, 1, 1],
  ],
  spawns: [{ x: 1, y: 6 }, { x: 6, y: 1 }],
  // Center tile (3,3) or (4,4) will always get scroll_of_sight per M10 logic.
  pickupSlots: [
    { x: 3, y: 3 },  // center — always scroll_of_sight (handled in TournamentManager)
    { x: 0, y: 4 },
    { x: 7, y: 3 },
    { x: 4, y: 0 },
  ],
}
