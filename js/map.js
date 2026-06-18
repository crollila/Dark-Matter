// ============================================================
// MAP — nexus layout, open world gen, dungeon BSP gen
// ============================================================

// ---- NEXUS MAP (hand-designed, tile-by-tile) ----
// Layout (each char = 1 tile, map is 40 wide × 38 tall):
//   # = wall   . = floor   S = spawn   W = world portal
//   R = raid portal   L = leaderboard room   G = guild room
//   1-6 = stations (gamble/upgrade/destroy/transmute/tbd/tbd)

const NEXUS_W = 40, NEXUS_H = 42

function buildNexus() {
  const m = makeTileMap(NEXUS_W, NEXUS_H)
  const set = (x, y, t) => m.set(x, y, t)

  // Fill all walls
  for (let y = 0; y < NEXUS_H; y++)
    for (let x = 0; x < NEXUS_W; x++)
      m.set(x, y, T_WALL)

  // ── BOTTOM BOX (spawn room): cols 8-31, rows 24-40 ──
  fillRect(m, 8, 24, 32, 41, T_FLOOR)

  // Spawn tile center of bottom room
  set(20, 32, T_SPAWN)

  // ── VERTICAL HALLWAY: cols 15-25, rows 10-24 ──
  fillRect(m, 15, 10, 25, 24, T_FLOOR)

  // ── STATION ALCOVES ──
  // Left stations: cols 9-15, 3 alcoves at rows 11,15,19
  // Right stations: cols 25-31, 3 alcoves
  const stationRows = [11, 15, 19]
  for (const row of stationRows) {
    // Left alcove — flush with hallway (no gap)
    fillRect(m, 9, row, 15, row + 3, T_FLOOR)
    set(10, row + 1, T_STATION)
    // Right alcove — flush with hallway
    fillRect(m, 25, row, 31, row + 3, T_FLOOR)
    set(29, row + 1, T_STATION)
  }

  // Label each station (upgrade→Reforge, destroy→Salvage, transmute→Fusion).
  // The vault now occupies a former "???" hallway alcove instead of a standalone
  // tile near spawn — interact opens the account stash panel (account.stash).
  m.stations = [
    { x: 10, y: 12, label: 'GAMBLE',  key: 'gamble' },
    { x: 10, y: 16, label: 'REFORGE', key: 'upgrade' },
    { x: 10, y: 20, label: 'SALVAGE', key: 'destroy' },
    { x: 29, y: 12, label: 'FUSION',  key: 'transmute' },
    { x: 29, y: 16, label: 'VAULT',   key: 'vault' },
    { x: 29, y: 20, label: 'WIKI',    key: 'wiki' },
  ]

  // ── UPPER BOX: cols 8-31, rows 1-10 ──
  fillRect(m, 8, 1, 32, 10, T_FLOOR)

  // ── LEADERBOARD ROOM (left wall of upper box): cols 1-8, rows 1-10 ──
  fillRect(m, 1, 1, 8, 10, T_FLOOR)

  // ── GUILD HALL (right wall of upper box): cols 31-38, rows 1-10 ──
  fillRect(m, 31, 1, 38, 10, T_FLOOR)

  // ── PORTALS ──
  // World portal: center of upper box
  set(19, 5, T_PORTAL_WORLD)
  set(20, 5, T_PORTAL_WORLD)
  set(19, 6, T_PORTAL_WORLD)
  set(20, 6, T_PORTAL_WORLD)

  // Raid portal: against top wall, above world portal
  set(19, 1, T_PORTAL_RAID)
  set(20, 1, T_PORTAL_RAID)

  // Dungeon portal stubs (left/right of leaderboard and guild hall entrances)
  // These will be populated dynamically — leave as FLOOR for now
  m.dungeonPortalSlots = []

  // Store key positions for nexus.js
  m.spawnPos = { x: 20 * TILE + TILE/2, y: 32 * TILE + TILE/2 }
  m.worldPortalPos = { tx: 19, ty: 5 }
  m.raidPortalPos  = { tx: 19, ty: 1 }

  // Nexus stays clean/default gray — never paint env sprite terrain/decor here
  // (renderTileMap skips the whole env layer when this is set).
  m.disableEnvSprites = true

  return m
}

