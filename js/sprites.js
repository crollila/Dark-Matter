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
  main:    { path: 'assets/sprites/sheet.png', tile: 16 }  // fallback / general sheet
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
  _imgs: {},          // sheetName -> { img, loaded }
  enabled: true,      // master toggle (e.g. for the debug page / fallback test)

  // Lazily load a sheet's image. Safe if the file doesn't exist yet — `loaded`
  // simply stays false and draws no-op (callers fall back to geometric art).
  sheet(name) {
    const def = SPRITE_SHEETS[name]
    if (!def) return null
    let rec = this._imgs[name]
    if (!rec) {
      rec = { img: new Image(), loaded: false }
      rec.img.onload = () => { rec.loaded = true }
      rec.img.onerror = () => { rec.loaded = false }
      rec.img.src = def.path
      this._imgs[name] = rec
    }
    return rec
  },

  // Resolve a registry entry to source-rect px {sx,sy,sw,sh} or null.
  rect(id) {
    const e = SPRITE_REGISTRY[id]
    if (!e) return null
    const sheet = SPRITE_SHEETS[e.sheet]
    if (!sheet) return null
    const t = sheet.tile
    const sw = e.w != null ? e.w : t
    const sh = e.h != null ? e.h : t
    const sx = e.x != null ? e.x : (e.col || 0) * t
    const sy = e.y != null ? e.y : (e.row || 0) * t
    return { sx, sy, sw, sh }
  },

  // True only when the sprite's sheet image is decoded and ready to blit.
  ready(id) {
    const e = SPRITE_REGISTRY[id]
    if (!e) return false
    const rec = this.sheet(e.sheet)
    return !!(rec && rec.loaded && rec.img.complete)
  },

  // Draw sprite `id` centered at (cx,cy) scaled to `size` px (square-ish).
  // Returns true if it actually drew, false if it couldn't (-> use fallback).
  draw(id, cx, cy, size, context) {
    if (!this.enabled) return false
    const e = SPRITE_REGISTRY[id]
    if (!e || !this.ready(id)) return false
    const r = this.rect(id)
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c || !r) return false
    const dw = size, dh = size * (r.sh / r.sw)
    const rec = this.sheet(e.sheet)
    c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, cx - dw / 2, cy - dh / 2, dw, dh)
    return true
  },

  // Draw sprite `id` into a top-left dest rect (used by the contact sheet).
  drawAt(id, dx, dy, dw, dh, context) {
    const e = SPRITE_REGISTRY[id]
    if (!e || !this.ready(id)) return false
    const r = this.rect(id)
    const c = context || (typeof ctx !== 'undefined' ? ctx : null)
    if (!c || !r) return false
    const rec = this.sheet(e.sheet)
    c.drawImage(rec.img, r.sx, r.sy, r.sw, r.sh, dx, dy, dw, dh)
    return true
  },

  // Convenience hook for renderMob: returns true if a mob sprite was drawn.
  drawForMob(e, sx, sy) {
    if (!e || !e.key) return false
    const id = mobSpriteAssignments[e.key]
    if (!id) return false
    return this.draw(id, sx, sy, (e.radius || 12) * 2.2)
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

// Expose globals (other modules + the standalone debug page read these).
if (typeof window !== 'undefined') {
  window.Sprites = Sprites
  window.SPRITE_REGISTRY = SPRITE_REGISTRY
  window.SPRITE_SHEETS = SPRITE_SHEETS
  window.mobSpriteAssignments = mobSpriteAssignments
  window.itemSpriteAssignments = itemSpriteAssignments
  window.projectileSpriteAssignments = projectileSpriteAssignments
}
