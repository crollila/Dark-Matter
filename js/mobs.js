// ============================================================
// MOBS — all enemy and boss definitions
// ============================================================

// Render-only size multiplier for NORMAL mobs (bosses excluded). Their sprite,
// shadow, geometric body, outline and HP bar scale by this; the gameplay hitbox
// (e.radius used in collision / hit tests) is untouched.
const MOB_VISUAL_SCALE = 1.45

// AI behaviour functions — keyed by name, called each frame per enemy
const MOB_AI = {

  // Chase player, shoot single bullet when in range
  chaser(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    e.vx = dx/d * e.spd; e.vy = dy/d * e.spd
    e.shootTimer -= dt
    if (e.shootTimer <= 0 && d < e.range) {
      spawnBullet(eBullets, e.x, e.y, dx/d * e.bspd, dy/d * e.bspd, e.dmg)
      e.shootTimer = e.atkSpd
    }
  },

  // Chase + spread 5-way shot
  spreader(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    e.vx = dx/d * e.spd; e.vy = dy/d * e.spd
    e.shootTimer -= dt
    if (e.shootTimer <= 0 && d < e.range) {
      const ang = Math.atan2(dy, dx)
      for (let i = -2; i <= 2; i++) {
        const a = ang + i * 0.2
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd, Math.sin(a)*e.bspd, e.dmg)
      }
      e.shootTimer = e.atkSpd
    }
  },

  // Orbit player at distance, fire ring burst periodically
  orbiter(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    const radial = (d - 180) / 180
    const perpX = -dy/d, perpY = dx/d
    e.vx = dx/d * radial * e.spd + perpX * e.spd * 0.7
    e.vy = dy/d * radial * e.spd + perpY * e.spd * 0.7
    e.shootTimer -= dt
    if (e.shootTimer <= 0) {
      for (let i = 0; i < 8; i++) {
        const a = e.phase + i * Math.PI * 0.25
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*0.8, Math.sin(a)*e.bspd*0.8, e.dmg)
      }
      e.phase = (e.phase || 0) + 0.35
      e.shootTimer = e.atkSpd
    }
  },

  // Stay at range, dodge sideways, shoot fast
  skirmisher(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    const want = 200
    const radial = (d - want) / want
    const side = Math.sin(Date.now() * 0.002 + e.phase) * e.spd
    e.vx = dx/d * radial * e.spd + (-dy/d) * side * 0.5
    e.vy = dy/d * radial * e.spd + ( dx/d) * side * 0.5
    e.shootTimer -= dt
    if (e.shootTimer <= 0 && d < e.range) {
      spawnBullet(eBullets, e.x, e.y, dx/d*e.bspd, dy/d*e.bspd, e.dmg)
      e.shootTimer = e.atkSpd
    }
  },

  // Slow, tanky, charges when close enough
  charger(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    if (!e.charging) {
      e.vx = dx/d * e.spd * 0.4; e.vy = dy/d * e.spd * 0.4
      e.chargeTimer = (e.chargeTimer || 0) - dt
      if (e.chargeTimer <= 0 && d < 260) {
        e.charging = true; e.chargeDx = dx/d; e.chargeDy = dy/d
        e.chargeTimer = 1.8
      }
    } else {
      e.vx = e.chargeDx * e.spd * 3.5; e.vy = e.chargeDy * e.spd * 3.5
      e.chargeTimer -= dt
      if (e.chargeTimer <= 0) { e.charging = false; e.chargeTimer = 2.5 }
    }
    // melee damage on overlap handled in zone update
    e.shootTimer -= dt
    if (e.shootTimer <= 0 && d < 40) {
      // contact shot
      spawnBullet(eBullets, e.x, e.y, dx/d*120, dy/d*120, e.dmg * 2)
      e.shootTimer = e.atkSpd * 2
    }
  },

  // Boss: phase 1 spiral, phase 2 aimed + spiral mixed
  boss_goblin(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    // Slow orbit
    const perpX = -dy/d, perpY = dx/d
    e.vx = perpX * e.spd * 0.5 + dx/d * ((d - 200)/200) * e.spd
    e.vy = perpY * e.spd * 0.5 + dy/d * ((d - 200)/200) * e.spd
    e.shootTimer -= dt
    const phase2 = e.hp < e.maxHp * 0.5
    if (e.shootTimer <= 0) {
      // Spiral burst
      const arms = phase2 ? 4 : 3
      for (let i = 0; i < arms * 4; i++) {
        const a = e.phase + i * (Math.PI * 2 / (arms * 4))
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*0.9, Math.sin(a)*e.bspd*0.9, e.dmg)
      }
      // Phase 2: also aimed shots
      if (phase2) {
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(dy, dx) + i * 0.25
          spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*1.2, Math.sin(a)*e.bspd*1.2, e.dmg * 1.5)
        }
      }
      e.phase += 0.22
      e.shootTimer = e.atkSpd
    }
  },

  // Boss: mycelian — spore clouds + ring pulses
  boss_mycelian(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    e.vx = dx/d * e.spd * 0.3; e.vy = dy/d * e.spd * 0.3
    e.shootTimer -= dt
    e.phase2Timer = (e.phase2Timer || 0) - dt
    const phase2 = e.hp < e.maxHp * 0.5
    if (e.shootTimer <= 0) {
      // Ring pulse
      const count = phase2 ? 16 : 10
      for (let i = 0; i < count; i++) {
        const a = e.phase + i * (Math.PI * 2 / count)
        const spd = e.bspd * (0.7 + Math.sin(e.phase * 3) * 0.3)
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*spd, Math.sin(a)*spd, e.dmg)
      }
      e.phase += 0.18
      e.shootTimer = e.atkSpd
    }
    if (phase2 && e.phase2Timer <= 0) {
      // Aimed burst
      const ang = Math.atan2(dy, dx)
      for (let i = -2; i <= 2; i++) {
        const a = ang + i * 0.18
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*1.3, Math.sin(a)*e.bspd*1.3, e.dmg*1.4)
      }
      e.phase2Timer = 1.5
    }
  },

  // Boss: void harbinger — counter-rotating twin spirals; phase 2 adds dense
  // "rift pulse" rings + aimed lances. Reuses existing spawnBullet patterns.
  boss_void(e, dt, char, tileMap) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d = Math.sqrt(dx*dx + dy*dy) || 1
    // Hover/orbit the player at mid range
    const perpX = -dy/d, perpY = dx/d
    e.vx = perpX * e.spd * 0.6 + dx/d * ((d - 220)/220) * e.spd
    e.vy = perpY * e.spd * 0.6 + dy/d * ((d - 220)/220) * e.spd
    e.shootTimer -= dt
    e.phase2Timer = (e.phase2Timer || 0) - dt
    const phase2 = e.hp < e.maxHp * 0.5
    if (e.shootTimer <= 0) {
      // Twin counter-rotating spiral arms
      const arms = phase2 ? 6 : 4
      for (let i = 0; i < arms; i++) {
        const a = e.phase + i * (Math.PI * 2 / arms)
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd, Math.sin(a)*e.bspd, e.dmg)
        const a2 = -e.phase + i * (Math.PI * 2 / arms)
        spawnBullet(eBullets, e.x, e.y, Math.cos(a2)*e.bspd*0.8, Math.sin(a2)*e.bspd*0.8, e.dmg)
      }
      e.phase += phase2 ? 0.34 : 0.24
      e.shootTimer = e.atkSpd
    }
    if (phase2 && e.phase2Timer <= 0) {
      // Rift pulse: dense full ring + aimed lance
      const count = 24
      for (let i = 0; i < count; i++) {
        const a = i * (Math.PI * 2 / count)
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*1.15, Math.sin(a)*e.bspd*1.15, e.dmg*1.2)
      }
      const ang = Math.atan2(dy, dx)
      for (let i = -1; i <= 1; i++) {
        const a = ang + i * 0.12
        spawnBullet(eBullets, e.x, e.y, Math.cos(a)*e.bspd*1.5, Math.sin(a)*e.bspd*1.5, e.dmg*1.6)
      }
      e.phase2Timer = 1.6
    }
  }
}

