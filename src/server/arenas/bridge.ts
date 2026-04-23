// The Bridge — narrow central corridor, hazard fire flanks the sides. Forces head-on.
// SPEC v2 §6.3 — the void flanks drop to height 0 (pit below floor) while the
// stone corridor stays at height 1. The visual gap reinforces the bridge
// theme; gameplay-wise the voids are already one-shot-death hazards, so the
// pit depth doesn't change what happens when you fall in — it just makes the
// geometry legible.
import type { ArenaDef } from '../../shared/types.js'

export const bridge: ArenaDef = {
  slug: 'bridge',
  name: 'The Bridge',
  tiles: [
    // y=0 — void flanks
    ['hazard_void','hazard_void','stone','stone','stone','stone','hazard_void','hazard_void'],
    // y=1
    ['hazard_fire','hazard_fire','stone','stone','stone','stone','hazard_fire','hazard_fire'],
    // y=2
    ['hazard_void','rubble','stone','stone','stone','stone','rubble','hazard_void'],
    // y=3 — center corridor
    ['hazard_fire','stone','stone','stone','stone','stone','stone','hazard_fire'],
    // y=4 — center corridor
    ['hazard_fire','stone','stone','stone','stone','stone','stone','hazard_fire'],
    // y=5
    ['hazard_void','rubble','stone','stone','stone','stone','rubble','hazard_void'],
    // y=6
    ['hazard_fire','hazard_fire','stone','stone','stone','stone','hazard_fire','hazard_fire'],
    // y=7
    ['hazard_void','hazard_void','stone','stone','stone','stone','hazard_void','hazard_void'],
  ],
  // Voids (hazard_void) sink to 0; everything else — stones, fires, rubbles —
  // rides the corridor at the default 1.
  heights: [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 0, 0],
  ],
  spawns: [{ x: 2, y: 6 }, { x: 5, y: 1 }],
  pickupSlots: [
    { x: 3, y: 3 },
    { x: 4, y: 4 },
    { x: 2, y: 2 },
    { x: 5, y: 5 },
  ],
}
