// The Ruins — dense pillars and rubble. Short sightlines. Favors melee and traps.
// SPEC v2 §6.3 — rubble piles up as height-2 mounds of fallen masonry. Pillars
// stay at height 1 (their `pillar` type makes them infinite LoS blockers
// regardless of stack). Stone floor at 1. Spawns happen to sit on rubble
// at (1,6) and (6,1); their immediate orthogonal neighbors are all stone at
// height 1, so any class can step off the mound into the match (Δh = 1).
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
  // Rubble tiles elevate to 2; pillars and stones stay at 1.
  heights: [
    [1, 1, 2, 1, 1, 2, 1, 1],
    [1, 2, 1, 1, 1, 1, 2, 1],
    [2, 1, 1, 1, 1, 1, 1, 2],
    [1, 1, 1, 2, 2, 1, 1, 1],
    [1, 1, 2, 2, 1, 1, 1, 1],
    [2, 1, 1, 1, 1, 1, 1, 2],
    [1, 2, 1, 1, 1, 1, 2, 1],
    [1, 1, 2, 1, 1, 2, 1, 1],
  ],
  spawns: [{ x: 1, y: 6 }, { x: 6, y: 1 }],
  pickupSlots: [
    { x: 3, y: 1 },
    { x: 4, y: 6 },
    { x: 1, y: 4 },
    { x: 6, y: 3 },
  ],
}