// --- MOB DEFINITIONS ---
// Each entry: display name, color, ai key, hp, spd, dmg, bspd (bullet speed),
//             atkSpd (shoot cooldown), range (shoot range), radius, xp,
//             portalDrop: { type: dungeonKey, chance: 0-1 } or null
const MOB_DEFS = {
  // === OPEN WORLD (leveling) ===
  slime: {
    name: 'Slime', color: '#74c69d', ai: 'chaser',
    hp: 800,   spd: 45,  dmg: 80,   bspd: 160, atkSpd: 2.2, range: 200, radius: 13, xp: 5,
    portalDrop: null
  },
  forest_sprite: {
    name: 'Forest Sprite', color: '#95d5b2', ai: 'skirmisher',
    hp: 600,   spd: 70,  dmg: 110,  bspd: 220, atkSpd: 1.6, range: 280, radius: 11, xp: 12,
    portalDrop: { type: 'fungal_cavern', chance: 0.04 }
  },
  goblin_scout: {
    name: 'Goblin Scout', color: '#bc6c25', ai: 'chaser',
    hp: 1000,  spd: 80,  dmg: 130,  bspd: 240, atkSpd: 1.4, range: 240, radius: 13, xp: 18,
    portalDrop: { type: 'goblin_warren', chance: 0.06 }
  },

  // === GOBLIN WARREN ===
  goblin_brute: {
    name: 'Goblin Brute', color: '#d4631a', ai: 'charger',
    hp: 4000,  spd: 65,  dmg: 280,  bspd: 180, atkSpd: 1.8, range: 180, radius: 17, xp: 40,
    portalDrop: null
  },
  goblin_shaman: {
    name: 'Goblin Shaman', color: '#e9c46a', ai: 'spreader',
    hp: 2800,  spd: 55,  dmg: 200,  bspd: 260, atkSpd: 2.0, range: 300, radius: 14, xp: 35,
    portalDrop: null
  },

  // === FUNGAL CAVERN ===
  cave_bat: {
    name: 'Cave Bat', color: '#9b72cf', ai: 'skirmisher',
    hp: 1800,  spd: 110, dmg: 160,  bspd: 300, atkSpd: 1.2, range: 260, radius: 11, xp: 28,
    portalDrop: null
  },
  fungal_shroom: {
    name: 'Fungal Shroom', color: '#588157', ai: 'orbiter',
    hp: 3200,  spd: 30,  dmg: 180,  bspd: 200, atkSpd: 2.4, range: 220, radius: 16, xp: 32,
    portalDrop: null
  },
  mycelian_drone: {
    name: 'Mycelian Drone', color: '#7b4f8e', ai: 'chaser',
    hp: 2200,  spd: 75,  dmg: 200,  bspd: 280, atkSpd: 1.5, range: 250, radius: 13, xp: 30,
    portalDrop: null
  },

  // === VOID RIFT ===
  void_wisp: {
    name: 'Void Wisp', color: '#7af9ff', ai: 'skirmisher',
    hp: 1600,  spd: 130, dmg: 180,  bspd: 320, atkSpd: 1.1, range: 280, radius: 10, xp: 34,
    portalDrop: null
  },
  rift_stalker: {
    name: 'Rift Stalker', color: '#a06bff', ai: 'chaser',
    hp: 2600,  spd: 95,  dmg: 220,  bspd: 300, atkSpd: 1.4, range: 260, radius: 14, xp: 38,
    portalDrop: null
  },
  null_orbiter: {
    name: 'Null Orbiter', color: '#4b7bff', ai: 'orbiter',
    hp: 3000,  spd: 40,  dmg: 200,  bspd: 230, atkSpd: 2.2, range: 240, radius: 15, xp: 36,
    portalDrop: null
  },

  // === BIOME: DARK MATTER (dungeon drop → dark_matter_core) ===
  matter_wraith: {
    name: 'Matter Wraith', color: '#9b7bff', ai: 'skirmisher',
    hp: 2400, spd: 95, dmg: 190, bspd: 300, atkSpd: 1.3, range: 280, radius: 12, xp: 30,
    portalDrop: { type: 'dark_matter_core', chance: 0.25 }, uniqueDrop: { base: 'u_wraith_shroud', chance: 0.03 }
  },
  gravity_maw: {
    name: 'Gravity Maw', color: '#6a4bff', ai: 'charger',
    hp: 4200, spd: 60, dmg: 260, bspd: 180, atkSpd: 1.8, range: 200, radius: 18, xp: 42,
    portalDrop: { type: 'dark_matter_core', chance: 0.25 }, uniqueDrop: { base: 'u_gravity_core', chance: 0.03 }
  },
  null_apostle: {
    name: 'Null Apostle', color: '#b59bff', ai: 'orbiter',
    hp: 3000, spd: 40, dmg: 200, bspd: 230, atkSpd: 2.2, range: 250, radius: 15, xp: 38,
    portalDrop: { type: 'dark_matter_core', chance: 0.25 }, uniqueDrop: { base: 'u_null_sigil', chance: 0.03 }
  },

  // === BIOME: SNOW (dungeon drop → frozen_catacombs) ===
  frost_skater: {
    name: 'Frost Skater', color: '#bfe6f5', ai: 'skirmisher',
    hp: 1800, spd: 130, dmg: 160, bspd: 320, atkSpd: 1.1, range: 270, radius: 11, xp: 28,
    portalDrop: { type: 'frozen_catacombs', chance: 0.25 }, uniqueDrop: { base: 'u_frost_treads', chance: 0.03 }
  },
  icebound_archer: {
    name: 'Icebound Archer', color: '#8fd0e8', ai: 'chaser',
    hp: 2200, spd: 70, dmg: 200, bspd: 300, atkSpd: 1.4, range: 300, radius: 12, xp: 32,
    portalDrop: { type: 'frozen_catacombs', chance: 0.25 }, uniqueDrop: { base: 'u_icebound_charm', chance: 0.03 }
  },
  snow_golem: {
    name: 'Snow Golem', color: '#d8eef7', ai: 'charger',
    hp: 5000, spd: 55, dmg: 280, bspd: 170, atkSpd: 2.0, range: 190, radius: 19, xp: 46,
    portalDrop: { type: 'frozen_catacombs', chance: 0.25 }, uniqueDrop: { base: 'u_glacier_plate', chance: 0.03 }
  },

  // === BIOME: HELL (dungeon drop → infernal_pit) ===
  ember_imp: {
    name: 'Ember Imp', color: '#ff9a3c', ai: 'chaser',
    hp: 1600, spd: 115, dmg: 170, bspd: 320, atkSpd: 1.1, range: 250, radius: 10, xp: 28,
    portalDrop: { type: 'infernal_pit', chance: 0.25 }, uniqueDrop: { base: 'u_ember_band', chance: 0.03 }
  },
  chainscourge: {
    name: 'Chainscourge', color: '#d4541a', ai: 'spreader',
    hp: 3000, spd: 65, dmg: 210, bspd: 260, atkSpd: 1.9, range: 290, radius: 14, xp: 38,
    portalDrop: { type: 'infernal_pit', chance: 0.25 }, uniqueDrop: { base: 'u_chain_girdle', chance: 0.03 }
  },
  lava_brute: {
    name: 'Lava Brute', color: '#ff6a28', ai: 'charger',
    hp: 5200, spd: 58, dmg: 300, bspd: 180, atkSpd: 1.9, range: 190, radius: 19, xp: 48,
    portalDrop: { type: 'infernal_pit', chance: 0.25 }, uniqueDrop: { base: 'u_magma_helm', chance: 0.03 }
  },

  // === BIOME: TOXIC / FUNGAL (dungeon drop → plague_grotto) ===
  spore_crawler: {
    name: 'Spore Crawler', color: '#9be84a', ai: 'chaser',
    hp: 2000, spd: 85, dmg: 180, bspd: 280, atkSpd: 1.5, range: 250, radius: 12, xp: 30,
    portalDrop: { type: 'plague_grotto', chance: 0.25 }, uniqueDrop: { base: 'u_spore_gloves', chance: 0.03 }
  },
  venom_cap: {
    name: 'Venom Cap', color: '#6abf3a', ai: 'orbiter',
    hp: 3200, spd: 32, dmg: 190, bspd: 200, atkSpd: 2.3, range: 230, radius: 16, xp: 34,
    portalDrop: { type: 'plague_grotto', chance: 0.25 }, uniqueDrop: { base: 'u_venom_amulet', chance: 0.03 }
  },
  mycelium_horror: {
    name: 'Mycelium Horror', color: '#3f7a2a', ai: 'spreader',
    hp: 4400, spd: 50, dmg: 240, bspd: 240, atkSpd: 1.9, range: 280, radius: 18, xp: 44,
    portalDrop: { type: 'plague_grotto', chance: 0.25 }, uniqueDrop: { base: 'u_myco_plate', chance: 0.03 }
  },

  // === BIOME: RUINED KINGDOM (dungeon drop → fallen_keep) ===
  fallen_squire: {
    name: 'Fallen Squire', color: '#d8c9a0', ai: 'charger',
    hp: 3400, spd: 62, dmg: 230, bspd: 180, atkSpd: 1.8, range: 190, radius: 15, xp: 36,
    portalDrop: { type: 'fallen_keep', chance: 0.25 }, uniqueDrop: { base: 'u_squire_helm', chance: 0.03 }
  },
  cursed_archer: {
    name: 'Cursed Archer', color: '#b8a878', ai: 'chaser',
    hp: 2400, spd: 72, dmg: 200, bspd: 300, atkSpd: 1.3, range: 300, radius: 12, xp: 34,
    portalDrop: { type: 'fallen_keep', chance: 0.25 }, uniqueDrop: { base: 'u_cursed_ring', chance: 0.03 }
  },
  grave_priest: {
    name: 'Grave Priest', color: '#9aa0b8', ai: 'spreader',
    hp: 3000, spd: 48, dmg: 210, bspd: 250, atkSpd: 2.0, range: 290, radius: 14, xp: 38,
    portalDrop: { type: 'fallen_keep', chance: 0.25 }, uniqueDrop: { base: 'u_grave_charm', chance: 0.03 }
  },

  // === BIOME: ASTRAL DESERT (dungeon drop → astral_tomb) ===
  star_scarab: {
    name: 'Star Scarab', color: '#ffe08a', ai: 'charger',
    hp: 3600, spd: 70, dmg: 240, bspd: 190, atkSpd: 1.7, range: 200, radius: 15, xp: 38,
    portalDrop: { type: 'astral_tomb', chance: 0.25 }, uniqueDrop: { base: 'u_scarab_band', chance: 0.03 }
  },
  mirage_stalker: {
    name: 'Mirage Stalker', color: '#ffd166', ai: 'skirmisher',
    hp: 2200, spd: 135, dmg: 180, bspd: 330, atkSpd: 1.0, range: 280, radius: 11, xp: 34,
    portalDrop: { type: 'astral_tomb', chance: 0.25 }, uniqueDrop: { base: 'u_mirage_cloak', chance: 0.03 }
  },
  sunseer: {
    name: 'Sunseer', color: '#ffbf47', ai: 'orbiter',
    hp: 3200, spd: 42, dmg: 210, bspd: 240, atkSpd: 2.1, range: 250, radius: 15, xp: 40,
    portalDrop: { type: 'astral_tomb', chance: 0.25 }, uniqueDrop: { base: 'u_sunseer_amulet', chance: 0.03 }
  },

  // === BOSSES ===
  goblin_warchief: {
    name: 'Goblin Warchief', color: '#e76f51', ai: 'boss_goblin',
    hp: 80000, spd: 55,  dmg: 400,  bspd: 300, atkSpd: 0.9, range: 9999, radius: 26, xp: 500,
    portalDrop: null, isBoss: true
  },
  mycelian_king: {
    name: 'Mycelian King', color: '#6a3d9a', ai: 'boss_mycelian',
    hp: 90000, spd: 35,  dmg: 380,  bspd: 260, atkSpd: 1.1, range: 9999, radius: 30, xp: 500,
    portalDrop: null, isBoss: true
  },
  void_harbinger: {
    name: 'The Rift Harbinger', color: '#c04bff', ai: 'boss_void',
    hp: 95000, spd: 45,  dmg: 400,  bspd: 280, atkSpd: 0.85, range: 9999, radius: 30, xp: 600,
    portalDrop: null, isBoss: true
  },

  // === BIOME DUNGEON BOSSES (reuse existing boss AIs; distinct colors/stats) ===
  singularity_tyrant: {
    name: 'Singularity Tyrant', color: '#7a3bff', ai: 'boss_void',
    hp: 110000, spd: 45, dmg: 440, bspd: 290, atkSpd: 0.85, range: 9999, radius: 32, xp: 720,
    portalDrop: null, isBoss: true
  },
  frost_monarch: {
    name: 'Frost Monarch', color: '#7fd8f5', ai: 'boss_mycelian',
    hp: 66000, spd: 38, dmg: 340, bspd: 250, atkSpd: 1.1, range: 9999, radius: 28, xp: 430,
    portalDrop: null, isBoss: true
  },
  infernal_lord: {
    name: 'Infernal Lord', color: '#ff5a2a', ai: 'boss_goblin',
    hp: 88000, spd: 52, dmg: 420, bspd: 290, atkSpd: 0.9, range: 9999, radius: 30, xp: 560,
    portalDrop: null, isBoss: true
  },
  plague_mother: {
    name: 'Plague Mother', color: '#7bd33a', ai: 'boss_mycelian',
    hp: 70000, spd: 34, dmg: 350, bspd: 250, atkSpd: 1.1, range: 9999, radius: 30, xp: 450,
    portalDrop: null, isBoss: true
  },
  fallen_monarch: {
    name: 'The Fallen King', color: '#c9bd8a', ai: 'boss_goblin',
    hp: 72000, spd: 50, dmg: 360, bspd: 270, atkSpd: 1.0, range: 9999, radius: 29, xp: 470,
    portalDrop: null, isBoss: true
  },
  astral_pharaoh: {
    name: 'Astral Pharaoh', color: '#ffd166', ai: 'boss_void',
    hp: 90000, spd: 46, dmg: 410, bspd: 280, atkSpd: 0.9, range: 9999, radius: 30, xp: 590,
    portalDrop: null, isBoss: true
  },

  // === WORLD BOSSES (roaming overworld events — every 6 normal world kills) ===
  // Reuse existing boss AIs but each is distinct via color/HP/bullet speed/cadence.
  // Beefier than dungeon bosses; solo-killable in ~30s–3min and easily passing the
  // 2% loot-contribution gate. See WORLD_BOSSES below for biome/mythic/dungeon links.
  wb_event_horizon: {
    name: 'Event Horizon Devourer', color: '#a64bff', ai: 'boss_void',
    hp: 150000, spd: 42, dmg: 440, bspd: 300, atkSpd: 0.80, range: 9999, radius: 32, xp: 1200,
    portalDrop: null, isBoss: true
  },
  wb_frost_titan: {
    name: 'Frost Titan Ymir', color: '#9fe8ff', ai: 'boss_mycelian',
    hp: 165000, spd: 30, dmg: 460, bspd: 230, atkSpd: 1.00, range: 9999, radius: 34, xp: 1200,
    portalDrop: null, isBoss: true
  },
  wb_ashen_worldeater: {
    name: 'Ashen Worldeater', color: '#ff5a22', ai: 'boss_goblin',
    hp: 155000, spd: 58, dmg: 480, bspd: 300, atkSpd: 0.85, range: 9999, radius: 32, xp: 1200,
    portalDrop: null, isBoss: true
  },
  wb_plague_matriarch: {
    name: 'Plague Matriarch', color: '#9be84a', ai: 'boss_mycelian',
    hp: 150000, spd: 34, dmg: 440, bspd: 250, atkSpd: 1.00, range: 9999, radius: 32, xp: 1200,
    portalDrop: null, isBoss: true
  },
  wb_hollow_king: {
    name: 'The Hollow King', color: '#e6dcae', ai: 'boss_goblin',
    hp: 158000, spd: 48, dmg: 460, bspd: 280, atkSpd: 0.90, range: 9999, radius: 31, xp: 1200,
    portalDrop: null, isBoss: true
  },
  wb_astral_pharaoh: {
    name: 'Astral Pharaoh', color: '#ffd166', ai: 'boss_void',
    hp: 160000, spd: 46, dmg: 460, bspd: 290, atkSpd: 0.85, range: 9999, radius: 32, xp: 1200,
    portalDrop: null, isBoss: true
  }
}

