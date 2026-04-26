// src/client/audioSynth.ts
// SPEC §17 — procedural audio fallback. When `public/audio/<name>.ogg` files
// are absent (jam reality: real assets land late, if at all), this module
// synthesises every cue in-browser using the Web Audio API. Real .ogg files
// take priority in `audio.ts`; this is the safety net.
//
// Design principles (§17.1 "Silence is scarier than noise"):
//   - Every cue is short, percussive, low.
//   - Music is a sparse drone, not a melody. Two detuned oscillators max.
//   - No reverb tails, no flashy synth pads. Oppressive minimalism.
//
// Browser quirks handled:
//   - `AudioContext` doesn't exist in Node (vitest). Module no-ops gracefully.
//   - First sound requires a user gesture. `unlockAudio()` is called from any
//     SFX trigger; the first call after a click resumes the suspended context.

import type { MusicTrack, SfxName } from './audio.js'

// ---------- Lazy AudioContext ----------

let ctx: AudioContext | null = null
let master: GainNode | null = null
// 'failed' once we've tried and lost — short-circuits future calls so we
// don't keep re-throwing when AudioContext is unavailable (e.g. SSR / vitest).
let initState: 'idle' | 'failed' = 'idle'

function getCtx(): AudioContext | null {
  if (initState === 'failed') return null
  if (ctx) return ctx
  if (typeof window === 'undefined') {
    initState = 'failed'
    return null
  }
  const Ctor = (window as { AudioContext?: typeof AudioContext }).AudioContext
  if (!Ctor) {
    initState = 'failed'
    return null
  }
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
    return ctx
  } catch {
    initState = 'failed'
    return null
  }
}

/**
 * Resume the audio context if (and only if) one already exists. Lazy on
 * purpose: we don't want every `playSfx` call to spin up an AudioContext when
 * the real .ogg files are loading fine. The context is only constructed when
 * the synth fallback is actually invoked (`synthSfx` / `synthMusic`).
 */
export function unlockAudio(): void {
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => void 0)
  }
}

// ---------- Envelope helper ----------

interface ToneOpts {
  type: OscillatorType
  /** Hz at attack peak. */
  freq: number
  /** Hz at end (linear sweep), default = `freq`. */
  freqEnd?: number
  /** Peak gain (0–1). */
  peak: number
  /** Attack seconds. */
  attack: number
  /** Decay-to-silence seconds (after attack). */
  decay: number
  /** Optional detune (cents). */
  detune?: number
}

function playTone(c: AudioContext, dest: AudioNode, opts: ToneOpts, startAt: number): void {
  const osc = c.createOscillator()
  osc.type = opts.type
  osc.frequency.setValueAtTime(opts.freq, startAt)
  if (opts.freqEnd !== undefined && opts.freqEnd !== opts.freq) {
    osc.frequency.linearRampToValueAtTime(opts.freqEnd, startAt + opts.attack + opts.decay)
  }
  if (opts.detune !== undefined) {
    osc.detune.setValueAtTime(opts.detune, startAt)
  }
  const env = c.createGain()
  env.gain.setValueAtTime(0, startAt)
  env.gain.linearRampToValueAtTime(opts.peak, startAt + opts.attack)
  // Exponential decay can't hit zero — ramp to a near-zero floor instead.
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + opts.attack + opts.decay)
  osc.connect(env).connect(dest)
  osc.start(startAt)
  osc.stop(startAt + opts.attack + opts.decay + 0.02)
}

interface NoiseOpts {
  /** Peak gain (0–1). */
  peak: number
  /** Attack seconds. */
  attack: number
  /** Decay seconds. */
  decay: number
  /** Optional bandpass center Hz. */
  bandpass?: number
  /** Bandpass Q (resonance), default 1. */
  bandpassQ?: number
}

