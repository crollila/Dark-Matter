// ============================================================
// PLAYER — classes, stat scaling 1→20, glory, gear, ability
// ============================================================

// Each class: display name, main_stat key, max stats at level 20, level 1 base
const CLASSES = {
  warrior: {
    name: 'Warrior', color: '#e63946', mainStat: 'str',
    desc: 'Heavily armored brawler. High HP, hits hard up close.',
    base: { hp: 2000, mp: 500,  spd: 145, str: 5  },
    max:  { hp: 11500, mp: 3500, spd: 145, str: 100 },
    abilityName: 'Shield Bash',
    ability(char) {
      if (char.mp < 30) return
      char.mp -= 30
      // stub: pushback nearby enemies — implemented in world/dungeon update
      char.abilityActive = true; char.abilityCooldown = 3.0
      spawnParticles(char.x, char.y, '#e63946', 12, 120)
    }
  },
  rogue: {
    name: 'Rogue', color: '#a8dadc', mainStat: 'dex',
    desc: 'Blistering speed and attack rate. Fragile but deadly.',
    base: { hp: 1500, mp: 600,  spd: 190, dex: 5  },
    max:  { hp: 9500,  mp: 4500, spd: 190, dex: 100 },
    abilityName: 'Blink',
    ability(char) {
      if (char.mp < 50) return
      char.mp -= 50
      // stub: dash toward mouse
      const [wx, wy] = screenToWorld(mouse.x, mouse.y)
      const dx = wx - char.x, dy = wy - char.y
      const d = Math.sqrt(dx*dx + dy*dy) || 1
      char.x += dx/d * 120; char.y += dy/d * 120
      char.abilityCooldown = 4.0
      spawnParticles(char.x, char.y, '#a8dadc', 10, 100)
    }
  },
  mage: {
    name: 'Mage', color: '#4cc9f0', mainStat: 'int',
    desc: 'Devastating magic damage. Low HP, needs positioning.',
    base: { hp: 1200, mp: 1000, spd: 155, int: 5  },
    max:  { hp: 9000,  mp: 7500, spd: 155, int: 100 },
    abilityName: 'Nova',
    ability(char) {
      if (char.mp < 80) return
      char.mp -= 80
      // stub: radial burst — implemented in zone update
      char.abilityActive = true; char.abilityCooldown = 5.0
      spawnParticles(char.x, char.y, '#4cc9f0', 20, 160)
    }
  },
  priest: {
    name: 'Priest', color: '#f4d35e', mainStat: 'int',
    desc: 'Heals over time, supports allies. INT boosts healing.',
    base: { hp: 1400, mp: 900,  spd: 160, int: 500  },
    max:  { hp: 10000, mp: 6500, spd: 160, int: 1000 },
    abilityName: 'Heal',
    ability(char) {
      if (char.mp < 60) return
      char.mp -= 20
      const heal = 500 + char.int * 20
      char.hp = Math.min(char.maxHp, char.hp + heal)
      char.abilityCooldown = 1.0
      spawnFloatText(char.x, char.y - 20, `+${heal}`, '#f4d35e')
      spawnParticles(char.x, char.y, '#f4d35e', 10, 60)
    }
  },
  archer: {
    name: 'Archer', color: '#90be6d', mainStat: 'dex',
    desc: 'Ranged specialist. High speed and bullet range.',
    base: { hp: 1500, mp: 600,  spd: 175, dex: 5  },
    max:  { hp: 9750,  mp: 4000, spd: 175, dex: 100 },
    abilityName: 'Volley',
    ability(char) {
      if (char.mp < 40) return
      char.mp -= 40
      char.abilityActive = true; char.abilityCooldown = 3.5
      spawnParticles(char.x, char.y, '#90be6d', 8, 80)
    }
  }
}

const CLASS_ORDER = ['warrior', 'rogue', 'mage', 'priest', 'archer']
const LEVEL_CAP = 20
const GLORY_PER_KILL = 1  // post-cap glory per enemy kill

