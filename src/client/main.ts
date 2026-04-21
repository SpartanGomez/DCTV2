// src/client/main.ts
// Boot: mount PixiJS into #app, open WS to :8080, on matchStart show MatchScene.
// M2: click a tile to move my unit; press E to end my turn.

import { connect, type NetworkClient } from './network.js'
import { Renderer } from './Renderer.js'
import { SceneManager } from './SceneManager.js'
import { LobbyScene } from './scenes/LobbyScene.js'
import { MatchScene } from './scenes/MatchScene.js'
import { ResultsScene } from './scenes/ResultsScene.js'
import { manhattanDistance, orthogonalPath } from '../shared/grid.js'
import { CLASS_ABILITIES, CLASS_STATS } from '../shared/constants.js'
import type { AbilityId, ClassId, PlayerId, Position, UnitId } from '../shared/types.js'

declare global {
  interface Window {
    /**
     * Test-only handle for Playwright smoke. Present in dev builds only;
     * never referenced by production code. If you find yourself using this
     * from non-test code, stop.
     */
    __dct?: {
      selectClass: (classId: ClassId) => void
      ready: () => void
      move: (x: number, y: number) => void
      endTurn: () => void
      defend: () => void
      scout: (x: number, y: number) => void
      attackNearest: () => void
      ability: (index: 0 | 1 | 2, target?: { x: number; y: number }) => void
    }
  }
}

function setBootText(text: string): void {
  const boot = document.getElementById('boot')
  if (boot) boot.textContent = text
}

function hideBoot(): void {
  const boot = document.getElementById('boot')
  if (boot) boot.style.display = 'none'
}

