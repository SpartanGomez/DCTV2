// src/server/TournamentManager.ts
// SPEC §7 M10: 8-player single-elimination bracket, bot fill after 15s,
// randomised seeding, perk draft between rounds.
// One tournament per server instance; resets on completion.

import { randomUUID } from 'node:crypto'
import type { WebSocket } from 'ws'
import {
  BOT_FILL_WAIT_MS,
  PERK_DRAFT_TIMER_MS,
  TURN_TIMER_MS,
} from '../shared/constants.js'
import { createMatch, applyEndTurn } from './GameEngine.js'
import { filterForPlayer } from './Fog.js'
import { pit } from './arenas/pit.js'
import { ruins } from './arenas/ruins.js'
import { bridge } from './arenas/bridge.js'
import { shrine } from './arenas/shrine.js'
import { maze } from './arenas/maze.js'
import {
  matchId as makeMatchId,
  playerId as makePlayerId,
  tournamentId as makeTournamentId,
  type ArenaDef,
  type BracketRound,
  type BracketState,
  type ClassId,
  type MatchId,
  type MatchState,
  type PerkId,
  type PlayerId,
  type ServerMessage,
  type TournamentId,
} from '../shared/types.js'

const ARENAS: readonly ArenaDef[] = [pit, ruins, bridge, shrine, maze]
const ALL_PERKS: readonly PerkId[] = [
  'bloodlust', 'second_wind', 'scouts_eye', 'energy_surge', 'thick_skin',
  'ghost_step', 'trap_sense', 'ash_walker', 'first_strike', 'last_stand',
  'mist_cloak', 'fortify', 'long_reach', 'pillager', 'counterspell', 'vampiric_touch',
]
const TOURNAMENT_SIZE = 8

export interface TournamentSlot {
  playerId: PlayerId
  socket: WebSocket | null   // null for bots
  classId: ClassId
  name: string
  isBot: boolean
  /**
   * Has the client confirmed it's finished in the lobby (class locked in)?
   * Bots are always `true`. Real players flip `true` when they send `ready`
   * (or `joinTournament`). The tournament does not start until every slot
   * is filled AND every slot is ready — this avoids starting a match with
   * a stale default class before the client's `selectClass` lands.
   */
  ready: boolean
  /** Perk selected for the current round (cleared after each match). */
  selectedPerk: PerkId | null
}

export interface ActiveTournamentMatch {
  matchId: MatchId
  slotA: number   // index into slots
  slotB: number
  state: MatchState
  turnTimer: NodeJS.Timeout | null
  spectators: Set<PlayerId>
}

type TournamentPhase =
  | 'lobby'          // waiting for 8 players
  | 'perk_draft'     // between rounds, waiting for perk picks
  | 'round_active'   // matches in progress
  | 'complete'       // tournament over

export class TournamentManager {
  readonly id: TournamentId = makeTournamentId(randomUUID())
  readonly slots: TournamentSlot[] = []
  private rounds: BracketRound[] = []
  private currentRound = 0
  private phase: TournamentPhase = 'lobby'
  private botFillTimer: NodeJS.Timeout | null = null
  private perkDraftTimer: NodeJS.Timeout | null = null
  private activeMatches = new Map<MatchId, ActiveTournamentMatch>()
  /** Maps playerId → slot index for quick lookup. */
  private playerIndex = new Map<PlayerId, number>()
  /** Spectators watching a match. */
  private spectators = new Map<PlayerId, { socket: WebSocket; watchingMatch: MatchId | null }>()

  private readonly tournamentSize: number
  private readonly botFillWaitMs: number
  private readonly turnTimerMs: number
  private readonly forceArenaSlug: string | undefined
  private readonly send: (socket: WebSocket, msg: ServerMessage) => void

