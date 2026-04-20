// src/client/network.ts
// WS client with typed message routing. `connect` resolves only after the
// server's `hello` frame arrives; subsequent messages dispatch to listeners
// registered via `on(type, fn)`.

import type { ClientMessage, ServerMessage } from '../shared/types.js'

const DEFAULT_WS_URL = 'ws://localhost:8080'

type HelloMessage = Extract<ServerMessage, { type: 'hello' }>

export interface NetworkClient {
  readonly sessionToken: string
  readonly serverVersion: string
  on<T extends ServerMessage['type']>(
    type: T,
    listener: (msg: Extract<ServerMessage, { type: T }>) => void,
  ): () => void
  send(message: ClientMessage): void
  close(): void
}

function isServerMessage(v: unknown): v is ServerMessage {
  if (typeof v !== 'object' || v === null) return false
  if (!('type' in v)) return false
  return typeof v.type === 'string'
}

class NetworkClientImpl implements NetworkClient {
  readonly sessionToken: string
  readonly serverVersion: string
  private readonly listeners = new Map<string, Set<(m: ServerMessage) => void>>()

  constructor(
    private readonly socket: WebSocket,
    hello: HelloMessage,
  ) {
    this.sessionToken = hello.sessionToken
    this.serverVersion = hello.serverVersion
    socket.addEventListener('message', (ev) => {
      this.handleMessage(ev)
    })
  }

  on<T extends ServerMessage['type']>(
    type: T,
    listener: (msg: Extract<ServerMessage, { type: T }>) => void,
  ): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    const bucket = set
    const generic = listener as (m: ServerMessage) => void
    bucket.add(generic)
    return () => {
      bucket.delete(generic)
    }
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message))
  }

  close(): void {
    this.socket.close()
  }

  private handleMessage(ev: MessageEvent): void {
    if (typeof ev.data !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(ev.data)
    } catch {
      return
    }
    if (!isServerMessage(parsed)) return
    const set = this.listeners.get(parsed.type)
    if (!set) return
    for (const handler of set) handler(parsed)
  }
}

export function connect(url: string = DEFAULT_WS_URL): Promise<NetworkClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)

    const fail = (reason: string): void => {
      socket.removeEventListener('message', onHello)
      socket.removeEventListener('error', onError)
      socket.close()
      reject(new Error(reason))
    }

    const onHello = (ev: MessageEvent): void => {
      if (typeof ev.data !== 'string') {
        fail('expected text frame')
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(ev.data)
      } catch {
        fail('malformed JSON')
        return
      }
      if (!isServerMessage(parsed) || parsed.type !== 'hello') {
        fail('expected hello')
        return
      }
      socket.removeEventListener('message', onHello)
      socket.removeEventListener('error', onError)
      resolve(new NetworkClientImpl(socket, parsed))
    }

    const onError = (): void => {
      fail('websocket error')
    }

    socket.addEventListener('message', onHello)
    socket.addEventListener('error', onError)
  })
}
