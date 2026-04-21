// src/server/abilities.ts
// Per-ability validators and effect application. Each ability is a pair:
// `validateX(state, actor, action) → ValidationResult` + `applyX(state, action, cost) → ApplyResult`.
// The server index.ts and GameEngine.ts call through this module.
//
// SPEC §13 is the authoritative reference for costs, ranges, targets,
// damage, and statuses. Tuning happens after M10 playtesting — values
// here mirror constants in `src/shared/constants.ts`.

import {
  ABILITY_ENERGY_COST,
  ABILITY_HP_COST,
  ASH_CLOUD_RANGE,
  ASH_CLOUD_TTL,
  BLINK_RANGE,
  BLOOD_TITHE_ENERGY_GAIN,
  BLOOD_TITHE_HP_FLOOR,
  CINDER_BOLT_DAMAGE,
  CINDER_BOLT_RANGE,
  COVER_RUBBLE_REDUCTION,
  DEFEND_COST,
  DEFEND_REDUCTION,
  DESECRATE_RANGE,
  DESECRATE_TTL,
  FORTIFY_REDUCTION,
  HEX_TRAP_DAMAGE,
  HEX_TRAP_RANGE,
  HEX_TRAP_REVEAL_TTL,
  HIGH_GROUND_DAMAGE_BONUS,
  MAX_TRAPS_PER_HERETIC,
  MIN_DIRECT_DAMAGE,
  VANGUARD_CHARGE_BLOCKED_BONUS,
  VANGUARD_CHARGE_IMPACT_DAMAGE,
  VANGUARD_CHARGE_MAX_TILES,
} from '../shared/constants.js'
import { isInBounds, manhattanDistance, positionKey } from '../shared/grid.js'
import {
  type AbilityId,
  type AshCloud,
  type GameAction,
  type HexTrap,
  type MatchState,
  type PlayerId,
  type Position,
  type ServerErrorCode,
  type Status,
  type TerrainTile,
  type Unit,
} from '../shared/types.js'

export type ValidationResult =
  | { ok: true; cost: number; hpCost?: number }
  | { ok: false; code: ServerErrorCode }

export interface AbilityApplyResult {
  state: MatchState
  /** True if the action knocked someone into 0 HP and should trigger match-end checks. */
  killed: boolean
}

type AbilityAction = Extract<GameAction, { kind: 'ability' }>

// --- helpers -----------------------------------------------------------

function tileAt(state: MatchState, pos: Position): TerrainTile | null {
  return state.grid.tiles[pos.y]?.[pos.x] ?? null
}

function hasStatus(unit: Unit, kind: Status['kind']): boolean {
  return unit.statuses.some((s) => s.kind === kind)
}

function clearStatuses(unit: Unit, kinds: readonly Status['kind'][]): Unit {
  if (!kinds.some((k) => hasStatus(unit, k))) return unit
  return { ...unit, statuses: unit.statuses.filter((s) => !kinds.includes(s.kind)) }
}

function addStatus(unit: Unit, status: Status): Unit {
  return { ...unit, statuses: [...unit.statuses, status] }
}

function replaceUnit(state: MatchState, replacement: Unit): MatchState {
  return { ...state, units: state.units.map((u) => (u.id === replacement.id ? replacement : u)) }
}

function debitEnergy(state: MatchState, who: PlayerId, cost: number): MatchState {
  if (cost === 0) return state
  const remaining = (state.energy[who] ?? 0) - cost
  const energy: Record<PlayerId, number> = { ...state.energy, [who]: remaining }
  return { ...state, energy }
}

function occupancy(state: MatchState): Set<string> {
  const out = new Set<string>()
  for (const u of state.units) if (u.hp > 0) out.add(positionKey(u.pos))
  return out
}

function ownedUnit(state: MatchState, actorId: PlayerId, unitId: Unit['id']): Unit | ServerErrorCode {
  const unit = state.units.find((u) => u.id === unitId)
  if (!unit) return 'unit_not_owned'
  if (unit.ownerId !== actorId) return 'unit_not_owned'
  if (unit.hp <= 0) return 'unit_dead'
  return unit
}

