// js/sprites.js — Sprite-sheet indexing foundation.
//
// Goal: a data-driven place to register sprites by ID and (optionally) assign
// them to mobs/items/projectiles, WITHOUT replacing the existing geometric art.
// If a sheet image is missing or a sprite isn't assigned, callers fall back to
// their current drawing — nothing breaks. No build tools, no dependencies.
//
//   - SHEETS:           one (or more) sprite-sheet images under assets/sprites/
//   - SPRITE_REGISTRY:  metadata per sprite ID (sheet, tile coords, size, category)
//   - *SpriteAssignments: optional maps from game keys -> sprite ID
//   - Sprites.draw / drawForMob: canvas draw helpers (return true if they drew)

// --- Sheets -----------------------------------------------------------------
// Register each sprite sheet once. `tile` is the grid cell size in source px;
// registry entries may address cells by col/row (preferred) or raw x/y.
const SPRITE_SHEETS = {
  weapons: { path: 'assets/sprites/weapons_black_outline.png', tile: 16 },
  armor:   { path: 'assets/sprites/armor.png', tile: 16 },
  main:    { path: 'assets/sprites/sheet.png', tile: 16 },  // fallback / general sheet

  // --- Mob sheets (forward-facing 2-frame mob atlases) ----------------------
  // Each is an 8x8 grid = 64 tiles = 32 mob pairs. Every mob occupies two
  // ADJACENT tiles on a row: frame A (idle/move) at an even col, frame B
  // (active/attack) at col+1. The cleaned (background-removed) sheets are STILL
  // 1254x1254 (verified post-cleanup; NOT a power of two: 1254/8 = 156.75), so we
  // address tiles by `cols`/`rows` grid fractions of the loaded image's natural
  // size rather than a fixed integer tile px — this stays correct no matter the
  // exact sheet dimensions, so manual edits that change size won't break layout.
  // NOTE: mobs_astral.png is currently absent from assets/sprites/ (loader is
  // safe — astral mobs fall back to geometry until the PNG is restored).
  mobs_neutral:  { path: 'assets/sprites/mobs_neutral.png',  cols: 8, rows: 8 },
  mobs_forest:   { path: 'assets/sprites/mobs_forest.png',   cols: 8, rows: 8 },
  mobs_goblin:   { path: 'assets/sprites/mobs_goblin.png',   cols: 8, rows: 8 },
  mobs_fungal:   { path: 'assets/sprites/mobs_fungal.png',   cols: 8, rows: 8 },
  mobs_void:     { path: 'assets/sprites/mobs_void.png',     cols: 8, rows: 8 },
  mobs_frost:    { path: 'assets/sprites/mobs_frost.png',    cols: 8, rows: 8 },
  mobs_infernal: { path: 'assets/sprites/mobs_infernal.png', cols: 8, rows: 8 },
  mobs_plague:   { path: 'assets/sprites/mobs_plague.png',   cols: 8, rows: 8 },
  mobs_astral:   { path: 'assets/sprites/mobs_astral.png',   cols: 8, rows: 8 },
  mobs_cursed:   { path: 'assets/sprites/mobs_cursed.png',   cols: 8, rows: 8 },

  // --- Portal sheets (animated 3-frame portal atlases) ----------------------
  // 32x32-style portals; frames run left-to-right in groups of 3 (A idle, B active
  // swirl, C peak flare). The cleaned (background-removed) sheets are STILL 1254x1254
  // (verified post-cleanup; 1254/8 = 156.75, non-power-of-two), so we address tiles
  // by an 8x8 grid fraction of the natural size. Each sheet holds MULTIPLE portal
  // variants; they are indexed EXPLICITLY below (PORTAL_VARIANTS_PER_ROW + the
  // enumerable PORTAL_VARIANT_TABLE) and chosen per theme/dungeon in readable
  // assignment tables — never auto-picked. Use portal_debug.html to see which
  // variant index is which before assigning one.
  portal_void_arcane: { path: 'assets/sprites/portal_sheet_01_void_arcane.png',       cols: 8, rows: 8 },
  portal_blue_green:  { path: 'assets/sprites/portal_sheet_02_blue_green.png',        cols: 8, rows: 8 },
  portal_ice:         { path: 'assets/sprites/portal_sheet_03_ice.png',               cols: 8, rows: 8 },
  portal_void_dark:   { path: 'assets/sprites/portal_sheet_04_void_dark.png',         cols: 8, rows: 8 },
  portal_forest:      { path: 'assets/sprites/portal_sheet_05_forest.png',            cols: 8, rows: 8 },
  portal_infernal:    { path: 'assets/sprites/portal_sheet_06_infernal.png',          cols: 8, rows: 8 },
  portal_plague:      { path: 'assets/sprites/portal_sheet_07_plague_corruption.png', cols: 8, rows: 8 },
  portal_astral:      { path: 'assets/sprites/portal_sheet_08_astral.png',            cols: 8, rows: 8 },
  portal_fungal:      { path: 'assets/sprites/portal_sheet_09_mushroom_fungal.png',   cols: 8, rows: 8 },
  portal_cursed:      { path: 'assets/sprites/portal_sheet_10_gothic_cursed.png',     cols: 8, rows: 8 },

  // --- Boss sheets (multi-frame boss animation atlases) ---------------------
  // Three sheets, each 1536x1024. REAL LAYOUT (verified from the art): each sheet is
  // a 3x2 arrangement of SIX boss BLOCKS, and every boss block is its own 3x3 grid of
  // animation frames. That makes the full sheet a 9x6 grid (1536/9 = 1024/6 = 170.67px
  // square cells). So `cols:9, rows:6`; a boss `pair` (0..5) selects a BLOCK, and
  // drawBossSheet animates a 2-frame idle/attack from that block's top row (block cols
  // 0 & 1) — one centered cell at a time, never a full pair-width region. Cells are
  // addressed by `cols`/`rows` grid FRACTIONS of the loaded image's natural size (not
  // fixed px), so a re-export at another resolution won't break the layout.
  bosses_core:  { path: 'assets/sprites/bosses_sheet_01_core.png',               cols: 9, rows: 6 },
  bosses_void:  { path: 'assets/sprites/bosses_sheet_02_void_plague_astral.png', cols: 9, rows: 6 },
  bosses_world: { path: 'assets/sprites/bosses_sheet_03_world_bosses.png',       cols: 9, rows: 6 }
}

// --- Portal sprite system (SEPARATE from mob + item sprites) -----------------
// Portals are themed by a short THEME string (or an explicit { sheet, variant }).
// Render via Sprites.drawPortal(themeOrSpec, ...). Unknown themes fall back to the
// generic blue-green sheet; if the image isn't loaded the caller keeps its existing
// pulsing-rect fallback. NOTHING here touches mob/item sprite maps.

