// ============================================================
// ENGINE — canvas, input, camera, pools, particles, spatial grid
// ============================================================

const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
window.addEventListener('resize', resize); resize()

// --- INPUT ---
const keys = {}
const mouse = { x: 0, y: 0, down: false }
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault() })
window.addEventListener('keyup',   e => { keys[e.code] = false })
canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY })
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true })
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouse.down = false })
canvas.addEventListener('contextmenu', e => e.preventDefault())

// --- CAMERA ---
const cam = { x: 0, y: 0 }
function camFollow(tx, ty, dt) {
  cam.x += (tx - cam.x) * Math.min(1, dt * 8)
  cam.y += (ty - cam.y) * Math.min(1, dt * 8)
}
function worldToScreen(wx, wy) {
  return [wx - cam.x + canvas.width/2, wy - cam.y + canvas.height/2]
}
function screenToWorld(sx, sy) {
  return [sx + cam.x - canvas.width/2, sy + cam.y - canvas.height/2]
}

// --- TILE CONSTANTS ---
const TILE = 32
const T_VOID  = 0
const T_FLOOR = 1
const T_WALL  = 2
const T_WATER = 3
const T_GRASS = 4
const T_PORTAL_WORLD  = 5
const T_PORTAL_RAID   = 6
const T_PORTAL_DUNGEON = 7
const T_STATION = 8  // interactable NPC spot
const T_SPAWN   = 9
const T_PORTAL_VAULT = 10  // purple portal in nexus → vault room
const T_ICE  = 11  // snow biome — slippery floor (no block, momentum slide)
const T_LAVA = 12  // hell biome — damages + slows (no block)

const TILE_COLORS = {
  [T_VOID]:  '#000000',
  [T_FLOOR]: '#3a3a2a',
  [T_WALL]:  '#222222',
  [T_WATER]: '#1a3a5c',
  [T_GRASS]: '#2a4a1a',
  [T_PORTAL_WORLD]:   '#1a6a3a',
  [T_PORTAL_RAID]:    '#6a1a1a',
  [T_PORTAL_DUNGEON]: '#4a1a6a',
  [T_STATION]: '#3a3a4a',
  [T_SPAWN]:   '#2a2a3a',
  [T_PORTAL_VAULT]: '#3a1a6a',
  [T_ICE]:   '#9fd4e8',
  [T_LAVA]:  '#7a1c0c',
}
const TILE_COLORS_ALT = {
  [T_FLOOR]: '#353525',
  [T_WALL]:  '#1e1e1e',
  [T_GRASS]: '#254518',
  [T_STATION]: '#353545',
}

// --- SPATIAL GRID ---
const CELL = 64
function makeGrid(mapW, mapH) {
  const gw = Math.ceil(mapW * TILE / CELL)
  const gh = Math.ceil(mapH * TILE / CELL)
  const cells = Array.from({ length: gw * gh }, () => [])
  return {
    w: gw, h: gh, cells,
    clear() { for (let i = 0; i < cells.length; i++) cells[i].length = 0 },
    add(e) {
      const cx = (e.x / CELL) | 0, cy = (e.y / CELL) | 0
      const i = cy * gw + cx
      if (i >= 0 && i < cells.length) cells[i].push(e)
    },
    query(x, y, r, out) {
      const x0 = Math.max(0, ((x-r)/CELL)|0), x1 = Math.min(gw-1, ((x+r)/CELL)|0)
      const y0 = Math.max(0, ((y-r)/CELL)|0), y1 = Math.min(gh-1, ((y+r)/CELL)|0)
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++)
          for (const e of cells[cy * gw + cx]) out.push(e)
    }
  }
}

// --- OBJECT POOLS ---
function makePool(factory, size = 512) {
  const pool = Array.from({ length: size }, factory)
  let head = 0
  return {
    get() { return pool[head++ % size] },
    each(fn) { for (let i = 0; i < size; i++) if (pool[i].alive) fn(pool[i]) },
    reset() { for (let i = 0; i < size; i++) pool[i].alive = false },
    all: pool
  }
}

const pBullets = makePool(() => ({ alive:false, x:0, y:0, vx:0, vy:0, dmg:0, range:0, dist:0 }))
const eBullets = makePool(() => ({ alive:false, x:0, y:0, vx:0, vy:0, dmg:0 }))

function spawnBullet(pool, x, y, vx, vy, dmg, range = 300) {
  const b = pool.get()
  b.alive = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.range = range; b.dist = 0
}

function updateBullets(pool, tileBlocked, dt) {
  for (const b of pool.all) {
    if (!b.alive) continue
    b.x += b.vx * dt; b.y += b.vy * dt
    b.dist += Math.sqrt(b.vx*b.vx + b.vy*b.vy) * dt
    if (b.dist > b.range || tileBlocked(b.x, b.y)) b.alive = false
  }
}

