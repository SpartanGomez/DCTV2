// src/server/index.ts
// M1: accept WS connections, hand each player an id + session token,
// pair the first two waiting players into a match and send `matchStart`.
// M2+ will route `action` messages through validators + GameEngine mutations.

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { SERVER_VERSION } from '../shared/constants.js'
import { matchId, playerId, type PlayerId, type ServerMessage } from '../shared/types.js'
import { createMatch } from './GameEngine.js'

const PORT = Number(process.env.PORT ?? 8080)
const startedAt = Date.now()

interface WaitingPlayer {
  id: PlayerId
  socket: WebSocket
}

const waiting: WaitingPlayer[] = []

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message))
}

function pairIfReady(): void {
  while (waiting.length >= 2) {
    const a = waiting.shift()
    const b = waiting.shift()
    if (!a || !b) return
    const mid = matchId(randomUUID())
    const match = createMatch({ matchId: mid, playerA: a.id, playerB: b.id })
    send(a.socket, { type: 'matchStart', match, youAre: a.id })
    send(b.socket, { type: 'matchStart', match, youAre: b.id })
    console.log(`[server] match ${mid} started: ${a.id} vs ${b.id}`)
  }
}

function removeWaiting(id: PlayerId): void {
  const idx = waiting.findIndex((w) => w.id === id)
  if (idx >= 0) waiting.splice(idx, 1)
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        uptimeMs: Date.now() - startedAt,
        matchesActive: 0,
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
  const pid = playerId(randomUUID())
  const sessionToken = randomUUID()
  send(socket, { type: 'hello', serverVersion: SERVER_VERSION, sessionToken })

  waiting.push({ id: pid, socket })
  console.log(`[server] ${pid} connected (waiting=${String(waiting.length)})`)

  pairIfReady()

  socket.on('close', () => {
    removeWaiting(pid)
    console.log(`[server] ${pid} disconnected`)
  })
})

http.listen(PORT, () => {
  console.log(`[server] listening on :${String(PORT)} (version ${SERVER_VERSION})`)
})