// --- Explicit portal VARIANT layout -----------------------------------------
// Each portal animation = PORTAL_FRAMES (3) ADJACENT tiles left-to-right
// (A idle, B active swirl, C peak flare). On an 8x8 sheet a row fits 2 full
// variants (cols 0-2 and 3-5; cols 6-7 are spare), so variants are packed row by
// row by this EXPLICIT rule:
//   variant V -> startCol = (V % PORTAL_VARIANTS_PER_ROW) * PORTAL_FRAMES
//                startRow =  floor(V / PORTAL_VARIANTS_PER_ROW)
// Every variant is enumerable (PORTAL_VARIANT_TABLE) and addressable by index.
// Game code never auto-picks a variant — it reads the assignment tables below.
const PORTAL_FRAMES = 3
const PORTAL_VARIANTS_PER_ROW = 2     // 2 variants * 3 frames = 6 cols used / row (6,7 spare)
const PORTAL_VARIANTS_PER_SHEET = 16  // 8 rows * 2 = first-pass slots exposed for picking

// Variant index -> its tile rect { col, row, frames } on the 8x8 sheet grid.
function portalVariantRect(variant) {
  const v = Math.max(0, variant | 0)
  return {
    col: (v % PORTAL_VARIANTS_PER_ROW) * PORTAL_FRAMES,
    row: (v / PORTAL_VARIANTS_PER_ROW) | 0,
    frames: PORTAL_FRAMES
  }
}

// Enumerable, LABELED table of every variant on every portal sheet:
//   sheetKey -> [ { variant, col, row, frames }, ... ]
// Built once from the layout rule above so portal_debug.html (and any tooling) can
// list/inspect variants without guessing. Some slots may be blank on a given sheet
// — that's expected; pick the indices that look good in the debug page.
const PORTAL_SHEET_KEYS = Object.keys(SPRITE_SHEETS).filter(k => k.startsWith('portal_'))
const PORTAL_VARIANT_TABLE = {}
for (const sheet of PORTAL_SHEET_KEYS) {
  PORTAL_VARIANT_TABLE[sheet] = []
  for (let v = 0; v < PORTAL_VARIANTS_PER_SHEET; v++) {
    const r = portalVariantRect(v)
    PORTAL_VARIANT_TABLE[sheet].push({ variant: v, sheet, col: r.col, row: r.row, frames: r.frames })
  }
}

// --- Assignment tables (the ONLY place a portal's visual is chosen) ----------
// portalVariantAssignments: THEME -> { sheet, variant }. One readable line per
// theme — edit a single line to repoint a theme to a different sheet OR variant.
// (first-pass guess: every theme uses variant 0 — verify nicer variants in
// portal_debug.html, then bump the variant number.)
const portalVariantAssignments = {
  forest:   { sheet: 'portal_forest',      variant: 0 }, // forest / grove / nature  -> sheet 05
  fungal:   { sheet: 'portal_fungal',      variant: 0 }, // fungal / mushroom         -> sheet 09
  infernal: { sheet: 'portal_infernal',    variant: 0 }, // infernal / ash / fire     -> sheet 06
  plague:   { sheet: 'portal_plague',      variant: 0 }, // plague / corruption / rot -> sheet 07
  frost:    { sheet: 'portal_ice',         variant: 0 }, // frost / ice               -> sheet 03
  void:     { sheet: 'portal_void_dark',   variant: 0 }, // void / dark / singularity -> sheet 04
  arcane:   { sheet: 'portal_void_arcane', variant: 0 }, // arcane / dark-matter      -> sheet 01
  astral:   { sheet: 'portal_astral',      variant: 0 }, // astral / celestial        -> sheet 08
  cursed:   { sheet: 'portal_cursed',      variant: 0 }, // cursed/hollow/fallen/court-> sheet 10
  magic:    { sheet: 'portal_blue_green',  variant: 0 }, // generic fallback          -> sheet 02
}

// Back-compat: theme -> sheet (derived from the table above; older code/exports
// read PORTAL_THEME_SHEET). Single source of truth stays portalVariantAssignments.
const PORTAL_THEME_SHEET = {}
for (const th of Object.keys(portalVariantAssignments)) PORTAL_THEME_SHEET[th] = portalVariantAssignments[th].sheet

// dungeonPortalAssignments: DUNGEON key (DUNGEONS, mobs.js) -> portal THEME (a key
// of portalVariantAssignments). To give ONE dungeon a precise look without changing
// its whole theme, replace its theme string with an explicit object, e.g.
//     void_rift: { sheet: 'portal_void_dark', variant: 3 }
// drawPortal/portalSpec accept either form, so you only edit ONE line.
// (first-pass theme guesses per the task's theme map.)
const dungeonPortalAssignments = {
  // OG dungeons
  goblin_warren:      'forest',    // low-tier natural warren
  fungal_cavern:      'fungal',
  void_rift:          'void',
  // biome dungeons
  dark_matter_core:   'arcane',    // singularity / dark matter
  frozen_catacombs:   'frost',
  infernal_pit:       'infernal',
  plague_grotto:      'plague',
  fallen_keep:        'cursed',
  astral_tomb:        'astral',
  // world-boss dungeons
  event_horizon_vault:'arcane',
  titan_glacier:      'frost',
  worldeater_forge:   'infernal',
  plague_hive:        'plague',
  cursed_throne:      'cursed',
  starfall_pyramid:   'astral'
}
// Back-compat alias (world.js / older code referenced dungeonPortalTheme).
const dungeonPortalTheme = dungeonPortalAssignments

// biomePortalAssignments: world BIOME id/name -> portal theme. REFERENCE table for
// biome-flavored portals (e.g. a portal that should read as its SOURCE biome rather
// than its destination dungeon). Not wired into tile rendering yet — rendering keys
// off the destination dungeon (dungeonPortalAssignments) — but exposed for later use.
// (first-pass guesses.)
const biomePortalAssignments = {
  dark_matter: 'arcane',
  snow:        'frost',
  hell:        'infernal',
  toxic:       'plague',
  ruined:      'cursed',
  astral:      'astral',
  forest:      'forest',
  fungal:      'fungal',
}

// Resolve a DUNGEON key -> a portal spec (theme string OR { sheet, variant }), or
// null if unmapped. Zones (world.js) call this to theme a dungeon's portal tile.
function dungeonPortalSpec(key) {
  const a = dungeonPortalAssignments[key]
  return (a != null) ? a : null
}

