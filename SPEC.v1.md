# Dark Council Tactic — Master Spec (v1.4 — ARCHIVED)

> **ARCHIVED.** This is the v1.4 spec, preserved here for git history and decision-log references. The current authoritative spec is `SPEC.md` (v2.0). Do not cite this file in code or PR descriptions. If a section in v1.4 conflicts with v2.0, v2.0 wins.

**Status:** Archived. Superseded by `SPEC.md` v2.0 on 2026-04-22.
**Owner:** Fernando Gomez (design + final review)
**Target:** Vibe Jam 2026 submission
**Version:** 1.4 (2026-04-20) — final v1.x
**Companion:** `ART_SPEC.md` — the designer/sprite brief. Engineering reads this doc; the sprite artist reads ART_SPEC.md. Both must stay in sync (§21–§22 here are the canonical numbers).

---

## 0. How to Read This

This document is for the AI pair-programmer ("Kai" and anyone else) joining the new repo. Read it end to end before touching code. When you disagree with something, open a PR against this file. Don't fork the design by starting to code against a different mental model.

If you are the incoming AI and this is your first message on the project: go to §30 (Handoff Prompt & First Actions) after you've read the rest.

---

## 1. Elevator Pitch

Two champions enter an ashen arena. Each turn, you spend 5 energy on moves, attacks, scouting, defending, ability casts, or picking up battlefield items on a fog-shrouded 8×8 isometric grid. Win the duel, draft a perk, face the next opponent. Last one standing in an 8-player single-elimination tournament wins. Final Fantasy Tactics combat meets Slay the Spire's between-fight decisions, wearing Diablo I's palette. Browser-based, 1v1 online, matches last 5–10 minutes.

---

## 2. Core Pillars

**Every energy point is a decision.** Five energy per turn, no carry-over, use-or-lose. No filler turns. The player should feel the tension of every spend.

**Information is power.** Fog of war is not decoration. Scouting costs energy, traps hide in the dark, the Heretic class is built around lying to the opponent with fog. Taking information from your opponent is as valuable as taking HP.

**Dark, heavy, oppressive atmosphere.** Ash and blood. Flickering torchlight. Not bright fantasy. Palette references: Diablo I, FFT PS1, Dark Souls armor language.

**Readable at a glance.** The art is dark but the game state must be crystal clear. Every champion is identifiable from silhouette. Every tile type has an unambiguous texture. Every ability has a telegraph.

---

## 3. Engineering Principles

Non-negotiable.

**Playable-first, always.** Every milestone gate is a smoke test: two browser tabs, lobby to match, take one action, see the result. If the smoke test is red, the build is red. Visual polish ships after gameplay, not beside it.

**Server is truth.** Client renders what the server tells it to. Client does not compute damage, does not know whose turn it is, does not predict outcomes. Every action goes to the server, is validated, and the authoritative state comes back. Fog of war is filtered *server-side* before the state reaches the client.

**Deterministic combat.** No RNG on hit/miss/crit. Damage values are fixed. Spawns are fixed per arena. The only points of randomness in the whole system are: coin flip for who acts first at match start, the 3-perk offering shuffled per draft, the arena selection per round, the `Chest` pickup rolling its single-use item on open, and the hash-seeded cosmetic variation in terrain tiles (purely visual — does not affect gameplay).

**Placeholder art until §M6.** Until the full gameplay loop (lobby → class select → match with turns, classes, fog, terrain → results) works end to end with colored primitives, no pixel art work begins. Gameplay correctness precedes visual polish, always.

**One AI agent per file at a time.** Parallel lanes on the same file produce silent regressions and duplicate implementations. Fernando assigns work serially. Don't edit a file that's already on someone else's open branch.

**CI as the only merge gate.** `main` is protected. A PR merges only when three checks pass: `typecheck`, `test:unit`, `test:smoke`. `--no-verify`, `@ts-ignore`, and `any` escape hatches are banned in non-test code.

**Thin branches, fast merges.** One branch per small feature. Three-day maximum before merge or close. Long-lived branches become cleanup sagas — don't.

**Strict types, always.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Discriminated unions narrow at message boundaries, not with casts.

---

## 4. Non-Negotiables (design + process)

Design locks: server-authoritative architecture, 5-energy turn economy, 30-second turn timer, sequential turns, fog of war, deterministic damage, the client/server shared types contract, the 8-player tournament with bot fill and inter-round perk drafts, the 3-class roster (Ashen Knight, Pale Mage, Heretic) with their full 3-ability kits, the 16-perk pool, the 5 arena archetypes, the Coward's Brand surrender mechanic, the FFT/Diablo I visual target.

Process locks: the repo lives outside any cloud-sync folder (OneDrive, Dropbox, iCloud). The scene hierarchy is `src/client/scenes/` only — no parallel `screens/` folder. Sprites live in `public/sprites/` only — no duplicate folder elsewhere. One canonical copy of every shared helper (`manhattanDistance`, `isInBounds`, etc.) in `src/shared/`. Build-tool timestamp files (`vite.config.ts.timestamp-*.mjs`, etc.) stay gitignored.

---

## 5. Tech Stack (locked)

Client runtime: PixiJS 8.x on HTML5 Canvas, TypeScript 5.x with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Bundler: Vite. Dev port 3000.

Server runtime: Node 20+, `ws` WebSocket library, TypeScript 5.x with the same strictness. Dev runner: `tsx`. Production: `tsc` build then `node dist/server/index.js`. Port 8080.

Testing: Vitest for unit tests (pure logic in `src/shared` and `src/server`). Playwright for smoke tests (end-to-end two-browser flow). Smoke tests are required, not optional. Fixtures for deterministic server state.

CI: GitHub Actions. One workflow, three jobs: `typecheck`, `test:unit`, `test:smoke`. All three block merge. Smoke test boots the real server and runs Playwright against it.

Linting: ESLint with `@typescript-eslint/strict-type-checked` (preset). Explicit rules on top of that preset: `@typescript-eslint/no-explicit-any: error` (non-test code), `@typescript-eslint/ban-ts-comment: error` (blocks `@ts-ignore` and `@ts-expect-error` without description), `@typescript-eslint/switch-exhaustiveness-check: error` (for discriminated unions like `ClientMessage` / `ServerMessage` / `GameAction`), `@typescript-eslint/no-unnecessary-condition: warn`. Prettier for formatting.

Package manager: npm. No yarn, no pnpm, no bun.

Asset pipeline: Aseprite for pixel-art editing and animation export. PixelLab (or similar AI sprite tool) for initial silhouette generation only — every sprite goes through Aseprite before shipping. Music: Beatoven.ai for ambient game-dev tracks. SFX: SoundsGen or Freesound.org under permissive licenses.

Deployment: Render or Railway for the server, static hosting (Netlify / Vercel / Cloudflare Pages) for the client bundle. Only when gameplay is solid.

**npm scripts (locked names — CI and docs reference these):**

| Script | What it runs |
|--------|--------------|
| `npm run dev` | Client (Vite on :3000) + server (tsx on :8080) in parallel via `concurrently`. |
| `npm run dev:client` | Vite only. |
| `npm run dev:server` | `tsx watch src/server/index.ts` only. |
| `npm run build` | `tsc -p tsconfig.server.json && vite build`. Server → `dist/server`, client → `dist/client`. |
| `npm run start` | `node dist/server/index.js`. Production server entry. |
| `npm run typecheck` | `tsc --noEmit` against root tsconfig. CI gate #1. |
| `npm run test:unit` | Vitest against `tests/unit/`. CI gate #2. |
| `npm run test:smoke` | Playwright against `tests/smoke/`, boots server automatically. CI gate #3. |
| `npm run lint` | ESLint over `src/` and `tests/`. |
| `npm run format` | Prettier write. |

If a script doesn't exist, add it — don't invent a new name. The three gate scripts (`typecheck`, `test:unit`, `test:smoke`) are sacred; renaming them means renaming them in CI too.

---

