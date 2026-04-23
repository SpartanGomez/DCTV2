// tests/unit/fog-pit-3d.test.ts
// SPEC v2 §6.3 / §6.4 — fog + scout behavior on a pit-shaped arena whose
// perimeter is height 4 and interior is height 1. This exists to catch
// silent regressions in LoS / scout-reveal once the pit arena's perimeter
// is raised (see M7.5-D). If this file fails, the smoke fog test will too.

import { describe, expect, it } from 'vitest'
import { applyScout, createMatch } from '../../src/server/GameEngine.js'
import { bresenhamLine, computeVisibleTiles, positionKey } from '../../src/shared/grid.js'
import {
  matchId,
  playerId,
  type ArenaDef,
  type GameAction,
  type MatchState,
} from '../../src/shared/types.js'

const PA = playerId('player-a')
const PB = playerId('player-b')
const MID = matchId('match-pit-3d')

// A minimal pit-shaped arena with the height-4 perimeter change under test.
// Matches src/server/arenas/pit.ts tile layout at the moment of writing.
const pitWithHeight: ArenaDef = {
  slug: 'pit',
  name: 'The Pit (test copy)',
  tiles: [
    ['high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground'],
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    ['high_ground','stone','rubble','stone','stone','rubble','stone','high_ground'],
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    ['high_ground','stone','rubble','stone','stone','rubble','stone','high_ground'],
    ['high_ground','stone','stone','stone','stone','stone','stone','high_ground'],
    ['high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground','high_ground'],
  ],
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
  pickupSlots: [],
}

function buildPitMatch(): MatchState {
  return createMatch({
    matchId: MID,
    playerA: PA,
    playerB: PB,
    classA: 'knight',
    classB: 'knight',
    firstTurn: 'A',
    now: () => 0,
    arena: pitWithHeight,
  })
}

describe('pit arena with height-4 perimeter — fog + LoS', () => {
  it('Bresenham line (1,4) → (6,3) stays inside the interior', () => {
    const cells = bresenhamLine({ x: 1, y: 4 }, { x: 6, y: 3 })
    // No intermediate cell may land on the perimeter ring.
    for (const c of cells) {
      const onPerimeter = c.x === 0 || c.x === 7 || c.y === 0 || c.y === 7
      expect(onPerimeter).toBe(false)
    }
  })

  it('A (1,4) does not see B (6,3) at start — distance exceeds sight range', () => {
    const state = buildPitMatch()
    const visibleToA = computeVisibleTiles(state, PA)
    expect(visibleToA.has(positionKey({ x: 6, y: 3 }))).toBe(false)
  })

  it('A scouts (6,3) — B is now visible to A through the scout reveal', () => {
    let state = buildPitMatch()
    const scout: Extract<GameAction, { kind: 'scout' }> = {
      kind: 'scout',
      unitId: state.units.find((u) => u.ownerId === PA)?.id ?? (() => { throw new Error('A unit missing') })(),
      center: { x: 6, y: 3 },
    }
    state = applyScout(state, scout, 1)
    const visibleToA = computeVisibleTiles(state, PA)
    // The scout reveal is LoS-ignoring and centered on (6,3); the enemy tile
    // itself must be in the visible set.
    expect(visibleToA.has(positionKey({ x: 6, y: 3 }))).toBe(true)
  })

  it('full kill-flow interior march (1,4) → (6,4) stays valid under height-4 perimeter', () => {
    // The full-kill smoke test walks horizontally along y=4 from the A spawn
    // to adjacency with B. Each step must (a) be interior, and (b) not cross
    // a height delta greater than Knight jump=2. This test only asserts the
    // arena shape — validators are exercised elsewhere.
    const state = buildPitMatch()
    const path: Array<{ x: number; y: number }> = [
      { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 },
    ]
    for (const step of path) {
      const tile = state.grid.tiles[step.y]?.[step.x]
      expect(tile).toBeDefined()
      expect(tile?.height).toBe(1)
      expect(tile?.type).not.toBe('pillar')
      expect(tile?.type).not.toBe('wall')
    }
  })
})