// --- Portal VISUAL treatment (data-driven, easy to tune) --------------------
// Makes a portal read as a living world entity (bob/glow/pulse/shadow) instead of
// a flat sheet tile. All knobs live here so behaviour is tuned in one place and
// applied uniformly to every portal (no per-portal hardcoding). Sprites.drawPortalEntity
// uses these; the bare 3-frame Sprites.drawPortal (used by portal_debug.html) is unchanged.
const PORTAL_VIS = {
  bobAmp: 3.2,        // px vertical bob (screen-space, like loot bags)
  bobSpeed: 520,      // ms time-divisor for the bob sine
  pulseSpeed: 360,    // ms time-divisor for the glow/scale shimmer sine
  pulseAmt: 0.07,     // +/- scale shimmer fraction (subtle breathing)
  glowAlpha: 0.55,    // base radial aura alpha
  glowSize: 1.9,      // aura radius as a multiple of the portal half-size
  glowBlur: 14,       // shadowBlur added to the portal art (edge glow)
  shadowW: 0.62,      // ground shadow width as a fraction of size
  shadowH: 0.2,       // ground shadow height as a fraction of size
  shadowAlpha: 0.32,  // ground shadow darkness
  shadowDrop: 0.34,   // shadow vertical offset below center as a fraction of size
  fps: 7,             // sheet-frame animation rate (blended with bob/glow so it reads smooth)
  cropInset: 0.07     // fraction cropped in from each sheet-tile edge (drops baked-in square padding)
}

// Per-sheet aura/shadow tint so the glow matches each portal's art. Keyed by sheet
// so it resolves for BOTH theme strings and explicit { sheet, variant } overrides.
const PORTAL_SHEET_GLOW = {
  portal_void_arcane: '#8a5cff',
  portal_blue_green:  '#3ad6c0',
  portal_ice:         '#9fd8ff',
  portal_void_dark:   '#9b3cff',
  portal_forest:      '#46d36a',
  portal_infernal:    '#ff6a2a',
  portal_plague:      '#8fd34a',
  portal_astral:      '#c0a0ff',
  portal_fungal:      '#d36ad0',
  portal_cursed:      '#b04acc'
}

// --- Registry ---------------------------------------------------------------
// Each entry: { id, sheet, col,row (tile coords) OR x,y (px), w,h (px), category }
// category hint: 'mob' | 'boss' | 'item' | 'weapon' | 'armor' | 'projectile' | 'unknown'
// w/h default to the sheet tile size when omitted.
const SPRITE_REGISTRY = {
  // mobs
  spr_slime:        { sheet: 'main', col: 0, row: 0, category: 'mob' },
  spr_sprite:       { sheet: 'main', col: 1, row: 0, category: 'mob' },
  spr_goblin:       { sheet: 'main', col: 2, row: 0, category: 'mob' },
  spr_bat:          { sheet: 'main', col: 3, row: 0, category: 'mob' },
  spr_wisp:         { sheet: 'main', col: 4, row: 0, category: 'mob' },
  spr_shroom:       { sheet: 'main', col: 5, row: 0, category: 'mob' },
  // bosses
  spr_boss_goblin:  { sheet: 'main', col: 0, row: 1, w: 32, h: 32, category: 'boss' },
  spr_boss_void:    { sheet: 'main', col: 2, row: 1, w: 32, h: 32, category: 'boss' },
  spr_boss_mycelian:{ sheet: 'main', col: 4, row: 1, w: 32, h: 32, category: 'boss' },
  // items / gear
  spr_sword:        { sheet: 'main', col: 0, row: 3, category: 'weapon' },
  spr_staff:        { sheet: 'main', col: 1, row: 3, category: 'weapon' },
  spr_helm:         { sheet: 'main', col: 2, row: 3, category: 'armor' },
  spr_ring:         { sheet: 'main', col: 3, row: 3, category: 'item' },
  spr_potion:       { sheet: 'main', col: 4, row: 3, category: 'item' },
  // projectiles
  spr_bullet:       { sheet: 'main', col: 0, row: 5, w: 8, h: 8, category: 'projectile' },
  spr_fireball:     { sheet: 'main', col: 1, row: 5, w: 8, h: 8, category: 'projectile' },
  spr_orb:          { sheet: 'main', col: 2, row: 5, w: 8, h: 8, category: 'projectile' },

  // weapons sheet (assets/sprites/weapons_black_outline.png, 8x8 @16px).
  // IDs follow the slicer naming (sheet_col_row) for easy lookup in sprites_debug.html.
  weapons_0_0:      { sheet: 'weapons', col: 0, row: 0, category: 'weapon' }, // gray sword
  weapons_1_0:      { sheet: 'weapons', col: 1, row: 0, category: 'weapon' }, // bronze sword
  weapons_2_0:      { sheet: 'weapons', col: 2, row: 0, category: 'weapon' }, // gold/fire sword
  weapons_5_0:      { sheet: 'weapons', col: 5, row: 0, category: 'weapon' }, // gold bow
  weapons_0_4:      { sheet: 'weapons', col: 0, row: 4, category: 'weapon' }, // void/purple sword
  weapons_6_4:      { sheet: 'weapons', col: 6, row: 4, category: 'weapon' }, // blue staff/spear
  weapons_7_4:      { sheet: 'weapons', col: 7, row: 4, category: 'weapon' }, // fire staff/spear
  weapons_7_7:      { sheet: 'weapons', col: 7, row: 7, category: 'weapon' }, // blue crystal

  // armor sheet (assets/sprites/armor.png, 8x8 @16px). Rows by piece type;
  // rings/gems are accessories tagged 'item'. Adjust coords in sprites_debug.html.
  armor_0_0:        { sheet: 'armor', col: 0, row: 0, category: 'armor' }, // gray helm
  armor_2_0:        { sheet: 'armor', col: 2, row: 0, category: 'armor' }, // gold helm
  armor_3_0:        { sheet: 'armor', col: 3, row: 0, category: 'armor' }, // cyan helm
  armor_0_1:        { sheet: 'armor', col: 0, row: 1, category: 'armor' }, // silver chest
  armor_2_1:        { sheet: 'armor', col: 2, row: 1, category: 'armor' }, // gold chest
  armor_4_1:        { sheet: 'armor', col: 4, row: 1, category: 'armor' }, // brown leather chest
  armor_5_1:        { sheet: 'armor', col: 5, row: 1, category: 'armor' }, // red robe/chest
  armor_7_1:        { sheet: 'armor', col: 7, row: 1, category: 'armor' }, // blue robe/chest
  armor_2_2:        { sheet: 'armor', col: 2, row: 2, category: 'armor' }, // gold pants
  armor_3_2:        { sheet: 'armor', col: 3, row: 2, category: 'armor' }, // cyan pants
  armor_4_2:        { sheet: 'armor', col: 4, row: 2, category: 'armor' }, // brown pants
  armor_7_2:        { sheet: 'armor', col: 7, row: 2, category: 'armor' }, // blue pants
  armor_2_3:        { sheet: 'armor', col: 2, row: 3, category: 'armor' }, // gold boots
  armor_4_3:        { sheet: 'armor', col: 4, row: 3, category: 'armor' }, // brown boots
  armor_7_3:        { sheet: 'armor', col: 7, row: 3, category: 'armor' }, // blue boots
  armor_2_4:        { sheet: 'armor', col: 2, row: 4, category: 'armor' }, // gold gloves
  armor_4_4:        { sheet: 'armor', col: 4, row: 4, category: 'armor' }, // brown gloves
  armor_7_4:        { sheet: 'armor', col: 7, row: 4, category: 'armor' }, // blue gloves
  armor_3_7:        { sheet: 'armor', col: 3, row: 7, category: 'item' },  // blue gem
  armor_4_7:        { sheet: 'armor', col: 4, row: 7, category: 'item' },  // gray ring
  armor_5_7:        { sheet: 'armor', col: 5, row: 7, category: 'item' },  // green ring
  armor_6_7:        { sheet: 'armor', col: 6, row: 7, category: 'item' },  // orange ring
  armor_7_7:        { sheet: 'armor', col: 7, row: 7, category: 'item' }   // blue/orange ring
}