// Linearly interpolate stat from base→max over levels 1→20
function statAtLevel(classKey, statKey, level) {
  const cls = CLASSES[classKey]
  const base = cls.base[statKey] ?? 0
  const max  = cls.max[statKey]  ?? base
  const t = Math.min(1, (level - 1) / (LEVEL_CAP - 1))
  return Math.round(base + (max - base) * t)
}

// XP needed for each level (quick early, slower late)
function xpForLevel(level) {
  return level <= 1 ? 0 : Math.round(100 * Math.pow(level - 1, 1.02))
}

// Create a fresh character object
function createCharacter(classKey, name = '') {
  const cls = CLASSES[classKey]
  const ms = cls.mainStat
  const char = {
    id: 'ch_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36),
    name: name || cls.name,
    classKey,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(2),
    glory: 0,
    hp: 0, maxHp: 0,
    mp: 0, maxMp: 0,
    spd: 0, armor: 0,
    str: 0, dex: 0, int: 0,
    x: 0, y: 0,
    shootTimer: 0,
    abilityCooldown: 0,
    abilityActive: false,
    alive: true,
    inventory: [],   // up to 30 items
    gear: {
      weapon: null,   // weapon (or [main,off] for dual wield)
      helmet: null,
      chest: null,
      hands: null,
      pants: null,
      boots: null,
      ring1: null,
      ring2: null,
      amulet: null,
      ability: null,  // class-specific slot
    },
    mpRegen: 15,
    hpRegen: 10,      // set by recalcStats from gear; base is 0
  }
  recalcStats(char)
  char.hp = char.maxHp
  char.mp = char.maxMp
  return char
}

function recalcStats(char) {
  const cls = CLASSES[char.classKey]
  const ms = cls.mainStat
  const lv = char.level

  char.maxHp  = statAtLevel(char.classKey, 'hp',  lv)
  char.maxMp  = statAtLevel(char.classKey, 'mp',  lv)
  char.spd    = statAtLevel(char.classKey, 'spd', lv)
  char[ms]    = statAtLevel(char.classKey, ms,    lv)
  char.str = char.classKey === 'warrior' ? char.str : 0
  char.dex = (char.classKey === 'rogue' || char.classKey === 'archer') ? char.dex : 0
  char.int = (char.classKey === 'mage'  || char.classKey === 'priest') ? char.int : 0
  char.armor   = 0
  char.hpRegen = 20  // base HP regen per second
  char.dmgMult = 1   // damage multiplier from void (% damage) gear

  // Apply additive gear bonuses + collect void multiplier (% based) stats.
  let hpPct = 0, mpPct = 0, dmgPct = 0, spdPct = 0, armorPct = 0
  for (const slot of Object.values(char.gear)) {
    if (!slot) continue
    if (slot.hp)      char.maxHp   += slot.hp
    if (slot.mp)      char.maxMp   += slot.mp
    if (slot.spd)     char.spd     += slot.spd
    if (slot.str)     char.str     += slot.str
    if (slot.dex)     char.dex     += slot.dex
    if (slot.int)     char.int     += slot.int
    if (slot.armor)   char.armor   += slot.armor
    if (slot.hpRegen) char.hpRegen += slot.hpRegen
    if (slot.hpPct)    hpPct    += slot.hpPct
    if (slot.mpPct)    mpPct    += slot.mpPct
    if (slot.dmgPct)   dmgPct   += slot.dmgPct
    if (slot.spdPct)   spdPct   += slot.spdPct
    if (slot.armorPct) armorPct += slot.armorPct
  }

  // Apply void multipliers after additive stats.
  if (hpPct)    char.maxHp = Math.round(char.maxHp * (1 + hpPct / 100))
  if (mpPct)    char.maxMp = Math.round(char.maxMp * (1 + mpPct / 100))
  if (spdPct)   char.spd   = Math.round(char.spd   * (1 + spdPct / 100))
  if (armorPct) char.armor = Math.round(char.armor * (1 + armorPct / 100))
  char.dmgMult = 1 + dmgPct / 100
}

