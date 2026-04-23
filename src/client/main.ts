// src/client/main.ts
// Boot: mount PixiJS into #app, open WS to :8080, on matchStart show MatchScene.
// M2: click a tile to move my unit; press E to end my turn.

import { connect, type NetworkClient } from './network.js'
import { Renderer } from './Renderer.js'
import { SceneManager } from './SceneManager.js'
import { LobbyScene } from './scenes/LobbyScene.js'
import { MatchScene } from './scenes/MatchScene.js'
import { ResultsScene } from './scenes/ResultsScene.js'
import { PerkDraftScene } from './scenes/PerkDraftScene.js'
import { BracketScene } from './scenes/BracketScene.js'
import { SpectatorScene } from './scenes/SpectatorScene.js'
import { TitleScene } from './scenes/TitleScene.js'
import { StatsScene } from './scenes/StatsScene.js'
import { playMusic, playSfx, stopMusic } from './audio.js'
import { manhattanDistance, orthogonalPath } from '../shared/grid.js'
import { CLASS_ABILITIES, CLASS_STATS } from '../shared/constants.js'
import type { AbilityId, BracketState, ClassId, MatchId, PlayerId, Position, UnitId } from '../shared/types.js'

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
      usePickup: () => void
      kneel: () => void
      attackNearest: () => void
      ability: (index: 0 | 1 | 2, target?: { x: number; y: number }) => void
      // M7.5 smoke hooks (SPEC v2 §6.3 / §6.5 / §6.6).
      rotateCamera: (dir: 'ccw' | 'cw') => void
      getCameraRotation: () => 0 | 1 | 2 | 3
      getTileHeight: (x: number, y: number) => number
      getOwnPos: () => { x: number; y: number } | null
      getOwnFacing: () => 'N' | 'E' | 'S' | 'W' | null
      isRotating: () => boolean
      toggleDebugOverlay: () => void
      isDebugOverlayVisible: () => boolean
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

  let titleDismissed = false
  const enterLobby = (): void => {
    if (titleDismissed) return
    titleDismissed = true
    console.log('[client] title dismissed — entering lobby')
    playSfx('ui_click')
    scenes.show(lobby)
  }
  scenes.show(new TitleScene({ onEnter: enterLobby }))
  playMusic('title')

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
  const sendUsePickup = (): void => {
    if (!activeScene) return
    const unit = activeScene.getOwnUnit()
    if (!unit) return
    if (activeScene.currentState.currentTurn !== myPlayerId) return
    net.send({ type: 'action', action: { kind: 'usePickup', unitId: unit.id } })
  }
  window.addEventListener('keydown', (ev) => {
    // SPEC v2 §9.3 keybindings.
    if (ev.key === ' ') {
      ev.preventDefault()
      sendEndTurn()
    }
    // Q/E rotate the camera (client-only — server has no idea). Works in
    // both player and spectator modes — spectator scene forwards to its
    // inner MatchScene.
    const rotTarget = activeScene ?? spectatorScene
    if (ev.key === 'q' || ev.key === 'Q') rotTarget?.rotateCameraCcw()
    if (ev.key === 'e' || ev.key === 'E') rotTarget?.rotateCameraCw()
    if (ev.key === 'd' || ev.key === 'D') sendDefend()
    if (ev.key === 'u' || ev.key === 'U') sendUsePickup()
    if (ev.key === 's' || ev.key === 'S') {
      scoutArmed = true
      console.log('[client] scout armed — click a tile to reveal')
    }
    // Shift+K to kneel — guards against accidental fat-finger surrender.
    if ((ev.key === 'K' || ev.key === 'k') && ev.shiftKey) {
      net.send({ type: 'action', action: { kind: 'kneel' } })
    }
    if (ev.key === 'Escape') scoutArmed = false
    // F3 toggles the SPEC v2 §6.5 debug overlay (rotation + hovered tile height).
    if (ev.key === 'F3') {
      ev.preventDefault()
      ;(activeScene ?? spectatorScene)?.toggleDebugOverlay()
    }
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
      usePickup: () => {
        const unit = activeScene?.getOwnUnit()
        if (!unit) return
        net.send({ type: 'action', action: { kind: 'usePickup', unitId: unit.id } })
      },
      kneel: () => {
        net.send({ type: 'action', action: { kind: 'kneel' } })
      },
      attackNearest: sendAttackNearest,
      ability: (index, target) => {
        sendAbility(index, target)
      },
      rotateCamera: (dir) => {
        if (!activeScene) return
        if (dir === 'ccw') activeScene.rotateCameraCcw()
        else activeScene.rotateCameraCw()
      },
      getCameraRotation: () => activeScene?.rotation ?? 0,
      getTileHeight: (x, y) => {
        const state = activeScene?.currentState
        return state?.grid.tiles[y]?.[x]?.height ?? 1
      },
      getOwnPos: () => {
        const u = activeScene?.getOwnUnit()
        return u ? { x: u.pos.x, y: u.pos.y } : null
      },
      getOwnFacing: () => activeScene?.getOwnUnit()?.facing ?? null,
      isRotating: () => activeScene?.isRotating ?? false,
      toggleDebugOverlay: () => activeScene?.toggleDebugOverlay(),
      isDebugOverlayVisible: () => activeScene?.isDebugOverlayVisible ?? false,
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
    playMusic('match')
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
    const surrender = msg.surrender ?? false
    console.log(
      `[client] matchOver: winner=${msg.winner} outcome=${outcome} surrender=${String(surrender)}`,
    )
    if (surrender) playSfx('surrender_bell')
    playSfx(msg.winner === my ? 'match_win' : 'match_loss')
    playMusic('results')
    // Show ResultsScene briefly; BracketScene follows once tournamentUpdate arrives.
    scenes.show(new ResultsScene(msg.winner, my, surrender))
    activeScene = null
  })

  let latestBracket: BracketState | null = null
  let bracketScene: BracketScene | null = null

  net.on('tournamentUpdate', (msg) => {
    latestBracket = msg.bracket
    console.log(`[client] tournamentUpdate: round=${String(msg.bracket.currentRound)}`)
    // If we're showing BracketScene, update it live.
    if (bracketScene && scenes.active === bracketScene) {
      bracketScene.update(msg.bracket)
    }
    // After a matchOver, switch to bracket view.
    if (!activeScene && myPlayerId && !(scenes.active instanceof MatchScene)) {
      const my = myPlayerId
      bracketScene = new BracketScene(msg.bracket, my, {
        onSpectate: (mid) => net.send({ type: 'spectate', matchId: mid as MatchId }),
      })
      scenes.show(bracketScene)
    }
  })

  net.on('perkOptions', (msg) => {
    const my = myPlayerId
    if (!my) return
    console.log(`[client] perkOptions: ${msg.perks.join(', ')}`)
    scenes.show(new PerkDraftScene(msg.perks, {
      onSelect: (perkId) => {
        net.send({ type: 'selectPerk', perkId })
        // Show bracket while waiting for next round.
        if (latestBracket) {
          bracketScene = new BracketScene(latestBracket, my, {
            onSpectate: (mid) => net.send({ type: 'spectate', matchId: mid as MatchId }),
          })
          scenes.show(bracketScene)
        }
      },
    }))
  })

  let spectatorScene: SpectatorScene | null = null

  const leaveSpectator = (): void => {
    net.send({ type: 'leaveSpectator' })
    spectatorScene = null
    activeScene = null
    // Back to the bracket. latestBracket is always populated at this point —
    // a player can only spectate after matchOver + tournamentUpdate.
    if (latestBracket && myPlayerId) {
      const my = myPlayerId
      bracketScene = new BracketScene(latestBracket, my, {
        onSpectate: (mid) => net.send({ type: 'spectate', matchId: mid as MatchId }),
      })
      scenes.show(bracketScene)
    }
  }

  net.on('tournamentComplete', (msg) => {
    const my = myPlayerId
    if (!my) return
    console.log(`[client] tournamentComplete: champion=${msg.champion}`)
    // Clear any live match / spectator references so the stats screen owns
    // the viewport exclusively.
    activeScene = null
    bracketScene = null
    stopMusic()
    scenes.show(new StatsScene(msg.champion, msg.bracket, my, {
      onPlayAgain: () => {
        // Full page reload is the simplest "reset" — reconnects a fresh
        // socket, lands on TitleScene, server sees a new pid.
        window.location.reload()
      },
    }))
  })

  net.on('spectatorState', (msg) => {
    if (spectatorScene) {
      spectatorScene.update(msg.match)
      return
    }
    console.log(`[client] spectate: match=${msg.match.matchId}`)
    spectatorScene = new SpectatorScene(msg.match, { onLeave: leaveSpectator })
    // Clear any stale match/bracket scene pointers so the keyboard handlers
    // route Q/E to the spectator's inner MatchScene via scenes.active.
    activeScene = null
    scenes.show(spectatorScene)
  })
}

void main()