// World boss → boss biome id (biomes.js), signature mythic base (items.js), and
// related dungeon key (DUNGEONS below). Spawn/biome-paint/loot logic in world.js.
const WORLD_BOSSES = {
  wb_event_horizon:    { mob: 'wb_event_horizon',    biome: 7,  mythic: 'm_singularity_crown',     dungeon: 'event_horizon_vault' },
  wb_frost_titan:      { mob: 'wb_frost_titan',      biome: 8,  mythic: 'm_ymir_heart',            dungeon: 'titan_glacier' },
  wb_ashen_worldeater: { mob: 'wb_ashen_worldeater', biome: 9,  mythic: 'm_worldeater_emberplate', dungeon: 'worldeater_forge' },
  wb_plague_matriarch: { mob: 'wb_plague_matriarch', biome: 10, mythic: 'm_matriarch_sporeveil',   dungeon: 'plague_hive' },
  wb_hollow_king:      { mob: 'wb_hollow_king',      biome: 11, mythic: 'm_hollow_signet',         dungeon: 'cursed_throne' },
  wb_astral_pharaoh:   { mob: 'wb_astral_pharaoh',   biome: 12, mythic: 'm_pharaoh_ankh',          dungeon: 'starfall_pyramid' },
}
const WORLD_BOSS_KEYS = Object.keys(WORLD_BOSSES)
if (typeof window !== 'undefined') window.WORLD_BOSSES = WORLD_BOSSES

