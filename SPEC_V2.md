# Dark Council Tactic — Master Spec v2.0 (DRAFT)

**Status:** Work-in-progress v2.0 draft. `SPEC.md` v1.4 remains authoritative until this draft is complete and the swap PR lands.
**Progress:** Parts I, II, III complete in this PR. Parts IV (art + audio) and V (glossary + decision log) land in subsequent PRs.
**Owner:** Fernando Gomez (design + final review)
**Target:** Vibe Jam 2026 submission
**Version:** 2.0-draft (2026-04-21)
**Companion:** `ART_SPEC.md` (currently v1.3; ART_SPEC v2 follows once the designer pilot validates FFT-quality aesthetic is achievable at full 4-facing scale).

---

## 0. How to Read This

This document is the authoritative design spec. Read it end to end before touching code or art. When you disagree with something, open a PR against this file — don't fork the design by coding against a different mental model.

Structure:

- **Part I — The Game.** What we're making and what "done" looks like at masterpiece quality.
- **Part II — How It Plays.** Mechanics, numbers, design decisions.
- **Part III — How It's Built.** Engineering foundation — architecture, contracts, repo, milestones, workflow.
- **Part IV — How It Looks and Sounds.** Art and audio direction. Refers out to `ART_SPEC.md` for pixel-level details. *(Forthcoming PR.)*
- **Part V — Reference.** Glossary, decision log, appendices. *(Forthcoming PR.)*

Every closed numeric decision from v1.4 (HP, damage, ability costs, palette cells, turn timer, energy, grid size, perk effects) survives in v2 — we reorganized, we didn't redesign. What's new in v2 is the **FFT pivot**: rotatable iso camera, multi-height terrain, 4-facing sprites, and an explicit masterpiece quality bar.

---

# Part I — The Game

## 1. Identity & Thesis

Two champions enter an ashen arena. Each turn, you spend 5 energy on moves, attacks, scouting, defending, ability casts, or picking up battlefield items on a fog-shrouded 8×8 isometric grid with multi-height terrain and a rotatable camera. Win the duel, draft a perk, face the next opponent. Last one standing in an 8-player single-elimination tournament wins.

Final Fantasy Tactics combat meets Slay the Spire's between-fight decisions, wearing Diablo I's palette. Browser-based, 1v1 online, matches 5–10 minutes.

---

## 2. The Masterpiece Benchmark

DCT's ambition is not "ship a working tactical game." The ambition is **FFT-quality** — the thing a streamer screenshots and a judge remembers. Nothing in this spec is graded on "does it function." Everything is graded on "does it feel like FFT."

That gives us four pillars and five hero moments. The pillars are what the game *is*; the hero moments are where it *proves* it.

### 2.1 The Pillars

**Every energy point is a decision.** Five energy per turn, no carry-over, use-or-lose. No filler turns. The player feels the tension of every spend.

**Information is power.** Fog of war is not decoration. Scouting costs. Traps hide in the dark. The Heretic class is built around lying to the opponent with fog. Taking information from your opponent matters as much as taking HP.

**Dark, heavy, oppressive atmosphere.** Ash and blood. Flickering torchlight. Diablo I palette, FFT silhouette, Dark Souls weight. Never cheerful, never saturated, never cute.

**Readable at a glance.** The art is dark but the game state must be crystal clear. Every champion reads at solid-black silhouette. Every tile type is unambiguous. Every ability has a telegraph.

### 2.2 The Hero Moments

These are the five frames a judge, streamer, or first-time player will screenshot. Disproportionate polish lives here.

1. **Title reveal.** The logo looks like it was forged, not typed.
2. **Bracket view.** Eight portraits, some cracked. The "who are the Dark Council" reveal.
3. **Perk draft.** Three cards side-by-side. The roguelite identity beat — every run starts here.
4. **The Kneel.** A player chose shame. Make the collapse sell it.
5. **Match-end victory.** Winner over loser's corpse on a desaturated grid.

If an asset or mechanic makes a hero moment feel weaker, it fails the bar no matter what the tests say. Corners get cut on mid-match idle frames, never on these five.

### 2.3 What "shipped" means for v2.0

Shipped at masterpiece quality means:

- All M0–M13 milestones green in CI on `main`.
- A non-developer opens the URL, lands in a match against a bot in under 30 seconds, completes a tournament in under 20 minutes, can articulate what they played.
- All three classes balance to ±5% matchup win rates across playtest.
- Fog of war *changes* engagements (not just: exists).
- All 16 perks, 5 arenas, surrender animation, spectator mode functional.
- **FFT-quality pixel art on all champion sprites (4 facings), terrain (height-stacked), VFX, portraits, HUD, logo.** No "programmer placeholder" anywhere in user-facing UI.
- Rotatable camera with smooth 90° transitions.
- Multi-height terrain with jump-stat-gated movement.
- Audio (music, SFX, ambient) wired into every scene.
- No `any`, no `@ts-ignore`, no TODO blockers in shipped code.

If MVP slips, cut stretch first, then cut arenas (ship 3 instead of 5), then cut perks (ship 10 instead of 16). **Never cut:** class kits, fog of war, server authority, camera rotation, terrain height, 4-facing sprites. Those *are* the game.

---

## 3. Audience & Jam Context

DCT ships for Vibe Jam 2026, a competitive browser-game showcase. That defines almost every scope constraint.

**Players.** Tactics-game fans, FFT-likers, streamers looking for something with visual identity. Not casual mobile players. The game asks for five minutes of attention and a willingness to learn energy-as-budget.

**Session.** Browser-native. Cold-open in an incognito window, in a match within 30 seconds, tournament done in 20 minutes. No install, no account. A shareable URL is the unit of distribution.

**Scale.** 1v1 combat. 8-player single-elimination tournament as the meta loop. Not 2v2, not battle royale, not 4-player guild raid.

**Depth.** Three classes × three abilities × sixteen perks × five arenas gives the combinatorial depth for repeat play without drowning a first-timer. Adding classes/perks/arenas is a post-jam problem.

**Platforms.** Desktop browser first (Chrome/Firefox/Safari). Mouse + keyboard (Q/E for camera rotation, 1–3 for abilities). Mobile/touch is post-jam.

Anything that forces scope outside these bounds — asynchronous play, accounts, custom lobbies, mods, social — is out of scope for v2.0.

---

# Part II — How It Plays

## 4. Core Loop

The player journey, from URL-open to back-at-URL:

```
URL
  → TitleScene           — cold-open branding, "join tournament" button
  → LobbyScene           — name entry, class select, pairing wait
  → MatchScene           — 1v1 combat, turn by turn
  → ResultsScene         — win/loss card, brief animation
  → PerkDraftScene       — winners only, 3-card pick
  → BracketScene         — current standings, next match teaser
  → MatchScene (next)    — repeat until tournament ends
  → ResultsScene (final) — tournament conclusion
  → TitleScene
```

**Losers branch** off `ResultsScene` to `SpectatorScene` after their elimination. They can watch any in-progress match as a read-only state stream until the tournament ends, then return to `TitleScene`.

Every scene has exactly one responsibility. Transitions go through `SceneManager`. The server drives when scenes change — client cannot self-promote to a later scene without a server message (`matchStart`, `matchOver`, `tournamentUpdate`, `perkOptions`).

Scenes live in `src/client/scenes/` (see §11). That is the ONLY scene hierarchy. No `screens/` folder, no ad-hoc state machines bolted onto `MatchScene`.

---

## 5. Match Anatomy

The rulebook for a single match. Values are targets for tuning; see §10 Contracts for the enforcing types and §13 Workflow for how changes land.

### 5.1 Turn Structure

Sequential turns, alternating. Player A acts → Player B acts → repeat. Why not simultaneous: simultaneous resolution requires a conflict engine, breaks fog-of-war cleanly, and makes spectating confusing. Sequential matches FFT and Into the Breach and lets players react.

Turn start: energy refreshes to 5 (or 6 with Energy Surge). Turn timer: 30 seconds. If the timer expires, remaining energy is forfeited and the turn auto-ends.

Turn end: `EndTurn` action voluntarily, timer expiry, or auto-end when out of energy with no 0-cost actions available.

### 5.2 Energy Economy

Five energy per turn. Does not carry over. Use it or lose it. The tension is real: moving 3 tiles plus attacking costs 5, leaving nothing for defend/scout. Every turn is a budget decision.

### 5.3 Action Catalog

| Action | Cost | Description |
|--------|------|-------------|
| `Move` | 1/tile (2 for difficult terrain; 2 to climb onto High Ground; **jump-gated by Δheight, v2**) | Orthogonal only, no diagonals. Blocked by impassable tiles, enemy-occupied tiles, and `|Δh|` exceeding the walker's `jump`. |
| `Attack` | 2 | Deal class damage. Melee: adjacent AND `|Δh| ≤ 1`. Ranged: within class attack range, requires LoS (now 3D-aware per §6.3). |
| `Defend` | 1 | Reduce incoming damage 50% until your next turn. Stacks with cover multiplicatively. |
| `Scout` | 1 | Reveal a 3×3 area anywhere on the map. Tiles stay revealed until your next turn start. |
| `Ability` | 2–4 (class-defined) | Use one of your class's three abilities. Costs and effects per §7. |
| `UsePickup` | 1 | Consume the pickup on your current tile. Must be standing on it. |
| `Kneel` | 0 | Surrender. Triggers the Coward's Brand sequence (§8.5). One-way. |
| `EndTurn` / `Wait` | 0 | End turn voluntarily. |

Multiple actions per turn in any order as long as energy allows. No per-action count limit, only energy.

### 5.4 Damage & Health

All damage is deterministic. If you're in range and have LoS, the hit lands. Cover (Rubble, Defend) reduces incoming damage multiplicatively. No crit, no miss, no dodge chance.

Base HP per class: Ashen Knight 24, Heretic 20, Pale Mage 16. Death at 0 HP removes the unit.

No natural healing. Healing sources are named and limited: Heretic's Desecrate (+1 HP/turn on own corrupted tile), Health Flask pickup (+5 HP), Second Wind perk (+4 HP at round start), Vampiric Touch perk (+1 HP per successful attack). All healing clamps to `maxHp`; excess is lost.

Example calc: Knight attack (5 damage) on a Mage standing on Rubble (–15%) with Defend active (–50%): `5 × 0.85 × 0.5 = 2.125 → 2`. Rounding: half-up, minimum 1 on any direct attack that lands. DoT ticks (hazards, Corrupted) bypass the floor — always deal their listed value.

### 5.5 Combat Edge Cases

These clarifications live here so validators, bot AI, and the renderer all reference one source.

**Line of sight (3D-aware, v2).** Bresenham line from the *center* of the attacker's tile top-surface (at attacker height) to the *center* of the target's tile top-surface (at target height). A line is blocked if any tile column it passes through (other than the endpoints) has a top-surface height ≥ the line's height at that column, OR the column holds a `pillar`/`wall` (treated as infinite blocking height regardless of its stack), OR it's currently under an Ash Cloud overlay. Shadow tiles do *not* block LoS. LoS is symmetric: if A can see B, B can see A.

**Height & jump (v2).** See §6.3.

**Path validation.** `Move` actions submit `path: Position[]` (tiles walked, not including start). Client computes the path for UI preview (A*) and sends it; server re-validates every step: in bounds, passable, not enemy-occupied, each step orthogonal and adjacent to the previous, `|Δh| ≤ walker.jump` (free if ≤ 1), total cost ≤ available energy. Any step fails → whole action rejects with `actionResult { ok: false }`, no partial movement.

