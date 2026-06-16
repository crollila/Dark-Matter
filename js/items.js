// ============================================================
// ITEMS — rarity, item defs, rolled instances, loot bags, pickup
// ------------------------------------------------------------
// Data-driven loot foundation. Boss kills spawn loot bags that
// contain crafting materials and (sometimes) a rolled item from
// the dungeon's loot table. Designed to extend: add a dungeon's
// items by giving each ITEM_DEF a matching `source` key, and a
// material by adding to DUNGEON_MATERIAL.
//
// Globals exposed (attached to window for other plain scripts):
//   RARITY, RARITY_ORDER, rarityColor
//   ITEM_SLOTS, ITEM_DEFS, MATERIALS, DUNGEON_MATERIAL
//   rollItemInstance, generateBossLoot, createLootBag
//   addItemToInventory, addMaterial, itemDisplayName
//   INVENTORY_CAP
// ============================================================

// ---- RARITY = TIER ----
// Rarity is not just drop chance: tier scales the stat ranges (scale) and the
// number of affixes pulled from a base's pool (affixes). `void` is special and
// uses multiplier stats instead of additive ones (multiplier:true).
const RARITY = {
  common:    { key: 'common',    name: 'Common',    color: '#c8c8c8', weight: 60, tier: 1, scale: 1.0, affixes: 1 },
  rare:      { key: 'rare',      name: 'Rare',      color: '#4ea1ff', weight: 28, tier: 2, scale: 1.5, affixes: 2 },
  epic:      { key: 'epic',      name: 'Epic',      color: '#b15bff', weight: 12, tier: 3, scale: 2.3, affixes: 3 },
  legendary: { key: 'legendary', name: 'Legendary', color: '#ffb000', weight: 5,  tier: 4, scale: 3.2, affixes: 4 },
  mythic:    { key: 'mythic',    name: 'Mythic',    color: '#ff3b6b', weight: 2,  tier: 5, scale: 4.5, affixes: 5 },
  // Void rolls a random number of affixes (6–10) and breaks the additive rules
  // with multiplier (%) stats. affixes here is the minimum; see rollItem.
  void:      { key: 'void',      name: 'Void',      color: '#7d4bff', weight: 1,  tier: 6, scale: 4.5, affixes: 6, multiplier: true },
}
// Rarity ordering low → high (used for "best item in bag" comparisons)
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'void']

function rarityColor(rarity) {
  return (RARITY[rarity] && RARITY[rarity].color) || '#c8c8c8'
}
function rarityRank(rarity) {
  const i = RARITY_ORDER.indexOf(rarity)
  return i < 0 ? 0 : i
}

// Weighted random rarity. `boost` > 0 biases toward higher tiers (bosses).
function rollRarity(boost = 0) {
  let total = 0
  const ws = RARITY_ORDER.map(k => {
    let w = RARITY[k].weight
    if (boost) w *= Math.pow(1 + boost, RARITY[k].tier - 1)
    total += w; return w
  })
  let r = Math.random() * total
  for (let i = 0; i < RARITY_ORDER.length; i++) { r -= ws[i]; if (r <= 0) return RARITY_ORDER[i] }
  return 'common'
}

// ---- SLOTS / TYPES (compatible with player.js char.gear) ----
const ITEM_SLOTS = [
  'weapon', 'helmet', 'chest', 'hands',
  'pants', 'boots', 'ring', 'amulet', 'ability'
]

// ============================================================
// ITEM BASES — fixed stat identities. Each base has:
//   name, slot, classes (null = any, or ['mage', ...] restriction)
//   core:      { statKey: [lo, hi] }  always present, defines identity
//   affixPool: [ { statKey:[lo,hi] }, ... ]  ordered; rarity.affixes decides
//              how many (from the front) are added. Pools are thematic to the
//              slot (semi-open) — a base never rolls stats outside its pool.
// Ranges are quoted at COMMON; rarity.scale multiplies them (except the
// NON_SCALING keys range/atkSpd/bspd which are fixed weapon mechanics).
// A single rollPercent (1..100) is applied to EVERY stat on the item.
// ============================================================
const NON_SCALING = { range: 1, atkSpd: 1, bspd: 1 }
const PCT_KEYS = { hpPct: 1, mpPct: 1, dmgPct: 1, spdPct: 1, armorPct: 1 }

