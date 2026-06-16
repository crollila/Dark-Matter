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
    // ai state
    shootTimer: Math.random() * 2,
    phase: Math.random() * Math.PI * 2,
    chargeTimer: 1.5 + Math.random(),
    charging: false, chargeDx: 0, chargeDy: 0,
    hitFlash: 0
  }
}

// Update a single mob — moves, shoots, wall collision
function updateMob(e, dt, char, tileMap) {
  if (!e.alive) return
  MOB_AI[e.ai](e, dt, char, tileMap)
  moveWithCollision(e, e.vx, e.vy, dt, e.radius, tileMap)
  if (e.hitFlash > 0) e.hitFlash -= dt
}

// Render a single mob (world-space coords, cam applied externally via offX/offY)
function renderMob(e, offX, offY) {
  const sx = e.x + offX, sy = e.y + offY
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
  }
}