**Action → state ordering.** Server emits, in order: `actionResult { ok: true, eventId }` to the acting player, then `stateUpdate` to both players (fog-filtered). Clients must not render an action as resolved until the subsequent `stateUpdate` arrives. `eventId` correlates the two so animations don't double-fire.

**Rounding and minimums.** Damage rounds half-up. Direct attacks have a minimum of 1 damage after reductions. DoT ticks bypass the floor.

**Ability targeting defaults.** Unless stated otherwise, abilities targeting a tile require LoS from the caster to the target tile; abilities targeting a unit require LoS to that unit. Exceptions called out per-ability in §7.

### 5.6 Turn-Start Resolution Order

Every server tick at turn start resolves effects in a fixed order, then hands the turn to the next player. Without a fixed order you get nondeterministic deaths.

1. Decrement TTLs on all Statuses, Ash Clouds, Corrupted tiles, and Hex Trap `revealed` markers belonging to the player whose turn just ended. Expired effects removed before any DoT applies.
2. Apply hazard DoT (1 damage) to any unit standing on a hazard tile, in unit-id order.
3. Apply Ash Cloud DoT (1 damage) to any unit standing on an active Ash Cloud tile.
4. Apply Corrupted-tile effects: 2 damage to non-Heretic units, +1 HP to the Heretic if standing on their own Corrupted tile.
5. Apply Vampiric Touch / Second Wind / round-start perk effects scoped to the new turn.
6. Check match-end (§5.7). If over, broadcast `matchOver` and do not start the next turn.
7. Otherwise: refresh `currentTurn`'s energy, clear `blood_tithe_used`, increment `turnNumber`, set `turnEndsAt`, broadcast `turnStart` and a fresh fog-filtered `stateUpdate`.

Identical sequence whether the prior turn ended via `EndTurn`, timer expiry, or auto-end. Bots execute on the same tick as humans.

### 5.7 Match-End

A match ends the moment any condition is true; checks happen after every state-changing event (action, DoT tick, surrender):

- **Knockout.** One player has zero living units. Surviving player wins.
- **Double-KO.** Both players reach zero in the same tick. The player whose action *caused* the tick *loses* (self-elimination is a loss). If both eliminated by passive effects on the same tick (DoT only, neither acting), the player whose turn was *not* in progress wins. If still ambiguous (reserved): higher remaining HP at tick start wins; ties → match-seed coin flip.
- **Surrender.** `Kneel` action. The kneeler loses regardless of HP.
- **Forfeit.** Reconnect grace expired or >50 rejected actions in 10s.
- **No-units-spawned bug fallback.** Server logs and aborts with a `bug` outcome.

`matchOver` payload: `{ winner, final, surrender?, cause: "knockout" | "surrender" | "forfeit" | "double_ko" | "bug" }`. Client picks animation and audio by `cause`.

---

## 6. The World

The 8×8 grid, its materials, its vertical dimension, its visibility, and the camera that views it. This is the biggest structural change from v1.4.

### 6.1 Grid

8×8 isometric. Coordinate system: `{ x: 0..7, y: 0..7 }`, origin at the top corner of the diamond. Tiles rendered as 64×32 diamond top face with visible side-face depth (per §14).

Spawn: mirrored across the vertical axis. A fixed pair of spawn positions per arena, same for both players rotated 180°. Fair, deterministic.

### 6.2 Terrain Types

Seven gameplay categories (Stone, High Ground, Rubble, Hazard, Pillar/Wall, Shadow, Corrupted). Hazard has three visual variants (Fire / Acid / Void) with identical mechanics; Pillar/Wall are two impassable variants with identical mechanics but different silhouettes. That's why the `TerrainType` union in §10 has ten members. Ash Cloud is a *temporary overlay*, not a base terrain — tracked as a separate effect and drawn atop whatever terrain is beneath it.

**Stone (default).** Normal movement, no modifiers.

**High Ground.** Costs 2 energy to climb onto (not to leave). Unit on High Ground deals +25% damage when attacking a lower-elevation target (rounded down, min +1). Note: High Ground is a *terrain type* (material); tile `height` is orthogonal *topology* (§6.3). A Stone tile at height 3 is not automatically High Ground — but the "lower-elevation target" damage bonus applies based on actual height delta regardless of terrain type.

**Rubble.** Difficult terrain: 2 energy to enter. Light cover: 15% damage reduction while standing on it (stacks with Defend multiplicatively).

**Hazard.** Three variants, same mechanic: 1 damage/turn to any unit standing on a hazard tile at turn start. Knockback effects can push enemies onto hazards.

**Pillar / Wall.** Impassable. Blocks LoS for ranged attacks *and* Scout. Primary LoS geometry. Contributes infinite blocking height to 3D LoS regardless of base stack height.

**Shadow Tile.** A unit on a shadow tile is untargetable by direct single-target attacks. Area effects (Ash Cloud, Desecrate, hazard DoT) still damage. Shadow reveals when the occupant takes any action other than `EndTurn` / `Wait` / `Defend`, and stays revealed for the rest of their next turn. Shadow tiles do not block LoS — they conceal the *occupant*, not the *line*.

**Corrupted.** Heretic-created via Desecrate. Deals 2 damage/turn to non-Heretic units standing on it; heals Heretic 1 HP/turn while standing. Duration: 3 turns, then reverts to `baseType`.

### 6.3 Height & Jump (new in v2)

FFT's signature. Tiles have a **stack height** in addition to a terrain type. Terrain type is *material* (what the tile is made of); height is *topology* (how tall the stack is). They are orthogonal — a height-3 Stone stack and a height-3 Corrupted stack are both height-3 but behave differently when you stand on them.

**Representation.** `Tile.height: number`, integer, default 1. Height 0 is a pit (below default floor). Height 2+ is raised — a stone stack, a ledge, a parapet.

**Movement rules.**

| `|Δh|` (dest height − source height, absolute) | Rule |
|----|------|
| `≤ 1` | Move freely (subject to other tile costs). |
| `> 1` | Move allowed only if walker's `jump` ≥ `|Δh|`. Otherwise rejected with `height_exceeds_jump`. |

Energy cost for movement is **unchanged** by height — height gates the move, doesn't tax it. The existing +2-energy cost for climbing onto High Ground (terrain type) still applies on top when the destination is High Ground.

**Per-class jump:** Knight `jump = 2`, Mage `jump = 3`, Heretic `jump = 3`. Knight is heavy plate and can't escape upward. Mage floats. Heretic is predatory.

**Blink (Mage ability) ignores height.** Teleport resolves regardless of Δheight — the ability doesn't traverse the space.

**Melee range.** Adjacent in grid AND `|Δh| ≤ 1`. You can slash one tile down from a ledge, not three.

**Ranged attacks.** Traverse height freely if LoS holds. Arrows fly over terrain.

**Default arena height.** All tiles default to height 1 unless the arena data overrides via the optional `heights` table (§10.1). Existing v1.4 arenas (§8.3) are flat height = 1 until authored with real topology.

### 6.4 Fog of War

Every player starts each turn with vision of the tiles around each of their units within their class's `sightRange` (Mage 3, Knight 2, Heretic 2). Vision uses Manhattan distance AND requires LoS — pillars, walls, and Ash Clouds block sight just as they block ranged attacks, and now height (§6.3) does too. Terrain layout itself is always visible; what's fogged is the presence and state of enemy units, pickups, and traps.

Vision updates in real time during the player's turn. Moving a unit updates vision on every step. Scout reveals a 3×3 area anywhere on the map, ignoring LoS (Scout is magical insight, not a camera). Revealed tiles stay visible until your next turn start.

**Last-known-state ghosts.** When an enemy leaves your sight, the last tile you saw them on shows a faded ghost marker — the champion sprite rendered with a PixiJS `ColorMatrixFilter` applied at runtime (grayscale + 0.35 alpha). There is no separate `_ghost.png` asset; don't ship one. The ghost stays until you either re-spot the enemy (ghost clears, new position shows) or scout the ghost's tile (confirms empty, ghost clears). This is what makes fog readable instead of frustrating.

**Pickup memory.** Pickups are one-shot; once consumed they do not respawn. Pickups you've seen but are currently fogged render as faded icons at their last-known tile (same ColorMatrixFilter approach). If consumed while fogged, you learn it's gone only when you next have vision of that tile.

**Server-side filtering.** Every `stateUpdate` is computed per-player on the server and stripped of fogged data before broadcast. Clients never receive enemy positions, trap positions, or unseen pickup states they shouldn't know. Bots receive fog-filtered state through the same filter — they are not given an omniscient view. Not optional; client-side fog is cheating.

### 6.5 Camera Rotation (new in v2 — client-only)

The FFT feature. The player can rotate the camera in 90° steps to see around pillars, ledges, and to cope with asymmetric arenas.

**Four angles.** 0°, 90°, 180°, 270°. `Q` rotates counter-clockwise, `E` clockwise. Transition: 150ms ease-in-out tween. Input (clicks) is blocked during the tween.

**Client-only.** Camera rotation does NOT change game state. The server does not know or care about client camera angle. Two clients viewing the same match may be at different rotations simultaneously. World-state (unit positions, fog, terrain) is identical regardless of angle — only the rendering changes.

**What rotation affects.**

- Which faces of a stacked tile are visible on-screen (camera-south and camera-east faces at any angle).
- Which sprite a unit renders with, based on `unit.facing` rotated by the current camera angle (§6.6).
- Which side of a pillar is between the camera and a unit behind it — so rotation can reveal a unit that was *visually* occluded at another angle. Fog of war (informational visibility) is unaffected.

**What rotation does NOT affect.**

- `sightRange`, `attackRange`, fog, LoS rules — all world-frame.
- Tile coordinates and unit positions — always world-frame.
- Input coordinates — clicks inverse-transform from screen space through current rotation to world-space before hitting game logic.

**Implementation note.** One PNG per terrain type; the renderer applies a rotation transform to the scene graph root. Per-tile cosmetic detail (moss, cracks, embers) is hash-seeded on `(x, y, cameraRotation)` so adjacent tiles stay varied at any angle. ART_SPEC v2 codifies this.

### 6.6 Unit Facing (new in v2 — server-authoritative)

Each unit has a `facing: "N" | "E" | "S" | "W"` in world space. Tracked server-side because future mechanics (backstab, directional abilities) may depend on it; recording it now avoids a contract migration later even if it's unused at launch.

**Setting facing.**

- On `Move`: unit faces the direction of its final step.
- On `Attack` / `Ability` targeting a specific unit or tile: unit faces that target before the animation plays.
- On spawn: unit faces toward the grid center (rough rule: Player A spawn at (1,4) faces E, Player B spawn at (6,3) faces W).

**Rendering.** Client picks the sprite based on `unit.facing` rotated by current `cameraRotation`. With 4 world facings × 4 camera angles = 16 effective orientations, reduced to 4 actual sprite assets (SE/SW/NE/NW camera-relative) because the rendering pipeline re-maps world-facing to camera-relative at draw time. ART_SPEC v2 codifies the four sprite variants.

**Why 4-facing instead of mirrored pairs.** FFT authenticity requires preserving asymmetric gear across facings — the Knight's shield is on the left arm in world space, and mirroring an SE sprite to get SW puts the shield on the right arm. Wrong. Four hand-painted facings fix it.

---

## 7. Units

### 7.1 Per-Unit State

Each unit carries:

- `id`, `ownerId`, `classId`.
- `pos: Position` — world x/y.
- `facing: Facing` — N/E/S/W, server-authoritative (§6.6).
- `hp`, `maxHp`.
- `statuses: Status[]` — defending, shield_wall, iron_stance, revealed, stunned, blood_tithe_used.

Full schema in §10.

### 7.2 Classes

