// src/server/index.ts
// M10: WebSocket server routed through TournamentManager.
// All match logic lives in GameEngine; tournament/bracket in TournamentManager.

import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { SERVER_VERSION, TURN_TIMER_MS } from '../shared/constants.js'
import {
  playerId as makePlayerId,
  type ClientMessage,
  type GameAction,
  type MatchId,
  type MatchState,
  type PerkId,
  type PlayerId,
  type ServerErrorCode,
  type ServerMessage,
} from '../shared/types.js'
import {
  applyAttack,
  applyEndTurn,
  applyKneel,
  applyMove,
  applyScout,
  resolveMatchEnd,
} from './GameEngine.js'
import {
  validateAttack,
  validateEndTurn,
  validateKneel,
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
import { TournamentManager } from './TournamentManager.js'
import { botNextAction } from './BotAI.js'

const PORT = Number(process.env.PORT ?? 8080)
const startedAt = Date.now()

const isDev = process.env.NODE_ENV !== 'production'

const TURN_TIMER = isDev && process.env.DCT_TURN_TIMER_MS
  ? Number(process.env.DCT_TURN_TIMER_MS) : TURN_TIMER_MS

const BOT_FILL_WAIT = isDev && process.env.DCT_BOT_FILL_WAIT_MS !== undefined
  ? Number(process.env.DCT_BOT_FILL_WAIT_MS) : undefined

const TOURNAMENT_SIZE_CFG = isDev && process.env.DCT_TOURNAMENT_SIZE
  ? Number(process.env.DCT_TOURNAMENT_SIZE) : undefined

const FORCE_ARENA_SLUG = isDev ? process.env.DCT_FORCE_ARENA : undefined

let tournament = makeTournament()

function makeTournament(): TournamentManager {
  const opts: ConstructorParameters<typeof TournamentManager>[0] = { turnTimerMs: TURN_TIMER, send }
  if (BOT_FILL_WAIT !== undefined) opts.botFillWaitMs = BOT_FILL_WAIT
  if (TOURNAMENT_SIZE_CFG !== undefined) opts.tournamentSize = TOURNAMENT_SIZE_CFG
  if (FORCE_ARENA_SLUG !== undefined) opts.forceArenaSlug = FORCE_ARENA_SLUG
  return new TournamentManager(opts)
}

const sessions = new Map<string, PlayerId>()
const sockets = new Map<PlayerId, WebSocket>()

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message))
}

