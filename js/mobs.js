// ============================================================
// MOBS — all enemy and boss definitions
// ============================================================

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
    portalDrop: { type: 'dark_matter_core', chance: 0.05 }, uniqueDrop: { base: 'u_wraith_shroud', chance: 0.03 }
  },
  gravity_maw: {
    name: 'Gravity Maw', color: '#6a4bff', ai: 'charger',
    hp: 4200, spd: 60, dmg: 260, bspd: 180, atkSpd: 1.8, range: 200, radius: 18, xp: 42,
    portalDrop: { type: 'dark_matter_core', chance: 0.05 }, uniqueDrop: { base: 'u_gravity_core', chance: 0.03 }
  },
  null_apostle: {
    name: 'Null Apostle', color: '#b59bff', ai: 'orbiter',
    hp: 3000, spd: 40, dmg: 200, bspd: 230, atkSpd: 2.2, range: 250, radius: 15, xp: 38,
    portalDrop: { type: 'dark_matter_core', chance: 0.05 }, uniqueDrop: { base: 'u_null_sigil', chance: 0.03 }
  },

  // === BIOME: SNOW (dungeon drop → frozen_catacombs) ===
  frost_skater: {
    name: 'Frost Skater', color: '#bfe6f5', ai: 'skirmisher',
    hp: 1800, spd: 130, dmg: 160, bspd: 320, atkSpd: 1.1, range: 270, radius: 11, xp: 28,
    portalDrop: { type: 'frozen_catacombs', chance: 0.05 }, uniqueDrop: { base: 'u_frost_treads', chance: 0.03 }
  },
  icebound_archer: {
    name: 'Icebound Archer', color: '#8fd0e8', ai: 'chaser',
    hp: 2200, spd: 70, dmg: 200, bspd: 300, atkSpd: 1.4, range: 300, radius: 12, xp: 32,
    portalDrop: { type: 'frozen_catacombs', chance: 0.05 }, uniqueDrop: { base: 'u_icebound_charm', chance: 0.03 }
  },
  snow_golem: {
    name: 'Snow Golem', color: '#d8eef7', ai: 'charger',
    hp: 5000, spd: 55, dmg: 280, bspd: 170, atkSpd: 2.0, range: 190, radius: 19, xp: 46,
    portalDrop: { type: 'frozen_catacombs', chance: 0.05 }, uniqueDrop: { base: 'u_glacier_plate', chance: 0.03 }
  },

  // === BIOME: HELL (dungeon drop → infernal_pit) ===
  ember_imp: {
    name: 'Ember Imp', color: '#ff9a3c', ai: 'chaser',
    hp: 1600, spd: 115, dmg: 170, bspd: 320, atkSpd: 1.1, range: 250, radius: 10, xp: 28,
    portalDrop: { type: 'infernal_pit', chance: 0.05 }, uniqueDrop: { base: 'u_ember_band', chance: 0.03 }
  },
  chainscourge: {
    name: 'Chainscourge', color: '#d4541a', ai: 'spreader',
    hp: 3000, spd: 65, dmg: 210, bspd: 260, atkSpd: 1.9, range: 290, radius: 14, xp: 38,
    portalDrop: { type: 'infernal_pit', chance: 0.05 }, uniqueDrop: { base: 'u_chain_girdle', chance: 0.03 }
  },
  lava_brute: {
    name: 'Lava Brute', color: '#ff6a28', ai: 'charger',
    hp: 5200, spd: 58, dmg: 300, bspd: 180, atkSpd: 1.9, range: 190, radius: 19, xp: 48,
    portalDrop: { type: 'infernal_pit', chance: 0.05 }, uniqueDrop: { base: 'u_magma_helm', chance: 0.03 }
  },

  // === BIOME: TOXIC / FUNGAL (dungeon drop → plague_grotto) ===
  spore_crawler: {
    name: 'Spore Crawler', color: '#9be84a', ai: 'chaser',
    hp: 2000, spd: 85, dmg: 180, bspd: 280, atkSpd: 1.5, range: 250, radius: 12, xp: 30,
    portalDrop: { type: 'plague_grotto', chance: 0.05 }, uniqueDrop: { base: 'u_spore_gloves', chance: 0.03 }
  },
  venom_cap: {
    name: 'Venom Cap', color: '#6abf3a', ai: 'orbiter',
    hp: 3200, spd: 32, dmg: 190, bspd: 200, atkSpd: 2.3, range: 230, radius: 16, xp: 34,
    portalDrop: { type: 'plague_grotto', chance: 0.05 }, uniqueDrop: { base: 'u_venom_amulet', chance: 0.03 }
  },
  mycelium_horror: {
    name: 'Mycelium Horror', color: '#3f7a2a', ai: 'spreader',
    hp: 4400, spd: 50, dmg: 240, bspd: 240, atkSpd: 1.9, range: 280, radius: 18, xp: 44,
    portalDrop: { type: 'plague_grotto', chance: 0.05 }, uniqueDrop: { base: 'u_myco_plate', chance: 0.03 }
  },

  // === BIOME: RUINED KINGDOM (dungeon drop → fallen_keep) ===
  fallen_squire: {
    name: 'Fallen Squire', color: '#d8c9a0', ai: 'charger',
    hp: 3400, spd: 62, dmg: 230, bspd: 180, atkSpd: 1.8, range: 190, radius: 15, xp: 36,
    portalDrop: { type: 'fallen_keep', chance: 0.05 }, uniqueDrop: { base: 'u_squire_helm', chance: 0.03 }
  },
  cursed_archer: {
    name: 'Cursed Archer', color: '#b8a878', ai: 'chaser',
    hp: 2400, spd: 72, dmg: 200, bspd: 300, atkSpd: 1.3, range: 300, radius: 12, xp: 34,
    portalDrop: { type: 'fallen_keep', chance: 0.05 }, uniqueDrop: { base: 'u_cursed_ring', chance: 0.03 }
  },
  grave_priest: {
    name: 'Grave Priest', color: '#9aa0b8', ai: 'spreader',
    hp: 3000, spd: 48, dmg: 210, bspd: 250, atkSpd: 2.0, range: 290, radius: 14, xp: 38,
    portalDrop: { type: 'fallen_keep', chance: 0.05 }, uniqueDrop: { base: 'u_grave_charm', chance: 0.03 }
  },

  // === BIOME: ASTRAL DESERT (dungeon drop → astral_tomb) ===
  star_scarab: {
    name: 'Star Scarab', color: '#ffe08a', ai: 'charger',
    hp: 3600, spd: 70, dmg: 240, bspd: 190, atkSpd: 1.7, range: 200, radius: 15, xp: 38,
    portalDrop: { type: 'astral_tomb', chance: 0.05 }, uniqueDrop: { base: 'u_scarab_band', chance: 0.03 }
  },
  mirage_stalker: {
    name: 'Mirage Stalker', color: '#ffd166', ai: 'skirmisher',
    hp: 2200, spd: 135, dmg: 180, bspd: 330, atkSpd: 1.0, range: 280, radius: 11, xp: 34,
    portalDrop: { type: 'astral_tomb', chance: 0.05 }, uniqueDrop: { base: 'u_mirage_cloak', chance: 0.03 }
  },
  sunseer: {
    name: 'Sunseer', color: '#ffbf47', ai: 'orbiter',
    hp: 3200, spd: 42, dmg: 210, bspd: 240, atkSpd: 2.1, range: 250, radius: 15, xp: 40,
    portalDrop: { type: 'astral_tomb', chance: 0.05 }, uniqueDrop: { base: 'u_sunseer_amulet', chance: 0.03 }
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
  }
}

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
    // ai state
    shootTimer: Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
    chargeTimer: 1.5 + Math.random(),
    charging: false, chargeDx: 0, chargeDy: 0,
    hitFlash: 0
  }
}