// --- Standalone creature sprite files (whole-image sprites, NOT tile sheets) -
// Some art ships as individual PNGs rather than a packed grid. These registry
// entries use `src` (a full image path) instead of sheet/col/row, and the loader
// blits the whole image (preserving aspect, fit to the requested size). An entry
// may ALSO carry frame fields (`fw`/`fh`/`frames`/`cols`/`fps`) to play a minimal
// animation loop from a strip/grid inside that file.
//
// The "20 Free Fantasy Flying Creatures" pack has opaque UUID filenames, so each
// gets a stable deterministic ID (flying_boss_01..20). `Crystal Knight.png` is an
// animated sheet; we loop its top-row idle frames only (96x96 × 4) — a minimal,
// boss-only animation. Original file paths are preserved verbatim below.
Object.assign(SPRITE_REGISTRY, {
  flying_boss_01: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_2597d5b5-abfb-4028-8b48-8905cdb9835f.png', category: 'boss' },
  flying_boss_02: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_2b2e5324-2e11-4375-a06a-4dee8eb70ae1.png', category: 'boss' },
  flying_boss_03: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_2d7424ae-f33e-4458-bd6d-5a4f8c48d6c4.png', category: 'boss' },
  flying_boss_04: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_34f79db8-70c7-49e1-b325-3acbd5cf4c7c.png', category: 'boss' },
  flying_boss_05: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_3ccf9877-5544-4ef5-979e-276ccf90b815.png', category: 'boss' },
  flying_boss_06: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_43a4a1fc-831a-4df4-82d2-d616faffa982.png', category: 'boss' },
  flying_boss_07: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_5c5aa9c4-dbaa-4e4f-a7d3-05b5c3e431f2.png', category: 'boss' },
  flying_boss_08: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_639d8f01-beda-4200-90e0-594200ed742b.png', category: 'boss' },
  flying_boss_09: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_6ca5dccf-0f9d-4459-97a3-2e7b322cc2ef.png', category: 'boss' },
  flying_boss_10: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_72e8157d-f22a-4e4c-8d3e-232adc1deaed.png', category: 'boss' },
  flying_boss_11: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_734ee735-93b2-462f-9848-4fef483589b9.png', category: 'boss' },
  flying_boss_12: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_864ff4ac-4ae1-470d-84cf-d8df11355b59.png', category: 'boss' },
  flying_boss_13: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_b1f8608b-d4c0-43ae-b604-67044f852e73.png', category: 'boss' },
  flying_boss_14: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_b752da99-041a-4ee5-8a80-3ee5cecd5377.png', category: 'boss' },
  flying_boss_15: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_bed5ac0c-0d92-44d0-9b5e-53ba10189ff6.png', category: 'boss' },
  flying_boss_16: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_ca98d8ed-9128-4282-842e-7e813280b276.png', category: 'boss' },
  flying_boss_17: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_cf0e1185-7269-467a-96de-4441e19b3e19.png', category: 'boss' },
  flying_boss_18: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_eed4de61-dcf1-4f2c-ba14-b59f8b072647.png', category: 'boss' },
  flying_boss_19: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_f224884e-004b-4405-9c7c-8f309cf3b9b0.png', category: 'boss' },
  flying_boss_20: { src: 'assets/sprites/20 Free Fantasy Flying Creatures/_f6f41775-1359-4fb6-9b0c-1740c3fb3b04.png', category: 'boss' },
  // Crystal Knight: animated boss sheet (384x768). Top row = 4 idle frames @96px.
  crystal_knight: { src: 'assets/sprites/Crystal Knight.png', fw: 96, fh: 96, frames: 4, cols: 4, fps: 6, category: 'boss' },
})

// --- Monster Creature pack (pack 1 by batareya) -----------------------------
// 20 crisp 64x96 single-sprite PNGs — clean pixel art (unlike the 1024x1024
// flying-creature AI renders), so these render large/sharp inside the mob box.
// Stable IDs monster_boss_01..20; original file paths preserved verbatim. These
// are dungeon-boss / elite-mob candidates (category 'boss').
Object.assign(SPRITE_REGISTRY, {
  monster_boss_01: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0056-900920138.png', category: 'boss' },
  monster_boss_02: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0063-4100537309.png', category: 'boss' },
  monster_boss_03: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0064-4100537310.png', category: 'boss' },
  monster_boss_04: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0067-1577086740.png', category: 'boss' },
  monster_boss_05: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0069-1577086742.png', category: 'boss' },
  monster_boss_06: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0071-2562867672.png', category: 'boss' },
  monster_boss_07: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0074-2562867675.png', category: 'boss' },
  monster_boss_08: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0077-668142567.png', category: 'boss' },
  monster_boss_09: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0078-668142568.png', category: 'boss' },
  monster_boss_10: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0081-116591765.png', category: 'boss' },
  monster_boss_11: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0082-116591766.png', category: 'boss' },
  monster_boss_12: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0087-4255467705.png', category: 'boss' },
  monster_boss_13: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0088-4255467706.png', category: 'boss' },
  monster_boss_14: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0091-4023341708.png', category: 'boss' },
  monster_boss_15: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0092-4023341709.png', category: 'boss' },
  monster_boss_16: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0094-4023341711.png', category: 'boss' },
  monster_boss_17: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0096-362859608.png', category: 'boss' },
  monster_boss_18: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0098-362859610.png', category: 'boss' },
  monster_boss_19: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0101-3056965715.png', category: 'boss' },
  monster_boss_20: { src: 'assets/sprites/Monster Creature sprites (pack 1 by batareya)/pixel-0102-3056965716.png', category: 'boss' },
})

// --- Optional assignment maps ----------------------------------------------
// Map game-side keys -> sprite IDs. Empty entries simply fall back to geometry.
// mob keys come from MOB_DEFS (e.key).
//
// NOTE: the only shipped sheet (assets/sprites/sheet.png) is a WEAPON/ITEM sheet
// — it contains no mob art. The old assignments below pointed mob keys at those
// tiles, which rendered neutral mobs (slime/sprite/goblin) as swords. Until real
// mob art exists, leave this EMPTY so every mob uses its geometric fallback.
// Do not point mob keys at the weapons/armor/item sheets.
const mobSpriteAssignments = {}