// --- PARTICLES ---
const particles = []
function spawnParticles(x, y, color, count = 6, speed = 80) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const s = speed * 0.5 + Math.random() * speed
    particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 0.4 + Math.random()*0.3, maxLife: 0.7, color, r: 2 + Math.random()*3 })
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= dt
    if (p.life <= 0) { particles.splice(i, 1); continue }
    p.x += p.vx * dt; p.y += p.vy * dt
    p.vx *= 0.92; p.vy *= 0.92
  }
}
function renderParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI*2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// --- TILE MAP HELPERS ---
function makeTileMap(w, h) {
  const data = new Uint8Array(w * h)
  return {
    w, h, data,
    get(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return T_WALL
      return data[y * w + x]
    },
    set(x, y, t) {
      if (x < 0 || y < 0 || x >= w || y >= h) return
      data[y * w + x] = t
    },
    blocked(x, y) {
      // Water no longer blocks: it slows movement (see tileSpeedFactor) and
      // lets bullets pass through. Only walls/void stop movement & bullets.
      const t = this.get((x/TILE)|0, (y/TILE)|0)
      return t === T_WALL || t === T_VOID
    },
    isWater(x, y) {
      return this.get((x/TILE)|0, (y/TILE)|0) === T_WATER
    },
    isPortal(x, y) {
      const t = this.get((x/TILE)|0, (y/TILE)|0)
      return t === T_PORTAL_WORLD || t === T_PORTAL_RAID || t === T_PORTAL_DUNGEON
    },
    getPortalType(x, y) {
      return this.get((x/TILE)|0, (y/TILE)|0)
    }
  }
}

// --- TILE SPEED FACTOR (water + lava slow movement; ice handled via slide) ---
function tileSpeedFactor(tileMap, x, y) {
  const t = tileMap.get((x/TILE)|0, (y/TILE)|0)
  if (t === T_WATER) return 0.5
  if (t === T_LAVA)  return 0.5
  return 1
}

// --- MOVE WITH COLLISION ---
function moveWithCollision(obj, vx, vy, dt, radius, tileMap) {
  const nx = obj.x + vx * dt, ny = obj.y + vy * dt
  const r = radius - 2
  const canX = !tileMap.blocked(nx+r, obj.y) && !tileMap.blocked(nx-r, obj.y) &&
               !tileMap.blocked(nx+r, obj.y+r) && !tileMap.blocked(nx-r, obj.y+r) &&
               !tileMap.blocked(nx+r, obj.y-r) && !tileMap.blocked(nx-r, obj.y-r)
  const canY = !tileMap.blocked(obj.x, ny+r) && !tileMap.blocked(obj.x, ny-r) &&
               !tileMap.blocked(obj.x+r, ny+r) && !tileMap.blocked(obj.x-r, ny+r) &&
               !tileMap.blocked(obj.x+r, ny-r) && !tileMap.blocked(obj.x-r, ny-r)
  if (canX) obj.x = nx
  if (canY) obj.y = ny
}