function fillRect(m, x0, y0, x1, y1, t) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      m.set(x, y, t)
}

// ---- VAULT ROOM (hand-designed small room with storage chests) ----
const VAULT_W = 22, VAULT_H = 16
function buildVault() {
  const m = makeTileMap(VAULT_W, VAULT_H)
  for (let y = 0; y < VAULT_H; y++)
    for (let x = 0; x < VAULT_W; x++)
      m.set(x, y, T_WALL)
  fillRect(m, 2, 2, VAULT_W - 2, VAULT_H - 2, T_FLOOR)

  // Return portal back to nexus (purple) at the bottom entrance.
  m.set(11, 13, T_PORTAL_VAULT)

  // Storage chests along the top wall (decorative; any one opens the vault).
  m.chests = [
    { x: 5, y: 3 }, { x: 8, y: 3 }, { x: 11, y: 3 }, { x: 14, y: 3 }, { x: 17, y: 3 },
  ]
  m.spawnPos = { x: 11 * TILE + TILE / 2, y: 11 * TILE + TILE / 2 }
  // Vault room is a structural/safe map — keep it simple gray like the Nexus.
  m.disableEnvSprites = true
  return m
}

// ---- OPEN WORLD (cellular automaton cave) ----
// Large, open world so biomes sit far apart with neutral terrain between them.
// ~4x the old area (was 200×200). Home/spawn sits in the safer SOUTH (high y);
// difficulty rises toward the NORTH (see world.js worldDifficulty / biomes.js).
const WORLD_W = 400, WORLD_H = 400
const WORLD_HOME_Y_FRAC = 0.82   // spawn/home band (fraction down from the top)