  constructor(opts: {
    turnTimerMs?: number
    botFillWaitMs?: number
    tournamentSize?: number
    forceArenaSlug?: string
    send: (socket: WebSocket, msg: ServerMessage) => void
  }) {
    this.turnTimerMs = opts.turnTimerMs ?? TURN_TIMER_MS
    this.botFillWaitMs = opts.botFillWaitMs ?? BOT_FILL_WAIT_MS
    this.tournamentSize = opts.tournamentSize ?? TOURNAMENT_SIZE
    this.forceArenaSlug = opts.forceArenaSlug
    this.send = opts.send
  }

  isComplete(): boolean {
    return this.phase === 'complete'
  }

  // -------------------------------------------------------------------------
  // Lobby management
  // -------------------------------------------------------------------------

  addPlayer(socket: WebSocket, classId: ClassId, name: string, existingId?: PlayerId): PlayerId | null {
    if (this.phase !== 'lobby') return null
    if (this.slots.length >= this.tournamentSize) return null
    const pid = existingId ?? makePlayerId(randomUUID())
    const slot: TournamentSlot = {
      playerId: pid, socket, classId, name, isBot: false, ready: false, selectedPerk: null,
    }
    this.slots.push(slot)
    this.playerIndex.set(pid, this.slots.length - 1)
    if (this.slots.length === 1) this.scheduleBotFill()
    this.maybeStartTournament()
    return pid
  }

  /**
   * Mark a human slot ready. Called from the server's `ready` /
   * `joinTournament` handler after the client has locked in its class.
   * No-op if the player is absent or already ready.
   */
  markReady(playerId: PlayerId): void {
    const idx = this.playerIndex.get(playerId)
    if (idx === undefined) return
    const slot = this.slots[idx]
    if (!slot || slot.isBot || slot.ready) return
    this.slots[idx] = { ...slot, ready: true }
    this.maybeStartTournament()
  }

  private maybeStartTournament(): void {
    if (this.phase !== 'lobby') return
    if (this.slots.length < this.tournamentSize) return
    if (!this.slots.every((s) => s.ready || s.isBot)) return
    this.startTournament()
  }

  updateClass(playerId: PlayerId, classId: ClassId): void {
    const idx = this.playerIndex.get(playerId)
    if (idx === undefined) return
    const slot = this.slots[idx]
    if (!slot || slot.isBot) return
    this.slots[idx] = { ...slot, classId }
  }

  /** Called when a human player disconnects. */
  removePlayer(playerId: PlayerId): void {
    const idx = this.playerIndex.get(playerId)
    if (idx === undefined) return
    const slot = this.slots[idx]
    if (!slot) return
    // Replace with bot if we haven't started yet.
    if (this.phase === 'lobby') {
      this.slots[idx] = {
        ...slot,
        socket: null,
        isBot: true,
        ready: true,
        name: `Bot_${String(idx + 1)}`,
      }
      // The dropout may have been the last blocker on starting.
      this.maybeStartTournament()
    } else {
      // Mark socket as gone; ongoing match will handle disconnect naturally.
      this.slots[idx] = { ...slot, socket: null }
    }
  }

  hasPlayer(playerId: PlayerId): boolean {
    return this.playerIndex.has(playerId)
  }

  isInMatch(playerId: PlayerId): MatchId | null {
    for (const [mid, m] of this.activeMatches) {
      const slotA = this.slots[m.slotA]
      const slotB = this.slots[m.slotB]
      if (slotA?.playerId === playerId || slotB?.playerId === playerId) return mid
    }
    return null
  }

  getMatchById(mid: MatchId): ActiveTournamentMatch | undefined {
    return this.activeMatches.get(mid)
  }

  getSlotByPlayer(playerId: PlayerId): TournamentSlot | undefined {
    const idx = this.playerIndex.get(playerId)
    return idx !== undefined ? this.slots[idx] : undefined
  }

  // -------------------------------------------------------------------------
  // Spectating
  // -------------------------------------------------------------------------

  addSpectator(socket: WebSocket, spectatorId: PlayerId): void {
    this.spectators.set(spectatorId, { socket, watchingMatch: null })
  }

