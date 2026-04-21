// src/client/scenes/BracketScene.ts
// M10: Tournament bracket view. Shows current standings and match results.
// Shown to eliminated players and between rounds.

import { Container, Graphics, Text } from 'pixi.js'
import type { BracketState, PlayerId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export interface BracketSceneHandlers {
  onSpectate?: (matchId: string) => void
}

export class BracketScene implements Scene {
  readonly root: Container = new Container()
  private bracket: BracketState
  private readonly youAre: PlayerId

  constructor(
    bracket: BracketState,
    youAre: PlayerId,
    private readonly handlers: BracketSceneHandlers = {},
  ) {
    this.bracket = bracket
    this.youAre = youAre
  }

  update(bracket: BracketState): void {
    this.bracket = bracket
    for (const child of this.root.removeChildren()) child.destroy()
    if (this.renderer) this.draw(this.renderer)
  }

  private renderer: Renderer | null = null

  mount(renderer: Renderer): void {
    this.renderer = renderer
    this.draw(renderer)
  }

  destroy(): void {
    this.renderer = null
    this.root.destroy({ children: true })
  }

  private draw(renderer: Renderer): void {
    const bg = new Graphics()
    bg.rect(0, 0, renderer.width, renderer.height)
    bg.fill({ color: 0x0a0a15 })
    this.root.addChild(bg)

    const title = new Text({
      text: 'TOURNAMENT BRACKET',
      style: {
        fontFamily: 'monospace',
        fontSize: 22,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 6,
      },
    })
    title.anchor.set(0.5, 0)
    title.x = renderer.width / 2
    title.y = 32
    this.root.addChild(title)

    const roundNames = ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']

    let x = 40
    const colW = Math.min(240, (renderer.width - 80) / Math.max(1, this.bracket.rounds.length))

    this.bracket.rounds.forEach((round, ri) => {
      const roundLabel = new Text({
        text: roundNames[ri] ?? `ROUND ${String(ri + 1)}`,
        style: { fontFamily: 'monospace', fontSize: 12, fill: 0x8888aa, letterSpacing: 2 },
      })
      roundLabel.x = x
      roundLabel.y = 80
      this.root.addChild(roundLabel)

      let y = 108
      for (const bm of round.matches) {
        const isActive = bm.status === 'active'
        const isDone = bm.status === 'done'
        const cardBg = new Graphics()
        cardBg.rect(x, y, colW - 12, 64)
        cardBg.fill({ color: isActive ? 0x1a2030 : 0x141420 })
        cardBg.stroke({ color: isDone ? 0x3a3a4a : 0x5a5a6a, width: 1 })
        this.root.addChild(cardBg)

        bm.players.forEach((pid, pi) => {
          const isWinner = bm.winner === pid
          const isYou = pid === this.youAre
          const label = new Text({
            text: `${isYou ? '► ' : '  '}${pid.slice(0, 12)}${isWinner ? ' ✓' : ''}`,
            style: {
              fontFamily: 'monospace',
              fontSize: 11,
              fill: isWinner ? 0xbba040 : 0xaaaacc,
              fontWeight: isWinner ? 'bold' : 'normal',
            },
          })
          label.x = x + 8
          label.y = y + 8 + pi * 22
          this.root.addChild(label)
        })

        if (isActive) {
          const watchBtn = new Container()
          watchBtn.eventMode = 'static'
          watchBtn.cursor = 'pointer'
          const btnBg = new Graphics()
          btnBg.rect(0, 0, 52, 18)
          btnBg.fill({ color: 0x2a2040 })
          btnBg.stroke({ color: 0x8866ff, width: 1 })
          const btnLabel = new Text({
            text: 'WATCH',
            style: { fontFamily: 'monospace', fontSize: 9, fill: 0x8866ff },
          })
          btnLabel.anchor.set(0.5)
          btnLabel.x = 26
          btnLabel.y = 9
          watchBtn.addChild(btnBg, btnLabel)
          watchBtn.x = x + colW - 68
          watchBtn.y = y + 22
          watchBtn.on('pointertap', () => this.handlers.onSpectate?.(bm.matchId as string))
          this.root.addChild(watchBtn)
        }

        y += 76
      }
      x += colW
    })

    // Status line at bottom
    const isEliminated = !this.isPlayerAdvancing()
    const statusMsg = isEliminated ? 'you have been eliminated — watch the remaining matches' : 'waiting for next round...'
    const statusText = new Text({
      text: statusMsg,
      style: { fontFamily: 'monospace', fontSize: 12, fill: isEliminated ? 0x8b0000 : 0x8888aa },
    })
    statusText.anchor.set(0.5)
    statusText.x = renderer.width / 2
    statusText.y = renderer.height - 36
    this.root.addChild(statusText)
  }

  private isPlayerAdvancing(): boolean {
    const lastRound = this.bracket.rounds[this.bracket.currentRound]
    if (!lastRound) return false
    return lastRound.matches.some((bm) => bm.winner === this.youAre)
  }
}
