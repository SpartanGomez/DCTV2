// src/client/network.ts
// M0: minimum viable WS client. M1 adds request/response routing, reconnect, etc.

import type { ServerMessage } from '../shared/types.js'

const DEFAULT_WS_URL = 'ws://localhost:8080'

function isServerMessage(v: unknown): v is ServerMessage {
  if (typeof v !== 'object' || v === null) return false
  if (!('type' in v)) return false
  return typeof v.type === 'string'
}

export interface NetworkConnection {
  socket: WebSocket
  hello: Extract<ServerMessage, { type: 'hello' }>
}

export function connect(url: string = DEFAULT_WS_URL): Promise<NetworkConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)

    const onFail = (reason: string): void => {
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('error', onError)
      reject(new Error(reason))
    }

    const onMessage = (ev: MessageEvent): void => {
      if (typeof ev.data !== 'string') {
        onFail('expected text frame, got binary')
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(ev.data)
      } catch {
        onFail('malformed JSON frame')
        return
      }
      if (!isServerMessage(parsed)) {
        onFail('frame is not a ServerMessage')
        return
      }
      if (parsed.type !== 'hello') {
        onFail(`expected hello, got ${parsed.type}`)
        return
      }
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('error', onError)
      resolve({ socket, hello: parsed })
    }

    const onError = (): void => {
      onFail('websocket error')
    }

    socket.addEventListener('message', onMessage)
    socket.addEventListener('error', onError)
  })
}
