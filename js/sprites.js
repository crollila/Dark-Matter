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

// --- Environment sprite master switch ---------------------------------------
// The themed env_* terrain/decor sheets don't tile the grid cleanly yet (1254x1254
// 8x8 = 156.75px cells + transparent padding), which made biomes noisy/unreadable.
// While that's being tuned, env tile rendering is GLOBALLY DISABLED — world/dungeon
// fall back to the clean basic colored tiles. The whole system (sheets, roles,
// helpers, env_debug.html) is preserved; flip this to true to re-enable. drawEnvTile
// / drawEnvObject short-circuit on it, and renderTileMap/renderDungeonTiles also gate
// on it so no env underpaint/oversize/decor touches the basic tiles.
const ENV_SPRITES_ENABLED = false

// --- Simple 32x32 terrain tile master switch --------------------------------
// The ACTIVE environment renderer. Replaces the abandoned large env atlas above:
// instead of slicing a packed 1254x1254 sheet (which never tiled the grid cleanly),
// each terrain visual is its OWN exact 32x32 PNG (assets/sprites/tiles/tile_*.png) drawn
// directly into one map tile — no slicing/grid math. Registered in SIMPLE_TILE_IMAGES;
// biome/dungeon roles mapped in SIMPLE_TILE_THEMES (aliased BIOME_TILE_MAP /
// DUNGEON_TILE_MAP). renderTileMap / renderDungeonTiles call Sprites.drawSimpleTile;
// any unmapped/unloaded tile returns false → the existing flat colored tile shows.
// Keep ENV_SPRITES_ENABLED false (old atlas dormant) while this stays true.
const SIMPLE_ENV_TILES_ENABLED = true

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
  bosses_world: { path: 'assets/sprites/bosses_sheet_03_world_bosses.png',       cols: 9, rows: 6 },

  // --- Gear ICON sheets (static item icons for inventory/equip/loot/wiki) ------
  // Two 1254x1254 sheets. Despite the "32" naming convention used elsewhere, the
  // SOURCE is NOT a clean 32px grid (1254/32 = 39.2, non-integer); it IS a clean
  // 8x8 grid (1254/8 = 156.75 per cell, same convention as the mob/portal atlases).
  // So `cols:8, rows:8` and cells are addressed by grid FRACTION of the loaded
  // image's natural size (via _drawSheetTile) — a re-export at another resolution
  // won't break layout. Exactly ONE 8x8 cell is sampled per icon (no multi-cell
  // blocks). Slot/item -> cell mapping lives in the assignment tables below
  // (itemSlotIconAssignments + itemIconAssignments) — edit one line to remap.
  //   gear_armor_icons                    -> helmet/chest/hands/pants/boots
  //   gear_accessory_ability_relic_icons  -> ring/amulet/ability/relic/accessory
  gear_armor_icons:                   { path: 'assets/sprites/gear_armor_icons.png',                   cols: 8, rows: 8 },
  gear_accessory_ability_relic_icons: { path: 'assets/sprites/gear_accessory_ability_relic_icons.png', cols: 8, rows: 8 },

  // --- Projectile sheets (player + boss/enemy shot sprites) --------------------
  // Two 1254x1254 sheets, same clean 8x8 grid (156.75px cells, addressed by grid
  // fraction). The "32" naming = intended on-screen size, not the source cell px.
  // Exactly ONE cell is sampled per projectile (no multi-cell sampling); optional
  // animation steps to ADJACENT cells on the same row (see _drawRotatedTile +
  // the `frames`/`fps` fields). Shot -> cell mapping lives in the projectile
  // assignment tables below (projectileWeaponAssignments / projectileBossAssignments).
  //   projectiles_weapons -> player weapon shots (keyed by class/weapon family)
  //   projectiles_bosses  -> boss/enemy shots (keyed by boss/mob key)
  projectiles_weapons: { path: 'assets/sprites/projectiles_weapons_32.png', cols: 8, rows: 8 },
  projectiles_bosses:  { path: 'assets/sprites/projectiles_bosses_32.png',  cols: 8, rows: 8 },

  // --- Environment sheets (biome + dungeon terrain: floors/walls/hazards/decor) -
  // 9 themed sheets, each 1254x1254 = a clean 8x8 grid (156.75px cells, addressed
  // by grid FRACTION via _drawSheetTile; the implied "32" cell size is the display
  // target, not the source px). First-pass row interpretation (shared layout, see
  // ENV_ROLE_ASSIGNMENTS): TOP rows = ground/floor/path, upper rows = wall/edges,
  // MIDDLE rows = decor/props, LOWER rows = hazards/liquids/structures. Exactly ONE
  // cell is sampled per tile/decor (never a multi-cell block). VISUAL-ONLY — see
  // the theme/role tables + Sprites.drawEnvTile below; generation/collision/hazards
  // are untouched (the flat-color tile fill remains as the fallback).
  env_neutral:  { path: 'assets/sprites/env_neutral.png',  cols: 8, rows: 8 },
  env_forest:   { path: 'assets/sprites/env_forest.png',   cols: 8, rows: 8 },
  env_goblin:   { path: 'assets/sprites/env_goblin.png',   cols: 8, rows: 8 },
  env_fungal:   { path: 'assets/sprites/env_fungal.png',   cols: 8, rows: 8 },
  env_void:     { path: 'assets/sprites/env_void.png',     cols: 8, rows: 8 },
  env_frost:    { path: 'assets/sprites/env_frost.png',    cols: 8, rows: 8 },
  env_infernal: { path: 'assets/sprites/env_infernal.png', cols: 8, rows: 8 },
  env_cursed:   { path: 'assets/sprites/env_cursed.png',   cols: 8, rows: 8 },
  env_plague:   { path: 'assets/sprites/env_plague.png',   cols: 8, rows: 8 }
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
  forest:   { sheet: 'portal_forest',      variant: 1 }, // forest / grove / nature  -> sheet 05
  fungal:   { sheet: 'portal_fungal',      variant: 2 }, // fungal / mushroom         -> sheet 09
  infernal: { sheet: 'portal_infernal',    variant: 3 }, // infernal / ash / fire     -> sheet 06
  plague:   { sheet: 'portal_plague',      variant: 4 }, // plague / corruption / rot -> sheet 07
  frost:    { sheet: 'portal_ice',         variant: 5 }, // frost / ice               -> sheet 03
  void:     { sheet: 'portal_void_dark',   variant: 6 }, // void / dark / singularity -> sheet 04
  arcane:   { sheet: 'portal_void_arcane', variant: 7 }, // arcane / dark-matter      -> sheet 01
  astral:   { sheet: 'portal_astral',      variant: 8 }, // astral / celestial        -> sheet 08
  cursed:   { sheet: 'portal_cursed',      variant: 9 }, // cursed/hollow/fallen/court-> sheet 10
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
  // OG dungeons — explicit { sheet, variant } so each portal looks distinct.
  goblin_warren:      { sheet: 'portal_forest',      variant: 1 },
  fungal_cavern:      { sheet: 'portal_fungal',      variant: 2 },
  void_rift:          { sheet: 'portal_void_dark',   variant: 6 },
  // biome dungeons
  dark_matter_core:   { sheet: 'portal_void_arcane', variant: 7 },
  frozen_catacombs:   { sheet: 'portal_ice',         variant: 5 },
  infernal_pit:       { sheet: 'portal_infernal',    variant: 3 },
  plague_grotto:      { sheet: 'portal_plague',      variant: 4 },
  fallen_keep:        { sheet: 'portal_cursed',      variant: 9 },
  astral_tomb:        { sheet: 'portal_astral',      variant: 8 },
  // world-boss dungeons — higher variant indices for a unique look per portal
  event_horizon_vault:{ sheet: 'portal_void_arcane', variant: 10 },
  titan_glacier:      { sheet: 'portal_ice',         variant: 11 },
  worldeater_forge:   { sheet: 'portal_infernal',    variant: 12 },
  plague_hive:        { sheet: 'portal_plague',      variant: 13 },
  cursed_throne:      { sheet: 'portal_cursed',      variant: 14 },
  starfall_pyramid:   { sheet: 'portal_astral',      variant: 15 }
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
  // motion / shimmer (the portal "breathes" and bobs so it never reads as a static tile)
  bobAmp: 3.2,        // (a.k.a. bobAmplitude) px vertical bob (screen-space, like loot bags)
  bobSpeed: 520,      // ms time-divisor for the bob sine
  pulseSpeed: 360,    // ms time-divisor for the glow/scale shimmer sine
  pulseAmt: 0.07,     // (a.k.a. pulseAmount) +/- scale shimmer fraction (subtle breathing)
  spinSpeed: 3200,    // ms time-divisor for the vortex SWIRL (art slowly rotates in its disc); 0 = no spin
  // CIRCULAR portal body — the art is clipped to this disc so the square sheet-tile
  // edges disappear and the portal reads as a round glowing vortex.
  coreScale: 0.94,    // disc radius as a fraction of the half-size box
  artScale: 1.22,     // art drawn this much larger than the disc so it fills edge-to-edge
  artCropInset: 0.16, // fraction cropped off each sheet-tile edge BEFORE clipping (drops square padding; tighter than the legacy cropInset since we also circle-clip)
  coreBloom: 0.9,     // inner energy-core bloom radius as a fraction of the disc
  coreAlpha: 0.5,     // inner energy-core brightness (additive)
  rimAlpha: 0.5,      // glowing rim-ring alpha that defines the circular edge (0 = no ring)
  particles: 3,       // # of orbiting themed sparks (0 = none) — cheap, time-based
  // aura / glow
  glowAlpha: 0.6,     // base radial aura alpha
  glowSize: 2.1,      // (a.k.a. glowRadius) aura radius as a multiple of the portal half-size
  glowBlur: 14,       // shadowBlur added to the portal art (edge glow)
  // ground anchor
  shadowW: 0.62,      // (a.k.a. shadowSize) ground shadow width as a fraction of size
  shadowH: 0.2,       // ground shadow height as a fraction of size
  shadowAlpha: 0.32,  // ground shadow darkness
  shadowDrop: 0.34,   // shadow vertical offset below center as a fraction of size
  fps: 7,             // sheet-frame animation rate (blended with bob/glow/spin so it reads smooth, not slideshow)
  cropInset: 0.07     // LEGACY fallback crop if artCropInset is unset (kept for back-compat)
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

