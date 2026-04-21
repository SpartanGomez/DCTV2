// src/server/index.ts
// M2: WS server accepts action messages, validates + applies them via
// GameEngine, broadcasts authoritative state back to both players.
// M6 will filter stateUpdate per-player for fog.

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { SERVER_VERSION, TURN_TIMER_MS } from '../shared/constants.js'
import {
  matchId as makeMatchId,
  playerId as makePlayerId,
  type ClientMessage,
  type GameAction,
  type MatchId,
  type MatchState,
  type PlayerId,
  type ServerErrorCode,
  type ServerMessage,
} from '../shared/types.js'
import {
  applyAttack,
  applyEndTurn,
  applyMove,
  applyScout,
  createMatch,
  resolveMatchEnd,
} from './GameEngine.js'
import {
  validateAttack,
  validateEndTurn,
  validateMove,
  validateScout,
} from './validators.js'
import {
  applyAbility,
  applyDefend,
  resolveTrapTriggers,
  validateAbility,
  validateDefend,
} from './abilities.js'
import { filterForPlayer } from './Fog.js'
import { applyUsePickup, validateUsePickup } from './pickups.js'
import type { ClassId } from '../shared/types.js'

const PORT = Number(process.env.PORT ?? 8080)
const startedAt = Date.now()

/**
 * Per-turn ms budget. Production uses the locked SPEC value; tests and
 * local dev can shrink it via `DCT_TURN_TIMER_MS` to keep smoke cycles
 * fast (SPEC §25.1 ergonomics — dev cheats never override in prod).
 */
const TURN_TIMER =
  process.env.NODE_ENV !== 'production' && process.env.DCT_TURN_TIMER_MS
    ? Number(process.env.DCT_TURN_TIMER_MS)
    : TURN_TIMER_MS

interface WaitingPlayer {
  id: PlayerId
  socket: WebSocket
  classId: ClassId | null
  ready: boolean
}

interface ActiveMatch {
  id: MatchId
  state: MatchState
  sockets: Map<PlayerId, WebSocket>
  turnTimer: NodeJS.Timeout | null
}

const waiting: WaitingPlayer[] = []
const matches = new Map<MatchId, ActiveMatch>()
const playerToMatch = new Map<PlayerId, MatchId>()

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message))
}

function broadcast(match: ActiveMatch, message: ServerMessage): void {
  for (const socket of match.sockets.values()) send(socket, message)
}

/**
 * Broadcast a fog-filtered `stateUpdate` (or `matchStart`) — each socket
 * gets the per-player view. SPEC §11 makes this non-optional.
 */
function broadcastFogFiltered(
  match: ActiveMatch,
  kind: 'stateUpdate' | 'matchStart',
  extra?: { youAre?: PlayerId },
): void {
  for (const [pid, socket] of match.sockets) {
    const view = filterForPlayer(match.state, pid)
    if (kind === 'matchStart' && extra?.youAre !== undefined) {
      // Per-player matchStart — youAre is always the recipient.
      send(socket, { type: 'matchStart', match: view, youAre: pid })
    } else {
      send(socket, { type: 'stateUpdate', match: view })
    }
  }
}

function isClientMessage(v: unknown): v is ClientMessage {
  if (typeof v !== 'object' || v === null) return false
  if (!('type' in v)) return false
  return typeof v.type === 'string'
}

function sendActionResult(
  socket: WebSocket,
  ok: boolean,
  eventId: string,
  error?: ServerErrorCode,
): void {
  const msg: ServerMessage = error
    ? { type: 'actionResult', ok, error, eventId }
    : { type: 'actionResult', ok, eventId }
  send(socket, msg)
}

function clearTurnTimer(match: ActiveMatch): void {
  if (match.turnTimer) {
    clearTimeout(match.turnTimer)
    match.turnTimer = null
  }
}

/**
 * Schedule the auto-end-turn for the current turn. SPEC §19: server is
 * authoritative on turn expiry — clients display the countdown derived
 * from `turnEndsAt` but never decide timeouts themselves.
 */
function scheduleTurnTimer(match: ActiveMatch): void {
  clearTurnTimer(match)
  if (match.state.phase !== 'active') return
  const ms = Math.max(0, match.state.turnEndsAt - Date.now())
  match.turnTimer = setTimeout(() => {
    match.turnTimer = null
    if (match.state.phase !== 'active') return
    const result = applyEndTurn(match.state, Date.now(), TURN_TIMER)
    match.state = result.state
    broadcastFogFiltered(match, 'stateUpdate')
    broadcast(match, {
      type: 'turnStart',
      playerId: result.nextPlayer,
      endsAt: match.state.turnEndsAt,
    })
    console.log(
      `[server] match ${match.id} turn ${String(match.state.turnNumber)} auto-ended (timeout) \u2192 ${result.nextPlayer}`,
    )
    scheduleTurnTimer(match)
  }, ms)
}

