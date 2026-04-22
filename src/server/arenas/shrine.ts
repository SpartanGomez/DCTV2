// The Shrine — symmetrical, one Scroll of Sight in the exact center. Risk/reward.
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
  spawns: [{ x: 1, y: 6 }, { x: 6, y: 1 }],
  // Center tile (3,3) or (4,4) will always get scroll_of_sight per M10 logic.
  pickupSlots: [
    { x: 3, y: 3 },  // center — always scroll_of_sight (handled in TournamentManager)
    { x: 0, y: 4 },
    { x: 7, y: 3 },
    { x: 4, y: 0 },
  ],
}