// Spawn an enemy instance from a definition key
function spawnMob(key, x, y) {
  const def = MOB_DEFS[key]
  if (!def) { console.warn('Unknown mob:', key); return null }
  return {
    key, alive: true,
    x, y, vx: 0, vy: 0,
    hp: def.hp, maxHp: def.hp,
    spd: def.spd, dmg: def.dmg, bspd: def.bspd,
    atkSpd: def.atkSpd, range: def.range,
    radius: def.radius, xp: def.xp,
    color: def.color, name: def.name,
    ai: def.ai, isBoss: !!def.isBoss,
    portalDrop: def.portalDrop,
    uniqueDrop: def.uniqueDrop || null,
    // Aggro/leash (optional per-def overrides; helpers supply safe defaults).
    aggroRange: def.aggroRange != null ? def.aggroRange : null,
    deAggroRange: def.deAggroRange != null ? def.deAggroRange : null,
    homeLeash: def.homeLeash != null ? def.homeLeash : null,
    aggro: false,
    // ai state
    shootTimer: Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
    chargeTimer: 1.5 + Math.random(),
    charging: false, chargeDx: 0, chargeDy: 0,
    hitFlash: 0
  }
}

// --- Offscreen culling & AI sleep (large biome world perf) ---------------
// Distances come from Options (Settings.renderDistance / aiWakeDistance) in
// world px — FIXED, not window-size based. Bosses ignore both (always
// active/drawn). Wake is forced >= render + margin so any rendered mob is also
// awake (visible mobs always behave normally). Mobs are never removed from the
// array when culled/asleep — the minimap still reads them.
const MOB_DEFAULT_RENDER = 1500, MOB_DEFAULT_WAKE = 1800
const MOB_WAKE_OVER_RENDER = 200   // wake radius is at least this far past render
function _mobRenderDist() {
  const s = (typeof Settings !== 'undefined') ? Settings : null
  return (s && s.renderDistance) || MOB_DEFAULT_RENDER
}
function _mobWakeDist() {
  const s = (typeof Settings !== 'undefined') ? Settings : null
  const w = (s && s.aiWakeDistance) || MOB_DEFAULT_WAKE
  return Math.max(w, _mobRenderDist() + MOB_WAKE_OVER_RENDER)
}
// Tiny debug counters — inspect from the console with mobStats().
const MobDebug = { active: 0, sleeping: 0, rendered: 0,
  reset() { this.active = 0; this.sleeping = 0; this.rendered = 0 } }
