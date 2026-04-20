// src/server/index.ts
// M0 entry: boot a WebSocket server + dev /health endpoint.
// M1+ layers the tournament manager, match engine, and fog filter on top.

import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { SERVER_VERSION } from '../shared/constants.js'
import type { ServerMessage } from '../shared/types.js'

const PORT = Number(process.env.PORT ?? 8080)
const startedAt = Date.now()

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        uptimeMs: Date.now() - startedAt,
        matchesActive: 0,
        playersConnected: wss.clients.size,
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
  const hello: ServerMessage = {
    type: 'hello',
    serverVersion: SERVER_VERSION,
    sessionToken: randomUUID(),
  }
  socket.send(JSON.stringify(hello))
})

http.listen(PORT, () => {
  console.log(`[server] listening on :${String(PORT)} (version ${SERVER_VERSION})`)
})