## 6. Repo Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml                # typecheck + unit + smoke, all required
├── .gitignore                    # node_modules, dist, vite.config.ts.timestamp-*, .env, .DS_Store
├── public/
│   ├── sprites/                  # The only sprite folder. Do not create a second one.
│   └── audio/
├── index.html                    # Vite entry — must live at project root.
├── src/
│   ├── shared/                   # Client + server import from here only.
│   │   ├── types.ts              # Single source of truth for all contracts.
│   │   ├── constants.ts          # Every game number. No inline magic values.
│   │   ├── grid.ts               # manhattanDistance, isInBounds, positionKey, lineOfSight.
│   │   └── index.ts              # Barrel export.
│   ├── server/
│   │   ├── index.ts              # ws server, connection handling, routing.
│   │   ├── GameEngine.ts         # Pure game logic. Testable without ws.
│   │   ├── TournamentManager.ts  # Bracket state, bot fill, perk draft orchestration.
│   │   ├── BotAI.ts              # Deterministic bot opponent.
│   │   ├── Fog.ts                # Per-player state filtering.
│   │   ├── validators.ts         # Pure action validation. Called by engine.
│   │   └── arenas/               # Arena definitions (data, not code).
│   │       ├── pit.ts
│   │       ├── ruins.ts
│   │       ├── bridge.ts
│   │       ├── shrine.ts
│   │       └── maze.ts
│   └── client/
│       ├── main.ts               # Entry. Bootstraps PixiJS app + network.
│       ├── network.ts            # ws client, reconnect, message routing.
│       ├── Renderer.ts           # Single renderer class. No sub-renderers.
│       ├── SceneManager.ts       # Scene lifecycle, transitions.
│       ├── scenes/               # The ONLY scene hierarchy. No screens/.
│       │   ├── TitleScene.ts
│       │   ├── LobbyScene.ts
│       │   ├── MatchScene.ts
│       │   ├── PerkDraftScene.ts
│       │   ├── BracketScene.ts
│       │   ├── ResultsScene.ts
│       │   └── SpectatorScene.ts
│       ├── input/
│       │   └── InputHandler.ts
│       ├── ui/
│       │   └── HUD.ts
│       └── audio/
│           └── SoundManager.ts
├── tests/
│   ├── unit/                     # Vitest. Pure logic only.
│   └── smoke/                    # Playwright. Lobby → match → action.
├── SPEC.md                       # This file. The only design doc.
├── README.md                     # Setup + run instructions only. No design content.
├── tsconfig.json
├── package.json
└── vite.config.ts
```

`index.html` lives at the project root per Vite convention; `public/` holds static assets only (sprites, audio).

Anything not in this tree needs a PR conversation about why it exists. If you want a new top-level markdown doc, the answer is usually "put it in the PR description instead."

---

## 7. Build Order — Milestones

Each milestone is a gate. You do not start the next one until the current one's smoke test is green on `main`. Every milestone has an explicit Definition of Done and a smoke check.

**M0 — Skeleton.** Repo initialized, strict tsconfig, Vite + tsx running, ESLint + Prettier wired, GitHub Actions CI running typecheck + empty unit + smoke-boot on every PR, `main` branch protected. Server accepts a WS connection and sends `{ type: "hello", serverVersion }`. Client connects and logs it. **Smoke:** `npm run dev` → browser → console shows server hello. **Artifact:** green CI badge on first PR.

**M1 — Grid and units.** Server holds an 8×8 grid and two connected players, each with one unit at mirrored spawn positions (1,4) and (6,3). Client renders the grid as an isometric diamond of colored 64×32 diamond tiles and the two units as colored circles with a letter label. No sprites, no animation, no real terrain. **Smoke:** two browser tabs both see the same grid and both units.

**M2 — Move action, energy, turn order.** Click a tile. Client sends `{ type: "action", action: { kind: "move", to } }`. Server validates (tile in range, on grid, not occupied, not impassable, enough energy), applies, broadcasts authoritative state. Movement is orthogonal only (no diagonals), 1 energy per tile. Energy refreshes to 5 at turn start. Turn order: coin flip at match start, then alternating. **Smoke:** two tabs, player A moves, player B sees it within 200ms, player A cannot move more than 5 tiles in one turn, player B cannot move during A's turn.

**M3 — Attack, HP, death, match-end.** Basic attack action (2 energy). Adjacent tiles for melee, class-ranged for ranged once classes ship. Fixed damage by class. Units have HP, die at 0, are removed. Match ends when one side has no living units. `ResultsScene` shows winner. **Smoke:** attack reduces HP, death ends match, both clients transition to ResultsScene.

**M4 — Turn timer + full turn loop.** 30-second turn timer, auto-end on timeout, remaining energy is forfeited. `EndTurn` action (0 energy) lets player end turn early. Timer visible in HUD. **Smoke:** a full match plays end-to-end across two tabs with no page refresh, timer counts down, timeout ends turn.

**M5 — Three classes with full 3-ability kits.** Ashen Knight, Pale Mage, Heretic. Stats and abilities exactly as specified in §13. `LobbyScene` lets each player pick a class before match start. `Defend` and `Wait` actions added. **Smoke:** all nine matchups (incl. mirrors) playable without crashes; each ability's effect is visible and validated server-side.

**M6 — Fog of war + Scout.** Server filters `MatchState` per player based on unit sight (2-tile radius by default, class-modified). Client renders fogged tiles as dark overlay. Terrain always visible; enemy positions only visible when in sight. "Last known state" ghosts: when an enemy leaves sight, render a faded marker where they were last seen. `Scout` action (1 energy): reveal a 3×3 area anywhere on the map for the current player, for 1 turn. **Smoke:** player A cannot see player B outside sight range; Scout reveals B; moving out re-fogs; ghost marker appears on last-seen tile.

**M7 — Full terrain + battlefield pickups.** All seven terrain types (§10) implemented with their mechanics. Four pickup types (§16) spawn per arena. Pickup action (1 energy) grabs item on current tile. **Smoke:** high ground costs 2 energy to enter, hazards do 1 dmg/turn, pillars block LoS for attacks and Scout, shadow tiles grant untargetability, pickups grant their effects.

**M8 — FFT-quality terrain textures.** Replace colored diamond tiles with the textured pixel-art tiles specified in §21. Hand-crafted or Aseprite-exported 64×32 diamond textures for each terrain type with the visual details (mortar, moss, grass, ember, veins) called out. `image-rendering: pixelated` locked down, `SCALE_MODES.NEAREST`, sub-pixel positions rounded at render. **Smoke:** all seven terrain types visually distinguishable at a glance on the live grid, pixels are crisp at every zoom level.

**M9 — FFT-quality champion sprites and ability VFX.** Replace colored circles with full sprite sheets per §22. Each champion ships idle (4 frames), walk (6 frames), attack (5 frames), hit (3 frames), death (4 frames), defend (2 frames), cast/channel (4 frames). Ability VFX sprites per §22.4. Damage numbers with scale-punch animation. **Smoke:** all three champions animated correctly across all state transitions; ability casts show telegraph + impact VFX.

**M10 — Tournament bracket + bot fill + perk draft.** 8-player single-elimination, fixed bracket size. `TournamentManager` pairs players, advances winners, handles losses. Bot fills empty slots after a 15-second matchmaking wait — the bracket is always exactly 8 entrants before round 1 begins (no byes, no odd-round reseeding). Seeding within the bracket is randomized per tournament. `BracketScene` shows current standings. Perk draft between rounds: winner picks 1 of 3 perks, lasts the next round only, no stacking. All 16 perks from §14 implemented. Losing players route to `SpectatorScene` (M12) — for now they just see a "you were eliminated" card. **Smoke:** full 8-player tournament runs to completion with mixed humans and bots, perks visibly modify next match.

**M11 — Five arenas + map rotation.** All five arena archetypes (§15) built out as terrain layouts with fixed pickup slots (random which pickups). Random arena selected per round. **Smoke:** across a full tournament, at least 3 different arenas appear; each arena plays distinctly (ranged-favoring, melee-favoring, etc.).

**M12 — Surrender + spectator mode.** `Kneel` action (surrender): 3-second dramatic pause, bell-toll cue, match ends, winner portrait next to a cracked-portrait effect on the surrenderer in bracket. Eliminated players land on `SpectatorScene` and can watch any in-progress match (read-only state stream). **Smoke:** surrender triggers the sequence, spectator can watch a live match end-to-end.

**M13 — Audio, polish, submission.** Music tracks per §24 wired into scenes, SFX on every action, ambient wind in match scenes. Final HUD pass: portraits, energy pips, turn banner, status icons. Title screen, main menu, post-tournament stats screen. Deploy. **Smoke:** cold-open in an incognito browser, complete full tournament, hear audio, see end credits.

Nothing ships beyond M13 before submission. Post-submission items go into a separate file.

---

## 8. Combat System

### 8.1 Turn Structure

Sequential turns, alternating. Player A acts → Player B acts → repeat. Why not simultaneous: simultaneous resolution requires a conflict-resolution engine, makes fog-of-war edge cases brutal, and makes spectating confusing. Sequential matches FFT and Into the Breach and lets players react to their opponent.

Turn start: energy refreshes to 5 (or 6 with Energy Surge perk). Turn timer: 30 seconds. If the timer expires, the player forfeits remaining energy, turn auto-ends.

Turn end conditions: `EndTurn` action voluntarily, or timer expiry, or the player runs out of energy and has no 0-cost actions available (auto-end heuristic is optional — explicit is fine).

### 8.2 Energy

Five energy per turn. Does not carry over. Use it or lose it. The tension is real: moving 3 tiles plus attacking costs 5, leaving nothing for defend/scout. Every turn is a budget decision.

### 8.3 Action Table

| Action | Cost | Description |
|--------|------|-------------|
| `Move` | 1 per tile (2 for difficult terrain, 2 to climb onto high ground) | Orthogonal only. No diagonals. Blocked by impassable tiles and enemy-occupied tiles. |
| `Attack` | 2 | Deal class damage to target. Melee: adjacent. Ranged: within class attack range, requires line of sight (LoS). |
| `Defend` | 1 | Reduce all incoming damage by 50% until your next turn. Stacks with terrain cover (multiplicative). |
| `Scout` | 1 | Reveal a 3×3 area anywhere on the map. Revealed tiles stay visible until the start of your *next* turn. |
| `Ability` | 2–4 (class-defined) | Use one of your class's three abilities. Costs and effects per §13. |
| `UsePickup` | 1 | Consume the pickup on your current tile. Must be standing on it. |
| `Kneel` | 0 | Surrender. Triggers the Coward's Brand sequence (§17). One-way. |
| `EndTurn` / `Wait` | 0 | End turn voluntarily. No benefit, no penalty. |

Multiple actions per turn in any order as long as energy allows. No limit on action count, only energy.

### 8.4 Damage and Health

All damage is deterministic. If you're in range and have LoS, the hit lands. Damage values are fixed per ability. Cover (terrain Rubble or a defend action) reduces incoming damage; the two stack multiplicatively. No crit, no miss, no dodge chance.

Base HP per class: Ashen Knight 24, Heretic 20, Pale Mage 16. Death at 0 HP removes the unit.

No natural healing. Healing comes from: Heretic's Desecrate (1 HP/turn on corrupted tile), Health Flask pickup (5 HP), Second Wind perk (4 HP at round start), Vampiric Touch perk (1 HP per successful attack). All healing is clamped to `maxHp`; excess is lost.

### 8.5 Combat Rules Clarifications

These are the edge cases every class and ability needs to agree on. They live here, not buried in §13, so validators and bot AI can reference one source.

**Line of sight (LoS).** Bresenham line from the *center* of the attacker's tile to the *center* of the target's tile. A line is blocked if any tile it passes through (other than the endpoints) has `type === "pillar" | "wall"` or is currently under an Ash Cloud overlay. Shadow tiles do *not* block LoS. LoS is symmetric: if A can see B, B can see A. LoS also gates fog-of-war vision (see §11).

**Path validation.** `Move` actions submit a `path: Position[]` (the sequence of tiles walked, not including the start). Client computes the path for UI preview (e.g. A*) and sends it; server re-validates every step: in bounds, passable, not enemy-occupied, each step orthogonal and adjacent to the previous, total cost (including difficult-terrain and high-ground surcharges) ≤ available energy. If any step fails, the whole action rejects with `actionResult { ok: false }` and no partial movement occurs.

**Action → state ordering.** Server emits, in order: `actionResult { ok: true, eventId }` to the acting player, then `stateUpdate` to both players (fog-filtered). Clients must not render an action as resolved until the subsequent `stateUpdate` arrives. `eventId` correlates the two so animations don't double-fire.

**Rounding and minimums.** Damage rounds half-up. Direct attacks have a minimum of 1 damage after all reductions. DoT ticks (hazards, Corrupted) bypass the floor — they always deal their listed value, not a minimum-1.

**Ability targeting defaults.** Unless stated otherwise, abilities targeting a tile require LoS from the caster to the target tile; abilities targeting a unit require LoS to that unit. Exceptions are called out per-ability below.

### 8.6 Turn-Start Resolution Order

Every server tick at turn start resolves effects in a fixed order, then hands the turn to the next player. Without a fixed order you get nondeterministic deaths. The order:

1. Decrement TTLs on all Statuses, Ash Clouds, Corrupted tiles, and Hex Trap "revealed" markers belonging to the player whose turn just *ended*. Expired effects are removed before any DoT applies.
2. Apply hazard DoT (1 damage) to any unit standing on a hazard tile, in unit-id order.
3. Apply Ash Cloud DoT (1 damage) to any unit standing on an active Ash Cloud tile.
4. Apply Corrupted-tile effects: 2 damage to non-Heretic units, +1 HP to the Heretic if the Heretic is standing on a Corrupted tile they own.
5. Apply Vampiric Touch / Second Wind / round-start perk effects scoped to the new turn.
6. Check for match-end conditions (§8.7). If the match is over, broadcast `matchOver` and do not start the next turn.
7. If the match continues: refresh `currentTurn`'s energy, clear `blood_tithe_used`, increment `turnNumber`, set `turnEndsAt`, broadcast `turnStart` and the fresh fog-filtered `stateUpdate`.

This sequence is the same whether the prior turn ended via `EndTurn`, timer expiry, or auto-end. Bots execute on the same tick as humans.

### 8.7 Match-End Resolution

A match ends the moment any of these conditions become true; checks happen after every state-changing event (action, DoT tick, surrender):

- **Knockout.** One player has zero living units. Surviving player wins.
- **Double-KO.** Both players have zero living units in the same tick (e.g. Vanguard Charge + push into a hazard finishes the only Heretic while the Knight is finished by simultaneous hazard DoT). The player whose action *caused* the tick *loses* — self-elimination is a loss. If both players were eliminated by passive effects on the same tick (DoT only, neither acting), the player whose turn was *not* in progress wins (the active player "walked into it"). If still ambiguous (impossible under current rules but reserved): the player with higher remaining HP at the start of the tick wins; ties → coin flip on the match seed.
- **Surrender.** `Kneel` action. The kneeler loses regardless of HP.
- **Forfeit.** Reconnect grace expired or repeated invalid-action spam beyond the rate limit (>50 rejected actions in 10s) → forfeit.
- **No-units-spawned bug fallback.** If somehow a match starts with one or both players having zero units, the server logs an error and aborts the match with a `bug` outcome (no winner advances; the bracket re-pairs survivors).

`matchOver` payload includes `{ winner, final, surrender?, cause: "knockout" | "surrender" | "forfeit" | "double_ko" | "bug" }`. The client picks animation and audio based on `cause`.

---

## 9. Grid

8×8 isometric. Coordinate system: `{x: 0..7, y: 0..7}`, origin at the top corner of the diamond. Tiles rendered as 64×32 diamond top face with visible depth (side faces, per §21). Units stand on top, anchored center-bottom.

Spawn: mirrored across the vertical axis. A fixed pair of spawn positions per arena, same for both players rotated 180°. Fair, deterministic.

---

## 10. Terrain Types

Seven gameplay categories (Stone, High Ground, Rubble, Hazard, Pillar/Wall, Shadow, Corrupted). Hazard has three visual variants with identical mechanics, and Pillar/Wall are two impassable variants with identical mechanics but different sprites — that's why the `TerrainType` union in §18 has ten members. All tiles have a base state; some tiles can be dynamically corrupted by the Heretic or covered by Ash Cloud.

Ash Cloud is a *temporary overlay*, not a base terrain type. It is tracked as a separate effect (see §13.2) and does not replace the underlying `TerrainType`. The renderer draws it on top of whatever terrain is beneath it.

**Stone (default).** Normal movement, no modifiers. Most of the arena.

**High Ground.** Costs 2 energy to climb onto (not to leave). Unit on high ground deals +25% damage when attacking a lower-elevation target (rounded down, min +1). Defensive footing.

**Rubble.** Difficult terrain: 2 energy to enter. Provides light cover: 15% damage reduction while standing on it (stacks with Defend multiplicatively).

**Hazard.** Three variants for flavor, same mechanic: 1 damage/turn to any unit standing on a hazard tile at turn start. Variants: Fire (orange ember), Acid (bubbling green), Void (swirling purple). Knockback effects can push enemies onto hazards.

**Pillar / Wall.** Impassable. Blocks line of sight for both ranged attacks *and* Scout. Walls and pillars are the primary LoS geometry.

**Shadow Tile.** A unit on a shadow tile is untargetable by direct single-target attacks (enemy cannot pick them as an `Attack` / `Cinder Bolt` / `Hex Trap` target). Area effects (Ash Cloud DoT, Desecrate DoT, hazard DoT) still damage a unit standing on a shadow tile. The shadowed unit becomes visible and targetable for the rest of their next turn as soon as they take any action other than `EndTurn` / `Wait` / `Defend`. Shadow tiles do not block LoS — they conceal the *occupant*, not the *line*.

**Corrupted.** Heretic-created via Desecrate ability. Deals 2 damage/turn to non-Heretic units standing on it. Heals the Heretic 1 HP/turn while standing on it. Duration: 3 turns, then reverts to its base terrain.

---

## 11. Fog of War

Every player starts each turn with vision of the tiles around each of their units within their class's sight range (Pale Mage 3, Ashen Knight 2, Heretic 2). Vision uses Manhattan distance *and* requires LoS — pillars, walls, and Ash Clouds block sight just as they block ranged attacks. Terrain layout itself is always visible (the shape of the map is known from match start); what's fogged is the presence and state of enemy units, pickups, and traps.

Vision updates in real time during the player's turn. Moving a unit updates vision on every step. Scout action reveals a 3×3 area anywhere on the map, ignoring LoS (Scout is magical insight, not a camera). Revealed tiles stay visible until the start of your next turn.

**Last-known-state ghosts.** When an enemy leaves your sight range, the last tile you saw them on shows a faded ghost marker — the champion sprite is rendered with a PixiJS `ColorMatrixFilter` applied at runtime (grayscale + 0.35 alpha). There is no separate `_ghost.png` asset; do not ship one. The ghost stays until you either re-spot the enemy somewhere else (ghost clears, new position shows) or scout the ghost's tile (confirms empty, ghost clears). This is what makes fog of war readable instead of frustrating.

**Pickup memory.** Pickups are one-shot: once consumed they do not respawn for the rest of the match. Pickups you have seen before but are currently fogged render as faded icons at their last-known tile (same ColorMatrixFilter approach as ghost units). If a pickup is consumed while fogged from your perspective, you learn it's gone only when you next have vision of that tile.

**Server-side filtering.** Every `stateUpdate` is computed per-player on the server and stripped of fogged data before broadcast. The client never receives enemy positions, trap positions, or unseen pickup states it shouldn't know. Bots receive fog-filtered state through the same filter — they are not given an omniscient view. This is not optional; client-side fog is cheating.

---

## 12. Damage & HP

All damage is deterministic. Fixed values per class and ability (§13). Cover and Defend are multiplicative damage reductions.

Example calc: Knight attack (5 damage) on a Mage standing on Rubble (–15%) with Defend active (–50%): `5 × 0.85 × 0.5 = 2.125 → round to 2`. Rounding: standard rounding (halves round up), minimum 1 on any direct attack that lands (cover/defend cannot reduce below 1 damage).

HP does not regenerate naturally. Healing sources are named and limited (§8.4).

---

## 13. Classes

Three classes. Each has a complete 3-ability kit. These values are the starting point; tuning passes happen after M10 playtesting.

### 13.1 The Ashen Knight — Frontline Bruiser

**Identity:** Closes distance. Takes hits. Punishes anyone who gets close. The honest fighter — no tricks, just pressure.

| Stat | Value |
|------|-------|
| HP | 24 |
| Move cost | 1 energy/tile |
| Attack range | Melee (adjacent) |
| Sight range | 2 tiles |
| Base attack damage | 5 |

**Abilities:**

*Shield Wall* — 1 energy. Take 50% reduced damage until your next turn AND reduce any forced movement (knockback, push) to 0. Cannot be combined with the basic Defend action on the same turn (they don't stack — whichever was used last is the active effect).

*Vanguard Charge* — 3 energy. Move in a straight orthogonal line of up to 3 tiles. Stops early if the line hits an enemy, a pillar/wall, or the grid edge. On stopping against an enemy: deal 4 damage, push them 1 tile further in the charge direction. If the push destination is blocked (pillar, wall, grid edge, or another unit), the pushed target takes +2 bonus damage and does not move. Charging into a pillar or wall with no intervening enemy halts harmlessly on the last passable tile. Hazard and Corrupted tiles are valid line tiles (charge does not skip their on-enter effects for the Knight).

*Iron Stance* — 2 energy to toggle on, 0 energy to toggle off. Persists across turns until toggled off or the Knight dies (not consumed by taking a turn). While active: unmovable by forced movement, knockback effects are negated entirely, and every tile of your own movement costs 1 extra energy. Only one Iron Stance instance exists — re-casting while active does nothing.

**Playstyle:** Get in the enemy's face and stay there. High HP means you can trade. Vanguard Charge closes gaps fast. Counterplay is kiting.

### 13.2 The Pale Mage — Ranged Glass Cannon

**Identity:** Controls space with area damage and zone denial. Devastating at distance; fragile up close.

| Stat | Value |
|------|-------|
| HP | 16 |
| Move cost | 1 energy/tile |
| Attack range | 3 tiles (requires LoS) |
| Sight range | 3 tiles |
| Base attack damage | 3 |

**Abilities:**

*Cinder Bolt* — 2 energy. Ranged attack, range 3, requires LoS. Deals 5 damage. Core tool for Mage damage output.

*Ash Cloud* — 3 energy. Pick an anchor tile within range 3 (Manhattan distance, LoS required to the anchor); the cloud covers that tile and the 3 tiles to its right, down, and right-down (a fixed 2×2 footprint with the anchor in the top-left of the footprint). All four footprint tiles must be in bounds. Lasts 2 turns (ticks at the caster's next turn start, expires at the turn start after that). Blocks LoS through covered tiles for both players and for Scout. Any unit standing on an Ash Cloud tile at turn start takes 1 damage. Multiple Ash Clouds can exist; they do not stack damage on overlapping tiles.

*Blink* — 2 energy. Teleport to any tile within range 2 (Manhattan). Must be in your current vision (non-fogged) and passable (not pillar, wall, impassable terrain, or occupied by another unit). Ignores pillars/walls as LoS blockers for the teleport itself (the Blink doesn't travel — it just resolves). Hazard and Corrupted tiles are valid destinations and their on-enter effects apply immediately.

**Playstyle:** Kite, zone with Ash Cloud, snipe with Cinder Bolt. 16 HP means two Knight swings and you're nearly dead. Blink is your lifeline.

### 13.3 The Heretic — Blood Warlock Trickster

**Identity:** Sacrifices HP for power. Lays traps in fog. Corrupts terrain. Plays mind games. The class built around fog of war as a weapon.

| Stat | Value |
|------|-------|
| HP | 20 |
| Move cost | 1 energy/tile |
| Attack range | 2 tiles (LoS not required at range ≤ 2 — attack ignores pillars/walls at point-blank) |
| Sight range | 2 tiles |
| Base attack damage | 4 |

**Abilities:**

*Blood Tithe* — 0 energy, costs 4 HP. Gain +2 energy this turn. Once per turn. Cannot kill the Heretic: if current HP ≤ 4, the action is rejected (min 1 HP survivor rule). The defining mechanic — you can have 7-energy turns at the cost of your life. Used for explosive combos.

*Hex Trap* — 2 energy. Place an invisible trap on any tile within range 2 (Manhattan, LoS not required — same as the Heretic's attack). Legal target tiles must be: passable terrain (not pillar, wall, shadow, or hazard), empty of units, empty of pickups, and not already trapped. Traps are invisible to the opponent until triggered (fog-filtered out server-side). Trigger: enemy movement enters the trapped tile — deal 4 damage and apply `revealed` status. Revealed lasts 2 of the *victim's own* turn starts (visible through fog for the Heretic regardless of range). Max 2 traps per Heretic; placing a third removes the oldest automatically. Traps persist until triggered or the Heretic dies.

*Desecrate* — 3 energy. Corrupt a 2×2 area within range 2 (same anchor convention as Ash Cloud — the target tile plus its right/down/right-down neighbors, all four in bounds and not currently pillars/walls). Lasts 3 turns. Each affected tile stores its previous `TerrainType` in `baseType` and becomes `corrupted`; on expiry, reverts to `baseType`. Corrupted tiles deal 2 damage/turn to non-Heretic units at their turn start and heal the Heretic 1 HP/turn at the Heretic's turn start. Movement cost and on-enter effects are the Corrupted rules, not the `baseType` — Desecrate temporarily *replaces* the terrain, not overlays it. Corrupting a hazard tile suppresses its DoT for the duration (hazards heal the Heretic just like any corrupted tile). Corrupting high ground drops the +elevation bonus while corrupted.

**Playstyle:** Lay traps in the fog. Force the enemy to scout (burning energy) or risk stepping on 4 damage. Use Blood Tithe turns for monster plays: Move + Hex Trap + Desecrate in one turn, paying 4 HP. Against a Knight you kite and trap. Against a Mage you corrupt terrain to heal through their poke and close distance with Blood Tithe-fueled movement.

### 13.4 Class Balance Triangle

```
         KNIGHT
        /      \
  Pressure    Trades well
  & Close     in melee
      /          \
   MAGE -------- HERETIC
     Kites &      Traps &
     Zones        Corrupts
