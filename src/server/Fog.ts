// src/server/Fog.ts
// Per-player fog filter. SPEC §11: terrain is always visible; enemy
// positions, pickups (outside sight), and opponent-owned traps are
// stripped server-side before broadcast. Ash Clouds stay visible —
// they're ambient on-grid effects and readability beats secrecy here.
//
// The actual visibility math lives in `shared/grid.ts` so the client
// can render the fog overlay from the same formula.

import { computeVisibleTiles, manhattanDistance, positionKey } from '../shared/grid.js'
import type { MatchState, PlayerId } from '../shared/types.js'

/**
 * Produce a per-player view of MatchState. Bots receive the same filtered
 * state — no omniscient views, per SPEC §11.
 */
export function filterForPlayer(state: MatchState, viewer: PlayerId): MatchState {
  const viewerPerks = state.perks[viewer] ?? []

  // Perk: scouts_eye — full map vision for the first 4 turns (≈ 2 per player).
  const hasScoutsEye = viewerPerks.includes('scouts_eye') && state.turnNumber <= 4

  let visible: Set<string>
  if (hasScoutsEye) {
    // Every tile is visible.
    visible = new Set<string>()
    for (let y = 0; y < state.grid.height; y++) {
      for (let x = 0; x < state.grid.width; x++) {
        visible.add(positionKey({ x, y }))
      }
    }
  } else {
    visible = computeVisibleTiles(state, viewer)
  }

  const units = state.units.filter(
    (u) => u.ownerId === viewer || visible.has(positionKey(u.pos)),
  )

  // Perk: trap_sense — reveal opponent traps within 2 tiles of the viewer's unit.
  let traps = state.traps.filter((t) => t.ownerId === viewer)
  if (viewerPerks.includes('trap_sense')) {
    const myUnit = state.units.find((u) => u.ownerId === viewer && u.hp > 0)
    if (myUnit) {
      const sensed = state.traps.filter(
        (t) => t.ownerId !== viewer && manhattanDistance(t.pos, myUnit.pos) <= 2,
      )
      traps = [...traps, ...sensed]
    }
  }

  const pickups = state.pickups.filter((p) => visible.has(positionKey(p.pos)))
  const scoutReveals = state.scoutReveals.filter((r) => r.ownerId === viewer)

  return { ...state, units, traps, pickups, scoutReveals }
}