function mobStats() {
  console.log(`mobs — active:${MobDebug.active} sleeping:${MobDebug.sleeping} rendered:${MobDebug.rendered}`)
  return { ...MobDebug }
}
function mobWakeRadius2() {
  const r = _mobWakeDist()
  return r * r
}

// --- Aggro / leash ranges (world px) -------------------------------------
// Per-mob overrides (def.aggroRange etc.) win; otherwise safe defaults by AI
// type. Bosses use a large activation range. deAggro adds hysteresis so mobs
// don't flicker at the edge. homeLeash caps how far a mob strays from its
// spawn before giving up the chase (biome mobs are kept tight to their cluster).
function _aggroRange(e) {
  if (e.aggroRange != null) return e.aggroRange
  if (e.isBoss) return 1400
  switch (e.ai) {
    case 'chaser':     return 360   // small/basic
    case 'spreader':   return 440   // ranged
    case 'orbiter':    return 440   // ranged
    case 'skirmisher': return 480   // ranged/skirmisher
    case 'charger':    return 540   // brute/charger
    default:           return 420
  }
}
function _deAggroRange(e) {
  if (e.deAggroRange != null) return e.deAggroRange
  return _aggroRange(e) + 260
}
function _homeLeash(e) {
  if (e.homeLeash != null) return e.homeLeash
  if (e.isBoss) return Infinity
  return e.biome ? 900 : 1500
}