Three classes. Each has a complete 3-ability kit. Values are v1.4 starting points; tuning passes happen after M10 playtesting.

#### 7.2.1 The Ashen Knight — Frontline Bruiser

**Identity:** Closes distance. Takes hits. Punishes anyone who gets close. The honest fighter — no tricks, just pressure.

| Stat | Value |
|------|-------|
| HP | 24 |
| Move cost | 1 energy/tile |
| Attack range | Melee (adjacent) |
| Sight range | 2 tiles |
| Jump (v2) | 2 |
| Base attack damage | 5 |

**Abilities:**

*Shield Wall* — 1 energy. Take 50% reduced damage until your next turn AND reduce forced movement (knockback, push) to 0. Cannot be combined with basic Defend on the same turn (they don't stack — last used wins).

*Vanguard Charge* — 3 energy. Move in a straight orthogonal line up to 3 tiles. Stops early at enemy, pillar/wall, or grid edge. On stop against enemy: 4 damage + push 1 tile further in the charge direction. If push destination is blocked (pillar, wall, grid edge, another unit, or a tile the pushed target can't enter due to its own jump), target takes +2 bonus damage and doesn't move. Charging into pillar/wall with no intervening enemy: halts harmlessly on last passable tile. Hazard/Corrupted tiles are valid line tiles — their on-enter effects still apply to the Knight.

*Iron Stance* — 2 energy to toggle on, 0 to toggle off. Persists across turns until toggled off or the Knight dies. While active: unmovable by forced movement, knockback negated entirely, every tile of your own movement costs +1 energy. Only one instance exists — re-casting while active is a no-op.

**Playstyle:** Get in the enemy's face and stay there. High HP means you can trade. Vanguard Charge closes gaps fast. Counterplay is kiting and high ledges (Knight's `jump = 2` caps escape elevation).

#### 7.2.2 The Pale Mage — Ranged Glass Cannon

**Identity:** Controls space with area damage and zone denial. Devastating at distance; fragile up close.

| Stat | Value |
|------|-------|
| HP | 16 |
| Move cost | 1 energy/tile |
| Attack range | 3 tiles (requires LoS) |
| Sight range | 3 tiles |
| Jump (v2) | 3 |
| Base attack damage | 3 |

**Abilities:**

*Cinder Bolt* — 2 energy. Ranged attack, range 3, requires LoS. Deals 5 damage. Core damage tool.

*Ash Cloud* — 3 energy. Pick an anchor tile within range 3 (Manhattan, LoS to anchor). Cloud covers anchor plus the three tiles to its right, down, and right-down (fixed 2×2 footprint, anchor top-left). All four in bounds. Lasts 2 turns. Blocks LoS through covered tiles for both players and Scout. Unit standing on Ash Cloud at turn start: 1 damage. Multiple clouds may coexist; damage does not stack on overlap.

*Blink* — 2 energy. Teleport to any tile within range 2 (Manhattan). Must be in your current vision (non-fogged) and passable (not pillar/wall/impassable, not occupied). Ignores pillars/walls as LoS blockers for the teleport itself — the Blink doesn't travel, it just resolves. **Ignores height** (Δheight is not gated by `jump` for Blink). Hazard/Corrupted tiles are valid destinations; their on-enter effects apply immediately.

**Playstyle:** Kite, zone with Ash Cloud, snipe with Cinder Bolt. 16 HP = two Knight swings. Blink is your lifeline and the only way to cross a height gap bigger than 3.

#### 7.2.3 The Heretic — Blood Warlock Trickster

**Identity:** Sacrifices HP for power. Lays traps in fog. Corrupts terrain. Plays mind games. The class built around fog of war as a weapon.

| Stat | Value |
|------|-------|
| HP | 20 |
| Move cost | 1 energy/tile |
| Attack range | 2 tiles (LoS not required at range ≤ 2 — ignores pillars/walls at point-blank) |
| Sight range | 2 tiles |
| Jump (v2) | 3 |
| Base attack damage | 4 |

**Abilities:**

*Blood Tithe* — 0 energy, costs 4 HP. Gain +2 energy this turn. Once per turn. Rejected if current HP ≤ 4 (`self_kill_prevented` — min 1 HP survivor rule). The defining mechanic: 7-energy turns at the cost of your life. Used for explosive combos.

*Hex Trap* — 2 energy. Place an invisible trap on any tile within range 2 (Manhattan, LoS not required — same as the Heretic's attack). Legal target tiles: passable terrain (not pillar/wall/shadow/hazard), empty of units, empty of pickups, not already trapped. Invisible to opponent until triggered (fog-filtered server-side). Trigger: enemy movement enters — 4 damage + apply `revealed` status (visible through fog for the Heretic for 2 of the victim's own turn starts, regardless of range). Max 2 traps per Heretic; placing a third removes the oldest. Traps persist until triggered or Heretic death.

*Desecrate* — 3 energy. Corrupt a 2×2 area within range 2 (same anchor convention as Ash Cloud — target tile plus its right/down/right-down neighbors, all four in bounds and not pillars/walls). Lasts 3 turns. Each affected tile stores its previous `TerrainType` in `baseType` and becomes `corrupted`; reverts on expiry. Corrupted tiles deal 2 damage/turn to non-Heretic units at their turn start and heal the Heretic 1 HP/turn at the Heretic's turn start. Movement cost and on-enter effects follow Corrupted rules, not `baseType` — Desecrate *replaces* terrain for the duration. Corrupting a hazard tile suppresses its DoT (hazards heal the Heretic while corrupted). Corrupting High Ground drops the elevation bonus while corrupted.

**Playstyle:** Lay traps in fog. Force the enemy to scout (burning energy) or risk stepping on 4-damage tiles. Use Blood Tithe turns for monster plays: Move + Hex Trap + Desecrate in one turn, paying 4 HP. Against Knight: kite and trap, use `jump = 3` to escape onto ledges. Against Mage: corrupt terrain to heal through poke.

### 7.3 Class Balance Triangle

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

- Knight vs Mage — Knight slight favorite (~55/45). Knight tanks Mage damage; Vanguard Charge closes gaps. Mage needs perfect Blinks and Ash Cloud zoning — height gaps favor the Mage (Blink bypasses them).
- Mage vs Heretic — Mage slight favorite (~52/48). Range lets Mage scout-and-poke without walking into traps. Heretic's Desecrate healing can outlast the poke.
- Knight vs Heretic — Heretic slight favorite (~52/48). Knight walks forward into traps; Blood Tithe matches Knight aggression; Heretic can escape onto a height-3 ledge (`jump = 3`) that the Knight can't follow. If Knight avoids traps and connects, Heretic's lower HP hurts.

Skill and perk choice matter more than class pick.

---

## 8. Meta Systems

Everything outside a single match.

### 8.1 Tournament

8-player single-elimination, fixed bracket size — no byes, no odd-round reseeding. Seeding randomized per tournament. Bots fill empty slots after a 15-second matchmaking wait (`BOT_FILL_WAIT_MS`). Winners advance; losers route to §8.6 Spectator Mode.

Between rounds: perk draft (§8.2).

### 8.2 Perks

Between tournament rounds, each advancing player picks 1 of 3 randomly-drawn perks. Perks last for the NEXT ROUND ONLY — they do not stack across the tournament. Both upcoming-match players draft privately; the opponent's perk is hidden until it matters mechanically (first activation).

**Full perk pool (16; jam ships all):**

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
| Counterspell | First enemy ability this round fizzles (no cost refunded) | Counter |
| Vampiric Touch | Heal 1 HP per successful attack | Sustain |

Intent: perks let you adapt between rounds. Saw a trap-heavy Heretic? Pick Trap Sense. Facing a Knight? Ghost Step for kiting. Roguelite replayability without persistent progression; every tournament starts fresh.

### 8.3 Arenas

Each tournament round uses a randomly-selected arena. Players don't know which until the round starts. Five archetypes ship at submission:

*The Pit.* Open center, High Ground rings the edges. Favors ranged. Sightlines are long; cover is in the corners.

*The Ruins.* Dense pillars and rubble. Lots of cover, short sightlines. Favors melee and traps; the Heretic shines here.

*The Bridge.* Narrow central corridor with hazards flanking the sides. Forces head-on engagement. Long-range classes get kited if they sit still.

*The Shrine.* Symmetrical. One powerful pickup (Scroll of Sight) in the exact center. Risk/reward: whoever grabs it controls the map, but they walk into the middle.

*The Maze.* Winding paths with shadow tiles throughout. Information warfare. The Heretic's home arena.

Arena data (terrain layout, spawn positions, pickup spawn slots, and — new in v2 — optional per-tile `heights` overrides) lives in `src/server/arenas/*.ts` as pure-data exports. No arena-specific logic; the engine reads the data.

### 8.4 Battlefield Pickups

One of each pickup type per map at match start. Positions are fixed per arena (defined in the arena data file), but which *chest* appears where is randomized. Pickups are hidden in fog until scouted or within sight. `UsePickup` costs 1 energy (0 with Pillager perk).

| Pickup | Effect |
|--------|--------|
| Health Flask | Restore 5 HP |
| Energy Crystal | +2 energy this turn |
| Scroll of Sight | Reveal the entire map for 1 turn |
| Chest | Opens to one of three single-use items (random): Smoke Bomb (place 1-tile fog on any tile within 2 for 2 turns), Flash (stun adjacent enemy 1 turn; they skip their next turn), Whetstone (+2 damage on your next attack only) |

Pickups add a reason to explore the map rather than rushing the opponent.

### 8.5 Surrender — The Coward's Brand

Surrender is not a quiet forfeit button. It is a moment.

**How it works.** At any point during your turn, you can choose `Kneel`. Your champion drops to one knee, weapon dropped beside them (`kneel` animation, 4 frames, holds on last frame). A 3-second dramatic pause. Screen darkens to alpha 0.6. A single deep bell toll plays. Your opponent's champion takes one step forward and stands over you. The match ends. Banner: *"[Player] has yielded. The arena remembers."*

**The shame layer.** In the tournament bracket view, the surrenderer's portrait gets a cracked/shattered overlay visible to everyone in the tournament for the rest of the tournament. If spectators are watching: slow-clap emote (post-jam polish; jam-scope is just the banner).

**Why it matters.** Most games make surrender invisible. Making it theatrical means players think twice before quitting, surrenders are memorable for spectators, and the shame becomes a meme/badge (some will kneel on purpose for the effect). Psychological weight is the point.

### 8.6 Spectator Mode

Eliminated players route to `SpectatorScene` after `ResultsScene` and can watch any in-progress match as a read-only state stream (via `spectatorState` messages, full non-fog-filtered view under current design) until the tournament ends. Cannot interact. Chat/emotes are post-jam.

### 8.7 Bot AI

Bots are simple, deterministic, and fill brackets. They are not meant to be smart.

**Decision tree per turn:**

```
while energy > 0 and a useful action is available:
  if an enemy unit is in attack range and has line-of-sight:
    attack
  elif own HP below 30% and a retreat tile is available:
    move toward nearest non-adjacent safe tile
  elif enemy unit visible and not in attack range:
    move one tile toward them (respecting jump)
  elif enemy not visible and scout is available:
    scout in the direction of their last known position (or centroid)
  elif pickup visible and within 3 tiles:
    move toward it
  else:
    endTurn

Abilities: use at opportunity when energy and target are valid.
  Knight → Vanguard Charge if it can close + damage.
  Mage → Cinder Bolt at range, Blink to escape if adjacent, Ash Cloud on a choke.
  Heretic → Blood Tithe for explosive close-out turns, Hex Trap on likely approach tiles, Desecrate on own position if being chased.
```

In v2, pathing respects `jump` — bots will not attempt illegal height transitions.

One skill level ships M10–M13. Variable difficulty is post-jam.

Bots use the same action validation path as humans. They are a player implementation, not a separate engine.

---

# Part III — How It's Built

## 9. Architecture

### 9.1 Principles

Non-negotiable.

**Playable-first, always.** Every milestone gate is a smoke test: two browser tabs, lobby to match, take one action, see the result. If the smoke test is red, the build is red. Visual polish ships after gameplay, not beside it.

**Server is truth.** Client renders what the server tells it to. Client does not compute damage, does not know whose turn it is, does not predict outcomes. Every action goes to the server, is validated, and the authoritative state comes back. Fog of war is filtered *server-side* before state reaches the client.

**Deterministic combat.** No RNG on hit/miss/crit. Damage values are fixed. Spawns are fixed per arena. The only points of randomness in the whole system are: coin flip for first turn at match start, the 3-perk offering shuffled per draft, the arena selection per round, the `Chest` pickup rolling its single-use item on open, and hash-seeded cosmetic variation in terrain tiles (purely visual).

**Placeholder art until the full gameplay loop lands.** Lobby → class select → match with turns, classes, fog, terrain, **height, rotation (v2)** → results works end to end with colored primitives before any pixel art begins. Gameplay correctness precedes visual polish, always.

**One AI agent per file at a time.** Parallel lanes on the same file produce silent regressions and duplicate implementations. Fernando assigns work serially. Don't edit a file that's already on someone else's open branch.

**CI as the only merge gate.** `main` is protected. A PR merges only when three checks pass: `typecheck`, `test:unit`, `test:smoke`. `--no-verify`, `@ts-ignore`, and `any` escape hatches are banned in non-test code.

**Thin branches, fast merges.** One branch per small feature. Three-day maximum before merge or close. Long-lived branches become cleanup sagas.

**Strict types, always.** `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Discriminated unions narrow at message boundaries, not with casts.

### 9.2 Stack (locked)

**Client runtime.** PixiJS 8.x on HTML5 Canvas, TypeScript 5.x with strict flags. Bundler: Vite. Dev port 3000.

**Server runtime.** Node 20+, `ws` WebSocket library, TypeScript 5.x with the same strictness. Dev runner: `tsx`. Production: `tsc` build → `node dist/server/index.js`. Port 8080.

**Testing.** Vitest for unit tests (pure logic in `src/shared` and `src/server`). Playwright for smoke tests (end-to-end two-browser flow). Smoke is required, not optional. Fixtures for deterministic server state.

**CI.** GitHub Actions. One workflow, three jobs: `typecheck`, `test:unit`, `test:smoke`. All three block merge.

**Linting.** ESLint with `@typescript-eslint/strict-type-checked`. Explicit rules on top: `no-explicit-any: error` (non-test), `ban-ts-comment: error` (blocks `@ts-ignore` / `@ts-expect-error` without description), `switch-exhaustiveness-check: error` (for discriminated unions like `ClientMessage` / `ServerMessage` / `GameAction`), `no-unnecessary-condition: warn`. Prettier for formatting.

**Package manager.** npm. No yarn, no pnpm, no bun.

**Asset pipeline.** Aseprite for pixel-art editing and animation export. Designer ChatGPT (or similar image-gen agent) for initial sprite generation only — every sprite goes through Aseprite before shipping. Music: Beatoven.ai for ambient game-dev tracks. SFX: SoundsGen or Freesound.org under permissive licenses.

**Deployment.** Render or Railway for the server, static hosting (Netlify / Vercel / Cloudflare Pages) for the client bundle. Only when gameplay is solid.

### 9.3 Renderer Architecture

DCT is pure 2D. No Three.js, no 3D meshes, no WebGL shaders beyond what PixiJS provides. The "iso" look is faked with flat sprites on a rotated scene graph.

**Layer stack** (back to front within a rotation):

1. Tile stacks (side faces + top faces, sorted by `(x + y)` under current camera rotation, then by stack depth).
2. Tile overlays (Corrupted veins, Ash Cloud overlays, cursor diamonds).
3. Pickups.
4. Units (sorted into the tile layer by their tile's depth key).
5. VFX (transient; self-destroys).
6. HUD (not rotated; screen-space).

**Camera rotation transform.** Applied to the world container. 0° / 90° / 180° / 270° only — no free rotation. 150ms ease-in-out on Q/E input. During the tween, input is blocked (no clicks process until the transition settles) to prevent off-by-a-frame hit-testing.

**Height render.** Each tile draws a side-face stack of `TILE_DEPTH_PX × height` beneath its top. Side-face detail is hash-seeded for variety. Units render at the top-surface height, anchor center-bottom, on their tile's top y-coordinate.

**Crisp pixels.** `SCALE_MODES.NEAREST`, `image-rendering: pixelated` on the canvas element, sub-pixel positions rounded at render time. No bilinear filtering anywhere.

**Input.** `InputHandler` owns mouse/keyboard. Mouse clicks inverse-transform from screen space through current camera rotation to world-space `Position`. Keyboard: Q/E rotate camera, 1–3 select ability, Tab cycle own units, Space end-turn, Esc quit to lobby.

---

## 10. Contracts

All shared types live in `src/shared/types.ts`. This is the contract. If it compiles, both ends agree.

### 10.1 Core Types

```ts
// Primitives
export interface Position { x: number; y: number }
export type UnitId = string & { readonly __brand: "UnitId" }
export type PlayerId = string & { readonly __brand: "PlayerId" }
export type MatchId = string & { readonly __brand: "MatchId" }

export type ClassId = "knight" | "mage" | "heretic"

export type PerkId =
  | "bloodlust" | "second_wind" | "scouts_eye" | "energy_surge"
  | "thick_skin" | "ghost_step" | "trap_sense" | "ash_walker"
  | "first_strike" | "last_stand" | "mist_cloak" | "fortify"
  | "long_reach" | "pillager" | "counterspell" | "vampiric_touch"

export type TerrainType =
  | "stone" | "high_ground" | "rubble"
  | "hazard_fire" | "hazard_acid" | "hazard_void"
  | "pillar" | "wall" | "shadow" | "corrupted"

// NEW in v2
export type Facing = "N" | "E" | "S" | "W"

// NEW in v2 — client-only render state. NOT in shared types; lives in a client module.
// export type CameraRotation = 0 | 90 | 180 | 270

export interface TerrainTile {
  type: TerrainType
  /** NEW in v2. Stack height. Integer >= 0. Default 1. 0 = pit (below default floor). */
  height: number
  /** Only present for Corrupted / Ash Cloud — turns remaining */
  ttl?: number
  /** Underlying type for reverting dynamic effects */
  baseType?: TerrainType
}

export interface Unit {
  id: UnitId
  ownerId: PlayerId
  classId: ClassId
  pos: Position
  /** NEW in v2. World-space facing. Updated on move / attack / ability target. */
  facing: Facing
  hp: number
  maxHp: number
  statuses: Status[]
  // No cooldowns field. Ability gating is by energy + HP cost + once-per-turn
  // flags carried inside statuses. If a future ability needs turn-counting
  // cooldowns, add it here and update validators.
}

export interface Status {
  kind:
    | "defending"
    | "shield_wall"
    | "iron_stance"
    | "revealed"
    | "stunned"
    | "blood_tithe_used"  // cleared at owner's next turn start
  ttl: number             // turns remaining; -1 = until toggled off (Iron Stance)
}

export interface Pickup {
  id: string
  pos: Position
  kind: "health_flask" | "energy_crystal" | "scroll_of_sight" | "chest"
}

export interface HexTrap {
  id: string
  ownerId: PlayerId
  pos: Position  // fog-filtered from non-owners
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
  name: string
  tiles: TerrainType[][]          // 8×8, [y][x] — material
  /** NEW in v2. Optional per-tile height override. [y][x]. Defaults to 1 when absent. */
  heights?: number[][]
  spawns: [Position, Position]
  pickupSlots: Position[]
}

export interface MatchState {
  matchId: MatchId
  arena: string
  grid: { width: 8; height: 8; tiles: TerrainTile[][] }
  units: Unit[]
  pickups: Pickup[]
  traps: HexTrap[]             // fog-filtered per player
  ashClouds: AshCloud[]        // overlays — renderer draws atop tiles
  currentTurn: PlayerId
  turnNumber: number           // monotonic from 1
  turnEndsAt: number           // server unix-ms
  energy: Record<PlayerId, number>
  maxEnergy: Record<PlayerId, number>  // 5, or 6 with Energy Surge
  perks: Record<PlayerId, PerkId[]>
  phase: "active" | "over"
  winner?: PlayerId
  surrender?: { by: PlayerId; at: number }
}

// Actions (client → server)
export type GameAction =
  | { kind: "move"; unitId: UnitId; path: Position[] }
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
  matches: Array<{
    matchId: MatchId
    players: [PlayerId, PlayerId]
    winner?: PlayerId
    status: "pending" | "active" | "done"
  }>
}
```

Two rules about this file. First: it is THE contract — nothing else defines these shapes. Second: game-shape types live *only* here. If you find yourself wanting to declare `interface MatchState` in a client file, stop.

### 10.2 Constants

All game numbers live in `src/shared/constants.ts`. No inline magic values anywhere else.

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

// NEW in v2
export const DEFAULT_TILE_HEIGHT = 1 as const
export const TILE_DEPTH_PX = 28 as const              // side-face height per unit of stack
export const CAMERA_ROTATION_MS = 150 as const        // camera tween duration

export const CLASS_STATS: Record<ClassId, {
  hp: number
  baseAttackDamage: number
  attackRange: number
  sightRange: number
  requiresLoS: boolean
  jump: number                    // NEW in v2
}> = {
  knight:  { hp: 24, baseAttackDamage: 5, attackRange: 1, sightRange: 2, requiresLoS: false, jump: 2 },
  mage:    { hp: 16, baseAttackDamage: 3, attackRange: 3, sightRange: 3, requiresLoS: true,  jump: 3 },
  heretic: { hp: 20, baseAttackDamage: 4, attackRange: 2, sightRange: 2, requiresLoS: false, jump: 3 },
} as const

export const MOVE_COST_DEFAULT = 1 as const
export const MOVE_COST_DIFFICULT = 2 as const  // rubble, climbing onto high ground
export const ATTACK_COST = 2 as const
export const DEFEND_REDUCTION = 0.5 as const
export const COVER_RUBBLE_REDUCTION = 0.15 as const
export const HIGH_GROUND_DAMAGE_BONUS = 0.25 as const
export const MIN_DIRECT_DAMAGE = 1 as const
```