// --- Playable class sprites (whole-image PNGs in assets/sprites/Classes/) -----
// Real per-class character art, one standalone PNG each (drawn whole, aspect-fit,
// transparent background preserved). VISUAL-ONLY: in-game player rendering and the
// character-select / new-character screens use these via Sprites.drawClassSprite;
// the geometric class shape stays the graceful fallback when a file is missing or
// not yet loaded. Only the 5 current playable classes are registered here.
Object.assign(SPRITE_REGISTRY, {
  class_warrior: { src: 'assets/sprites/Classes/Warrior.png', category: 'character' },
  class_rogue:   { src: 'assets/sprites/Classes/Rogue.png',   category: 'character' },
  class_mage:    { src: 'assets/sprites/Classes/Wizard.png',  category: 'character' },
  class_priest:  { src: 'assets/sprites/Classes/Priest.png',  category: 'character' },
  class_archer:  { src: 'assets/sprites/Classes/Archer.png',  category: 'character' },
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

// boss `e.key` -> NEW standalone boss PNG path (the subfoldered art the user added).
// Checked FIRST in drawForMob (highest priority); a missing/unloaded file returns
// false and falls through to the boss sheets / legacy art / geometry (never crashes).
// Dungeon bosses use the themed `Bosses/` files; world bosses use `Event Gods/`.
// Mapping is by theme/name (closest match). UNMAPPED bosses (e.g. wb_frost_titan ->
// keeps the icy crystal_knight) intentionally fall back to existing art.
const bossFileAssignments = {
  // --- dungeon bosses -> assets/sprites/Bosses/ (themed) ---
  goblin_warchief:    'assets/sprites/Bosses/Goblin_boss_1.png',
  mycelian_king:      'assets/sprites/Bosses/fungal_boss_1.png',
  frost_monarch:      'assets/sprites/Bosses/ice_boss_1.png',
  infernal_lord:      'assets/sprites/Bosses/infernal_boss_1.png',
  void_harbinger:     'assets/sprites/Bosses/voidharb_boss_1.png',
  singularity_tyrant: 'assets/sprites/Bosses/void_boss_1.png',
  plague_mother:      'assets/sprites/Bosses/poison_boss_1.png',
  fallen_monarch:     'assets/sprites/Bosses/undead_boss_1.png',
  astral_pharaoh:     'assets/sprites/Bosses/Pharoh_boss_1.png',
  // --- world / event bosses -> assets/sprites/Event Gods/ (closest god match) ---
  wb_event_horizon:   'assets/sprites/Event Gods/Cube God.png',     // void/cosmic
  wb_ashen_worldeater:'assets/sprites/Event Gods/red demon.png',    // fire/ash
  wb_plague_matriarch:'assets/sprites/Event Gods/Worm Father.png',  // infestation/plague
  wb_hollow_king:     'assets/sprites/Event Gods/Lich.png',         // undead king
  wb_astral_pharaoh:  'assets/sprites/Event Gods/Grand Sphinz.png', // sphinx/desert
  // wb_frost_titan: (unmapped) -> falls back to the icy crystal_knight art.
}

// boss `e.key` -> POWERUP-phase PNG (themed charge art in assets/sprites/Bosses/).
// Drawn by renderMob over the boss WHILE it is charging (e.wbCharging). Missing/
// unloaded file => only the pulsing telegraph ring shows (graceful fallback).
const bossPowerupAssignments = {
  wb_event_horizon:   'assets/sprites/Bosses/void_boss_powerup_1.png',
  wb_frost_titan:     'assets/sprites/Bosses/ice_boss_power_up_1.png',
  wb_ashen_worldeater:'assets/sprites/Bosses/infernal_boss_power_up_1.png',
  wb_plague_matriarch:'assets/sprites/Bosses/plague_mother_powerup_1.png',
  wb_hollow_king:     'assets/sprites/Bosses/void_boss_powerup_2.png',
  wb_astral_pharaoh:  'assets/sprites/Bosses/Pharoh_boss_powerup_1.png',
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
  // dungeon-exclusive weapons (frost/etc. identity comes from rarity/shot art)
  dx_graviton_staff:   'weapons_6_4',  // dark/arcane staff
  fz_glacial_longbow:  'weapons_5_0',  // bow
  if_magma_cleaver:    'weapons_2_0',  // fire/gold sword
  pg_venomfang_daggers:'weapons_1_0',  // dagger/blade
  fk_oathbreaker_blade:'weapons_0_4',  // void/purple cursed sword
  at_astral_scepter:   'weapons_7_7',  // crystal/scepter
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
// projectile kind/source -> sprite ID (legacy/back-compat; superseded by the
// projectileWeaponAssignments / projectileBossAssignments tables below).
const projectileSpriteAssignments = {}

// Character CLASS -> standalone class-sprite registry ID (real PNGs registered
// above from assets/sprites/Classes/). VISUAL-ONLY: the geometric class shape in
// ui.js renderPlayer is the graceful fallback, and the sprite is drawn UPRIGHT
// there so screen rotation never tilts it. Only the 5 current playable classes are
// wired; add a line here when a future class becomes playable (and register its
// PNG in SPRITE_REGISTRY above). Same map drives the character-select / new-
// character screens so class art stays consistent everywhere.
const classSpriteAssignments = {
  warrior: 'class_warrior',
  rogue:   'class_rogue',
  mage:    'class_mage',
  priest:  'class_priest',
  archer:  'class_archer',
}
// Back-compat alias (older name referenced elsewhere).
const characterSpriteAssignments = classSpriteAssignments

// === GEAR ICON SYSTEM (new 8x8 icon sheets) =================================
// Item icons are chosen EXPLICITLY (never auto-picked) in two tables:
//   1) itemSlotIconAssignments  — by item SLOT (the default, covers every item
//      of that slot from the gear icon sheets).
//   2) itemIconAssignments      — by item baseKey (per-item OVERRIDE; wins over
//      the slot default). Add a line here only when one item needs a unique icon.
// Each value is { sheet, col, row } OR { sheet, index } (index = row-major over
// the sheet's cols). Weapons are intentionally NOT mapped here so they keep their
// existing weapon art / placeholder (see itemSpriteAssignments). Anything
// unmapped falls back to the geometric rarity/letter icon.
//
// NOTE: the exact cell for each slot is a FIRST-PASS guess (the sheets are 8x8 =
// 64 icons; layout was assumed one row-start per piece type). Retune any line by
// changing its col/row — nothing else depends on these coordinates.
const itemSlotIconAssignments = {
  // gear_armor_icons.png — armor pieces
  helmet: { sheet: 'gear_armor_icons', col: 0, row: 0 },
  chest:  { sheet: 'gear_armor_icons', col: 0, row: 1 },
  hands:  { sheet: 'gear_armor_icons', col: 0, row: 2 },
  pants:  { sheet: 'gear_armor_icons', col: 0, row: 3 },
  boots:  { sheet: 'gear_armor_icons', col: 0, row: 4 },
  // gear_accessory_ability_relic_icons.png — accessories / ability / relic
  ring:    { sheet: 'gear_accessory_ability_relic_icons', col: 0, row: 0 },
  amulet:  { sheet: 'gear_accessory_ability_relic_icons', col: 0, row: 1 },
  ability: { sheet: 'gear_accessory_ability_relic_icons', col: 0, row: 2 },
  relic:   { sheet: 'gear_accessory_ability_relic_icons', col: 0, row: 3 },
  accessory:{ sheet: 'gear_accessory_ability_relic_icons', col: 0, row: 4 }
}

// Per-item icon overrides (baseKey -> { sheet, col, row } | { sheet, index }).
// Empty by default — every item uses its slot icon. Add a line to give one
// specific item a distinct icon, e.g.  vital_amulet: { sheet:'gear_accessory_ability_relic_icons', col:3, row:1 }
const itemIconAssignments = {}

// === PROJECTILE SPRITE SYSTEM (new 8x8 projectile sheets) ===================
// Shot visuals are chosen EXPLICITLY here; rendering is VISUAL-ONLY (never
// changes bullet speed/damage/hitbox/lifetime/collision — see engine.js
// renderBullets). Each value is { sheet, col, row } OR { sheet, index }, plus an
// optional { frames, fps } for a tiny same-row animation (default = one stable
// cell) and an optional { angleOffset } radians if the art's "forward" isn't +x.

// Player weapon shots keyed by character class (weapons are class-locked, so
// class == weapon family). Bullets carry the firer's class as a visual `kind`.
// Unmapped -> the existing cyan circle. First-pass cells; retune freely.
const projectileWeaponAssignments = {
  warrior: { sheet: 'projectiles_weapons', col: 0, row: 0 },
  rogue:   { sheet: 'projectiles_weapons', col: 1, row: 0 },
  archer:  { sheet: 'projectiles_weapons', col: 2, row: 0 },
  mage:    { sheet: 'projectiles_weapons', col: 3, row: 0, frames: 2, fps: 8 },
  priest:  { sheet: 'projectiles_weapons', col: 4, row: 0, frames: 2, fps: 8 }
}

// Boss/enemy shots keyed by mob/boss key (e.key). Bullets carry the firer's key
// as a visual `kind`. Bosses get distinct cells (rows 0-1); regular mobs share a
// per-biome cell (rows 2+). Unmapped -> the existing orange circle. First-pass
// cells; retune freely (change one { sheet,col,row } line per shooter).
const projectileBossAssignments = {
  // --- dungeon + world bosses (one cell each) ---
  goblin_warchief:     { sheet: 'projectiles_bosses', col: 0, row: 0 },
  mycelian_king:       { sheet: 'projectiles_bosses', col: 1, row: 0 },
  void_harbinger:      { sheet: 'projectiles_bosses', col: 2, row: 0, frames: 2, fps: 8 },
  singularity_tyrant:  { sheet: 'projectiles_bosses', col: 3, row: 0, frames: 2, fps: 8 },
  frost_monarch:       { sheet: 'projectiles_bosses', col: 4, row: 0 },
  infernal_lord:       { sheet: 'projectiles_bosses', col: 5, row: 0, frames: 2, fps: 8 },
  plague_mother:       { sheet: 'projectiles_bosses', col: 6, row: 0, frames: 2, fps: 8 },
  fallen_monarch:      { sheet: 'projectiles_bosses', col: 7, row: 0 },
  astral_pharaoh:      { sheet: 'projectiles_bosses', col: 0, row: 1, frames: 2, fps: 8 },
  wb_event_horizon:    { sheet: 'projectiles_bosses', col: 1, row: 1, frames: 2, fps: 8 },
  wb_frost_titan:      { sheet: 'projectiles_bosses', col: 2, row: 1 },
  wb_ashen_worldeater: { sheet: 'projectiles_bosses', col: 3, row: 1, frames: 2, fps: 10 },
  wb_plague_matriarch: { sheet: 'projectiles_bosses', col: 4, row: 1, frames: 2, fps: 8 },
  wb_hollow_king:      { sheet: 'projectiles_bosses', col: 5, row: 1 },
  wb_astral_pharaoh:   { sheet: 'projectiles_bosses', col: 6, row: 1, frames: 2, fps: 8 },
  // --- regular mobs by biome theme (share a cell; remap individually if wanted) ---
  // forest / goblin / fungal
  forest_sprite:  { sheet: 'projectiles_bosses', col: 0, row: 2 },
  goblin_scout:   { sheet: 'projectiles_bosses', col: 1, row: 2 },
  goblin_brute:   { sheet: 'projectiles_bosses', col: 1, row: 2 },
  goblin_shaman:  { sheet: 'projectiles_bosses', col: 1, row: 2 },
  cave_bat:       { sheet: 'projectiles_bosses', col: 2, row: 2 },
  fungal_shroom:  { sheet: 'projectiles_bosses', col: 2, row: 2 },
  mycelian_drone: { sheet: 'projectiles_bosses', col: 2, row: 2 },
  // void / dark matter
  void_wisp:     { sheet: 'projectiles_bosses', col: 3, row: 2 },
  rift_stalker:  { sheet: 'projectiles_bosses', col: 3, row: 2 },
  null_orbiter:  { sheet: 'projectiles_bosses', col: 3, row: 2 },
  matter_wraith: { sheet: 'projectiles_bosses', col: 3, row: 2 },
  gravity_maw:   { sheet: 'projectiles_bosses', col: 3, row: 2 },
  null_apostle:  { sheet: 'projectiles_bosses', col: 3, row: 2 },
  // frost
  frost_skater:    { sheet: 'projectiles_bosses', col: 4, row: 2 },
  icebound_archer: { sheet: 'projectiles_bosses', col: 4, row: 2 },
  snow_golem:      { sheet: 'projectiles_bosses', col: 4, row: 2 },
  // infernal
  ember_imp:    { sheet: 'projectiles_bosses', col: 5, row: 2 },
  chainscourge: { sheet: 'projectiles_bosses', col: 5, row: 2 },
  lava_brute:   { sheet: 'projectiles_bosses', col: 5, row: 2 },
  // plague
  spore_crawler:   { sheet: 'projectiles_bosses', col: 6, row: 2 },
  venom_cap:       { sheet: 'projectiles_bosses', col: 6, row: 2 },
  mycelium_horror: { sheet: 'projectiles_bosses', col: 6, row: 2 },
  // cursed
  fallen_squire: { sheet: 'projectiles_bosses', col: 7, row: 2 },
  cursed_archer: { sheet: 'projectiles_bosses', col: 7, row: 2 },
  grave_priest:  { sheet: 'projectiles_bosses', col: 7, row: 2 },
  // astral
  star_scarab:    { sheet: 'projectiles_bosses', col: 0, row: 3 },
  mirage_stalker: { sheet: 'projectiles_bosses', col: 0, row: 3 },
  sunseer:        { sheet: 'projectiles_bosses', col: 0, row: 3 }
}

// === ENVIRONMENT TILE/DECOR SYSTEM (data-driven, easy to remap) =============
// All choices below are EXPLICIT (never auto-picked from training). VISUAL-ONLY:
// nothing here changes generation, collision, hazards, portals, mobs, loot, or
// stations — callers keep their flat-color fill as the fallback. Deterministic
// per-tile variant selection (by tile coords) means no frame-to-frame flicker.

// theme key -> sheet name.
const ENV_SHEET_BY_THEME = {
  neutral:  'env_neutral',
  forest:   'env_forest',
  goblin:   'env_goblin',
  fungal:   'env_fungal',
  void:     'env_void',
  frost:    'env_frost',
  infernal: 'env_infernal',
  cursed:   'env_cursed',
  plague:   'env_plague'
}

// === TWO SEPARATE environment concepts (never mixed) ========================
// 1. ENV_TERRAIN_ROLES  — true ground/wall/liquid TILES; exactly ONE fills each
//    map cell (floor/floorAlt/path/wall/wallAlt/hazard/water/specialFloor).
// 2. ENV_OBJECT_ROLES   — props/decor (tree/rock/crystal/...) drawn ON TOP of a
//    terrain tile, sparse + deterministic. Object cells must NEVER be used as
//    terrain.
// Both are PER-THEME — the 9 env sheets do NOT share a layout (verified from the
// art). Every entry is a {col,row} into that theme's 8x8 sheet. Cells are a
// first pass, tuned visually via env_debug.html; nothing else depends on them.
// Only obvious ground/stone/liquid cells go in terrain; special/symbol/lava/
// vortex cells are kept OUT of plain floor (they're hazard/specialFloor only).
const ENV_TERRAIN_ROLES = {
  neutral: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0},{col:3,row:0},{col:4,row:0} ],
    floorAlt:     [ {col:1,row:0},{col:3,row:0} ],
    path:         [ {col:5,row:0},{col:3,row:1},{col:4,row:1},{col:5,row:1} ],
    wall:         [ {col:6,row:0},{col:7,row:0} ],
    wallAlt:      [ {col:6,row:1},{col:7,row:1} ],
    water:        [ {col:0,row:6},{col:1,row:6},{col:2,row:6} ],
    specialFloor: [ {col:4,row:7} ]
  },
  forest: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0},{col:3,row:0},{col:4,row:0} ],
    floorAlt:     [ {col:0,row:2},{col:1,row:2} ],
    path:         [ {col:0,row:1},{col:1,row:1} ],
    wall:         [ {col:6,row:1},{col:7,row:1} ],
    water:        [ {col:4,row:7},{col:5,row:7} ]
  },
  goblin: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0} ],
    floorAlt:     [ {col:4,row:0},{col:5,row:0} ],
    path:         [ {col:3,row:0} ],
    wall:         [ {col:0,row:5},{col:1,row:5},{col:2,row:5} ],
    hazard:       [ {col:0,row:7} ],
    specialFloor: [ {col:6,row:0} ]
  },
  fungal: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0} ],
    floorAlt:     [ {col:4,row:0},{col:5,row:0},{col:6,row:0} ],
    wall:         [ {col:0,row:6},{col:1,row:6} ],
    hazard:       [ {col:0,row:5},{col:1,row:5} ],
    water:        [ {col:2,row:5},{col:3,row:5} ],
    specialFloor: [ {col:3,row:0} ]
  },
  void: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:0,row:1},{col:1,row:1} ],
    floorAlt:     [ {col:4,row:0},{col:2,row:1} ],
    wall:         [ {col:0,row:2},{col:1,row:2} ],
    wallAlt:      [ {col:6,row:2},{col:7,row:2} ],
    hazard:       [ {col:3,row:1},{col:5,row:1} ],
    water:        [ {col:0,row:4},{col:1,row:4} ],
    specialFloor: [ {col:0,row:3},{col:1,row:3} ]
  },
  frost: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0} ],
    floorAlt:     [ {col:3,row:0},{col:4,row:0},{col:5,row:0} ],
    path:         [ {col:2,row:0} ],
    wall:         [ {col:0,row:1},{col:1,row:1} ],
    hazard:       [ {col:3,row:1},{col:4,row:1} ],
    water:        [ {col:0,row:6},{col:1,row:6} ],
    specialFloor: [ {col:0,row:5},{col:1,row:5} ]
  },
  infernal: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:3,row:0},{col:4,row:0} ],
    floorAlt:     [ {col:5,row:0} ],
    wall:         [ {col:0,row:4},{col:1,row:4} ],
    hazard:       [ {col:0,row:1},{col:1,row:1},{col:2,row:1} ],
    specialFloor: [ {col:0,row:2},{col:1,row:2} ]
  },
  cursed: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0} ],
    floorAlt:     [ {col:0,row:1},{col:1,row:1} ],
    path:         [ {col:3,row:0},{col:4,row:0} ],
    wall:         [ {col:0,row:6},{col:1,row:6} ],
    hazard:       [ {col:5,row:0},{col:6,row:0} ],
    specialFloor: [ {col:3,row:1},{col:4,row:1} ]
  },
  plague: {
    floor:        [ {col:0,row:0},{col:1,row:0},{col:2,row:0} ],
    floorAlt:     [ {col:1,row:1},{col:2,row:1} ],
    wall:         [ {col:0,row:4},{col:1,row:4} ],
    hazard:       [ {col:4,row:0},{col:3,row:1} ],
    water:        [ {col:5,row:0} ],
    specialFloor: [ {col:6,row:1} ]
  }
}