// Compute damage for direct attacks given target's defensive state and tile.
function computeDirectDamage(
  baseDamage: number,
  attackerTile: TerrainTile | null,
  target: Unit,
  targetTile: TerrainTile | null,
): number {
  let dmg = baseDamage
  if (hasStatus(target, 'shield_wall')) dmg *= 1 - FORTIFY_REDUCTION
  else if (hasStatus(target, 'defending')) dmg *= 1 - DEFEND_REDUCTION
  if (targetTile?.type === 'rubble') dmg *= 1 - COVER_RUBBLE_REDUCTION
  if (attackerTile?.type === 'high_ground' && targetTile?.type !== 'high_ground') {
    dmg *= 1 + HIGH_GROUND_DAMAGE_BONUS
  }
  return Math.max(MIN_DIRECT_DAMAGE, Math.round(dmg))
}

// Damage a unit by an exact amount (bypasses MIN_DIRECT_DAMAGE — callers
// that want the floor apply it via `computeDirectDamage`). Returns the
// updated state and a `killed` flag.
function damageUnit(
  state: MatchState,
  target: Unit,
  damage: number,
): { state: MatchState; killed: boolean } {
  const nextHp = Math.max(0, target.hp - damage)
  const killed = nextHp <= 0
  const units = state.units
    .map((u) => (u.id === target.id ? { ...u, hp: nextHp } : u))
    .filter((u) => u.hp > 0)
  return { state: { ...state, units }, killed }
}

// --- validate / apply: Defend (0-cost table entry, 1E actual) -----------

export function validateDefend(
  state: MatchState,
  actorId: PlayerId,
  action: Extract<GameAction, { kind: 'defend' }>,
): ValidationResult {
  if (state.phase !== 'active') return { ok: false, code: 'match_not_active' }
  if (state.currentTurn !== actorId) return { ok: false, code: 'not_your_turn' }
  const owned = ownedUnit(state, actorId, action.unitId)
  if (typeof owned === 'string') return { ok: false, code: owned }
  const remaining = state.energy[actorId] ?? 0
  if (DEFEND_COST > remaining) return { ok: false, code: 'insufficient_energy' }
  return { ok: true, cost: DEFEND_COST }
}

export function applyDefend(
  state: MatchState,
  action: Extract<GameAction, { kind: 'defend' }>,
  cost: number,
): AbilityApplyResult {
  const unit = state.units.find((u) => u.id === action.unitId)
  if (!unit) return { state, killed: false }
  // Defend is mutually exclusive with Shield Wall (SPEC §13.1) — keep only the newer one.
  const refreshed = addStatus(clearStatuses(unit, ['defending', 'shield_wall']), {
    kind: 'defending',
    ttl: 1,
  })
  return { state: debitEnergy(replaceUnit(state, refreshed), unit.ownerId, cost), killed: false }
}

// --- validate / apply: ability ------------------------------------------

export function validateAbility(
  state: MatchState,
  actorId: PlayerId,
  action: AbilityAction,
): ValidationResult {
  if (state.phase !== 'active') return { ok: false, code: 'match_not_active' }
  if (state.currentTurn !== actorId) return { ok: false, code: 'not_your_turn' }
  const owned = ownedUnit(state, actorId, action.unitId)
  if (typeof owned === 'string') return { ok: false, code: owned }
  const unit = owned

  const abilityId = action.abilityId as AbilityId
  const kit = getKit(unit.classId)
  if (!kit.includes(abilityId)) return { ok: false, code: 'bad_message' }

  switch (abilityId) {
    case 'shield_wall':
      return validateShieldWall(state, actorId)
    case 'vanguard_charge':
      return validateVanguardCharge(state, actorId, unit, action)
    case 'iron_stance':
      return validateIronStance(state, actorId, unit)
    case 'cinder_bolt':
      return validateCinderBolt(state, actorId, unit, action)
    case 'ash_cloud':
      return validateAshCloud(state, actorId, unit, action)
    case 'blink':
      return validateBlink(state, actorId, unit, action)
    case 'blood_tithe':
      return validateBloodTithe(state, actorId, unit)
    case 'hex_trap':
      return validateHexTrap(state, actorId, unit, action)
    case 'desecrate':
      return validateDesecrate(state, actorId, unit, action)
  }
}