Actual file has more — perk effects, ability costs, sprite canvas size (64), etc. Rule: if a number appears in this spec, it appears in `constants.ts`, and is imported everywhere it's used.

### 10.3 Server Protocol

Transport: WebSocket at `ws://localhost:8080` (dev) / `wss://...` (prod). Framing: JSON-per-message, UTF-8 text frames only. No binary frames. `permessage-deflate` disabled — messages are tiny, compression doesn't pay back CPU. One JSON value per frame; no batching, no newline-delimited streams.

**Session tokens.** Server-issued opaque UUIDv4 in `hello`. Valid 5 minutes from issue or until match end (whichever later). Reconnect during live match requires matching token. Tokens are not bearer credentials in any meaningful sense — they identify reconnects, not authenticate identity. No PII.

**Connection lifecycle.** Client opens ws → server sends `hello` (`serverVersion`, `sessionToken`) → client sends `joinTournament` with `name` and (reconnect) prior token → server assigns slot → `tournamentUpdate` broadcasts periodically.

When the bracket fills (8 humans or humans+bots after 15s wait), server pairs players and sends `matchStart` to each pair with fog-filtered initial `MatchState`. Match proceeds via `action` / `actionResult` / `stateUpdate`. Ends with `matchOver`. Winners receive `perkOptions`.

