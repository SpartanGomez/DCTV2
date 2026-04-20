// src/client/main.ts
// Boot: mount PixiJS into #app, open WS to :8080, on matchStart show MatchScene.
// M1 scope: the second tab triggers the pairing; both tabs then render the match.

import { connect } from './network.js'
import { Renderer } from './Renderer.js'
import { SceneManager } from './SceneManager.js'
import { MatchScene } from './scenes/MatchScene.js'

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

  let net
  try {
    net = await connect()
  } catch (err: unknown) {
    console.error('[client] failed to connect to server:', err)
    setBootText('Dark Council Tactic — server offline')
    return
  }

  console.log(`[client] hello from server (version ${net.serverVersion})`)
  setBootText('Dark Council Tactic — waiting for opponent…')

  net.on('matchStart', (msg) => {
    console.log(
      `[client] matchStart: match=${msg.match.matchId} units=${String(msg.match.units.length)} youAre=${msg.youAre}`,
    )
    hideBoot()
    scenes.show(new MatchScene(msg.match, msg.youAre))
  })

  net.on('stateUpdate', (msg) => {
    const active = scenes.active
    if (active instanceof MatchScene) {
      active.update(msg.match)
    }
  })

  net.on('error', (msg) => {
    console.error(`[client] server error: ${msg.code} — ${msg.reason}`)
  })
}

void main()