const ITEM_BASES = {
  // === WEAPONS (class-restricted) ===
  warrior_sword: { name: 'Battle Sword', slot: 'weapon', classes: ['warrior'],
    core: { dmg: [60, 110], range: [90, 110], atkSpd: [0.45, 0.55], bspd: [280, 320], str: [3, 6] },
    affixPool: [ { hp: [80, 160] }, { armor: [3, 6] }, { spd: [2, 5] }, { hpRegen: [2, 5] }, { str: [2, 5] } ] },
  rogue_daggers: { name: 'Twin Daggers', slot: 'weapon', classes: ['rogue'],
    core: { dmg: [30, 55], range: [140, 170], atkSpd: [0.16, 0.20], bspd: [360, 400], dex: [3, 6] },
    affixPool: [ { spd: [3, 6] }, { hp: [60, 120] }, { armor: [2, 4] }, { str: [2, 4] }, { dex: [2, 4] } ] },
  mage_staff: { name: 'Arcane Staff', slot: 'weapon', classes: ['mage'],
    core: { dmg: [90, 150], range: [260, 300], atkSpd: [0.50, 0.60], bspd: [300, 340], int: [3, 6] },
    affixPool: [ { mp: [120, 260] }, { hpRegen: [2, 5] }, { hp: [60, 120] }, { spd: [1, 3] }, { int: [2, 4] } ] },
  priest_wand: { name: 'Holy Wand', slot: 'weapon', classes: ['priest'],
    core: { dmg: [40, 70], range: [200, 240], atkSpd: [0.22, 0.28], bspd: [280, 320], int: [3, 6] },
    affixPool: [ { mp: [120, 260] }, { hpRegen: [3, 6] }, { hp: [60, 120] }, { armor: [2, 4] }, { int: [2, 4] } ] },
  archer_bow: { name: 'Long Bow', slot: 'weapon', classes: ['archer'],
    core: { dmg: [50, 85], range: [300, 340], atkSpd: [0.28, 0.34], bspd: [480, 520], dex: [3, 6] },
    affixPool: [ { spd: [3, 6] }, { hp: [60, 120] }, { armor: [2, 4] }, { hpRegen: [2, 4] }, { dex: [2, 4] } ] },

  // === HELMETS ===
  iron_helm: { name: 'Iron Helm', slot: 'helmet', classes: null,
    core: { armor: [4, 8], hp: [80, 120], str: [2, 4] },
    affixPool: [ { hpRegen: [2, 5] }, { spd: [2, 5] }, { dex: [2, 4] }, { int: [2, 4] }, { hp: [60, 120] } ] },

  // === CHEST ===
  iron_plate: { name: 'Iron Plate', slot: 'chest', classes: null,
    core: { hp: [160, 260], armor: [5, 10] },
    affixPool: [ { hpRegen: [3, 6] }, { str: [2, 5] }, { spd: [1, 3] }, { mp: [80, 160] }, { armor: [2, 5] } ] },

  // === HANDS ===
  leather_gloves: { name: 'Leather Gloves', slot: 'hands', classes: null,
    core: { dex: [2, 5], armor: [2, 4] },
    affixPool: [ { spd: [2, 5] }, { hp: [60, 120] }, { str: [2, 4] }, { int: [2, 4] }, { dex: [2, 4] } ] },

  // === PANTS ===
  iron_greaves: { name: 'Iron Greaves', slot: 'pants', classes: null,
    core: { hp: [120, 200], armor: [3, 7] },
    affixPool: [ { spd: [2, 4] }, { hpRegen: [2, 4] }, { str: [2, 4] }, { armor: [2, 4] }, { hp: [60, 120] } ] },

  // === BOOTS (the move-speed item) ===
  swift_boots: { name: 'Swift Boots', slot: 'boots', classes: null,
    core: { spd: [5, 12], hp: [60, 120] },
    affixPool: [ { armor: [2, 4] }, { dex: [2, 4] }, { hpRegen: [2, 4] }, { spd: [2, 5] }, { hp: [60, 120] } ] },

  // === RINGS ===
  band_of_might: { name: 'Band of Might', slot: 'ring', classes: null,
    core: { str: [3, 7], hp: [80, 160] },
    affixPool: [ { armor: [2, 5] }, { spd: [2, 4] }, { hpRegen: [2, 4] }, { str: [2, 4] }, { hp: [60, 120] } ] },
  band_of_focus: { name: 'Band of Focus', slot: 'ring', classes: null,
    core: { int: [3, 7], mp: [120, 240] },
    affixPool: [ { hpRegen: [2, 5] }, { spd: [2, 4] }, { hp: [60, 120] }, { int: [2, 4] }, { mp: [80, 160] } ] },

  // === AMULET ===
  vital_amulet: { name: 'Vital Amulet', slot: 'amulet', classes: null,
    core: { hp: [140, 240], hpRegen: [3, 6] },
    affixPool: [ { armor: [2, 5] }, { mp: [100, 200] }, { spd: [1, 3] }, { hpRegen: [2, 4] }, { hp: [60, 120] } ] },

  // === ABILITY ===
  arcane_focus: { name: 'Arcane Focus', slot: 'ability', classes: null,
    core: { mp: [140, 260], int: [3, 6] },
    affixPool: [ { hpRegen: [2, 5] }, { spd: [1, 3] }, { hp: [60, 120] }, { int: [2, 4] }, { mp: [80, 160] } ] },
}

