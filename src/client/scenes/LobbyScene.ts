// src/client/scenes/LobbyScene.ts
// M5: minimal class picker. Three cards, pick one, click READY.
// Fancy portraits / descriptions land in M9. Matches SPEC §7 M5 DoD:
// "LobbyScene lets each player pick a class before match start."

import { Container, Graphics, Text } from 'pixi.js'
import { CLASS_ABILITIES, CLASS_STATS } from '../../shared/constants.js'
import type { ClassId } from '../../shared/types.js'
import type { Renderer } from '../Renderer.js'
import type { Scene } from '../SceneManager.js'

export interface LobbyHandlers {
  onSelect: (classId: ClassId) => void
  onReady: () => void
}

interface Card {
  container: Container
  border: Graphics
  classId: ClassId
}

const CARD_W = 220
const CARD_H = 320
const CARD_GAP = 24

const CLASS_ORDER: readonly ClassId[] = ['knight', 'mage', 'heretic']

const CLASS_BLURB: Record<ClassId, string> = {
  knight: 'Frontline Bruiser.\nClose distance. Trade hits.\nShield Wall · Vanguard Charge · Iron Stance',
  mage: 'Ranged Glass Cannon.\nControl space, snipe at range.\nCinder Bolt · Ash Cloud · Blink',
  heretic: 'Blood Warlock Trickster.\nTrap in fog, corrupt ground.\nBlood Tithe · Hex Trap · Desecrate',
}

function classAccent(classId: ClassId): number {
  switch (classId) {
    case 'knight':
      return 0x8b0000
    case 'mage':
      return 0x6633aa
    case 'heretic':
      return 0x3a1a1a
  }
}

function classDisplayName(classId: ClassId): string {
  switch (classId) {
    case 'knight':
      return 'ASHEN KNIGHT'
    case 'mage':
      return 'PALE MAGE'
    case 'heretic':
      return 'HERETIC'
  }
}

export class LobbyScene implements Scene {
  readonly root: Container = new Container()
  private readonly cards: Card[] = []
  private readyButton: Container | null = null
  private readyEnabled = false
  private statusText: Text | null = null
  private selected: ClassId | null = null

  constructor(private readonly handlers: LobbyHandlers) {}

  mount(renderer: Renderer): void {
    const title = new Text({
      text: 'CHOOSE YOUR CHAMPION',
      style: {
        fontFamily: 'monospace',
        fontSize: 24,
        fontWeight: 'bold',
        fill: 0xbba040,
        letterSpacing: 6,
      },
    })
    title.anchor.set(0.5, 0)
    title.x = renderer.width / 2
    title.y = 60
    this.root.addChild(title)

    const totalW = CARD_ORDER_WIDTH()
    const startX = (renderer.width - totalW) / 2

    CLASS_ORDER.forEach((classId, i) => {
      const card = this.buildCard(classId)
      card.container.x = startX + i * (CARD_W + CARD_GAP)
      card.container.y = 120
      this.root.addChild(card.container)
      this.cards.push(card)
    })

    this.readyButton = this.buildReadyButton(renderer.width / 2, 120 + CARD_H + 40)
    this.root.addChild(this.readyButton)

    this.statusText = new Text({
      text: 'pick a class, then click READY',
      style: { fontFamily: 'monospace', fontSize: 12, fill: 0x8888aa, letterSpacing: 1 },
    })
    this.statusText.anchor.set(0.5)
    this.statusText.x = renderer.width / 2
    this.statusText.y = renderer.height - 40
    this.root.addChild(this.statusText)
  }

  waitingForOpponent(): void {
    if (this.statusText) this.statusText.text = 'waiting for opponent\u2026'
  }

  destroy(): void {
    this.root.destroy({ children: true })
  }

  private buildCard(classId: ClassId): Card {
    const container = new Container()
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= CARD_W && y <= CARD_H }

