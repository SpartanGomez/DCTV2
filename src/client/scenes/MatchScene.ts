// src/client/scenes/MatchScene.ts
// M1: render 8×8 iso grid as colored diamonds + two unit circles with labels.
// No sprites, no animation, no terrain textures — that's M8+.

import { Container, Graphics, Text } from 'pixi.js'
import { GRID_HEIGHT, GRID_WIDTH, TILE_HEIGHT, TILE_WIDTH } from '../../shared/constants.js'
import type { ClassId, MatchState, PlayerId, Position, Unit } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

const TILE_FILL_A = 0x3a3a48
const TILE_FILL_B = 0x4a4a58
const TILE_STROKE = 0x1a1a20
const UNIT_STROKE_OWN = 0xbba040
const UNIT_STROKE_FOE = 0xcc2222
const LABEL_FILL = 0xccccdd

function colorForClass(classId: ClassId): number {
  switch (classId) {
    case 'knight':
      return 0x8b0000
    case 'mage':
      return 0x6633aa
    case 'heretic':
      return 0x3a1a1a
  }
}

function classLetter(classId: ClassId): string {
  switch (classId) {
    case 'knight':
      return 'K'
    case 'mage':
      return 'M'
    case 'heretic':
      return 'H'
  }
}

interface ScreenPoint {
  sx: number
  sy: number
}

function gridToScreen(p: Position): ScreenPoint {
  return {
    sx: (p.x - p.y) * (TILE_WIDTH / 2),
    sy: (p.x + p.y) * (TILE_HEIGHT / 2),
  }
}

export class MatchScene implements Scene {
  readonly root: Container = new Container()
  private readonly tilesLayer = new Container()
  private readonly unitsLayer = new Container()
  private state: MatchState
  private readonly youAre: PlayerId

  constructor(state: MatchState, youAre: PlayerId) {
    this.state = state
    this.youAre = youAre
    this.root.addChild(this.tilesLayer, this.unitsLayer)
  }

  mount(renderer: Renderer): void {
    this.centerStage(renderer.width, renderer.height)
    this.drawGrid()
    this.drawUnits()
  }

  update(state: MatchState): void {
    this.state = state
    for (const child of this.unitsLayer.removeChildren()) {
      child.destroy()
    }
    this.drawUnits()
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  private centerStage(width: number, height: number): void {
    // Iso grid spans (GRID_WIDTH + GRID_HEIGHT - 1) tiles in both axes.
    const spanX = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_WIDTH / 2)
    const spanY = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_HEIGHT / 2)
    // Origin (grid (0,0)) sits at the top of the diamond; shift so the whole
    // grid is centered in the viewport.
    this.root.x = width / 2 + (spanX / 2 - (GRID_HEIGHT - 1) * (TILE_WIDTH / 2))
    this.root.y = (height - spanY) / 2
  }

  private drawGrid(): void {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        this.tilesLayer.addChild(this.drawTile(x, y))
      }
    }
  }

  private drawTile(gx: number, gy: number): Graphics {
    const g = new Graphics()
    const { sx, sy } = gridToScreen({ x: gx, y: gy })
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2
    const dark = (gx + gy) % 2 === 0
    g.poly([sx, sy - halfH, sx + halfW, sy, sx, sy + halfH, sx - halfW, sy])
    g.fill({ color: dark ? TILE_FILL_A : TILE_FILL_B })
    g.stroke({ color: TILE_STROKE, width: 1 })
    return g
  }

  private drawUnits(): void {
    for (const u of this.state.units) {
      this.drawUnit(u)
    }
  }

  private drawUnit(u: Unit): void {
    const { sx, sy } = gridToScreen(u.pos)
    const ring = u.ownerId === this.youAre ? UNIT_STROKE_OWN : UNIT_STROKE_FOE
    const body = new Graphics()
    body.circle(sx, sy - 8, 12)
    body.fill({ color: colorForClass(u.classId) })
    body.stroke({ color: ring, width: 2 })
    this.unitsLayer.addChild(body)

    const label = new Text({
      text: classLetter(u.classId),
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: LABEL_FILL,
        fontWeight: 'bold',
      },
    })
    label.anchor.set(0.5)
    label.x = sx
    label.y = sy - 8
    this.unitsLayer.addChild(label)
  }
}
