// src/client/scenes/ResultsScene.ts
// Post-match banner. M3 ships the minimum: "VICTORY" / "DEFEAT" text on a
// dim background. Coward's Brand dramatic sequence lands in M12.

import { Container, Graphics, Text } from 'pixi.js'
import type { PlayerId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export class ResultsScene implements Scene {
  readonly root: Container = new Container()

  constructor(
    private readonly winner: PlayerId | null,
    private readonly youAre: PlayerId,
  ) {}

  mount(renderer: Renderer): void {
    const dim = new Graphics()
    dim.rect(0, 0, renderer.width, renderer.height)
    dim.fill({ color: 0x0a0a15, alpha: 0.85 })
    this.root.addChild(dim)

    const outcome =
      this.winner === null
        ? 'DRAW'
        : this.winner === this.youAre
          ? 'VICTORY'
          : 'DEFEAT'
    const color =
      outcome === 'VICTORY' ? 0xbba040 : outcome === 'DEFEAT' ? 0x8b0000 : 0xaaaacc

    const banner = new Text({
      text: outcome,
      style: {
        fontFamily: 'monospace',
        fontSize: 48,
        fontWeight: 'bold',
        fill: color,
        letterSpacing: 8,
      },
    })
    banner.anchor.set(0.5)
    banner.x = renderer.width / 2
    banner.y = renderer.height / 2 - 20
    this.root.addChild(banner)

    const sub = new Text({
      text: 'the arena remembers',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xaaaacc,
        letterSpacing: 2,
      },
    })
    sub.anchor.set(0.5)
    sub.x = renderer.width / 2
    sub.y = renderer.height / 2 + 24
    this.root.addChild(sub)
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }
}