function pairIfReady(): void {
  while (true) {
    const readyPair = takeFirstTwoReady()
    if (!readyPair) return
    const [a, b] = readyPair
    const mid = makeMatchId(randomUUID())
    const state = createMatch({
      matchId: mid,
      playerA: a.id,
      playerB: b.id,
      classA: a.classId ?? 'knight',
      classB: b.classId ?? 'knight',
      turnTimerMs: TURN_TIMER,
    })
    const sockets = new Map<PlayerId, WebSocket>()
    sockets.set(a.id, a.socket)
    sockets.set(b.id, b.socket)
    const match: ActiveMatch = { id: mid, state, sockets, turnTimer: null }
    matches.set(mid, match)
    playerToMatch.set(a.id, mid)
    playerToMatch.set(b.id, mid)
    broadcastFogFiltered(match, 'matchStart', { youAre: a.id })
    console.log(
      `[server] match ${mid} started: ${a.id} (${String(a.classId)}) vs ${b.id} (${String(b.classId)}), first turn ${state.currentTurn}`,
    )
    scheduleTurnTimer(match)
  }
}

function takeFirstTwoReady(): [WaitingPlayer, WaitingPlayer] | null {
  const readyIdxs: number[] = []
  for (let i = 0; i < waiting.length && readyIdxs.length < 2; i++) {
    const w = waiting[i]
    if (w && w.ready && w.classId !== null) readyIdxs.push(i)
  }
  if (readyIdxs.length < 2) return null
  const [i0, i1] = readyIdxs
  if (i0 === undefined || i1 === undefined) return null
  const a = waiting[i0]
  const b = waiting[i1]
  if (!a || !b) return null
  // Remove in descending order so the first index stays valid.
  waiting.splice(i1, 1)
  waiting.splice(i0, 1)
  return [a, b]
}

function removeWaiting(id: PlayerId): void {
  const idx = waiting.findIndex((w) => w.id === id)
  if (idx >= 0) waiting.splice(idx, 1)
}

function dropMatch(match: ActiveMatch): void {
  clearTurnTimer(match)
  for (const pid of match.sockets.keys()) playerToMatch.delete(pid)
  matches.delete(match.id)
}