// --- RENDER TILE MAP ---
function renderTileMap(tileMap, labels) {
  const offX = (canvas.width/2  - cam.x) | 0
  const offY = (canvas.height/2 - cam.y) | 0
  const startX = Math.max(0, (cam.x - canvas.width/2)  / TILE | 0)
  const endX   = Math.min(tileMap.w, startX + (canvas.width  / TILE | 0) + 2)
  const startY = Math.max(0, (cam.y - canvas.height/2) / TILE | 0)
  const endY   = Math.min(tileMap.h, startY + (canvas.height / TILE | 0) + 2)

  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      const t = tileMap.get(tx, ty)
      if (t === T_VOID) continue
      const px = tx * TILE + offX, py = ty * TILE + offY
      const alt = (tx + ty) % 2 === 0
      let color = TILE_COLORS[t] || '#111'
      if (alt && TILE_COLORS_ALT[t]) color = TILE_COLORS_ALT[t]
      // Biome floor tint (world map only) — gives each region its own palette.
      if ((t === T_FLOOR || t === T_GRASS) && tileMap.biome &&
          typeof BIOME_BY_ID !== 'undefined') {
        const b = tileMap.biome[ty * tileMap.w + tx]
        const bd = b && BIOME_BY_ID[b]
        if (bd) color = alt ? bd.floorAlt : bd.floor
      }
      ctx.fillStyle = color
      ctx.fillRect(px, py, TILE, TILE)
      if (t === T_LAVA) {
        const pulse = 0.4 + Math.sin(Date.now()/260 + tx*0.7 + ty*0.5) * 0.25
        ctx.fillStyle = `rgba(255,110,40,${pulse})`
        ctx.fillRect(px+3, py+3, TILE-6, TILE-6)
      }
      if (t === T_ICE) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(px+2, py+2, TILE-4, 4)
      }

      if (t === T_WALL) {
        ctx.fillStyle = '#333'
        ctx.fillRect(px, py, TILE, 3)
      }
      if (t === T_PORTAL_WORLD) {
        const pulse = 0.6 + Math.sin(Date.now()/400) * 0.4
        ctx.fillStyle = `rgba(40,220,100,${pulse})`
        ctx.fillRect(px+4, py+4, TILE-8, TILE-8)
        if (labels) {
          ctx.fillStyle = '#fff'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
          ctx.fillText('WORLD', px + TILE/2, py + TILE/2 + 3)
        }
      }
      if (t === T_PORTAL_RAID) {
        const pulse = 0.6 + Math.sin(Date.now()/300) * 0.4
        ctx.fillStyle = `rgba(220,40,40,${pulse})`
        ctx.fillRect(px+4, py+4, TILE-8, TILE-8)
        if (labels) {
          ctx.fillStyle = '#fff'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
          ctx.fillText('RAID', px + TILE/2, py + TILE/2 + 3)
        }
      }
      if (t === T_PORTAL_DUNGEON) {
        const pulse = 0.6 + Math.sin(Date.now()/500 + tx) * 0.4
        ctx.fillStyle = `rgba(160,40,220,${pulse})`
        ctx.fillRect(px+4, py+4, TILE-8, TILE-8)
      }
      if (t === T_STATION) {
        ctx.fillStyle = '#8888cc'
        ctx.fillRect(px+6, py+6, TILE-12, TILE-12)
      }
      if (t === T_PORTAL_VAULT) {
        const pulse = 0.6 + Math.sin(Date.now()/450) * 0.4
        ctx.fillStyle = `rgba(160,90,240,${pulse})`
        ctx.fillRect(px+4, py+4, TILE-8, TILE-8)
        if (labels) {
          ctx.fillStyle = '#fff'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
          ctx.fillText('VAULT', px + TILE/2, py + TILE/2 + 3)
        }
      }
      if (t === T_SPAWN) {
        ctx.fillStyle = '#4cc9f022'
        ctx.fillRect(px, py, TILE, TILE)
      }
    }
  }
  ctx.textAlign = 'left'

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.02)'
  ctx.lineWidth = 1
  for (let tx = startX; tx <= endX; tx++) {
    ctx.beginPath(); ctx.moveTo(tx*TILE+offX, startY*TILE+offY); ctx.lineTo(tx*TILE+offX, endY*TILE+offY); ctx.stroke()
  }
  for (let ty = startY; ty <= endY; ty++) {
    ctx.beginPath(); ctx.moveTo(startX*TILE+offX, ty*TILE+offY); ctx.lineTo(endX*TILE+offX, ty*TILE+offY); ctx.stroke()
  }
}

// --- RENDER BULLET ---
const BULLET_RADIUS = 4
const PLAYER_RADIUS = 10
const ENEMY_RADIUS  = 14

function renderBullets() {
  ctx.shadowBlur = 10
  const offX = (canvas.width/2 - cam.x) | 0
  const offY = (canvas.height/2 - cam.y) | 0
  eBullets.each(b => {
    ctx.shadowColor = '#ff6b35'; ctx.fillStyle = '#ff6b35'
    ctx.beginPath(); ctx.arc(b.x+offX, b.y+offY, BULLET_RADIUS, 0, Math.PI*2); ctx.fill()
  })
  pBullets.each(b => {
    ctx.shadowColor = '#48cae4'; ctx.fillStyle = '#48cae4'
    ctx.beginPath(); ctx.arc(b.x+offX, b.y+offY, BULLET_RADIUS-1, 0, Math.PI*2); ctx.fill()
  })
  ctx.shadowBlur = 0
}

// --- FLOATING TEXT ---
const floatTexts = []
function spawnFloatText(x, y, text, color = '#fff') {
  floatTexts.push({ x, y, text, color, life: 1.0, vy: -40 })
}
function updateFloatTexts(dt) {
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]
    f.life -= dt; f.y += f.vy * dt
    if (f.life <= 0) floatTexts.splice(i, 1)
  }
}
function renderFloatTexts() {
  const offX = (canvas.width/2 - cam.x) | 0
  const offY = (canvas.height/2 - cam.y) | 0
  ctx.font = 'bold 12px monospace'
  for (const f of floatTexts) {
    ctx.globalAlpha = f.life
    ctx.fillStyle = f.color
    ctx.textAlign = 'center'
    ctx.fillText(f.text, f.x + offX, f.y + offY)
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left'
}

// util: star difficulty string, e.g. starString(5) → "★★★★★"
function starString(n) { return '★'.repeat(Math.max(0, Math.min(10, n | 0))) }

// util: compact large numbers, e.g. 11500 → "11.5k"
function compactNum(n) {
  n = Math.round(n || 0)
  return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : '' + n
}

// util: find open floor tile near world coords
function findFloorNear(tileMap, cx, cy) {
  for (let r = 0; r < 40; r++)
    for (let a = 0; a < 16; a++) {
      const x = (cx + Math.cos(a * Math.PI / 8) * r) | 0
      const y = (cy + Math.sin(a * Math.PI / 8) * r) | 0
      if (tileMap.get(x, y) === T_FLOOR) return { x: x * TILE + TILE/2, y: y * TILE + TILE/2 }
    }
  return { x: cx * TILE, y: cy * TILE }
}
