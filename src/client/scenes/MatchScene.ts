// src/client/scenes/MatchScene.ts
// M2: click a tile to move, server validates + broadcasts, re-render units.
// Shows whose turn it is and the acting player's energy.

import { Container, Graphics, Text } from 'pixi.js'
import { GRID_HEIGHT, GRID_WIDTH, TILE_HEIGHT, TILE_WIDTH } from '../../shared/constants.js'
import { computeVisibleTiles, positionKey } from '../../shared/grid.js'
import type { ClassId, MatchState, PlayerId, Position, Unit, UnitId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

const TILE_FILL_A = 0x3a3a48
const TILE_FILL_B = 0x4a4a58
const TILE_FOG_OVERLAY = 0x000000
const TILE_FOG_ALPHA = 0.55
const TILE_SCOUT_TINT = 0x6633aa
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
  private readonly fogLayer = new Container()
  private readonly unitsLayer = new Container()
  private readonly ghostsLayer = new Container()
  private readonly hudLayer = new Container()
  private readonly tileAt: Graphics[] = []
  private state: MatchState
  private readonly youAre: PlayerId
  private readonly handlers: MatchSceneHandlers
  private hudText: Text | null = null
  private tickFn: (() => void) | null = null
  private boundRenderer: Renderer | null = null
  /** Last-known enemy positions for ghost marker rendering (SPEC §11). */
  private readonly ghosts = new Map<UnitId, { pos: Position; classId: ClassId; ownerId: PlayerId }>()

  constructor(state: MatchState, youAre: PlayerId, handlers: MatchSceneHandlers) {
    this.state = state
    this.youAre = youAre
    this.handlers = handlers
    this.root.addChild(
      this.tilesLayer,
      this.ghostsLayer,
      this.fogLayer,
      this.unitsLayer,
      this.hudLayer,
    )
    this.observeEnemies(state)
  }

  mount(renderer: Renderer): void {
    this.centerStage(renderer.width, renderer.height)
    this.drawGrid()
    this.drawUnits()
    this.drawFogAndGhosts()
    this.drawHud(renderer)
    this.tickFn = () => {
      this.refreshHud()
    }
    renderer.app.ticker.add(this.tickFn)
    this.boundRenderer = renderer
  }

  update(state: MatchState): void {
    this.observeEnemies(state)
    this.state = state
    for (const child of this.unitsLayer.removeChildren()) child.destroy()
    for (const child of this.fogLayer.removeChildren()) child.destroy()
    for (const child of this.ghostsLayer.removeChildren()) child.destroy()
    this.drawUnits()
    this.drawFogAndGhosts()
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

  /**
   * Track which enemies are currently visible. When an enemy we've seen
   * before drops out of the visible units list, we persist their last
   * position as a ghost marker. When they reappear anywhere, clear the
   * old ghost (a new one may get written next tick).
   */
  private observeEnemies(state: MatchState): void {
    const visibleEnemyIds = new Set<UnitId>()
    for (const u of state.units) {
      if (u.ownerId === this.youAre) continue
      visibleEnemyIds.add(u.id)
      // Seen right now — update our memory and clear any stale ghost.
      this.ghosts.set(u.id, { pos: u.pos, classId: u.classId, ownerId: u.ownerId })
    }
    // Anyone in the previous ghost set who ISN'T in current visible list
    // stays as a ghost (we just don't update their pos). Nothing to do here —
    // ghosts map is only pruned when we see the enemy again at a new tile,
    // at which point set above overwrites.
    // If `visibleEnemyIds` currently has an enemy, its ghost record tracks
    // the live position; rendering skips ghost when an enemy is visible.
    for (const id of visibleEnemyIds) {
      // Keep a sentinel so renderer knows this one is live — store with current pos.
      const entry = this.ghosts.get(id)
      if (entry) this.ghosts.set(id, entry)
    }
  }

  private drawFogAndGhosts(): void {
    const visible = computeVisibleTiles(this.state, this.youAre)
    const visibleEnemyIds = new Set<UnitId>()
    for (const u of this.state.units) {
      if (u.ownerId !== this.youAre) visibleEnemyIds.add(u.id)
    }
    const scoutedKeys = new Set<string>()
    for (const r of this.state.scoutReveals) {
      for (const t of r.tiles) scoutedKeys.add(positionKey(t))
    }

    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const key = positionKey({ x, y })
        const { sx, sy } = gridToScreen({ x, y })
        if (!visible.has(key)) {
          const g = new Graphics()
          g.poly([sx, sy - halfH, sx + halfW, sy, sx, sy + halfH, sx - halfW, sy])
          g.fill({ color: TILE_FOG_OVERLAY, alpha: TILE_FOG_ALPHA })
          this.fogLayer.addChild(g)
        } else if (scoutedKeys.has(key)) {
          const g = new Graphics()
          g.poly([sx, sy - halfH, sx + halfW, sy, sx, sy + halfH, sx - halfW, sy])
          g.fill({ color: TILE_SCOUT_TINT, alpha: 0.22 })
          this.fogLayer.addChild(g)
        }
      }
    }

    // Ghost markers for enemies we've seen before but can't see right now.
    for (const [id, entry] of this.ghosts) {
      if (visibleEnemyIds.has(id)) continue
      const { sx, sy } = gridToScreen(entry.pos)
      const body = new Graphics()
      body.circle(sx, sy - 8, 12)
      body.fill({ color: colorForClass(entry.classId), alpha: 0.35 })
      body.stroke({ color: UNIT_STROKE_FOE, width: 2, alpha: 0.5 })
      this.ghostsLayer.addChild(body)
      const label = new Text({
        text: classLetter(entry.classId),
        style: {
          fontFamily: 'monospace',
          fontSize: 14,
          fill: LABEL_FILL,
          fontWeight: 'bold',
        },
      })
      label.alpha = 0.35
      label.anchor.set(0.5)
      label.x = sx
      label.y = sy - 8
      this.ghostsLayer.addChild(label)
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