function sendToPlayer(pid: PlayerId, message: ServerMessage): void {
  const sock = sockets.get(pid)
  if (sock) send(sock, message)
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

interface TournamentSlotLike { playerId: PlayerId; socket: WebSocket | null; isBot: boolean }

function getSlotAt(idx: number): TournamentSlotLike | undefined {
  return (tournament as unknown as { slots: TournamentSlotLike[] }).slots[idx]
}

function broadcastStateUpdate(matchId: MatchId): void {
  const am = tournament.getMatchById(matchId)
  if (!am) return
  for (const slotIdx of [am.slotA, am.slotB]) {
    const slot = getSlotAt(slotIdx)
    if (!slot) continue
    const view = filterForPlayer(am.state, slot.playerId)
    sendToPlayer(slot.playerId, { type: 'stateUpdate', match: view })
  }
}

function broadcastToMatch(matchId: MatchId, msg: ServerMessage): void {
  const am = tournament.getMatchById(matchId)
  if (!am) return
  for (const slotIdx of [am.slotA, am.slotB]) {
    const slot = getSlotAt(slotIdx)
    if (slot) sendToPlayer(slot.playerId, msg)
  }
}

function endMatch(matchId: MatchId, winner: PlayerId, surrender = false): void {
  tournament.clearMatchTimer(matchId)
  const m = tournament.getMatchById(matchId)
  if (!m) return
  const finalState: MatchState = { ...m.state, phase: 'over', winner }
  tournament.updateMatchState(matchId, finalState)
  broadcastToMatch(matchId, {
    type: 'matchOver',
    winner,
    final: finalState,
    ...(surrender ? { surrender: true } : {}),
  })
  tournament.onMatchOver(matchId, winner)
  if (tournament.isComplete()) tournament = makeTournament()
}

function scheduleMatchTimer(matchId: MatchId): void {
  const m = tournament.getMatchById(matchId)
  if (!m || m.state.phase !== 'active') return
  const ms = Math.max(0, m.state.turnEndsAt - Date.now())
  const timer = setTimeout(() => {
    const current = tournament.getMatchById(matchId)
    if (!current || current.state.phase !== 'active') return
    const result = applyEndTurn(current.state, Date.now(), TURN_TIMER)
    tournament.updateMatchState(matchId, result.state)
    broadcastStateUpdate(matchId)
    broadcastToMatch(matchId, {
      type: 'turnStart',
      playerId: result.nextPlayer,
      endsAt: result.state.turnEndsAt,
    })
    console.log(
      `[server] match ${matchId} turn ${String(result.state.turnNumber)} auto-ended (timeout) → ${result.nextPlayer}`,
    )
    if (result.ended) {
      if (result.ended.winner) endMatch(matchId, result.ended.winner)
      return
    }
    driveBotIfNeeded(matchId, result.nextPlayer)
    scheduleMatchTimer(matchId)
  }, ms)
  tournament.setMatchTimer(matchId, timer)
}

function driveBotIfNeeded(matchId: MatchId, currentPlayer: PlayerId): void {
  const slot = tournament.getSlotByPlayer(currentPlayer)
  if (!slot?.isBot) return
  setTimeout(() => runBotTurn(matchId, currentPlayer), 50)
}

function runBotTurn(matchId: MatchId, botId: PlayerId): void {
  const m = tournament.getMatchById(matchId)
  if (!m || m.state.phase !== 'active' || m.state.currentTurn !== botId) return

  for (let i = 0; i < 20; i++) {
    const current = tournament.getMatchById(matchId)
    if (!current || current.state.phase !== 'active') break
    const action = botNextAction(current.state, botId)
    if (!action) break
    applyBotAction(matchId, botId, action)
  }

  const current = tournament.getMatchById(matchId)
  if (!current || current.state.phase !== 'active' || current.state.currentTurn !== botId) return
  const result = applyEndTurn(current.state, Date.now(), TURN_TIMER)
  tournament.updateMatchState(matchId, result.state)
  broadcastStateUpdate(matchId)
  broadcastToMatch(matchId, {
    type: 'turnStart',
    playerId: result.nextPlayer,
    endsAt: result.state.turnEndsAt,
  })
  if (result.ended) {
    if (result.ended.winner) endMatch(matchId, result.ended.winner)
    return
  }
  scheduleMatchTimer(matchId)
  driveBotIfNeeded(matchId, result.nextPlayer)
}

function applyBotAction(matchId: MatchId, botId: PlayerId, action: GameAction): void {
  const m = tournament.getMatchById(matchId)
  if (!m) return
  switch (action.kind) {
    case 'move': {
      const result = validateMove(m.state, botId, action)
      if (!result.ok) return
      let nextState = applyMove(m.state, action, result.cost)
      const trapRes = resolveTrapTriggers(nextState, botId, action.path)
      nextState = trapRes.state
      tournament.updateMatchState(matchId, nextState)
      if (trapRes.killed) {
        const end = resolveMatchEnd(nextState)
        if (end.over && end.winner) endMatch(matchId, end.winner)
      }
      return
    }
    case 'attack': {
      const result = validateAttack(m.state, botId, action)
      if (!result.ok) return
      const r = applyAttack(m.state, action, result.cost)
      tournament.updateMatchState(matchId, r.state)
      if (r.killed) {
        const end = resolveMatchEnd(r.state)
        if (end.over && end.winner) endMatch(matchId, end.winner)
      }
      return
    }
    case 'ability': {
      const result = validateAbility(m.state, botId, action)
      if (!result.ok) return
      const r = applyAbility(m.state, action, result.cost, result.hpCost ?? 0)
      tournament.updateMatchState(matchId, r.state)
      if (r.killed) {
        const end = resolveMatchEnd(r.state)
        if (end.over && end.winner) endMatch(matchId, end.winner)
      }
      return
    }
    default:
      return
  }
}

function handleAction(pid: PlayerId, socket: WebSocket, action: GameAction): void {
  const matchId = tournament.isInMatch(pid)
  const m = matchId ? tournament.getMatchById(matchId) : undefined
  const eventId = randomUUID()

  if (!matchId || !m) {
    sendActionResult(socket, false, eventId, 'match_not_active')
    return
  }

  switch (action.kind) {
    case 'move': {
      const result = validateMove(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      let nextState = applyMove(m.state, action, result.cost)
      const trapRes = resolveTrapTriggers(nextState, pid, action.path)
      nextState = trapRes.state
      tournament.updateMatchState(matchId, nextState)
      sendActionResult(socket, true, eventId)
      if (trapRes.killed) {
        const end = resolveMatchEnd(nextState)
        if (end.over && end.winner) { endMatch(matchId, end.winner); return }
      }
      broadcastStateUpdate(matchId)
      return
    }
    case 'defend': {
      const result = validateDefend(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      const res = applyDefend(m.state, action, result.cost)
      tournament.updateMatchState(matchId, res.state)
      sendActionResult(socket, true, eventId)
      broadcastStateUpdate(matchId)
      return
    }
    case 'ability': {
      const result = validateAbility(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      const applyRes = applyAbility(m.state, action, result.cost, result.hpCost ?? 0)
      tournament.updateMatchState(matchId, applyRes.state)
      sendActionResult(socket, true, eventId)
      if (applyRes.killed) {
        const end = resolveMatchEnd(applyRes.state)
        if (end.over && end.winner) { endMatch(matchId, end.winner); return }
      }
      broadcastStateUpdate(matchId)
      return
    }
    case 'attack': {
      const result = validateAttack(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      const attackResult = applyAttack(m.state, action, result.cost)
      tournament.updateMatchState(matchId, attackResult.state)
      sendActionResult(socket, true, eventId)
      if (attackResult.killed) {
        const end = resolveMatchEnd(attackResult.state)
        if (end.over) {
          tournament.clearMatchTimer(matchId)
          if (end.winner) { endMatch(matchId, end.winner); return }
          broadcastStateUpdate(matchId)
        }
        return
      }
      broadcastStateUpdate(matchId)
      return
    }
    case 'endTurn': {
      const result = validateEndTurn(m.state, pid)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      const next = applyEndTurn(m.state, Date.now(), TURN_TIMER)
      tournament.updateMatchState(matchId, next.state)
      sendActionResult(socket, true, eventId)
      broadcastStateUpdate(matchId)
      if (next.ended) {
        tournament.clearMatchTimer(matchId)
        if (next.ended.winner) endMatch(matchId, next.ended.winner)
        return
      }
      broadcastToMatch(matchId, {
        type: 'turnStart',
        playerId: next.nextPlayer,
        endsAt: next.state.turnEndsAt,
      })
      scheduleMatchTimer(matchId)
      driveBotIfNeeded(matchId, next.nextPlayer)
      return
    }
    case 'scout': {
      const result = validateScout(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      tournament.updateMatchState(matchId, applyScout(m.state, action, result.cost))
      sendActionResult(socket, true, eventId)
      broadcastStateUpdate(matchId)
      return
    }
    case 'usePickup': {
      const result = validateUsePickup(m.state, pid, action)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      const res = applyUsePickup(m.state, action, result.cost)
      tournament.updateMatchState(matchId, res.state)
      sendActionResult(socket, true, eventId)
      broadcastStateUpdate(matchId)
      return
    }
    case 'kneel': {
      const result = validateKneel(m.state, pid)
      if (!result.ok) { sendActionResult(socket, false, eventId, result.code); return }
      tournament.clearMatchTimer(matchId)
      const kneeled = applyKneel(m.state, pid, Date.now())
      tournament.updateMatchState(matchId, kneeled)
      sendActionResult(socket, true, eventId)
      broadcastStateUpdate(matchId)
      if (kneeled.winner) endMatch(matchId, kneeled.winner, true)
      return
    }
  }
}

function handleMessage(pid: PlayerId, socket: WebSocket, raw: RawData): void {
  let text: string
  if (typeof raw === 'string') text = raw
  else if (Array.isArray(raw)) text = Buffer.concat(raw).toString('utf8')
  else text = Buffer.from(raw as Buffer).toString('utf8')

  let parsed: unknown
  try { parsed = JSON.parse(text) }
  catch { send(socket, { type: 'error', code: 'bad_message', reason: 'malformed JSON' }); return }

  if (!isClientMessage(parsed)) {
    send(socket, { type: 'error', code: 'bad_message', reason: 'unknown message shape' })
    return
  }

  switch (parsed.type) {
    case 'action':
      handleAction(pid, socket, parsed.action)
      return
    case 'joinTournament':
    case 'ready': {
      // The slot was created by addPlayer on socket connect; `ready` signals
      // that the client has finished the class-select step and we can start
      // once all slots have signalled the same. selectClass owns class change.
      tournament.markReady(pid)
      return
    }
    case 'selectClass':
      tournament.updateClass(pid, parsed.classId)
      return
    case 'selectPerk':
      tournament.selectPerk(pid, parsed.perkId as PerkId)
      return
    case 'spectate':
      tournament.addSpectator(socket, pid)
      tournament.spectatorWatch(pid, parsed.matchId)
      return
    case 'leaveSpectator':
      tournament.removeSpectator(pid)
      return
  }
}

// In production, the Vite build lands in `./dist/`. The server serves the
// SPA from that directory so a single Node process handles both the static
// bundle and the WS upgrade on the same port — simplifies deploy. In dev,
// Vite handles the static side on :3000 and nothing ever routes through here.
const SERVE_STATIC = process.env.DCT_SERVE_STATIC !== '0'
// Compiled server lives at dist/server/server/index.js; the client bundle
// at dist/client/. From the running server file, `../../client/` lands
// in the right place. In `tsx` dev it resolves to src/server/../client/
// which doesn't exist — DCT_SERVE_STATIC=0 in the dev script keeps this
// path cold, and Vite handles the static side on :3000 instead.
const DIST_ROOT = resolve(fileURLToPath(new URL('../../client/', import.meta.url)))

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveStatic(reqUrl: string, res: ServerResponse): Promise<boolean> {
  // Strip query string and anchor, default "/" to index.html.
  const pathOnly = reqUrl.split('?')[0]?.split('#')[0] ?? '/'
  const rel = pathOnly === '/' ? 'index.html' : pathOnly.replace(/^\/+/, '')
  // Normalize + confine to DIST_ROOT so crafted "../" URLs can't escape.
  const full = normalize(join(DIST_ROOT, rel))
  if (!full.startsWith(DIST_ROOT)) {
    res.writeHead(403).end('forbidden')
    return true
  }
  let filePath = full
  try {
    const s = await stat(filePath)
    if (s.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    // Missing file → SPA fallback to index.html so deep links still work.
    filePath = join(DIST_ROOT, 'index.html')
    try {
      await stat(filePath)
    } catch {
      return false
    }
  }
  try {
    const body = await readFile(filePath)
    const ct = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    res.writeHead(200, {
      'content-type': ct,
      'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=604800',
    })
    res.end(body)
    return true
  } catch {
    return false
  }
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    const t = tournament as unknown as { activeMatches: Map<unknown, unknown> }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      uptimeMs: Date.now() - startedAt,
      matchesActive: t.activeMatches.size,
      playersConnected: wss.clients.size,
      serverVersion: SERVER_VERSION,
    }))
    return
  }
  if (SERVE_STATIC) {
    void serveStatic(req.url ?? '/', res).then((served) => {
      if (served) return
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    })
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

const wss = new WebSocketServer({ server: http })

wss.on('connection', (socket: WebSocket) => {
  const pid = makePlayerId(randomUUID())
  const sessionToken = randomUUID()
  sessions.set(sessionToken, pid)
  sockets.set(pid, socket)
  send(socket, { type: 'hello', serverVersion: SERVER_VERSION, sessionToken })

  // If the previous tournament already declared a champion, start a fresh
  // one eagerly so the new connection's addPlayer lands in `lobby` phase
  // (avoids a race where the complete→recreate transition was still waiting
  // for a socket-close tick).
  if (tournament.isComplete()) tournament = makeTournament()

  // Auto-enqueue into tournament on connect, reusing the socket's pid so
  // that action routing via handleMessage(pid, ...) stays consistent.
  tournament.addPlayer(socket, 'knight', `Player_${pid.slice(0, 6)}`, pid)

  console.log(`[server] ${pid} connected (waiting=${String(wss.clients.size)})`)

  socket.on('message', (raw) => handleMessage(pid, socket, raw))
  socket.on('close', () => {
    sessions.delete(sessionToken)
    sockets.delete(pid)
    const activeMatchId = tournament.isInMatch(pid)
    tournament.removePlayer(pid)
    if (activeMatchId) {
      const m = tournament.getMatchById(activeMatchId)
      if (m && m.state.phase === 'active') {
        const slotA = getSlotAt(m.slotA)
        const slotB = getSlotAt(m.slotB)
        const winner = slotA?.playerId === pid ? slotB?.playerId : slotA?.playerId
        if (winner) endMatch(activeMatchId, winner)
      }
    }
    if (tournament.isComplete()) tournament = makeTournament()
    console.log(`[server] ${pid} disconnected`)
  })
})

http.listen(PORT, () => {
  console.log(`[server] listening on :${String(PORT)} (version ${SERVER_VERSION})`)
})

// Suppress unused import lint for PerkId — it's used in selectPerk cast above.
void (undefined as unknown as typeof sessions)
