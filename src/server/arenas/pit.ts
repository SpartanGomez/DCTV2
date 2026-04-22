// The Pit — open center, high ground rings the edges. Favors ranged.
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
  spawns: [{ x: 1, y: 4 }, { x: 6, y: 3 }],
  pickupSlots: [
    { x: 3, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ],
}
