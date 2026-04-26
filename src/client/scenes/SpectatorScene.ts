// src/client/scenes/SpectatorScene.ts
// SPEC §12 (M12) — eliminated players land here and watch any in-progress
// match. Server streams the unfiltered `spectatorState` so we reuse
// MatchScene's rendering unchanged; this scene just overlays a banner and a
// Back-to-Bracket button, and forwards state updates to the inner scene.

import { Container, Graphics, Text } from 'pixi.js'
import type { MatchState } from '../../shared/types.js'
import { playerId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'
import { MatchScene } from './MatchScene.js'

export interface SpectatorSceneHandlers {
  onLeave: () => void
}

// A stable sentinel PlayerId that cannot match any real player, so the
// inner MatchScene's "own unit" lookups always return null for a spectator.
const SPECTATOR_PID = playerId('__spectator__')

export class SpectatorScene implements Scene {
  readonly root: Container = new Container()
  private readonly inner: MatchScene
  private readonly overlay = new Container()
  private renderer: Renderer | null = null

  constructor(
    state: MatchState,
    private readonly handlers: SpectatorSceneHandlers,
  ) {
    this.inner = new MatchScene(state, SPECTATOR_PID, { onTileClick: () => void 0 })
    this.root.addChild(this.inner.root)
    this.root.addChild(this.overlay)
  }

  mount(renderer: Renderer): void {
    this.renderer = renderer
    this.inner.mount(renderer)
    this.drawOverlay()
  }

  update(state: MatchState): void {
    this.inner.update(state)
  }

  // Delegated camera controls so the keyboard handler in main.ts can route
  // Q/E/F3 through the spectator scene to the inner MatchScene.
  rotateCameraCcw(): void {
    this.inner.rotateCameraCcw()
  }
  rotateCameraCw(): void {
    this.inner.rotateCameraCw()
  }
  toggleDebugOverlay(): void {
    this.inner.toggleDebugOverlay()
  }

  destroy(): void {
    this.inner.destroy()
    this.root.destroy({ children: true })
    this.renderer = null
  }

  private drawOverlay(): void {
    const r = this.renderer
    if (!r) return
    for (const child of this.overlay.removeChildren()) child.destroy()

    // Top banner — "SPECTATING" strip across the top of the viewport.
    const bannerBg = new Graphics()
    bannerBg.rect(0, 0, r.width, 32)
    bannerBg.fill({ color: 0x2a2040, alpha: 0.85 })
    this.overlay.addChild(bannerBg)

    const banner = new Text({
      text: '◉ SPECTATING — read-only view',
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0x8866ff,
        letterSpacing: 3,
      },
    })
    banner.anchor.set(0.5, 0.5)
    banner.x = r.width / 2
    banner.y = 16
    this.overlay.addChild(banner)

    // Back button — top-right of the banner.
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'
    const btnBg = new Graphics()
    btnBg.rect(0, 0, 120, 22)
    btnBg.fill({ color: 0x1a1a28 })
    btnBg.stroke({ color: 0x8866ff, width: 1 })
    const btnLabel = new Text({
      text: '◄ BRACKET',
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0x8866ff, letterSpacing: 2 },
    })
    btnLabel.anchor.set(0.5)
    btnLabel.x = 60
    btnLabel.y = 11
    btn.addChild(btnBg, btnLabel)
    btn.x = r.width - 136
    btn.y = 5
    btn.on('pointertap', () => { this.handlers.onLeave(); })
    this.overlay.addChild(btn)
  }
}