```

Target matchup ratios, none worse than 55/45:

- Knight vs Mage — Knight slight favorite (~55/45). Knight tanks Mage damage; Vanguard Charge closes gaps. Mage needs perfect Blinks and Ash Cloud zoning.
- Mage vs Heretic — Mage slight favorite (~52/48). Range lets Mage scout-and-poke without walking into traps. Heretic's Desecrate healing can outlast the poke.
- Knight vs Heretic — Heretic slight favorite (~52/48). Knight walks forward into traps; Blood Tithe matches Knight aggression. If Knight avoids traps and connects, Heretic's lower HP hurts.

Skill and perk choice matter more than class pick.

---

## 14. Perks

Between tournament rounds, each advancing player picks 1 of 3 randomly-drawn perks. Perks last for the NEXT ROUND ONLY — they do not stack across the tournament. Both upcoming-match players draft privately; opponent's perk is hidden until it matters mechanically (first activation).

**Full perk pool (16 perks; jam scope ships all of them):**

| Perk | Effect | Category |
|------|--------|----------|
| Bloodlust | +1 damage on all attacks | Offense |
| Second Wind | Heal 4 HP at round start | Sustain |
| Scout's Eye | Full map vision for your first 2 turns | Information |
| Energy Surge | 6 energy per turn instead of 5 | Economy |
| Thick Skin | −1 damage taken from all sources (min 1) | Defense |
| Ghost Step | Your first move each turn costs 0 energy | Mobility |
| Trap Sense | All hex traps within 2 tiles of you are revealed to you | Counter |
| Ash Walker | Immune to hazard terrain damage | Terrain |
| First Strike | +3 damage on the first attack of the round | Tempo |
| Last Stand | Below 5 HP: +2 damage on attacks | Clutch |
| Mist Cloak | Start the round on a shadow tile (arena permitting) | Stealth |
| Fortify | Defend blocks 75% instead of 50% | Defense |
| Long Reach | +1 to your attack range (melee classes still require adjacency) | Offense |
| Pillager | Using pickups costs 0 energy | Economy |
| Counterspell | First enemy ability this round fizzles (no cost refunded to them) | Counter |
| Vampiric Touch | Heal 1 HP per successful attack | Sustain |

Design intent: perks let you adapt between rounds. Saw a trap-heavy Heretic? Pick Trap Sense. Facing a Knight? Ghost Step for kiting. Roguelite replayability without persistent progression; every tournament starts fresh.

---

## 15. Arenas

Each tournament round uses a randomly-selected arena. Players don't know the arena until the round starts. Five archetypes ship at submission:

*The Pit.* Open center, high ground rings the edges. Favors ranged. Sightlines are long; cover is in the corners.

*The Ruins.* Dense pillars and rubble. Lots of cover, short sightlines. Favors melee and traps; the Heretic shines here.

*The Bridge.* Narrow central corridor with hazards flanking the sides. Forces head-on engagement. Long-range classes get kited if they sit still.

*The Shrine.* Symmetrical, one powerful pickup (Scroll of Sight) in the exact center. Risk/reward: whoever grabs it controls the map, but they walk into the middle.

*The Maze.* Winding paths with shadow tiles throughout. Information warfare. The Heretic's home arena.

Arena data (terrain layout, spawn positions, pickup spawn slots) lives in `src/server/arenas/*.ts` as pure-data exports. No arena-specific logic; the engine reads the data.

---

## 16. Battlefield Pickups

One of each pickup type per map at match start. Positions are fixed per arena (defined in the arena data file), but which *chest* appears where is randomized. Pickups are hidden in fog until scouted or within sight. Pickup action costs 1 energy (0 with Pillager perk).

| Pickup | Effect |
|--------|--------|
| Health Flask | Restore 5 HP |
| Energy Crystal | +2 energy this turn |
| Scroll of Sight | Reveal the entire map for 1 turn |
| Chest | Opens to one of three single-use items (random): Smoke Bomb (place 1-tile fog on any tile within 2 for 2 turns), Flash (stun adjacent enemy 1 turn; they skip their next turn), Whetstone (+2 damage on your next attack only) |

Pickups add a reason to explore the map rather than rushing the opponent.

---

## 17. Surrender — The Coward's Brand

Surrender is not a quiet forfeit button. It is a moment.

**How it works.** At any point during your turn, you can choose `Kneel`. Your champion drops to one knee, weapon dropped beside them (sprite: `kneel` animation, 4 frames, holds on last frame). A 3-second dramatic pause. Screen darkens to alpha 0.6. A single deep bell toll plays. Your opponent's champion takes one step forward and stands over you. The match ends. Banner appears: *"[Player] has yielded. The arena remembers."*

**The shame layer.** In the tournament bracket view, the surrenderer's portrait gets a cracked/shattered overlay visible to everyone in the tournament for the rest of the tournament. If spectators are watching the match, ghost spectators emit a slow-clap emote (post-jam polish; jam-scope: just the banner).

**Why it matters.** Most games make surrender invisible. Making it theatrical means players think twice before quitting, surrenders are memorable for spectators, and the shame becomes a meme/badge (some will kneel on purpose for the effect). Psychological weight is the point.

---

## 18. Data Contracts

All shared types live in `src/shared/types.ts`. This is the contract. If it compiles, both ends agree.

```ts
// Core primitives
export interface Position { x: number; y: number }
export type UnitId = string & { readonly __brand: "UnitId" }
export type PlayerId = string & { readonly __brand: "PlayerId" }
export type MatchId = string & { readonly __brand: "MatchId" }
export type PerkId =
  | "bloodlust" | "second_wind" | "scouts_eye" | "energy_surge"
  | "thick_skin" | "ghost_step" | "trap_sense" | "ash_walker"
  | "first_strike" | "last_stand" | "mist_cloak" | "fortify"
  | "long_reach" | "pillager" | "counterspell" | "vampiric_touch"

export type ClassId = "knight" | "mage" | "heretic"

export type TerrainType =
  | "stone" | "high_ground" | "rubble"
  | "hazard_fire" | "hazard_acid" | "hazard_void"
  | "pillar" | "wall" | "shadow" | "corrupted"

export interface TerrainTile {
  type: TerrainType
  /** Only present for Corrupted/Ash Cloud — turns remaining */
  ttl?: number
  /** Underlying type for reverting dynamic effects */
  baseType?: TerrainType
}

