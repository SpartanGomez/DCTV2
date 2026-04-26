// tests/unit/audio.test.ts
// SPEC §17 — verify the audio dispatcher's file-first / synth-fallback
// behaviour. Vitest runs in Node (vitest.config.ts), so AudioContext and
// HTMLAudioElement do not exist by default — we install minimal stand-ins
// and observe which path the dispatcher takes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------- Mocks ----------

interface FakeAudio {
  src: string
  volume: number
  loop: boolean
  preload: string
  paused: boolean
  currentTime: number
  pause: () => void
  cloneNode: () => FakeAudio
  play: () => Promise<void>
  addEventListener: (name: string, cb: () => void) => void
}

let MISSING_FILES = true

function makeFakeAudio(src: string): FakeAudio {
  const a: FakeAudio = {
    src,
    volume: 1,
    loop: false,
    preload: '',
    paused: true,
    currentTime: 0,
    pause: () => {
      a.paused = true
    },
    cloneNode: () => makeFakeAudio(a.src),
    play: () => {
      a.paused = false
      return MISSING_FILES ? Promise.reject(new Error('NotSupportedError')) : Promise.resolve()
    },
    addEventListener: () => void 0,
  }
  return a
}

beforeEach(() => {
  MISSING_FILES = true
  // Install a global Audio constructor the dispatcher can `new`. Using a
  // plain `function` (not an arrow) so it's `new`-callable.
  function MockAudioCtor(src: string): FakeAudio {
    return makeFakeAudio(src)
  }
  ;(globalThis as { Audio?: unknown }).Audio = MockAudioCtor
  vi.resetModules()
})

afterEach(() => {
  delete (globalThis as { Audio?: unknown }).Audio
})

// ---------- Tests ----------

describe('audio dispatcher (file missing → synth fallback)', () => {
  it('playSfx falls back to synth when the .ogg fails to play', async () => {
    MISSING_FILES = true
    const synth = await import('../../src/client/audioSynth.js')
    const synthSpy = vi.spyOn(synth, 'synthSfx').mockImplementation(() => void 0)
    vi.spyOn(synth, 'unlockAudio').mockImplementation(() => void 0)

    const audio = await import('../../src/client/audio.js')
    audio.playSfx('ui_click')
    // play() rejection is async — flush microtasks.
    await Promise.resolve()
    await Promise.resolve()

    expect(synthSpy).toHaveBeenCalledWith('ui_click')
  })

  it('playSfx does NOT call synth when the .ogg plays successfully', async () => {
    MISSING_FILES = false
    const synth = await import('../../src/client/audioSynth.js')
    const synthSpy = vi.spyOn(synth, 'synthSfx').mockImplementation(() => void 0)
    vi.spyOn(synth, 'unlockAudio').mockImplementation(() => void 0)

    const audio = await import('../../src/client/audio.js')
    audio.playSfx('ui_click')
    await Promise.resolve()
    await Promise.resolve()

    expect(synthSpy).not.toHaveBeenCalled()
  })

  it('playMusic falls back to synthMusic when the .ogg fails', async () => {
    MISSING_FILES = true
    const synth = await import('../../src/client/audioSynth.js')
    const musicSpy = vi.spyOn(synth, 'synthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'stopSynthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'unlockAudio').mockImplementation(() => void 0)

    const audio = await import('../../src/client/audio.js')
    audio.playMusic('title')
    await Promise.resolve()
    await Promise.resolve()

    expect(musicSpy).toHaveBeenCalledWith('title')
  })

  it('stopMusic suppresses the synth fallback if it lands after the stop', async () => {
    MISSING_FILES = true
    const synth = await import('../../src/client/audioSynth.js')
    const musicSpy = vi.spyOn(synth, 'synthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'stopSynthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'unlockAudio').mockImplementation(() => void 0)

    const audio = await import('../../src/client/audio.js')
    audio.playMusic('title')
    // Stop synchronously — before the play() rejection has settled.
    audio.stopMusic()
    await Promise.resolve()
    await Promise.resolve()

    expect(musicSpy).not.toHaveBeenCalled()
  })

  it('a second playMusic supersedes the first', async () => {
    MISSING_FILES = true
    const synth = await import('../../src/client/audioSynth.js')
    const musicSpy = vi.spyOn(synth, 'synthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'stopSynthMusic').mockImplementation(() => void 0)
    vi.spyOn(synth, 'unlockAudio').mockImplementation(() => void 0)

    const audio = await import('../../src/client/audio.js')
    audio.playMusic('title')
    audio.playMusic('match')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // 'match' must be the final synthesised track — 'title's late rejection
    // must not retroactively re-start title's drone.
    const lastCall = musicSpy.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('match')
  })
})

describe('audio synth recipes (presence)', () => {
  it('every MusicTrack has a recipe with valid params', async () => {
    const synth = await import('../../src/client/audioSynth.js')
    const recipes = synth._musicRecipes()
    const tracks = ['title', 'match', 'results', 'bracket'] as const
    for (const t of tracks) {
      expect(recipes[t]).toBeDefined()
      expect(recipes[t].base).toBeGreaterThan(0)
      expect(recipes[t].gain).toBeGreaterThan(0)
    }
  })
})
