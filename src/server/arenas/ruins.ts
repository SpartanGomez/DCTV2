// The Ruins — dense pillars and rubble. Short sightlines. Favors melee and traps.
import type { ArenaDef } from '../../shared/types.js'

export const ruins: ArenaDef = {
  slug: 'ruins',
  name: 'The Ruins',
  tiles: [
    // y=0
    ['pillar','stone','rubble','stone','stone','rubble','stone','pillar'],
    // y=1
    ['stone','rubble','stone','stone','stone','stone','rubble','stone'],
    // y=2
    ['rubble','stone','pillar','stone','stone','pillar','stone','rubble'],
    // y=3
    ['stone','stone','stone','rubble','rubble','stone','stone','stone'],
    // y=4
    ['stone','stone','rubble','rubble','stone','stone','stone','stone'],
    // y=5
    ['rubble','stone','pillar','stone','stone','pillar','stone','rubble'],
    // y=6
    ['stone','rubble','stone','stone','stone','stone','rubble','stone'],
    // y=7
    ['pillar','stone','rubble','stone','stone','rubble','stone','pillar'],
  ],
  spawns: [{ x: 1, y: 6 }, { x: 6, y: 1 }],
  pickupSlots: [
    { x: 3, y: 1 },
    { x: 4, y: 6 },
    { x: 1, y: 4 },
    { x: 6, y: 3 },
  ],
}