function buildWorld(seed = Date.now()) {
  const m = makeTileMap(WORLD_W, WORLD_H)
  const rng = mulberry32(seed)

  // Random fill — high floor bias (low wall density) for an open, explorable map
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < WORLD_W; x++)
      m.set(x, y, (x === 0 || y === 0 || x === WORLD_W-1 || y === WORLD_H-1) ? T_WALL
        : rng() < 0.62 ? T_FLOOR : T_WALL)

  // Only 3 smoothing passes (was 5), threshold 5→4 to keep more open space
  for (let pass = 0; pass < 3; pass++) {
    const buf = new Uint8Array(m.data)
    for (let y = 1; y < WORLD_H-1; y++)
      for (let x = 1; x < WORLD_W-1; x++) {
        let walls = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (buf[(y+dy)*WORLD_W+(x+dx)] === T_WALL) walls++
        m.set(x, y, walls >= 5 ? T_WALL : T_FLOOR)
      }
  }

  // Flood-fill from center to find largest connected region, fill orphans as floor
  const cx0 = WORLD_W/2|0, cy0 = WORLD_H/2|0
  // Find a floor cell near center
  let sx = cx0, sy = cy0
  outer: for (let r = 0; r < 20; r++)
    for (let a = 0; a < 16; a++) {
      const tx = (cx0 + Math.cos(a*Math.PI/8)*r)|0, ty = (cy0 + Math.sin(a*Math.PI/8)*r)|0
      if (m.get(tx,ty) === T_FLOOR) { sx=tx; sy=ty; break outer }
    }
  const visited = new Uint8Array(WORLD_W * WORLD_H)
  const stack = [sy*WORLD_W+sx]
  visited[sy*WORLD_W+sx] = 1
  while (stack.length) {
    const idx = stack.pop()
    const fx = idx % WORLD_W, fy = idx / WORLD_W | 0
    for (const [nx,ny] of [[fx-1,fy],[fx+1,fy],[fx,fy-1],[fx,fy+1]]) {
      const ni = ny*WORLD_W+nx
      if (nx>0&&ny>0&&nx<WORLD_W-1&&ny<WORLD_H-1 && !visited[ni] && m.get(nx,ny)===T_FLOOR) {
        visited[ni]=1; stack.push(ni)
      }
    }
  }
  // Any floor tile not reachable → convert to wall (prevents isolated pockets)
  for (let y = 1; y < WORLD_H-1; y++)
    for (let x = 1; x < WORLD_W-1; x++)
      if (m.get(x,y)===T_FLOOR && !visited[y*WORLD_W+x]) m.set(x,y,T_WALL)

  // Scatter grass + water patches (grass-heavy so the neutral between-biome
  // terrain reads as open fields). Count scales with the larger map area.
  const patches = (WORLD_W * WORLD_H / 220) | 0
  for (let i = 0; i < patches; i++) {
    const pcx = (rng() * (WORLD_W-4) + 2) | 0
    const pcy = (rng() * (WORLD_H-4) + 2) | 0
    const type = rng() < 0.65 ? T_GRASS : T_WATER
    const pr = (rng() * 2 + 1) | 0
    for (let dy = -pr; dy <= pr; dy++)
      for (let dx = -pr; dx <= pr; dx++)
        if (m.get(pcx+dx, pcy+dy) === T_FLOOR) m.set(pcx+dx, pcy+dy, type)
  }

  // Carve biome regions + hazard tiles onto the finished cave (additive).
  if (typeof assignBiomes === 'function') assignBiomes(m, rng)

  // Place predefined dungeon entrances at semi-random floor positions.
  // Biome dungeons (DUNGEONS[k].biome) are excluded — they only enter the world
  // via biome mob portal drops, never as fixed scatter. Only normal/world
  // dungeons (goblin_warren, fungal_cavern, void_rift) are scattered here.
  const dungeonKeys = Object.keys(DUNGEONS).filter(k => !DUNGEONS[k].placeholder && !DUNGEONS[k].biome)
  m.dungeonPortals = []
  const placed = new Set()
  for (let i = 0; i < dungeonKeys.length * 2 + 2; i++) {
    const key = dungeonKeys[i % dungeonKeys.length]
    for (let attempt = 0; attempt < 60; attempt++) {
      const tx = (rng() * (WORLD_W - 20) + 10) | 0
      const ty = (rng() * (WORLD_H - 20) + 10) | 0
      const idx = ty * WORLD_W + tx
      if (m.get(tx, ty) === T_FLOOR && !placed.has(idx)) {
        m.set(tx, ty, T_PORTAL_DUNGEON)
        m.dungeonPortals.push({ tx, ty, dungeonKey: key })
        placed.add(idx)
        break
      }
    }
  }

  // Find a valid floor spawn in the safer SOUTH band (not center) so the
  // northward difficulty gradient leaves home easy.
  m.spawnPos = findFloorNear(m, WORLD_W/2, (WORLD_H * WORLD_HOME_Y_FRAC) | 0)

  return m
}