// Weapon stats: base damage, range, atkSpeed, bullet speed
// Classes start with a default stub weapon
function defaultWeapon(classKey) {
  const weapons = {
    warrior: { name: 'Rusty Sword',   dmg: 80,  range: 90,  atkSpd: 0.55, bspd: 280, color: '#aaa' },
    rogue:   { name: 'Worn Dagger',   dmg: 35,  range: 150, atkSpd: 0.18, bspd: 380, color: '#a8dadc' },
    mage:    { name: 'Apprentice Staff', dmg: 120, range: 280, atkSpd: 0.55, bspd: 320, color: '#4cc9f0' },
    priest:  { name: 'Holy Wand',     dmg: 50,  range: 220, atkSpd: 0.25, bspd: 300, color: '#f4d35e' },
    archer:  { name: 'Short Bow',     dmg: 65,  range: 320, atkSpd: 0.30, bspd: 500, color: '#90be6d' },
  }
  return weapons[classKey]
}

// Effective damage = weapon.dmg * (1 + main_stat / 100)
function calcDamage(char) {
  const w = equippedWeapon(char)
  const ms = CLASSES[char.classKey].mainStat
  return Math.round(w.dmg * (1 + char[ms] / 100) * (char.dmgMult || 1))
}

function equippedWeapon(char) {
  return char.gear.weapon || defaultWeapon(char.classKey)
}

// Scaled XP for a mob kill — increases base XP and scales simply by the
// player's level and the dungeon's star rating (world stars = 0).
function mobKillXp(baseXp, char, stars) {
  const lvFactor   = 1 + ((char.level || 1) - 1) * 0.05
  const starFactor = 1 + (stars || 0) * 0.20
  return Math.round((baseXp || 0) * 1.5 * lvFactor * starFactor)
}

// Call each frame — handles XP, leveling, MP regen, cooldowns
function updateCharacter(char, dt) {
  // MP regen
  char.mp = Math.min(char.maxMp, char.mp + char.mpRegen * dt)
  // HP regen (base + equipped gear hpRegen, applied via recalcStats)
  if (char.hpRegen && char.hp < char.maxHp) {
    char.hp = Math.min(char.maxHp, char.hp + char.hpRegen * dt)
  }

  // Cooldowns
  if (char.abilityCooldown > 0) char.abilityCooldown -= dt
  if (char.shootTimer > 0) char.shootTimer -= dt

  // Level up (cap at LEVEL_CAP)
  while (char.level < LEVEL_CAP && char.xp >= char.xpNext) {
    char.xp -= char.xpNext
    char.level++
    char.xpNext = xpForLevel(char.level + 1)
    recalcStats(char)
    char.hp = Math.min(char.hp + char.maxHp * 0.3, char.maxHp)
    char.mp = Math.min(char.mp + char.maxMp * 0.2, char.maxMp)
    spawnParticles(char.x, char.y, '#ffd60a', 20)
    spawnFloatText(char.x, char.y - 30, 'LEVEL UP!', '#ffd60a')
  }

  // At cap: xp becomes glory
  if (char.level >= LEVEL_CAP && char.xp > 0) {
    char.glory += char.xp * GLORY_PER_KILL
    char.xp = 0
  }
}

// Apply incoming damage to the player with flat armor reduction.
// 1 armor = 1 flat damage reduced; always at least 1 damage unless godmode.
// Returns the damage actually dealt (for floating text).
function damagePlayer(char, dmg) {
  if (char.godmode) return 0
  const dealt = Math.max(1, Math.round((dmg || 0) - (char.armor || 0)))
  char.hp -= dealt
  return dealt
}

// On death: transfer glory to account, mark dead
function onCharacterDeath(char, account) {
  account.glory += char.glory
  char.glory = 0
  char.alive = false
}

// --- STUB ACCOUNT (replace with server fetch in production) ---
// account.glory = permanent currency across all characters
// account.characters = list of character save objects
const account = {
  glory: 0,
  characters: [],  // populated by createCharacter calls; server would load these
  materials: {}    // account-wide crafting materials: { matKey: count }
}