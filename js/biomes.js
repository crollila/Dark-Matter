// ============================================================
// BIOMES — data-driven world regions: palette, mob pool, dungeon drop
// ------------------------------------------------------------
// World map carries a `biome` Uint8Array (id per tile, 0 = neutral home).
// Each biome: distinct floor palette, 3 mob keys (see mobs.js), an optional
// hazard floor tile, a minimap tint, and a related dungeon-portal drop key
// (placeholder dungeons live in DUNGEONS, entry deferred — see world.js).
// ============================================================
const BIOMES = {
  dark_matter: {
    id: 1, name: 'Dark Matter Expanse',
    floor: '#16121f', floorAlt: '#1c1628', accent: '#9b7bff', mini: [44, 30, 70],
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'], dungeon: 'dark_matter_core',
  },
  snow: {
    id: 2, name: 'Frozen Wastes',
    floor: '#33414d', floorAlt: '#3a4954', accent: '#bfe6f5', mini: [120, 150, 172],
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'], dungeon: 'frozen_catacombs',
    hazard: T_ICE, hazardChance: 0.18,
  },
  hell: {
    id: 3, name: 'Infernal Reach',
    floor: '#39140f', floorAlt: '#2c0f0b', accent: '#ff7a3c', mini: [128, 42, 28],
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'], dungeon: 'infernal_pit',
    hazard: T_LAVA, hazardChance: 0.15,
  },
  toxic: {
    id: 4, name: 'Fungal Mire',
    floor: '#1d2a15', floorAlt: '#22331a', accent: '#9be84a', mini: [78, 120, 44],
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'], dungeon: 'plague_grotto',
  },
  ruined: {
    id: 5, name: 'Ruined Kingdom',
    floor: '#2b2820', floorAlt: '#333026', accent: '#d8c9a0', mini: [120, 108, 84],
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'], dungeon: 'fallen_keep',
  },
  astral: {
    id: 6, name: 'Astral Desert',
    floor: '#332a40', floorAlt: '#3b3049', accent: '#ffe08a', mini: [168, 144, 96],
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'], dungeon: 'astral_tomb',
  },

  // --- LOW/MID biomes added to fill the southern (bottom) half of the 400x400
  // world. They reuse existing mob pools + biome dungeons (no new mobs/dungeons
  // needed); the northward difficulty gradient (world.js) scales these DOWN
  // because they sit south, so they read as easier despite shared mobs.
  // 1★ biomes bias deep south, 2★ mid-south, 3★ mid (see BIOME_HARDNESS below).
  // ids 7-12 are reserved for runtime BOSS_BIOMES, so new ids start at 13.

  // 1★ (deep south)
  meadow: {
    id: 13, name: 'Greenwood Vale',
    floor: '#1f2a18', floorAlt: '#26331d', accent: '#a7d86a', mini: [96, 138, 66],
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'], dungeon: 'fallen_keep',
  },
  fen: {
    id: 14, name: 'Quiet Fen',
    floor: '#162420', floorAlt: '#1b2c27', accent: '#8fe0c0', mini: [78, 128, 110],
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'], dungeon: 'plague_grotto',
    hazard: T_POISON, hazardChance: 0.16,
  },

  // 2★ (mid-south)
  frostfields: {
    id: 15, name: 'Frostfields',
    floor: '#2c3a44', floorAlt: '#33424d', accent: '#bfe6f5', mini: [132, 162, 184],
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'], dungeon: 'frozen_catacombs',
  },
  sunken: {
    id: 16, name: 'Sunken Ruins',
    floor: '#26262a', floorAlt: '#2d2d32', accent: '#cdbf9a', mini: [112, 106, 96],
    mobs: ['fallen_squire', 'icebound_archer', 'grave_priest'], dungeon: 'fallen_keep',
  },

  // 3★ (mid)
  scorched: {
    id: 17, name: 'Scorched Expanse',
    floor: '#321711', floorAlt: '#3a1c14', accent: '#ff8a4c', mini: [142, 70, 40],
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'], dungeon: 'infernal_pit',
  },
  starlit: {
    id: 18, name: 'Starlit Waste',
    floor: '#2c2440', floorAlt: '#342b4b', accent: '#ffe08a', mini: [150, 132, 96],
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'], dungeon: 'astral_tomb',
  },
  nullfringe: {
    id: 19, name: 'Null Fringe',
    floor: '#191324', floorAlt: '#1f182d', accent: '#9b7bff', mini: [84, 60, 120],
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'], dungeon: 'dark_matter_core',
  },
}