// Regular + dungeon mob `e.key` (MOB_DEFS) -> { sheet, pair } on a 2-frame mob
// atlas (see SPRITE_SHEETS mobs_*). `pair` is the mob index 0..31 on that 8x8
// sheet; frame A (idle/move) sits at col `pair*2`, frame B (active/attack) at the
// adjacent col. drawForMob consults this AFTER bosses + mobSpriteAssignments, so
// any mapped boss/registry sprite still wins; unmapped keys keep geometry.
//
// First-pass mapping is by biome/theme + obvious names (see task spec). To remap
// a single mob, just change its { sheet, pair } here — nothing else depends on it.
// (Dark-matter mobs ride the void sheet; no dedicated dark-matter art ships.)
const mobSheetAssignments = {
  // open-world / neutral starter
  slime:           { sheet: 'mobs_neutral', pair: 0 },
  // forest
  forest_sprite:   { sheet: 'mobs_forest', pair: 0 },
  // goblin
  goblin_scout:    { sheet: 'mobs_goblin', pair: 0 },
  goblin_brute:    { sheet: 'mobs_goblin', pair: 1 },
  goblin_shaman:   { sheet: 'mobs_goblin', pair: 2 },
  // fungal
  cave_bat:        { sheet: 'mobs_fungal', pair: 0 },
  fungal_shroom:   { sheet: 'mobs_fungal', pair: 1 },
  mycelian_drone:  { sheet: 'mobs_fungal', pair: 2 },
  // void (+ dark-matter biome, closest theme)
  void_wisp:       { sheet: 'mobs_void', pair: 0 },
  rift_stalker:    { sheet: 'mobs_void', pair: 1 },
  null_orbiter:    { sheet: 'mobs_void', pair: 2 },
  matter_wraith:   { sheet: 'mobs_void', pair: 3 },
  gravity_maw:     { sheet: 'mobs_void', pair: 4 },
  null_apostle:    { sheet: 'mobs_void', pair: 5 },
  // frost / snow
  frost_skater:    { sheet: 'mobs_frost', pair: 0 },
  icebound_archer: { sheet: 'mobs_frost', pair: 1 },
  snow_golem:      { sheet: 'mobs_frost', pair: 2 },
  // infernal / hell
  ember_imp:       { sheet: 'mobs_infernal', pair: 0 },
  chainscourge:    { sheet: 'mobs_infernal', pair: 1 },
  lava_brute:      { sheet: 'mobs_infernal', pair: 2 },
  // plague / toxic
  spore_crawler:   { sheet: 'mobs_plague', pair: 0 },
  venom_cap:       { sheet: 'mobs_plague', pair: 1 },
  mycelium_horror: { sheet: 'mobs_plague', pair: 2 },
  // cursed / ruined-kingdom (fallen/hollow/court)
  fallen_squire:   { sheet: 'mobs_cursed', pair: 0 },
  cursed_archer:   { sheet: 'mobs_cursed', pair: 1 },
  grave_priest:    { sheet: 'mobs_cursed', pair: 2 },
  // astral / desert
  star_scarab:     { sheet: 'mobs_astral', pair: 0 },
  mirage_stalker:  { sheet: 'mobs_astral', pair: 1 },
  sunseer:         { sheet: 'mobs_astral', pair: 2 }
}

// boss mob `e.key` (MOB_DEFS) -> sprite ID. Themed by color/style against the new
// creature art (see sprites_debug.html). Bosses with no good fit are left out and
// keep their geometric fallback. drawForMob consults this BEFORE mobSpriteAssignments.
const bossSpriteAssignments = {
  // --- open-world / OG + biome DUNGEON bosses -> crisp Monster Creature pack ---
  // These 64x96 pixel sprites render large/sharp (the 1024x1024 flying-creature
  // renders look tiny/padded), so dungeon bosses use the monster pack. Themes are
  // best-guess by index/style; verify/retune in sprites_debug.html. A bad match
  // can simply be unassigned to fall back to the geometric diamond.
  goblin_warchief:    'monster_boss_01',  // warren brute
  mycelian_king:      'monster_boss_02',  // fungal
  void_harbinger:     'monster_boss_03',  // void
  singularity_tyrant: 'monster_boss_04',  // dark/singularity
  frost_monarch:      'monster_boss_05',  // frost
  infernal_lord:      'monster_boss_06',  // fire
  plague_mother:      'monster_boss_07',  // plague
  fallen_monarch:     'monster_boss_08',  // ruined/cursed
  astral_pharaoh:     'monster_boss_09',  // astral
  // --- roaming WORLD bosses -> flying creatures / Crystal Knight (per spec) ---
  wb_event_horizon:   'flying_boss_08',  // dark devourer (void)
  wb_frost_titan:     'crystal_knight',  // animated icy Crystal Knight (frost)
  wb_ashen_worldeater:'flying_boss_12',  // red demon (fire)
  wb_plague_matriarch:'flying_boss_14',  // green/yellow (plague)
  wb_hollow_king:     'flying_boss_03',  // pale ornate (hollow/cursed)
  wb_astral_pharaoh:  'flying_boss_20',  // large single-eye (astral)
}