// Object/decor cells per theme (taxonomy role -> candidate cells). These draw ON
// TOP of a terrain tile via Sprites.drawEnvObject — never as terrain. ENV_OBJECT_
// RULES (below) decides which of these roles feed the sparse small/large passes.
const ENV_OBJECT_ROLES = {
  neutral: {
    tree:      [ {col:3,row:3},{col:4,row:3} ],
    bush:      [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    rock:      [ {col:4,row:2},{col:5,row:2},{col:6,row:2},{col:7,row:2} ],
    plant:     [ {col:4,row:4},{col:5,row:4},{col:6,row:4},{col:7,row:4} ],
    smallDecor:[ {col:0,row:4},{col:1,row:4},{col:2,row:4},{col:3,row:4} ],
    fence:     [ {col:2,row:5},{col:3,row:5},{col:1,row:2} ],
    campProp:  [ {col:4,row:5},{col:5,row:5},{col:6,row:5},{col:7,row:5} ],
    ruin:      [ {col:0,row:7},{col:2,row:7},{col:3,row:7} ],
    pillar:    [ {col:1,row:7} ],
    miscProp:  [ {col:0,row:5},{col:1,row:5},{col:6,row:3},{col:7,row:3} ]
  },
  forest: {
    stump:     [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    tree:      [ {col:0,row:4},{col:1,row:4},{col:2,row:4},{col:3,row:4} ],
    bush:      [ {col:4,row:3},{col:5,row:3},{col:6,row:3} ],
    log:       [ {col:5,row:4},{col:6,row:4},{col:7,row:4} ],
    rock:      [ {col:0,row:5},{col:1,row:5},{col:2,row:5},{col:3,row:5} ],
    ruin:      [ {col:4,row:5},{col:5,row:5},{col:6,row:5},{col:7,row:5} ],
    plant:     [ {col:0,row:6},{col:1,row:6},{col:2,row:6},{col:3,row:6} ],
    mushroom:  [ {col:4,row:6},{col:5,row:6} ],
    smallDecor:[ {col:0,row:6},{col:1,row:6},{col:2,row:6},{col:3,row:6} ],
    fence:     [ {col:0,row:7},{col:1,row:7},{col:2,row:7},{col:3,row:7} ]
  },
  goblin: {
    tent:      [ {col:0,row:2},{col:1,row:2} ],
    cage:      [ {col:2,row:2},{col:4,row:2} ],
    gate:      [ {col:3,row:2} ],
    totem:     [ {col:5,row:2} ],
    barrel:    [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    campfire:  [ {col:3,row:3},{col:4,row:3} ],
    bone:      [ {col:5,row:3},{col:5,row:4} ],
    banner:    [ {col:2,row:4},{col:7,row:1} ],
    skull:     [ {col:0,row:4},{col:1,row:4} ],
    spike:     [ {col:1,row:1},{col:2,row:1},{col:3,row:1},{col:4,row:1} ],
    rock:      [ {col:0,row:6},{col:1,row:6},{col:2,row:6},{col:3,row:6} ],
    fence:     [ {col:4,row:6},{col:5,row:6},{col:6,row:6} ],
    smallDecor:[ {col:0,row:6},{col:5,row:4},{col:6,row:4} ]
  },
  fungal: {
    mushroom:  [ {col:0,row:1},{col:1,row:1},{col:2,row:1},{col:3,row:1},{col:4,row:1} ],
    bigShroom: [ {col:0,row:2},{col:1,row:2},{col:2,row:2} ],
    stump:     [ {col:3,row:2},{col:4,row:2},{col:5,row:2},{col:6,row:2} ],
    pod:       [ {col:0,row:3},{col:1,row:3},{col:2,row:3},{col:3,row:3} ],
    fleshpod:  [ {col:4,row:3},{col:5,row:3},{col:6,row:3} ],
    root:      [ {col:0,row:4},{col:1,row:4},{col:2,row:4},{col:3,row:4} ],
    tendril:   [ {col:4,row:4},{col:5,row:4},{col:6,row:4} ],
    crystal:   [ {col:0,row:7},{col:1,row:7},{col:2,row:7} ],
    smallDecor:[ {col:5,row:1},{col:6,row:1},{col:3,row:7},{col:4,row:7} ]
  },
  void: {
    crystal:   [ {col:0,row:5},{col:1,row:5},{col:5,row:5},{col:6,row:5},{col:7,row:5} ],
    obelisk:   [ {col:2,row:5},{col:3,row:5},{col:4,row:5} ],
    rock:      [ {col:0,row:6},{col:1,row:6},{col:2,row:6},{col:3,row:6} ],
    eye:       [ {col:0,row:7},{col:1,row:7},{col:2,row:7},{col:3,row:7} ],
    coral:     [ {col:4,row:4},{col:4,row:7},{col:5,row:7} ],
    orb:       [ {col:5,row:4},{col:6,row:4} ],
    smallDecor:[ {col:0,row:6},{col:1,row:6},{col:6,row:7},{col:7,row:7} ]
  },
  frost: {
    crystal:   [ {col:0,row:2},{col:1,row:2},{col:2,row:2},{col:3,row:2},{col:7,row:2} ],
    pillar:    [ {col:4,row:2},{col:5,row:2},{col:6,row:2} ],
    snowdrift: [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    iceChunk:  [ {col:0,row:4},{col:1,row:4},{col:2,row:4} ],
    ruin:      [ {col:3,row:4},{col:4,row:4},{col:5,row:4},{col:6,row:4} ],
    brazier:   [ {col:4,row:5},{col:5,row:5} ],
    bone:      [ {col:0,row:7},{col:1,row:7},{col:2,row:7} ],
    smallDecor:[ {col:4,row:7},{col:5,row:7},{col:6,row:7},{col:7,row:7} ]
  },
  infernal: {
    spike:     [ {col:5,row:1},{col:6,row:1} ],
    brazier:   [ {col:4,row:2},{col:5,row:2} ],
    cage:      [ {col:6,row:2} ],
    pillar:    [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    altar:     [ {col:3,row:3},{col:4,row:3} ],
    chain:     [ {col:5,row:3},{col:6,row:3} ],
    bone:      [ {col:4,row:4},{col:5,row:4},{col:6,row:4} ],
    crystal:   [ {col:3,row:5},{col:5,row:5} ],
    rock:      [ {col:1,row:5},{col:4,row:5} ],
    skull:     [ {col:0,row:5},{col:2,row:5} ],
    smallDecor:[ {col:0,row:5},{col:2,row:5},{col:1,row:6} ]
  },
  cursed: {
    skullpile: [ {col:0,row:2},{col:1,row:2} ],
    coffin:    [ {col:2,row:2},{col:3,row:2} ],
    grave:     [ {col:4,row:2},{col:5,row:2} ],
    bone:      [ {col:6,row:2} ],
    statue:    [ {col:0,row:3},{col:1,row:3} ],
    rubble:    [ {col:2,row:3} ],
    column:    [ {col:3,row:3},{col:4,row:3} ],
    deadtree:  [ {col:5,row:3},{col:6,row:3},{col:7,row:3} ],
    brazier:   [ {col:0,row:4},{col:1,row:4},{col:2,row:4} ],
    gate:      [ {col:3,row:4},{col:4,row:4} ],
    ghost:     [ {col:4,row:7},{col:5,row:7},{col:6,row:7} ],
    smallDecor:[ {col:6,row:2},{col:2,row:3} ]
  },
  plague: {
    bonepile:  [ {col:0,row:2},{col:1,row:2} ],
    planks:    [ {col:2,row:2} ],
    barrel:    [ {col:3,row:2},{col:4,row:2},{col:5,row:2} ],
    pipe:      [ {col:6,row:2} ],
    cauldron:  [ {col:0,row:3},{col:1,row:3},{col:2,row:3} ],
    sac:       [ {col:3,row:3},{col:4,row:3} ],
    fungus:    [ {col:5,row:3},{col:6,row:3} ],
    chain:     [ {col:0,row:5},{col:1,row:5} ],
    cage:      [ {col:2,row:5} ],
    plant:     [ {col:0,row:6},{col:1,row:6},{col:2,row:6},{col:3,row:6} ],
    smallDecor:[ {col:4,row:6},{col:5,row:6},{col:6,row:6},{col:7,row:6} ]
  }
}

// Tile-type name -> env role (callers translate their T_* constant to a name so
// sprites.js stays standalone — it must NOT reference engine globals at load).
const envHazardAssignments = { lava: 'hazard', ice: 'hazard', water: 'water' }

// Object/decor density per theme: chance (0..1) a walkable floor tile gets a
// SMALL prop, and the much rarer LARGE prop chance. Conservative first pass —
// keep these low (sparse). Large is ~disabled (0) for most themes this pass.
// _default covers any theme not listed. Deterministic per tile (no flicker).
const ENV_OBJECT_DENSITY = {
  _default: { small: 0.02, large: 0 },
  neutral:  { small: 0.02,  large: 0 },
  forest:   { small: 0.03,  large: 0.004 },
  goblin:   { small: 0.025, large: 0 },
  fungal:   { small: 0.03,  large: 0.004 },
  void:     { small: 0.02,  large: 0 },
  frost:    { small: 0.02,  large: 0 },
  infernal: { small: 0.018, large: 0 },
  cursed:   { small: 0.02,  large: 0 },
  plague:   { small: 0.025, large: 0 }
}

// Which ENV_OBJECT_ROLES feed each sparse pass. `small` = 1-tile ground props
// (flowers/rocks/bones/mushrooms/crystals); `large` = bigger structures
// (trees/pillars/ruins) used only when ENV_OBJECT_DENSITY.large > 0. Edit freely.
const ENV_OBJECT_RULES = {
  neutral:  { small: ['smallDecor','plant','bush'],           large: ['tree','rock','ruin','campProp'] },
  forest:   { small: ['plant','mushroom','smallDecor','stump'], large: ['tree','bush','rock','ruin','log'] },
  goblin:   { small: ['skull','bone','barrel','rock'],        large: ['tent','cage','gate','totem','campfire'] },
  fungal:   { small: ['mushroom','smallDecor','crystal','root'], large: ['bigShroom','stump','pod','fleshpod'] },
  void:     { small: ['crystal','smallDecor','rock'],         large: ['obelisk','eye','coral'] },
  frost:    { small: ['snowdrift','smallDecor','crystal','bone'], large: ['pillar','iceChunk','ruin','brazier'] },
  infernal: { small: ['skull','bone','rock','smallDecor'],    large: ['pillar','brazier','altar','spike','cage'] },
  cursed:   { small: ['bone','grave','rubble','smallDecor'],  large: ['skullpile','coffin','statue','column','deadtree','brazier'] },
  plague:   { small: ['plant','smallDecor','bonepile','fungus'], large: ['cauldron','sac','barrel','cage'] }
}

// World biome id (biomes.js BIOMES / BOSS_BIOMES) -> env theme. (env_goblin has no
// world biome — it's dungeon-only.) 0 = neutral home.
const biomeEnvThemeMap = {
  0: 'neutral',
  1: 'void',     // dark_matter
  2: 'frost',    // snow
  3: 'infernal', // hell
  4: 'fungal',   // toxic / Fungal Mire
  5: 'cursed',   // ruined
  6: 'void',     // astral (no env_astral; void covers cosmic/astral)
  // runtime BOSS_BIOMES (7-12)
  7: 'void',     // event_horizon
  8: 'frost',    // glacial_throne
  9: 'infernal', // ash_caldera
  10: 'plague',  // rot_garden
  11: 'cursed',  // cursed_court
  12: 'void',    // starfall_dunes (astral)
  // low/mid biomes (13-19)
  13: 'forest',  // meadow / Greenwood Vale
  14: 'plague',  // fen / Quiet Fen
  15: 'frost',   // frostfields
  16: 'cursed',  // sunken ruins
  17: 'infernal',// scorched
  18: 'void',    // starlit (astral)
  19: 'void'     // nullfringe
}

// Dungeon key (DUNGEONS, mobs.js/map.js) -> env theme. Fallback 'neutral'.
const dungeonEnvThemeMap = {
  // OG dungeons
  goblin_warren:       'goblin',
  fungal_cavern:       'fungal',
  void_rift:           'void',
  // biome dungeons
  dark_matter_core:    'void',
  frozen_catacombs:    'frost',
  infernal_pit:        'infernal',
  plague_grotto:       'plague',
  fallen_keep:         'cursed',
  astral_tomb:         'void',
  // world-boss dungeons
  event_horizon_vault: 'void',
  titan_glacier:       'frost',
  worldeater_forge:    'infernal',
  plague_hive:         'plague',
  cursed_throne:       'cursed',
  starfall_pyramid:    'void'
}

// === SIMPLE 32x32 TERRAIN TILE SYSTEM (ACTIVE env renderer) =================
// Each terrain visual is one exact 32x32 PNG drawn directly into one map tile —
// NO slicing, NO grid math. This is the active environment renderer (the large
// env_* atlas above stays disabled). VISUAL-ONLY: nothing here changes generation,
// collision, hazards, portals, mobs, loot, or stations — callers keep their flat
// colored tile fill as the fallback when a tile is unmapped or its PNG isn't loaded.

// Image key -> file path. Each file is already a full tile (loaded via the same
// standalone-image loader as `src` registry entries). Filenames use the exact
// on-disk casing (note the mixed-case plague poison files).
const SIMPLE_TILE_IMAGES = {
  // neutral / home
  tile_neutral_1: 'assets/sprites/tiles/tile_neutral_1.png',
  tile_neutral_2: 'assets/sprites/tiles/tile_neutral_2.png',
  tile_neutral_3: 'assets/sprites/tiles/tile_neutral_3.png',
  tile_neutral_4: 'assets/sprites/tiles/tile_neutral_4.png',
  tile_neutral_5: 'assets/sprites/tiles/tile_neutral_5.png',
  tile_neutral_6: 'assets/sprites/tiles/tile_neutral_6.png',
  tile_neutral_7: 'assets/sprites/tiles/tile_neutral_7.png',
  tile_neutral_8: 'assets/sprites/tiles/tile_neutral_8.png',
  // forest
  tile_forest_1: 'assets/sprites/tiles/tile_forest_1.png',
  tile_forest_2: 'assets/sprites/tiles/tile_forest_2.png',
  tile_forest_3: 'assets/sprites/tiles/tile_forest_3.png',
  // goblin
  tile_goblin_1: 'assets/sprites/tiles/tile_goblin_1.png',
  tile_goblin_2: 'assets/sprites/tiles/tile_goblin_2.png',
  tile_goblin_3: 'assets/sprites/tiles/tile_goblin_3.png',
  tile_goblin_4: 'assets/sprites/tiles/tile_goblin_4.png',
  tile_goblin_5: 'assets/sprites/tiles/tile_goblin_5.png',
  tile_goblin_6: 'assets/sprites/tiles/tile_goblin_6.png',
  tile_goblin_7: 'assets/sprites/tiles/tile_goblin_7.png',
  // frost / ice / ice-stone
  tile_frost_1: 'assets/sprites/tiles/tile_frost_1.png',
  tile_frost_2: 'assets/sprites/tiles/tile_frost_2.png',
  tile_ice_1: 'assets/sprites/tiles/tile_ice_1.png',
  tile_ice_2: 'assets/sprites/tiles/tile_ice_2.png',
  tile_ice_3: 'assets/sprites/tiles/tile_ice_3.png',
  tile_ice_stone_1: 'assets/sprites/tiles/tile_ice_stone_1.png',
  tile_ice_stone_2: 'assets/sprites/tiles/tile_ice_stone_2.png',
  tile_ice_stone_3: 'assets/sprites/tiles/tile_ice_stone_3.png',
  // fungal
  tile_fungal_1: 'assets/sprites/tiles/tile_fungal_1.png',
  tile_fungal_2: 'assets/sprites/tiles/tile_fungal_2.png',
  tile_fungal_3: 'assets/sprites/tiles/tile_fungal_3.png',
  // cursed
  tile_cursed_1: 'assets/sprites/tiles/tile_cursed_1.png',
  tile_cursed_2: 'assets/sprites/tiles/tile_cursed_2.png',
  tile_cursed_3: 'assets/sprites/tiles/tile_cursed_3.png',
  tile_cursed_4: 'assets/sprites/tiles/tile_cursed_4.png',
  // infernal / lava
  tile_infernal_1: 'assets/sprites/tiles/tile_infernal_1.png',
  tile_infernal_2: 'assets/sprites/tiles/tile_infernal_2.png',
  tile_infernal_3: 'assets/sprites/tiles/tile_infernal_3.png',
  tile_infernal_4: 'assets/sprites/tiles/tile_infernal_4.png',
  tile_infernal_5: 'assets/sprites/tiles/tile_infernal_5.png',
  tile_infernal_6: 'assets/sprites/tiles/tile_infernal_6.png',
  tile_lava_1: 'assets/sprites/tiles/tile_lava_1.png',
  // plague / poison
  tile_plague_1: 'assets/sprites/tiles/tile_plague_1.png',
  tile_plague_2: 'assets/sprites/tiles/tile_plague_2.png',
  tile_plague_3: 'assets/sprites/tiles/tile_plague_3.png',
  tile_plague_4: 'assets/sprites/tiles/tile_plague_4.png',
  tile_plague_5: 'assets/sprites/tiles/tile_plague_5.png',
  tile_plague_poison_1: 'assets/sprites/tiles/tile_plague_poison_1.png',
  tile_plague_poison_2: 'assets/sprites/tiles/tile_plague_Poison_2.png', // NOTE: capital P on disk
  tile_plague_poison_4: 'assets/sprites/tiles/tile_plague_poison_4.png',
  // void / dark matter
  tile_void_1: 'assets/sprites/tiles/tile_void_1.png',
  tile_void_2: 'assets/sprites/tiles/tile_void_2.png',
  tile_void_3: 'assets/sprites/tiles/tile_void_3.png',
  tile_void_4: 'assets/sprites/tiles/tile_void_4.png',
  tile_void_5: 'assets/sprites/tiles/tile_void_5.png'
}

// theme -> { role -> [image key, ...] }. Roles: floor / floorAlt / path / wall /
// wallAlt / hazard / water / specialFloor. A deterministic per-tile variant is
// picked from the list. UNMAPPED role = flat colored fallback (but drawSimpleTile
// first tries SIMPLE_ROLE_FALLBACK so e.g. an unmapped 'floorAlt' shows plain floor
// rather than a bare colored square). Conservative first-pass mappings: mostly
// simple floor, rare floorAlt/path/special, hazards only on actual hazard tiles.
const SIMPLE_TILE_THEMES = {
  neutral: {
    floor: ['tile_neutral_1', 'tile_neutral_2', 'tile_neutral_3', 'tile_neutral_4', 'tile_neutral_5'],
    path:  ['tile_neutral_6', 'tile_neutral_7', 'tile_neutral_8']
    // no neutral wall tile -> walls keep their colored fallback
  },
  forest: {
    floor:    ['tile_forest_1', 'tile_forest_2'],
    floorAlt: ['tile_forest_3'],
    path:     ['tile_neutral_6']  // dirt path
    // forest wall -> colored fallback
  },
  goblin: {
    floor:        ['tile_goblin_1', 'tile_goblin_2', 'tile_goblin_3'],
    path:         ['tile_goblin_4'],
    specialFloor: ['tile_goblin_5', 'tile_goblin_6', 'tile_goblin_7']
    // goblin wall -> colored fallback
  },
  frost: {
    floor:        ['tile_frost_1', 'tile_frost_2'],
    specialFloor: ['tile_ice_1', 'tile_ice_2', 'tile_ice_3'],
    hazard:       ['tile_ice_1', 'tile_ice_2', 'tile_ice_3'],  // T_ICE patches render the ice tiles
    wall:         ['tile_ice_stone_1', 'tile_ice_stone_2', 'tile_ice_stone_3']
  },
  fungal: {
    floor:        ['tile_fungal_1', 'tile_fungal_2'],
    specialFloor: ['tile_fungal_3']
  },
  cursed: {
    floor:        ['tile_cursed_1', 'tile_cursed_2'],
    path:         ['tile_cursed_3'],
    specialFloor: ['tile_cursed_3'],
    wall:         ['tile_cursed_4']
  },
  infernal: {
    floor:        ['tile_infernal_1', 'tile_infernal_2', 'tile_infernal_4'],
    specialFloor: ['tile_infernal_3', 'tile_infernal_5', 'tile_infernal_6'],
    hazard:       ['tile_lava_1']
  },
  plague: {
    floor:  ['tile_plague_1', 'tile_plague_2', 'tile_plague_3', 'tile_plague_4', 'tile_plague_5'],
    hazard: ['tile_plague_poison_1', 'tile_plague_poison_2', 'tile_plague_poison_4'],
    water:  ['tile_plague_poison_1', 'tile_plague_poison_2', 'tile_plague_poison_4']
  },
  void: {
    floor:        ['tile_void_1', 'tile_void_2'],
    specialFloor: ['tile_void_3', 'tile_void_4'],
    hazard:       ['tile_void_5']
  }
}

// If a requested role isn't mapped for a theme, fall back to this role before
// giving up (keeps the tilework readable instead of dropping to a colored square).
const SIMPLE_ROLE_FALLBACK = {
  floorAlt: 'floor', path: 'floor', specialFloor: 'floor',
  wallAlt: 'wall', water: 'hazard'
}

// World biome themes and dungeon themes both resolve through the EXISTING theme maps
// (biomeEnvThemeMap / dungeonEnvThemeMap, via Sprites.envThemeForBiome/forDungeon)
// then look up roles here. These aliases satisfy the BIOME_TILE_MAP / DUNGEON_TILE_MAP
// naming and keep a single source of truth for role->tile lists.
const BIOME_TILE_MAP = SIMPLE_TILE_THEMES
const DUNGEON_TILE_MAP = SIMPLE_TILE_THEMES

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

  // FULL portal entity treatment: the portal reads as a round glowing VORTEX, not a
  // square sheet tile. Layers (all driven by PORTAL_VIS, no per-portal hacks):
  //   1) ground shadow (anchor)        2) soft themed radial aura
  //   3) the sheet art CLIPPED to a circle + slowly spun (square edges vanish)
  //   4) bright additive energy core   5) glowing rim ring (defines the circle)
  //   6) optional orbiting sparks
  // Frame animation is blended with continuous bob / pulse / spin / glow so it feels
  // alive instead of a slideshow. `seed` (e.g. tile coords) gives each portal a
  // stable phase so a field of portals doesn't pulse in lockstep. Call from inside
  // drawUpright(anchor, ...) with cx,cy = 0,0 so glow/shadow/art stay screen-upright
  // and coherent under screen rotation (like loot bags). Returns true if it drew the
  // art; false (sheet unloaded) so the caller keeps its (now circular) fallback.
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
    // Radius of the circular portal body (breathes with the pulse).
    const coreR = size * 0.5 * (V.coreScale != null ? V.coreScale : 0.94) * (1 + V.pulseAmt * pulse)

    // 1) Ground shadow — flat ellipse pinned under the portal (does not bob with it).
    c.save()
    c.globalAlpha = V.shadowAlpha
    c.fillStyle = '#000'
    c.beginPath()
    c.ellipse(cx, cy + size * V.shadowDrop, size * V.shadowW * 0.5, size * V.shadowH * 0.5, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()

    // 2) Soft radial aura behind the body (pulsing themed presence).
    const gr = size * 0.5 * V.glowSize * (1 + 0.08 * pulse)
    const ga = V.glowAlpha * (0.78 + 0.22 * pulse)
    let grad = c.createRadialGradient(cx, yc, 0, cx, yc, gr)
    grad.addColorStop(0, this._rgba(glow, ga))
    grad.addColorStop(0.55, this._rgba(glow, ga * 0.35))
    grad.addColorStop(1, this._rgba(glow, 0))
    c.save()
    c.fillStyle = grad
    c.beginPath(); c.arc(cx, yc, gr, 0, Math.PI * 2); c.fill()
    c.restore()

    // 3) Portal art CLIPPED to a circle (square tile edges vanish) and slowly spun
    //    about its own center for a living swirl (a local rotation — independent of
    //    screen rotation, so it stays coherent under Q/E). Cropped tighter and drawn
    //    a touch larger than the disc so the useful swirl fills the circle.
    const r = portalVariantRect(spec.variant)
    const fi = Math.floor(t / (1000 / V.fps)) % r.frames
    const artInset = (V.artCropInset != null) ? V.artCropInset : V.cropInset
    const artSize = coreR * 2 * (V.artScale != null ? V.artScale : 1.2)
    c.save()
    c.beginPath(); c.arc(cx, yc, coreR, 0, Math.PI * 2); c.clip()
    if (V.spinSpeed) {
      c.translate(cx, yc); c.rotate((t / V.spinSpeed + ph) % (Math.PI * 2)); c.translate(-cx, -yc)
    }
    c.shadowBlur = V.glowBlur
    c.shadowColor = glow
    const drew = this._drawSheetTile(spec.sheet, r.col + fi, r.row, cx, yc, artSize, c, artInset)
    c.restore()

    // 4) Inner energy core — bright additive bloom so the disc reads as a glowing
    //    core (esp. for void/arcane purples).
    c.save()
    c.globalCompositeOperation = 'lighter'
    const cr = coreR * (V.coreBloom != null ? V.coreBloom : 0.9)
    const ca = (V.coreAlpha != null ? V.coreAlpha : 0.5) * (0.7 + 0.3 * pulse)
    grad = c.createRadialGradient(cx, yc, 0, cx, yc, cr)
    grad.addColorStop(0, this._rgba(glow, ca))
    grad.addColorStop(0.5, this._rgba(glow, ca * 0.4))
    grad.addColorStop(1, this._rgba(glow, 0))
    c.fillStyle = grad
    c.beginPath(); c.arc(cx, yc, cr, 0, Math.PI * 2); c.fill()
    c.restore()

    // 5) Rim ring — a thin glowing edge that defines the circular boundary.
    if (V.rimAlpha) {
      c.save()
      c.globalAlpha = V.rimAlpha * (0.7 + 0.3 * pulse)
      c.strokeStyle = this._rgba(glow, 1)
      c.lineWidth = Math.max(1.5, size * 0.04)
      c.shadowBlur = V.glowBlur
      c.shadowColor = glow
      c.beginPath(); c.arc(cx, yc, coreR, 0, Math.PI * 2); c.stroke()
      c.restore()
    }

    // 6) Optional themed sparks orbiting the core (cheap, fully time-based).
    if (V.particles) {
      const n = V.particles | 0
      c.save()
      c.globalCompositeOperation = 'lighter'
      for (let i = 0; i < n; i++) {
        const a = (t / 900) + ph + i * (Math.PI * 2 / n)
        const rad = coreR * (0.78 + 0.14 * Math.sin(t / 500 + i))
        const pr = Math.max(1, size * 0.035) * (0.7 + 0.3 * Math.sin(t / 300 + i))
        c.fillStyle = this._rgba(glow, 0.8)
        c.beginPath(); c.arc(cx + Math.cos(a) * rad, yc + Math.sin(a) * rad, pr, 0, Math.PI * 2); c.fill()
      }
      c.restore()
    }
    return drew
  },

  // Convenience hook for renderMob: returns true if a mob/boss sprite was drawn.
  // Bosses (bossSpriteAssignments) take priority; creature art has wide wings/
  // padding so it's drawn a touch larger than the geometric radius. Regular +
  // dungeon mobs then try their 2-frame mob-sheet sprite; unmapped keep geometry.
  // Draw a standalone boss PNG (by file path) centered at (cx,cy), aspect-fit into
  // a `size` box. Returns false if the file is missing/undecoded so callers fall
  // back to the boss sheets / legacy art / geometry (never crashes the loop).
  drawBossFilePath(path, cx, cy, size, context) {
    if (!this.enabled || !path) return false
    const rec = this.image(path)
    if (!rec || !rec.loaded || !rec.img || !rec.img.complete) return false
    const iw = rec.img.naturalWidth, ih = rec.img.naturalHeight
    if (!iw || !ih) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    const scale = size / Math.max(iw, ih)
    const dw = iw * scale, dh = ih * scale
    try { c.drawImage(rec.img, cx - dw / 2, cy - dh / 2, dw, dh) } catch (err) { return false }
    return true
  },

  // Draw a world boss's POWERUP-phase art (by e.key) centered at (cx,cy). Returns
  // false (unmapped/unloaded) so renderMob keeps just the telegraph ring.
  drawBossPowerup(e, cx, cy, size, context) {
    const p = (typeof bossPowerupAssignments !== 'undefined') && e && bossPowerupAssignments[e.key]
    if (!p) return false
    return this.drawBossFilePath(p, cx, cy, size, context)
  },

  drawForMob(e, sx, sy, vrad) {
    if (!e || !e.key) return false
    const r0 = (vrad || e.radius || 12)
    // 0) NEW per-boss PNG (subfoldered art) — highest priority, file-based, data-driven.
    const bfile = (typeof bossFileAssignments !== 'undefined') && bossFileAssignments[e.key]
    if (bfile && this.drawBossFilePath(bfile, sx, sy, r0 * 2.8)) return true
    // 1) boss-sheet art (2-frame boss atlases) — data-driven fallback.
    if (this.drawBossSheet(e, sx, sy, r0 * 3.0)) return true
    // 2) Legacy standalone boss / registry sprite (flying creatures, crystal knight) —
    //    graceful fallback if a boss sheet is missing but a legacy entry exists.
    const id = (typeof bossSpriteAssignments !== 'undefined' && bossSpriteAssignments[e.key]) || mobSpriteAssignments[e.key]
    if (id) {
      const scale = (typeof bossSpriteAssignments !== 'undefined' && bossSpriteAssignments[e.key]) ? 2.8 : 2.2
      return this.draw(id, sx, sy, r0 * scale)
    }
    // 3) Regular 2-frame mob-sheet sprite; unmapped keys keep geometry.
    return this.drawMobSheet(e, sx, sy, r0 * 2.6)
  },

  // Normalize an assignment ({sheet,col,row} | {sheet,index}) to {col,row}.
  _iconCell(a) {
    if (!a) return null
    if (a.col != null) return { col: a.col | 0, row: a.row | 0 }
    const def = SPRITE_SHEETS[a.sheet]
    const cols = (def && def.cols) || 8
    const i = a.index | 0
    return { col: i % cols, row: (i / cols) | 0 }
  },

  // Draw a single icon for an item (object with .baseKey/.slot) OR a baseKey
  // string, centered at (cx,cy) fit to `size`. Resolution order (all explicit,
  // data-driven): per-item override -> slot icon (new gear sheets) -> legacy
  // registry sprite (keeps weapon art working). Returns false -> caller draws its
  // geometric letter/dot fallback. Exactly one 8x8 cell is sampled (no slideshow).
  drawItemIcon(itemOrKey, cx, cy, size, context) {
    if (!this.enabled) return false
    let baseKey, slot
    if (typeof itemOrKey === 'string') { baseKey = itemOrKey }
    else if (itemOrKey) { baseKey = itemOrKey.baseKey; slot = itemOrKey.slot }
    if (!baseKey) return false
    const bases = (typeof ITEM_BASES !== 'undefined') ? ITEM_BASES
                : (typeof window !== 'undefined' ? window.ITEM_BASES : null)
    const base = bases && bases[baseKey]
    if (!slot && base) slot = base.slot
    // 1) per-item override ({sheet,col,row})
    let a = itemIconAssignments[baseKey]
    let cell = a && a.sheet && this._iconCell(a)
    if (cell) return this._drawSheetTile(a.sheet, cell.col, cell.row, cx, cy, size, context)
    // 2) explicit per-item legacy registry sprite (itemSpriteAssignments) — checked
    //    BEFORE the generic slot icon so a named weapon/gear piece shows ITS art
    //    (e.g. iron_helm -> armor_0_0), while unlisted items still use slot icons.
    const id = itemSpriteAssignments[baseKey]
    if (id && this.draw(id, cx, cy, size, context)) return true
    // 3) generic slot icon from the gear sheets (default for any item of that slot)
    a = slot && itemSlotIconAssignments[slot]
    cell = a && a.sheet && this._iconCell(a)
    if (cell) return this._drawSheetTile(a.sheet, cell.col, cell.row, cx, cy, size, context)
    return false
  },

  // Convenience hook for item rendering (inventory/equipment/loot/wiki): draws the
  // assigned icon centered at (cx,cy) sized `size` px. Returns true if drawn,
  // false to fall back to the existing letter/dot icon. Thin wrapper over
  // drawItemIcon so existing callers keep working.
  drawForItem(it, cx, cy, size, context) {
    return this.drawItemIcon(it, cx, cy, size, context)
  },

  // Draw the playable-class sprite (real PNG from assets/sprites/Classes/) centered
  // at (cx,cy), fit to a `size`-px box (aspect + transparency preserved). Returns
  // false when the class is unmapped or its image isn't loaded yet, so every caller
  // (in-game player, character select, new-character screen) keeps its geometric
  // class shape as the graceful fallback. Never throws (Sprites.draw is try/catch).
  // VISUAL-ONLY — never affects movement/hitbox/stats.
  drawClassSprite(classKey, cx, cy, size, context) {
    const id = (typeof classSpriteAssignments !== 'undefined') && classSpriteAssignments[classKey]
    if (!id) return false
    return this.draw(id, cx, cy, size, context)
  },
  // Back-compat alias for the older helper name.
  drawForCharacter(classKey, cx, cy, size, context) {
    return this.drawClassSprite(classKey, cx, cy, size, context)
  },

  // Draw an assignment ({sheet,col,row}|{sheet,index} + optional frames/fps/
  // angleOffset) centered at (cx,cy), fit to `size`, ROTATED so the art points
  // along `angle` (the bullet's world-space travel angle). Because callers draw
  // inside the world transform, the single rotation here + the world transform =
  // correct on-screen facing at any screen rotation (NO double-rotation). Returns
  // true if drawn, false -> caller's circle fallback. Optional same-row animation
  // steps to ADJACENT cells (never neighbouring rows / multi-cell blocks).
  _drawRotatedTile(a, cx, cy, angle, size, context) {
    if (!this.enabled || !a || !a.sheet) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    const cell = this._iconCell(a)
    if (!cell) return false
    let col = cell.col
    if (a.frames && a.frames > 1) {
      const fps = a.fps || 8
      col += Math.floor(Date.now() / (1000 / fps)) % a.frames
    }
    c.save()
    c.translate(cx, cy)
    if (angle != null) c.rotate(angle + (a.angleOffset || PROJECTILE_ART_ANGLE || 0))
    const drew = this._drawSheetTile(a.sheet, col, cell.row, 0, 0, size, c)
    c.restore()
    return drew
  },

  // Player weapon shot sprite for visual `kind` (the firer's class). Returns
  // false (unmapped/unloaded) so renderBullets keeps the circle. Visual only.
  drawWeaponProjectile(kind, cx, cy, angle, size, context) {
    if (!kind) return false
    return this._drawRotatedTile(projectileWeaponAssignments[kind], cx, cy, angle, size, context)
  },

  // Boss/enemy shot sprite for visual `kind` (the firer's mob/boss key). Returns
  // false (unmapped/unloaded) so renderBullets keeps the circle. Visual only.
  drawBossProjectile(kind, cx, cy, angle, size, context) {
    if (!kind) return false
    return this._drawRotatedTile(projectileBossAssignments[kind], cx, cy, angle, size, context)
  },

  // --- Environment helpers --------------------------------------------------
  // Resolve a world biome id / dungeon key -> env theme (data-driven maps above).
  envThemeForBiome(biomeId) { return biomeEnvThemeMap[biomeId | 0] || 'neutral' },
  envThemeForDungeon(key)   { return dungeonEnvThemeMap[key] || 'neutral' },
  // Sparse small-object chance for a theme (0..1). Back-compat helper.
  envDecorChance(theme) {
    const d = ENV_OBJECT_DENSITY[theme] || ENV_OBJECT_DENSITY._default
    return (d && d.small) || 0
  },

  // Stable hash for deterministic per-tile variant/decor selection (no per-frame
  // randomness → no flicker). Same (x,y,salt) always yields the same value.
  envHash(x, y, salt) {
    let h = ((x | 0) * 374761393 + (y | 0) * 668265263 + ((salt | 0) * 2147483647)) | 0
    h = (h ^ (h >>> 13)) >>> 0
    h = Math.imul(h, 1274126177) >>> 0
    return h
  },

  // Resolve a theme+TERRAIN role to its candidate cell list.
  _envTerrainCells(theme, role) {
    const t = ENV_TERRAIN_ROLES[theme]
    return (t && t[role]) || null
  },
  // Resolve a theme+OBJECT role to its candidate cell list.
  _envObjectCells(theme, role) {
    const o = ENV_OBJECT_ROLES[theme]
    return (o && o[role]) || null
  },
  // Back-compat: terrain first, then object (used by env_debug.html).
  _envCells(theme, role) {
    return this._envTerrainCells(theme, role) || this._envObjectCells(theme, role) || null
  },

  // --- Env cell source-rect math (boundary-based, NOT a single fractional cell) ---
  // The env sheets are 1254x1254 on an 8x8 grid → 156.75px cells. Multiplying a
  // fractional cellW by col accumulates drift across the sheet. Instead snap each
  // cell to integer pixel BOUNDARIES so adjacent cells tile seamlessly:
  //   x0 = round(col*W/cols), x1 = round((col+1)*W/cols), etc. Returns null until
  // the image is decoded. `full:true` marks an untrimmed (whole-cell) rect.
  envCellRect(sheetKey, col, row) {
    const def = SPRITE_SHEETS[sheetKey]
    if (!def) return null
    const rec = this.sheet(sheetKey)
    if (!rec || !rec.loaded || !rec.img.complete) return null
    const nw = rec.img.naturalWidth, nh = rec.img.naturalHeight
    if (!nw || !nh) return null
    const cols = def.cols || 8, rows = def.rows || 8
    const x0 = Math.round(col * nw / cols), x1 = Math.round((col + 1) * nw / cols)
    const y0 = Math.round(row * nh / rows), y1 = Math.round((row + 1) * nh / rows)
    return { sx: x0, sy: y0, sw: Math.max(1, x1 - x0), sh: Math.max(1, y1 - y0), full: true }
  },

  // Alpha-trimmed visible bounds INSIDE an env cell. Many cells carry transparent
  // padding around the actual art, which (when drawn whole) makes terrain look
  // small/off-centre. We scan the cell's alpha channel ONCE (cached per sheet/col/
  // row) and return the tight rect of pixels with alpha > threshold. On any failure
  // — image not ready, no DOM, or a tainted canvas (e.g. opened via file://, where
  // getImageData throws SecurityError) — we fall back to the full boundary rect.
  _envTrimCache: {},
  envCellTrimRect(sheetKey, col, row, threshold) {
    const key = sheetKey + ':' + col + ':' + row
    const cached = this._envTrimCache[key]
    if (cached) return cached
    const base = this.envCellRect(sheetKey, col, row)
    if (!base) return null            // not loaded yet — don't cache, retry next frame
    const thr = threshold == null ? 12 : threshold
    let result = base
    try {
      const rec = this.sheet(sheetKey)
      const sw = base.sw, sh = base.sh
      let cv = this._envScanCanvas
      if (!cv) cv = this._envScanCanvas = document.createElement('canvas')
      cv.width = sw; cv.height = sh
      const sc = cv.getContext('2d')
      sc.clearRect(0, 0, sw, sh)
      sc.drawImage(rec.img, base.sx, base.sy, sw, sh, 0, 0, sw, sh)
      const data = sc.getImageData(0, 0, sw, sh).data   // throws if tainted → catch
      let minX = sw, minY = sh, maxX = -1, maxY = -1
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          if (data[(y * sw + x) * 4 + 3] > thr) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        result = { sx: base.sx + minX, sy: base.sy + minY, sw: maxX - minX + 1, sh: maxY - minY + 1, full: false }
      }
    } catch (err) { result = base }   // tainted/unavailable → full cell rect
    this._envTrimCache[key] = result
    return result
  },

  // TERRAIN draw mode = COVER/FILL the tile. Uses the alpha-trimmed crop so the
  // visible art (not the transparent padding) is stretched to fill the size-px tile
  // square centered at (x,y). `opts.bleed` (default 0) oversizes the dest to hide
  // seams; callers already pass TILE+1. Returns false → caller keeps its flat fill.
  drawEnvTerrainCell(sheetKey, col, row, x, y, size, context, opts) {
    const rec = this.sheet(sheetKey)
    if (!rec || !rec.loaded || !rec.img.complete) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    const r = this.envCellTrimRect(sheetKey, col, row, opts && opts.threshold)
    if (!r) return false
    const bleed = (opts && opts.bleed != null) ? opts.bleed : 0
    const dw = size + bleed, dh = size + bleed
    try {
      c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, x - dw / 2, y - dh / 2, dw, dh)
    } catch (err) { return false }
    return true
  },

  // OBJECT draw mode = CONTAIN + anchor BOTTOM-CENTER. Uses the alpha-trimmed crop,
  // PRESERVES aspect ratio (larger dim maps to size*scale, so a prop may be taller/
  // wider than one tile) and plants the art's bottom-center on the tile's bottom
  // edge (x,y is the tile CENTER). Never forces the prop to fill the terrain square.
  drawEnvObjectCell(sheetKey, col, row, x, y, size, context, opts) {
    const rec = this.sheet(sheetKey)
    if (!rec || !rec.loaded || !rec.img.complete) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    const r = this.envCellTrimRect(sheetKey, col, row, opts && opts.threshold)
    if (!r) return false
    const scale = (opts && opts.scale != null) ? opts.scale : 1
    const k = (size * scale) / Math.max(r.sw, r.sh)
    const dw = r.sw * k, dh = r.sh * k
    const dx = x - dw / 2
    const dy = (y + size / 2) - dh   // bottom of the art rests on the tile's bottom edge
    try {
      c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, dx, dy, dw, dh)
    } catch (err) { return false }
    return true
  },

  // Draw exactly ONE TERRAIN cell for (theme, role), CENTERED at (x,y), fit to a
  // `size` box. `seed` (e.g. an envHash of tile coords) deterministically picks a
  // variant from the role's cell list. Returns false if the theme/role is unmapped
  // or the sheet isn't loaded → caller keeps its existing flat-color fill. Samples
  // a single 8x8 cell only (no neighbour bleed, no animation). `opts.inset` trims a
  // fraction off each source edge if a sheet has baked-in padding.
  drawEnvTile(theme, role, x, y, size, context, seed, opts) {
    if (!this.enabled || !ENV_SPRITES_ENABLED) return false
    const sheet = ENV_SHEET_BY_THEME[theme]
    if (!sheet) return false
    const cells = this._envTerrainCells(theme, role)
    if (!cells || !cells.length) return false
    const cell = cells[(seed >>> 0) % cells.length]
    // Terrain = cover/fill (alpha-trimmed art stretched to fill the tile square).
    return this.drawEnvTerrainCell(sheet, cell.col, cell.row, x, y, size, context, opts)
  },

  // --- Simple 32x32 terrain tile (ACTIVE env renderer) ---------------------
  // Draw exactly ONE full-tile PNG for (theme, role), CENTERED at (x,y), stretched
  // to fill the `size`-px tile square (each file is already one whole 32x32 tile —
  // no slicing). `seed` (e.g. envHash of tile coords) deterministically picks a
  // variant from the role's list (no flicker). Returns false → caller keeps its
  // flat colored fill when the theme/role is unmapped or the PNG isn't loaded.
  drawSimpleTile(theme, role, x, y, size, context, seed) {
    if (!this.enabled || !SIMPLE_ENV_TILES_ENABLED) return false
    const roles = SIMPLE_TILE_THEMES[theme]
    if (!roles) return false
    let keys = roles[role]
    if (!keys || !keys.length) {
      const fb = SIMPLE_ROLE_FALLBACK[role]
      keys = fb && roles[fb]
    }
    if (!keys || !keys.length) return false
    const key = keys[(seed >>> 0) % keys.length]
    const path = SIMPLE_TILE_IMAGES[key]
    if (!path) return false
    const rec = this.image(path)
    if (!rec || !rec.loaded || !rec.img.complete) return false
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c) return false
    try {
      c.drawImage(rec.img, x - size / 2, y - size / 2, size, size)
    } catch (err) { return false }
    return true
  },

  // Resolve a world biome id / dungeon key -> simple-tile theme (reuses the env
  // theme maps; the simple-tile themes share the same keys).
  simpleThemeForBiome(biomeId) { return this.envThemeForBiome(biomeId) },
  simpleThemeForDungeon(key)   { return this.envThemeForDungeon(key) },

  // Draw at most ONE sparse OBJECT/decor prop ON TOP of an already-painted floor
  // tile at (cx,cy). Placement is deterministic per tile (envHash of tx,ty) using
  // the theme's ENV_OBJECT_DENSITY + ENV_OBJECT_RULES — no Math.random, no flicker.
  // Visual only; never affects collision. Returns true if it drew. Callers MUST
  // only invoke this on walkable floor (never walls/hazards/water/portals/nexus).
  drawEnvObject(theme, tx, ty, cx, cy, size, context) {
    if (!this.enabled || !ENV_SPRITES_ENABLED) return false
    const sheet = ENV_SHEET_BY_THEME[theme]
    if (!sheet) return false
    const rules = ENV_OBJECT_RULES[theme]
    if (!rules) return false
    const dens = ENV_OBJECT_DENSITY[theme] || ENV_OBJECT_DENSITY._default
    const roll = this.envHash(tx, ty, 9) % 10000
    const largeP = (dens.large || 0) * 10000, smallP = (dens.small || 0) * 10000
    let roleList = null, scale = 0.82
    if (largeP > 0 && rules.large && rules.large.length && roll < largeP) {
      roleList = rules.large; scale = 1.0
    } else if (smallP > 0 && rules.small && rules.small.length && roll < largeP + smallP) {
      roleList = rules.small; scale = 0.82
    }
    if (!roleList) return false
    const role = roleList[this.envHash(tx, ty, 11) % roleList.length]
    const cells = this._envObjectCells(theme, role)
    if (!cells || !cells.length) return false
    const cell = cells[this.envHash(tx, ty, 12) % cells.length]
    // Object = contain + bottom-center anchor (preserves aspect; never fills tile).
    return this.drawEnvObjectCell(sheet, cell.col, cell.row, cx, cy, size, context, { scale })
  },

  // Back-compat shim (old decor caller). Real placement now lives in drawEnvObject.
  drawEnvDecor() { return false }
}

