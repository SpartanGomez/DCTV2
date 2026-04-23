// src/client/scenes/MatchScene.ts
// M2: click a tile to move, server validates + broadcasts, re-render units.
// Shows whose turn it is and the acting player's energy.
// M7.5 (v2): rotatable camera (Q/E), height-stacked tile rendering,
// facing wedge on unit circles. Camera rotation is client-only render
// state — server has no idea.

import { Container, Graphics, Text } from 'pixi.js'
import { playSfx } from '../audio.js'
import {
  DEFAULT_TILE_HEIGHT,
  GRID_HEIGHT,
  GRID_WIDTH,
  TILE_DEPTH_PX,
  TILE_HEIGHT,
  TILE_WIDTH,
} from '../../shared/constants.js'
import { computeVisibleTiles, positionKey } from '../../shared/grid.js'
import type {
  ClassId,
  Facing,
  MatchState,
  PlayerId,
  Position,
  Unit,
  UnitId,
} from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

/**
 * Client-only camera rotation index. SPEC v2 §6.5.
 *   0 = default (no rotation)
 *   1 = 90° clockwise
 *   2 = 180°
 *   3 = 270° clockwise (= 90° counter-clockwise)
 */
export type CameraRotation = 0 | 1 | 2 | 3

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

/**
 * SPEC v2 §6.5 — convert a world-space tile position to camera-space coords
 * under the given rotation. Camera-space coords feed directly into the iso
 * projection. Inverse: `cameraToWorld`.
 */
function worldToCamera(p: Position, rot: CameraRotation): { cx: number; cy: number } {
  switch (rot) {
    case 0:
      return { cx: p.x, cy: p.y }
    case 1:
      return { cx: GRID_HEIGHT - 1 - p.y, cy: p.x }
    case 2:
      return { cx: GRID_WIDTH - 1 - p.x, cy: GRID_HEIGHT - 1 - p.y }
    case 3:
      return { cx: p.y, cy: GRID_WIDTH - 1 - p.x }
  }
}

function gridToScreen(p: Position, rot: CameraRotation, height: number = DEFAULT_TILE_HEIGHT): ScreenPoint {
  const { cx, cy } = worldToCamera(p, rot)
  return {
    sx: (cx - cy) * (TILE_WIDTH / 2),
    // Tiles taller than default render their top surface higher on screen.
    sy: (cx + cy) * (TILE_HEIGHT / 2) - (height - DEFAULT_TILE_HEIGHT) * TILE_DEPTH_PX,
  }
}

/** Multiply each RGB channel of a 0xRRGGBB color by `factor` (0..1). */
function darken(color: number, factor: number): number {
  const r = Math.max(0, Math.min(0xff, Math.round(((color >> 16) & 0xff) * factor)))
  const g = Math.max(0, Math.min(0xff, Math.round(((color >> 8) & 0xff) * factor)))
  const b = Math.max(0, Math.min(0xff, Math.round((color & 0xff) * factor)))
  return (r << 16) | (g << 8) | b
}

/**
 * SPEC v2 §6.6 — rotate a world facing into the camera frame so the
 * renderer can pick the right sprite (or, for placeholder rendering, point
 * the facing wedge in the right screen direction). Returns the facing's
 * camera-space dx/dy in unit grid coords.
 */