// boss `e.key` (MOB_DEFS / WORLD_BOSSES) -> { sheet, pair } on the boss atlases.
// EXPLICIT + data-driven (never auto-picked). Each sheet holds SIX boss blocks laid
// out 3 across x 2 down on a 9x6 frame grid; `pair` (0..5) picks the BLOCK and
// drawBossSheet animates its top-row 2 frames. Block positions:
//   pair 0 = top-left      pair 1 = top-middle     pair 2 = top-right
//   pair 3 = bottom-left   pair 4 = bottom-middle  pair 5 = bottom-right
// drawForMob consults this FIRST (before the legacy standalone bossSpriteAssignments
// and the mob sheets), so these are the active boss visuals; the legacy table stays as
// a graceful fallback if a boss sheet image is missing.
//
// Mapping by theme, matched to the actual block art:
//   sheet 01 core  -> goblin / fungal / frost / infernal dungeon bosses
//   sheet 02 v/p/a -> void / singularity / plague / cursed / astral dungeon bosses
//   sheet 03 world -> all roaming WORLD bosses (wb_*)
// To REMAP one boss to a different block, change ONLY its { sheet, pair } below.
const bossSheetAssignments = {
  // --- bosses_sheet_01_core (dungeon bosses, "core" themes) ---
  goblin_warchief:    { sheet: 'bosses_core', pair: 0 },  // top-left: armored goblin warchief
  mycelian_king:      { sheet: 'bosses_core', pair: 1 },  // top-middle: fungal/tentacle
  frost_monarch:      { sheet: 'bosses_core', pair: 3 },  // bottom-left: blue ice knight
  infernal_lord:      { sheet: 'bosses_core', pair: 4 },  // bottom-middle: fire lord
  // --- bosses_sheet_02_void_plague_astral (dark / corrupt / celestial) ---
  void_harbinger:     { sheet: 'bosses_void', pair: 0 },  // void
  singularity_tyrant: { sheet: 'bosses_void', pair: 1 },  // dark / singularity
  plague_mother:      { sheet: 'bosses_void', pair: 2 },  // plague
  fallen_monarch:     { sheet: 'bosses_void', pair: 3 },  // cursed / ruined
  astral_pharaoh:     { sheet: 'bosses_void', pair: 4 },  // astral
  // --- bosses_sheet_03_world_bosses (roaming overworld bosses) ---
  wb_event_horizon:   { sheet: 'bosses_world', pair: 0 },  // dark devourer (void)
  wb_frost_titan:     { sheet: 'bosses_world', pair: 1 },  // frost
  wb_ashen_worldeater:{ sheet: 'bosses_world', pair: 2 },  // fire
  wb_plague_matriarch:{ sheet: 'bosses_world', pair: 3 },  // plague
  wb_hollow_king:     { sheet: 'bosses_world', pair: 4 },  // hollow / cursed
  wb_astral_pharaoh:  { sheet: 'bosses_world', pair: 5 }   // astral
}
// item baseKey -> sprite ID. Obvious starter-gear examples wired; everything
// else falls back to the geometric letter icon. Maps to ITEM_BASES keys (items.js).
const itemSpriteAssignments = {
  // class starter weapons
  warrior_sword: 'weapons_0_0',  // gray sword
  rogue_daggers: 'weapons_1_0',  // bronze blade (closest)
  archer_bow:    'weapons_5_0',  // gold bow
  mage_staff:    'weapons_6_4',  // blue staff
  priest_wand:   'weapons_7_4',  // fire staff/wand
  // generic armor pieces -> closest slot icon
  iron_helm:      'armor_0_0',  // gray helm
  iron_plate:     'armor_0_1',  // silver chest
  iron_greaves:   'armor_4_2',  // brown pants
  swift_boots:    'armor_2_3',  // gold boots
  leather_gloves: 'armor_4_4',  // brown gloves
  // accessories (ring/amulet/ability) -> gem/ring icons
  band_of_might:  'armor_6_7',  // orange ring
  band_of_focus:  'armor_5_7',  // green ring
  vital_amulet:   'armor_3_7',  // blue gem
  arcane_focus:   'weapons_7_7' // blue crystal focus
}
// projectile kind/source -> sprite ID (none assigned yet; foundation only)
const projectileSpriteAssignments = {}

