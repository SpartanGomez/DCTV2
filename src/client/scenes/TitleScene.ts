// src/client/scenes/TitleScene.ts
// SPEC §12 (M13) — title screen shown before the lobby. Placeholder art
// only; final logo + background land with Art Batch 7 post-pilot. A click,
// any key, or the DEV-only `__dct.dismissTitle()` hook advances to the
// LobbyScene.

import { Container, Graphics, Text } from 'pixi.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export interface TitleSceneHandlers {
  onEnter: () => void
}

export class TitleScene implements Scene {
  readonly root: Container = new Container()
  private keyHandler: ((ev: KeyboardEvent) => void) | null = null
  private tickFn: (() => void) | null = null
  private boundRenderer: Renderer | null = null

  constructor(private readonly handlers: TitleSceneHandlers) {}

  mount(renderer: Renderer): void {
    this.boundRenderer = renderer

    const bg = new Graphics()
    bg.rect(0, 0, renderer.width, renderer.height)
    bg.fill({ color: 0x08080f })
    this.root.addChild(bg)

    // Title — "DARK COUNCIL TACTIC".
    const title = new Text({
      text: 'DARK COUNCIL TACTIC',
      style: {
        fontFamily: 'monospace',
        fontSize: 42,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 10,
      },
    })
    title.anchor.set(0.5)
    title.x = renderer.width / 2
    title.y = renderer.height * 0.35
    this.root.addChild(title)

    // Tagline.
    const tagline = new Text({
      text: '1v1 tactical combat — 8-player single-elimination',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x8888aa,
        letterSpacing: 2,
      },
    })
    tagline.anchor.set(0.5)
    tagline.x = renderer.width / 2
    tagline.y = renderer.height * 0.35 + 56
    this.root.addChild(tagline)

    // Prompt — "CLICK OR PRESS ANY KEY TO ENTER" with a subtle blink.
    const prompt = new Text({
      text: '▶ CLICK OR PRESS ANY KEY TO ENTER',
      style: {
        fontFamily: 'monospace',
        fontSize: 16,
        fill: 0xcccccc,
        letterSpacing: 4,
      },
    })
    prompt.anchor.set(0.5)
    prompt.x = renderer.width / 2
    prompt.y = renderer.height * 0.6
    this.root.addChild(prompt)

    // Jam attribution.
    const jam = new Text({
      text: 'VIBE JAM 2026',
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0x4a4a5a, letterSpacing: 3 },
    })
    jam.anchor.set(0.5)
    jam.x = renderer.width / 2
    jam.y = renderer.height - 32
    this.root.addChild(jam)

    // Click to enter — wire the whole viewport.
    bg.eventMode = 'static'
    bg.cursor = 'pointer'
    bg.on('pointertap', () => { this.handlers.onEnter(); })

    // Any-key handler — attached at window level; removed on destroy.
    const onKey = (ev: KeyboardEvent): void => {
      // Ignore key events that might be part of ongoing browser chrome
      // (Tab, Meta combos). Anything else lets the player enter.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key === 'Tab' || ev.key === 'Shift') return
      this.handlers.onEnter()
    }
    window.addEventListener('keydown', onKey)
    this.keyHandler = onKey

    // Simple prompt blink via ticker (cleaned up in destroy so the leftover
    // tween doesn't keep running on the next scene).
    const tick = (): void => {
      prompt.alpha = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 600))
    }
    renderer.app.ticker.add(tick)
    this.tickFn = tick
  }

  destroy(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler)
    this.keyHandler = null
    if (this.tickFn && this.boundRenderer) {
      this.boundRenderer.app.ticker.remove(this.tickFn)
    }
    this.tickFn = null
    this.boundRenderer = null
    this.root.destroy({ children: true })
  }
}