// ---- BOSS BIOMES (ids 7-12) ----
// Painted at RUNTIME around a spawned world boss (see world.js), NOT at
// world-gen — so they are deliberately kept OUT of `BIOMES` (which assignBiomes
// iterates to place world clusters). They ARE added to BIOME_BY_ID below so the
// in-world floor tint, minimap tint, and the biome-name label all resolve them.
const BOSS_BIOMES = {
  event_horizon: { id: 7,  name: 'Event Horizon', floor: '#120a1f', floorAlt: '#1a1030', accent: '#b388ff', mini: [70, 34, 104] },
  glacial_throne: { id: 8,  name: 'Glacial Throne', floor: '#26424f', floorAlt: '#2e4d5b', accent: '#9fe8ff', mini: [150, 196, 220] },
  ash_caldera:    { id: 9,  name: 'Ash Caldera', floor: '#2a1310', floorAlt: '#331813', accent: '#ff5a22', mini: [150, 54, 30] },
  rot_garden:     { id: 10, name: 'Rot Garden', floor: '#1d2a13', floorAlt: '#243318', accent: '#9be84a', mini: [96, 150, 50] },
  cursed_court:   { id: 11, name: 'Cursed Court', floor: '#2b2740', floorAlt: '#332f4a', accent: '#e6dcae', mini: [150, 138, 108] },
  starfall_dunes: { id: 12, name: 'Starfall Dunes', floor: '#2c2440', floorAlt: '#352b4d', accent: '#ffd166', mini: [196, 168, 110] },
}

// Northward difficulty: the hardest biomes (Dark Matter / Hell / Astral) bias to
// the NORTH of the map; Snow / Fungal / Ruined sit mid. Drives cluster Y
// placement in assignBiomes (id → hardness 0..1). Unknown ids default to 0.5.
const BIOME_HARDNESS = {
  1: 0.92, // dark_matter
  3: 0.82, // hell
  6: 0.86, // astral
  2: 0.40, // snow
  4: 0.48, // toxic / fungal
  5: 0.44, // ruined
  // new low/mid biomes — 1★ deepest south, 2★ mid-south, 3★ mid
  13: 0.10, // meadow (1★)
  14: 0.14, // fen (1★)
  15: 0.26, // frostfields (2★)
  16: 0.30, // sunken (2★)
  17: 0.42, // scorched (3★)
  18: 0.45, // starlit (3★)
  19: 0.48, // nullfringe (3★)
}

// id → biome lookup (used by render/minimap/world spawn & leash logic)
const BIOME_BY_ID = {}
for (const k in BIOMES) BIOME_BY_ID[BIOMES[k].id] = BIOMES[k]
for (const k in BOSS_BIOMES) BIOME_BY_ID[BOSS_BIOMES[k].id] = BOSS_BIOMES[k]