// --- Loader + draw helpers --------------------------------------------------
const Sprites = {
  _imgs: {},          // sheetName -> { img, loaded }  (tile sheets)
  _files: {},         // path -> { img, loaded }       (standalone image files)
  enabled: true,      // master toggle (e.g. for the debug page / fallback test)

  // Lazily load a sheet's image. Safe if the file doesn't exist yet — `loaded`
  // simply stays false and draws no-op (callers fall back to geometric art).
  sheet(name) {
    const def = SPRITE_SHEETS[name]
    if (!def) return null
    return this._load(this._imgs, name, def.path)
  },

  // Lazily load a standalone image file by path (used by `src` registry entries).
  image(path) {
    if (!path) return null
    return this._load(this._files, path, path)
  },

  // Shared lazy-load into a cache bucket. Missing files just stay `loaded:false`.
  _load(cache, key, path) {
    let rec = cache[key]
    if (!rec) {
      rec = { img: new Image(), loaded: false }
      rec.img.onload = () => { rec.loaded = true }
      rec.img.onerror = () => { rec.loaded = false }
      rec.img.src = path
      cache[key] = rec
    }
    return rec
  },

  // Return the loaded image record backing a registry entry (sheet OR file).
  _rec(e) { return e.src ? this.image(e.src) : this.sheet(e.sheet) },

  // Resolve a registry entry to source-rect px {sx,sy,sw,sh} or null. Handles
  // tile-sheet entries, whole-image `src` entries, and animated `src` entries
  // (current frame chosen from wall-clock time so no per-frame state is needed).
  rect(id) {
    const e = SPRITE_REGISTRY[id]
    if (!e) return null
    if (e.src) {
      const rec = this.image(e.src)
      if (!rec || !rec.loaded) return null
      if (e.fw) {
        const cols = e.cols || Math.max(1, (rec.img.naturalWidth / e.fw) | 0)
        const frames = e.frames || cols
        const fps = e.fps || 6
        const fi = Math.floor(Date.now() / (1000 / fps)) % frames
        return { sx: (fi % cols) * e.fw, sy: ((fi / cols) | 0) * e.fh, sw: e.fw, sh: e.fh }
      }
      return { sx: 0, sy: 0, sw: rec.img.naturalWidth, sh: rec.img.naturalHeight }
    }
    const sheet = SPRITE_SHEETS[e.sheet]
    if (!sheet) return null
    const t = sheet.tile
    const sw = e.w != null ? e.w : t
    const sh = e.h != null ? e.h : t
    const sx = e.x != null ? e.x : (e.col || 0) * t
    const sy = e.y != null ? e.y : (e.row || 0) * t
    return { sx, sy, sw, sh }
  },

  // True only when the sprite's backing image is decoded and ready to blit.
  ready(id) {
    const e = SPRITE_REGISTRY[id]
    if (!e) return false
    const rec = this._rec(e)
    return !!(rec && rec.loaded && rec.img.complete)
  },

  // Draw sprite `id` centered at (cx,cy), fit within a `size`-px box (aspect
  // preserved — the larger source dimension maps to `size`). Square tiles behave
  // exactly as before. Returns true if it drew, false if it couldn't (->fallback).
  draw(id, cx, cy, size, context) {
    if (!this.enabled) return false
    const e = SPRITE_REGISTRY[id]
    if (!e || !this.ready(id)) return false
    const r = this.rect(id)
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c || !r) return false
    const rec = this._rec(e)
    if (!rec || !rec.img) return false
    const scale = size / Math.max(r.sw, r.sh)
    const dw = r.sw * scale, dh = r.sh * scale
    // Debug-safe: a broken/partly-decoded image can throw on drawImage. Swallow
    // it and report "didn't draw" so the caller renders its geometric fallback
    // instead of crashing the render loop.
    try {
      c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, cx - dw / 2, cy - dh / 2, dw, dh)
    } catch (err) { return false }
    return true
  },

  // Draw sprite `id` into a top-left dest rect (used by the contact sheet).
  drawAt(id, dx, dy, dw, dh, context) {
    const e = SPRITE_REGISTRY[id]
    if (!e || !this.ready(id)) return false
    const r = this.rect(id)
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c || !r) return false
    const rec = this._rec(e)
    if (!rec || !rec.img) return false
    try {
      c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, dx, dy, dw, dh)
    } catch (err) { return false }
    return true
  },

  // Draw one grid tile (col,row) of a mob sheet, centered at (cx,cy) and fit to a
  // `size`-px box. Tile px is derived from the loaded image's natural size / grid
  // (handles non-power-of-two sheets like the 1254x1254 mob atlases). Returns
  // true if it drew, false otherwise (-> caller falls back to geometry).
  _drawSheetTile(sheetName, col, row, cx, cy, size, context, inset) {
    const def = SPRITE_SHEETS[sheetName]
    if (!def) return false
    const rec = this.sheet(sheetName)
    if (!rec || !rec.loaded || !rec.img.complete) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    const cols = def.cols || 8, rows = def.rows || 8
    const tw = rec.img.naturalWidth / cols, th = rec.img.naturalHeight / rows
    if (!tw || !th) return false
    // Optional crop inset: trim a fraction off each edge of the source tile so any
    // square padding/background baked into the frame is dropped and the cropped art
    // is scaled to fill the `size` box.
    let sxp = col * tw, syp = row * th, sw = tw, sh = th
    if (inset) {
      const ix = tw * inset, iy = th * inset
      sxp += ix; syp += iy; sw -= ix * 2; sh -= iy * 2
    }
    const scale = size / Math.max(sw, sh)
    const dw = sw * scale, dh = sh * scale
    try {
      c.drawImage(rec.img, sxp, syp, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh)
    } catch (err) { return false }
    return true
  },

  // Draw an assigned 2-frame mob-sheet sprite for `e` (needs `e.key`). Frame A
  // (idle/move) and frame B (active/attack) are adjacent tiles. We show frame B
  // when the mob just fired (read-only: shootTimer freshly reset toward atkSpd),
  // otherwise we alternate A/B on a slow timer so idle mobs still animate.
  drawMobSheet(e, cx, cy, size) {
    const a = e && mobSheetAssignments[e.key]
    if (!a) return false
    const base = (a.pair | 0) * 2
    const col = base % 8, row = (base / 8) | 0
    const attacking = e.atkSpd > 0 && e.shootTimer != null && e.shootTimer >= e.atkSpd - 0.18
    const animB = (Math.floor(Date.now() / 180) % 2) === 1   // ~2.8 Hz idle flip
    const useB = attacking || animB
    return this._drawSheetTile(a.sheet, col + (useB ? 1 : 0), row, cx, cy, size)
  },

  // Draw an assigned 2-frame BOSS-sheet sprite for `e` (needs `e.key`). Same proven
  // model as drawMobSheet: one assignment -> one boss, frames A/B are ADJACENT source
  // cells, the DESTINATION stays centered on (cx,cy), and only the SOURCE cell moves
  // (no sliding/duplication). Boss sheets are a 9x6 grid of SIX boss blocks (3 across x
  // 2 down); each block is its own 3x3 frame grid. A `pair` (0..5) picks the block:
  //   blockW = cols/3 (3),  blockH = rows/2 (3)
  //   slotCol = pair % 3,   slotRow = floor(pair / 3)
  //   baseCol = slotCol*blockW (block's left frame col),  baseRow = slotRow*blockH (top)
  // We animate the block's top-row frames A (baseCol) and B (baseCol+1) — exactly one
  // 170.67px cell at a time. Shows B on a fresh shot, else alternates on a slow timer so
  // idle bosses still breathe. Returns false (unmapped/unloaded) so the caller falls
  // through to the legacy boss sprite / geometry.
  drawBossSheet(e, cx, cy, size, context) {
    const a = e && bossSheetAssignments[e.key]
    if (!a) return false
    const def = SPRITE_SHEETS[a.sheet]
    if (!def) return false
    const cols = def.cols || 9, rows = def.rows || 6
    const blockW = Math.max(1, (cols / 3) | 0)   // frame cols per boss block (3)
    const blockH = Math.max(1, (rows / 2) | 0)   // frame rows per boss block (3)
    const slot = a.pair | 0
    const baseCol = (slot % 3) * blockW          // left frame col of this block
    const baseRow = ((slot / 3) | 0) * blockH    // top frame row of this block
    const attacking = e.atkSpd > 0 && e.shootTimer != null && e.shootTimer >= e.atkSpd - 0.18
    const animB = (Math.floor(Date.now() / 200) % 2) === 1   // ~2.5 Hz idle flip
    const useB = attacking || animB
    return this._drawSheetTile(a.sheet, baseCol + (useB ? 1 : 0), baseRow, cx, cy, size, context)
  },

  // Resolve a portal THEME string OR an explicit { sheet, variant } into a concrete
  // { sheet, variant }. Unknown theme -> generic 'magic' fallback sheet. Returns null
  // only if even the fallback is missing (shouldn't happen).
  portalSpec(themeOrSpec) {
    if (themeOrSpec && typeof themeOrSpec === 'object' && themeOrSpec.sheet) {
      return { sheet: themeOrSpec.sheet, variant: themeOrSpec.variant | 0 }
    }
    const a = portalVariantAssignments[themeOrSpec] || portalVariantAssignments.magic
    return a ? { sheet: a.sheet, variant: a.variant | 0 } : null
  },

  // Draw an animated portal centered at (cx,cy), fit to a `size` box. `themeOrSpec`
  // is a theme key (resolved via portalVariantAssignments) or an explicit
  // { sheet, variant }. Loops the 3 frames (idle -> swirl -> peak) on a slow timer.
  // Returns true if it drew, false (unknown/unloaded) so the caller keeps its
  // pulsing-rect fallback. SEPARATE portal path — never touches mob/item sprite maps.
  drawPortal(themeOrSpec, cx, cy, size, context) {
    const spec = this.portalSpec(themeOrSpec)
    if (!spec || !spec.sheet) return false
    const r = portalVariantRect(spec.variant)        // start col/row of this variant
    const fi = Math.floor(Date.now() / 160) % r.frames  // A->B->C loop, ~6.25 fps
    return this._drawSheetTile(spec.sheet, r.col + fi, r.row, cx, cy, size, context)
  },

  // Aura/shadow tint for a portal sheet (falls back to a generic violet).
  portalGlow(sheet) { return PORTAL_SHEET_GLOW[sheet] || '#9b6bff' },

  // hex (#rgb/#rrggbb) -> rgba() string with alpha `a`.
  _rgba(hex, a) {
    let h = (hex || '#9b6bff').replace('#', '')
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    const n = parseInt(h, 16) || 0
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`
  },

  // FULL portal entity treatment: ground shadow + soft radial aura + time-based
  // bob + subtle pulse/scale shimmer + the cropped, glowing 3-frame art. Frame
  // animation is blended with the continuous bob/glow so it never reads as a harsh
  // slideshow. `seed` (e.g. tile coords) gives each portal a stable phase so a field
  // of portals doesn't pulse in lockstep — no per-portal state object needed.
  // Call from inside drawUpright(anchor, ...) with cx,cy = 0,0 so the whole effect
  // stays screen-upright and coherent under screen rotation (like loot bags).
  // Returns true if it drew the art; false (sheet unloaded) so the caller keeps its
  // pulsing-rect fallback.
  drawPortalEntity(themeOrSpec, cx, cy, size, context, seed) {
    if (!this.enabled) return false
    const spec = this.portalSpec(themeOrSpec)
    if (!spec || !spec.sheet) return false
    const rec = this.sheet(spec.sheet)
    if (!rec || !rec.loaded || !rec.img.complete) return false   // -> caller fallback
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false

    const V = PORTAL_VIS
    const t = Date.now()
    const ph = (seed || 0) * 0.7
    const bob = Math.sin(t / V.bobSpeed + ph) * V.bobAmp
    const pulse = Math.sin(t / V.pulseSpeed + ph)   // -1..1
    const glow = this.portalGlow(spec.sheet)
    const yc = cy + bob

    // Ground shadow — flat ellipse pinned under the portal (does not bob with it).
    c.save()
    c.globalAlpha = V.shadowAlpha
    c.fillStyle = '#000'
    c.beginPath()
    c.ellipse(cx, cy + size * V.shadowDrop, size * V.shadowW * 0.5, size * V.shadowH * 0.5, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    // Soft radial aura behind the art (pulsing presence).
    const gr = size * 0.5 * V.glowSize * (1 + 0.08 * pulse)
    const ga = V.glowAlpha * (0.78 + 0.22 * pulse)
    const grad = c.createRadialGradient(cx, yc, 0, cx, yc, gr)
    grad.addColorStop(0, this._rgba(glow, ga))
    grad.addColorStop(0.55, this._rgba(glow, ga * 0.35))
    grad.addColorStop(1, this._rgba(glow, 0))
    c.save()
    c.fillStyle = grad
    c.beginPath(); c.arc(cx, yc, gr, 0, Math.PI * 2); c.fill()
    c.restore()

    // The cropped 3-frame art, scaled by the pulse, with an edge glow.
    const r = portalVariantRect(spec.variant)
    const fi = Math.floor(t / (1000 / V.fps)) % r.frames
    const scl = 1 + V.pulseAmt * pulse
    c.save()
    c.shadowBlur = V.glowBlur + (pulse + 1) * 4
    c.shadowColor = glow
    const drew = this._drawSheetTile(spec.sheet, r.col + fi, r.row, cx, yc, size * scl, c, V.cropInset)
    c.restore()
    return drew
  },

  // Convenience hook for renderMob: returns true if a mob/boss sprite was drawn.
  // Bosses (bossSpriteAssignments) take priority; creature art has wide wings/
  // padding so it's drawn a touch larger than the geometric radius. Regular +
  // dungeon mobs then try their 2-frame mob-sheet sprite; unmapped keep geometry.
  drawForMob(e, sx, sy) {
    if (!e || !e.key) return false
    // 1) NEW boss-sheet art (2-frame boss atlases) — highest priority, data-driven.
    if (this.drawBossSheet(e, sx, sy, (e.radius || 12) * 3.0)) return true
    // 2) Legacy standalone boss / registry sprite (flying creatures, crystal knight) —
    //    graceful fallback if a boss sheet is missing but a legacy entry exists.
    const id = (typeof bossSpriteAssignments !== 'undefined' && bossSpriteAssignments[e.key]) || mobSpriteAssignments[e.key]
    if (id) {
      const scale = (typeof bossSpriteAssignments !== 'undefined' && bossSpriteAssignments[e.key]) ? 2.8 : 2.2
      return this.draw(id, sx, sy, (e.radius || 12) * scale)
    }
    // 3) Regular 2-frame mob-sheet sprite; unmapped keys keep geometry.
    return this.drawMobSheet(e, sx, sy, (e.radius || 12) * 2.6)
  },

  // Convenience hook for item rendering (inventory/equipment/loot): draws the
  // assigned sprite centered at (cx,cy) sized `size` px. Returns true if drawn,
  // false to fall back to the existing letter/dot icon.
  drawForItem(it, cx, cy, size) {
    if (!it || !it.baseKey) return false
    const id = itemSpriteAssignments[it.baseKey]
    if (!id) return false
    return this.draw(id, cx, cy, size)
  }
}

// Debug helper (console-safe, no UI output): list every boss key -> sprite ID,
// its backing file, and whether the image is currently decoded/ready. Run
// `bossSpriteMap()` in devtools to audit coverage/mismatches.
function bossSpriteMap() {
  const rows = Object.keys(bossSpriteAssignments).map(k => {
    const id = bossSpriteAssignments[k]
    const e = SPRITE_REGISTRY[id]
    return {
      boss: k, sprite: id,
      file: e ? (e.src || (e.sheet + ' ' + (e.col || 0) + ',' + (e.row || 0))) : 'MISSING REGISTRY ENTRY',
      ready: typeof Sprites !== 'undefined' ? Sprites.ready(id) : false,
    }
  })
  if (typeof console !== 'undefined') { (console.table || console.log).call(console, rows) }
  return rows
}

// Expose globals (other modules + the standalone debug page read these).
if (typeof window !== 'undefined') {
  window.Sprites = Sprites
  window.bossSpriteMap = bossSpriteMap
  window.SPRITE_REGISTRY = SPRITE_REGISTRY
  window.SPRITE_SHEETS = SPRITE_SHEETS
  window.mobSpriteAssignments = mobSpriteAssignments
  window.mobSheetAssignments = mobSheetAssignments
  window.bossSpriteAssignments = bossSpriteAssignments
  window.bossSheetAssignments = bossSheetAssignments
  window.itemSpriteAssignments = itemSpriteAssignments
  window.projectileSpriteAssignments = projectileSpriteAssignments
  window.PORTAL_THEME_SHEET = PORTAL_THEME_SHEET
  window.dungeonPortalTheme = dungeonPortalTheme
  // Explicit portal variant system (read by portal_debug.html + zones).
  window.PORTAL_VARIANT_TABLE = PORTAL_VARIANT_TABLE
  window.PORTAL_SHEET_KEYS = PORTAL_SHEET_KEYS
  window.PORTAL_FRAMES = PORTAL_FRAMES
  window.PORTAL_VARIANTS_PER_ROW = PORTAL_VARIANTS_PER_ROW
  window.PORTAL_VARIANTS_PER_SHEET = PORTAL_VARIANTS_PER_SHEET
  window.portalVariantRect = portalVariantRect
  window.portalVariantAssignments = portalVariantAssignments
  window.dungeonPortalAssignments = dungeonPortalAssignments
  window.biomePortalAssignments = biomePortalAssignments
  window.dungeonPortalSpec = dungeonPortalSpec
  window.PORTAL_VIS = PORTAL_VIS                 // live-tunable portal visual config
  window.PORTAL_SHEET_GLOW = PORTAL_SHEET_GLOW
}