// ---- BIOME UNIQUE DROPS ----
// One mob-only unique per biome monster (18 total). Marked `unique: true` so
// basesForSlot()/gamble never roll them — they ONLY drop from their mob (see
// world.js killMob → uniqueDrop). Slots are class-agnostic (no weapons) so any
// class can use them. They flow through equip/salvage/reforge like any base.
const BIOME_UNIQUES = {
  // Dark Matter
  u_wraith_shroud: { name: 'Wraith Shroud', slot: 'chest', classes: null, unique: true,
    core: { hp: [200, 300], armor: [6, 11] }, affixPool: [ { spd: [3, 6] }, { hpRegen: [3, 6] } ] },
  u_gravity_core: { name: 'Gravity Core', slot: 'amulet', classes: null, unique: true,
    core: { hp: [180, 280], str: [4, 8] }, affixPool: [ { armor: [3, 6] }, { hpRegen: [2, 5] } ] },
  u_null_sigil: { name: 'Null Sigil', slot: 'ring', classes: null, unique: true,
    core: { int: [4, 8], mp: [160, 280] }, affixPool: [ { hp: [80, 160] }, { spd: [2, 4] } ] },
  // Snow
  u_frost_treads: { name: 'Frost Treads', slot: 'boots', classes: null, unique: true,
    core: { spd: [8, 15], hp: [80, 150] }, affixPool: [ { armor: [3, 5] }, { dex: [3, 5] } ] },
  u_icebound_charm: { name: 'Icebound Charm', slot: 'amulet', classes: null, unique: true,
    core: { hp: [160, 260], mp: [120, 220] }, affixPool: [ { armor: [3, 6] }, { hpRegen: [2, 5] } ] },
  u_glacier_plate: { name: 'Glacier Plate', slot: 'chest', classes: null, unique: true,
    core: { hp: [240, 340], armor: [8, 14] }, affixPool: [ { hpRegen: [3, 6] }, { str: [3, 6] } ] },
  // Hell
  u_ember_band: { name: 'Ember Band', slot: 'ring', classes: null, unique: true,
    core: { str: [4, 9], hp: [100, 180] }, affixPool: [ { spd: [3, 5] }, { armor: [2, 5] } ] },
  u_chain_girdle: { name: 'Chain Girdle', slot: 'pants', classes: null, unique: true,
    core: { hp: [180, 280], armor: [5, 10] }, affixPool: [ { str: [3, 6] }, { hpRegen: [2, 5] } ] },
  u_magma_helm: { name: 'Magma Helm', slot: 'helmet', classes: null, unique: true,
    core: { armor: [6, 11], hp: [120, 200], str: [3, 6] }, affixPool: [ { hpRegen: [3, 6] }, { spd: [2, 4] } ] },
  // Toxic / Fungal
  u_spore_gloves: { name: 'Spore Gloves', slot: 'hands', classes: null, unique: true,
    core: { dex: [4, 8], armor: [3, 6] }, affixPool: [ { spd: [3, 6] }, { hp: [80, 150] } ] },
  u_venom_amulet: { name: 'Venom Amulet', slot: 'amulet', classes: null, unique: true,
    core: { hp: [160, 260], hpRegen: [4, 8] }, affixPool: [ { dex: [3, 6] }, { armor: [3, 5] } ] },
  u_myco_plate: { name: 'Mycelial Plate', slot: 'chest', classes: null, unique: true,
    core: { hp: [220, 320], armor: [7, 12] }, affixPool: [ { hpRegen: [4, 7] }, { spd: [2, 4] } ] },
  // Ruined Kingdom
  u_squire_helm: { name: 'Squire Helm', slot: 'helmet', classes: null, unique: true,
    core: { armor: [5, 10], hp: [120, 200], str: [3, 6] }, affixPool: [ { spd: [2, 5] }, { hpRegen: [2, 5] } ] },
  u_cursed_ring: { name: 'Cursed Signet', slot: 'ring', classes: null, unique: true,
    core: { str: [4, 8], int: [4, 8] }, affixPool: [ { hp: [80, 160] }, { mp: [100, 200] } ] },
  u_grave_charm: { name: 'Grave Charm', slot: 'ability', classes: null, unique: true,
    core: { mp: [160, 280], int: [4, 7] }, affixPool: [ { hpRegen: [3, 6] }, { hp: [80, 160] } ] },
  // Astral Desert
  u_scarab_band: { name: 'Scarab Band', slot: 'ring', classes: null, unique: true,
    core: { str: [4, 8], hp: [100, 180] }, affixPool: [ { armor: [3, 6] }, { dex: [3, 5] } ] },
  u_mirage_cloak: { name: 'Mirage Cloak', slot: 'boots', classes: null, unique: true,
    core: { spd: [8, 14], hp: [80, 150] }, affixPool: [ { dex: [3, 6] }, { armor: [2, 5] } ] },
  u_sunseer_amulet: { name: 'Sunseer Amulet', slot: 'amulet', classes: null, unique: true,
    core: { mp: [160, 280], int: [4, 8] }, affixPool: [ { hpRegen: [3, 6] }, { hp: [80, 160] } ] },
}

