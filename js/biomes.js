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
    mobs: ['matter_wraith', 'gravity_maw', 'null_apostle'], dungeon: 'dm_rift',
  },
  snow: {
    id: 2, name: 'Frozen Wastes',
    floor: '#33414d', floorAlt: '#3a4954', accent: '#bfe6f5', mini: [120, 150, 172],
    mobs: ['frost_skater', 'icebound_archer', 'snow_golem'], dungeon: 'snow_keep',
    hazard: T_ICE, hazardChance: 0.18,
  },
  hell: {
    id: 3, name: 'Infernal Reach',
    floor: '#39140f', floorAlt: '#2c0f0b', accent: '#ff7a3c', mini: [128, 42, 28],
    mobs: ['ember_imp', 'chainscourge', 'lava_brute'], dungeon: 'hell_pit',
    hazard: T_LAVA, hazardChance: 0.15,
  },
  toxic: {
    id: 4, name: 'Fungal Mire',
    floor: '#1d2a15', floorAlt: '#22331a', accent: '#9be84a', mini: [78, 120, 44],
    mobs: ['spore_crawler', 'venom_cap', 'mycelium_horror'], dungeon: 'toxic_hollow',
  },
  ruined: {
    id: 5, name: 'Ruined Kingdom',
    floor: '#2b2820', floorAlt: '#333026', accent: '#d8c9a0', mini: [120, 108, 84],
    mobs: ['fallen_squire', 'cursed_archer', 'grave_priest'], dungeon: 'ruined_keep',
  },
  astral: {
    id: 6, name: 'Astral Desert',
    floor: '#332a40', floorAlt: '#3b3049', accent: '#ffe08a', mini: [168, 144, 96],
    mobs: ['star_scarab', 'mirage_stalker', 'sunseer'], dungeon: 'astral_dunes',
  },
}

// id → biome lookup (used by render/minimap/world spawn & leash logic)
const BIOME_BY_ID = {}
for (const k in BIOMES) BIOME_BY_ID[BIOMES[k].id] = BIOMES[k]

// Assign biome regions onto a world map as SEPARATED clusters. Each biome gets
// one blob region placed apart from the others, with neutral grass (id 0) in
// the gaps so the player must explore to find each biome. The central spawn
// area is left neutral so the home region is hazard-free. Also scatters each
// biome's hazard floor tiles. Additive — does not touch the cave generation.
// Records `m.biomeClusters` for world spawn distribution.
function assignBiomes(m, rng) {
  const W = m.w, H = m.h
  m.biome = new Uint8Array(W * H)
  const cx = W / 2, cy = H / 2

  // --- Place one spaced-out cluster per biome ---
  const ids = []
  for (const k in BIOMES) ids.push(BIOMES[k].id)
  const minDim = Math.min(W, H)
  const homeR = Math.max(18, minDim * 0.11)     // neutral home radius (tiles)
  const minSep = minDim * 0.26                  // min distance between centers
  const clusters = []
  for (const id of ids) {
    let placed = null
    for (let attempt = 0; attempt < 240; attempt++) {
      const r = (0.08 + rng() * 0.05) * minDim  // blob radius (tiles)
      const margin = r + 4
      const x = margin + rng() * (W - 2 * margin)
      const y = margin + rng() * (H - 2 * margin)
      if (Math.hypot(x - cx, y - cy) < homeR + r + 6) continue   // clear of home
      let ok = true
      for (const c of clusters) if (Math.hypot(x - c.x, y - c.y) < minSep) { ok = false; break }
      if (ok) { placed = { id, x, y, r }; break }
    }
    // Defensive fallback: relaxed placement still produces a valid cluster.
    if (!placed) {
      const r = 0.09 * minDim
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

  // Scatter hazard floor tiles inside hazardous biomes (ice / lava).
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const b = m.biome[y * W + x]
      if (!b) continue
      const def = BIOME_BY_ID[b]
      if (def.hazard && m.get(x, y) === T_FLOOR && rng() < def.hazardChance)
        m.set(x, y, def.hazard)
    }

  // Tile-coord biome lookup used by spawn/leash/UI.
  m.biomeAt = (tx, ty) =>
    (tx < 0 || ty < 0 || tx >= W || ty >= H) ? 0 : m.biome[ty * W + tx]
}
