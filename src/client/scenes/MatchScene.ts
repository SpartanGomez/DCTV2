// src/client/scenes/MatchScene.ts
// M2: click a tile to move, server validates + broadcasts, re-render units.
// Shows whose turn it is and the acting player's energy.

import { Container, Graphics, Text } from 'pixi.js'
import { GRID_HEIGHT, GRID_WIDTH, TILE_HEIGHT, TILE_WIDTH } from '../../shared/constants.js'
import type { ClassId, MatchState, PlayerId, Position, Unit } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

const TILE_FILL_A = 0x3a3a48
const TILE_FILL_B = 0x4a4a58
const TILE_STROKE = 0x1a1a20
const TILE_HOVER = 0xbba040
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

export interface MatchSceneHandlers {
  onTileClick: (pos: Position) => void
}

export class MatchScene implements Scene {
  readonly root: Container = new Container()
  private readonly tilesLayer = new Container()
  private readonly unitsLayer = new Container()
  private readonly hudLayer = new Container()
  private readonly tileAt: Graphics[] = []
  private state: MatchState
  private readonly youAre: PlayerId
  private readonly handlers: MatchSceneHandlers
  private hudText: Text | null = null
  private tickFn: (() => void) | null = null
  private boundRenderer: Renderer | null = null

  constructor(state: MatchState, youAre: PlayerId, handlers: MatchSceneHandlers) {
    this.state = state
    this.youAre = youAre
    this.handlers = handlers
    this.root.addChild(this.tilesLayer, this.unitsLayer, this.hudLayer)
  }

  mount(renderer: Renderer): void {
    this.centerStage(renderer.width, renderer.height)
    this.drawGrid()
    this.drawUnits()
    this.drawHud(renderer)
    this.tickFn = () => {
      this.refreshHud()
    }
    renderer.app.ticker.add(this.tickFn)
    this.boundRenderer = renderer
  }

  update(state: MatchState): void {
    this.state = state
    for (const child of this.unitsLayer.removeChildren()) {
      child.destroy()
    }
    this.drawUnits()
    this.refreshHud()
  }

  destroy(): void {
    if (this.tickFn && this.boundRenderer) {
      this.boundRenderer.app.ticker.remove(this.tickFn)
    }
    this.tickFn = null
    this.boundRenderer = null
    this.root.destroy({ children: true })
  }

  get currentState(): MatchState {
    return this.state
  }

  /** The unit the local player controls (if any is alive). */
  getOwnUnit(): Unit | null {
    return this.state.units.find((u) => u.ownerId === this.youAre && u.hp > 0) ?? null
  }

  private centerStage(width: number, height: number): void {
    const spanX = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_WIDTH / 2)
    const spanY = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_HEIGHT / 2)
    this.root.x = width / 2 + (spanX / 2 - (GRID_HEIGHT - 1) * (TILE_WIDTH / 2))
    this.root.y = (height - spanY) / 2
  }

  private drawGrid(): void {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const tile = this.drawTile(x, y)
        this.tilesLayer.addChild(tile)
      }
    }
  }

  private drawTile(gx: number, gy: number): Graphics {
    const g = new Graphics()
    const { sx, sy } = gridToScreen({ x: gx, y: gy })
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2
    const dark = (gx + gy) % 2 === 0
    const baseFill = dark ? TILE_FILL_A : TILE_FILL_B
    g.poly([sx, sy - halfH, sx + halfW, sy, sx, sy + halfH, sx - halfW, sy])
    g.fill({ color: baseFill })
    g.stroke({ color: TILE_STROKE, width: 1 })

    g.eventMode = 'static'
    g.cursor = 'pointer'
    g.on('pointertap', () => {
      this.handlers.onTileClick({ x: gx, y: gy })
    })
    g.on('pointerover', () => {
      g.tint = TILE_HOVER
    })
    g.on('pointerout', () => {
      g.tint = 0xffffff
    })
    this.tileAt.push(g)
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

  private drawHud(renderer: Renderer): void {
    const text = new Text({
      text: this.hudString(),
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: LABEL_FILL,
      },
    })
    text.x = -this.root.x + 16
    text.y = -this.root.y + 16
    this.hudLayer.addChild(text)
    this.hudText = text
    // Suppress unused param lint; renderer not needed past mount.
    void renderer
  }

  private refreshHud(): void {
    if (this.hudText) this.hudText.text = this.hudString()
  }

  private hudString(): string {
    const your = this.state.currentTurn === this.youAre
    const energy = this.state.energy[this.state.currentTurn] ?? 0
    const max = this.state.maxEnergy[this.state.currentTurn] ?? 0
    const turn = your ? 'YOUR TURN' : 'OPPONENT TURN'
    const remainingMs = Math.max(0, this.state.turnEndsAt - Date.now())
    const seconds = Math.ceil(remainingMs / 1000)
    return `${turn} — turn ${String(this.state.turnNumber)} — ${String(seconds)}s — energy ${String(energy)}/${String(max)}   [E] end turn`
  }
}