export interface Unit {
  id: UnitId
  ownerId: PlayerId
  classId: ClassId
  pos: Position
  hp: number
  maxHp: number
  statuses: Status[]           // defending, shield_wall, iron_stance, revealed, etc.
  // No cooldowns field. Ability gating is by energy + HP cost + once-per-turn
  // flags carried inside statuses (e.g. blood_tithe_used). If a future ability
  // needs turn-counting cooldowns, add it here and update validators — don't
  // reach for a Record<string, number> escape hatch.
}

export interface Status {
  kind:
    | "defending"
    | "shield_wall"
    | "iron_stance"
    | "revealed"
    | "stunned"
    | "blood_tithe_used"  // cleared at owner's next turn start
  ttl: number             // turns remaining; -1 means "until toggled off" (Iron Stance)
}

export interface Pickup {
  id: string
  pos: Position
  kind: "health_flask" | "energy_crystal" | "scroll_of_sight" | "chest"
}

export interface HexTrap {
  id: string
  ownerId: PlayerId
  pos: Position  // hidden from non-owners via fog filter
}

/** Temporary Ash Cloud overlay. Does not replace TerrainType. */
export interface AshCloud {
  id: string
  ownerId: PlayerId
  tiles: [Position, Position, Position, Position]  // fixed 2×2 footprint
  ttl: number                                       // turns remaining
}