export function applyAbility(
  state: MatchState,
  action: AbilityAction,
  cost: number,
  hpCost: number,
): AbilityApplyResult {
  const unit = state.units.find((u) => u.id === action.unitId)
  if (!unit) return { state, killed: false }
  const abilityId = action.abilityId as AbilityId
  switch (abilityId) {
    case 'shield_wall':
      return applyShieldWall(state, unit, cost)
    case 'vanguard_charge':
      return applyVanguardCharge(state, unit, action, cost)
    case 'iron_stance':
      return applyIronStance(state, unit, cost)
    case 'cinder_bolt':
      return applyCinderBolt(state, unit, action, cost)
    case 'ash_cloud':
      return applyAshCloud(state, unit, action, cost)
    case 'blink':
      return applyBlink(state, unit, action, cost)
    case 'blood_tithe':
      return applyBloodTithe(state, unit, cost, hpCost)
    case 'hex_trap':
      return applyHexTrap(state, unit, action, cost)
    case 'desecrate':
      return applyDesecrate(state, unit, action, cost)
  }
}

function getKit(classId: Unit['classId']): readonly AbilityId[] {
  switch (classId) {
    case 'knight':
      return ['shield_wall', 'vanguard_charge', 'iron_stance']
    case 'mage':
      return ['cinder_bolt', 'ash_cloud', 'blink']
    case 'heretic':
      return ['blood_tithe', 'hex_trap', 'desecrate']
  }
}

// --- Shield Wall --------------------------------------------------------

function validateShieldWall(state: MatchState, actorId: PlayerId): ValidationResult {
  const cost = ABILITY_ENERGY_COST.shield_wall
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  return { ok: true, cost }
}

function applyShieldWall(state: MatchState, unit: Unit, cost: number): AbilityApplyResult {
  const refreshed = addStatus(clearStatuses(unit, ['defending', 'shield_wall']), {
    kind: 'shield_wall',
    ttl: 1,
  })
  return { state: debitEnergy(replaceUnit(state, refreshed), unit.ownerId, cost), killed: false }
}

// --- Vanguard Charge ----------------------------------------------------

interface ChargeTrace {
  path: Position[]
  impactUnit: Unit | null
  pushDest: Position | null
  pushBlocked: boolean
}

function cardinalDirection(from: Position, to: Position): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | null {
  const dx = Math.sign(to.x - from.x) as -1 | 0 | 1
  const dy = Math.sign(to.y - from.y) as -1 | 0 | 1
  if (dx !== 0 && dy !== 0) return null
  if (dx === 0 && dy === 0) return null
  return { dx, dy }
}

function traceCharge(state: MatchState, unit: Unit, dir: { dx: number; dy: number }): ChargeTrace {
  const path: Position[] = []
  const occ = new Map<string, Unit>()
  for (const u of state.units) if (u.hp > 0) occ.set(positionKey(u.pos), u)
  let pos = unit.pos
  for (let step = 0; step < VANGUARD_CHARGE_MAX_TILES; step++) {
    const next: Position = { x: pos.x + dir.dx, y: pos.y + dir.dy }
    if (!isInBounds(next)) break
    const tile = tileAt(state, next)
    if (!tile) break
    if (tile.type === 'pillar' || tile.type === 'wall') break
    const blocker = occ.get(positionKey(next))
    if (blocker) {
      if (blocker.ownerId === unit.ownerId) break
      // Impact: charge stops on the tile before the enemy; push target one more.
      const push: Position = { x: next.x + dir.dx, y: next.y + dir.dy }
      const pushTile = tileAt(state, push)
      const pushBlocked =
        !isInBounds(push) ||
        !pushTile ||
        pushTile.type === 'pillar' ||
        pushTile.type === 'wall' ||
        occ.has(positionKey(push))
      return {
        path,
        impactUnit: blocker,
        pushDest: pushBlocked ? null : push,
        pushBlocked,
      }
    }
    path.push(next)
    pos = next
  }
  return { path, impactUnit: null, pushDest: null, pushBlocked: false }
}

function validateVanguardCharge(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.vanguard_charge
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  const target = action.target
  if (!target) return { ok: false, code: 'bad_message' }
  const dir = cardinalDirection(unit.pos, target)
  if (!dir) return { ok: false, code: 'invalid_path' }
  return { ok: true, cost }
}