**Validation.** Every action validated server-side against current state: whose turn, unit ownership, target in range, LoS (3D-aware, v2), energy, impassability, unit alive, **`|Δh|` within jump (v2)**. Invalid → `actionResult { ok: false, error }`, no state change. Never trust client input.

**Rate limit.** Max 10 actions/second/player. Excess rejected with `rate_limited`, no energy consumed.

**Fog filtering.** Per-player view computed before broadcast. Strip enemy units outside sight; strip traps not owned by recipient; strip pickups outside sight; strip unobservable actions. Two players same match can and will receive different payloads same tick.

**Action ordering.** Server processes strictly serial per match (one in-flight at a time). Acting player receives `actionResult { ok, eventId }` first; both players then receive `stateUpdate` carrying that `eventId`. Client must not commit visual state from `actionResult` alone.

**Clock and timer.** `turnEndsAt` is server unix-ms. Client computes remaining as `Math.max(0, turnEndsAt - Date.now())`. Drift tolerated; server authoritative on expiry.

**Reconnect.** 30-second grace (`RECONNECT_GRACE_MS`). Turn timer continues during the grace window — disconnecting does not pause the match. On reconnect with matching token, player resumes with whatever time remains. After 30s or on `turnEndsAt` expiring during disconnect, player forfeits. Bots never disconnect.

**Perk draft.** 20-second cap (`PERK_DRAFT_TIMER_MS`). Timeout auto-picks the first option.

**Bot fill.** After 15s from first `joinTournament`, bots fill empty slots. Same engine API, same fog filter, same rate limits.

**Error codes.** Fixed enum:

| Code | When | Retryable? |
|------|------|-----------|
| `not_your_turn` | Action while `currentTurn !== sender` | No (wait for turn) |
| `insufficient_energy` | Cost exceeds remaining energy | No |
| `out_of_range` | Target outside ability or attack range | No |
| `no_line_of_sight` | Target requires LoS and it's blocked | No |
| `target_untargetable` | Target on shadow tile or otherwise protected | No |
| `invalid_path` | Movement path fails step-by-step validation | No |
| `tile_impassable` | Move/target is pillar/wall/impassable | No |
| `tile_occupied` | Tile has a unit or (Blink) another blocker | No |
| `height_exceeds_jump` | **NEW v2.** `|Δh|` exceeds walker's `jump` | No |
| `duplicate_trap` | Hex Trap target already has a trap | No |
| `self_kill_prevented` | Blood Tithe would drop Heretic to 0 HP | No |
| `unit_dead` | Action references a dead unit | No |
| `unit_not_owned` | Unit not owned by sender | No (malicious/bug) |
| `match_not_active` | Action during `over` phase | No |
| `rate_limited` | >10 actions/sec | Yes (back off) |
| `bad_message` | Malformed JSON or unknown type | No |
| `session_expired` | Token expired or unknown | No (reconnect flow) |
| `server_busy` | Pool full, etc. | Yes |
| `server_error` | Unhandled server exception; also logged | Yes once |

Client surfaces `not_your_turn` / `insufficient_energy` / `height_exceeds_jump` as silent UI feedback; `rate_limited` / `server_error` as unobtrusive toast; never shows raw codes.

**Match log (replay stub).** Every accepted action appended in-memory keyed by `matchId`: `{ seq, eventId, at, actor, action, resultingHashOfState }`. Retained 60s after `matchOver`. Post-jam: disk persistence for replays.

**Performance budgets.** Target envelopes (not hard limits; blown budgets get flagged in review):

- Server action-processing p99: < 10 ms (validator + state update + fog filter + serialize).
- Server memory per active match: < 500 KB.
- `stateUpdate` payload post-fog: < 4 KB typical, < 16 KB hard ceiling (refuse to send — indicates a bug).
- Client render: 60 FPS in match scene on a mid-tier 2020 laptop. No GC stalls > 16 ms in-turn.
- Network round-trip (action → stateUpdate applied): < 200 ms localhost, < 400 ms hosted.

**Environment variables.** Server reads `process.env` only; don't hardcode. At minimum: `PORT` (default 8080), `LOG_LEVEL` (default `info`), `NODE_ENV`. `.env` git-ignored; `.env.example` documents every variable. Never log session tokens or player names at `info` or above.

**Health endpoint.** Dev-only HTTP `GET /health`: `{ status: "ok", uptimeMs, matchesActive, playersConnected, serverVersion }`. Useful for smoke test and deploy checks.

---