export interface ArenaDef {
  slug: string                    // "pit" | "ruins" | "bridge" | "shrine" | "maze"
  name: string                    // Display name
  tiles: TerrainType[][]          // 8×8, [y][x]
  spawns: [Position, Position]    // mirrored spawn positions per match
  pickupSlots: Position[]         // fixed candidate slots; which pickup lands where is rolled at match start
}

export interface MatchState {
  matchId: MatchId
  arena: string                // arena slug
  grid: { width: 8; height: 8; tiles: TerrainTile[][] }
  units: Unit[]
  pickups: Pickup[]
  traps: HexTrap[]             // fog-filtered per player
  ashClouds: AshCloud[]        // overlays — renderer draws atop tiles
  currentTurn: PlayerId
  turnNumber: number           // monotonic counter from 1
  turnEndsAt: number           // unix ms (server clock)
  energy: Record<PlayerId, number>
  maxEnergy: Record<PlayerId, number>  // 5, or 6 with Energy Surge
  perks: Record<PlayerId, PerkId[]>
  phase: "active" | "over"
  winner?: PlayerId
  surrender?: { by: PlayerId; at: number }
}

// Actions (client → server)
export type GameAction =
  | { kind: "move"; unitId: UnitId; path: Position[] }   // server re-validates every step
  | { kind: "attack"; unitId: UnitId; targetId: UnitId }
  | { kind: "defend"; unitId: UnitId }
  | { kind: "scout"; unitId: UnitId; center: Position }
  | { kind: "ability"; unitId: UnitId; abilityId: string; target?: Position; targetId?: UnitId }
  | { kind: "usePickup"; unitId: UnitId }
  | { kind: "kneel" }
  | { kind: "endTurn" }

export type ClientMessage =
  | { type: "joinTournament"; name: string; sessionToken?: string }
  | { type: "selectClass"; classId: ClassId }
  | { type: "ready" }
  | { type: "action"; action: GameAction }
  | { type: "selectPerk"; perkId: PerkId }
  | { type: "spectate"; matchId: MatchId }
  | { type: "leaveSpectator" }

export type ServerMessage =
  | { type: "hello"; serverVersion: string; sessionToken: string }
  | { type: "error"; code: string; reason: string }
  | { type: "tournamentUpdate"; bracket: BracketState }
  | { type: "matchStart"; match: MatchState; youAre: PlayerId }
  | { type: "stateUpdate"; match: MatchState }            // fog-filtered per recipient
  | { type: "turnStart"; playerId: PlayerId; endsAt: number }
  | { type: "actionResult"; ok: boolean; error?: string; eventId?: string }
  | { type: "matchOver"; winner: PlayerId; final: MatchState; surrender?: boolean }
  | { type: "perkOptions"; perks: PerkId[] }
  | { type: "spectatorState"; match: MatchState }         // full state for spectators

export interface BracketState {
  rounds: BracketRound[]
  currentRound: number
}
export interface BracketRound {
  matches: Array<{ matchId: MatchId; players: [PlayerId, PlayerId]; winner?: PlayerId; status: "pending" | "active" | "done" }>
}
```

Two rules about this file. First: it is THE contract — nothing else defines these shapes. Second: game-shape types live *only* here. If you find yourself wanting to declare `interface MatchState` in a client file, stop.

All game numbers — grid size (8), energy (5), turn timer (30s), class HP/damage/sight values, perk effects — live in `src/shared/constants.ts`. No inline magic values anywhere else. Minimum shape:

```ts
// src/shared/constants.ts
export const GRID_WIDTH = 8 as const
export const GRID_HEIGHT = 8 as const
export const BASE_ENERGY_PER_TURN = 5 as const
export const TURN_TIMER_MS = 30_000 as const
export const RECONNECT_GRACE_MS = 30_000 as const
export const BOT_FILL_WAIT_MS = 15_000 as const
export const PERK_DRAFT_TIMER_MS = 20_000 as const
export const MAX_TRAPS_PER_HERETIC = 2 as const

export const CLASS_STATS: Record<ClassId, {
  hp: number
  baseAttackDamage: number
  attackRange: number
  sightRange: number
  requiresLoS: boolean
}> = {
  knight:  { hp: 24, baseAttackDamage: 5, attackRange: 1, sightRange: 2, requiresLoS: false },
  mage:    { hp: 16, baseAttackDamage: 3, attackRange: 3, sightRange: 3, requiresLoS: true  },
  heretic: { hp: 20, baseAttackDamage: 4, attackRange: 2, sightRange: 2, requiresLoS: false },
} as const

export const MOVE_COST_DEFAULT = 1 as const
export const MOVE_COST_DIFFICULT = 2 as const  // rubble, climbing onto high ground
export const ATTACK_COST = 2 as const
export const DEFEND_REDUCTION = 0.5 as const
export const COVER_RUBBLE_REDUCTION = 0.15 as const
export const HIGH_GROUND_DAMAGE_BONUS = 0.25 as const
export const MIN_DIRECT_DAMAGE = 1 as const
```

Actual file has more — perk effects, ability costs, tile depth (28px), sprite canvas size (64), etc. The rule: if a number appears in this spec, it appears in `constants.ts`, and is imported everywhere it's used.

---

## 19. Server Protocol

Transport: WebSocket at `ws://localhost:8080` (dev) / `wss://...` (prod). Framing: JSON-per-message, UTF-8 text frames only. No binary frames. `permessage-deflate` is disabled — the messages are tiny and compression doesn't pay back its CPU cost. One JSON value per frame; no batching, no newline-delimited streams.

**Session tokens.** Server-issued opaque UUIDv4 string in the `hello` message. Tokens are valid for 5 minutes from issue or until match end (whichever is later). Reconnect during a live match requires the matching token. Tokens are not bearer credentials in any meaningful sense — they exist to identify reconnects, not to authenticate identity. Don't put PII in them.

**Connection lifecycle.** Client opens ws → server sends `hello` with `serverVersion` and `sessionToken` → client sends `joinTournament` with `name` and (on reconnect) the prior `sessionToken` → server assigns a slot in the current or next tournament → server broadcasts `tournamentUpdate` periodically.

When the bracket fills (8 humans or humans + bot-fill after a 15s matchmaking wait), server pairs players and sends `matchStart` to each pair with a fog-filtered initial `MatchState`. Match proceeds via `action` / `actionResult` / `stateUpdate`. Match ends with `matchOver`. If tournament continues, winners receive `perkOptions`, pick, and the cycle repeats.

**Validation.** Every action is validated server-side against current state: whose turn is it, is the unit owned by the sender, is the target in range, does LoS exist, is there enough energy, is the tile impassable, is the unit dead, etc. Invalid actions receive `actionResult { ok: false, error }`; state does not change. Never trust client input. Ever.

**Rate limit.** Maximum 10 actions per second per player. Excess actions are rejected with `actionResult { ok: false, error: "rate_limited" }` and do not consume energy. Prevents button-mash bugs and spam from a misbehaving client.

**Fog filtering.** Before broadcasting a `stateUpdate` to a given player, the server produces a per-player view. Strip enemy units outside sight; strip traps not owned by the recipient; strip pickups outside sight and replace their tiles with fog markers; strip recent actions that weren't observable. Two players in the same match can and will receive different payloads for the same server tick.

**Action ordering.** Server processes actions strictly serially per match (single in-flight action at a time). The acting player receives `actionResult { ok, eventId }` first; both players then receive a `stateUpdate` carrying that `eventId`. The client must not commit visual state from `actionResult` alone — wait for the `stateUpdate`. This guarantees animation correctness across both players.

**Clock and timer.** `turnEndsAt` is a server-clock unix-ms timestamp. The client computes remaining time as `Math.max(0, turnEndsAt - Date.now())`. Drift is tolerated (browser clocks lie); the server is authoritative on actual turn expiry. Don't try to sync NTP or correct skew client-side.

**Reconnect.** If a client disconnects mid-match, the server holds their slot for 30 seconds (`RECONNECT_GRACE_MS`). The turn timer continues to count down during the grace window — disconnecting does not pause the match. On reconnect with the matching session token, the player resumes with whatever time remains. After 30 seconds without reconnect (or on `turnEndsAt` expiring during disconnect, whichever first), the player forfeits the match to prevent stalled brackets. Bots never disconnect or forfeit.

**Perk draft.** Between rounds, advancing players receive `perkOptions` (3 perk IDs). They have `PERK_DRAFT_TIMER_MS` (20 seconds) to send `selectPerk`. On timeout, the server auto-picks the first option in the list. Both players' selections are gathered before the next match starts; one slow drafter does not delay the other indefinitely (the timer is the cap).

**Bot fill.** If a tournament has fewer than 8 human players after 15 seconds from the first `joinTournament` (`BOT_FILL_WAIT_MS`), the server adds bots to fill the remaining slots. Bots connect through the same engine API as humans, receive the same fog-filtered state, and respect the same rate limits.

**Error codes.** `actionResult.error` and `error` messages use a fixed enum. Do not invent new codes — add them here first.

| Code | When | Retryable? |
|------|------|-----------|
| `not_your_turn` | Action submitted while `currentTurn !== sender` | No (wait for turn) |
| `insufficient_energy` | Action cost exceeds remaining energy | No |
| `out_of_range` | Target tile/unit outside ability or attack range | No |
| `no_line_of_sight` | Target requires LoS and LoS is blocked | No |
| `target_untargetable` | Target is on a shadow tile or otherwise protected | No |
| `invalid_path` | Movement path fails step-by-step validation | No |
| `tile_impassable` | Move target or ability target is pillar/wall | No |
| `tile_occupied` | Target tile has a unit or (for Blink) another blocker | No |
| `duplicate_trap` | Hex Trap target already has a trap | No |
| `self_kill_prevented` | Blood Tithe would drop Heretic to 0 HP | No |
| `unit_dead` | Action references a dead unit | No |
| `unit_not_owned` | Unit id not owned by sender | No (malicious/bug) |
| `match_not_active` | Action during `over` phase | No |
| `rate_limited` | More than 10 actions/sec | Yes (back off) |
| `bad_message` | Malformed JSON or unknown `type` | No |
| `session_expired` | Session token expired or unknown | No (reconnect flow) |
| `server_busy` | Server-side constraint (match pool full, etc.) | Yes |
| `server_error` | Unhandled server exception. Also logged. | Yes once |