function handleAction(pid: PlayerId, socket: WebSocket, action: GameAction): void {
  const mid = playerToMatch.get(pid)
  const match = mid ? matches.get(mid) : undefined
  const eventId = randomUUID()
  if (!match) {
    sendActionResult(socket, false, eventId, 'match_not_active')
    return
  }

  switch (action.kind) {
    case 'move': {
      const result = validateMove(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      match.state = applyMove(match.state, action, result.cost)
      const trapRes = resolveTrapTriggers(match.state, pid, action.path)
      match.state = trapRes.state
      sendActionResult(socket, true, eventId)
      if (trapRes.killed) {
        const end = resolveMatchEnd(match.state)
        if (end.over) {
          clearTurnTimer(match)
          const finalState: MatchState = {
            ...match.state,
            phase: 'over',
            ...(end.winner ? { winner: end.winner } : {}),
          }
          match.state = finalState
          broadcastFogFiltered(match, 'stateUpdate')
          if (end.winner) {
            broadcast(match, { type: 'matchOver', winner: end.winner, final: finalState })
            console.log(`[server] match ${match.id} over: winner=${end.winner} (hex trap)`)
          }
          return
        }
      }
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'defend': {
      const result = validateDefend(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const res = applyDefend(match.state, action, result.cost)
      match.state = res.state
      sendActionResult(socket, true, eventId)
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'ability': {
      const result = validateAbility(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const applyRes = applyAbility(match.state, action, result.cost, result.hpCost ?? 0)
      match.state = applyRes.state
      sendActionResult(socket, true, eventId)
      if (applyRes.killed) {
        const end = resolveMatchEnd(match.state)
        if (end.over) {
          clearTurnTimer(match)
          const finalState: MatchState = {
            ...match.state,
            phase: 'over',
            ...(end.winner ? { winner: end.winner } : {}),
          }
          match.state = finalState
          broadcastFogFiltered(match, 'stateUpdate')
          if (end.winner) {
            broadcast(match, { type: 'matchOver', winner: end.winner, final: finalState })
            console.log(`[server] match ${match.id} over: winner=${end.winner} (ability)`)
          }
          return
        }
      }
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'attack': {
      const result = validateAttack(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const attackResult = applyAttack(match.state, action, result.cost)
      match.state = attackResult.state
      sendActionResult(socket, true, eventId)

      if (attackResult.killed) {
        const end = resolveMatchEnd(match.state)
        if (end.over) {
          clearTurnTimer(match)
          const finalState: MatchState = {
            ...match.state,
            phase: 'over',
            ...(end.winner ? { winner: end.winner } : {}),
          }
          match.state = finalState
          broadcastFogFiltered(match, 'stateUpdate')
          if (end.winner) {
            broadcast(match, { type: 'matchOver', winner: end.winner, final: finalState })
            console.log(
              `[server] match ${match.id} over: winner=${end.winner} (knockout)`,
            )
          } else {
            console.log(`[server] match ${match.id} over: double-KO`)
          }
          return
        }
      }
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'endTurn': {
      const result = validateEndTurn(match.state, pid)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const next = applyEndTurn(match.state, Date.now(), TURN_TIMER)
      match.state = next.state
      sendActionResult(socket, true, eventId)
      broadcastFogFiltered(match, 'stateUpdate')
      if (next.ended) {
        clearTurnTimer(match)
        if (next.ended.winner) {
          broadcast(match, { type: 'matchOver', winner: next.ended.winner, final: match.state })
          console.log(
            `[server] match ${match.id} over: winner=${next.ended.winner} (tick DoT)`,
          )
        }
        return
      }
      broadcast(match, {
        type: 'turnStart',
        playerId: next.nextPlayer,
        endsAt: match.state.turnEndsAt,
      })
      scheduleTurnTimer(match)
      return
    }
    case 'scout': {
      const result = validateScout(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      match.state = applyScout(match.state, action, result.cost)
      sendActionResult(socket, true, eventId)
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'usePickup': {
      const result = validateUsePickup(match.state, pid, action)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const res = applyUsePickup(match.state, action, result.cost)
      match.state = res.state
      sendActionResult(socket, true, eventId)
      if (res.chestItem) {
        console.log(
          `[server] match ${match.id} chest opened by ${pid} → ${res.chestItem}`,
        )
      }
      broadcastFogFiltered(match, 'stateUpdate')
      return
    }
    case 'kneel':
      sendActionResult(socket, false, eventId, 'bad_message')
      return
  }
}

function handleMessage(pid: PlayerId, socket: WebSocket, raw: RawData): void {
  let text: string
  if (typeof raw === 'string') text = raw
  else if (Array.isArray(raw)) text = Buffer.concat(raw).toString('utf8')
  else text = Buffer.from(raw as Buffer).toString('utf8')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    send(socket, { type: 'error', code: 'bad_message', reason: 'malformed JSON' })
    return
  }
  if (!isClientMessage(parsed)) {
    send(socket, { type: 'error', code: 'bad_message', reason: 'unknown message shape' })
    return
  }
  switch (parsed.type) {
    case 'action':
      handleAction(pid, socket, parsed.action)
      return
    case 'selectClass': {
      const w = waiting.find((x) => x.id === pid)
      if (w) w.classId = parsed.classId
      return
    }
    case 'ready': {
      const w = waiting.find((x) => x.id === pid)
      if (w) w.ready = true
      pairIfReady()
      return
    }
    case 'joinTournament':
    case 'selectPerk':
    case 'spectate':
    case 'leaveSpectator':
      // M10 wires these up.
      return
  }
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        uptimeMs: Date.now() - startedAt,
        matchesActive: matches.size,
        playersConnected: wss.clients.size,
        playersWaiting: waiting.length,
        serverVersion: SERVER_VERSION,
      }),
    )
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

const wss = new WebSocketServer({ server: http })

wss.on('connection', (socket: WebSocket) => {
  const pid = makePlayerId(randomUUID())
  const sessionToken = randomUUID()
  send(socket, { type: 'hello', serverVersion: SERVER_VERSION, sessionToken })

  waiting.push({ id: pid, socket, classId: null, ready: false })
  console.log(`[server] ${pid} connected (waiting=${String(waiting.length)})`)

  socket.on('message', (raw) => {
    handleMessage(pid, socket, raw)
  })

  socket.on('close', () => {
    removeWaiting(pid)
    const mid = playerToMatch.get(pid)
    if (mid) {
      const match = matches.get(mid)
      if (match) {
        match.sockets.delete(pid)
        if (match.sockets.size === 0) dropMatch(match)
      }
      playerToMatch.delete(pid)
    }
    console.log(`[server] ${pid} disconnected`)
  })
})

http.listen(PORT, () => {
  console.log(`[server] listening on :${String(PORT)} (version ${SERVER_VERSION})`)
})