## 11. Repo Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml                # typecheck + unit + smoke, all required
├── .gitignore                    # node_modules, dist, vite.config.ts.timestamp-*, .env, .DS_Store
├── public/
│   ├── sprites/                  # The only sprite folder. Do not create a second one.
│   │   ├── champions/            # 4 facings per animation per champ (SE/SW/NE/NW, v2)
│   │   ├── tiles/                # One PNG per terrain type; renderer rotates (v2)
│   │   ├── vfx/
│   │   ├── pickups/
│   │   ├── perks/
│   │   ├── portraits/
│   │   ├── hud/
│   │   ├── abilities/
│   │   └── logo/
│   └── audio/
├── index.html                    # Vite entry — project root per Vite convention
├── src/
│   ├── shared/                   # Client + server import from here only
│   │   ├── types.ts              # Single source of truth for all contracts
│   │   ├── constants.ts          # Every game number
│   │   ├── grid.ts               # manhattanDistance, isInBounds, positionKey, lineOfSight (3D-aware in v2)
│   │   └── index.ts              # Barrel export
│   ├── server/
│   │   ├── index.ts              # ws server, connection handling, routing
│   │   ├── GameEngine.ts         # Pure game logic. Testable without ws.
│   │   ├── TournamentManager.ts  # Bracket state, bot fill, perk draft orchestration
│   │   ├── BotAI.ts              # Deterministic bot (jump-aware in v2)
│   │   ├── Fog.ts                # Per-player state filtering
│   │   ├── validators.ts         # Pure action validation (height-aware in v2)
│   │   └── arenas/               # Arena definitions (data, not code)
│   │       ├── pit.ts
│   │       ├── ruins.ts
│   │       ├── bridge.ts
│   │       ├── shrine.ts
│   │       └── maze.ts
│   └── client/
│       ├── main.ts               # Entry. Bootstraps PixiJS app + network.
│       ├── network.ts            # ws client, reconnect, message routing
│       ├── Renderer.ts           # Single renderer. Camera rotation + height stacks in v2.
│       ├── SceneManager.ts       # Scene lifecycle, transitions
│       ├── scenes/               # The ONLY scene hierarchy. No screens/.
│       │   ├── TitleScene.ts
│       │   ├── LobbyScene.ts
│       │   ├── MatchScene.ts
│       │   ├── PerkDraftScene.ts
│       │   ├── BracketScene.ts
│       │   ├── ResultsScene.ts
│       │   └── SpectatorScene.ts
│       ├── input/
│       │   └── InputHandler.ts   # Q/E rotate; inverse-transform clicks to world-space (v2)
│       ├── ui/
│       │   └── HUD.ts
│       └── audio/
│           └── SoundManager.ts
├── tests/
│   ├── unit/                     # Vitest. Pure logic only.
│   └── smoke/                    # Playwright. Lobby → match → action.
├── SPEC.md                       # This file. The only design doc.
├── ART_SPEC.md                   # Sprite artist brief
├── README.md                     # Setup + run only. No design content.
├── tsconfig.json
├── package.json
└── vite.config.ts
```

`index.html` lives at the project root per Vite convention; `public/` holds static assets only.

Anything not in this tree needs a PR conversation about why it exists. Top-level markdown is `README.md`, `SPEC.md`, and `ART_SPEC.md` only.

---

## 12. Milestones

Each milestone is a gate. You do not start the next one until the current one's smoke test is green on `main`. Every milestone has an explicit Definition of Done and a smoke check.

**M0 — Skeleton.** Repo initialized, strict tsconfig, Vite + tsx running, ESLint + Prettier wired, GitHub Actions CI running typecheck + empty unit + smoke-boot on every PR, `main` protected. Server accepts a WS connection and sends `{ type: "hello", serverVersion }`. Client connects and logs it. **Smoke:** `npm run dev` → browser → console shows server hello.

**M1 — Grid and units.** Server holds an 8×8 grid and two connected players, each with one unit at mirrored spawn positions (1,4) and (6,3). Client renders grid as 64×32 iso diamonds and units as colored circles with letter labels. No sprites, no animation, no terrain variation. **Smoke:** two tabs both see the same grid and both units.

**M2 — Move action, energy, turn order.** Click a tile → `{ kind: "move", to }` action. Server validates (in bounds, not occupied, not impassable, enough energy), applies, broadcasts authoritative state. Orthogonal only, 1 energy/tile. Energy refresh 5 at turn start. Turn order: coin flip, then alternating. **Smoke:** two tabs, A moves, B sees it within 200ms, A cannot move more than 5, B cannot act during A's turn.

**M3 — Attack, HP, death, match-end.** `Attack` action (2 energy). Adjacent for melee, class-ranged for ranged. Fixed damage by class. Units have HP, die at 0, are removed. Match ends when one side has zero living units. `ResultsScene` shows winner. **Smoke:** attack reduces HP, death ends match, both clients transition to ResultsScene.

**M4 — Turn timer + full turn loop.** 30s timer, auto-end on timeout, remaining energy forfeit. `EndTurn` action. Timer visible in HUD. **Smoke:** full match plays end-to-end across two tabs with no refresh, timer counts down, timeout ends turn.

**M5 — Three classes with full 3-ability kits.** Ashen Knight, Pale Mage, Heretic. Stats and abilities exactly per §7. `LobbyScene` lets each player pick a class before match start. `Defend` and `Wait` actions added. **Smoke:** all nine matchups (incl. mirrors) playable without crashes; each ability's effect is visible and validated server-side.

**M6 — Fog of war + Scout.** Server filters `MatchState` per player based on sight (class-modified). Client renders fog as dark overlay. Terrain always visible; enemy positions only in sight. Last-known ghosts. `Scout` action (1 energy): reveal 3×3 for current turn. **Smoke:** A cannot see B outside sight range; Scout reveals B; moving out re-fogs; ghost appears on last-seen tile.

**M7 — Full terrain + battlefield pickups.** All seven terrain types (§6.2) with their mechanics. Four pickup types (§8.4). `UsePickup` action (1 energy). **Smoke:** high ground costs 2 to enter, hazards DoT, pillars block LoS for attacks and Scout, shadow tiles grant untargetability, pickups grant their effects.

### M7.5 — Rotatable camera + terrain height (NEW in v2)

The FFT pivot's engineering foundation. Adds camera rotation, multi-height terrain, unit facing, and the mechanical rules that depend on them. Art stays programmer-placeholder (colored circles + colored diamonds) — this milestone is about the engine, not the look.

**Ships:**

- `Tile.height` added to `TerrainTile` (§10). Default 1 when absent; arenas may override via `heights` table.
- `Unit.facing` added (§6.6, §10). Server updates on move/attack/ability target. Rendered as a small indicator (wedge/triangle) on the colored-circle placeholder until M9 sprites ship.
- Client-only camera rotation state (0° / 90° / 180° / 270°). Q/E keys rotate with 150 ms ease-in-out tween. Input blocked during tween.
- Renderer draws tiles as stacked side-faces of `TILE_DEPTH_PX × height` beneath the top. Input inverse-transforms through current camera angle to world-space.
- Movement validator: Δheight gate (`|Δh| ≤ 1` free, `> 1` requires `jump ≥ |Δh|`). New error code `height_exceeds_jump`.
- LoS made 3D-aware: line from attacker top-surface to target top-surface, blocked if any intermediate column's top exceeds the line's height there.
- Per-class `jump` stat in `CLASS_STATS` (Knight 2, Mage 3, Heretic 3).
- Bots respect `jump` in pathing.
- `F3` debug overlay shows current camera rotation and hovered tile height.

**Does NOT ship:**

- FFT-quality terrain or champion sprites (those are M8 and M9).
- 4-facing sprite assets (M9). Unit facing is stored server-side and rendered as a direction indicator on the placeholder.
- Arena-level height authoring for existing v1.x arenas (they stay flat = 1). One playground arena with stacked terrain ships to exercise the smoke test.

**Smoke.** Two tabs. Rotate camera with Q/E — view tweens smoothly, input still works after the tween settles. Test arena has at least one height-3 stack. Knight cannot step onto the 3-stack from height 1 (rejected with `height_exceeds_jump`). Mage can (`jump = 3`). LoS from behind the stack to a target behind-and-below is blocked; rotating the camera 90° reveals the target visually but fog state is unchanged (server-authoritative vision is not affected by camera angle).

---

**M8 — FFT-quality terrain textures + rotation-ready tiles.** Replace colored diamond tiles with textured pixel-art tiles specified in §14 and ART_SPEC v2. One PNG per terrain type (renderer rotates). Per-tile detail placement hash-seeded on `(x, y, cameraRotation)`. Side-face painting accommodates any rotation. `image-rendering: pixelated` locked, `SCALE_MODES.NEAREST`, sub-pixel rounding. Height-1 vs height-2 vs height-3 stacks are visually distinguishable. **Smoke:** all seven terrain types distinguishable at a glance on the live grid at every camera rotation; pixels crisp at every zoom level.

**M9 — FFT-quality champion sprites + ability VFX (4-facing).** Replace colored circles with full sprite sheets per §15 and ART_SPEC v2. Each champion ships idle / walk / attack / hit / death / defend / cast-or-channel / kneel × 4 facings (SE, SW, NE, NW). ~96 sheets total. Ability VFX sprites per ART_SPEC. Damage numbers with scale-punch animation. **Smoke:** all three champions animate correctly across all state transitions at every camera rotation; ability casts show telegraph + impact VFX; Knight's shield stays on the left arm in world-space across all four camera angles.

**M10 — Tournament bracket + bot fill + perk draft.** 8-player single-elimination, fixed bracket size. `TournamentManager` pairs players, advances winners, handles losses. Bot fill after 15s matchmaking wait — bracket always exactly 8 entrants before round 1. Seeding randomized. `BracketScene` shows current standings. Perk draft between rounds: winner picks 1 of 3, lasts next round only, no stacking. All 16 perks from §8.2 implemented. Losing players route to `SpectatorScene` (placeholder for M12). **Smoke:** full 8-player tournament runs to completion with mixed humans and bots; perks visibly modify next match.

**M11 — Five arenas + map rotation.** All five arena archetypes (§8.3) built out as terrain + height layouts with fixed pickup slots. Random arena selected per round. **Smoke:** across a full tournament, at least 3 different arenas appear; each plays distinctly.

**M12 — Surrender + spectator mode.** `Kneel` action: 3s dramatic pause, bell-toll cue, match ends, winner portrait next to cracked-portrait effect on the surrenderer in the bracket. Eliminated players land in `SpectatorScene` and can watch any in-progress match (read-only state stream). **Smoke:** surrender triggers the sequence; spectator watches a live match end-to-end.

**M13 — Audio, polish, submission.** Music tracks per Part IV wired into scenes, SFX on every action, ambient wind in match scenes. Final HUD pass: portraits, energy pips, turn banner, status icons. Title, main menu, post-tournament stats screen. Deploy. **Smoke:** cold-open in incognito, complete a full tournament, hear audio, see end credits.

Nothing ships beyond M13 before submission. Post-submission items go in Part V appendix (forthcoming PR).

---

## 13. Workflow

### 13.1 Branches & PRs

**Branches.** One branch per small feature. Naming: `<agent>/m<milestone>-<slug>`, e.g. `kai/m7-5-rotation-height`, `fernando/m9-knight-sprites`, `cursor/m13-hud-polish`. Lifespan target: under three days. A branch open more than a week is a smell.

**Commits.** Conventional-ish. Prefix with area when useful: `server:`, `client:`, `shared:`, `ci:`, `art:`, `docs:`. Body explains *why* when the *what* isn't obvious from the diff.

**PRs.** Target `main` only. Description must name which milestone the PR serves and which smoke gate it affects. Required checks: `typecheck`, `test:unit`, `test:smoke`. No force-pushes to `main`. No merges that skip CI. No `--no-verify`.

**Serial work.** For any given file in `src/`, only one agent may be editing it on an open branch at a time. If two agents want the same file, coordinate in chat before starting. No exceptions through M13.

### 13.2 Type Discipline

**Typecheck gate.** `npm run typecheck` must be green before every commit. Banned in non-test code: `@ts-ignore`, `any`, `as any`, unchecked index access. If a PixiJS event type is intentionally broad, cast at the boundary and narrow immediately.

**Smoke gate.** `npm run test:smoke` must be green before every merge. Smoke boots the server, opens two Playwright-controlled browsers, walks lobby → match → one action → asserts it took effect. If it fails, the build is broken, not the test. Fix the build.

### 13.3 Scripts (locked names)

CI and docs reference these. If a script doesn't exist, add it — don't invent a new name. The three gate scripts (`typecheck`, `test:unit`, `test:smoke`) are sacred; renaming them means renaming them in CI too.

| Script | Runs |
|--------|------|
| `npm run dev` | Client (Vite :3000) + server (tsx :8080) in parallel via `concurrently`. |
| `npm run dev:client` | Vite only. |
| `npm run dev:server` | `tsx watch src/server/index.ts` only. |
| `npm run build` | `tsc -p tsconfig.server.json && vite build`. |
| `npm run start` | `node dist/server/index.js`. |
| `npm run typecheck` | `tsc --noEmit`. CI gate #1. |
| `npm run test:unit` | Vitest against `tests/unit/`. CI gate #2. |
| `npm run test:smoke` | Playwright against `tests/smoke/`, boots server. CI gate #3. |
| `npm run lint` | ESLint over `src/` and `tests/`. |
| `npm run format` | Prettier write. |

### 13.4 Dev Ergonomics

Cheap tools that save days. Build once, use every session.

**Debug overlay.** Press `F3` in match scene: shows `turnNumber`, last `eventId`, your fog-filtered units, server round-trip time, current scene name, **current `cameraRotation` (v2)**, **hovered tile height (v2)**. Hidden in all other scenes. Session-local toggle. Gated behind `import.meta.env.DEV` — stripped from production bundles.

**Dev cheats (DEV builds only).** `?dev=1` enables: `1`/`2`/`3` force class, `G` grants +5 energy, `K` kills opponent (debug match-end), `L` toggles fog overlay off, **`R` cycles camera rotation without tween (v2, for screenshots at exact angles)**. Server validates — cheat keys emit tagged actions accepted only when `NODE_ENV !== 'production'`.

**Local 1v1.** `npm run dev` opens two browser tabs automatically (via Vite config).

**Deterministic match seed.** `?seed=<uint>` forces match RNG seed (coin flip, perk shuffle, arena pick). Test flows and playtest recordings rely on it. Server accepts only when `NODE_ENV !== 'production'`.

**Hot reload.** Vite HMR client. `tsx watch` server — full reload on server file change. Active matches drop on server reload (expected in dev).

### 13.5 The Trap List

Don't step on these. They've all been stepped on at least once during v1.x.

- Do not commit `vite.config.ts.timestamp-*.mjs` or similar build-tool artifacts.
- Do not create a second UI hierarchy parallel to `scenes/`. If you want a "screen," make a scene.
- Do not create a second sprite folder. `public/sprites/` is the only one.
- Do not inline helper functions across files. Used in more than one place → `src/shared/` on the first duplication.
- Do not let visual features merge while core gameplay is broken.
- Do not commit briefing or scratchpad markdowns to the repo root. PR descriptions or nothing. Only `README.md`, `SPEC.md`, and `ART_SPEC.md` live in root.
- Do not skip the smoke gate "just this once."
- Do not run two AI agents on overlapping files.
- Do not put the project in a cloud-sync folder (OneDrive, Dropbox, iCloud).
- Do not use `@ts-ignore`, `any`, or `as any` to silence type errors. Fix the types.
- Do not refactor across milestone lines. A refactor PR is its own gated thing, not a side-quest in a feature branch.
- Do not ship a class with a partial ability kit for "playtesting." All three abilities or none.
- Do not hardcode grid dimensions, energy amounts, damage values, or any numbers outside `constants.ts`.
- **Do not compute LoS in 2D once height is live (v2).** Every LoS check goes through the 3D-aware helper in `src/shared/grid.ts`.
- **Do not treat camera rotation as game state (v2).** It is client-only. The server must not know or care about viewing angle.
- **Do not mirror sprites across facings (v2).** Mirroring puts the Knight's shield on the wrong arm. Use the four painted facings.

---

---

# Part IV — How It Looks and Sounds

Part IV enumerates every visual and auditory asset the game ships, and the rules that govern how it's made and used. This part does *not* specify pixels — `ART_SPEC.md` is the pixel bible. When Part IV and ART_SPEC disagree, Part IV (this doc) is engineering-authoritative; ART_SPEC gets patched.

ART_SPEC v1.3 remains the current pixel brief. ART_SPEC v2 follows the designer pilot return — once we've confirmed FFT-quality is achievable at 4-facing scale, we rewrite ART_SPEC to reflect the v2 sprite-orientation conventions and the multi-height tile grammar. Part IV is written to be compatible with either version.

---

## 14. Art Direction — Terrain

### 14.1 Aesthetic Target

Final Fantasy Tactics (PS1, 1997) combat scenes with Diablo I's palette pushed darker. Hand-painted pixel detail per tile, not flat color fills. Visible materials, not symbols. Every tile reads at a glance as its terrain type even at 1× zoom on a cluttered grid.

Anti-targets (do NOT look like these): Stardew Valley, Hyper Light Drifter, NES 8-bit, modern flat-vector pixel art, default Aseprite presets. The tone is gothic, oppressive, mortuary — not cheerful, not cute.

### 14.2 Palette (canonical)

| Role | Primary | Shadow | Highlight |
|------|---------|--------|-----------|
| Stone / metal | `#5a5a68` | `#3a3a48` | `#7a7a8a` |
| Cold highlight | `#aaaacc` | — | `#ccccdd` (never pure white) |
| Earth | `#3a2a1a` | `#2a1a0a` | `#5a4a3a` |
| Blood / ember | `#8b0000` | `#5a0000` | `#cc2222` |
| Fire accent | `#ff6600` | `#cc4400` | `#ffaa44` |
| Magic (violet) | `#6633aa` | `#4a2288` | `#8866ff` |
| Pale arcane (blue) | `#88aaff` | `#5577cc` | `#aaccff` |
| Arcane cloth | `#2a2a5a` | `#1a1a38` | `#4466cc` |
| Gold trim | `#bba040` | `#886a20` | `#ddc060` |
| Background | `#0a0a15` | `#0e1020` | — |

**Hard rules (enforced at QA).**