    const border = new Graphics()
    border.rect(0, 0, CARD_W, CARD_H)
    border.fill({ color: 0x1a1a28 })
    border.stroke({ color: classAccent(classId), width: 2 })
    container.addChild(border)

    const name = new Text({
      text: classDisplayName(classId),
      style: {
        fontFamily: 'monospace',
        fontSize: 16,
        fontWeight: 'bold',
        fill: classAccent(classId),
        letterSpacing: 3,
      },
    })
    name.anchor.set(0.5, 0)
    name.x = CARD_W / 2
    name.y = 16
    container.addChild(name)

    const portrait = new Graphics()
    portrait.circle(CARD_W / 2, 120, 40)
    portrait.fill({ color: classAccent(classId) })
    portrait.stroke({ color: 0xbba040, width: 2 })
    container.addChild(portrait)

    const stats = CLASS_STATS[classId]
    const kit = CLASS_ABILITIES[classId].join(' · ')
    const details = new Text({
      text:
        `HP ${String(stats.hp)}  DMG ${String(stats.baseAttackDamage)}  RANGE ${String(stats.attackRange)}  SIGHT ${String(stats.sightRange)}\n\n` +
        `${CLASS_BLURB[classId]}\n\n` +
        `abilities: ${kit}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0xaaaacc,
        wordWrap: true,
        wordWrapWidth: CARD_W - 20,
        align: 'center',
      },
    })
    details.anchor.set(0.5, 0)
    details.x = CARD_W / 2
    details.y = 180
    container.addChild(details)

    container.on('pointertap', () => {
      this.pickCard(classId)
    })

    return { container, border, classId }
  }

  private pickCard(classId: ClassId): void {
    this.selected = classId
    for (const card of this.cards) {
      card.border.clear()
      card.border.rect(0, 0, CARD_W, CARD_H)
      card.border.fill({ color: 0x1a1a28 })
      const active = card.classId === classId
      card.border.stroke({ color: active ? 0xbba040 : classAccent(card.classId), width: active ? 4 : 2 })
    }
    this.handlers.onSelect(classId)
    this.setReadyEnabled(true)
    if (this.statusText) this.statusText.text = `${classDisplayName(classId)} selected — click READY`
  }

  private buildReadyButton(cx: number, cy: number): Container {
    const w = 200
    const h = 48
    const container = new Container()
    container.x = cx - w / 2
    container.y = cy
    container.eventMode = 'static'
    container.cursor = 'pointer'

    const bg = new Graphics()
    bg.rect(0, 0, w, h)
    bg.fill({ color: 0x2a2030 })
    bg.stroke({ color: 0x5a5a68, width: 2 })
    container.addChild(bg)

    const label = new Text({
      text: 'READY',
      style: {
        fontFamily: 'monospace',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0x5a5a68,
        letterSpacing: 8,
      },
    })
    label.anchor.set(0.5)
    label.x = w / 2
    label.y = h / 2
    container.addChild(label)

    container.on('pointertap', () => {
      if (!this.readyEnabled || !this.selected) return
      this.handlers.onReady()
      label.text = 'WAITING\u2026'
      this.waitingForOpponent()
    })

    // Stash for enable/disable refresh
    container.label = 'ready-button'
    return container
  }

  private setReadyEnabled(on: boolean): void {
    this.readyEnabled = on
    if (!this.readyButton) return
    for (const child of this.readyButton.children) {
      if (child instanceof Graphics) {
        child.clear()
        child.rect(0, 0, 200, 48)
        child.fill({ color: on ? 0xbba040 : 0x2a2030 })
        child.stroke({ color: on ? 0xddc060 : 0x5a5a68, width: 2 })
      }
      if (child instanceof Text) {
        child.style.fill = on ? 0x1a1a20 : 0x5a5a68
      }
    }
  }
}

function CARD_ORDER_WIDTH(): number {
  return CLASS_ORDER.length * CARD_W + (CLASS_ORDER.length - 1) * CARD_GAP
}