// Void multiplier templates per slot (% based; recalcStats applies these as
// multipliers instead of additive stats). Void items "break" the additive rules.
const VOID_MULT = {
  weapon:  { dmgPct: [10, 18], spdPct: [4, 8] },
  helmet:  { hpPct: [8, 15], armorPct: [8, 14] },
  chest:   { hpPct: [10, 18], armorPct: [8, 14] },
  hands:   { dmgPct: [6, 12], spdPct: [5, 10] },
  pants:   { hpPct: [8, 15], armorPct: [6, 12] },
  boots:   { spdPct: [8, 15], hpPct: [5, 10] },
  ring:    { dmgPct: [6, 12], hpPct: [6, 12] },
  amulet:  { hpPct: [8, 14], mpPct: [10, 18] },
  ability: { mpPct: [10, 18], dmgPct: [6, 12] },
}
// Void affix pool — % multiplier stats a void item can roll. Void rolls 6–10
// of these at random (duplicates stack), on top of any slot weapon mechanics.
const VOID_AFFIXES = {
  hpPct: [6, 14], mpPct: [6, 16], dmgPct: [5, 12], spdPct: [4, 10], armorPct: [5, 12],
}

// Fold biome uniques into the base registry so equip/salvage/reforge resolve
// them by baseKey. They're flagged `unique` and filtered out of random rolls.
Object.assign(ITEM_BASES, BIOME_UNIQUES)

// Legacy alias so older callers referencing ITEM_DEFS keep resolving bases.
const ITEM_DEFS = ITEM_BASES

// All base keys for a slot, optionally filtered by class (null classKey = any).
function basesForSlot(slot, classKey) {
  const out = []
  for (const k in ITEM_BASES) {
    const b = ITEM_BASES[k]
    if (b.unique) continue   // biome uniques are mob-only, never random/gamble
    if (b.slot !== slot) continue
    if (b.classes && classKey && b.classes.indexOf(classKey) < 0) continue
    if (b.classes && !classKey) continue   // class-locked base needs a class
    out.push(k)
  }
  return out
}

// ---- CRAFTING DUST (salvage output; reforge fuel) ----
// One dust type per rarity. Account-wide currency: account.dust { rarity: count }.
const DUST = {
  common:    { key: 'common',    name: 'Common Dust',    color: '#c8c8c8' },
  rare:      { key: 'rare',      name: 'Rare Dust',      color: '#4ea1ff' },
  epic:      { key: 'epic',      name: 'Epic Dust',      color: '#b15bff' },
  legendary: { key: 'legendary', name: 'Legendary Dust', color: '#ffb000' },
  mythic:    { key: 'mythic',    name: 'Mythic Dust',    color: '#ff3b6b' },
  void:      { key: 'void',      name: 'Void Dust',      color: '#7d4bff' },
}

// ---- CRAFTING MATERIALS ----
const MATERIALS = {
  goblin_sigil:  { key: 'goblin_sigil',  name: 'Goblin Sigil',  color: '#d4631a', source: 'goblin_warren' },
  mycelium_core: { key: 'mycelium_core', name: 'Mycelium Core', color: '#7b4f8e', source: 'fungal_cavern' },
  void_shard:    { key: 'void_shard',    name: 'Void Shard',    color: '#9b5cff', source: 'void_rift' },
}
// One primary material per dungeon (data-driven, easy to extend)
const DUNGEON_MATERIAL = {
  goblin_warren: 'goblin_sigil',
  fungal_cavern: 'mycelium_core',
  void_rift: 'void_shard',
}

const INVENTORY_CAP = 30

// ---- HELPERS ----
let _itemSeq = 1
function _genId() { return 'it_' + (Date.now().toString(36)) + '_' + (_itemSeq++) }

// Pretty-print a stat: percentage multiplier stats get a trailing %.
function fmtStatLine(k, v) {
  const val = (typeof v === 'number' && !Number.isInteger(v)) ? v.toFixed(2) : v
  if (PCT_KEYS[k]) {
    const label = k.replace('Pct', '').toUpperCase()
    return `${label} +${val}%`
  }
  return `${k.toUpperCase()} ${val}`
}

// ============================================================
// CORE ROLL SYSTEM — universal rollPercent.
// Every item rolls ONE percent (1..100) applied to ALL its stats.
//   value = lo + (hi - lo) * (rollPercent / 100)
// where [lo,hi] are the base ranges scaled by rarity (except weapon
// mechanic stats range/atkSpd/bspd, which never scale). No per-stat
// averaging — rating == rollPercent.
// ============================================================
function _clampPct(p) { return Math.max(1, Math.min(100, Math.round(p))) }

function _statValue(k, lo, hi, t) {
  // bspd (projectile speed) is a FIXED weapon property: it never scales with the
  // item's rollPercent and is never changed by reforge. Always use the midpoint.
  if (k === 'bspd') t = 0.5
  const v = lo + (hi - lo) * t
  return (hi - lo) >= 1 ? Math.round(v) : Math.round(v * 100) / 100
}

