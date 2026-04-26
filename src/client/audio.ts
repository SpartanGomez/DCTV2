// src/client/audio.ts
// SPEC §17 / §12 (M13) — audio plumbing.
//
// Two-layer playback (file-first, synth-fallback):
//   1. If `public/audio/sfx/<name>.ogg` (or music equivalent) loads, play it.
//   2. If the file is missing (404 / decode error), fall back to procedural
//      synthesis from `audioSynth.ts`. This keeps the jam build audible
//      before real Beatoven / Freesound assets land — and when they do, they
//      take priority automatically with no call-site changes.
//
// Design:
//   - `playSfx(name)` plays the matching file if it loads, else synthesises.
//   - `playMusic(track)` starts a looped track, replacing any prior music.
//     Missing files synthesise a drone instead.
//   - `stopMusic()` stops both file and synth music.
//   - Missing files are marked permanently-missing after the first failed
//     fetch so we don't retry on every action.

import { stopSynthMusic, synthMusic, synthSfx, unlockAudio } from './audioSynth.js'

export type SfxName =
  | 'ui_click'
  | 'ui_hover'
  | 'tile_move'
  | 'attack_melee'
  | 'attack_ranged'
  | 'unit_death'
  | 'camera_rotate'
  | 'surrender_bell'
  | 'match_win'
  | 'match_loss'

export type MusicTrack = 'title' | 'match' | 'results' | 'bracket'

const SFX_BASE = '/audio/sfx/'
const MUSIC_BASE = '/audio/music/'
const EXT = '.ogg'

const sfxCache = new Map<SfxName, HTMLAudioElement | 'missing'>()
const musicCache = new Map<MusicTrack, HTMLAudioElement | 'missing'>()
let currentMusic: HTMLAudioElement | null = null
let currentMusicTrack: MusicTrack | 'synth' | null = null

function tryLoad<T extends string>(
  cache: Map<T, HTMLAudioElement | 'missing'>,
  base: string,
  name: T,
  opts: { loop?: boolean; volume?: number } = {},
): HTMLAudioElement | null {
  const existing = cache.get(name)
  if (existing === 'missing') return null
  if (existing) return existing
  const url = `${base}${name}${EXT}`
  const el = new Audio(url)
  el.loop = opts.loop ?? false
  el.volume = opts.volume ?? 0.7
  el.preload = 'auto'
  // Mark missing on load error so we don't repeat-request. Silent failure is
  // the intended UX for pre-asset builds.
  el.addEventListener('error', () => {
    cache.set(name, 'missing')
  })
  cache.set(name, el)
  return el
}

export function playSfx(name: SfxName): void {
  // Best-effort: any SFX call is a reasonable moment to nudge the audio
  // context awake (it'll be a no-op until a real user gesture has fired).
  unlockAudio()
  const el = tryLoad(sfxCache, SFX_BASE, name, { volume: 0.6 })
  if (!el) {
    // File previously failed to load — synthesise instead.
    synthSfx(name)
    return
  }
  // Allow overlapping SFX by cloning — a fresh play is cheap and doesn't
  // cut off an in-flight instance.
  try {
    const cloned = el.cloneNode(true) as HTMLAudioElement
    cloned.volume = el.volume
    void cloned.play().catch(() => {
      // Play failed (decode error after construction, autoplay block, etc.).
      // Treat this name as missing for future calls and fall back to synth.
      sfxCache.set(name, 'missing')
      synthSfx(name)
    })
  } catch {
    // Browsers may throw if no user gesture yet; fall back to synth which
    // handles its own gesture requirements.
    synthSfx(name)
  }
}

export function playMusic(track: MusicTrack): void {
  unlockAudio()
  // Stop any prior file-based music.
  if (currentMusic) {
    currentMusic.pause()
    currentMusic.currentTime = 0
    currentMusic = null
  }
  // Always stop any prior synth drone, even if we end up using a file.
  stopSynthMusic()
  currentMusicTrack = null

  const el = tryLoad(musicCache, MUSIC_BASE, track, { loop: true, volume: 0.4 })
  if (!el) {
    synthMusic(track)
    currentMusicTrack = 'synth'
    return
  }
  currentMusic = el
  currentMusicTrack = track
  // Snapshot which track this play() belongs to. If `stopMusic` or another
  // `playMusic` runs before this rejection settles, currentMusicTrack will
  // have changed and we must not retroactively start a synth drone.
  const intended: MusicTrack = track
  try {
    void el.play().catch(() => {
      musicCache.set(track, 'missing')
      if (currentMusic === el) currentMusic = null
      if (currentMusicTrack === intended) {
        synthMusic(track)
        currentMusicTrack = 'synth'
      }
    })
  } catch {
    if (currentMusicTrack === intended) {
      synthMusic(track)
      currentMusicTrack = 'synth'
    }
  }
}

export function stopMusic(): void {
  if (currentMusic) {
    currentMusic.pause()
    currentMusic.currentTime = 0
    currentMusic = null
  }
  stopSynthMusic()
  currentMusicTrack = null
}
