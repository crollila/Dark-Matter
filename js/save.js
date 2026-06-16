// ============================================================
// SAVE — localStorage persistence (account progression + chars)
// ------------------------------------------------------------
// Versioned, defensive save/load. Account-side progression
// (glory, materials, stash, etc.) is stored SEPARATELY from
// character-bound carried data (inventory/gear), so a future
// permadeath patch can delete a character and its carried items
// while preserving account materials/stash/glory.
//
// Globals exposed (plain-JS style, attached to window):
//   saveGame, loadGame, clearSave, ensureSaveDefaults
//   SaveSystem.{ saveGame, loadGame, clearSave, ensureSaveDefaults,
//               debugState, renderFlash }
// ============================================================

const SAVE_KEY = 'epstein_island_save'
const SCHEMA_VERSION = 1

let _savedAt = 0   // timestamp of last successful save (for HUD flash)

// ---- small safe coercion helpers ----
function _num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d }
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function _clampInt(v, lo, hi, d) { return Math.max(lo, Math.min(hi, Math.round(_num(v, d)))) }

// ---- account default scaffolding (idempotent) ----
// Guarantees every account-side field exists, even for an empty account
// or an older save missing newer fields. Safe to call repeatedly.
function ensureSaveDefaults(acct) {
  if (!acct || typeof acct !== 'object') return acct
  if (typeof acct.glory !== 'number' || !isFinite(acct.glory)) acct.glory = 0
  if (!acct.materials || typeof acct.materials !== 'object') acct.materials = {}
  if (!acct.dust || typeof acct.dust !== 'object') acct.dust = {}
  if (!Array.isArray(acct.characters)) acct.characters = []
  // account-side progression placeholders (future patches)
  if (!Array.isArray(acct.stash)) acct.stash = []
  if (!acct.dungeonCompletions || typeof acct.dungeonCompletions !== 'object') acct.dungeonCompletions = {}
  if (!Array.isArray(acct.unlockedClasses)) acct.unlockedClasses = []
  if (!Array.isArray(acct.titles)) acct.titles = []
  if (!acct.cosmetics || typeof acct.cosmetics !== 'object') acct.cosmetics = {}
  return acct
}

// ---- character (de)serialization ----
// We persist only identity + progression + carried data. Derived stats
// (maxHp, str, etc.) are recomputed from class + level via recalcStats().
function serializeCharacter(c) {
  return {
    id: c.id,
    classKey: c.classKey,
    name: c.name,
    level: c.level,
    xp: c.xp,
    xpNext: c.xpNext,
    glory: c.glory,
    hp: c.hp,
    mp: c.mp,
    inventory: Array.isArray(c.inventory) ? c.inventory : [],   // character-carried
    gear: (c.gear && typeof c.gear === 'object') ? c.gear : {},  // character-carried
  }
}

function deserializeCharacter(data) {
  if (!data || typeof data !== 'object' || !CLASSES[data.classKey]) {
    console.warn('[SaveSystem] skipping character with invalid class:', data && data.classKey)
    return null
  }
  // Rebuild a valid character, then overlay saved progression/carried data.
  const c = createCharacter(data.classKey, data.name || '')
  if (data.id) c.id = data.id
  c.level  = _clampInt(data.level, 1, LEVEL_CAP, 1)
  c.xp     = _num(data.xp, 0)
  c.xpNext = _num(data.xpNext, xpForLevel(c.level + 1))
  c.glory  = _num(data.glory, 0)

  if (Array.isArray(data.inventory)) {
    const cap = (typeof INVENTORY_CAP === 'number') ? INVENTORY_CAP : 30
    c.inventory = data.inventory.slice(0, cap)
  }
  if (data.gear && typeof data.gear === 'object') {
    for (const slot in c.gear) if (slot in data.gear) c.gear[slot] = data.gear[slot]
  }

  recalcStats(c)
  // Restore current hp/mp, clamped to the (possibly new) maxes.
  c.hp = _clamp(_num(data.hp, c.maxHp), 0, c.maxHp)
  c.mp = _clamp(_num(data.mp, c.maxMp), 0, c.maxMp)
  c.alive = true
  return c
}