function applyVanguardCharge(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  const target = action.target
  if (!target) return { state, killed: false }
  const dir = cardinalDirection(unit.pos, target)
  if (!dir) return { state, killed: false }
  const trace = traceCharge(state, unit, dir)
  let working = state
  const landingTile = trace.path[trace.path.length - 1] ?? unit.pos
  working = replaceUnit(working, { ...unit, pos: landingTile })

  let killed = false
  if (trace.impactUnit) {
    const damage =
      VANGUARD_CHARGE_IMPACT_DAMAGE + (trace.pushBlocked ? VANGUARD_CHARGE_BLOCKED_BONUS : 0)
    const dmgRes = damageUnit(working, trace.impactUnit, damage)
    working = dmgRes.state
    killed = dmgRes.killed
    if (!killed && trace.pushDest) {
      // Use the *damaged* survivor from dmgRes.state, not the pre-damage
      // snapshot on trace.impactUnit — otherwise the push overwrites HP.
      const survivor = working.units.find((u) => u.id === trace.impactUnit?.id)
      if (survivor) {
        working = replaceUnit(working, { ...survivor, pos: trace.pushDest })
      }
    }
  }

  return { state: debitEnergy(working, unit.ownerId, cost), killed }
}

// --- Iron Stance --------------------------------------------------------

function validateIronStance(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
): ValidationResult {
  const alreadyOn = hasStatus(unit, 'iron_stance')
  const cost = alreadyOn ? 0 : ABILITY_ENERGY_COST.iron_stance
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  return { ok: true, cost }
}

function applyIronStance(state: MatchState, unit: Unit, cost: number): AbilityApplyResult {
  const alreadyOn = hasStatus(unit, 'iron_stance')
  const refreshed = alreadyOn
    ? clearStatuses(unit, ['iron_stance'])
    : addStatus(unit, { kind: 'iron_stance', ttl: -1 })
  return { state: debitEnergy(replaceUnit(state, refreshed), unit.ownerId, cost), killed: false }
}

// --- Cinder Bolt --------------------------------------------------------

function validateCinderBolt(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.cinder_bolt
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  if (!action.targetId) return { ok: false, code: 'bad_message' }
  const target = state.units.find((u) => u.id === action.targetId)
  if (!target || target.hp <= 0) return { ok: false, code: 'unit_dead' }
  if (target.ownerId === actorId) return { ok: false, code: 'bad_message' }
  if (manhattanDistance(unit.pos, target.pos) > CINDER_BOLT_RANGE) {
    return { ok: false, code: 'out_of_range' }
  }
  const tt = tileAt(state, target.pos)
  if (tt?.type === 'shadow') return { ok: false, code: 'target_untargetable' }
  // LoS is always clear on the stone grid until pillars arrive in M7.
  return { ok: true, cost }
}

function applyCinderBolt(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  if (!action.targetId) return { state, killed: false }
  const target = state.units.find((u) => u.id === action.targetId)
  if (!target) return { state, killed: false }
  const dmg = computeDirectDamage(
    CINDER_BOLT_DAMAGE,
    tileAt(state, unit.pos),
    target,
    tileAt(state, target.pos),
  )
  const res = damageUnit(state, target, dmg)
  return { state: debitEnergy(res.state, unit.ownerId, cost), killed: res.killed }
}

// --- Ash Cloud ----------------------------------------------------------

function ashCloudFootprint(anchor: Position): [Position, Position, Position, Position] {
  return [
    anchor,
    { x: anchor.x + 1, y: anchor.y },
    { x: anchor.x, y: anchor.y + 1 },
    { x: anchor.x + 1, y: anchor.y + 1 },
  ]
}

function validateAshCloud(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.ash_cloud
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  const anchor = action.target
  if (!anchor) return { ok: false, code: 'bad_message' }
  if (manhattanDistance(unit.pos, anchor) > ASH_CLOUD_RANGE) {
    return { ok: false, code: 'out_of_range' }
  }
  for (const p of ashCloudFootprint(anchor)) {
    if (!isInBounds(p)) return { ok: false, code: 'invalid_path' }
  }
  return { ok: true, cost }
}

