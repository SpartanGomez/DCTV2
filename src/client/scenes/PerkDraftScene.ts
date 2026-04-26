// src/client/scenes/PerkDraftScene.ts
// M10: Perk draft screen. Shows 3 perk options; player picks 1 for next round.
// Auto-selects first option after PERK_DRAFT_TIMER_MS if no pick made.

import { Container, Graphics, Text } from 'pixi.js'
import { PERK_DRAFT_TIMER_MS } from '../../shared/constants.js'
import type { PerkId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export interface PerkDraftHandlers {
  onSelect: (perkId: PerkId) => void
}

const PERK_BLURB: Record<PerkId, string> = {
  bloodlust: '+1 damage on all attacks',
  second_wind: 'Heal 4 HP at round start',
  scouts_eye: 'Full map vision for first 2 turns',
  energy_surge: '6 energy per turn instead of 5',
  thick_skin: '−1 damage taken (min 1)',
  ghost_step: 'First move each turn costs 0 energy',
  trap_sense: 'Reveals enemy traps within 2 tiles',
  ash_walker: 'Immune to hazard terrain damage',
  first_strike: '+3 damage on the first attack',
  last_stand: 'Below 5 HP: +2 damage on attacks',
  mist_cloak: 'Spawn on a shadow tile',
  fortify: 'Defend blocks 75% instead of 50%',
  long_reach: '+1 to your attack range',
  pillager: 'Pickup actions cost 0 energy',
  counterspell: 'First enemy ability fizzles',
  vampiric_touch: 'Heal 1 HP per successful attack',
}

const PERK_NAME: Record<PerkId, string> = {
  bloodlust: 'BLOODLUST',
  second_wind: 'SECOND WIND',
  scouts_eye: "SCOUT'S EYE",
  energy_surge: 'ENERGY SURGE',
  thick_skin: 'THICK SKIN',
  ghost_step: 'GHOST STEP',
  trap_sense: 'TRAP SENSE',
  ash_walker: 'ASH WALKER',
  first_strike: 'FIRST STRIKE',
  last_stand: 'LAST STAND',
  mist_cloak: 'MIST CLOAK',
  fortify: 'FORTIFY',
  long_reach: 'LONG REACH',
  pillager: 'PILLAGER',
  counterspell: 'COUNTERSPELL',
  vampiric_touch: 'VAMPIRIC TOUCH',
}

const CARD_W = 200
const CARD_H = 260
const CARD_GAP = 28

export class PerkDraftScene implements Scene {
  readonly root: Container = new Container()
  private timerText: Text | null = null
  private deadlineMs: number
  private tickFn: (() => void) | null = null
  private renderer: Renderer | null = null
  private selected = false

  constructor(
    private readonly perks: PerkId[],
    private readonly handlers: PerkDraftHandlers,
  ) {
    this.deadlineMs = Date.now() + PERK_DRAFT_TIMER_MS
  }

  mount(renderer: Renderer): void {
    this.renderer = renderer

    const dim = new Graphics()
    dim.rect(0, 0, renderer.width, renderer.height)
    dim.fill({ color: 0x0a0a15, alpha: 0.9 })
    this.root.addChild(dim)

    const title = new Text({
      text: 'CHOOSE A PERK',
      style: {
        fontFamily: 'monospace',
        fontSize: 26,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 8,
      },
    })
    title.anchor.set(0.5, 0)
    title.x = renderer.width / 2
    title.y = 50
    this.root.addChild(title)

    const sub = new Text({
      text: 'lasts until the end of the next round only',
      style: { fontFamily: 'monospace', fontSize: 12, fill: 0x8888aa, letterSpacing: 1 },
    })
    sub.anchor.set(0.5)
    sub.x = renderer.width / 2
    sub.y = 88
    this.root.addChild(sub)

    const totalW = this.perks.length * CARD_W + (this.perks.length - 1) * CARD_GAP
    const startX = (renderer.width - totalW) / 2

    this.perks.forEach((perkId, i) => {
      const card = this.buildCard(perkId)
      card.x = startX + i * (CARD_W + CARD_GAP)
      card.y = 120
      this.root.addChild(card)
    })

    this.timerText = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 13, fill: 0xaaaacc },
    })
    this.timerText.anchor.set(0.5)
    this.timerText.x = renderer.width / 2
    this.timerText.y = renderer.height - 48
    this.root.addChild(this.timerText)

    this.tickFn = () => { this.refreshTimer(); }
    renderer.app.ticker.add(this.tickFn)
  }

  destroy(): void {
    if (this.tickFn && this.renderer) {
      this.renderer.app.ticker.remove(this.tickFn)
    }
    this.tickFn = null
    this.renderer = null
    this.root.destroy({ children: true })
  }

  private buildCard(perkId: PerkId): Container {
    const container = new Container()
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= CARD_W && y <= CARD_H }

    const bg = new Graphics()
    bg.rect(0, 0, CARD_W, CARD_H)
    bg.fill({ color: 0x1a1a28 })
    bg.stroke({ color: 0x4a4a5c, width: 2 })
    container.addChild(bg)

    const icon = new Graphics()
    icon.circle(CARD_W / 2, 60, 28)
    icon.fill({ color: 0x3a2840 })
    icon.stroke({ color: 0xbba040, width: 2 })
    container.addChild(icon)

    const name = new Text({
      text: PERK_NAME[perkId],
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 2,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: CARD_W - 16,
      },
    })
    name.anchor.set(0.5, 0)
    name.x = CARD_W / 2
    name.y = 106
    container.addChild(name)

    const desc = new Text({
      text: PERK_BLURB[perkId],
      style: {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0xaaaacc,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: CARD_W - 20,
      },
    })
    desc.anchor.set(0.5, 0)
    desc.x = CARD_W / 2
    desc.y = 148
    container.addChild(desc)

    container.on('pointertap', () => {
      if (this.selected) return
      this.selected = true
      bg.clear()
      bg.rect(0, 0, CARD_W, CARD_H)
      bg.fill({ color: 0x2a1a40 })
      bg.stroke({ color: 0xbba040, width: 4 })
      this.handlers.onSelect(perkId)
    })
    container.on('pointerover', () => { if (!this.selected) bg.tint = 0x998833 })
    container.on('pointerout', () => { bg.tint = 0xffffff })

    return container
  }

  private refreshTimer(): void {
    if (!this.timerText) return
    const remaining = Math.max(0, Math.ceil((this.deadlineMs - Date.now()) / 1000))
    this.timerText.text = `auto-picks in ${String(remaining)}s`
  }
}