// Roll a concrete item from a base + rarity. rollPercent optional (random 1..100).
function rollItem(baseKey, rarityKey, rollPercent, source) {
  const base = ITEM_BASES[baseKey]
  if (!base) { console.warn('Unknown item base:', baseKey); return null }
  const rar = RARITY[rarityKey] || RARITY.common
  const p = rollPercent == null ? (1 + Math.floor(Math.random() * 100)) : _clampPct(rollPercent)
  const t = p / 100
  const isVoid = !!rar.multiplier
  const stats = {}

  if (isVoid) {
    // VOID: 6–10 random multiplier (%) affixes (duplicates stack). The single
    // rollPercent still drives every value — only WHICH affixes is random.
    const count = 6 + Math.floor(Math.random() * 5)   // 6..10
    const keys = Object.keys(VOID_AFFIXES)
    for (let i = 0; i < count; i++) {
      const k = keys[Math.random() * keys.length | 0]
      const [lo, hi] = VOID_AFFIXES[k]
      stats[k] = Math.round(((stats[k] || 0) + lo + (hi - lo) * t) * 10) / 10
    }
    // Weapons still need functional mechanic stats so they can fire.
    if (base.slot === 'weapon') {
      for (const k of ['dmg', 'range', 'atkSpd', 'bspd']) {
        if (base.core[k] == null) continue
        const [lo, hi] = base.core[k]
        const s = NON_SCALING[k] ? 1 : rar.scale
        stats[k] = _statValue(k, lo * s, hi * s, t)
      }
    }
  } else {
    const apply = (obj) => {
      for (const k in obj) {
        const [lo, hi] = obj[k]
        const s = NON_SCALING[k] ? 1 : rar.scale
        stats[k] = _statValue(k, lo * s, hi * s, t)
      }
    }
    apply(base.core)
    const n = rar.affixes || 0
    const pool = base.affixPool || []
    for (let i = 0; i < n && i < pool.length; i++) apply(pool[i])
  }

  const inst = {
    id: _genId(), baseKey,
    name: (isVoid ? 'Void ' : '') + base.name,
    slot: base.slot,
    rarity: rarityKey,
    color: rarityColor(rarityKey),
    classes: base.classes || null,
    rollPercent: p,
    void: isVoid,
    source: source || 'world',
    stats,
    rating: p,            // single roll quality == rollPercent
    createdAt: Date.now(),
  }
  for (const k in stats) inst[k] = stats[k]
  return inst
}

// Roll a random item: random base (optionally class-filtered), weighted rarity.
function randomItem(source, opts) {
  opts = opts || {}
  const slot = opts.slot || DROP_SLOTS[Math.random() * DROP_SLOTS.length | 0]
  let bases = basesForSlot(slot, null)
  // Exclude class-locked bases that don't match the active character.
  const ck = opts.classKey || (typeof G !== 'undefined' && G.char && G.char.classKey) || null
  bases = bases.concat(ck ? basesForSlot(slot, ck).filter(k => ITEM_BASES[k].classes) : [])
  bases = Array.from(new Set(bases))
  if (!bases.length) return null
  const baseKey = bases[Math.random() * bases.length | 0]
  const rarity = opts.rarity || rollRarity(opts.boost || 0)
  return rollItem(baseKey, rarity, null, source)
}

// ---- Backwards-compatible shims (used by chat/inventory debug helpers) ----
// rollItemInstance(baseKey, source): roll that base at a weighted-random rarity.
function rollItemInstance(baseKey, source) { return rollItem(baseKey, rollRarity(0), null, source) }

const DROP_SLOTS = ['weapon', 'helmet', 'chest', 'hands', 'pants', 'boots', 'ring', 'amulet', 'ability']
const TIER_RARITY = { 1: 'common', 2: 'rare', 3: 'epic', 4: 'legendary', 5: 'mythic', 6: 'void' }

// genTierItem(slot, tier, source): pick a base for the slot, roll at tier rarity.
function genTierItem(slot, tier, source) {
  if (slot === 'ring1' || slot === 'ring2') slot = 'ring'
  const rarity = TIER_RARITY[Math.max(1, Math.min(6, tier | 0 || 1))]
  return randomItem(source, { slot, rarity })
}

// ============================================================
// CRAFTING ACTIONS — salvage, reforge, fusion, gamble
// ============================================================
function ensureDust(acct) { if (!acct.dust || typeof acct.dust !== 'object') acct.dust = {} }
function addDust(acct, rarity, n) { ensureDust(acct); acct.dust[rarity] = (acct.dust[rarity] || 0) + n; return acct.dust[rarity] }

// Salvage: destroy an item, return dust of its rarity (amount scales with tier).
function salvageItem(acct, item) {
  if (!item) return null
  const rarity = item.rarity || 'common'
  const amount = (RARITY[rarity] || RARITY.common).tier   // common 1 .. void 6
  addDust(acct, rarity, amount)
  return { rarity, amount }
}

const REFORGE_COST = 3   // dust of the item's rarity per reforge

