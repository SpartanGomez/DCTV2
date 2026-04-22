# Dark Council Tactic — Art & Sprite Design Spec

**Status:** Authoritative art brief. Pair document to `SPEC.md`.
**Audience:** The AI sprite/art agent (ChatGPT or equivalent image-gen agent), plus any human pixel artist taking a polish pass in Aseprite.
**Owner:** Fernando Gomez (art director + final approval on every asset)
**Version:** 1.3 (2026-04-20)

---

## 0. How to Read This

This document is the *only* art spec. Every sprite, tile, icon, VFX frame, HUD element, portrait, and UI widget the game ships is enumerated here with its canvas size, frame count, palette, and the visual rules it must obey.

If you are the sprite-generating AI: read this end to end before producing a single asset. Then, when you sit down to generate asset X, re-read the subsection for X plus §2 (Aesthetic) and §3 (Palette) each time. Do not skip — consistency across ~80 assets is what separates this game from a hobby jam.

If something here contradicts `SPEC.md` §21–§22, `SPEC.md` wins and this file is wrong — flag it.

If something here is ambiguous, ask Fernando before generating. Do not invent a visual direction.

---

## 1. The One-Line Brief

Final Fantasy Tactics (PS1 1997) combat aesthetic, wearing Diablo I's palette, posed at Dark Souls' level of gravitas. Browser-based tactical 1v1 on a dark fantasy isometric grid. Every pixel carries weight. Nothing is cheerful.

---

## 2. Aesthetic Target & Anti-Targets

### 2.1 Target references

| Reference | What to steal from it |
|-----------|----------------------|
| Final Fantasy Tactics (PS1, 1997) | Isometric tile geometry, character silhouette density, armor layering, battle poses, ability VFX arcs. |
| Diablo I (1996) | Palette darkness, gothic grimness, blood/rust tonality, no saturation. |
| Tactics Ogre: Let Us Cling to Together (SNES/PSP) | Class identity through silhouette, mage/warrior differentiation. |
| Dark Souls (for mood only, not pixel style) | Weight, heaviness, posed character readability, "the knight has been fighting for 200 years." |
| Vagrant Story | Armor detail density at small sprite scales. |

### 2.2 Anti-targets — do NOT look like these

- **Stardew Valley / modern cozy pixel art.** Too saturated, too friendly, rounded silhouettes, warm lighting. Wrong.
- **Hyper Light Drifter / cute indie pastel.** Beautiful game, wrong genre for us.
- **NES / 8-bit.** Too crude. We are not retro for retro's sake.
- **Anime / chibi proportions.** Big heads on small bodies. Never.
- **Modern stylized/flat-vector pixel art.** The hard-edge, posterized look popular in 2020s indies. We want hand-painted depth, not graphic-design posterization.
- **Default Aseprite presets / default-palette art.** Tells us you didn't bother.

### 2.3 Tone adjectives (stick these on the wall)

Ashen. Cold. Heavy. Gothic. Ritual. Mortuary. Low-torchlight. Blood-iron. Oppressive. Silent. Every champion looks like they have already killed many people.

### 2.4 Tone adjectives to AVOID

Bright. Cheerful. Round. Cute. Cartoony. Saturated. Glowy-magical-girl. High-fantasy-heroic. Clean. Polished-plastic. Friendly.

---

## 3. Palette (strict)

Every color in every sprite lives on or adjacent to this palette. No off-palette drift. If a sprite absolutely needs a new shade that isn't here, add it to this table *first*, not in the sprite.

### 3.1 Core palette

| Role | Primary | Shadow | Highlight |
|------|---------|--------|-----------|
| Stone / metal | `#5a5a68` | `#3a3a48` | `#7a7a8a` |
| Cold highlight | `#aaaacc` | — | `#ccccdd` (never pure white) |
| Earth | `#3a2a1a` | `#2a1a0a` | `#5a4a3a` |
| Blood / ember | `#8b0000` | `#5a0000` | `#cc2222` |
| Fire accent | `#ff6600` | `#cc4400` | `#ffaa44` |
| Magic (violet) | `#6633aa` | `#4a2288` | `#8866ff` |
| Pale arcane (blue) | `#88aaff` | `#5577cc` | `#aaccff` |
| Arcane cloth (mage robe) | `#2a2a5a` | `#1a1a38` | `#4466cc` |
| Gold trim | `#bba040` | `#886a20` | `#ddc060` |
| Background | `#0a0a15` | `#0e1020` | — |

### 3.2 Hard rules

- **Never pure white** `#ffffff`. Brightest "white" we use is `#ccccdd` (cold highlight).
- **Never fully-saturated RGB primaries** (`#ff0000`, `#00ff00`, `#0000ff`). Red is always rusted or bloody.
- **Never pastels.** If it looks like candy, it's wrong.
- **16–24 colors per individual sprite.** Don't paint with a 256-color rainbow.
- **Dark outline.** Every character/prop sprite has a 1px dark outline in `#1a1a20` (or darker) for readability against the dark terrain.
- **Near-black** `#0a0a15` is the canvas background color when we render test frames. Transparent PNG for delivery.

### 3.3 Quick palette check

Open your sprite, pick 10 random pixels, verify each one is within ±4 of a palette cell in RGB distance. If more than two are drift, the sprite fails palette QA.

---

## 4. Canvas, Grid, and Scale

The game is pixel-art at 1× (no upscaling baked into the art — the engine handles the 3–4× display zoom with `image-rendering: pixelated`). All sprites are authored at the native 1× resolution below.

### 4.1 Isometric tile

- **Tile top face:** 64 × 32 diamond (the standard FFT ratio).
- **Tile visible depth below top face:** 28 px (the side face the player sees, shaded darker than the top).
- **Tile full canvas for export:** 64 × 60 PNG with transparency. Diamond top painted in the upper 32 px, side face painted in the lower 28 px, seam hidden.
- **Grid:** 8 × 8 tiles. Renderer handles positioning; you only deliver one tile PNG per terrain variant.

### 4.2 Champion sprite

- **Canvas:** 64 × 64 PNG, transparent background.
- **Character body occupies:** roughly the central 24–28 px wide × 40 px tall. Weapon, hood, plume, or staff extends outside that box into the full 64 × 64 — this is why the canvas is roomy.
- **Anchor point:** center-bottom (0.5, 1.0). Feet (or hover point) touch y-rows 60–62 of the canvas.
- **Facing:** all sprites face *right* by default. Renderer mirrors horizontally for left-facing. Don't deliver mirrored versions.
- **Ground shadow:** a soft ellipse 20 × 6 px at alpha 0.3, `#0a0a15`, painted under the feet. Every pose has the shadow. The renderer does NOT add it — you bake it in.

