// src/server/Fog.ts
// Per-player fog filter. SPEC §11: terrain is always visible; enemy
// positions, pickups (outside sight), and opponent-owned traps are
// stripped server-side before broadcast. Ash Clouds stay visible —
// they're ambient on-grid effects and readability beats secrecy here.
//
// The actual visibility math lives in `shared/grid.ts` so the client
// can render the fog overlay from the same formula.

import { computeVisibleTiles, positionKey } from '../shared/grid.js'
import type { MatchState, PlayerId } from '../shared/types.js'

/**
 * Produce a per-player view of MatchState. Bots receive the same filtered
 * state — no omniscient views, per SPEC §11.
 */
export function filterForPlayer(state: MatchState, viewer: PlayerId): MatchState {
  const visible = computeVisibleTiles(state, viewer)

  const units = state.units.filter(
    (u) => u.ownerId === viewer || visible.has(positionKey(u.pos)),
  )
  const traps = state.traps.filter((t) => t.ownerId === viewer)
  const pickups = state.pickups.filter((p) => visible.has(positionKey(p.pos)))
  const scoutReveals = state.scoutReveals.filter((r) => r.ownerId === viewer)

  return { ...state, units, traps, pickups, scoutReveals }
}