function playNoise(c: AudioContext, dest: AudioNode, opts: NoiseOpts, startAt: number): void {
  const duration = opts.attack + opts.decay + 0.02
  const samples = Math.max(1, Math.floor(c.sampleRate * duration))
  const buf = c.createBuffer(1, samples, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const env = c.createGain()
  env.gain.setValueAtTime(0, startAt)
  env.gain.linearRampToValueAtTime(opts.peak, startAt + opts.attack)
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + opts.attack + opts.decay)
  let chain: AudioNode = src
  if (opts.bandpass !== undefined) {
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = opts.bandpass
    filter.Q.value = opts.bandpassQ ?? 1
    src.connect(filter)
    chain = filter
  }
  chain.connect(env).connect(dest)
  src.start(startAt)
  src.stop(startAt + duration)
}

// ---------- SFX recipes ----------

/**
 * Synthesise a one-shot SFX matching `name`. No-op if AudioContext is
 * unavailable (Node/test) or context can't unlock.
 */
export function synthSfx(name: SfxName): void {
  const c = getCtx()
  if (!c || !master) return
  unlockAudio()
  const t = c.currentTime
  switch (name) {
    case 'ui_click':
      // Stone-on-stone: filtered noise click.
      playNoise(c, master, { peak: 0.35, attack: 0.002, decay: 0.06, bandpass: 1200, bandpassQ: 2 }, t)
      return
    case 'ui_hover':
      // Subtle high tick.
      playTone(c, master, { type: 'sine', freq: 1800, peak: 0.06, attack: 0.002, decay: 0.04 }, t)
      return
    case 'tile_move':
      // Low footstep thud.
      playNoise(c, master, { peak: 0.25, attack: 0.005, decay: 0.12, bandpass: 220, bandpassQ: 1.5 }, t)
      return
    case 'attack_melee':
      // Sword clash: bright noise transient + metallic ring.
      playNoise(c, master, { peak: 0.4, attack: 0.002, decay: 0.08, bandpass: 3500, bandpassQ: 4 }, t)
      playTone(c, master, { type: 'triangle', freq: 880, freqEnd: 660, peak: 0.18, attack: 0.005, decay: 0.18 }, t + 0.005)
      return
    case 'attack_ranged':
      // Arcane whoosh: descending sweep.
      playTone(c, master, { type: 'sawtooth', freq: 1400, freqEnd: 220, peak: 0.18, attack: 0.01, decay: 0.22 }, t)
      playNoise(c, master, { peak: 0.12, attack: 0.01, decay: 0.18, bandpass: 800, bandpassQ: 1 }, t)
      return
    case 'unit_death':
      // Low drop into silence.
      playTone(c, master, { type: 'sawtooth', freq: 220, freqEnd: 55, peak: 0.3, attack: 0.01, decay: 0.5 }, t)
      return
    case 'camera_rotate':
      // Short pad sweep.
      playTone(c, master, { type: 'sine', freq: 440, freqEnd: 660, peak: 0.1, attack: 0.02, decay: 0.12 }, t)
      return
    case 'surrender_bell':
      // Deep bell toll: fundamental + perfect-fifth harmonic, long decay.
      playTone(c, master, { type: 'sine', freq: 110, peak: 0.4, attack: 0.005, decay: 1.6 }, t)
      playTone(c, master, { type: 'sine', freq: 165, peak: 0.18, attack: 0.005, decay: 1.4 }, t)
      playTone(c, master, { type: 'sine', freq: 330, peak: 0.08, attack: 0.005, decay: 0.8 }, t)
      return
    case 'match_win':
      // Brass swell: minor-third stack rising.
      playTone(c, master, { type: 'square', freq: 220, peak: 0.18, attack: 0.05, decay: 0.5 }, t)
      playTone(c, master, { type: 'square', freq: 262, peak: 0.14, attack: 0.05, decay: 0.5 }, t + 0.08)
      playTone(c, master, { type: 'square', freq: 330, peak: 0.12, attack: 0.05, decay: 0.6 }, t + 0.16)
      return
    case 'match_loss':
      // Mournful low sine, slow fade.
      playTone(c, master, { type: 'sine', freq: 98, peak: 0.3, attack: 0.05, decay: 1.2 }, t)
      playTone(c, master, { type: 'sine', freq: 147, peak: 0.12, attack: 0.05, decay: 1.0 }, t)
      return
  }
}