// Reforge: reroll ONLY the rollPercent (type/rarity/affixes/identity unchanged).
function reforgeItem(acct, item) {
  if (!item || !item.baseKey) return { error: 'Cannot reforge this item' }
  ensureDust(acct)
  const rarity = item.rarity
  if ((acct.dust[rarity] || 0) < REFORGE_COST) return { error: `Need ${REFORGE_COST} ${(DUST[rarity] || {}).name || rarity}` }
  acct.dust[rarity] -= REFORGE_COST
  const re = rollItem(item.baseKey, rarity, null, item.source)
  if (!re) return { error: 'Reforge failed' }
  re.id = item.id   // same item identity, new roll
  return { item: re }
}

// Fusion: 3 identical items (same base + rarity) → one new item rolled in
// [maxRoll .. 100]. Deterministic path toward perfect rolls.
function canFuse(items) {
  if (!items || items.length !== 3) return false
  const b = items[0].baseKey, r = items[0].rarity
  return items.every(i => i && i.baseKey === b && i.rarity === r)
}
function fuseItems(items) {
  if (!canFuse(items)) return { error: 'Need 3 identical items (same base + rarity)' }
  const hi = Math.max(...items.map(i => i.rollPercent || 1))
  const p = hi + Math.floor(Math.random() * (100 - hi + 1))
  const it = rollItem(items[0].baseKey, items[0].rarity, p, items[0].source)
  return it ? { item: it } : { error: 'Fusion failed' }
}

const GAMBLE_COST = 100   // glory per gamble
const GAMBLE_SLOTS = ['weapon', 'helmet', 'chest', 'boots', 'ring']

// Gamble: spend glory, get a random item of `slot`, weighted by rarity and
// filtered by the character's class (e.g. mage only gets mage weapons).
function gambleItem(acct, char, slot) {
  if (!char) return { error: 'No character' }
  if ((acct.glory || 0) < GAMBLE_COST) return { error: 'Not enough Glory' }
  let bases = basesForSlot(slot, char.classKey)
  if (!bases.length) return { error: 'No items for that slot' }
  acct.glory -= GAMBLE_COST
  const baseKey = bases[Math.random() * bases.length | 0]
  const rarity = rollRarity(0.25)
  const it = rollItem(baseKey, rarity, null, 'gamble')
  return it ? { item: it } : { error: 'Gamble failed' }
}

// Generate boss loot for a dungeon: often an item (boss loot is biased toward
// higher rarity tiers). Materials removed — loot is items only.
function generateBossLoot(dungeonKey) {
  const loot = { items: [], materials: {} }
  if (Math.random() < 0.85) {
    const it = randomItem(dungeonKey, { boost: 0.6 })
    if (it) loot.items.push(it)
  }
  return loot
}

// Small chance loot for a non-boss mob kill. stars bias rarity upward.
// opts: { chance, source, matKey }
function rollMobDrop(stars, opts) {
  opts = opts || {}
  const chance = opts.chance != null ? opts.chance : 0.10
  if (Math.random() > chance) return null
  const loot = { items: [], materials: {} }
  const it = randomItem(opts.source || 'world', { boost: (stars || 0) * 0.12 })
  if (it) loot.items.push(it)
  return loot
}

// ---- LOOT BAG / CHEST ----
// Bag: { x, y, items[], materials{}, life, maxLife, color, rarity, bob }
function createLootBag(x, y, loot, lifetime = 120) {
  const items = (loot && loot.items) || []
  const materials = (loot && loot.materials) || {}

  // Best contained item rarity → bag color/glow; fallback to material tone.
  let bestRarity = null
  for (const it of items) {
    if (!bestRarity || rarityRank(it.rarity) > rarityRank(bestRarity)) bestRarity = it.rarity
  }
  let color
  if (bestRarity) color = rarityColor(bestRarity)
  else {
    const matKey = Object.keys(materials)[0]
    color = (matKey && MATERIALS[matKey] && MATERIALS[matKey].color) || '#c8c8c8'
  }

  return {
    x, y,
    items, materials,
    rarity: bestRarity,
    color,
    life: lifetime, maxLife: lifetime,
    bob: Math.random() * Math.PI * 2,
  }
}

// ---- INVENTORY / MATERIAL MUTATION ----
function addItemToInventory(char, item) {
  if (!char.inventory) char.inventory = []
  if (char.inventory.length >= INVENTORY_CAP) return false
  char.inventory.push(item)
  return true
}

function addMaterial(acct, matKey, count) {
  if (!acct.materials) acct.materials = {}
  acct.materials[matKey] = (acct.materials[matKey] || 0) + count
  return acct.materials[matKey]
}

function itemDisplayName(item) {
  return item.name + (typeof item.rating === 'number' ? `  ${item.rating}%` : '')
}