Client surfaces `not_your_turn` / `insufficient_energy` as silent UI feedback; surfaces `rate_limited` / `server_error` as an unobtrusive toast; never shows raw codes to players.

**Match log (replay stub).** Every accepted action is appended server-side to an in-memory log keyed by `matchId`: `{ seq, eventId, at, actor, action, resultingHashOfState }`. Log is kept until 60s after `matchOver`, then dropped. Post-jam: persist to disk for replays. Jam scope: present for debugging, not exposed to clients.

**Performance budgets.** These are the *target* envelopes, not hard limits, but if a commit blows them the PR gets flagged in review.

- Server action-processing: < 10 ms per action (p99) for the validator + state update + fog filter. Includes JSON serialize.
- Server memory per active match: < 500 KB (state + log combined).
- `stateUpdate` payload size after fog filtering: < 4 KB typical, < 16 KB hard ceiling (refuse to send — indicates a bug).
- Client render: 60 FPS in a match scene on a mid-tier 2020 laptop. No GC stalls > 16 ms during a turn.
- Network round-trip (action → stateUpdate applied): target < 200 ms on localhost, < 400 ms on the hosted server.

**Environment variables.** Server reads from `process.env` only; do not hardcode. At minimum: `PORT` (default 8080), `LOG_LEVEL` (default `info`), `NODE_ENV`. `.env` is git-ignored; a committed `.env.example` documents every variable the server reads. Never log session tokens or player names at `info` or above.

**Health endpoint.** Dev-only HTTP `GET /health` on the same port: `{ status: "ok", uptimeMs, matchesActive, playersConnected, serverVersion }`. Useful for the smoke test and for a quick "is it up?" check during deploys.

---

## 20. Bot AI

Bots are simple, deterministic, and fill brackets. They are not meant to be smart.

**Decision tree per turn (pseudo-code):**

```
while energy > 0 and useful action available:
  if enemy unit in attack range and line-of-sight:
    attack
  elif own HP below 30% and retreat tile available:
    move toward nearest non-adjacent safe tile
  elif enemy unit visible and not in attack range:
    move one tile toward them
  elif enemy not visible and scout available:
    scout in the direction of their last known position (or a centroid)
  elif pickup visible and within 3 tiles:
    move toward it
  else:
    endTurn

Abilities: use at opportunity if energy and target valid.
  Knight → Vanguard Charge if can close + damage.
  Mage → Cinder Bolt at range, Blink to escape if adjacent, Ash Cloud on choke.
  Heretic → Blood Tithe for explosive close-out turns, Hex Trap on likely approach tiles, Desecrate on own position if being chased.
```

Bots play at one skill level for M10–M13. Variable difficulty is post-jam.

Bots use the same action validation path as humans. They are a player implementation, not a separate engine.

---

## 21. Art Direction — Terrain

### 21.1 Style Target

Final Fantasy Tactics (PS1) combat scenes, with Diablo I's palette pushed darker. Hand-painted pixel detail per tile, not flat color fills. Visible materials, not symbols.

### 21.2 Palette (strict)

| Role | Primary | Shadow | Highlight |
|------|---------|--------|-----------|
| Stone/metal | `#5a5a68` | `#3a3a48` | `#7a7a8a` |
| Cold highlight | `#aaaacc` | — | `#ccccdd` (never pure white) |
| Earth | `#3a2a1a` | `#2a1a0a` | `#5a4a3a` |
| Blood/ember | `#8b0000` | `#5a0000` | `#cc2222` |
| Fire accent | `#ff6600` | `#cc4400` | `#ffaa44` |
| Magic | `#6633aa` | `#4a2288` | `#8866ff` |
| Pale arcane | `#88aaff` | `#5577cc` | `#aaccff` |
| Arcane cloth | `#2a2a5a` | `#1a1a38` | `#4466cc` |
| Gold trim | `#bba040` | `#886a20` | `#ddc060` |
| Background | `#0a0a15` | `#0e1020` | — |