### 4.3 VFX sprite

- Canvas sizes vary per effect — see §8. All are transparent-background PNGs. Anchor at center (0.5, 0.5) unless otherwise stated.

### 4.4 HUD & icon sprites

- Portrait: 80 × 80 PNG.
- Perk icon: 32 × 32 PNG.
- Energy pip: 12 × 12 PNG.
- Tile cursor: 64 × 32 PNG (diamond overlay).
- Turn banner: 128 × 32 PNG.
- Title logo: 512 × 128 PNG.

---

## 5. Champion Sprites

Three champions. Each must be instantly identifiable from a 32-pixel-tall silhouette with no color. That is the sanity test — paint the final sprite solid black and ask: "could I name this class?" If not, the silhouette is wrong.

Every champion has the same animation sheet set (see §7), but the Knight skips `cast.png` and the Heretic/Mage have `cast.png` / `channel.png` instead.

### 5.0 What's locked vs what's yours (read this first)

The anatomy tables below specify a reference composition — how we know the sprite will read correctly at 32-pixel-tall silhouette, line up on the iso grid, and hit the palette. They are **not** a pixel-by-pixel copy order. Think of them as a proportions diagram, not a paint-by-numbers.

**Hard locks (violating any of these breaks the game or the art direction):**
- Canvas size (64×64 champion, 64×60 tile, portrait/HUD sizes in §4).
- Anchor point (center-bottom, feet at y-rows 60–62). Depth-sort breaks if feet drift.
- Palette (§3.1). Every color on or within ±4 RGB of a palette cell. No pure white, no saturated RGB primaries.
- Silhouette identifiers. Knight = squat+plume+sword+shield. Mage = tall+hood-peak+orb-staff+hem. Heretic = hunched+horns+claws+no-weapon. If the silhouette test fails, nothing else matters.
- Light direction: upper-left across every sprite and tile.
- 1 px dark outline on characters, pickups, and VFX motifs.
- Frame counts and frame indices called out in §7 (engine depends on them).

**Your lane (designer freedom — we want flair here):**
- Exact pixel placement of armor plates, robe folds, strap patterns, sigil shapes — use the anatomy table proportions, then paint with taste.
- Pose micro-choices: exactly how the Knight's sword tilts, how the Heretic's spine curves, how the Mage's hem drifts. The notes are direction, not blueprint.
- Decorative detail: rivets, trim patterns, torn edges, hex-sigil glyphs, ritual scarification patterns on the Heretic. Invent symbols; they don't need to mean anything in-world, just look like they might.
- Weapon ornamentation: sword fuller lines, staff carvings, shield emblems beyond the spec's baseline cross.
- VFX particle shapes — the canvas/frames/palette are locked, but the exact shape language of a "cinder bolt" or "hex rune" is yours to make feel good.
- Walk-cycle weight distribution, attack follow-through, death collapse character — aim at the class's core feeling (Knight heavy, Mage gliding, Heretic predatory).
- Environmental grunge on terrain: moss distribution, crack direction, ember placement — ours is a "handful of seeds" approach, not a strict count.

**When in doubt, push toward darker, heavier, more ritualistic.** The anti-examples in §2.2 are the failure modes we've seen AI sprite agents drift toward.

### 5.1 The Ashen Knight

**One-line:** A walking tank in grim plate, greatsword in one hand, kite shield in the other, crimson plume on the helm. Stocky, square-shouldered, grounded. The honest fighter.

**Silhouette identifiers (highest priority):**
1. Squat, wide silhouette — widest across the pauldrons.
2. Crimson plume sticking up from the helmet peak — the one warm color on the figure.
3. Sword held to the side, blade extending well above the head.
4. Kite shield on the left arm.

**Anatomy, bottom-up (64×64 canvas, idle pose):**

| Part | Size | Position (approx) | Palette |
|------|------|-------------------|---------|
| Ground shadow | 20 × 6 ellipse | y 60, x centered | `#0a0a15` @ 0.3 alpha |
| Boots | 2 × 4 each, feet apart ~4 px | y 56–60 | Stone/metal shadow `#3a3a48` |
| Legs | 3 × 6 each | y 50–56 | Stone/metal `#5a5a6a` with 1 px horizontal knee-joint darker line |
| Torso (breastplate) | 8 × 8 | y 42–50, x centered | Stone/metal `#5a5a6a`, center vertical seam, gold trim pixels `#bba040` at corners |
| Pauldrons | 3 × 3 bulges each side | y 42–45, x at torso edges | Stone/metal highlight `#7a7a8a` |
| Cape / tabard behind | 3 × 4 | y 44–48, behind right shoulder | Earth shadow `#2a1a0a` or stone-shadow `#3a3a48` |
| Head (great helm) | 6 × 6 | y 36–42 | Stone/metal `#5a5a6a` with T-slit visor in `#1a1a20` |
| Visor glow | 2 × 2 dot inside the slit | y 38–40 | Blood/ember `#cc2222` (faint) |
| Plume | 2 × 3 | y 33–36, on top of helm | Blood/ember `#cc2222` with `#8b0000` shadow pixels at the base — no brighter red highlight, keep it grim |
| Sword (right hand) | 2 wide × 12 tall blade | y 24–36 behind hand, extending up | Blade cold-highlight `#ccccdd` with `#aaaacc` mid, `#7a7a8a` shadow edge |
| Sword crossguard | 4 × 1 horizontal | y 36 | Gold trim `#bba040` |
| Sword pommel | 1 × 1 | y 37 | Gold trim highlight `#ddc060` |
| Shield (left arm) | 4 × 7 kite | y 42–49, x left of torso | Stone/metal `#5a5a6a` with gold cross `#bba040` |
| Outline (the whole silhouette) | 1 px | — | `#1a1a20` |

**Palette count target:** 16–18 colors.

**Idle-frame pose notes:** square stance, weight centered, sword point tilted ~5° off vertical (not perfectly straight — adds life), shield slightly forward. Breathing rise-fall is 1 px of chest movement over 4 frames.

### 5.2 The Pale Mage

**One-line:** Tall, gaunt, hooded figure in midnight-blue robes, bone-pale hands, violet orb floating at the top of a wooden staff. No visible face — just two pale eye dots. Reads as "cloaked sorcerer."

**Silhouette identifiers:**
1. Tall, thin, triangular silhouette (widest at robe hem, narrowing to a pointed hood).
2. Pointed hood peak — a sharp apex at the top of the figure.
3. Glowing orb on a staff, floating above head-level off to one side.
4. Floor-length robe, hem irregular/tattered.

**Anatomy, bottom-up:**