// ---- PICKUP ----
// Picks up materials (always) and as many items as inventory space allows.
// Leftover items remain in the bag. Spawns floating feedback text.
// Returns true if the bag is now empty (caller should remove it).
function pickupLootBag(char, acct, bag) {
  let fx = bag.x, fy = bag.y - 16

  // Materials → account crafting materials (always fit)
  for (const matKey in bag.materials) {
    const count = bag.materials[matKey]
    if (count <= 0) continue
    addMaterial(acct, matKey, count)
    const m = MATERIALS[matKey]
    spawnFloatText(fx, fy, `+${count} ${m ? m.name : matKey}`, m ? m.color : '#fff')
    fy -= 16
    LootLog.push(`+${count} ${m ? m.name : matKey}`, m ? m.color : '#fff')
  }
  bag.materials = {}

  // Items → character inventory (respect 30 cap)
  const leftover = []
  let full = false
  for (const item of bag.items) {
    if (addItemToInventory(char, item)) {
      spawnFloatText(fx, fy, itemDisplayName(item), item.color)
      fy -= 16
      LootLog.push(itemDisplayName(item), item.color)
    } else {
      leftover.push(item)
      full = true
    }
  }
  bag.items = leftover

  if (full) {
    spawnFloatText(bag.x, bag.y - 30, 'Inventory full', '#ff5555')
    LootLog.push('Inventory full', '#ff5555')
  }

  return bag.items.length === 0 && Object.keys(bag.materials).length === 0
}

// ---- LOOT LOG (latest notifications for HUD) ----
const LootLog = {
  entries: [],   // { text, color, life }
  push(text, color) {
    this.entries.push({ text, color, life: 6 })
    while (this.entries.length > 6) this.entries.shift()
  },
  update(dt) {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      this.entries[i].life -= dt
      if (this.entries[i].life <= 0) this.entries.splice(i, 1)
    }
  }
}

// ---- RENDER: loot bags in world space ----
function renderLootBag(bag, offX, offY, t) {
  const sx = bag.x + offX
  const sy = bag.y + offY + Math.sin(t / 400 + bag.bob) * 3

  // Loot beam (rarity-colored vertical glow)
  const beamH = 70
  const grad = ctx.createLinearGradient(sx, sy - beamH, sx, sy + 6)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, bag.color)
  ctx.globalAlpha = 0.35
  ctx.fillStyle = grad
  ctx.fillRect(sx - 6, sy - beamH, 12, beamH + 6)
  ctx.globalAlpha = 1

  // Rarity glow ring (pulsing)
  const pulse = 0.5 + Math.sin(t / 300 + bag.bob) * 0.5
  ctx.shadowBlur = 14 + pulse * 10
  ctx.shadowColor = bag.color

  // Chest/bag body
  ctx.fillStyle = bag.color
  ctx.fillRect(sx - 9, sy - 8, 18, 14)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(sx - 9, sy - 2, 18, 2)
  ctx.shadowBlur = 0

  // Lid highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(sx - 9, sy - 8, 18, 3)
}

// ---- RENDER: floating item tooltip (used by loot preview hover) ----
function renderItemTooltip(it, x, y) {
  if (!it) return
  const lines = []
  lines.push({ t: it.name, c: it.color || '#fff', b: true })
  const rar = (RARITY[it.rarity] && RARITY[it.rarity].name) || it.rarity || '?'
  const src = (window.DUNGEONS && DUNGEONS[it.source] && DUNGEONS[it.source].name) || it.source || '—'
  lines.push({ t: `${rar} • ${it.slot} • ${src}`, c: '#9fb3c8' })
  const stats = it.stats || {}
  for (const k in stats) lines.push({ t: fmtStatLine(k, stats[k]), c: it.void && PCT_KEYS[k] ? '#b18bff' : '#d8e6f2' })
  const roll = (typeof it.rollPercent === 'number') ? it.rollPercent : it.rating
  if (typeof roll === 'number') lines.push({ t: `Roll ${roll}%`, c: '#ffd60a' })

  ctx.font = '10px monospace'
  let w = 0
  for (const l of lines) w = Math.max(w, ctx.measureText(l.t).width)
  const pw = w + 16, ph = lines.length * 14 + 10
  let px = Math.min(x, canvas.width - pw - 6)
  let py = Math.min(y, canvas.height - ph - 6)
  ctx.fillStyle = 'rgba(0,0,0,0.92)'; ctx.strokeStyle = it.color || '#888'; ctx.lineWidth = 1
  ctx.fillRect(px, py, pw, ph); ctx.strokeRect(px, py, pw, ph)
  ctx.textAlign = 'left'
  let yy = py + 16
  for (const l of lines) {
    ctx.fillStyle = l.c; ctx.font = (l.b ? 'bold ' : '') + '10px monospace'
    ctx.fillText(l.t, px + 8, yy); yy += 14
  }
}