// Update a single mob — moves, shoots, wall collision.
// Normal mobs far from the player sleep: they keep existing but skip expensive
// AI (so they don't shoot) and hold still until the player gets close again.
function updateMob(e, dt, char, tileMap) {
  if (!e.alive) return
  // Bosses are always active (never sleep/leash) so arena fights are unaffected.
  if (!e.isBoss && char) {
    const dx = char.x - e.x, dy = char.y - e.y
    const d2 = dx * dx + dy * dy
    // Far-away perf sleep (radial): keep existing, but also drop aggro so a
    // re-approached mob must re-acquire. Sleeping mobs never shoot.
    if (d2 > mobWakeRadius2()) {
      e.asleep = true; e.aggro = false
      e.vx = 0; e.vy = 0                 // no drift while sleeping
      if (e.hitFlash > 0) e.hitFlash -= dt
      MobDebug.sleeping++
      return
    }
    e.asleep = false

    // Leash checks: dragged too far from home, or pulled out of its biome.
    let outOfHome = false
    if (e.homeX != null) {
      const hx = e.x - e.homeX, hy = e.y - e.homeY
      const lr = _homeLeash(e)
      if (lr !== Infinity && hx * hx + hy * hy > lr * lr) outOfHome = true
    }
    if (e.biome && tileMap && tileMap.biomeAt) {
      const tx = (e.x / TILE) | 0, ty = (e.y / TILE) | 0
      if (tileMap.biomeAt(tx, ty) !== e.biome) outOfHome = true
    }

    // Aggro state machine with hysteresis. Out-of-leash forces de-aggro.
    const agr = _aggroRange(e)
    if (!e.aggro) {
      if (!outOfHome && d2 < agr * agr) e.aggro = true
    } else {
      const der = _deAggroRange(e)
      if (outOfHome || d2 > der * der) e.aggro = false
    }

    // Not aggroed → return toward home (or hold still), no attacks.
    if (!e.aggro) {
      MobDebug.active++
      const hx = (e.homeX != null) ? e.homeX : e.x
      const hy = (e.homeY != null) ? e.homeY : e.y
      const rx = hx - e.x, ry = hy - e.y
      const rd = Math.sqrt(rx * rx + ry * ry)
      if (rd > 6) { e.vx = rx / rd * e.spd * 0.6; e.vy = ry / rd * e.spd * 0.6 }
      else { e.vx = 0; e.vy = 0 }
      moveWithCollision(e, e.vx, e.vy, dt, e.radius, tileMap)
      if (e.hitFlash > 0) e.hitFlash -= dt
      return
    }
  }
  // World-boss leash: a world boss never sleeps, but it must NOT chase the player
  // across the map out of its spawned boss-biome patch. If dragged beyond its
  // leash radius from spawn it stops fighting and walks back toward center
  // (de-aggro), re-engaging once it's back well inside the zone (hysteresis).
  // No teleport. Other bosses (dungeon) are unaffected (no e.worldBoss/leashRadius).
  if (e.worldBoss && char && e.homeX != null && e.leashRadius) {
    const hx = e.x - e.homeX, hy = e.y - e.homeY
    const hd2 = hx * hx + hy * hy
    const lr = e.leashRadius
    if (e._returning) {
      const inner = lr * 0.4
      if (hd2 <= inner * inner) e._returning = false
    } else if (hd2 > lr * lr) {
      e._returning = true
    }
    if (e._returning) {
      e.asleep = false
      MobDebug.active++
      const rx = e.homeX - e.x, ry = e.homeY - e.y
      const rd = Math.sqrt(rx * rx + ry * ry)
      if (rd > 6) { e.vx = rx / rd * e.spd; e.vy = ry / rd * e.spd }
      else { e.vx = 0; e.vy = 0 }
      moveWithCollision(e, e.vx, e.vy, dt, e.radius, tileMap)
      if (e.hitFlash > 0) e.hitFlash -= dt
      return
    }
  }
  e.asleep = false
  MobDebug.active++
  _eBulletKind = e.key   // visual-only: tag this mob's shots for projectile sprites
  MOB_AI[e.ai](e, dt, char, tileMap)
  moveWithCollision(e, e.vx, e.vy, dt, e.radius, tileMap)
  if (e.hitFlash > 0) e.hitFlash -= dt
}