- Never pure white `#ffffff`. Brightest white is `#ccccdd` (cold highlight).
- Never fully-saturated RGB primaries (`#ff0000`, `#00ff00`, `#0000ff`).
- 16–24 distinct colors per sprite.
- 1 px dark outline (`#1a1a20` or darker) on every character, prop, and VFX motif.
- No anti-aliasing on outlines or edges. Partial-alpha edge pixels are export bugs.
- No dithering. We are not using dither as a stylistic choice.
- Light comes from **upper-left** in every sprite and tile. Consistent across everything. NE / NW unit sprites (back-facing) still have their highlights on the upper-left of screen space, which is the character's *back* in those views — this is correct.

### 14.3 Tile Canvas (v2)

Each base tile authored at:

- **Top face:** 64 × 32 diamond. The walkable surface.
- **Side face (one stack unit):** 64 × 28 diamond band beneath the top.
- **Export canvas:** 64 × 60 PNG with transparency. Diamond top painted in upper 32 px, side face in lower 28 px.

For stacked tiles (`Tile.height > 1`), the **renderer repeats the side face** `(height − 1)` additional times beneath the authored tile. The artist ships ONE PNG per terrain type; the renderer stacks. Side-face hash-seeded detail placement per stack layer keeps adjacent stacks from looking like a single extruded block.

### 14.4 Camera-Rotation Hash-Seeding (v2)

One PNG per terrain type; the renderer applies the iso-rotation transform. Per-tile cosmetic detail (moss tufts, crack direction, ember dots, acid bubbles, swirl centers) is **hash-seeded on `(x, y, cameraRotation)`** — not just `(x, y)` — so that at any rotation the detail distribution reads naturally and adjacent tiles don't duplicate. A `pixelArt.ts` utility in `src/client/` owns this hash; don't re-invent it per renderer.

### 14.5 Terrain Catalog (one line per type — full pixel anatomy in ART_SPEC §6)

- **Stone (default):** warm gray-brown `#4a4550` base, masonry seam lines forming brick-bond, occasional moss or crack on ~25 % of tiles.
- **High Ground:** sandy-earth top face with horizontal grain, small grass tufts along diamond edges, 1 px bright upper-left edge highlighting the raised lip.
- **Rubble:** 3–5 irregular stone chunks scattered, each with upper-left highlight + lower-right shadow, darker and more chaotic than Stone.
- **Hazard — Fire:** charred `#2a1a14` base, 5–8 ember dots, 2–3 tiny upright flame triangles.
- **Hazard — Acid:** dark bile-green `#1a2a1a` base, 3–4 bubbling circles with wet-shine specular dot on each bubble.
- **Hazard — Void:** deep purple-black base, 2–3 curved `#4a2288` swirl lines radiating from center.
- **Pillar:** stone column centered on diamond, rising from top face, obviously a wall (not a step-up).
- **Wall:** full-tile-width dark stone block with horizontal mortar banding every 6 px.
- **Shadow Tile:** very dark `#0e0e1e` base, 2–3 curved wispy purple lines, one hash-placed `#ccccdd` shimmer dot.
- **Corrupted:** dark red-black `#3a1a1a` base, 3–4 branching `#8b0000` vein lines ending in a `#cc2222` highlight pulse.

### 14.6 Rendering Constraints

- `PIXI.SCALE_MODES.NEAREST` globally.
- `image-rendering: pixelated` CSS on the canvas element.
- All sprite positions rounded to integer pixels at render (sub-pixel positions blow up as anti-aliased fuzz).
- No PixiJS filters that smooth (blur, noise, bevel). ColorMatrixFilter for desaturation and tint is fine — it's per-pixel, not interpolating.
- **Tile rotation is implemented via the scene-graph-root transform, NOT per-tile sprite rotation.** Per-tile rotation would force texture resampling and break NEAREST.

### 14.7 Reference

Full pixel anatomy per tile, palette bins with exact positioning rules, and QA checklists live in `ART_SPEC.md` (currently v1.3, §6). ART_SPEC v2 will extend each tile entry with its stack-side and per-rotation detail rules.

---

## 15. Art Direction — Champions

### 15.1 Silhouette Identity

Every champion must be instantly identifiable from a 32-pixel-tall solid-black silhouette. If you squint and can't name the class, the silhouette fails.

- **Ashen Knight** — squat and wide (pauldrons), crimson plume spiking up from a great helm, greatsword held high, kite shield on the left arm. Metal-heavy. Reads: immovable wall.
- **Pale Mage** — tall, narrow, pointed hood apex, glowing orb on a staff floating above head-level, floor-length robe with tattered hem. Cloth-heavy. Reads: cloaked sorcerer.
- **Heretic** — hunched and asymmetric, two curved horns out and up from skull, bone-gauntlet claws, no weapon silhouette (hands are the weapon), ragged waist strips. Flesh-and-bone. Reads: predator.

### 15.2 Canvas & Anchor

- **Canvas:** 64 × 64 PNG, transparent background.
- **Body footprint:** roughly central 24–28 px wide × 40 px tall. Weapons, hoods, plumes, staves extend outside that box into the full 64 × 64.
- **Anchor:** center-bottom, `(0.5, 1.0)`. Feet touch y-rows 60–62 on every frame across every animation and every facing. Depth-sort breaks if feet drift.
- **Ground shadow:** 20 × 6 px ellipse at `alpha 0.3`, `#0a0a15`, baked into the sprite (renderer does not add it).

### 15.3 Four-Facing Rules (v2)

**This is the defining v2 change.** FFT uses four hand-painted sprite orientations per pose, not two-facings-mirrored. The Knight's shield lives on the left arm in world space, and mirroring puts it on the wrong arm.

Four camera-relative sprite orientations ship per animation:

| Suffix | Character orientation on screen | World meaning (at camera rotation 0°) |
|--------|---------------------------------|--------------------------------------|
| `_se` | 3/4 front, facing screen-down-right | Unit facing E or S in world |
| `_sw` | 3/4 front, facing screen-down-left | Unit facing W or S in world |
| `_ne` | 3/4 back, facing screen-up-right | Unit facing E or N in world |
| `_nw` | 3/4 back, facing screen-up-left | Unit facing W or N in world |

The renderer chooses among the four based on `unit.facing` rotated by current `cameraRotation`. No mirroring at runtime. No tween between facings — facing changes snap on the frame immediately before the action animation plays.

**Cross-facing consistency:**

- The Knight's shield stays on the LEFT arm in world space (camera-near side in SW/NE, camera-far side in SE/NW).
- The sword stays in the RIGHT hand.
- Crimson plume is visible from all four angles.
- Light comes from upper-left in screen space regardless of facing — highlights land on the character's back in NE / NW.
- Cape / tabard visible from behind (NE / NW fully, peeking in SE / SW).
- In NE / NW (back views) where the visor/face isn't visible, paint helm seams and rivet patterns so the helm reads as a helm, not a smooth egg.

### 15.4 Animation Sheet Catalog

Horizontal-strip PNG files, one per animation, one per facing. Each frame 64 × 64. Frame 0 leftmost, read left-to-right. Transparent background, tightly packed (no frame gaps).

File naming: `{champ}_{animation}_{facing}.png` where `{champ}` ∈ `{knight, mage, heretic}`, `{facing}` ∈ `{se, sw, ne, nw}`.

| Sheet | Frames | Type | Notes |
|-------|--------|------|-------|
| `{champ}_idle_{facing}.png` | 4 | Loop | Subtle breathing. 1 px chest rise/fall. |
| `{champ}_walk_{facing}.png` | 6 | Loop | Class-weighted march. Knight heavy, Mage gliding, Heretic stalking. |
| `{champ}_attack_{facing}.png` | 5 | One-shot | Hit resolves on frame index 3. Ends on 4, returns to idle. |
| `{champ}_hit_{facing}.png` | 3 | One-shot | Recoil + recover. White tint applied by ColorMatrixFilter at runtime — DO NOT paint a white flash. |
| `{champ}_death_{facing}.png` | 4 | One-shot | Collapse. Holds on frame index 3. Desaturation by ColorMatrixFilter — DO NOT repaint in gray. |
| `{champ}_defend_{facing}.png` | 2 | Held | Frame 0 raise, frame 1 braced. Parks on frame 1 for duration. |
| `{champ}_cast_{facing}.png` (Mage) or `{champ}_channel_{facing}.png` (Heretic) | 4 | One-shot | Ability activation. Knight does NOT ship this — ability telegraphs reuse `attack`. |
| `{champ}_kneel_{facing}.png` | 4 | One-shot | Surrender. Weapon drops at the side on frame 2. Holds on frame 3 for the 3-second Coward's Brand. |

**Total sheet count at full 4-facing:**

- Knight: 7 animations × 4 facings = **28 sheets**.
- Mage: 8 animations × 4 facings = **32 sheets**.
- Heretic: 8 animations × 4 facings = **32 sheets**.
- **Grand total: 92 champion sprite sheets.**

### 15.5 Frame Timings (baked into engine, not into sprite)

Useful for timing wind-ups and follow-throughs in the sprite. Engine plays at:

- Idle: 200 ms / frame
- Walk: 120 ms / frame
- Attack: 80 ms / frame (fast snap)
- Hit: 60 ms / frame
- Death: 150 ms / frame; hold last
- Defend: 100 ms transition; hold frame 1 indefinitely
- Cast / Channel: 120 ms / frame
- Kneel: 180 ms / frame; hold frame 3 for 3 s

### 15.6 Reference