// ---- SAVE ----
function saveGame() {
  try {
    ensureSaveDefaults(account)
    const data = {
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
      account: {
        glory: account.glory,
        materials: account.materials,
        dust: account.dust,
        stash: account.stash,
        dungeonCompletions: account.dungeonCompletions,
        unlockedClasses: account.unlockedClasses,
        titles: account.titles,
        cosmetics: account.cosmetics,
      },
      // Permadeath safety: never persist a dead character's carried gear/inventory,
      // even if a future path forgets to remove it from account.characters.
      characters: account.characters.filter(c => c && c.alive !== false).map(serializeCharacter),
      // Don't pin a dead/removed character as the selection.
      selectedCharacterId: (typeof G !== 'undefined' && G.char && G.char.alive !== false && G.char.id) || null,
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    _savedAt = Date.now()
    return true
  } catch (e) {
    console.warn('[SaveSystem] saveGame failed:', e)
    return false
  }
}

// ---- LOAD ----
// Mutates the existing `account` object in place (so references stay valid).
// Returns true if a save was applied, false if starting fresh.
function loadGame() {
  ensureSaveDefaults(account)

  let raw
  try {
    raw = localStorage.getItem(SAVE_KEY)
  } catch (e) {
    console.warn('[SaveSystem] localStorage unavailable; starting fresh:', e)
    return false
  }
  if (!raw) return false  // no save → normal fresh start

  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    console.warn('[SaveSystem] corrupt save JSON ignored; starting fresh:', e)
    return false
  }
  if (!data || typeof data !== 'object') {
    console.warn('[SaveSystem] invalid save shape ignored; starting fresh')
    return false
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    console.warn(`[SaveSystem] save schema v${data.schemaVersion} != v${SCHEMA_VERSION}; loading with defaults`)
  }

  // ---- account-side ----
  const a = (data.account && typeof data.account === 'object') ? data.account : {}
  account.glory = _num(a.glory, 0)
  account.materials = (a.materials && typeof a.materials === 'object') ? a.materials : {}
  account.dust = (a.dust && typeof a.dust === 'object') ? a.dust : {}
  account.stash = Array.isArray(a.stash) ? a.stash : []
  account.dungeonCompletions = (a.dungeonCompletions && typeof a.dungeonCompletions === 'object') ? a.dungeonCompletions : {}
  account.unlockedClasses = Array.isArray(a.unlockedClasses) ? a.unlockedClasses : []
  account.titles = Array.isArray(a.titles) ? a.titles : []
  account.cosmetics = (a.cosmetics && typeof a.cosmetics === 'object') ? a.cosmetics : {}

  // ---- character-side ----
  account.characters.length = 0
  if (Array.isArray(data.characters)) {
    for (const cd of data.characters) {
      try {
        const c = deserializeCharacter(cd)
        if (c) account.characters.push(c)
      } catch (e) {
        console.warn('[SaveSystem] failed to load a character; skipping:', e)
      }
    }
  }

  ensureSaveDefaults(account)

  // Pre-select last-used character (menu remains the entry point; this just
  // restores the reference so the UI flow is unchanged).
  const selId = data.selectedCharacterId
  if (selId && typeof G !== 'undefined') {
    const sel = account.characters.find(c => c.id === selId)
    if (sel) G.char = sel
  }
  return true
}

// ---- CLEAR ----
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
    return true
  } catch (e) {
    console.warn('[SaveSystem] clearSave failed:', e)
    return false
  }
}

// ---- DEBUG / console helper ----
function _debugState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return {
      key: SAVE_KEY,
      present: !!raw,
      bytes: raw ? raw.length : 0,
      parsed: raw ? JSON.parse(raw) : null,
    }
  } catch (e) {
    return { key: SAVE_KEY, error: String(e) }
  }
}

// ---- tiny "Saved" HUD flash (drawn by renderHUD across all zones) ----
function renderSaveIndicator() {
  const dur = 1500
  const el = Date.now() - _savedAt
  if (_savedAt === 0 || el < 0 || el > dur) return
  const alpha = el < 800 ? 1 : Math.max(0, 1 - (el - 800) / (dur - 800))
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#7CFC9A'
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('Saved', 14, 16)
  ctx.restore()
}

// ---- expose (plain-JS global style) ----
const SaveSystem = {
  saveGame, loadGame, clearSave, ensureSaveDefaults,
  debugState: _debugState,
  renderFlash: renderSaveIndicator,
}
window.saveGame = saveGame
window.loadGame = loadGame
window.clearSave = clearSave
window.ensureSaveDefaults = ensureSaveDefaults
window.renderSaveIndicator = renderSaveIndicator
window.SaveSystem = SaveSystem
