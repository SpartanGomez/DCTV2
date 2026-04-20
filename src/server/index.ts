// src/server/index.ts
// M2: WS server accepts action messages, validates + applies them via
// GameEngine, broadcasts authoritative state back to both players.
// M6 will filter stateUpdate per-player for fog.

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { SERVER_VERSION } from '../shared/constants.js'
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
import { applyAttack, applyEndTurn, applyMove, createMatch, resolveMatchEnd } from './GameEngine.js'
import { validateAttack, validateEndTurn, validateMove } from './validators.js'

const PORT = Number(process.env.PORT ?? 8080)
const startedAt = Date.now()

interface WaitingPlayer {
  id: PlayerId
  socket: WebSocket
}

interface ActiveMatch {
  id: MatchId
  state: MatchState
  sockets: Map<PlayerId, WebSocket>
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

function pairIfReady(): void {
  while (waiting.length >= 2) {
    const a = waiting.shift()
    const b = waiting.shift()
    if (!a || !b) return
    const mid = makeMatchId(randomUUID())
    const state = createMatch({ matchId: mid, playerA: a.id, playerB: b.id })
    const sockets = new Map<PlayerId, WebSocket>()
    sockets.set(a.id, a.socket)
    sockets.set(b.id, b.socket)
    const match: ActiveMatch = { id: mid, state, sockets }
    matches.set(mid, match)
    playerToMatch.set(a.id, mid)
    playerToMatch.set(b.id, mid)
    send(a.socket, { type: 'matchStart', match: state, youAre: a.id })
    send(b.socket, { type: 'matchStart', match: state, youAre: b.id })
    console.log(
      `[server] match ${mid} started: ${a.id} vs ${b.id}, first turn ${state.currentTurn}`,
    )
  }
}

function removeWaiting(id: PlayerId): void {
  const idx = waiting.findIndex((w) => w.id === id)
  if (idx >= 0) waiting.splice(idx, 1)
}

function dropMatch(match: ActiveMatch): void {
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
      sendActionResult(socket, true, eventId)
      broadcast(match, { type: 'stateUpdate', match: match.state })
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
          const finalState: MatchState = {
            ...match.state,
            phase: 'over',
            ...(end.winner ? { winner: end.winner } : {}),
          }
          match.state = finalState
          broadcast(match, { type: 'stateUpdate', match: finalState })
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
      broadcast(match, { type: 'stateUpdate', match: match.state })
      return
    }
    case 'endTurn': {
      const result = validateEndTurn(match.state, pid)
      if (!result.ok) {
        sendActionResult(socket, false, eventId, result.code)
        return
      }
      const next = applyEndTurn(match.state, Date.now())
      match.state = next.state
      sendActionResult(socket, true, eventId)
      broadcast(match, { type: 'stateUpdate', match: match.state })
      broadcast(match, {
        type: 'turnStart',
        playerId: next.nextPlayer,
        endsAt: match.state.turnEndsAt,
      })
      return
    }
    case 'defend':
    case 'scout':
    case 'ability':
    case 'usePickup':
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
    case 'joinTournament':
    case 'selectClass':
    case 'ready':
    case 'selectPerk':
    case 'spectate':
    case 'leaveSpectator':
      // M2 ignores these; M5/M10 wire them up.
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

  waiting.push({ id: pid, socket })
  console.log(`[server] ${pid} connected (waiting=${String(waiting.length)})`)

  pairIfReady()

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