Full anatomy per champion (part-by-part pixel specification, palette bins, silhouette sanity check) lives in `ART_SPEC.md` §5 + §7. ART_SPEC v2 will add per-facing anatomy notes for SW / NE / NW (the reinterpretations of §5's SE-default anatomy).

---

## 16. Art Direction — VFX, HUD, Portraits, Icons, Logo

Everything visual that isn't terrain or champions. One line per item; anatomy in ART_SPEC.

### 16.1 Ability VFX Sprites

Transparent PNG, center anchor unless noted. File name: `vfx_<effect>.png`.

| File | Canvas | Frames | Use |
|------|--------|--------|-----|
| `vfx_slash_arc.png` | 64 × 32 | 3 | Knight basic attack + Vanguard Charge hit |
| `vfx_shield_wall.png` | 64 × 64 | 1 (bottom-center anchor) | Held in front of Knight while Shield Wall active |
| `vfx_charge_dust.png` | 32 × 32 | 4 (bottom-center anchor) | Behind Knight during Vanguard Charge |
| `vfx_cinder_bolt.png` | 32 × 32 | 4 | Mage Cinder Bolt projectile |
| `vfx_ash_cloud.png` | 96 × 96 | 1 (engine-rotated + pulsed) | Ash Cloud overlay |
| `vfx_blink_flash.png` | 48 × 48 | 2 | F0 implosion at origin, F1 explosion at destination |
| `vfx_blood_orb.png` | 16 × 16 | 3 | Blood Tithe sacrifice droplet |
| `vfx_hex_rune.png` | 48 × 48 | 1 | Trap rune on placement (engine-fades, then hidden) |
| `vfx_hex_explode.png` | 64 × 64 | 3 | Trap trigger burst |
| `vfx_desecrate.png` | 96 × 96 | 1 (engine-pulsed) | Corruption vein overlay on 2×2 |
| `vfx_iron_stance.png` | 48 × 48 | 1 (bottom-center anchor) | Golden aura at Knight's feet while active |
| `vfx_hit_sparks.png` | 32 × 32 | 3 | Impact sparks after every attack |

**12 VFX files total.** Engine handles alpha fading, rotation, pulsing, scaling — deliver full-opacity static frames, no pre-baked fades.

### 16.2 Battlefield Pickups

32 × 32 PNG each. No animation (engine pulses alpha/scale at render).

- `pickup_health_flask.png` — ornate glass vial, blood-red liquid, metal-banded neck.
- `pickup_energy_crystal.png` — sharp-cut Magic-violet gem, faintly self-lit.
- `pickup_scroll_of_sight.png` — rolled parchment, gold cord, eye sigil.
- `pickup_chest.png` — dark iron-banded wooden chest with skull-motif lock.

**4 pickup files total.**

### 16.3 Perk Icons

32 × 32 PNG each, dark-framed (paint a subtle dark circle/banner behind the motif — icons are not floating on transparent). One focal motif per icon. No text in the icon; pixel-font text is rendered separately at runtime.

All 16 perks per §8.2: Bloodlust, Second Wind, Scout's Eye, Energy Surge, Thick Skin, Ghost Step, Trap Sense, Ash Walker, First Strike, Last Stand, Mist Cloak, Fortify, Long Reach, Pillager, Counterspell, Vampiric Touch.

**16 perk-icon files total.**

### 16.4 Ability Slot Icons

32 × 32 PNG each, shown in the match HUD action bar. Motif grammar per class: Knight = geometric/heraldic, Mage = astral/arcane, Heretic = organic/gore.

- Knight: `ability_knight_shield_wall.png`, `ability_knight_vanguard_charge.png`, `ability_knight_iron_stance.png`.
- Mage: `ability_mage_cinder_bolt.png`, `ability_mage_ash_cloud.png`, `ability_mage_blink.png`.
- Heretic: `ability_heretic_blood_tithe.png`, `ability_heretic_hex_trap.png`, `ability_heretic_desecrate.png`.

**9 ability-icon files total.**

### 16.5 Portraits

80 × 80 PNG head-and-shoulders composition at higher detail than the 64 × 64 sprites. Class-specific dimmed radial background. 2 px gothic-gold pointed-arch frame baked into the PNG edge — HUD does not re-frame.

Per champion, three variants:

- `portrait_{champ}.png` — base.
- `portrait_{champ}_dim.png` — desaturated + 30 % darker, for eliminated-player bracket slots.
- `portrait_{champ}_cracked.png` — shattered-glass overlay for the Coward's Brand (§8.5).

**9 portrait files total** (3 champs × 3 variants).

### 16.6 HUD Widgets

Transparent PNG, composited by PixiJS. Positions placed by code.

- `hud_energy_pip_filled.png` (12 × 12), `hud_energy_pip_empty.png` (12 × 12) — up to 6 in a row.
- `hud_turn_banner.png` (128 × 32) "YOUR TURN" gold-ink gothic; `hud_enemy_turn_banner.png` dimmer variant.
- `hud_timer_frame.png` (48 × 16) stone-inset bracket; countdown digits rendered with pixel-font at runtime.
- `cursor_select.png`, `cursor_attack.png`, `cursor_move.png`, `cursor_ability.png` (64 × 32 diamond overlays) — gold / red / cold-blue / violet respectively.
- Status icons (16 × 16 each): `status_defending.png`, `status_shield_wall.png`, `status_iron_stance.png`, `status_revealed.png`, `status_stunned.png`.

**~13 HUD files total.**

### 16.7 Title Logo

`logo_dark_council_tactic.png` — 512 × 128, "DARK COUNCIL TACTIC" in gothic pixel blackletter. Gold ink `#bba040`, 1 px `#1a1a20` outline, 1 px `#0a0a15` drop shadow. Distressed letterforms — looks forged, not typed.

**1 logo file.**

### 16.8 Pixel Font

Single pixel-art gothic font (e.g. "m5x7", "Pixeled", or similar public-domain) embedded at runtime. Engineering picks and embeds. Sprite artist does NOT deliver a font.

### 16.9 Asset Totals (visual)

Rough count of what ships at v2.0 submission, pre-audio:

- Champion sprite sheets: **92**
- Terrain tiles: **10** (renderer stacks for height)
- Ability VFX: **12**
- Pickups: **4**
- Perk icons: **16**
- Ability slot icons: **9**
- Portraits: **9**
- HUD widgets: **13**
- Title logo: **1**

**~166 PNG files total.** Refer to ART_SPEC v2 §14.9 batch delivery (forthcoming) for sequencing.

---

## 17. Audio Direction

Silence is scarier than noise. The soundtrack is minimal and oppressive; the SFX is sharp and physical.

### 17.1 Philosophy

Ambient: low wind, distant thunder, crackling embers. Oppressive, never busy.

Combat SFX: metallic clash (Knight), arcane whoosh (Mage), wet corruption squelch (Heretic). Sharp attack envelopes — snappy, tactical, not cinematic.

UI SFX: stone-on-stone click for menu interactions. Deep bell toll for turn start and surrender.

Music: slow droning cello or choir hum during matches. Long holds. Silence is the default — music fills the air only when the tension calls for it.

### 17.2 Music Tracks (jam minimum: 6)

1. **Main menu / lobby.** Slow brooding ambient, low strings, distant choir. ~2 min loop.
2. **Combat — early turns.** Tense, minimal, sparse percussion, droning cello. ~90 BPM. Loop.
3. **Combat — late / low HP.** Intensifies: faster tempo, more percussion, dissonant strings. Triggered when either player drops below 30 % HP. Loop.
4. **Perk draft / bracket.** Brief atmospheric sting, 10–15 s.
5. **Victory.** Dark triumphant brass swell, 5–10 s.
6. **Defeat / surrender.** Mournful. Single low bell, fading strings, 5–8 s.

### 17.3 SFX Catalog (jam minimum)

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

### 17.4 Tooling

Music: Beatoven.ai primary (game-dev loop-aware). Backup: aimusic.so for pre-made dark-fantasy placeholders.

SFX: SoundsGen and Freesound.org under permissive licenses.

### 17.5 Audio Delivery

- Music: `.ogg`, 44.1 kHz, stereo. Naming: `music_<purpose>.ogg` (e.g. `music_combat.ogg`, `music_victory.ogg`).
- SFX: `.ogg`, 44.1 kHz, mono. Naming: `sfx_<action>.ogg` (e.g. `sfx_sword_clash.ogg`, `sfx_bell_toll.ogg`).
- All audio files live in `public/audio/` only.

### 17.6 Audio Surface

`src/client/audio/SoundManager.ts` is the ONLY thing that plays audio. No `new Audio()` calls, no `<audio>` tags, no PixiJS sound plugin direct calls elsewhere in the client. If a scene needs a new cue, it asks `SoundManager`.

---

## 18. Production Pipeline

### 18.1 Asset Creation Workflow

**Champion sprites.** Designer agent (ChatGPT or similar) generates initial 1× PNG drafts following ART_SPEC. Fernando reviews at 1×, 3×, 4× zoom. If approved, Kai imports into `public/sprites/champions/`. If rejected, designer iterates on the existing PNG — do not start from scratch. Every sprite may receive a polish pass in Aseprite before shipping (hand-edit pixels, palette verification, clean-up).

**Terrain tiles.** Drawn directly in Aseprite using the palette in §14.2. One 64 × 60 PNG per terrain type (the renderer stacks for height). The per-tile hash-seeded variation happens at runtime via `pixelArt.ts` — don't ship N variants per type.

**VFX.** Designer agent for initial drafts, Aseprite for polish. No pre-baked fades or rotations — engine handles those.

**HUD, portraits, icons, logo.** Aseprite direct. Portraits and the logo are Hero Moments (§2.2) — disproportionate time budget.

**Music.** Beatoven.ai generates loops. `.ogg` export, 44.1 kHz, stereo. Short sanity-check pass for loop seam artifacts before committing.

**SFX.** Freesound / SoundsGen search, crop to one-shot, normalize, `.ogg` export at 44.1 kHz mono.

### 18.2 Batch Delivery (tied to milestones)

Art arrives in batches gated by milestone. Each batch reviewed by Fernando as a set — partial batches don't ship.

- **Batch 1 (M8):** All 10 terrain tile types. Nothing else.
- **Batch 2 (M9):** All 92 champion sheets + all 12 VFX. This is the art-work mountain — spec'd carefully, iterated aggressively per §18.3.
- **Batch 3 (M9 polish):** 5 status icons; damage-number styling confirmation.
- **Batch 4 (M10):** 16 perk icons + 9 ability icons.
- **Batch 5 (M11):** 4 pickup sprites.
- **Batch 6 (M12):** 9 portrait files (3 base + 3 dim + 3 cracked).
- **Batch 7 (M13):** HUD widgets (13 files) + title logo (1).

Audio batches interleave with M13 scope (all music and SFX land before submission; no audio in M8–M12 visual work).

### 18.3 Iteration Protocol

1. Agent reads ART_SPEC end to end plus the subsection for the asset being produced.
2. Agent produces **one asset** (or a tightly scoped batch, e.g. "Knight idle SE only") at 1× PNG. Agent runs ART_SPEC §15 QA checklist internally.
3. Agent delivers the PNG plus a one-paragraph note: distinct color count, any palette additions beyond §14.2 (with justification), any spec ambiguities resolved by judgment call.
4. Fernando reviews at 1×, 3×, 4×. Approves, rejects, or requests changes.
5. If changes requested: agent iterates on the existing file, does NOT start from scratch. Preserve what worked.
6. On approval: Kai commits to `public/sprites/` in the repo and marks done in the batch tracker (§18.2).

**Do NOT produce speculative variants.** One careful, spec-compliant version at a time. Iteration quality beats volume.

### 18.4 Handoff Chain

Designer agent (ChatGPT) ↔ Fernando (art director, final approval) ↔ Kai (commits to repo, maintains ART_SPEC, raises engineering concerns if an asset won't render).

Three-way conversation lives in chat, not in git. The git history records the outcome: commits to `public/sprites/`, updates to ART_SPEC. Scratchpad discussion stays out of the repo root (per §13.5 trap list).

### 18.5 Hero Moments — Where Polish Earns The Game Its Wow

Not all ~166 assets get the same attention. These are the five moments judges, streamers, and first-time players will screenshot. Spend disproportionate time on them.

1. **Title screen / logo reveal.** First frame anyone sees. The logo must look forged, not typed.
2. **Bracket view.** 8 portraits, some in `_dim` variant. The "who are the Dark Council" reveal.
3. **Perk draft.** 3 cards side-by-side with 32 × 32 icons. The roguelite identity beat.
4. **The Kneel / Coward's Brand.** The `kneel` animation's final held frame + `portrait_{champ}_cracked.png` overlay. The game's most emotionally loaded frame.
5. **Match-end victory pose.** Winning champion's idle over the losing champion's held death frame on a desaturated grid.

If something has to be "pretty good" instead of great, let it be a mid-match idle frame, not one of these five. Secondary hero moments (less screenshot-able): arena pillars silhouetted against sky, the Heretic's Desecrate sweep across tiles, the Mage's Blink implosion/explosion timing, the Knight's Vanguard Charge dust trail. Don't phone those in either.

### 18.6 Forbidden Tools

- **No 3D generators** (Meshy, Kaedim, etc.). DCT is 2D pixel art.
- **No bulk-generate-many-variants workflows.** One asset at a time, reviewed, iterated. AI pixel-art speculation produces 200 colors across 20 sprites.
- **No partial-alpha "pixel art"** — AI tools that output soft-edged high-res "pixel art" fail ART_SPEC QA at 4× zoom. Every pixel must be a single solid color.

---

*SPEC v2.0 Parts I–IV — draft 2026-04-22. Part V (glossary + decision log + appendix) forthcoming. `SPEC.md` v1.4 remains authoritative until v2.0 is complete and the swap PR lands.*
— Kai