// ---- DUNGEON (BSP room-chain with dead-end branches) ----
function buildDungeon(defKey, seed = Date.now()) {
  const def = DUNGEONS[defKey]
  if (!def) return null
  const rng = mulberry32(seed)

  // Larger, randomly-sized dungeons. Harder dungeons (more stars) trend bigger,
  // with per-run variance so the same dungeon differs run to run. The tile map
  // grows to fit the room count so big layouts don't clamp/overlap.
  // Biome dungeons get a size bump; world-boss dungeons (the ones referenced by
  // WORLD_BOSSES[*].dungeon) are the biggest — both stay capped for performance.
  const stars = def.stars || 3
  const starBonus = Math.round(stars * 1.3)
  const wbDungeons = (typeof WORLD_BOSSES !== 'undefined')
    ? Object.keys(WORLD_BOSSES).reduce((s, k) => (s[WORLD_BOSSES[k].dungeon] = 1, s), {})
    : {}
  let typeBonus = 0, sizeCap = 180
  if (wbDungeons[defKey]) { typeBonus = 6; sizeCap = 240 }       // world-boss dungeon: biggest
  else if (def.biome)     { typeBonus = 3; sizeCap = 210 }       // biome dungeon: larger
  const minR = def.rooms.min + starBonus + typeBonus
  const maxR = def.rooms.max + starBonus + typeBonus + 5         // a touch more per-run variance
  const rCount = minR + (rng() * (maxR - minR + 1) | 0)
  const MAP_W = Math.max(80, Math.min(sizeCap, 56 + rCount * 7))
  const MAP_H = MAP_W
  const m = makeTileMap(MAP_W, MAP_H)
  m.dungeonKey = defKey
  m.rooms = []      // { x, y, w, h, cx, cy, type }
  m.corridors = []
  m.mobs = []       // { key, x, y } — mob spawn points
  m.bossRoom = null
  m.entrancePos = null

  // Dungeon-specific floor/wall colors stored on map
  m.tileColor = def.tileColor

  // Fill void
  for (let i = 0; i < MAP_W * MAP_H; i++) m.data[i] = T_VOID

  const rsMin = def.roomSize.min, rsMax = def.roomSize.max

  // ---- ROOM CHAIN GENERATOR ----
  // Start from entrance, chain rooms in a tree with branches
  // ~60% chance each room spawns 1 child, ~25% chance spawns 2 (branch), rest dead end

  const ENTRANCE_X = MAP_W / 2 | 0, ENTRANCE_Y = MAP_H - 8

  function randRoom(cx, cy) {
    const w = rsMin + (rng() * (rsMax - rsMin + 1) | 0)
    const h = rsMin + (rng() * (rsMax - rsMin + 1) | 0)
    return { x: (cx - w/2) | 0, y: (cy - h/2) | 0, w, h, cx, cy }
  }

  function carveRoom(room) {
    fillRect(m, room.x, room.y, room.x + room.w, room.y + room.h, T_FLOOR)
  }

  function carveCorridor(ax, ay, bx, by) {
    // L-shaped corridor, 3 tiles wide for better traversal
    const goHorizFirst = rng() < 0.5
    if (goHorizFirst) {
      // Horizontal leg
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx)
      for (let x = x0; x <= x1; x++) {
        m.set(x, ay,   T_FLOOR); m.set(x, ay+1, T_FLOOR); m.set(x, ay-1, T_FLOOR)
      }
      // Vertical leg
      const y0 = Math.min(ay, by), y1 = Math.max(ay, by)
      for (let y = y0; y <= y1; y++) {
        m.set(bx,   y, T_FLOOR); m.set(bx+1, y, T_FLOOR); m.set(bx-1, y, T_FLOOR)
      }
    } else {
      // Vertical leg first
      const y0 = Math.min(ay, by), y1 = Math.max(ay, by)
      for (let y = y0; y <= y1; y++) {
        m.set(ax,   y, T_FLOOR); m.set(ax+1, y, T_FLOOR); m.set(ax-1, y, T_FLOOR)
      }
      // Horizontal leg
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx)
      for (let x = x0; x <= x1; x++) {
        m.set(x, by,   T_FLOOR); m.set(x, by+1, T_FLOOR); m.set(x, by-1, T_FLOOR)
      }
    }
  }

  // BFS-style room placement
  const placed = []
  const queue = [{ cx: ENTRANCE_X, cy: ENTRANCE_Y, depth: 0 }]
  let totalRooms = 0

  while (queue.length > 0 && totalRooms < rCount) {
    const { cx, cy, depth } = queue.shift()

    // Try to place a room here (retry if overlap is bad)
    let room = null
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = randRoom(cx, cy)
      if (r.x < 1 || r.y < 1 || r.x + r.w >= MAP_W - 1 || r.y + r.h >= MAP_H - 1) continue
      // Loose overlap check — some overlap is ok for maze feel, extreme isn't
      const overlap = placed.some(p =>
        r.x < p.x + p.w + 2 && r.x + r.w > p.x - 2 &&
        r.y < p.y + p.h + 2 && r.y + r.h > p.y - 2
      )
      if (!overlap || attempt > 5) { room = r; break }
    }
    if (!room) continue

    room.type = totalRooms === 0 ? 'entrance' : 'normal'
    carveRoom(room)
    placed.push(room)

    // Connect to parent
    if (placed.length > 1) {
      const parent = placed[placed.length - 2]
      carveCorridor(parent.cx, parent.cy, room.cx, room.cy)
    }

    totalRooms++

    // Branch probability
    const p = rng()
    const isBranch = depth < 4 && p < 0.25  // 25% chance second child (branch)
    const hasChild  = totalRooms < rCount - 1 && p < 0.70 // 70% chance any child

    if (hasChild) {
      const spread = 8 + (rng() * 10 | 0)
      const ang = (rng() * Math.PI * 1.4) - Math.PI * 0.7 - Math.PI / 2 // bias upward
      queue.push({ cx: room.cx + Math.cos(ang) * spread | 0, cy: room.cy + Math.sin(ang) * spread | 0, depth: depth + 1 })
    }
    if (isBranch) {
      const spread = 7 + (rng() * 8 | 0)
      const ang2 = (rng() * Math.PI * 1.4) - Math.PI * 0.7 - Math.PI / 2
      queue.push({ cx: room.cx + Math.cos(ang2) * spread | 0, cy: room.cy + Math.sin(ang2) * spread | 0, depth: depth + 1 })
    }
  }

  // ---- BOSS ROOM ----
  // Find the room furthest from entrance
  const entrance = placed[0]
  let furthest = placed[0], maxDist = 0
  for (const r of placed) {
    const dx = r.cx - entrance.cx, dy = r.cy - entrance.cy
    const d = dx*dx + dy*dy
    if (d > maxDist) { maxDist = d; furthest = r }
  }
  // Expand boss room slightly
  const bw = rsMax + 4, bh = rsMax + 4
  const bossRoom = {
    x: furthest.cx - bw/2 | 0, y: furthest.cy - bh/2 | 0,
    w: bw, h: bh, cx: furthest.cx, cy: furthest.cy, type: 'boss'
  }
  // Clamp
  bossRoom.x = Math.max(1, Math.min(MAP_W - bw - 1, bossRoom.x))
  bossRoom.y = Math.max(1, Math.min(MAP_H - bh - 1, bossRoom.y))
  fillRect(m, bossRoom.x, bossRoom.y, bossRoom.x + bossRoom.w, bossRoom.y + bossRoom.h, T_FLOOR)
  carveCorridor(furthest.cx, furthest.cy, bossRoom.cx, bossRoom.cy)
  m.bossRoom = bossRoom

  // Mark entrance tile
  const ex = entrance.cx, ey = entrance.cy
  m.set(ex, ey + 2, T_PORTAL_DUNGEON) // exit portal back to world
  m.entrancePos = { x: ex * TILE + TILE/2, y: (ey + 1) * TILE + TILE/2 }

  // Leave T_VOID as void — dungeon renderer draws it black, no walls needed

  // ---- MOB PLACEMENT ----
  const mPerRoom = def.mobsPerRoom
  for (const room of placed) {
    if (room.type === 'entrance') continue
    const count = mPerRoom.min + (rng() * (mPerRoom.max - mPerRoom.min + 1) | 0)
    for (let i = 0; i < count; i++) {
      const mx = room.x + 1 + (rng() * (room.w - 2) | 0)
      const my = room.y + 1 + (rng() * (room.h - 2) | 0)
      const mobKey = def.mobs[rng() * def.mobs.length | 0]
      m.mobs.push({ key: mobKey, x: mx * TILE + TILE/2, y: my * TILE + TILE/2 })
    }
  }

  // Boss alone in boss room
  m.mobs.push({
    key: def.boss,
    x: bossRoom.cx * TILE + TILE/2,
    y: bossRoom.cy * TILE + TILE/2
  })

  m.placed = placed
  m.spawnPos = m.entrancePos
  return m
}

// ---- SEEDED RNG (mulberry32) ----
function mulberry32(seed) {
  let s = seed >>> 0
  return function() {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff
  }
}