// src/client/main.ts
// M0 entry: open the WS, log the server hello, mark boot complete.
// PixiJS bootstrap lands in M1.

import { connect } from './network.js'

async function boot(): Promise<void> {
  try {
    const { hello } = await connect()
    console.log(`[client] hello from server (version ${hello.serverVersion})`, hello)
    const bootEl = document.getElementById('boot')
    if (bootEl) {
      bootEl.textContent = `Dark Council Tactic — connected to server ${hello.serverVersion}`
    }
  } catch (err: unknown) {
    console.error('[client] failed to connect to server:', err)
    const bootEl = document.getElementById('boot')
    if (bootEl) bootEl.textContent = 'Dark Council Tactic — server offline'
  }
}

void boot()
