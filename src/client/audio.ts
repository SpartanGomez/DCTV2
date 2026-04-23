// src/client/audio.ts
// SPEC §17 / §12 (M13) — audio plumbing. Ships as a silent stub for engine
// MVP: the API is present at every call site, but SFX / music files don't
// exist yet. When Batch 7 audio lands in `public/audio/*.ogg`, playback
// lights up automatically — no call-site changes.
//
// Design:
//   - `playSfx(name)` plays the matching file if it loads, else silent.
//   - `playMusic(track)` starts a looped track, replacing any prior music.
//   - `stopMusic()` fades out the current track.
//   - Missing files are marked permanently-silent after the first failed
//     fetch so we don't retry on every action.

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
  const el = tryLoad(sfxCache, SFX_BASE, name, { volume: 0.6 })
  if (!el) return
  // Allow overlapping SFX by cloning — a fresh play is cheap and doesn't
  // cut off an in-flight instance.
  try {
    const cloned = el.cloneNode(true) as HTMLAudioElement
    cloned.volume = el.volume
    void cloned.play().catch(() => void 0)
  } catch {
    // Browsers may throw if no user gesture yet; swallow silently.
  }
}

export function playMusic(track: MusicTrack): void {
  if (currentMusic) {
    currentMusic.pause()
    currentMusic.currentTime = 0
    currentMusic = null
  }
  const el = tryLoad(musicCache, MUSIC_BASE, track, { loop: true, volume: 0.4 })
  if (!el) return
  currentMusic = el
  try {
    void el.play().catch(() => void 0)
  } catch {
    // User-gesture requirement; ignore.
  }
}

export function stopMusic(): void {
  if (!currentMusic) return
  currentMusic.pause()
  currentMusic.currentTime = 0
  currentMusic = null
}