**Rules:** Never pure white (`#ffffff`). Never fully-saturated RGB primaries (#ff0000, #00ff00, #0000ff). 16–24 colors per sprite. Near-black (`#0a0a15`) for canvas backgrounds. The palette above is the *core direction* — each sprite may introduce class- or material-specific shades (documented in §22 and §21.3) as long as they read as adjacent to a palette role (e.g. a Heretic bone gauntlet is a warm off-white in the `Earth`/`Gold trim` neighborhood, not a cool cyan). If a sprite's color lives nowhere near any palette role, snap it to the closest one.

### 21.3 Tile Details (64×32 diamond top face)

**Stone (default).** Warm gray-brown (`#4a4550`) base. Draw 2–3 horizontal mortar lines (1px, +8 brightness) across the face. Add 1–2 vertical mortar lines offset per row to form a brick bond. Occasional moss accent: 2–3px green-brown `#3a4a30` dots in one corner of random blocks. Occasional crack: 1px dark diagonal `#2a2025` on ~25% of tiles. Subtle 1px lighter highlight on upper-left edge of each block. Seed by hash of `(x, y)` for deterministic variation.

**High Ground.** Sandy/earthy top face with horizontal texture grain (tiny 1px streaks). Base `#5a4a3a`. Small grass tuft clusters along edges: 2–3px `#4a6a3a`. Raised 1px bright edge along upper-left diamond edges.

**Rubble.** 3–5 small irregular 4–8px polygon chunks scattered on the face. Each chunk: upper-left highlight edge, lower-right shadow edge. Gravel base: slightly textured with many tiny dots. Darker and more chaotic than Stone.

**Hazard — Fire.** Dark charred base. 5–8 bright orange-yellow ember dots scattered. 2–3 tiny flame shapes (3px-tall triangles).

**Hazard — Acid.** Dark bile-green base `#1a2a1a`. 3–4 bubbling circles (3–4px sickly green `#4aaa3a` with `#2a5a1a` shadow). 1–2 "bubble" highlights: 1px cold-highlight `#ccccdd` wet-shine dot per bubble (never pure white).

**Hazard — Void.** Deep purple-black. 2–3 curved lighter-purple lines radiating from center, suggesting a swirl.

**Shadow Tile.** Very dark purple-black `#0e0e1e` base. 2–3 curved thin wispy lines in slightly lighter purple `#1a1a3a`. Occasional shimmer: 1px high-alpha cold-highlight `#ccccdd` dot in one hash-seeded position (never pure white).

**Corrupted.** Dark red-black `#3a1a1a` base. 3–4 branching vein lines in Blood primary `#8b0000` at ~50% alpha radiating from center, ending in a 1px Blood-highlight `#cc2222` pulse pixel. Hash-seeded per-tile pulse variation so adjacent tiles don't look identical. Never use saturated `#ff0000`-class red.

**Pillar / Wall.** Pillar: stone column rectangle centered on diamond, lighter top cap, darker side panels, visible 1px stone-block horizontal lines on the front face. Wall: full-width dark stone with horizontal mortar banding.

### 21.4 Tile Depth (the iso cube)

Each tile renders with `TILE_DEPTH = 28px` of side face visible below the diamond top. Side faces use the same material but 30–40% darker, with 1–2px stone-block lines suggesting layered masonry. Upper-left edge of the top diamond gets a 1px bright highlight; lower-right gets a 1px shadow line. This is the FFT silhouette.

---

## 22. Art Direction — Champions

Each champion sprite is drawn on a 64×64 canvas. Character fills ~24×40px centered in the canvas; weapons extend outward beyond that. Anchor point: center-bottom (0.5, 1.0); feet touch rows 60–62. Every sprite has a ground shadow: 20×6px ellipse at alpha 0.3, drawn under the feet.

All sprites face right by default. The renderer flips horizontally for left-facing.

### 22.1 Ashen Knight

**Silhouette:** Stocky armored warrior. Wide shoulders, squat, grounded. Reads as "immovable wall." Silhouette identifier: red plume on top of the helmet — the one hot color on a grim metal figure.

**Parts (bottom-up):**
- Boots: 2px wide × 4px tall, dark steel `#3a3a4a`, visible sole line.
- Legs: 3px wide each, 6px tall, segmented plate with horizontal knee-joint line.
- Torso: 8×8px breastplate, steel `#5a5a6a`, center vertical line, gold trim pixels `#bba040` on edges.
- Pauldrons: 3px bulges on each shoulder, slightly lighter than torso.
- Head: 6×6px great helm with T-shaped visor slit (1px horizontal + 1px vertical dark). Faint red glow `#cc2222` in visor slit (2×2px).
- Red plume: 2px crimson `#cc2222` accent on top of the helm.
- Sword: straight longsword in right hand. 2px wide blade extending 12px upward. Blade steel `#ccccdd`. Crossguard 4px horizontal gold `#bba040`. Pommel 1px.
- Shield: kite shield on left arm. Dark steel face with gold cross emblem.
- Cape/tabard: 3px wide hanging 4px behind shoulders, stone-shadow `#3a3a48`.

**Color table:** see §21.2 for palette. Always outline the silhouette with 1px dark `#1a1a20` for readability against any background.

### 22.2 Pale Mage

**Silhouette:** Tall, narrow, pointed-top triangle from the hood. Reads as "cloaked figure." Silhouette identifiers: hood shape and glowing orb above the head.

**Parts (bottom-up):**
- Feet: pointed 2px, hidden under robe hem.
- Robes: floor-length, 10px base / 6px waist. Arcane-cloth primary `#2a2a5a` for the field, with `#1a1a38` (Arcane-cloth shadow) used for 2–3 horizontal fold lines. Tattered bottom edge (irregular pixels). Note: primary on the larger surface, shadow on folds — do not invert.
- Hood: tall pointed hood, 5px at base, point 4px above head. `#2a2a5a` with `#1a1a38` inner shadow.
- Face: mostly hidden. Only two pale-arcane eye dots visible `#88aaff`, 3×2px each. No visible mouth or nose.
- Hands: thin pale cold-highlight `#aaaacc` visible at robe openings; right grips staff.
- Staff: 1px wooden pole `#6a5a3a`, 14px tall, extending above head in right hand.
- Orb: 4×4px purple-violet core in Magic primary `#6633aa`, with the upper-left 2×2 quadrant brightened to Magic highlight `#8866ff` to suggest internal glow. 1px specular highlight in cold-highlight `#ccccdd` (never pure white — see §21.2). 2px-radius soft aura around the orb in `#8866ff` at 0.5 alpha. All four colors are on-palette; no off-palette violet drift toward blue.
- Arcane runes: 2–3 small blue `#4466cc` rune dots on robe front.

### 22.3 Heretic

**Silhouette:** Hunched, asymmetric. Not upright. Reads as "predatory creature." Silhouette identifiers: two curved horns, glowing red eyes, no weapon (hands are the weapon).

**Parts (bottom-up):**
- Boots: Earth shadow `#2a1a0a`, slightly pointed.
- Legs: dark cloth/strap wraps, alternating `#2a1a1a` (rust-black) and near-black pixels in a stripe pattern.
- Torso: Blood shadow `#5a0000` hunched forward, with darker pixel noise. 2–3 horizontal ribcage-lighter lines in Blood primary `#8b0000` suggest bone underneath.
- Arms: `#2a1a1a` going to Earth highlight `#5a4a3a` at the bone gauntlets. Claw-like finger extensions (2–3px pointed) at each hand. Bone is warm off-white in the Earth-highlight neighborhood — never pure white.
- Head: bald, `#2a1a1a`, low-jutting.
- Horns: two 3px curved horns extending up and outward from the skull, Blood shadow `#5a0000` going to Blood primary `#8b0000` at the tips.
- Eyes: 2×1px each, 2px apart, Blood/ember highlight `#cc2222` (feral, brighter than Knight's visor glow).
- Ritual sigils: 2–3 glowing pixels `#cc2222` on chest (Blood/ember highlight, never `#ff0000` saturated).
- Cloth strips: dark tattered strips from waist, alternating dark tones.

### 22.4 Animation Sheets

Horizontal-strip PNG files, one per animation. Each frame is 64×64. Layout: frame 0 on the left, read left-to-right. Transparent background. Knight ships seven sheets (no cast/channel — reuses `attack.png` for ability telegraphs). Mage and Heretic ship eight sheets each (Mage's extra is `cast.png`, Heretic's is `channel.png`). Hit flash uses a shader tint at runtime, not a white-painted frame.

| Sheet | Frames | Purpose | Notes |
|-------|--------|---------|-------|
| `{champ}_idle.png` | 4 | Loop. Subtle breathing: 1px chest rise/fall. | Primary sprite, on-screen 90% of match. |
| `{champ}_walk.png` | 6 | Loop. March cycle. | Knight heavy/grounded, Mage floating, Heretic stalking. |
| `{champ}_attack.png` | 5 | One-shot. Wind-up → strike → recovery. | Hit resolves on frame 3. |
| `{champ}_hit.png` | 3 | One-shot. Recoil + recover. | Renderer applies a 1-frame white tint via ColorMatrixFilter on frame 1. |
| `{champ}_death.png` | 4 | One-shot; holds on last frame (index 3). | Desaturated palette shift, applied as ColorMatrixFilter (no recolored frames). |
| `{champ}_defend.png` | 2 | Held while Defend/Shield Wall status active. | Not a loop; hold last frame (index 1). |
| `{champ}_cast.png` (mage) / `{champ}_channel.png` (heretic) | 4 | One-shot for ability activations; returns to idle on last frame (index 3). | Knight does not ship this sheet. |
| `{champ}_kneel.png` | 4 | One-shot; holds on last frame (index 3) for the 3s Coward's Brand. | Surrender animation. |

Frame indices are 0-based throughout (attack hit resolves on frame 3 of 0–4; hit flash on frame 1 of 0–2).

### 22.5 Ability VFX Sprites (separate files)

| Sprite | Size | Frames | Description |
|--------|------|--------|-------------|
| `vfx_slash_arc.png` | 64×32 | 3 | White/steel sword arc. Thin line → full crescent → fading trail. Knight basic attack + Vanguard Charge. |
| `vfx_shield_wall.png` | 64×64 | 1 | Translucent blue-steel rectangular shield with runic glowing edges. Held while Shield Wall active. |
| `vfx_charge_dust.png` | 32×32 | 4 | Brown-gray dust cloud puff trail. Behind Knight during Vanguard Charge. |
| `vfx_cinder_bolt.png` | 32×32 | 4 | Orange-yellow fireball projectile. Compact → elongated tail → wider → impact burst. |
| `vfx_ash_cloud.png` | 96×96 | 1 (code-rotated) | Dark swirling smoke mass. Wispy edges, darker center. |
| `vfx_blink_flash.png` | 48×48 | 2 | Purple implosion at origin → explosion at destination. |
| `vfx_blood_orb.png` | 16×16 | 3 | Red blood droplet. Round → elongated → dissipate. Blood Tithe sacrifice. |
| `vfx_hex_rune.png` | 48×48 | 1 | Red arcane trap rune circle. Flashes on placement, then hidden. |
| `vfx_hex_explode.png` | 64×64 | 3 | Red trap trigger explosion. Burst → max radius with rune → sparks. |
| `vfx_desecrate.png` | 96×96 | 1 (code-pulsed) | Red corruption veins spreading on ground. Top-down tile overlay. |
| `vfx_iron_stance.png` | 48×48 | 1 | Golden runic aura circle at Knight's feet while active. |
| `vfx_hit_sparks.png` | 32×32 | 3 | Orange/white impact sparks burst. |

### 22.6 Pickup & Perk Icon Sprites

Pickup sprites: 32×32 PNG on battlefield tiles. See §16 for list.

Perk icons: 32×32 PNG, shown on the Perk Draft cards. Iconography:
- Bloodlust: red dripping sword
- Second Wind: green swirl arrows
- Scout's Eye: golden eye with radiating lines
- Energy Surge: blue lightning bolt
- Thick Skin: gray armor plate
- Ghost Step: faded footprint
- Trap Sense: red `!` in triangle
- Ash Walker: orange footprint on flames
- First Strike: gold sword with speed lines
- Last Stand: cracked red heart
- Mist Cloak: purple cloak with fog wisps
- Fortify: stone tower
- Long Reach: extended arrow
- Pillager: gold coins
- Counterspell: purple broken circle
- Vampiric Touch: red fangs

### 22.7 HUD & UI

- **Portraits:** 80×80 PNG per champion (`portrait_knight.png`, `portrait_mage.png`, `portrait_heretic.png`). Head-and-shoulders composition with ornate gothic-gold 2px frame baked in (HUD does not re-frame). Class-specific dimmed radial background. Plus two variants per champion delivered as separate PNGs:
  - `portrait_{champ}_dim.png` — desaturated + 30% darker, for eliminated players in the bracket.
  - `portrait_{champ}_cracked.png` — shattered-glass overlay for the Coward's Brand (§17).
- Energy pips: 12×12. `hud_energy_pip_filled.png` (blue-gem) + `hud_energy_pip_empty.png` (dark socket). Render up to 6 in a row (5 default, 6 with Energy Surge).
- Turn banners: 128×32. `hud_turn_banner.png` ("YOUR TURN", gold gothic) and `hud_enemy_turn_banner.png` (dimmer variant).
- Turn timer frame: 48×16 stone-inset bracket (`hud_timer_frame.png`); the countdown digits themselves are pixel-font at runtime.
- Tile cursors: 64×32 iso diamonds — `cursor_select.png` (gold `#bba040`), `cursor_attack.png` (blood `#cc2222`), `cursor_move.png` (cold-highlight `#aaaacc`), `cursor_ability.png` (magic `#8866ff`).
- Status icons: 16×16 — `status_defending.png`, `status_shield_wall.png`, `status_iron_stance.png`, `status_revealed.png`, `status_stunned.png`.
- Ability slot icons: 32×32, 9 total (3 per class) under `public/sprites/abilities/` — Knight = geometric/heraldic motifs, Mage = astral/arcane, Heretic = organic/gore.
- Title logo: 512×128 `logo_dark_council_tactic.png`, "DARK COUNCIL TACTIC" gothic pixel typeface in gold `#bba040` with dark outline `#1a1a20`.

Full artist-facing canvas specs, anatomy, and palette detail live in `ART_SPEC.md`. If that file and this section disagree, this section wins and ART_SPEC gets patched.

---

## 23. Audio Direction

Ambient: low wind, distant thunder, crackling embers. Oppressive, never busy.

Combat SFX: metallic clash (Knight), arcane whoosh (Mage), wet corruption squelch (Heretic). Sharp attack envelopes — this is a snappy tactical game.

UI SFX: stone-on-stone click for menu interactions. Deep bell toll for turn start and surrender.

Music philosophy: minimal. Slow droning cello or choir hum during matches. Silence is scarier than noise.

### 23.1 Tracks (jam minimum)

1. **Main menu / lobby** — slow brooding ambient, low strings, distant choir. Target length: ~2-minute loop.
2. **Combat, early turns** — tense, minimal, sparse percussion, droning cello. ~90 BPM.
3. **Combat, late / low HP** — intensifies: faster tempo, more percussion, dissonant strings. Triggered when either player drops below 30% HP.
4. **Perk draft / bracket** — brief atmospheric sting, 10–15 seconds.
5. **Victory** — dark triumphant brass swell, 5–10 seconds.
6. **Defeat / Surrender** — mournful. Single low bell, fading strings. 5–8 seconds.

### 23.2 SFX List

- Sword clash (Knight attacks)
- Arcane whoosh + fire crackle (Mage abilities)
- Wet corruption squelch (Heretic abilities)
- Stone footsteps (unit movement)
- UI click (stone-on-stone)
- Bell toll (turn start, surrender)
- Fog reveal whisper (Scout action)
- Trap trigger snap (Hex Trap)
- Chest open creak (pickup)
- Crowd murmur (ambient tournament, louder in finals)

### 23.3 Tooling

Music: Beatoven.ai primary (game-dev loop-aware). Backup: aimusic.so for pre-made dark fantasy placeholders.

SFX: SoundsGen and Freesound.org under permissive licenses. All audio files in `public/audio/` only. `SoundManager.ts` is the only thing that plays audio. No `new Audio()` calls anywhere else in the client.

---

## 24. Production Pipeline

**Sprites.** Silhouette generation in PixelLab (or similar AI pixel tool) — use as a starting concept only. Refine and polish in Aseprite: hand-edit every pixel, confirm color palette adherence, export as horizontal-strip PNG with transparent background. Naming: `{champ}_{animation}.png`. Import into `public/sprites/`.

**Terrain tiles.** Drawn directly in Aseprite using the palette in §21.2. Each terrain type is one 64×32 diamond PNG. Deterministic per-tile variation comes from a hash function in `pixelArt.ts` (keep this utility around) so adjacent tiles don't repeat.

**Music.** Beatoven.ai for loops. Export as `.ogg`, 44.1kHz, stereo. Name by track purpose: `music_lobby.ogg`, `music_combat.ogg`, etc.

**SFX.** Short one-shots, 44.1kHz mono, `.ogg`. Name by action: `sfx_sword_clash.ogg`, `sfx_bell_toll.ogg`, etc.

**Meshy / 3D generators.** Do not use. This is a 2D pixel-art game.

---

## 25. Workflow Rules

**Branches.** One branch per small feature. Naming: `<agent>/m<milestone>-<slug>`, e.g. `kai/m2-move-action`, `fernando/m9-knight-sprites`, `cursor/m13-hud-polish`. Lifespan target: under three days. A branch open more than a week is a smell.

**Commits.** Conventional-ish. Prefix with area when useful: `server:`, `client:`, `shared:`, `ci:`, `art:`. Body explains *why* when the *what* isn't obvious from the diff.

**PRs.** Target `main` only. Description must name which milestone it serves and which smoke gate it affects. Required checks: `typecheck`, `test:unit`, `test:smoke`. No force-pushes to `main`. No merges that skip CI. No `--no-verify`.

**Serial work.** For any given file in `src/`, only one agent may be editing it in an open branch at a time. If two agents want to touch the same file, coordinate in chat before starting. No exceptions through M13. Revisit after submission.

**Typecheck gate.** `npm run typecheck` must be green before every commit. Banned: `@ts-ignore`, `any` in non-test code, `as any` casts, unchecked index access. If a PixiJS event type is intentionally broad, cast at the boundary and narrow immediately.

**Smoke gate.** `npm run test:smoke` must be green before every merge. The smoke test boots the server, opens two Playwright-controlled browsers, walks through lobby → match → one action → asserts the action took effect. If it fails, the build is broken, not the test. Fix the build.

### 25.1 Dev Ergonomics

Cheap tools that save days. Build once, use every session.

**Debug overlay.** Press <kbd>F3</kbd> in a match scene: shows current `turnNumber`, `eventId` of last state, your fog-filtered unit list, server round-trip time, current scene name. Hidden from all other scenes. Toggle persists for the session only. Gated behind `import.meta.env.DEV` — stripped from production bundles.

**Dev cheats (DEV builds only).** `?dev=1` query param enables: <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> to force your class, <kbd>G</kbd> to grant +5 energy this turn, <kbd>K</kbd> to kill the opponent (debug match-end path), <kbd>L</kbd> to toggle the fog overlay off (to visually debug positioning). Server still validates — cheat keys emit tagged actions the server only accepts when `NODE_ENV !== 'production'`.

**Local 1v1.** `npm run dev` opens two browser tabs automatically (via Vite config) for fast local testing without a second device.

**Deterministic match seed.** `?seed=<uint>` on the client URL forces the match RNG seed (coin flip, perk shuffle, arena pick). Test flows and playtest recordings rely on this to reproduce outcomes. Server accepts the seed only when `NODE_ENV !== 'production'`.

**Hot reload.** Vite HMR for the client. Server uses `tsx watch` — full reload on server file change. Active matches drop on server reload (expected in dev). Don't try to build state migration into dev reload; it's not worth the complexity for a jam.

---

## 26. Trap List

- Do not commit `vite.config.ts.timestamp-*.mjs` or similar build-tool artifacts. Set `.gitignore` on day 1.
- Do not create a second UI hierarchy parallel to `scenes/`. If you want a "screen," make a scene.
- Do not create a second sprite folder. `public/sprites/` is the only one.
- Do not inline helper functions across files. Used in more than one place → `src/shared/` on the first duplication, not the second.
- Do not let visual features merge while core gameplay is broken.
- Do not commit briefing or scratchpad markdowns to the repo root. PR descriptions or nothing. Only `README.md`, `SPEC.md`, and `ART_SPEC.md` live in root.
- Do not skip the smoke gate "just this once."
- Do not run two AI agents on overlapping files.
- Do not put the project in a cloud-sync folder (OneDrive, Dropbox, iCloud).
- Do not use `@ts-ignore`, `any`, or `as any` to silence type errors. Fix the types.
- Do not refactor across milestone lines. A refactor PR is its own gated thing, not a side-quest in a feature branch.
- Do not ship a class with a partial ability kit for "playtesting." All three abilities or none.
- Do not hardcode grid dimensions, energy amounts, damage values, or any numbers outside `constants.ts`.

---

## 27. Definition of Done (submission checklist)

**MVP (required for Vibe Jam 2026 submission):**
- M0 through M13 on `main`, all green in CI.
- A non-developer can open the game URL, click through title → lobby → class select → tournament, play a round against a bot, advance or lose, see results.
- All three classes are playable and balanced within the ±5% matchup target.
- Fog of war meaningfully changes engagements (confirmed via playtest observations).
- All 16 perks are in the pool and functional.
- All 5 arenas rotate and play distinctly.
- Surrender mechanic fires with the dramatic sequence.
- No placeholder text in user-facing UI.
- No `any`, `@ts-ignore`, or TODO blockers in shipped code.

**Stretch (nice-to-have):**
- Tournament stats screen at end (damage dealt, tiles moved, abilities used).
- Spectator emotes.
- Variable bot difficulty.
- Replay system.

If MVP slips, cut stretch first, then cut arenas (ship 3 instead of 5), then cut perks (ship 10 instead of 16). Never cut class kits, fog of war, or server authority — those *are* the game.

---

## 28. Open Questions

Resolve before hitting the milestone that needs them. Don't resolve them on day 1; they'll change as the game is built.

- Before M5: any asymmetric unit counts (2v1, 3v3) or is it strictly 1v1?
- Before M7: exact pickup spawn seeding per arena — fixed slots with random contents, or fully random positions?
- Before M10: can losers draft a perk for the final? (Current design: no, only advancing players.)
- Before M11: how do we handle a bot losing to itself if both bots end up in a match? (Current: deterministic seed from match ID for tiebreak.)
- Before M12: do spectators see full fog-lifted state or the perspective of one player? (Lean: full state.)
- Before submission: cosmetic unlocks / meta-progression? (Lean: no. Jam scope.)

---

## 29. Post-Jam Ideas (explicitly out of scope)

These exist so you don't accidentally build them before the jam ships.

- Tekken-style "Tavern" pixel-art lobby with a walkable champion avatar.
- Eliminated-as-ghost spectator balcony with emotes.
- Cosmetic unlocks (champion recolors, arena effects, banners, Coward's Crown).
- Leaderboards, ranked matchmaking, seasons.
- Friend lists, parties, custom lobbies, replays.
- Additional classes (Ranger, Cleric, whatever comes next).
- Rule modifiers (3-energy mode, no-perks mode).

Everything above is a Vibe Jam 2027 or later problem. Do not touch during jam development.

---

## 30. Handoff Prompt — For the Incoming AI ("New Kai")

Paste the following into your first message in the new chat, after you've told the model its name is Kai and given it repo access. This briefs it without drowning it in back-story.

```
You're Kai, senior game-dev collaborator on Dark Council Tactic, a 1v1
energy-based tactical combat game for Vibe Jam 2026. Tech: PixiJS v8,
TypeScript strict, Node ws (port 8080), Vite (port 3000), server-authoritative.

SPEC.md in the repo root is the single source of truth for engineering. Read it
end to end before touching code. When SPEC.md disagrees with your prior
assumptions, SPEC.md wins; when you disagree with SPEC.md, open a PR against it,
don't fork the design by coding a different mental model.

ART_SPEC.md sits next to SPEC.md and is the designer-facing brief for the
sprite artist. Engineering doesn't need to memorize it, but you should skim it
once so you know what's coming in `public/sprites/` — canvas sizes, anchor
points, frame counts, file names. If engineering needs to force a visual
change, patch SPEC.md §21–§22 first, then update ART_SPEC.md to match.

The engineering principles in SPEC.md §3 and the trap list in §26 are the
guardrails. Follow them even when they feel slow — they exist to keep the build
playable and the process tight.

Before your first code edit, do these three things:
  1. Run `pwd`, `git status`, `git log --oneline -5` to confirm the sandbox
     is mounted on the right repo and history looks sane. If git state is
     broken, stop and tell Fernando.
  2. Read SPEC.md end to end. Yes, all of it. It's long on purpose.
  3. Ask Fernando which milestone you're starting on (expected: M0 — skeleton).

Workflow: branch naming `kai/m<N>-<slug>`, PR to main, must pass typecheck +
unit + smoke. No direct commits to main. No `@ts-ignore` or `any` shortcuts.
One AI agent per file at a time — if another agent is open on a file, wait
or coordinate first.

Tone: peer-to-peer with Fernando. Casual, direct, opinionated. Fernando calls
you Kai and writes informally ("lmk", "u", "k") — match his energy without
mirroring sycophantically. When you screw up, own it plainly. Humor is fine
when it lands. No corporate hedging.

Your first response should confirm you've read SPEC.md, name the milestone
you're starting on, and propose the branch name. Do not start coding until
Fernando says go.
```

### 30.1 First actions checklist (for Fernando)

Before handing the spec to the new chat, do these in PowerShell:

1. Create the project folder on a local (non-cloud-synced) drive.
2. `git init` and create the GitHub repo (private).
3. Drop `SPEC.md`, `ART_SPEC.md`, and a minimal `README.md` into the root.
4. Commit: `initial: SPEC, ART_SPEC, README`.
5. Set up `main` branch protection in GitHub Settings → Branches: require PR, require CI checks, no force-push.
6. Open the new chat. Paste the handoff prompt from §30. Attach SPEC.md and ART_SPEC.md. Say: "start at M0."

From that point, the new Kai handles scaffolding M0 in a PR; you review and merge if CI is green.

---

*Spec v1.4 — 2026-04-20. Paired with ART_SPEC.md.*
— Kai