| Part | Size | Position | Palette |
|------|------|----------|---------|
| Ground shadow | 20 × 6 ellipse | y 60 | `#0a0a15` @ 0.3 |
| Feet (pointed slippers) | 2 × 2 each | y 58–60 | Arcane cloth shadow `#1a1a38` |
| Robe hem | 10 wide at y 58, tapering to 6 wide at y 42 | y 42–58 | Arcane cloth primary `#2a2a5a` with `#1a1a38` inner folds |
| Robe fold lines | 2–3 × 1 px horizontal | across torso, y 48, 52, 56 | Arcane cloth shadow `#1a1a38` |
| Tattered hem | irregular | y 58 bottom edge | 1 px `#1a1a38` teeth (not a straight line) |
| Hands | 2 × 3 each, pale | y 45–48 | Cold-highlight `#aaaacc` (bone-pale) |
| Torso rune | 2 × 2 small cluster | y 48, front of robe | Arcane cloth highlight `#4466cc` |
| Hood base | 5 × 3 at shoulders | y 35–38 | Arcane cloth `#2a2a5a` |
| Hood peak | narrowing to 1-wide point | y 30 | Arcane cloth shadow `#1a1a38` |
| Hood inner shadow | 2 × 2 where face would be | y 36–38 | `#0a0a15` |
| Eyes (inside hood shadow) | 1 × 1 each, 2 px apart | y 37 | Pale arcane primary `#88aaff` |
| Staff pole | 1 × 14 vertical | y 28–42, right hand | Earth `#6a5a3a` with 1 darker pixel shadow on the right edge |
| Staff orb (4 × 4) | at the top of the staff | y 24–28 | See rules below |
| Orb aura (2 px radius soft glow) | around orb | y 22–30 | Magic highlight `#8866ff` @ 0.5 alpha |
| Outline | 1 px | — | `#1a1a20` |

**Staff orb rules:**
- 4 × 4 pixel square core.
- Bottom-right 2 × 2 quadrant: Magic primary `#6633aa`.
- Upper-left 2 × 2 quadrant: Magic highlight `#8866ff` (internal glow).
- One specular pixel (1 × 1) in the top-left of the bright quadrant: cold-highlight `#ccccdd`. (Not pure white. Cold highlight.)
- 2 px soft aura ring around the orb, Magic highlight `#8866ff` at 0.5 alpha.

**Palette count target:** 14–16 colors.

**Idle pose notes:** robe subtly sways — 1 px lateral drift at the hem across 4 frames. The staff is still. The orb pulses slightly (1-pixel size breathing).

### 5.3 The Heretic

**One-line:** Hunched, horned warlock in blood-rust rags and bone gauntlets. Feral red eyes, ritual sigils burned into the chest. No weapon — the hands ARE the weapon. Predatory silhouette, asymmetric and wrong.

**Silhouette identifiers:**
1. Hunched — shoulders forward, head lower than pauldron-equivalent line.
2. Two curved horns extending up and outward from the skull.
3. Asymmetric ragged strips of cloth hanging from the waist.
4. No weapon silhouette — hands end in clawed bone fingers.

**Anatomy:**

| Part | Size | Position | Palette |
|------|------|----------|---------|
| Ground shadow | 20 × 6 ellipse | y 60 | `#0a0a15` @ 0.3 |
| Boots | 2 × 3 each, slightly pointed | y 56–59 | Earth shadow `#2a1a0a` |
| Legs | 3 × 6 each, wrapped with strap pattern | y 50–56 | Alternating `#2a1a1a` and `#1a0a0a` pixels (strap stripes) |
| Waist rags | 4–6 irregular strips dropping to y 56 | y 50–56, hip area | Blood shadow `#5a0000` |
| Torso | 7 × 7, tilted forward ~3 px | y 43–50 | Blood shadow `#5a0000` with darker pixel noise |
| Ribcage highlights | 2–3 × 1 px horizontal | y 45, 47, 49 | Blood primary `#8b0000` |
| Ritual sigils | 2–3 stacked 1-px dots | y 46, chest center | Blood/ember highlight `#cc2222` (glowing) |
| Arms | 2 × 5 each, hunched forward | y 43–48 | Arms are `#2a1a1a` going to `#5a3a3a` at gauntlet |
| Bone gauntlets / claws | 3 × 2 each, with 2–3 px claw extensions | y 47–50 | Earth highlight `#5a4a3a` for bone (not pure white) |
| Head | 5 × 5, low-jutting | y 38–43 | `#2a1a1a` |
| Horns | 3 × 3 each, curving up-and-out from skull | y 33–38 | Blood shadow `#5a0000` going to `#8b0000` |
| Eyes | 2 × 1 each, 2 px apart | y 40 | Blood ember `#cc2222` brighter than visor glow on Knight |
| Outline | 1 px | — | `#1a1a20` |

**Palette count target:** 14–16 colors.

**Idle pose notes:** subtle forward rock — the hunch deepens and eases over 4 frames, 1–2 px range. Fingers twitch (1 px claw movement) on frames 2 and 4.

### 5.4 Class differentiation sanity check

Stand all three idle frames next to each other at 1× (64 px tall each). They should read, from left to right:

- **Widest** silhouette (Knight), **tallest** silhouette (Mage), **most asymmetric** silhouette (Heretic).
- **Warmest** color spike (Knight's red plume), **coolest** (Mage's blue-violet robe and orb), **dirtiest** (Heretic's rust-red).
- **Metal-heavy** (Knight), **cloth-heavy** (Mage), **flesh-and-bone** (Heretic).

If you squint and can't tell them apart, the sprites fail.

---

## 6. Terrain Tiles

8 × 8 arena. Seven gameplay categories, 10 distinct tile PNGs (Hazard has 3 visual variants, Pillar/Wall are 2). Each tile is 64 × 60 (top face + side face).

### 6.1 General rules

- **Top face (upper 32 px):** the walkable surface. Always painted in the tile's material.
- **Side face (lower 28 px):** the same material, 30–40% darker, with 1–2 horizontal seam lines suggesting stacked stone layers.
- **Upper-left edge of the diamond top:** 1 px bright highlight.
- **Lower-right edge of the diamond top:** 1 px dark shadow line.
- **Per-tile variation via hash.** A hash of `(x, y)` drives cosmetic detail placement (moss tufts, cracks, ember dots) so adjacent tiles don't duplicate. You deliver ONE PNG per terrain type; the engine varies placement at render with a hash. If you need N variants for a terrain, say so — default is one per type.
- **No animation** on terrain (we handle pulses and shimmer at render time with filters).

### 6.2 Stone (`tile_stone.png`)

Warm gray-brown base `#4a4550`. Visible masonry: 2–3 horizontal mortar lines 1 px wide, slightly lighter than the base, spanning the diamond. Add 1–2 vertical mortar lines offset per row forming a brick-bond pattern. Occasional moss accent: 2–3 px green-brown `#3a4a30` dots in one corner of a random block. Occasional crack: 1 px diagonal `#2a2025` across one block on ~25% of tiles. 1 px slightly-lighter highlight on the upper-left edge of each block.

### 6.3 High Ground (`tile_high_ground.png`)

Sandy/earthy top face with horizontal grain (tiny 1 px streaks). Base `#5a4a3a`. Small grass tuft clusters along the diamond edges: 2–3 px green `#4a6a3a`. Raised feel: a 1 px bright `#7a6a4a` edge along the upper-left diamond edges. Side face is 40% darker with exposed earth texture.

### 6.4 Rubble (`tile_rubble.png`)

Chaos of broken stone chunks. 3–5 small irregular 4–8 px polygon shapes scattered across the face. Each chunk: upper-left highlight edge (1 px `#7a7a8a`), lower-right shadow edge (1 px `#2a2028`). Gravel base `#3a3a48` with many tiny 1 px darker noise dots. Darker overall than Stone — reads as destroyed masonry.

### 6.5 Hazard — Fire (`tile_hazard_fire.png`)

Charred dark base (`#2a1a14`). 5–8 bright ember dots scattered — mix of Fire accent primary `#ff6600`, highlight `#ffaa44`, and shadow `#cc4400`. 2–3 tiny flame triangles (3 px tall, pointed up) at random positions, colored `#ff6600` with a `#ffaa44` highlight pixel at the tip.

### 6.6 Hazard — Acid (`tile_hazard_acid.png`)

Dark bile-green base (`#1a2a1a`). 3–4 bubbling circles (3–4 px diameter) in sickly green `#4aaa3a` primary with `#2a5a1a` shadow. 1–2 small 1 px cold-highlight `#ccccdd` dots on each bubble for wet-shine. (Acid is the one place we use a green that isn't on the core palette — add the two greens to your working palette when painting this tile.)

### 6.7 Hazard — Void (`tile_hazard_void.png`)

Deep purple-black base (`#15101a`). 2–3 curved swirling lines radiating from the tile center in Magic shadow `#4a2288`, 1 px wide. One faint Magic-primary `#6633aa` highlight dot at the swirl terminus.

### 6.8 Pillar (`tile_pillar.png`)

Stone column centered on the diamond — a vertical rectangle (8 × 28 px) rising from the top face. Top cap lighter (`#7a7a8a`), side panels darker (`#3a3a48`). 2–3 horizontal 1 px mortar lines on the front face suggesting stacked stone blocks. Impassable feel — obviously a wall, not a step-up.

### 6.9 Wall (`tile_wall.png`)

Similar to Pillar but full-tile-width. A solid dark stone block 24 × 28 rising from the top face. Horizontal mortar banding every 6 px.

### 6.10 Shadow Tile (`tile_shadow.png`)

Very dark purple-black base `#0e0e1e`. 2–3 curved thin wispy lines in slightly lighter purple `#1a1a3a`, suggesting smoke or shadow fabric. One occasional 1 px high-alpha `#ccccdd` shimmer pixel (hash-placed).

### 6.11 Corrupted (`tile_corrupted.png`)

Dark red-black base `#3a1a1a`. 3–4 branching vein lines radiating from the tile center in `#8b0000` (at ~50% alpha baked into the sprite). Some veins end in a 1-px highlight pulse `#cc2222`. Reads as "the ground itself is wounded."

---

## 7. Champion Animation Sheets

Horizontal-strip PNGs, one per animation. Each frame is 64 × 64. Frame 0 is the leftmost, read left-to-right. Transparent background. No frame gaps (tightly packed).

File naming: `{champ}_{animation}.png` where `{champ}` is `knight`, `mage`, or `heretic`.

| Sheet | Frames | Loop? | Purpose | Hold frame? |
|-------|--------|-------|---------|-------------|
| `{champ}_idle.png` | 4 | Yes | Breathing / hover / stance | Loops 0→3→0 |
| `{champ}_walk.png` | 6 | Yes | March cycle | Loops 0→5→0 |
| `{champ}_attack.png` | 5 | No | Wind-up → strike → recovery. Hit resolves on frame 3 (animation-time, not damage-time — damage is server-dictated). | Ends on frame 4, returns to idle |
| `{champ}_hit.png` | 3 | No | Recoil + recover. Renderer applies a white ColorMatrixFilter tint on frame 1 — you do NOT paint the hit flash yourself. | Returns to idle on frame 2 |
| `{champ}_death.png` | 4 | No | Collapse / dissolve. Renderer desaturates via ColorMatrixFilter — you do NOT repaint death in grayscale. Just the motion. | Holds on frame 3 |
| `{champ}_defend.png` | 2 | No | Held pose while Defend/Shield Wall status active. Frame 0: raise shield. Frame 1: braced. | Holds on frame 1 |
| `{champ}_cast.png` (Mage) / `{champ}_channel.png` (Heretic) | 4 | No | Ability activation. Mage: staff raised, orb glow intensifies. Heretic: arms raised, sigils brighten. Knight does NOT ship this — Knight ability telegraphs reuse `attack.png`. | Returns to idle on frame 3 |
| `{champ}_kneel.png` | 4 | No | Surrender sequence. Champion drops to one knee, weapon (if any) falls at the side on frame 2. | Holds on frame 3 |

### 7.1 Per-animation pose notes

**Idle (4 frames).** Subtle breathing. 1 px vertical chest rise/fall. For the Mage, also add a 1 px sideways robe sway. For the Heretic, the hunch deepens and eases. Knight's plume drifts 1 px. Don't overdo it.

**Walk (6 frames).** Full leg cycle. Knight's walk is heavy, grounded, weapon stays close to the body. Mage's walk "floats" — the robe hem doesn't flex as much as it drifts (almost gliding). Heretic walks hunched, deliberate, predatory — one step at a time, low.

**Attack (5 frames).**
- Knight: wind-up with sword back over shoulder → step forward → downward slash → follow-through → return. Sword blade visibly moves across the canvas.
- Mage: (uses `cast.png` for abilities; `attack.png` is the basic 3-damage poke — extend hand with orb flare, snap back).
- Heretic: a clawing lunge — arms fling forward with the claws tearing the air. Body leans into it.

**Hit (3 frames).** Knock back 1–2 px on frame 1, recover to roughly neutral by frame 2. Posture does not change (Knight stays upright, Mage stays hooded, Heretic stays hunched). Don't paint a white flash — the engine does that.

**Death (4 frames).** Knight collapses forward, shield falls first. Mage robes crumple straight down, staff drops. Heretic twists sideways, claws dragging. Final hold frame is the "corpse" — we don't remove the sprite, we just leave the hold frame for a beat before the renderer fades it.

**Defend (2 frames).** Knight raises shield to chest height. Mage puts staff horizontally in front of body. Heretic crosses both gauntleted arms in front of chest. Held pose — not a loop, the renderer parks on frame 1 for the full duration of the status.

**Cast / Channel (4 frames, Mage + Heretic only).** Mage raises staff overhead, orb brightens and sheds extra aura pixels on frames 2–3. Heretic raises both arms, sigils on chest brighten and pulse, horns seem to catch light on frame 3.

**Kneel (4 frames).** Universal surrender. Drop to one knee, head down, weapon (if any) falls at the side on frame 2. Frame 3 is the shame pose — held while the 3-second Coward's Brand sequence plays.

### 7.2 Frame timing (for your reference — baked into engine, not into sprite)

These are the durations the engine will play at — knowing them helps you time your wind-ups.

- Idle: 200 ms per frame
- Walk: 120 ms per frame
- Attack: 80 ms per frame (fast snap)
- Hit: 60 ms per frame
- Death: 150 ms per frame, hold last frame until cleanup
- Defend: 100 ms transition, hold frame 1 indefinitely
- Cast/Channel: 120 ms per frame
- Kneel: 180 ms per frame, hold frame 3 for 3 s

---

## 8. Ability VFX Sprites

Separate files from the champion sheets. The engine layers these over or next to the acting champion. Transparent PNG, center anchor unless stated.

Naming: `vfx_<effect>.png`.

| File | Canvas | Frames | Anchor | Description |
|------|--------|--------|--------|-------------|
| `vfx_slash_arc.png` | 64 × 32 | 3 | center | White/steel sword arc. F0 thin line, F1 full crescent, F2 fading trail. Knight basic attack + Vanguard Charge hit. Colors: blade `#ccccdd` core, `#aaaacc` mid, `#7a7a8a` outer. |
| `vfx_shield_wall.png` | 64 × 64 | 1 | bottom-center | Translucent blue-steel shield rectangle (30 × 40 px) overlaid in front of the Knight while Shield Wall is active. Runic `#8866ff` glyphs etched on the front. Rendered at ~0.5 alpha — paint it at full alpha and the engine fades it. |
| `vfx_charge_dust.png` | 32 × 32 | 4 | bottom-center | Brown-gray dust puff. Small → larger → fading. Earth palette. Spawns behind the Knight during Vanguard Charge. |
| `vfx_cinder_bolt.png` | 32 × 32 | 4 | center | Orange-yellow fireball projectile. F0 compact 6 × 6, F1 elongated with tail, F2 wider, F3 impact burst. Fire-accent palette. |
| `vfx_ash_cloud.png` | 96 × 96 | 1 | center | Dark swirling smoke mass covering a 2 × 2 tile footprint at game scale. Wispy edges, darker center. Rendered with engine-driven rotation/pulse. Grays plus a hint of Arcane-cloth violet. |
| `vfx_blink_flash.png` | 48 × 48 | 2 | center | F0 violet implosion at origin. F1 violet explosion at destination. Magic palette. Engine plays F0 at origin tile, then F1 at destination tile with a ~80 ms gap. |
| `vfx_blood_orb.png` | 16 × 16 | 3 | center | Red droplet for Blood Tithe. F0 round orb, F1 elongated teardrop, F2 dissipating splatter. Blood/ember palette. |
| `vfx_hex_rune.png` | 48 × 48 | 1 | center | Red arcane trap rune (circular sigil on ground). Flashes on placement (engine-fades), then the sprite is hidden from non-owners until triggered. Blood/ember palette with `#cc2222` outer ring and `#8b0000` inner glyphs. |
| `vfx_hex_explode.png` | 64 × 64 | 3 | center | Trap trigger burst. F0 compact burst, F1 maximum radius with rune visible, F2 sparks scattering. |
| `vfx_desecrate.png` | 96 × 96 | 1 | center | Red corruption vein overlay on a 2 × 2 tile footprint. Top-down — it overlays the tile surfaces. Engine pulses alpha over time. Blood/ember palette. |
| `vfx_iron_stance.png` | 48 × 48 | 1 | bottom-center | Golden runic aura circle around the Knight's feet while Iron Stance is active. Gold palette with a slow engine pulse. |
| `vfx_hit_sparks.png` | 32 × 32 | 3 | center | Generic impact spark burst. F0 small, F1 max expansion, F2 fade. Orange-white — Fire highlight `#ffaa44` core, cold highlight `#ccccdd` specks. Used after every successful attack. |

### 8.1 VFX style rules

- **No gradients painted pixel-by-pixel.** If you'd blend, step it — 2–3 color stops max per effect.
- **No circular anti-aliasing.** Jagged-edge pixel circles, FFT style.
- **Engine handles alpha fading and scaling** — don't pre-paint a fade; deliver full-opacity frames.
- **Engine handles rotation** for Ash Cloud and Desecrate — don't pre-rotate variants.
- **Keep each VFX under 12 colors** — they're brief and should read cleanly at all speeds.

---

## 9. Battlefield Pickups

32 × 32 PNG each, transparent background, no animation (engine pulses alpha/scale at render).

| File | Description |
|------|-------------|
| `pickup_health_flask.png` | Ornate glass vial, blood-red liquid, metal-banded neck, cork stopper. Slight glow aura in red at ~0.3 alpha behind it. |
| `pickup_energy_crystal.png` | Sharp-cut gem, Magic-violet `#6633aa` core, Magic-highlight `#8866ff` edges, cold-highlight specular. Faintly self-lit. |
| `pickup_scroll_of_sight.png` | Rolled parchment scroll, tied with gold cord, faint amber glow. A single eye sigil `#bba040` on the visible face. |
| `pickup_chest.png` | Dark iron-banded wooden chest, sealed with a skull-motif lock. Slight wood grain + metal rivets. Grim, not cartoony. |

---

## 10. Perk Icons

32 × 32 PNG each. Shown on draft cards (see §12). Icons should be readable at 24 px on smaller screens. Single focal motif per icon. No text. Dark backgrounds, not white/transparent with floating icon — paint a subtle dark-circle or dark-banner behind each motif for framing.

| Perk | Motif | Primary color | Notes |
|------|-------|---------------|-------|
| Bloodlust | Dripping red sword | Blood `#8b0000` | Blade upright, single blood drop |
| Second Wind | Green swirl arrows (recovery loop) | `#4a6a3a` | Two curved arrows chasing |
| Scout's Eye | Golden eye with radiating lines | Gold `#bba040` | Open eye, lashes as rays |
| Energy Surge | Blue lightning bolt | Pale arcane `#88aaff` | Jagged bolt on dark field |
| Thick Skin | Gray armor plate | Stone `#5a5a68` | Round shield-like plate with rivet pattern |
| Ghost Step | Faded footprint | Cold highlight `#aaaacc` | Single bare footprint, 40% alpha |
| Trap Sense | Red `!` inside triangle | Blood `#cc2222` | Triangle outlined, bang mark inside |
| Ash Walker | Orange footprint on flames | Fire `#ff6600` | Footprint on a tiny flame tongue |
| First Strike | Gold sword with speed lines | Gold `#bba040` | Angled sword, 2–3 speed streaks |
| Last Stand | Cracked red heart | Blood `#cc2222` | Heart silhouette with a fracture line |
| Mist Cloak | Purple cloak with fog wisps | Magic `#6633aa` | Hooded silhouette dissolving into wisps |
| Fortify | Stone tower | Stone `#5a5a68` | Crenellated tower silhouette |
| Long Reach | Extended arrow | Earth `#5a4a3a` | Arrow in flight, long motion trail |
| Pillager | Gold coins | Gold `#bba040` | Stack of 3 coins with glint |
| Counterspell | Purple broken circle | Magic `#6633aa` | Ring with a slash breaking it |
| Vampiric Touch | Red fangs | Blood `#8b0000` | Two upper fangs, curved |

---

## 11. Portraits

80 × 80 PNG each. Used in HUD and bracket views. Painted head-and-shoulders composition at higher detail than the 64 × 64 sprites. One portrait per champion:

| File | Subject |
|------|---------|
| `portrait_knight.png` | Ashen Knight head-and-shoulders, helm on, plume visible. Neutral, hard-eyed gaze (well, visor-slit glow). |
| `portrait_mage.png` | Pale Mage hooded head-and-shoulders. Two pale eyes visible inside hood shadow. Staff pommel visible at lower edge. |
| `portrait_heretic.png` | Heretic head-and-shoulders. Horns, glowing eyes, sigils on chest. |

### 11.1 Portrait construction rules

- Bust composition — top of head to mid-chest.
- Class-specific background: dark radial gradient from the class accent color at center to `#0a0a15` at edges. Knight = dimmed red, Mage = dimmed violet, Heretic = dimmed rust. Subtle, not a bright halo.
- 2 px ornate frame built into the PNG edge (gothic gold `#bba040` → `#886a20`) — the HUD does NOT re-frame portraits. Deliver framed.
- At the 80 × 80 scale, show slightly more facial detail than sprite scale: visible nose line, mouth shadow (or helm/hood equivalents).

### 11.2 Portrait state variants

Each champion also needs:
- `portrait_{champ}_dim.png` — the live portrait desaturated (grayscale + 30% darker) for an eliminated player in the bracket. Deliver as a separate PNG so the HUD can swap instantly.
- `portrait_{champ}_cracked.png` — the live portrait with a shattered-glass overlay (cracks crossing the face, a chunk missing from one corner). Used for the Coward's Brand visual (§17 in SPEC.md). Deliver as a separate PNG.

---

## 12. HUD Elements

All HUD art is painted at 1× and composited by PixiJS. Transparent PNGs. Positions are placed by code; you only deliver the art.

### 12.1 Portrait frame (baked into portraits — §11)

### 12.2 Energy pip

- `hud_energy_pip_filled.png` — 12 × 12, blue-gem polygon filling a dark socket. Cold highlight `#aaaacc` → Pale arcane `#88aaff` → darker shadow.
- `hud_energy_pip_empty.png` — 12 × 12, the dark socket alone, empty cavity. Stone-shadow `#3a3a48`.
- HUD renders up to 6 pips in a horizontal row (5 default, 6 with Energy Surge perk).

### 12.3 Turn indicator banner

- `hud_turn_banner.png` — 128 × 32 gothic pixel banner, gold-ink text "YOUR TURN" on a dark-stone background with gothic-border strokes at each end. Text is baked in — no separate localization for jam. Deliver also `hud_enemy_turn_banner.png` variant reading "ENEMY TURN" in a dimmer gold-on-dark.

### 12.4 Turn timer

- `hud_timer_frame.png` — 48 × 16, a stone-inset bracket for the countdown number. The number itself is rendered with the pixel font (§12.9), not a sprite.

### 12.5 Tile cursors

All 64 × 32 PNGs — diamond overlays sized to the tile top face.

| File | Color | Meaning |
|------|-------|---------|
| `cursor_select.png` | Gold `#bba040` edge, translucent fill | Hovered tile |
| `cursor_attack.png` | Blood `#cc2222` edge, red translucent fill | Valid attack target |
| `cursor_move.png` | Cold-highlight `#aaaacc` edge, faint blue fill | Valid move destination |
| `cursor_ability.png` | Magic `#8866ff` edge, violet translucent fill | Valid ability target |

### 12.6 Status icons

Small 16 × 16 icons rendered near the unit sprite when a status is active. Transparent PNG.

| File | Meaning |
|------|---------|
| `status_defending.png` | Small shield silhouette |
| `status_shield_wall.png` | Larger shield with runic glow |
| `status_iron_stance.png` | Gold aura ring |
| `status_revealed.png` | Open red eye |
| `status_stunned.png` | Small swirling stars |

### 12.7 Ability slot icons (optional — can reuse perk-icon style)

Three per champion, 32 × 32, shown in the HUD action bar.

| Champion | Ability | File |
|----------|---------|------|
| Knight | Shield Wall | `ability_knight_shield_wall.png` |
| Knight | Vanguard Charge | `ability_knight_vanguard_charge.png` |
| Knight | Iron Stance | `ability_knight_iron_stance.png` |
| Mage | Cinder Bolt | `ability_mage_cinder_bolt.png` |
| Mage | Ash Cloud | `ability_mage_ash_cloud.png` |
| Mage | Blink | `ability_mage_blink.png` |
| Heretic | Blood Tithe | `ability_heretic_blood_tithe.png` |
| Heretic | Hex Trap | `ability_heretic_hex_trap.png` |
| Heretic | Desecrate | `ability_heretic_desecrate.png` |

Motif guidelines: Knight icons = geometric/heraldic, Mage icons = astral/arcane, Heretic icons = organic/gore. Each matches its class's palette accent.

### 12.8 Title logo

- `logo_dark_council_tactic.png` — 512 × 128, "DARK COUNCIL TACTIC" in a gothic pixel typeface. Gold ink `#bba040` with dark outline `#1a1a20`, 1 px drop shadow in `#0a0a15`. Slight grit/distress on the letterforms — this is not polished corporate text.

### 12.9 Pixel font

Game uses one pixel-art font (e.g. "m5x7", "Pixeled", or similar public-domain gothic). Do NOT design a custom font for the jam. The sprite artist does not deliver a font — engineering picks and embeds one.

---

## 13. Damage Numbers & Floating Text

The engine spawns these programmatically (PixiJS Text), not as sprites. You do not deliver damage-number art. Font is the pixel font from §12.9. Colors:

- Damage dealt: Blood `#cc2222`, bold pixel font.
- Healing: Pale arcane `#88aaff`, lighter weight.
- Critical-ish highlights: Fire accent `#ff6600` (rare — only for first-strike / last-stand perk procs).

---

## 14. Delivery Format & File Organization

### 14.1 File naming

All lowercase, underscore-separated, descriptive. Examples given throughout this doc. Do not add your own suffixes (`_final`, `_v2`, etc.) — put versions in git or the delivery batch number.

### 14.2 Directory structure

Sprites land in the game repo at `public/sprites/` with subfolders:

```
public/sprites/
├── champions/
│   ├── knight_idle.png
│   ├── knight_walk.png
│   ├── knight_attack.png
│   ├── knight_hit.png
│   ├── knight_death.png
│   ├── knight_defend.png
│   ├── knight_kneel.png
│   ├── mage_idle.png
│   ├── mage_walk.png
│   ├── mage_attack.png
│   ├── mage_hit.png
│   ├── mage_death.png
│   ├── mage_defend.png
│   ├── mage_cast.png
│   ├── mage_kneel.png
│   ├── heretic_idle.png
│   ├── heretic_walk.png
│   ├── heretic_attack.png
│   ├── heretic_hit.png
│   ├── heretic_death.png
│   ├── heretic_defend.png
│   ├── heretic_channel.png
│   └── heretic_kneel.png
├── tiles/
│   ├── tile_stone.png
│   ├── tile_high_ground.png
│   ├── tile_rubble.png
│   ├── tile_hazard_fire.png
│   ├── tile_hazard_acid.png
│   ├── tile_hazard_void.png
│   ├── tile_pillar.png
│   ├── tile_wall.png
│   ├── tile_shadow.png
│   └── tile_corrupted.png
├── vfx/
│   ├── vfx_slash_arc.png
│   ├── vfx_shield_wall.png
│   ├── vfx_charge_dust.png
│   ├── vfx_cinder_bolt.png
│   ├── vfx_ash_cloud.png
│   ├── vfx_blink_flash.png
│   ├── vfx_blood_orb.png
│   ├── vfx_hex_rune.png
│   ├── vfx_hex_explode.png
│   ├── vfx_desecrate.png
│   ├── vfx_iron_stance.png
│   └── vfx_hit_sparks.png
├── pickups/
│   ├── pickup_health_flask.png
│   ├── pickup_energy_crystal.png
│   ├── pickup_scroll_of_sight.png
│   └── pickup_chest.png
├── perks/
│   └── (16 files, one per perk)
├── portraits/
│   ├── portrait_knight.png
│   ├── portrait_mage.png
│   ├── portrait_heretic.png
│   └── (dim + cracked variants)
├── hud/
│   ├── hud_energy_pip_filled.png
│   ├── hud_energy_pip_empty.png
│   ├── hud_turn_banner.png
│   ├── hud_enemy_turn_banner.png
│   ├── hud_timer_frame.png
│   ├── cursor_select.png
│   ├── cursor_attack.png
│   ├── cursor_move.png
│   ├── cursor_ability.png
│   ├── status_defending.png
│   ├── status_shield_wall.png
│   ├── status_iron_stance.png
│   ├── status_revealed.png
│   └── status_stunned.png
├── abilities/
│   └── (9 files, one per class ability)
└── logo/
    └── logo_dark_council_tactic.png
```

### 14.3 PNG technical requirements

- **Color:** RGBA 8-bit per channel (32-bit PNG).
- **Palette:** may be either indexed PNG-8 or truecolor PNG — engineering's choice. The artist's job is color discipline, not file-format engineering.
- **No metadata.** Strip EXIF, color profiles, etc. The engine assumes sRGB.
- **No dithering.** Clean pixels. Dithering is a stylistic choice we are not using.
- **No anti-aliasing** on outlines or edges. If you see a partial-alpha pixel on an outline, it's a bug in your export.

### 14.4 Batch delivery

Deliver in batches tied to milestones (see SPEC.md §7):

- **Batch 1 (M8):** All 10 terrain tiles. Nothing else.
- **Batch 2 (M9):** All three champions — every sheet. All 12 VFX.
- **Batch 3 (M9 polish):** Status icons, damage-number styling confirmation.
- **Batch 4 (M10):** Perk icons (16), ability icons (9).
- **Batch 5 (M11):** Pickup sprites (4).
- **Batch 6 (M12):** Portraits + dim/cracked variants.
- **Batch 7 (M13):** HUD cursors, timer frame, banners, logo.

Each batch is reviewed by Fernando as a set — do not ship partial batches.

### 14.5 Hero Moments — where polish earns the game its wow

Not all 80+ assets get the same attention. These are the five beats that judges, streamers, and first-time players will screenshot. Spend disproportionate time on them. If something has to be "pretty good" instead of great, let it be a mid-match idle frame, not one of these.

1. **Title screen / logo reveal.** `logo_dark_council_tactic.png` over a near-black backdrop. First frame anyone sees. The logo has to look like it was forged, not typed. Distress the letterforms. The gold must read as gold, not yellow.
2. **Bracket view.** Eight portraits, some in `_dim` variant for eliminated players, arranged in a single-elimination tree. This is the "who are the Dark Council" reveal. Portraits earn the whole cast's tone — put the most hours on §11.
3. **Perk draft.** Roughly three perk cards side-by-side with their 32×32 icons, name, and effect text. This is the roguelite identity beat — every run starts here. Icons must read as a cohesive set, same visual grammar across all 16.
4. **The Kneel / Coward's Brand.** The `kneel.png` animation's final held frame plus the `portrait_{champ}_cracked.png` overlay. The game's most emotionally loaded frame — a player chose shame. Make the collapse sell it. This is the "oh, *damn*" moment in streams.
5. **Match-end victory pose.** Winning champion's idle frame over the losing champion's held death frame on the same grid, desaturated palette, the grid itself dim. We build this from existing sheets + a filter, but the death-frame poses need to look like believable corpses, not sprite-pausing-at-frame-4.

Secondary hero moments (less screenshot-able but still first-impression): arena pillars/walls silhouetted against sky, the Heretic's Desecrate sweep across tiles, the Mage's Blink implosion/explosion timing, the Knight's Vanguard Charge dust trail. Don't phone these in.

---

## 15. QA Checklist (per asset)

Before marking an asset "done" and handing it off, verify:

1. **Canvas size** matches §4. Exact pixels, not "close to."
2. **Anchor** is at the correct point (champion sprites: center-bottom; portraits/icons: center; tiles: top-corner of diamond).
3. **Transparent background.** No solid-color fill.
4. **Palette.** Every color on or within ±4 of a palette cell (§3.1).
5. **Outline.** 1 px dark outline on champions, pickups, and VFX motifs. No anti-aliasing.
6. **No pure white** `#ffffff`. No fully-saturated RGB primaries.
7. **Silhouette test.** Paint it solid black at 1× — does it read as the intended subject?
8. **Scale check.** View at 1× (native), 2×, and 4× — pixels stay crisp, no blur.
9. **Animation coherence (for sheets).** Flip through frames at the target timing (§7.2) — does motion read, or is it noise?
10. **File name.** Matches §14.1 naming exactly.
11. **No stray pixels.** Zoom to 8× and scan the canvas edges for orphan pixels, transparency holes, accidental marks.

If any of 1–11 fails, the asset is not done.

---

## 16. Common AI Sprite Generation Pitfalls (read this before prompting)

AI pixel-art generators fail in predictable ways. Know them and check for them every time.

### 16.1 The "fake pixel" problem

Many AI tools produce high-res art that *looks* pixelated at thumbnail size but is actually blurred — partial-alpha edges, subpixel anti-aliasing, soft shadows with gradient fills. These will blow up awful at 4× engine zoom.

**Check:** zoom to 4× in an image viewer. Every pixel should be a single solid color. If you see gradient color bands on any edge, the sprite is not real pixel art. Re-export at 1× with "nearest neighbor" downscale, or repaint in Aseprite.

### 16.2 Color drift

AI will "helpfully" introduce colors close to your palette but not exactly on it. `#5b5a69` instead of `#5a5a68`. Over 20 sprites, you end up with 200 colors instead of 24.

**Check:** extract the color palette from each final sprite (any pixel-art tool does this) — count distinct colors. If any sprite has more than 24 distinct colors, or contains any color that isn't on or adjacent to §3.1, snap it back to palette.

### 16.3 Silhouette mush

AI loves to add "detail" (filigree, extra belts, more armor plates) that fragments the silhouette. A Knight ends up with nine belt buckles and reads as "armor goblin" instead of "cold-iron wall."

**Check:** §15 item 7 (silhouette test). If the solid-black silhouette doesn't read from class identity alone, strip detail.

### 16.4 Inconsistent scale

Generating each champion in isolation, each one ends up at a different height. Mage at 48 px, Knight at 52 px, Heretic at 44 px. In-game they will look wrong together.

**Check:** every champion's feet sit at canvas y-row 60–62, every champion's head sits at canvas y-row 32–40. Verify with a ruler overlay.

### 16.5 Inconsistent light direction

One sprite is lit from upper-left, another from upper-right. On an iso grid where the light direction is fixed, this is immediately wrong.

**Rule:** light comes from upper-left in every sprite and tile. Highlights on upper-left edges, shadows on lower-right. Consistent across everything.

### 16.6 Text or numerals in sprites

AI sometimes adds tiny readable letters/numbers to "detail" armor or scrolls. We never want legible text in sprites (UI text is pixel-font at runtime).

**Check:** zoom in and verify no embedded text. Runes/sigils are abstract marks, not alphabet letters.

### 16.7 "Fantasy default" drift

AI left to its own devices reverts to safe fantasy-art clichés: bright torches, clean tabards, polished metal, heroic stances. Our target is *dark fantasy gone wrong* — pull back toward §2.3 every time.

---

## 17. Iteration Protocol

This is how Fernando (art director) and the sprite agent work together.

1. **Agent reads:** this document end to end, plus the relevant subsection for the asset being produced.
2. **Agent produces:** a single asset (or a tightly scoped batch — e.g. "Knight idle only") as a 1× PNG. Agent runs the §15 QA checklist on it internally.
3. **Agent delivers:** the PNG plus a one-paragraph note covering:
   - Palette count (distinct colors used).
   - Any palette entries added beyond §3.1 (and why).
   - Any places the agent felt ambiguity in the spec and made a judgment call.
4. **Fernando reviews:** at 1×, 3×, and 4× scales. Approves, rejects, or requests changes.
5. **If changes requested:** agent does NOT start from scratch — iterate on the existing file. Preserve what worked.
6. **On approval:** file is committed to `public/sprites/` in the repo by engineering (Kai), and marked done in the batch tracker (§14.4).

**Do NOT produce 20 variations of an asset speculatively.** One careful, spec-compliant version at a time. Iteration quality beats volume.

---

## 18. Style Reminders Card (print this)

- Ashen. Cold. Heavy. Gothic. Not cute. Not saturated.
- Palette lives on §3.1. Nowhere else.
- Never pure white. Never 100% RGB primaries.
- 16–24 colors per sprite.
- 1 px dark outline on characters, pickups, VFX motifs.
- Light from upper-left. Always.
- Silhouette must read at solid black.
- Feet at y-row 60–62 on 64 × 64 champion canvases.
- Transparent PNG. No anti-aliasing. No embedded text.
- When in doubt, push the darkness further.

---

## 19. Questions for Fernando (flag before generating)

If the agent hits any of these, stop and ask — do not invent an answer.

- Is there a specific Knight helm style (great helm, barbute, frog-mouth)? The spec says "great helm" but asks for a T-slit visor — confirm.
- Mage hood color direction: pure midnight blue, or creep-toward-black? Spec says `#1a1a38`, confirm that's not too blue.
- Heretic skin tone under the bloody robes: bare flesh, or bandaged/strapped? Spec implies dark cloth-wrap + bone gauntlets but not what's under the torso rags.
- Portrait framing style (gothic pointed arch, round medallion, rectangular): not locked. Ask.
- Title logo wordmark style (uncial gothic, blackletter, roman pixel): not locked. Ask.
- Any in-game text art (buttons, banners beyond "YOUR TURN") — for jam scope, UI text is the pixel font at runtime. Confirm scope.

---

*ART_SPEC v1.3 — 2026-04-20. Paired with SPEC.md v2.0 (ART_SPEC v2 forthcoming post-pilot).*
*If this file disagrees with SPEC.md §21–§22, SPEC.md is the engineering source of truth — patch this file to match.*
*The game is dark. The art has to earn that.*
— Kai