// Global angle offset (radians) applied to projectile sprites if the source art's
// "forward" direction isn't +x (e.g. set to Math.PI/2 if the art points UP). Kept
// here so projectile facing is tuned in ONE place. Per-assignment `angleOffset`
// overrides this for a single shot.
const PROJECTILE_ART_ANGLE = 0

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
  window.bossFileAssignments = bossFileAssignments
  window.bossPowerupAssignments = bossPowerupAssignments
  window.itemSpriteAssignments = itemSpriteAssignments
  window.projectileSpriteAssignments = projectileSpriteAssignments
  // Gear icon + projectile sprite systems (new 8x8 sheets).
  window.itemSlotIconAssignments = itemSlotIconAssignments
  window.itemIconAssignments = itemIconAssignments
  window.projectileWeaponAssignments = projectileWeaponAssignments
  window.projectileBossAssignments = projectileBossAssignments
  // Environment tile/decor system (biome + dungeon terrain sheets).
  window.ENV_SPRITES_ENABLED = ENV_SPRITES_ENABLED   // global master switch (currently false)
  window.ENV_SHEET_BY_THEME = ENV_SHEET_BY_THEME
  window.ENV_TERRAIN_ROLES = ENV_TERRAIN_ROLES
  window.ENV_OBJECT_ROLES = ENV_OBJECT_ROLES
  window.ENV_OBJECT_DENSITY = ENV_OBJECT_DENSITY
  window.ENV_OBJECT_RULES = ENV_OBJECT_RULES
  window.envHazardAssignments = envHazardAssignments
  window.biomeEnvThemeMap = biomeEnvThemeMap
  window.dungeonEnvThemeMap = dungeonEnvThemeMap
  // Simple 32x32 terrain tile system (ACTIVE env renderer).
  window.SIMPLE_ENV_TILES_ENABLED = SIMPLE_ENV_TILES_ENABLED
  window.SIMPLE_TILE_IMAGES = SIMPLE_TILE_IMAGES
  window.SIMPLE_TILE_THEMES = SIMPLE_TILE_THEMES
  window.SIMPLE_ROLE_FALLBACK = SIMPLE_ROLE_FALLBACK
  window.BIOME_TILE_MAP = BIOME_TILE_MAP
  window.DUNGEON_TILE_MAP = DUNGEON_TILE_MAP
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