// Render a single mob (world-space coords, cam applied externally via offX/offY)
function renderMob(e, offX, offY) {
  const sx = e.x + offX, sy = e.y + offY
  // Offscreen culling: skip normal mobs well outside the camera view. Radial
  // test about screen center keeps it correct under screen rotation. Bosses
  // always render so dungeon fights are never affected.
  if (!e.isBoss) {
    const cx = sx - canvas.width / 2, cy = sy - canvas.height / 2
    const cull = _mobRenderDist()
    if (cx * cx + cy * cy > cull * cull) return
  }
  MobDebug.rendered++
  const flash = e.hitFlash > 0

  // Visual radius: normal mobs render noticeably larger than their hitbox so they
  // read clearly against busy biome tiles (bosses keep their true size). Hitbox /
  // collision / HP logic all keep using e.radius — this is render-only.
  const vr = e.isBoss ? e.radius : e.radius * MOB_VISUAL_SCALE

  // Shadow — drawn UPRIGHT (like the HP bar) so it stays a flat ellipse pinned
  // under the mob on screen at any screen rotation, instead of tilting with the
  // world. Position still tracks the mob via the sx,sy anchor.
  drawUpright(sx, sy, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(0, vr - 2, vr * 0.8, vr * 0.3, 0, 0, Math.PI*2); ctx.fill()
  })

  // Body — try an assigned sprite first; fall back to geometric art if no
  // sprite is assigned or its sheet image isn't loaded (foundation: art is opt-in).
  // Sprite ART is drawn UPRIGHT (counter-rotated via drawUpright, like the shadow/HP
  // bar + loot bags + portal entities) so boss/enemy art keeps facing the player and
  // never tilts with the world under screen rotation. Position still tracks the mob
  // via the sx,sy anchor; we draw at the local origin (0,0) inside drawUpright.
  let drewSprite = false
  if (typeof Sprites !== 'undefined') {
    drawUpright(sx, sy, () => {
      // Dark rim outline (shadow halo hugs the sprite silhouette) so mobs stand
      // out from the terrain. White rim on hit-flash for the damage pop.
      ctx.shadowColor = flash ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = flash ? 8 : 5
      drewSprite = Sprites.drawForMob(e, 0, 0, vr)
      ctx.shadowBlur = 0
    })
  }
  if (!drewSprite) {
    ctx.shadowBlur = flash ? 16 : 6
    ctx.shadowColor = flash ? '#fff' : e.color
    ctx.fillStyle = flash ? '#ffffff' : e.color
    if (e.isBoss) {
      // Boss: diamond shape
      ctx.beginPath()
      ctx.moveTo(sx, sy - vr)
      ctx.lineTo(sx + vr, sy)
      ctx.lineTo(sx, sy + vr)
      ctx.lineTo(sx - vr, sy)
      ctx.closePath(); ctx.fill()
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, vr, 0, Math.PI*2); ctx.fill()
    }
    ctx.shadowBlur = 0
    // Crisp dark outline around the geometric body for terrain contrast.
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.stroke()
  }

  // HP bar (+ boss name) — anchored at the mob but drawn upright via drawUpright
  // so it stays readable and pinned above the enemy at any screen rotation
  // (matches the under-player HP/MP bars). Its POSITION still tracks the world.
  const bw = vr * 2.4, bh = 4
  const hpFrac = e.maxHp ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0
  drawUpright(sx, sy, () => {
    const bx = -bw/2, by = -vr - 9
    ctx.fillStyle = '#111'
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2)
    ctx.fillStyle = e.isBoss ? '#ff6b6b' : '#4caf50'
    ctx.fillRect(bx, by, bw * hpFrac, bh)
    if (e.isBoss) {
      ctx.fillStyle = '#ffd700'
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(e.name, 0, by - 5)
      ctx.textAlign = 'left'
    }
  })
}