  removeSpectator(spectatorId: PlayerId): void {
    this.spectators.delete(spectatorId)
  }

  spectatorWatch(spectatorId: PlayerId, matchId: MatchId): void {
    const spec = this.spectators.get(spectatorId)
    if (!spec) return
    this.spectators.set(spectatorId, { ...spec, watchingMatch: matchId })
    const m = this.activeMatches.get(matchId)
    if (m) this.send(spec.socket, { type: 'spectatorState', match: m.state })
  }

  // -------------------------------------------------------------------------
  // Perk selection
  // -------------------------------------------------------------------------

  selectPerk(playerId: PlayerId, perkId: PerkId): boolean {
    if (this.phase !== 'perk_draft') return false
    const idx = this.playerIndex.get(playerId)
    if (idx === undefined) return false
    const slot = this.slots[idx]
    if (!slot) return false
    // Only winners of the last round can pick.
    if (!this.isAdvancing(playerId)) return false
    this.slots[idx] = { ...slot, selectedPerk: perkId }
    this.checkPerkDraftComplete()
    return true
  }

  // -------------------------------------------------------------------------
  // Match state + action routing
  // -------------------------------------------------------------------------

  getActiveMatch(matchId: MatchId): ActiveTournamentMatch | undefined {
    return this.activeMatches.get(matchId)
  }

  updateMatchState(matchId: MatchId, state: MatchState): void {
    const m = this.activeMatches.get(matchId)
    if (!m) return
    this.activeMatches.set(matchId, { ...m, state })
    this.broadcastSpectators(matchId, state)
  }

  setMatchTimer(matchId: MatchId, timer: NodeJS.Timeout | null): void {
    const m = this.activeMatches.get(matchId)
    if (!m) return
    this.activeMatches.set(matchId, { ...m, turnTimer: timer })
  }

  clearMatchTimer(matchId: MatchId): void {
    const m = this.activeMatches.get(matchId)
    if (!m) return
    if (m.turnTimer) clearTimeout(m.turnTimer)
    this.activeMatches.set(matchId, { ...m, turnTimer: null })
  }