function applyAshCloud(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  const anchor = action.target
  if (!anchor) return { state, killed: false }
  const cloud: AshCloud = {
    id: `ac_${String(state.ashClouds.length + 1)}_${positionKey(anchor)}`,
    ownerId: unit.ownerId,
    tiles: ashCloudFootprint(anchor),
    ttl: ASH_CLOUD_TTL,
  }
  const next: MatchState = { ...state, ashClouds: [...state.ashClouds, cloud] }
  return { state: debitEnergy(next, unit.ownerId, cost), killed: false }
}

// --- Blink --------------------------------------------------------------

function validateBlink(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.blink
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  const dest = action.target
  if (!dest) return { ok: false, code: 'bad_message' }
  if (!isInBounds(dest)) return { ok: false, code: 'invalid_path' }
  if (manhattanDistance(unit.pos, dest) > BLINK_RANGE) return { ok: false, code: 'out_of_range' }
  const t = tileAt(state, dest)
  if (!t) return { ok: false, code: 'invalid_path' }
  if (t.type === 'pillar' || t.type === 'wall') return { ok: false, code: 'tile_impassable' }
  if (occupancy(state).has(positionKey(dest))) return { ok: false, code: 'tile_occupied' }
  return { ok: true, cost }
}

function applyBlink(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  const dest = action.target
  if (!dest) return { state, killed: false }
  const next = replaceUnit(state, { ...unit, pos: dest })
  return { state: debitEnergy(next, unit.ownerId, cost), killed: false }
}

// --- Blood Tithe --------------------------------------------------------

function validateBloodTithe(
  _state: MatchState,
  _actorId: PlayerId,
  unit: Unit,
): ValidationResult {
  if (hasStatus(unit, 'blood_tithe_used')) return { ok: false, code: 'bad_message' }
  const hpCost = ABILITY_HP_COST.blood_tithe ?? 0
  if (unit.hp - hpCost < BLOOD_TITHE_HP_FLOOR) return { ok: false, code: 'self_kill_prevented' }
  return { ok: true, cost: 0, hpCost }
}

function applyBloodTithe(
  state: MatchState,
  unit: Unit,
  _cost: number,
  hpCost: number,
): AbilityApplyResult {
  const newHp = Math.max(BLOOD_TITHE_HP_FLOOR, unit.hp - hpCost)
  const refreshed = addStatus({ ...unit, hp: newHp }, { kind: 'blood_tithe_used', ttl: 1 })
  let next = replaceUnit(state, refreshed)
  const currentEnergy = next.energy[unit.ownerId] ?? 0
  next = {
    ...next,
    energy: { ...next.energy, [unit.ownerId]: currentEnergy + BLOOD_TITHE_ENERGY_GAIN },
  }
  return { state: next, killed: false }
}

// --- Hex Trap -----------------------------------------------------------

function validateHexTrap(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.hex_trap
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  const target = action.target
  if (!target) return { ok: false, code: 'bad_message' }
  if (!isInBounds(target)) return { ok: false, code: 'invalid_path' }
  if (manhattanDistance(unit.pos, target) > HEX_TRAP_RANGE) {
    return { ok: false, code: 'out_of_range' }
  }
  const t = tileAt(state, target)
  if (!t) return { ok: false, code: 'invalid_path' }
  if (
    t.type === 'pillar' ||
    t.type === 'wall' ||
    t.type === 'shadow' ||
    t.type === 'hazard_fire' ||
    t.type === 'hazard_acid' ||
    t.type === 'hazard_void'
  ) {
    return { ok: false, code: 'tile_impassable' }
  }
  if (occupancy(state).has(positionKey(target))) return { ok: false, code: 'tile_occupied' }
  const existingKey = positionKey(target)
  for (const tr of state.traps) if (positionKey(tr.pos) === existingKey) return { ok: false, code: 'duplicate_trap' }
  const hasPickup = state.pickups.some((p) => positionKey(p.pos) === existingKey)
  if (hasPickup) return { ok: false, code: 'tile_occupied' }
  return { ok: true, cost }
}