// Assign biome regions onto a world map as SEPARATED clusters. Each biome gets
// one blob region placed apart from the others, with neutral grass (id 0) in
// the gaps so the player must explore to find each biome. The central spawn
// area is left neutral so the home region is hazard-free. Also scatters each
// biome's hazard floor tiles. Additive — does not touch the cave generation.
// Records `m.biomeClusters` for world spawn distribution.
function assignBiomes(m, rng) {
  const W = m.w, H = m.h
  m.biome = new Uint8Array(W * H)
  // Home/spawn sits in the safer SOUTH band (matches map.js spawn). The neutral
  // home circle and the difficulty gradient are both anchored here.
  const homeFrac = (typeof WORLD_HOME_Y_FRAC !== 'undefined') ? WORLD_HOME_Y_FRAC : 0.82
  const cx = W / 2, cy = H * homeFrac

  // --- Place one spaced-out cluster per biome (harder biomes biased NORTH) ---
  const ids = []
  for (const k in BIOMES) ids.push(BIOMES[k].id)
  const minDim = Math.min(W, H)
  const homeR = Math.max(18, minDim * 0.11)     // neutral home radius (tiles)
  const minSep = minDim * 0.17                  // min distance between centers (spread the big blobs)
  const clusters = []
  for (const id of ids) {
    const hard = BIOME_HARDNESS[id] != null ? BIOME_HARDNESS[id] : 0.5
    let placed = null
    for (let attempt = 0; attempt < 300; attempt++) {
      // Larger blobs so biomes dominate the world map instead of reading as small
      // scattered dots — each region now spans ~2-3x its old footprint.
      const r = (0.105 + rng() * 0.06) * minDim  // blob radius (tiles)
      const margin = r + 4
      // Difficulty → latitude: hard=1 sits at the far NORTH (y≈0.16H), easy=0
      // sits DEEP SOUTH near the home band (y≈0.78H), so the new low/mid biomes
      // fill the bottom half while hard biomes stay north. Jittered.
      const targetYFrac = 0.16 + (1 - hard) * 0.62 + (rng() - 0.5) * 0.16
      const x = margin + rng() * (W - 2 * margin)
      const y = Math.max(margin, Math.min(H - margin, targetYFrac * H))
      if (Math.hypot(x - cx, y - cy) < homeR + r + 6) continue   // clear of home
      let ok = true
      for (const c of clusters) if (Math.hypot(x - c.x, y - c.y) < minSep) { ok = false; break }
      if (ok) { placed = { id, x, y, r }; break }
    }
    // Defensive fallback: relaxed placement still produces a valid cluster.
    if (!placed) {
      const r = 0.13 * minDim
      placed = { id, x: r + 4 + rng() * (W - 2 * (r + 4)), y: r + 4 + rng() * (H - 2 * (r + 4)), r }
    }
    clusters.push(placed)
  }
  m.biomeClusters = clusters

  // --- Paint each blob (noisy edge); tiles outside every blob stay neutral ---
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const hx = x - cx, hy = y - cy
      if (hx * hx + hy * hy < homeR * homeR) continue   // keep spawn neutral
      let best = 0, bestD = Infinity
      for (const c of clusters) {
        const dx = x - c.x, dy = y - c.y
        const d = Math.hypot(dx, dy)
        // wobble the boundary so blobs aren't perfect circles
        const wobble = 1 + 0.16 * Math.sin(Math.atan2(dy, dx) * 3 + c.id * 1.7)
        if (d < c.r * wobble && d < bestD) { bestD = d; best = c.id }
      }
      m.biome[y * W + x] = best
    }

  // Hazard PATCHES (ice / lava / poison) — grouped pools, not single scattered
  // tiles. One patch budget per hazard biome cluster; each patch is a short
  // random-walk blob over that biome's own floor tiles, so hazards "group up"
  // consistently for every hazard type (lava, ice, poison all use this).
  for (const c of clusters) {
    const def = BIOME_BY_ID[c.id]
    if (!def || !def.hazard) continue
    const area = Math.PI * c.r * c.r
    const patches = Math.max(1, Math.round(area * (def.hazardChance || 0.15) / 22))
    for (let p = 0; p < patches; p++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * c.r
      let hx = Math.round(c.x + Math.cos(a) * rr)
      let hy = Math.round(c.y + Math.sin(a) * rr)
      const steps = 4 + (rng() * 10 | 0)   // patch size (organic blob)
      for (let s = 0; s < steps; s++) {
        if (hx > 0 && hy > 0 && hx < W - 1 && hy < H - 1 &&
            m.biome[hy * W + hx] === c.id && m.get(hx, hy) === T_FLOOR)
          m.set(hx, hy, def.hazard)
        const d = rng() * 4 | 0
        hx += d === 0 ? 1 : d === 1 ? -1 : 0
        hy += d === 2 ? 1 : d === 3 ? -1 : 0
      }
    }
  }

  // Tile-coord biome lookup used by spawn/leash/UI.
  m.biomeAt = (tx, ty) =>
    (tx < 0 || ty < 0 || tx >= W || ty >= H) ? 0 : m.biome[ty * W + tx]
}
