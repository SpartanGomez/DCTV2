// tests/unit/shared.test.ts
// M0 unit suite. Keeps the Vitest CI job honest with real assertions,
// not just a placeholder file.

import { describe, expect, it } from 'vitest'
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  isInBounds,
  manhattanDistance,
  positionKey,
  positionsEqual,
} from '../../src/shared/index.js'

describe('manhattanDistance', () => {
  it('returns 0 for identical positions', () => {
    expect(manhattanDistance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0)
  })

  it('is symmetric', () => {
    const a = { x: 1, y: 2 }
    const b = { x: 5, y: 7 }
    expect(manhattanDistance(a, b)).toBe(manhattanDistance(b, a))
  })

  it('sums absolute dx + dy', () => {
    expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7)
    expect(manhattanDistance({ x: 7, y: 0 }, { x: 0, y: 7 })).toBe(14)
  })
})

describe('isInBounds', () => {
  it('accepts all four corners', () => {
    expect(isInBounds({ x: 0, y: 0 })).toBe(true)
    expect(isInBounds({ x: GRID_WIDTH - 1, y: 0 })).toBe(true)
    expect(isInBounds({ x: 0, y: GRID_HEIGHT - 1 })).toBe(true)
    expect(isInBounds({ x: GRID_WIDTH - 1, y: GRID_HEIGHT - 1 })).toBe(true)
  })

  it('rejects off-grid positions', () => {
    expect(isInBounds({ x: -1, y: 0 })).toBe(false)
    expect(isInBounds({ x: 0, y: -1 })).toBe(false)
    expect(isInBounds({ x: GRID_WIDTH, y: 0 })).toBe(false)
    expect(isInBounds({ x: 0, y: GRID_HEIGHT })).toBe(false)
  })
})

describe('positionKey', () => {
  it('is stable and distinct for different positions', () => {
    expect(positionKey({ x: 1, y: 2 })).toBe('1,2')
    expect(positionKey({ x: 1, y: 2 })).toBe(positionKey({ x: 1, y: 2 }))
    expect(positionKey({ x: 1, y: 2 })).not.toBe(positionKey({ x: 2, y: 1 }))
  })
})

describe('positionsEqual', () => {
  it('distinguishes different positions', () => {
    expect(positionsEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
    expect(positionsEqual({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false)
  })
})