  /**
   * Called by index.ts when a match ends. Advances the bracket, triggers
   * perk draft or starts the next round.
   */
  onMatchOver(matchId: MatchId, winner: PlayerId): void {
    this.clearMatchTimer(matchId)
    const m = this.activeMatches.get(matchId)
    if (!m) return
    this.activeMatches.delete(matchId)

    // Record winner in the bracket round.
    const round = this.rounds[this.currentRound]
    if (round) {
      for (const bm of round.matches) {
        if (bm.matchId === matchId) {
          bm.winner = winner
          bm.status = 'done'
          break
        }
      }
    }
    this.broadcastBracket()

    // If all matches in current round are done, advance.
    if (this.activeMatches.size === 0) {
      if (this.rounds[this.currentRound]?.matches.every((bm) => bm.status === 'done')) {
        const winners = this.winnersOfCurrentRound()
        if (winners.length === 1) {
          this.phase = 'complete'
          console.log(`[tournament] ${this.id} complete — champion: ${winners[0]}`)
        } else {
          this.startPerkDraft(winners)
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Bracket broadcasting
  // -------------------------------------------------------------------------

  broadcastBracket(): void {
    const state: BracketState = { rounds: this.rounds, currentRound: this.currentRound }
    for (const slot of this.slots) {
      if (!slot.socket || slot.isBot) continue
      this.send(slot.socket, { type: 'tournamentUpdate', bracket: state })
    }
  }

  // -------------------------------------------------------------------------
  // Internal: bot fill
  // -------------------------------------------------------------------------

  private scheduleBotFill(): void {
    if (this.botFillTimer) clearTimeout(this.botFillTimer)
    this.botFillTimer = setTimeout(() => {
      this.botFillTimer = null
      if (this.phase !== 'lobby') return
      while (this.slots.length < this.tournamentSize) {
        const idx = this.slots.length
        const pid = makePlayerId(randomUUID())
        const classes: ClassId[] = ['knight', 'mage', 'heretic']
        const classId = classes[idx % 3] ?? 'knight'
        const slot: TournamentSlot = {
          playerId: pid,
          socket: null,
          classId,
          name: `Bot_${String(idx + 1)}`,
          isBot: true,
          ready: true,
          selectedPerk: null,
        }
        this.slots.push(slot)
        this.playerIndex.set(pid, idx)
      }
      // Bot fill runs even when human slots haven't signalled `ready` yet —
      // that's fine for timed-out lobbies; start regardless.
      this.startTournament()
    }, this.botFillWaitMs)
  }

  // -------------------------------------------------------------------------
  // Internal: tournament flow
  // -------------------------------------------------------------------------

  private startTournament(): void {
    if (this.botFillTimer) {
      clearTimeout(this.botFillTimer)
      this.botFillTimer = null
    }
    this.phase = 'round_active'
    // Randomize seeding.
    const indices = shuffle(
      Array.from({ length: this.tournamentSize }, (_, i) => i),
      Math.random,
    )
    // Build first round (quarterfinals): pair [0,1], [2,3], [4,5], [6,7]
    const pairings: Array<[number, number]> = []
    for (let i = 0; i < indices.length; i += 2) {
      const a = indices[i]
      const b = indices[i + 1]
      if (a !== undefined && b !== undefined) pairings.push([a, b])
    }
    this.startRound(pairings)
  }

  private startRound(pairings: Array<[number, number]>): void {
    this.phase = 'round_active'
    const arenaIdx = Math.floor(Math.random() * ARENAS.length)
    const arena = (this.forceArenaSlug
      ? ARENAS.find((a) => a.slug === this.forceArenaSlug)
      : undefined) ?? ARENAS[arenaIdx] ?? pit

    const roundMatches: BracketRound['matches'] = []
    for (const [idxA, idxB] of pairings) {
      const slotA = this.slots[idxA]
      const slotB = this.slots[idxB]
      if (!slotA || !slotB) continue

      const mid = makeMatchId(randomUUID())
      const perksA = slotA.selectedPerk ? [slotA.selectedPerk] : []
      const perksB = slotB.selectedPerk ? [slotB.selectedPerk] : []

      const state = createMatch({
        matchId: mid,
        playerA: slotA.playerId,
        playerB: slotB.playerId,
        classA: slotA.classId,
        classB: slotB.classId,
        arena,
        perksA,
        perksB,
        turnTimerMs: this.turnTimerMs,
      })

      const am: ActiveTournamentMatch = {
        matchId: mid,
        slotA: idxA,
        slotB: idxB,
        state,
        turnTimer: null,
        spectators: new Set(),
      }
      this.activeMatches.set(mid, am)

      roundMatches.push({
        matchId: mid,
        players: [slotA.playerId, slotB.playerId],
        status: 'active',
      })

      // Notify human players.
      if (slotA.socket) {
        this.send(slotA.socket, {
          type: 'matchStart',
          match: filterForPlayer(state, slotA.playerId),
          youAre: slotA.playerId,
        })
      }
      if (slotB.socket) {
        this.send(slotB.socket, {
          type: 'matchStart',
          match: filterForPlayer(state, slotB.playerId),
          youAre: slotB.playerId,
        })
      }

      // Clear selected perks now that the match has started.
      this.slots[idxA] = { ...slotA, selectedPerk: null }
      this.slots[idxB] = { ...slotB, selectedPerk: null }
    }

    if (this.currentRound >= this.rounds.length) {
      this.rounds.push({ matches: roundMatches })
    } else {
      this.rounds[this.currentRound] = { matches: roundMatches }
    }
    this.broadcastBracket()

    console.log(
      `[tournament] ${this.id} round ${String(this.currentRound + 1)} started` +
      ` (${String(pairings.length)} matches, arena: ${arena.slug})`,
    )
  }

  private startPerkDraft(winners: PlayerId[]): void {
    this.phase = 'perk_draft'
    this.currentRound++

    for (const winner of winners) {
      const idx = this.playerIndex.get(winner)
      const slot = idx !== undefined ? this.slots[idx] : undefined
      if (!slot) continue
      if (slot.isBot) {
        // Bot auto-picks a random perk.
        const perks = drawPerks(3)
        const pick = perks[Math.floor(Math.random() * perks.length)] ?? perks[0] ?? 'bloodlust'
        this.slots[idx!] = { ...slot, selectedPerk: pick }
        continue
      }
      if (slot.socket) {
        const options = drawPerks(3)
        this.send(slot.socket, { type: 'perkOptions', perks: options })
      }
    }

    // Auto-advance after timeout if not all humans have picked.
    this.perkDraftTimer = setTimeout(() => {
      this.perkDraftTimer = null
      this.checkPerkDraftComplete(true)
    }, PERK_DRAFT_TIMER_MS)

    this.checkPerkDraftComplete()
  }

  private checkPerkDraftComplete(force = false): void {
    const winners = this.winnersOfCurrentRound()
    // Using currentRound - 1 because we already incremented.
    const allPicked = winners.every((pid) => {
      const idx = this.playerIndex.get(pid)
      const slot = idx !== undefined ? this.slots[idx] : undefined
      return slot?.isBot || slot?.selectedPerk !== null
    })

    if (!allPicked && !force) return

    if (this.perkDraftTimer) {
      clearTimeout(this.perkDraftTimer)
      this.perkDraftTimer = null
    }

    // Auto-assign random perk to anyone who didn't pick in time.
    for (const pid of winners) {
      const idx = this.playerIndex.get(pid)
      if (idx === undefined) continue
      const slot = this.slots[idx]
      if (!slot || slot.selectedPerk !== null) continue
      const pick = drawPerks(1)[0] ?? 'bloodlust'
      this.slots[idx] = { ...slot, selectedPerk: pick }
    }

    // Build next round pairings from winners.
    const pairings: Array<[number, number]> = []
    for (let i = 0; i < winners.length; i += 2) {
      const pidA = winners[i]
      const pidB = winners[i + 1]
      if (!pidA || !pidB) continue
      const idxA = this.playerIndex.get(pidA)
      const idxB = this.playerIndex.get(pidB)
      if (idxA !== undefined && idxB !== undefined) pairings.push([idxA, idxB])
    }
    this.startRound(pairings)
  }

  private winnersOfCurrentRound(): PlayerId[] {
    const roundIdx = this.phase === 'perk_draft' ? this.currentRound - 1 : this.currentRound
    const round = this.rounds[roundIdx]
    if (!round) return []
    const winners: PlayerId[] = []
    for (const bm of round.matches) {
      if (bm.winner) winners.push(bm.winner)
    }
    return winners
  }

  private isAdvancing(playerId: PlayerId): boolean {
    return this.winnersOfCurrentRound().includes(playerId)
  }

  private broadcastSpectators(matchId: MatchId, state: MatchState): void {
    for (const [, spec] of this.spectators) {
      if (spec.watchingMatch === matchId) {
        this.send(spec.socket, { type: 'spectatorState', match: state })
      }
    }
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    const src = out[j]
    if (tmp !== undefined && src !== undefined) {
      out[i] = src
      out[j] = tmp
    }
  }
  return out
}

/** Draw N perks randomly (without replacement from the full pool). */
function drawPerks(n: number): PerkId[] {
  const pool = shuffle([...ALL_PERKS] as PerkId[], Math.random)
  return pool.slice(0, n)
}

// Re-export applyEndTurn so index.ts can call it from TournamentManager context.
export { applyEndTurn }