// --- Offscreen culling & AI sleep (large biome world perf) ---------------
// Tunable margins past the screen edge. Bosses ignore both (always active/drawn).
// WAKE margin > CULL margin guarantees any rendered mob is also awake, so
// visible mobs always behave exactly as before.
const MOB_WAKE_MARGIN = 460   // px past the camera view: normal mobs run full AI
const MOB_CULL_MARGIN = 160   // px past the camera view: normal mobs still drawn
// Tiny debug counters — inspect from the console with mobStats().
const MobDebug = { active: 0, sleeping: 0, rendered: 0,
  reset() { this.active = 0; this.sleeping = 0; this.rendered = 0 } }
function mobStats() {
  console.log(`mobs — active:${MobDebug.active} sleeping:${MobDebug.sleeping} rendered:${MobDebug.rendered}`)
  return { ...MobDebug }
}
function mobWakeRadius2() {
  const r = Math.hypot(canvas.width, canvas.height) / 2 + MOB_WAKE_MARGIN
  return r * r
}

// Update a single mob — moves, shoots, wall collision.
// Normal mobs far from the player sleep: they keep existing but skip expensive
// AI (so they don't shoot) and hold still until the player gets close again.
function updateMob(e, dt, char, tileMap) {
  if (!e.alive) return
  if (!e.isBoss && char) {
    const dx = char.x - e.x, dy = char.y - e.y
    if (dx * dx + dy * dy > mobWakeRadius2()) {
      e.asleep = true
      e.vx = 0; e.vy = 0                 // no drift while sleeping
      if (e.hitFlash > 0) e.hitFlash -= dt
      MobDebug.sleeping++
      return
    }
  }
  e.asleep = false
  MobDebug.active++
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
    const cull = Math.hypot(canvas.width, canvas.height) / 2 + MOB_CULL_MARGIN
    if (cx * cx + cy * cy > cull * cull) return
  }
  MobDebug.rendered++
  const flash = e.hitFlash > 0

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath(); ctx.ellipse(sx, sy + e.radius - 2, e.radius * 0.8, e.radius * 0.3, 0, 0, Math.PI*2); ctx.fill()

  // Body
  ctx.shadowBlur = flash ? 16 : 6
  ctx.shadowColor = flash ? '#fff' : e.color
  ctx.fillStyle = flash ? '#ffffff' : e.color
  if (e.isBoss) {
    // Boss: diamond shape
    ctx.beginPath()
    ctx.moveTo(sx, sy - e.radius)
    ctx.lineTo(sx + e.radius, sy)
    ctx.lineTo(sx, sy + e.radius)
    ctx.lineTo(sx - e.radius, sy)
    ctx.closePath(); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(sx, sy, e.radius, 0, Math.PI*2); ctx.fill()
  }
  ctx.shadowBlur = 0

  // HP bar
  const bw = e.radius * 2.4, bh = 4
  const bx = sx - bw/2, by = sy - e.radius - 9
  ctx.fillStyle = '#111'
  ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2)
  ctx.fillStyle = e.isBoss ? '#ff6b6b' : '#4caf50'
  ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh)

  // Boss name
  if (e.isBoss) {
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(e.name, sx, sy - e.radius - 14)
    ctx.textAlign = 'left'
  }
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
  // Short layouts (6–10 rooms) → ~30s–3min runs. Exclusive loot via items.js
  // EXCLUSIVES_BY_DUNGEON (boss high chance, basic mobs rare).
  dark_matter_core: {
    name: 'Dark Matter Core', stars: 6, color: '#9b7bff',
    tileColor: { floor: '#16121f', wall: '#0a0712', accent: '#3a1f6e' },
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'],
    boss: 'singularity_tyrant',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  frozen_catacombs: {
    name: 'Frozen Catacombs', stars: 4, color: '#bfe6f5',
    tileColor: { floor: '#2a3742', wall: '#16222b', accent: '#5b8aa6' },
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'],
    boss: 'frost_monarch',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 3 }
  },
  infernal_pit: {
    name: 'Infernal Pit', stars: 5, color: '#ff7a3c',
    tileColor: { floor: '#2c0f0b', wall: '#180704', accent: '#6e2410' },
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'],
    boss: 'infernal_lord',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  plague_grotto: {
    name: 'Plague Grotto', stars: 4, color: '#9be84a',
    tileColor: { floor: '#1d2a15', wall: '#0e1709', accent: '#3f7a2a' },
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'],
    boss: 'plague_mother',
    rooms: { min: 6, max: 9 }, roomSize: { min: 5, max: 10 }, mobsPerRoom: { min: 2, max: 3 }
  },
  fallen_keep: {
    name: 'Fallen Keep', stars: 4, color: '#d8c9a0',
    tileColor: { floor: '#2b2820', wall: '#171510', accent: '#5a5238' },
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'],
    boss: 'fallen_monarch',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  },
  astral_tomb: {
    name: 'Astral Tomb', stars: 5, color: '#ffe08a',
    tileColor: { floor: '#2a2238', wall: '#150f22', accent: '#6e5aa0' },
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'],
    boss: 'astral_pharaoh',
    rooms: { min: 6, max: 10 }, roomSize: { min: 5, max: 9 }, mobsPerRoom: { min: 2, max: 4 }
  }
}