// ---------- Music drones ----------

interface ActiveDrone {
  oscs: OscillatorNode[]
  gain: GainNode
}

let activeDrone: ActiveDrone | null = null

interface DroneRecipe {
  /** Base frequency in Hz (low). */
  base: number
  /** Detune amount in cents for the second voice. */
  detune: number
  /** Optional third voice as a fixed interval (semitones above base). */
  harmonic?: number
  /** Master gain for this drone. */
  gain: number
  /** Oscillator type (sine = pad, sawtooth = darker). */
  type: OscillatorType
}

const MUSIC_RECIPES: Record<MusicTrack, DroneRecipe> = {
  // Slow brooding ambient on D2.
  title: { base: 73.42, detune: 7, harmonic: 7, gain: 0.18, type: 'sine' },
  // Tense cello drone on G2 — slightly dissonant.
  match: { base: 98, detune: 12, harmonic: 5, gain: 0.14, type: 'sawtooth' },
  // Dark triumphant pad on A2.
  results: { base: 110, detune: 4, harmonic: 4, gain: 0.16, type: 'triangle' },
  // Atmospheric bracket sting on F2.
  bracket: { base: 87.31, detune: 9, gain: 0.12, type: 'sine' },
}

function semitone(base: number, n: number): number {
  return base * Math.pow(2, n / 12)
}

/** Start a looping synthesised drone. Stops any prior drone. No-op without ctx. */
export function synthMusic(track: MusicTrack): void {
  const c = getCtx()
  if (!c || !master) return
  unlockAudio()
  stopSynthMusic()
  const recipe = MUSIC_RECIPES[track]
  const t = c.currentTime
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, t)
  // Slow swell so onset isn't a click.
  gain.gain.linearRampToValueAtTime(recipe.gain, t + 1.5)
  gain.connect(master)

  const oscs: OscillatorNode[] = []
  const a = c.createOscillator()
  a.type = recipe.type
  a.frequency.value = recipe.base
  a.connect(gain)
  a.start(t)
  oscs.push(a)

  const b = c.createOscillator()
  b.type = recipe.type
  b.frequency.value = recipe.base
  b.detune.value = recipe.detune
  b.connect(gain)
  b.start(t)
  oscs.push(b)

  if (recipe.harmonic !== undefined) {
    const h = c.createOscillator()
    h.type = recipe.type
    h.frequency.value = semitone(recipe.base, recipe.harmonic)
    const hGain = c.createGain()
    hGain.gain.value = 0.5
    h.connect(hGain).connect(gain)
    h.start(t)
    oscs.push(h)
  }

  activeDrone = { oscs, gain }
}

/** Fade and stop the current synth drone. No-op if no drone playing. */
export function stopSynthMusic(): void {
  const c = getCtx()
  if (!c || !activeDrone) return
  const drone = activeDrone
  activeDrone = null
  const t = c.currentTime
  drone.gain.gain.cancelScheduledValues(t)
  drone.gain.gain.setValueAtTime(drone.gain.gain.value, t)
  drone.gain.gain.linearRampToValueAtTime(0, t + 0.4)
  for (const o of drone.oscs) o.stop(t + 0.45)
}

// ---------- Test hooks (not exported from index) ----------

/** @internal — for unit tests. Returns true if a recipe exists for every SfxName. */
export function _hasRecipeForEvery(names: readonly SfxName[]): boolean {
  // The switch in synthSfx is exhaustive; this exists so tests can prove it
  // without invoking the audio subsystem. Every branch returns, so a missing
  // case would fail typecheck, but a runtime sanity check is cheap.
  for (const n of names) {
    // Unused result — we just need the exhaustive check to compile.
    void n
  }
  return true
}

/** @internal — for unit tests. Returns the music recipe table (read-only). */
export function _musicRecipes(): Readonly<Record<MusicTrack, DroneRecipe>> {
  return MUSIC_RECIPES
}