function facingToCameraVector(f: Facing, rot: CameraRotation): { dx: number; dy: number } {
  // Apply the same world->camera rotation to the unit vector for the facing.
  const base: Record<Facing, { dx: number; dy: number }> = {
    N: { dx: 0, dy: -1 },
    E: { dx: 1, dy: 0 },
    S: { dx: 0, dy: 1 },
    W: { dx: -1, dy: 0 },
  }
  const v = base[f]
  switch (rot) {
    case 0:
      return v
    case 1:
      return { dx: -v.dy, dy: v.dx }
    case 2:
      return { dx: -v.dx, dy: -v.dy }
    case 3:
      return { dx: v.dy, dy: -v.dx }
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
  private turnBanner: Text | null = null
  private turnSub: Text | null = null
  private turnTimerText: Text | null = null
  private energyPipsGfx: Graphics | null = null
  private tickFn: (() => void) | null = null
  private boundRenderer: Renderer | null = null
  /** Last-known enemy positions for ghost marker rendering (SPEC §11). */
  private readonly ghosts = new Map<UnitId, { pos: Position; classId: ClassId; ownerId: PlayerId }>()
  /**
   * Client-only camera rotation (SPEC v2 §6.5). Default 0. Q rotates CCW
   * (decrements modulo 4); E rotates CW (increments). Server has no idea.
   */
  private cameraRotation: CameraRotation = 0
  /**
   * Active 150 ms ease-in-out rotation tween (SPEC v2 §6.5, M7.5 DoD).
   * While set, Q/E input is gated and `root.alpha` dips to 0.35 at the
   * midpoint where the rotation index snaps. Null when idle.
   */
  private rotationTween: { startMs: number; from: CameraRotation; to: CameraRotation } | null = null
  private static readonly ROTATION_TWEEN_MS = 150
  /** Most-recent tile the pointer hovered — fuels the F3 debug overlay. */
  private hoveredTile: Position | null = null
  /** F3 debug overlay visibility + backing text object. */
  private debugOverlayVisible = false
  private debugText: Text | null = null

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
      this.tickRotationTween()
      this.refreshHud()
      this.refreshDebugOverlay()
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

  /** SPEC v2 §6.5 — current client-only camera rotation index. */
  get rotation(): CameraRotation {
    return this.cameraRotation
  }

  /** True while a rotation tween is still running — input gate for Q/E. */
  get isRotating(): boolean {
    return this.rotationTween !== null
  }

  /** SPEC v2 §6.5 — Q rotates counter-clockwise. */
  rotateCameraCcw(): void {
    if (this.rotationTween) return
    this.beginRotationTween(((this.cameraRotation + 3) % 4) as CameraRotation)
  }

  /** SPEC v2 §6.5 — E rotates clockwise. */
  rotateCameraCw(): void {
    if (this.rotationTween) return
    this.beginRotationTween(((this.cameraRotation + 1) % 4) as CameraRotation)
  }

  private beginRotationTween(next: CameraRotation): void {
    if (next === this.cameraRotation) return
    console.log(`[client] camera rotation -> ${String(next * 90)}°`)
    playSfx('camera_rotate')
    this.rotationTween = {
      startMs: performance.now(),
      from: this.cameraRotation,
      to: next,
    }
  }

  /**
   * Advance the rotation tween on each tick. Called from the ticker callback
   * registered in `mount`. Uses an ease-in-out alpha dip (1 → 0.35 → 1) with
   * the rotation index snapping at the midpoint so the transition reads as a
   * deliberate step rather than a snap.
   */
  private tickRotationTween(): void {
    const t = this.rotationTween
    if (!t) return
    const elapsed = performance.now() - t.startMs
    const p = Math.min(1, Math.max(0, elapsed / MatchScene.ROTATION_TWEEN_MS))
    // Ease-in-out sine (0 at edges, 1 at midpoint).
    const dip = 0.5 - 0.5 * Math.cos(Math.PI * 2 * p)
    this.root.alpha = 1 - 0.65 * dip
    const hitMidpoint = p >= 0.5 && this.cameraRotation === t.from
    if (hitMidpoint) {
      this.cameraRotation = t.to
      this.redrawAll()
    }
    if (p >= 1) {
      this.root.alpha = 1
      this.rotationTween = null
      if (this.cameraRotation !== t.to) {
        // Safety net: if we somehow never crossed the midpoint commit, snap now.
        this.cameraRotation = t.to
        this.redrawAll()
      }
    }
  }

  /** F3 — toggle the debug overlay (rotation + hovered tile height). */
  toggleDebugOverlay(): void {
    this.debugOverlayVisible = !this.debugOverlayVisible
    if (this.debugText) this.debugText.visible = this.debugOverlayVisible
    console.log(`[client] debug overlay ${this.debugOverlayVisible ? 'on' : 'off'}`)
  }

  get isDebugOverlayVisible(): boolean {
    return this.debugOverlayVisible
  }

  private redrawAll(): void {
    for (const child of this.tilesLayer.removeChildren()) child.destroy()
    for (const child of this.unitsLayer.removeChildren()) child.destroy()
    for (const child of this.fogLayer.removeChildren()) child.destroy()
    for (const child of this.ghostsLayer.removeChildren()) child.destroy()
    this.tileAt.length = 0
    this.drawGrid()
    this.drawUnits()
    this.drawFogAndGhosts()
    this.refreshHud()
  }

  private centerStage(width: number, height: number): void {
    const spanX = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_WIDTH / 2)
    const spanY = (GRID_WIDTH + GRID_HEIGHT - 1) * (TILE_HEIGHT / 2)
    this.root.x = width / 2 + (spanX / 2 - (GRID_HEIGHT - 1) * (TILE_WIDTH / 2))
    this.root.y = (height - spanY) / 2
  }

  private drawGrid(): void {
    // SPEC v2 §6.5 / §9.3 — tiles draw back-to-front in CAMERA-space order
    // (cx + cy ascending) so taller stacks correctly occlude tiles behind them.
    const drawOrder: Position[] = []
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        drawOrder.push({ x, y })
      }
    }
    drawOrder.sort((a, b) => {
      const ca = worldToCamera(a, this.cameraRotation)
      const cb = worldToCamera(b, this.cameraRotation)
      return ca.cx + ca.cy - (cb.cx + cb.cy)
    })
    for (const p of drawOrder) {
      const tile = this.drawTile(p.x, p.y)
      this.tilesLayer.addChild(tile)
    }
  }

  private drawTile(gx: number, gy: number): Graphics {
    const g = new Graphics()
    const tileData = this.state.grid.tiles[gy]?.[gx]
    const tileHeight = tileData?.height ?? DEFAULT_TILE_HEIGHT
    const { sx, sy } = gridToScreen({ x: gx, y: gy }, this.cameraRotation, tileHeight)
    const halfW = TILE_WIDTH / 2
    const halfH = TILE_HEIGHT / 2
    const dark = (gx + gy) % 2 === 0
    const baseFill = dark ? TILE_FILL_A : TILE_FILL_B

    // SPEC v2 §14.3 — for height > 1, draw a side-face stack of
    // (height - 1) bands beneath the top surface. Side-face shade is
    // 30-40% darker than the top per spec; we use a flat 0.65× scale here.
    if (tileHeight > DEFAULT_TILE_HEIGHT) {
      const sideFill = darken(baseFill, 0.65)
      const stackBands = tileHeight - DEFAULT_TILE_HEIGHT
      for (let i = 0; i < stackBands; i++) {
        const bandTopY = sy + i * TILE_DEPTH_PX
        // Diamond-bottom-half + rectangle face. We approximate the iso side
        // as a quadrilateral matching the bottom edges of the diamond.
        g.poly([
          sx - halfW,
          bandTopY,
          sx + halfW,
          bandTopY,
          sx + halfW,
          bandTopY + TILE_DEPTH_PX,
          sx - halfW,
          bandTopY + TILE_DEPTH_PX,
        ])
        g.fill({ color: sideFill })
        g.stroke({ color: TILE_STROKE, width: 1, alpha: 0.6 })
      }
    }

    // Top diamond face — drawn last (above the side stack).
    g.poly([sx, sy - halfH, sx + halfW, sy, sx, sy + halfH, sx - halfW, sy])
    g.fill({ color: baseFill })
    g.stroke({ color: TILE_STROKE, width: 1 })

    g.eventMode = 'static'
    g.cursor = 'pointer'
    // World coords baked in — listener fires the same payload regardless of
    // current camera rotation, so the server never sees rotation state.
    g.on('pointertap', () => {
      playSfx('ui_click')
      this.handlers.onTileClick({ x: gx, y: gy })
    })
    g.on('pointerover', () => {
      g.tint = TILE_HOVER
      this.hoveredTile = { x: gx, y: gy }
    })
    g.on('pointerout', () => {
      g.tint = 0xffffff
      if (this.hoveredTile && this.hoveredTile.x === gx && this.hoveredTile.y === gy) {
        this.hoveredTile = null
      }
    })
    this.tileAt.push(g)
    return g
  }

  private drawUnits(): void {
    this.drawPickups()
    for (const u of this.state.units) {
      this.drawUnit(u)
    }
  }

  private drawPickups(): void {
    for (const p of this.state.pickups) {
      const tileH = this.state.grid.tiles[p.pos.y]?.[p.pos.x]?.height ?? DEFAULT_TILE_HEIGHT
      const { sx, sy } = gridToScreen(p.pos, this.cameraRotation, tileH)
      const color =
        p.kind === 'health_flask'
          ? 0x8b0000
          : p.kind === 'energy_crystal'
            ? 0x4466cc
            : p.kind === 'scroll_of_sight'
              ? 0xbba040
              : 0x6a5a3a
      const body = new Graphics()
      body.roundRect(sx - 8, sy - 10, 16, 16, 2)
      body.fill({ color })
      body.stroke({ color: 0x1a1a20, width: 1 })
      this.unitsLayer.addChild(body)
      const label = new Text({
        text:
          p.kind === 'health_flask'
            ? '+'
            : p.kind === 'energy_crystal'
              ? 'E'
              : p.kind === 'scroll_of_sight'
                ? 'S'
                : '?',
        style: {
          fontFamily: 'monospace',
          fontSize: 10,
          fontWeight: 'bold',
          fill: 0xccccdd,
        },
      })
      label.anchor.set(0.5)
      label.x = sx
      label.y = sy - 2
      this.unitsLayer.addChild(label)
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
        const tileH = this.state.grid.tiles[y]?.[x]?.height ?? DEFAULT_TILE_HEIGHT
        const { sx, sy } = gridToScreen({ x, y }, this.cameraRotation, tileH)
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
      const tileH = this.state.grid.tiles[entry.pos.y]?.[entry.pos.x]?.height ?? DEFAULT_TILE_HEIGHT
      const { sx, sy } = gridToScreen(entry.pos, this.cameraRotation, tileH)
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
    const tileH = this.state.grid.tiles[u.pos.y]?.[u.pos.x]?.height ?? DEFAULT_TILE_HEIGHT
    const { sx, sy } = gridToScreen(u.pos, this.cameraRotation, tileH)
    const ring = u.ownerId === this.youAre ? UNIT_STROKE_OWN : UNIT_STROKE_FOE
    const body = new Graphics()
    body.circle(sx, sy - 8, 12)
    body.fill({ color: colorForClass(u.classId) })
    body.stroke({ color: ring, width: 2 })
    this.unitsLayer.addChild(body)

    // SPEC v2 §6.6 — facing wedge. Small triangle on the front of the unit
    // pointing in the camera-relative facing direction. Stays accurate as the
    // camera rotates, since `facingToCameraVector` re-maps the world facing.
    const fv = facingToCameraVector(u.facing, this.cameraRotation)
    if (fv.dx !== 0 || fv.dy !== 0) {
      const wedge = new Graphics()
      const offset = 12 // outside the body radius
      const cx = sx + fv.dx * offset
      const cy = sy - 8 + fv.dy * offset
      // Triangle pointing outward (in screen space) along (fv.dx, fv.dy).
      const perpX = -fv.dy
      const perpY = fv.dx
      const tipX = cx + fv.dx * 6
      const tipY = cy + fv.dy * 6
      const baseAX = cx - fv.dx * 2 + perpX * 4
      const baseAY = cy - fv.dy * 2 + perpY * 4
      const baseBX = cx - fv.dx * 2 - perpX * 4
      const baseBY = cy - fv.dy * 2 - perpY * 4
      wedge.poly([tipX, tipY, baseAX, baseAY, baseBX, baseBY])
      wedge.fill({ color: ring })
      wedge.stroke({ color: TILE_STROKE, width: 1 })
      this.unitsLayer.addChild(wedge)
    }

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
    // The hudLayer sits on the same container as the grid, so we offset by
    // the root stage translation to land at viewport coordinates.
    const originX = -this.root.x
    const originY = -this.root.y

    // Turn banner — top-center, large. YOUR TURN in gold, OPPONENT TURN dim.
    const banner = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 6,
      },
    })
    banner.anchor.set(0.5, 0)
    banner.x = originX + renderer.width / 2
    banner.y = originY + 12
    this.hudLayer.addChild(banner)
    this.turnBanner = banner

    // Sub-line under the banner — "turn 5 · pit".
    const sub = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0x8888aa, letterSpacing: 3 },
    })
    sub.anchor.set(0.5, 0)
    sub.x = originX + renderer.width / 2
    sub.y = originY + 40
    this.hudLayer.addChild(sub)
    this.turnSub = sub

    // Turn timer — top-left, large.
    const timer = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 28,
        fontWeight: 'bold',
        fill: 0x66cc66,
      },
    })
    timer.x = originX + 20
    timer.y = originY + 16
    this.hudLayer.addChild(timer)
    this.turnTimerText = timer

    // Energy pips — top-right. One filled/empty circle per energy slot.
    const pips = new Graphics()
    pips.x = originX + renderer.width - 20
    pips.y = originY + 28
    this.hudLayer.addChild(pips)
    this.energyPipsGfx = pips

    // Key hints — bottom-center. Static; no need to track for updates.
    const hints = new Text({
      text: '[Q]/[E] rotate · [Space] end · [D] defend · [S] scout · [U] use · [Shift+K] kneel · [F3] debug',
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0x6a6a80, letterSpacing: 2 },
    })
    hints.anchor.set(0.5, 1)
    hints.x = originX + renderer.width / 2
    hints.y = originY + renderer.height - 10
    this.hudLayer.addChild(hints)

    // F3 debug overlay (SPEC v2 §6.5, M7.5 DoD) — hidden until toggled.
    const debug = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
        fill: 0xffcc66,
      },
    })
    debug.x = originX + 20
    debug.y = originY + 54
    debug.visible = false
    this.hudLayer.addChild(debug)
    this.debugText = debug
  }

  private refreshHud(): void {
    const your = this.state.currentTurn === this.youAre
    const energy = this.state.energy[this.state.currentTurn] ?? 0
    const max = this.state.maxEnergy[this.state.currentTurn] ?? 0
    const remainingMs = Math.max(0, this.state.turnEndsAt - Date.now())
    const seconds = Math.ceil(remainingMs / 1000)

    if (this.turnBanner) {
      this.turnBanner.text = your ? 'YOUR TURN' : 'OPPONENT TURN'
      this.turnBanner.style.fill = your ? 0xbba040 : 0x6a6a80
    }
    if (this.turnSub) {
      const rotDeg = this.cameraRotation * 90
      this.turnSub.text = `turn ${String(this.state.turnNumber)} · cam ${String(rotDeg)}°`
    }
    if (this.turnTimerText) {
      this.turnTimerText.text = `${String(seconds)}s`
      // Green > 10s, yellow > 5s, red otherwise.
      this.turnTimerText.style.fill =
        seconds > 10 ? 0x66cc66 : seconds > 5 ? 0xddaa33 : 0xcc4444
    }
    if (this.energyPipsGfx) this.drawEnergyPips(this.energyPipsGfx, energy, max)
  }

  /**
   * Render the energy gauge as a row of circles. Filled = available,
   * hollow outline = spent. Anchored to `g.position` (top-right of the HUD).
   */
  private drawEnergyPips(g: Graphics, current: number, max: number): void {
    g.clear()
    const pipRadius = 7
    const gap = 6
    const total = Math.max(max, 1)
    const rowWidth = total * (pipRadius * 2) + (total - 1) * gap
    // Lay out right-to-left so the anchor stays on the right edge.
    for (let i = 0; i < total; i++) {
      const cx = -rowWidth + pipRadius + i * (pipRadius * 2 + gap)
      const filled = i < current
      g.circle(cx, 0, pipRadius)
      if (filled) {
        g.fill({ color: 0xbba040 })
        g.stroke({ color: 0x8a7a30, width: 1 })
      } else {
        g.fill({ color: 0x1a1a28 })
        g.stroke({ color: 0x4a4a5a, width: 1 })
      }
    }
  }

  private refreshDebugOverlay(): void {
    if (!this.debugText || !this.debugOverlayVisible) return
    const rotDeg = this.cameraRotation * 90
    const h = this.hoveredTile
    const hoverStr = h
      ? `(${String(h.x)},${String(h.y)}) h=${String(this.state.grid.tiles[h.y]?.[h.x]?.height ?? 1)}`
      : '—'
    const tweenStr = this.rotationTween ? ' (tween)' : ''
    this.debugText.text = `[F3] rot: ${String(rotDeg)}°${tweenStr} · hover: ${hoverStr}`
  }

}