// --- DUNGEON DEFINITIONS ---
// dungeons: map of key → config used by dungeon.js generator
const DUNGEONS = {
  goblin_warren: {
    name: 'Goblin Warren',
    stars: 3,
    color: '#bc6c25',
    tileColor: { floor: '#3a2a1a', wall: '#2a1a0a', accent: '#5a3a2a' },
    mobs: ['goblin_scout', 'goblin_brute', 'goblin_shaman'],
    boss: 'goblin_warchief',
    rooms: { min: 7, max: 11 },
    roomSize: { min: 5, max: 9 },
    mobsPerRoom: { min: 2, max: 4 }
  },
  fungal_cavern: {
    name: 'Fungal Cavern',
    stars: 4,
    color: '#588157',
    tileColor: { floor: '#1a2a1a', wall: '#0a1a0a', accent: '#2a4a2a' },
    mobs: ['cave_bat', 'fungal_shroom', 'mycelian_drone'],
    boss: 'mycelian_king',
    rooms: { min: 6, max: 10 },
    roomSize: { min: 5, max: 10 },
    mobsPerRoom: { min: 2, max: 3 }
  },
  void_rift: {
    name: 'Void Rift',
    stars: 5,
    color: '#9b5cff',
    // dark void palette: deep indigo floor, near-black walls, neon-violet accent
    tileColor: { floor: '#13102a', wall: '#070512', accent: '#3a1f6e' },
    mobs: ['void_wisp', 'rift_stalker', 'null_orbiter'],
    boss: 'void_harbinger',
    rooms: { min: 6, max: 10 },
    roomSize: { min: 5, max: 9 },
    mobsPerRoom: { min: 2, max: 4 }
  },

  // === BIOME DUNGEONS (real, enterable) ===
  // Each reuses its biome's 3 mobs + a dedicated boss, with a themed palette.
  // `biome: true` keeps them OUT of fixed world scatter (map.js) — they only
  // enter the world via biome mob portal drops. Exclusive loot via items.js
  // EXCLUSIVES_BY_DUNGEON (boss high chance, basic mobs rare).
  dark_matter_core: {
    biome: true,
    name: 'Dark Matter Core', stars: 6, color: '#9b7bff',
    tileColor: { floor: '#16121f', wall: '#0a0712', accent: '#3a1f6e' },
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'],
    boss: 'singularity_tyrant',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  frozen_catacombs: {
    biome: true,
    name: 'Frozen Catacombs', stars: 4, color: '#bfe6f5',
    tileColor: { floor: '#2a3742', wall: '#16222b', accent: '#5b8aa6' },
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'],
    boss: 'frost_monarch',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 3 }
  },
  infernal_pit: {
    biome: true,
    name: 'Infernal Pit', stars: 5, color: '#ff7a3c',
    tileColor: { floor: '#2c0f0b', wall: '#180704', accent: '#6e2410' },
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'],
    boss: 'infernal_lord',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  plague_grotto: {
    biome: true,
    name: 'Plague Grotto', stars: 4, color: '#9be84a',
    tileColor: { floor: '#1d2a15', wall: '#0e1709', accent: '#3f7a2a' },
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'],
    boss: 'plague_mother',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 10 }, mobsPerRoom: { min: 2, max: 3 }
  },
  fallen_keep: {
    biome: true,
    name: 'Fallen Keep', stars: 4, color: '#d8c9a0',
    tileColor: { floor: '#2b2820', wall: '#171510', accent: '#5a5238' },
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'],
    boss: 'fallen_monarch',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  astral_tomb: {
    biome: true,
    name: 'Astral Tomb', stars: 5, color: '#ffe08a',
    tileColor: { floor: '#2a2238', wall: '#150f22', accent: '#6e5aa0' },
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'],
    boss: 'astral_pharaoh',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },

  // === WORLD-BOSS DUNGEONS (real/enterable; entered ONLY via the portal dropped
  // when the matching world boss dies). `biome: true` keeps them out of fixed
  // world scatter (map.js). Reuse each theme's 3 biome mobs + a dungeon boss;
  // 3 exclusive drops each via items.js EXCLUSIVES_BY_DUNGEON. ===
  event_horizon_vault: {
    biome: true, name: 'Event Horizon Vault', stars: 7, color: '#a64bff',
    tileColor: { floor: '#120a1f', wall: '#070310', accent: '#5a2a9e' },
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'], boss: 'singularity_tyrant',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  titan_glacier: {
    biome: true, name: 'Titan Glacier', stars: 6, color: '#9fe8ff',
    tileColor: { floor: '#22323d', wall: '#101c24', accent: '#5b8aa6' },
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'], boss: 'frost_monarch',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 3 }
  },
  worldeater_forge: {
    biome: true, name: 'Worldeater Forge', stars: 6, color: '#ff5a22',
    tileColor: { floor: '#280d09', wall: '#160603', accent: '#7a2a12' },
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'], boss: 'infernal_lord',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  plague_hive: {
    biome: true, name: 'Plague Hive', stars: 6, color: '#9be84a',
    tileColor: { floor: '#16240f', wall: '#0a1307', accent: '#3f7a2a' },
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'], boss: 'plague_mother',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 10 }, mobsPerRoom: { min: 2, max: 3 }
  },
  cursed_throne: {
    biome: true, name: 'Cursed Throne', stars: 6, color: '#e6dcae',
    tileColor: { floor: '#26231b', wall: '#13110c', accent: '#5a5238' },
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'], boss: 'fallen_monarch',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  starfall_pyramid: {
    biome: true, name: 'Starfall Pyramid', stars: 7, color: '#ffd166',
    tileColor: { floor: '#241d33', wall: '#120d1f', accent: '#6e5aa0' },
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'], boss: 'astral_pharaoh',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  }
}
