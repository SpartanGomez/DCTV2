// src/client/scenes/StatsScene.ts
// SPEC §12 (M13) — post-tournament stats screen. Shown once the champion is
// crowned. Displays the champion, the player's own placement, and a
// "PLAY AGAIN" button that reloads the page to reconnect into a fresh
// tournament lobby. Placeholder art only — portrait art lands with M9.

import { Container, Graphics, Text } from 'pixi.js'
import type { BracketState, PlayerId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export interface StatsSceneHandlers {
  onPlayAgain: () => void
}

export class StatsScene implements Scene {
  readonly root: Container = new Container()

  constructor(
    private readonly champion: PlayerId,
    private readonly bracket: BracketState,
    private readonly youAre: PlayerId,
    private readonly handlers: StatsSceneHandlers,
  ) {}

  mount(renderer: Renderer): void {
    const bg = new Graphics()
    bg.rect(0, 0, renderer.width, renderer.height)
    bg.fill({ color: 0x0a0a15 })
    this.root.addChild(bg)

    // Champion banner.
    const championLabel = new Text({
      text: '◆ CHAMPION ◆',
      style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x8888aa,
        letterSpacing: 6,
      },
    })
    championLabel.anchor.set(0.5)
    championLabel.x = renderer.width / 2
    championLabel.y = renderer.height * 0.22
    this.root.addChild(championLabel)

    const championName = new Text({
      text: this.champion.slice(0, 12),
      style: {
        fontFamily: 'monospace',
        fontSize: 32,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 4,
      },
    })
    championName.anchor.set(0.5)
    championName.x = renderer.width / 2
    championName.y = renderer.height * 0.3
    this.root.addChild(championName)

    const placement = this.computePlacement()
    const placementLabel = new Text({
      text:
        placement === 'champion'
          ? '◆ YOU WON ◆'
          : placement === 'unknown'
            ? 'tournament complete'
            : `you were eliminated in ${placement}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 18,
        fill: placement === 'champion' ? 0xbba040 : 0xaaaacc,
        letterSpacing: 3,
      },
    })
    placementLabel.anchor.set(0.5)
    placementLabel.x = renderer.width / 2
    placementLabel.y = renderer.height * 0.48
    this.root.addChild(placementLabel)

    // Bracket summary — small per-round line.
    let y = renderer.height * 0.58
    const roundNames = ['quarterfinals', 'semifinals', 'final']
    this.bracket.rounds.forEach((round, ri) => {
      const winners = round.matches
        .map((m) => (m.winner ?? '—').toString().slice(0, 8))
        .join('  ·  ')
      const line = new Text({
        text: `${roundNames[ri] ?? `round ${String(ri + 1)}`}: ${winners}`,
        style: { fontFamily: 'monospace', fontSize: 12, fill: 0x6666aa, letterSpacing: 2 },
      })
      line.anchor.set(0.5)
      line.x = renderer.width / 2
      line.y = y
      this.root.addChild(line)
      y += 20
    })

    // Play again button.
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'
    const btnBg = new Graphics()
    btnBg.rect(0, 0, 200, 42)
    btnBg.fill({ color: 0x1a1a28 })
    btnBg.stroke({ color: 0xbba040, width: 2 })
    const btnLabel = new Text({
      text: 'PLAY AGAIN',
      style: {
        fontFamily: 'monospace',
        fontSize: 16,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 4,
      },
    })
    btnLabel.anchor.set(0.5)
    btnLabel.x = 100
    btnLabel.y = 21
    btn.addChild(btnBg, btnLabel)
    btn.x = renderer.width / 2 - 100
    btn.y = renderer.height - 110
    btn.on('pointertap', () => this.handlers.onPlayAgain())
    this.root.addChild(btn)
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  /**
   * Walk the bracket rounds in order. If the player was in a match and lost,
   * report the round name; if they won every match they made it to, they're
   * the champion. If they never appeared in the bracket (spectator), return
   * 'unknown'.
   */
  private computePlacement(): 'champion' | 'unknown' | string {
    if (this.champion === this.youAre) return 'champion'
    const roundNames = ['quarterfinals', 'semifinals', 'final']
    for (let i = 0; i < this.bracket.rounds.length; i++) {
      const round = this.bracket.rounds[i]
      if (!round) continue
      for (const m of round.matches) {
        if (!m.players.includes(this.youAre)) continue
        if (m.winner && m.winner !== this.youAre) {
          return roundNames[i] ?? `round ${String(i + 1)}`
        }
      }
    }
    return 'unknown'
  }
}