// ---- RENDER: loot chest preview (contents + rarity colors + ratings) ----
// Drawn above a nearby loot bag. Hovering a row shows the item tooltip.
function renderLootPreview(bag, offX, offY) {
  if (!bag) return
  const rows = []
  for (const it of bag.items) {
    rows.push({ color: it.color || '#ccc', item: it,
      label: `${it.name}  ${typeof it.rating === 'number' ? it.rating + '%' : ''}` })
  }
  if (!rows.length) return

  const lineH = 16, padX = 8, padY = 6, header = 14
  ctx.font = '11px monospace'
  let w = 0
  for (const r of rows) w = Math.max(w, ctx.measureText(r.label).width)
  const panelW = w + padX * 2 + 14
  const panelH = rows.length * lineH + padY * 2 + header
  let px = bag.x + offX - panelW / 2
  let py = bag.y + offY - 34 - panelH
  px = Math.max(8, Math.min(canvas.width - panelW - 8, px))
  py = Math.max(8, py)

  ctx.fillStyle = 'rgba(6,8,18,0.92)'; ctx.strokeStyle = bag.color || '#888'; ctx.lineWidth = 1
  ctx.fillRect(px, py, panelW, panelH); ctx.strokeRect(px, py, panelW, panelH)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 9px monospace'
  ctx.fillText('LOOT', px + padX, py + 11)

  let y = py + header + padY + 8
  let hoverItem = null
  for (const r of rows) {
    const rx = px + padX, ry = y - lineH + 4, rw = panelW - padX * 2, rh = lineH
    if (mouse.x >= rx && mouse.x <= rx + rw && mouse.y >= ry && mouse.y <= ry + rh && r.item) hoverItem = r.item
    ctx.fillStyle = r.color
    ctx.beginPath(); ctx.arc(px + padX + 4, y - 4, 3, 0, Math.PI * 2); ctx.fill()
    ctx.font = '11px monospace'
    ctx.fillText(r.label, px + padX + 12, y)
    y += lineH
  }
  ctx.textAlign = 'left'
  if (hoverItem) renderItemTooltip(hoverItem, mouse.x + 12, mouse.y + 12)
}

// ---- RENDER: loot HUD (recent notifications + inventory + materials) ----
function renderLootHUD(char, acct) {
  const w = canvas.width
  const pad = 12
  let y = 206   // start below the top-right minimap module
  const x = w - pad

  ctx.textAlign = 'right'

  // Recent loot notifications
  if (LootLog.entries.length) {
    ctx.font = 'bold 11px monospace'
    for (let i = LootLog.entries.length - 1; i >= 0; i--) {
      const e = LootLog.entries[i]
      ctx.globalAlpha = Math.min(1, e.life)
      ctx.fillStyle = e.color
      ctx.fillText(e.text, x, y)
      y += 15
    }
    ctx.globalAlpha = 1
  }

  // Inventory list (compact, last ~8)
  const inv = char.inventory || []
  y += 6
  ctx.fillStyle = '#9fb3c8'
  ctx.font = 'bold 10px monospace'
  ctx.fillText(`INVENTORY ${inv.length}/${INVENTORY_CAP}`, x, y)
  y += 15
  ctx.font = '10px monospace'
  const start = Math.max(0, inv.length - 8)
  for (let i = start; i < inv.length; i++) {
    const it = inv[i]
    ctx.fillStyle = it.color || '#ccc'
    ctx.fillText(itemDisplayName(it), x, y)
    y += 13
  }

  ctx.textAlign = 'left'
}

// ---- Expose to other plain scripts ----
window.RARITY = RARITY
window.RARITY_ORDER = RARITY_ORDER
window.rarityColor = rarityColor
window.ITEM_SLOTS = ITEM_SLOTS
window.ITEM_DEFS = ITEM_DEFS
window.ITEM_BASES = ITEM_BASES
window.VOID_MULT = VOID_MULT
window.PCT_KEYS = PCT_KEYS
window.DUST = DUST
window.MATERIALS = MATERIALS
window.DUNGEON_MATERIAL = DUNGEON_MATERIAL
window.INVENTORY_CAP = INVENTORY_CAP
window.basesForSlot = basesForSlot
window.rollItem = rollItem
window.randomItem = randomItem
window.rollRarity = rollRarity
window.rollItemInstance = rollItemInstance
window.generateBossLoot = generateBossLoot
window.createLootBag = createLootBag
window.renderLootBag = renderLootBag
window.renderLootHUD = renderLootHUD
window.pickupLootBag = pickupLootBag
window.addItemToInventory = addItemToInventory
window.addMaterial = addMaterial
window.addDust = addDust
window.ensureDust = ensureDust
window.salvageItem = salvageItem
window.reforgeItem = reforgeItem
window.canFuse = canFuse
window.fuseItems = fuseItems
window.gambleItem = gambleItem
window.GAMBLE_COST = GAMBLE_COST
window.GAMBLE_SLOTS = GAMBLE_SLOTS
window.REFORGE_COST = REFORGE_COST
window.itemDisplayName = itemDisplayName
window.LootLog = LootLog
window.genTierItem = genTierItem
window.rollMobDrop = rollMobDrop
window.fmtStatLine = fmtStatLine
window.renderLootPreview = renderLootPreview
window.renderItemTooltip = renderItemTooltip