async function main(): Promise<void> {
  const mount = document.getElementById('app')
  if (!mount) {
    console.error('[client] missing #app mount')
    return
  }

  setBootText('Dark Council Tactic — connecting…')

  let renderer: Renderer
  try {
    renderer = await Renderer.create(mount)
  } catch (err: unknown) {
    console.error('[client] renderer failed to init:', err)
    setBootText('Dark Council Tactic — renderer failed')
    return
  }

  const scenes = new SceneManager(renderer)

  let net: NetworkClient
  try {
    net = await connect()
  } catch (err: unknown) {
    console.error('[client] failed to connect to server:', err)
    setBootText('Dark Council Tactic — server offline')
    return
  }

  console.log(`[client] hello from server (version ${net.serverVersion})`)
  hideBoot()

  let activeScene: MatchScene | null = null
  let myPlayerId: PlayerId | null = null
  let myClass: ClassId = 'knight'

  const lobby = new LobbyScene({
    onSelect: (classId) => {
      myClass = classId
      net.send({ type: 'selectClass', classId })
      console.log(`[client] selectClass: ${classId}`)
    },
    onReady: () => {
      net.send({ type: 'ready' })
      console.log(`[client] ready`)
    },
  })
  scenes.show(lobby)

  const sendMove = (target: Position): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    const state = activeScene.currentState
    if (state.currentTurn !== myPlayerId) return
    if (unit.pos.x === target.x && unit.pos.y === target.y) return
    // If target is occupied by an enemy in attack range, send attack instead.
    const enemyHere = state.units.find(
      (u) => u.ownerId !== myPlayerId && u.hp > 0 && u.pos.x === target.x && u.pos.y === target.y,
    )
    if (enemyHere) {
      const range = CLASS_STATS[unit.classId].attackRange
      if (manhattanDistance(unit.pos, enemyHere.pos) <= range) {
        net.send({
          type: 'action',
          action: { kind: 'attack', unitId: unit.id, targetId: enemyHere.id },
        })
      }
      return
    }
    const path = orthogonalPath(unit.pos, target)
    if (path.length === 0) return
    net.send({ type: 'action', action: { kind: 'move', unitId: unit.id, path } })
  }

  const sendEndTurn = (): void => {
    if (!activeScene) return
    if (activeScene.currentState.currentTurn !== myPlayerId) return
    net.send({ type: 'action', action: { kind: 'endTurn' } })
  }

  const sendAttackNearest = (): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    const state = activeScene.currentState
    const enemies = state.units.filter((u) => u.ownerId !== myPlayerId && u.hp > 0)
    const first = enemies[0]
    if (!first) return
    const nearest = enemies.reduce((best, u) =>
      manhattanDistance(u.pos, unit.pos) < manhattanDistance(best.pos, unit.pos) ? u : best,
    first)
    const targetId: UnitId = nearest.id
    net.send({ type: 'action', action: { kind: 'attack', unitId: unit.id, targetId } })
  }

  const sendDefend = (): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    if (activeScene.currentState.currentTurn !== myPlayerId) return
    net.send({ type: 'action', action: { kind: 'defend', unitId: unit.id } })
  }

  const sendScout = (center: Position): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    if (activeScene.currentState.currentTurn !== myPlayerId) return
    net.send({ type: 'action', action: { kind: 'scout', unitId: unit.id, center } })
  }

  const sendAbility = (index: 0 | 1 | 2, target?: Position): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    if (activeScene.currentState.currentTurn !== myPlayerId) return
    const kit = CLASS_ABILITIES[unit.classId]
    const abilityId: AbilityId | undefined = kit[index]
    if (!abilityId) return
    // For self-targeted abilities (shield_wall, iron_stance, blood_tithe)
    // we don't need a target. For targeted abilities we need the target.
    const needsTarget = !['shield_wall', 'iron_stance', 'blood_tithe'].includes(abilityId)
    if (needsTarget && !target) return
    // For attack-like abilities we may need targetId instead; smoke uses
    // the __dct.ability hook which passes a target Position — client picks
    // nearest enemy if that position matches one.
    let targetId: UnitId | undefined
    if (abilityId === 'cinder_bolt' && target) {
      const enemy = activeScene.currentState.units.find(
        (u) => u.ownerId !== myPlayerId && u.hp > 0 && u.pos.x === target.x && u.pos.y === target.y,
      )
      if (!enemy) return
      targetId = enemy.id
    }
    net.send({
      type: 'action',
      action: {
        kind: 'ability',
        unitId: unit.id,
        abilityId,
        ...(target ? { target } : {}),
        ...(targetId ? { targetId } : {}),
      },
    })
  }

  // Press S then click a tile to scout that 3×3 area.
  let scoutArmed = false
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'e' || ev.key === 'E') sendEndTurn()
    if (ev.key === 'd' || ev.key === 'D') sendDefend()
    if (ev.key === 's' || ev.key === 'S') {
      scoutArmed = true
      console.log('[client] scout armed — click a tile to reveal')
    }
    if (ev.key === 'Escape') scoutArmed = false
  })
  const wrappedSendMove = sendMove
  const scoutingAwareTileClick = (pos: Position): void => {
    if (scoutArmed) {
      scoutArmed = false
      sendScout(pos)
      return
    }
    wrappedSendMove(pos)
  }

  if (import.meta.env.DEV) {
    // Test-only hook. Bypasses client-side UX guards so smoke tests can
    // verify server-authoritative rejection paths (e.g. not_your_turn).
    window.__dct = {
      selectClass: (classId) => {
        myClass = classId
        net.send({ type: 'selectClass', classId })
      },
      ready: () => {
        net.send({ type: 'ready' })
      },
      move: (x, y) => {
        const unit = activeScene?.getOwnUnit()
        if (!unit) return
        const path = orthogonalPath(unit.pos, { x, y })
        if (path.length === 0) return
        net.send({ type: 'action', action: { kind: 'move', unitId: unit.id, path } })
      },
      endTurn: () => {
        net.send({ type: 'action', action: { kind: 'endTurn' } })
      },
      defend: () => {
        const unit = activeScene?.getOwnUnit()
        if (!unit) return
        net.send({ type: 'action', action: { kind: 'defend', unitId: unit.id } })
      },
      scout: (x, y) => {
        const unit = activeScene?.getOwnUnit()
        if (!unit) return
        net.send({
          type: 'action',
          action: { kind: 'scout', unitId: unit.id, center: { x, y } },
        })
      },
      attackNearest: sendAttackNearest,
      ability: (index, target) => {
        sendAbility(index, target)
      },
    }
  }

  net.on('matchStart', (msg) => {
    myPlayerId = msg.youAre
    const myUnit = msg.match.units.find((u) => u.ownerId === msg.youAre)
    const myClassFromState = myUnit?.classId ?? myClass
    console.log(
      `[client] matchStart: match=${msg.match.matchId} units=${String(msg.match.units.length)} youAre=${msg.youAre} class=${myClassFromState} currentTurn=${msg.match.currentTurn}`,
    )
    hideBoot()
    activeScene = new MatchScene(msg.match, msg.youAre, { onTileClick: scoutingAwareTileClick })
    scenes.show(activeScene)
  })

  net.on('stateUpdate', (msg) => {
    if (activeScene) activeScene.update(msg.match)
    const my = msg.match.units.find((u) => u.ownerId === myPlayerId)
    const foe = msg.match.units.find((u) => u.ownerId !== myPlayerId)
    const fmt = (p: { x: number; y: number } | undefined) =>
      p ? `(${String(p.x)},${String(p.y)})` : '—'
    console.log(
      `[client] stateUpdate: turn=${msg.match.currentTurn} turnN=${String(msg.match.turnNumber)} myPos=${fmt(my?.pos)} foePos=${fmt(foe?.pos)}`,
    )
  })

  net.on('actionResult', (msg) => {
    if (!msg.ok) {
      console.log(`[client] actionResult: rejected (${msg.error ?? 'unknown'})`)
    } else {
      console.log(`[client] actionResult: ok eventId=${msg.eventId ?? ''}`)
    }
  })

  net.on('turnStart', (msg) => {
    console.log(`[client] turnStart: ${msg.playerId}`)
  })

  net.on('error', (msg) => {
    console.error(`[client] server error: ${msg.code} — ${msg.reason}`)
  })

  net.on('matchOver', (msg) => {
    const my = myPlayerId
    if (!my) return
    const outcome = msg.winner === my ? 'VICTORY' : 'DEFEAT'
    console.log(
      `[client] matchOver: winner=${msg.winner} outcome=${outcome} surrender=${String(msg.surrender ?? false)}`,
    )
    scenes.show(new ResultsScene(msg.winner, my))
    activeScene = null
  })
}

void main()