function applyHexTrap(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  const target = action.target
  if (!target) return { state, killed: false }
  const mine = state.traps.filter((t) => t.ownerId === unit.ownerId)
  // Evict the oldest trap if at the limit — SPEC §13.3.
  const prunedTraps =
    mine.length >= MAX_TRAPS_PER_HERETIC && mine.length > 0
      ? state.traps.filter((t) => t.id !== mine[0]?.id)
      : state.traps
  const trap: HexTrap = {
    id: `hex_${unit.ownerId}_${positionKey(target)}_${String(state.turnNumber)}`,
    ownerId: unit.ownerId,
    pos: target,
  }
  const next: MatchState = { ...state, traps: [...prunedTraps, trap] }
  return { state: debitEnergy(next, unit.ownerId, cost), killed: false }
}

/**
 * Check every step in a move path for hex traps triggered by the moving unit.
 * Applies damage + `revealed` status when triggered. Returns the next state
 * plus whether the victim died and the trigger's intermediate position (if any)
 * so callers can decide whether movement continues or halts.
 *
 * Per SPEC §13.3: traps trigger on enemy movement entering the trapped tile.
 * A single path may trigger multiple traps if it crosses them in sequence.
 */
export function resolveTrapTriggers(
  state: MatchState,
  moverId: PlayerId,
  path: readonly Position[],
): { state: MatchState; killed: boolean } {
  let working = state
  let killed = false
  for (const step of path) {
    const trap = working.traps.find(
      (t) => t.ownerId !== moverId && positionKey(t.pos) === positionKey(step),
    )
    if (!trap) continue
    const mover = working.units.find((u) => u.ownerId === moverId && u.hp > 0)
    if (!mover) break
    const res = damageUnit(working, mover, HEX_TRAP_DAMAGE)
    working = {
      ...res.state,
      traps: working.traps.filter((t) => t.id !== trap.id),
    }
    if (res.killed) {
      killed = true
      break
    }
    // Apply `revealed` status to the survivor.
    const survivor = working.units.find((u) => u.id === mover.id)
    if (survivor && !hasStatus(survivor, 'revealed')) {
      working = replaceUnit(working, addStatus(survivor, { kind: 'revealed', ttl: HEX_TRAP_REVEAL_TTL }))
    }
  }
  return { state: working, killed }
}

// --- Desecrate ----------------------------------------------------------

function validateDesecrate(
  state: MatchState,
  actorId: PlayerId,
  unit: Unit,
  action: AbilityAction,
): ValidationResult {
  const cost = ABILITY_ENERGY_COST.desecrate
  const remaining = state.energy[actorId] ?? 0
  if (cost > remaining) return { ok: false, code: 'insufficient_energy' }
  const anchor = action.target
  if (!anchor) return { ok: false, code: 'bad_message' }
  if (manhattanDistance(unit.pos, anchor) > DESECRATE_RANGE) {
    return { ok: false, code: 'out_of_range' }
  }
  for (const p of ashCloudFootprint(anchor)) {
    if (!isInBounds(p)) return { ok: false, code: 'invalid_path' }
    const t = tileAt(state, p)
    if (!t) return { ok: false, code: 'invalid_path' }
    if (t.type === 'pillar' || t.type === 'wall') return { ok: false, code: 'tile_impassable' }
  }
  return { ok: true, cost }
}

function applyDesecrate(
  state: MatchState,
  unit: Unit,
  action: AbilityAction,
  cost: number,
): AbilityApplyResult {
  const anchor = action.target
  if (!anchor) return { state, killed: false }
  const footprint = ashCloudFootprint(anchor)
  const tiles = state.grid.tiles.map((row, y) =>
    row.map((tile, x) => {
      const inside = footprint.some((p) => p.x === x && p.y === y)
      if (!inside) return tile
      if (tile.type === 'corrupted') {
        // Re-corrupting refreshes TTL but keeps baseType.
        return { ...tile, ttl: DESECRATE_TTL }
      }
      return {
        type: 'corrupted' as const,
        baseType: tile.type,
        ttl: DESECRATE_TTL,
      }
    }),
  )
  const next: MatchState = { ...state, grid: { ...state.grid, tiles } }
  return { state: debitEnergy(next, unit.ownerId, cost), killed: false }
}

export { ashCloudFootprint }
