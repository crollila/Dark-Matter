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
// --- SCREEN ROTATION ---
// Hold Q/E rotates the view (value stored in Settings.screenRotation, degrees).
// World drawing is wrapped in begin/endWorldTransform so the whole scene rotates
// about screen center while the HUD (drawn outside) stays upright. Mouse aim is
// converted back through the inverse rotation in screenToWorld, so shooting and
// the facing indicator stay correct at any angle.
function screenRotationRad() {
  return (typeof Settings !== 'undefined' && Settings.screenRotation)
    ? Settings.screenRotation * Math.PI / 180 : 0
}
// --- WORLD ZOOM ---
// In-game camera zoom (world px → screen px multiplier) applied about screen
// center alongside the rotation. Default DEFAULT_ZOOM makes the character fill
// the view without needing browser zoom. Player-tunable via Options → Settings.zoom
// and persisted there. HUD is drawn OUTSIDE the world transform so it is unscaled.
const DEFAULT_ZOOM = 1.85
function worldZoom() {
  const z = (typeof Settings !== 'undefined' && Settings.zoom) ? Settings.zoom : DEFAULT_ZOOM
  return (z > 0.2 && z < 8) ? z : DEFAULT_ZOOM
}
let _worldXf = false
function beginWorldTransform() {
  const a = screenRotationRad()
  const z = worldZoom()
  if (!a && z === 1) { _worldXf = false; return }
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  if (z !== 1) ctx.scale(z, z)
  if (a) ctx.rotate(a)
  ctx.translate(-canvas.width / 2, -canvas.height / 2)
  _worldXf = true
}
function endWorldTransform() {
  if (_worldXf) { ctx.restore(); _worldXf = false }
}

function worldToScreen(wx, wy) {
  let dx = wx - cam.x, dy = wy - cam.y
  const a = screenRotationRad()
  if (a) {
    const c = Math.cos(a), s = Math.sin(a)
    const rx = dx * c - dy * s, ry = dx * s + dy * c
    dx = rx; dy = ry
  }
  const z = worldZoom()
  return [dx * z + canvas.width/2, dy * z + canvas.height/2]
}
function screenToWorld(sx, sy) {
  const z = worldZoom()
  let dx = (sx - canvas.width/2) / z, dy = (sy - canvas.height/2) / z
  const a = screenRotationRad()
  if (a) {
    const c = Math.cos(-a), s = Math.sin(-a)
    const rx = dx * c - dy * s, ry = dx * s + dy * c
    dx = rx; dy = ry
  }
  return [dx + cam.x, dy + cam.y]
}

// Convert a SCREEN-relative input vector (e.g. W = (0,-1) "up on screen") into a
// WORLD-space velocity, so WASD/arrow movement is always screen-relative at any
// rotation. Inverse of the world rotation: worldDir = R(-a) · screenDir.
function inputToWorld(vx, vy) {
  const a = screenRotationRad()
  if (!a) return [vx, vy]
  const c = Math.cos(a), s = Math.sin(a)
  return [vx * c + vy * s, -vx * s + vy * c]
}

// Draw `fn()` at its local origin upright on screen while POSITIONED at the
// already-offset world anchor (ax,ay). Cancels the active world rotation so the
// content stays screen-upright (text/bars/bag) but still tracks the world point.
// Must be called inside begin/endWorldTransform. Local +y = screen-down.
function drawUpright(ax, ay, fn) {
  const a = screenRotationRad()
  ctx.save()
  ctx.translate(ax, ay)
  if (a) ctx.rotate(-a)
  fn()
  ctx.restore()
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
const T_ICE  = 11  // snow biome — slippery floor (no block, NO slow, momentum slide)
const T_LAVA = 12  // hell biome — damages + slows (no block)
const T_POISON = 13  // plague biome — damage over time, does NOT slow (no block)

// Default portal sprite theme by tile type (sprites.js). Used when a zone does
// not provide a per-tile resolver (tileMap.portalThemeAt). World portals read as
// green/nature, raid as fire, vault as arcane, generic dungeon as plain magic.
const PORTAL_TILE_THEME = {
  [T_PORTAL_WORLD]:   'forest',
  [T_PORTAL_RAID]:    'infernal',
  [T_PORTAL_DUNGEON]: 'magic',
  [T_PORTAL_VAULT]:   'arcane'
}

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
  [T_POISON]: '#3a5a18',
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

const pBullets = makePool(() => ({ alive:false, x:0, y:0, vx:0, vy:0, dmg:0, range:0, dist:0, kind:null }))
const eBullets = makePool(() => ({ alive:false, x:0, y:0, vx:0, vy:0, dmg:0, kind:null }))

// VISUAL-ONLY shot tags. The firer sets these just before spawning so renderBullets
// can pick a projectile sprite without changing spawnBullet's signature or any
// bullet gameplay (speed/damage/hitbox/lifetime/collision are untouched):
//   _pBulletKind = player class (set in world.js/dungeon.js before shooting)
//   _eBulletKind = mob/boss e.key (set in mobs.js before each mob's AI runs)
var _pBulletKind = null
var _eBulletKind = null

function spawnBullet(pool, x, y, vx, vy, dmg, range = 300) {
  const b = pool.get()
  b.alive = true; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.range = range; b.dist = 0
  // Stamp a visual-only kind based on which pool fired it (no gameplay effect).
  b.kind = (pool === pBullets) ? _pBulletKind : (pool === eBullets) ? _eBulletKind : null
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
  // When the view is rotated, the visible region is the rotated viewport, whose
  // corners reach up to half the screen diagonal from center. Pad the tile draw
  // span out to that radius so rotated corners are filled (no black wedges).
  // World zoom shrinks the visible world extent (smaller span = fewer tiles when
  // zoomed in). Divide the screen half-extents by zoom to cover exactly what's
  // visible plus a small pad.
  const z = worldZoom()
  const reach = screenRotationRad()
    ? Math.sqrt(canvas.width*canvas.width + canvas.height*canvas.height) / 2 / z : 0
  // Tile render radius (Options, in tiles → world px): cap how far out tiles are
  // drawn so a huge/zoomed-out view doesn't paint thousands of tiles. Visual
  // only — collision/gameplay/minimap read the full map and are unaffected.
  const maxR = ((typeof Settings !== 'undefined' && Settings.tileRenderRadius) || 60) * TILE
  const spanX = Math.min(canvas.width/2/z + reach, maxR)
  const spanY = Math.min(canvas.height/2/z + reach, maxR)
  const startX = Math.max(0, ((cam.x - spanX) / TILE) | 0)
  const endX   = Math.min(tileMap.w, (((cam.x + spanX) / TILE) | 0) + 2)
  const startY = Math.max(0, ((cam.y - spanY) / TILE) | 0)
  const endY   = Math.min(tileMap.h, (((cam.y + spanY) / TILE) | 0) + 2)
  // Circular cull: skip tiles whose center is beyond the radius (+1 tile pad so
  // edge tiles aren't clipped). Cheaper than the square span when zoomed out.
  const cullR2 = (maxR + TILE) * (maxR + TILE)
  const portalDraws = []   // portal tiles, rendered in a 2nd pass (entity treatment)

  for (let ty = startY; ty < endY; ty++) {
    for (let tx = startX; tx < endX; tx++) {
      const t = tileMap.get(tx, ty)
      if (t === T_VOID) continue
      const cdx = tx * TILE + TILE/2 - cam.x, cdy = ty * TILE + TILE/2 - cam.y
      if (cdx*cdx + cdy*cdy > cullR2) continue
      const px = tx * TILE + offX, py = ty * TILE + offY
      const alt = (tx + ty) % 2 === 0
      const isPortal = (t === T_PORTAL_WORLD || t === T_PORTAL_RAID || t === T_PORTAL_DUNGEON || t === T_PORTAL_VAULT)
      let color = TILE_COLORS[t] || '#111'
      if (alt && TILE_COLORS_ALT[t]) color = TILE_COLORS_ALT[t]
      // Walls are VISUALLY SUPPRESSED — paint them as floor (collision still blocks).
      if (t === T_WALL) {
        color = (alt && TILE_COLORS_ALT[T_FLOOR]) ? TILE_COLORS_ALT[T_FLOOR] : TILE_COLORS[T_FLOOR]
      }
      // Portals are world entities, not bright tiles — paint the ground beneath them
      // as the surrounding terrain (grass on the world, floor elsewhere) so no
      // saturated square backing shows behind the portal art.
      if (isPortal) {
        const base = tileMap.biome ? T_GRASS : T_FLOOR
        color = (alt && TILE_COLORS_ALT[base]) ? TILE_COLORS_ALT[base] : TILE_COLORS[base]
      }
      // Biome floor tint (world map only) — gives each region its own palette.
      // Walls included so suppressed walls blend into the surrounding biome floor.
      if ((t === T_FLOOR || t === T_GRASS || t === T_WALL || isPortal) && tileMap.biome &&
          typeof BIOME_BY_ID !== 'undefined') {
        const b = tileMap.biome[ty * tileMap.w + tx]
        const bd = b && BIOME_BY_ID[b]
        if (bd) color = alt ? bd.floorAlt : bd.floor
      }
      ctx.fillStyle = color
      ctx.fillRect(px, py, TILE, TILE)
      // --- Environment sprite layer (VISUAL ONLY) -------------------------------
      // Paints floors/walls/hazards/liquids (+ sparse decor) from the themed env
      // sheets over the flat fill above. If a sheet is unmapped/unloaded the draw
      // returns false and the flat color stays — collision/generation/hazards are
      // unaffected. Theme = per-tile world biome, or the map's envTheme elsewhere.
      // Variant/decor selection is deterministic per tile (no flicker).
      // Step B: ONE terrain tile (by map tile kind). Step C: ONE sparse object on
      // walkable floor only. Nexus/safe maps opt out via tileMap.disableEnvSprites.
      let drewEnv = false
      if (typeof ENV_SPRITES_ENABLED !== 'undefined' && ENV_SPRITES_ENABLED &&
          typeof Sprites !== 'undefined' && Sprites.drawEnvTile && !tileMap.disableEnvSprites &&
          !isPortal && t !== T_STATION && t !== T_SPAWN) {
        const biomeId = tileMap.biome ? tileMap.biome[ty * tileMap.w + tx] : 0
        const theme = tileMap.biome ? Sprites.envThemeForBiome(biomeId)
                                    : (tileMap.envTheme || 'neutral')
        let role = null
        const isFloor = (t === T_FLOOR || t === T_GRASS)
        if (isFloor) {
          const hv = Sprites.envHash(tx, ty, 1)
          role = (hv % 23 === 0) ? 'path' : (hv % 6 === 0) ? 'floorAlt' : 'floor'
        } else if (t === T_WALL) {
          role = (Sprites.envHash(tx, ty, 2) % 9 === 0) ? 'wallAlt' : 'wall'
        } else if (t === T_LAVA || t === T_ICE) { role = 'hazard' }
        else if (t === T_WATER) { role = 'water' }
        if (role) {
          // +1px terrain oversize reduces hard black gaps between transparent edges.
          drewEnv = Sprites.drawEnvTile(theme, role, px + TILE/2, py + TILE/2, TILE + 1, ctx, Sprites.envHash(tx, ty, 3))
          if (drewEnv && isFloor) {
            Sprites.drawEnvObject(theme, tx, ty, px + TILE/2, py + TILE/2, TILE, ctx)
          }
        }
      }
      // --- Simple 32x32 terrain tile layer (ACTIVE env renderer) ---------------
      // Draws one whole-tile PNG per map cell (floor/path/wall/hazard/water) over the
      // flat fill. Unmapped/unloaded tiles return false → the flat color stays. No
      // object/decor pass. Theme = per-tile world biome, else the map's envTheme.
      if (!drewEnv && typeof SIMPLE_ENV_TILES_ENABLED !== 'undefined' && SIMPLE_ENV_TILES_ENABLED &&
          typeof Sprites !== 'undefined' && Sprites.drawSimpleTile && !tileMap.disableEnvSprites &&
          !isPortal && t !== T_STATION && t !== T_SPAWN) {
        const biomeId = tileMap.biome ? tileMap.biome[ty * tileMap.w + tx] : 0
        const theme = tileMap.biome ? Sprites.simpleThemeForBiome(biomeId)
                                    : (tileMap.envTheme || 'neutral')
        let role = null
        // Walls render as FLOOR now (visually suppressed); collision still blocks them.
        const isFloor = (t === T_FLOOR || t === T_GRASS || t === T_WALL)
        if (isFloor) {
          const hv = Sprites.envHash(tx, ty, 1)
          role = (hv % 29 === 0) ? 'specialFloor' : (hv % 23 === 0) ? 'path' : (hv % 7 === 0) ? 'floorAlt' : 'floor'
        } else if (t === T_LAVA || t === T_ICE || t === T_POISON) { role = 'hazard' }
        else if (t === T_WATER) { role = 'water' }
        if (role) {
          drewEnv = Sprites.drawSimpleTile(theme, role, px + TILE/2, py + TILE/2, TILE + 1, ctx, Sprites.envHash(tx, ty, 3))
        }
      }
      if (t === T_LAVA && !drewEnv) {
        const pulse = 0.4 + Math.sin(Date.now()/260 + tx*0.7 + ty*0.5) * 0.25
        ctx.fillStyle = `rgba(255,110,40,${pulse})`
        ctx.fillRect(px+3, py+3, TILE-6, TILE-6)
      }
      if (t === T_POISON && !drewEnv) {
        const pulse = 0.3 + Math.sin(Date.now()/360 + tx*0.6 + ty*0.4) * 0.18
        ctx.fillStyle = `rgba(120,210,60,${pulse})`
        ctx.fillRect(px+3, py+3, TILE-6, TILE-6)
      }
      if (t === T_ICE && !drewEnv) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(px+2, py+2, TILE-4, 4)
      }
      // (Wall stripe overlay removed — walls are now visually suppressed.)
      // Portal tiles: defer to a second pass (after all base tiles) so the soft
      // aura isn't clipped by neighbouring tiles painted later in this loop.
      if (isPortal) {
        portalDraws.push({ t, tx, ty, px, py })
      }
      if (t === T_STATION) {
        ctx.fillStyle = '#8888cc'
        ctx.fillRect(px+6, py+6, TILE-12, TILE-12)
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

  // --- Portal entity pass (after all base tiles + grid so the aura isn't clipped).
  // Each portal draws as a living world object (bob/glow/pulse/shadow) via
  // drawPortalEntity, counter-rotated through drawUpright so glow + shadow + art stay
  // screen-coherent under rotation (like loot bags). Falls back to the pulsing-rect
  // glow if the portal sheet isn't loaded.
  for (const p of portalDraws) {
    const theme = (tileMap.portalThemeAt && tileMap.portalThemeAt(p.tx, p.ty)) || PORTAL_TILE_THEME[p.t]
    let drew = false
    if (typeof Sprites !== 'undefined' && Sprites.drawPortalEntity) {
      drawUpright(p.px + TILE/2, p.py + TILE/2, () => {
        drew = Sprites.drawPortalEntity(theme, 0, 0, TILE + 8, ctx, p.tx * 7 + p.ty * 13)
      })
    }
    if (!drew) {
      const speed = p.t === T_PORTAL_RAID ? 300 : p.t === T_PORTAL_VAULT ? 450 : p.t === T_PORTAL_DUNGEON ? 500 : 400
      const phase = p.t === T_PORTAL_DUNGEON ? p.tx : 0
      const pulse = 0.6 + Math.sin(Date.now()/speed + phase) * 0.4
      ctx.fillStyle = p.t === T_PORTAL_WORLD ? `rgba(40,220,100,${pulse})`
        : p.t === T_PORTAL_RAID ? `rgba(220,40,40,${pulse})`
        : p.t === T_PORTAL_VAULT ? `rgba(160,90,240,${pulse})`
        : `rgba(160,40,220,${pulse})`
      // Circular fallback (no art): a pulsing glowing disc, not a square tile.
      ctx.beginPath(); ctx.arc(p.px + TILE/2, p.py + TILE/2, TILE/2 - 3, 0, Math.PI*2); ctx.fill()
    }
    if (labels && p.t !== T_PORTAL_DUNGEON) {
      ctx.fillStyle = '#fff'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
      ctx.fillText(p.t === T_PORTAL_WORLD ? 'WORLD' : p.t === T_PORTAL_RAID ? 'RAID' : 'VAULT', p.px + TILE/2, p.py + TILE/2 + 3)
      ctx.textAlign = 'left'
    }
  }
}

// --- RENDER BULLET ---
const BULLET_RADIUS = 4
const PLAYER_RADIUS = 10
const ENEMY_RADIUS  = 14

// Projectile sprite draw sizes (px, on-screen). Visual only — bullet hitboxes
// stay BULLET_RADIUS. Sprites are drawn centered on the bullet position and
// rotated to travel direction; if no sprite is mapped/loaded we fall back to the
// original glowing circle (unchanged look/colors).
const PROJ_SPRITE_SIZE_P = 22   // player weapon shots
const PROJ_SPRITE_SIZE_E = 26   // boss/enemy shots

function renderBullets() {
  const offX = (canvas.width/2 - cam.x) | 0
  const offY = (canvas.height/2 - cam.y) | 0
  const S = (typeof Sprites !== 'undefined') ? Sprites : null
  eBullets.each(b => {
    const sx = b.x+offX, sy = b.y+offY
    // Dark rim outline so shots read against busy biome tiles. The shadow halo
    // hugs the sprite silhouette (sprite path) / circle edge (fallback path).
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4
    if (S && S.drawBossProjectile(b.kind, sx, sy, Math.atan2(b.vy, b.vx), PROJ_SPRITE_SIZE_E)) { ctx.shadowBlur = 0; return }
    ctx.fillStyle = '#ff6b35'
    ctx.beginPath(); ctx.arc(sx, sy, BULLET_RADIUS, 0, Math.PI*2); ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.stroke()
  })
  pBullets.each(b => {
    const sx = b.x+offX, sy = b.y+offY
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4
    if (S && S.drawWeaponProjectile(b.kind, sx, sy, Math.atan2(b.vy, b.vx), PROJ_SPRITE_SIZE_P)) { ctx.shadowBlur = 0; return }
    ctx.fillStyle = '#48cae4'
    ctx.beginPath(); ctx.arc(sx, sy, BULLET_RADIUS-1, 0, Math.PI*2); ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.stroke()
  })
}

// --- FLOATING TEXT ---
const floatTexts = []
function spawnFloatText(x, y, text, color = '#fff') {
  // vx/vy are SCREEN-relative drift (screen-up). Motion is converted to world
  // space per-frame so the number rises UP ON SCREEN at any rotation.
  floatTexts.push({ x, y, text, color, life: 1.0, vx: 0, vy: -40 })
}
function updateFloatTexts(dt) {
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]
    f.life -= dt
    // Drift "up on screen": convert the screen-relative velocity into a world
    // velocity (the float anchor lives in world space and is drawn through the
    // rotating world transform). Without this, world-up ≠ screen-up when the
    // view is rotated and numbers slide off at an angle. renderFloatTexts still
    // counter-rotates so the glyphs stay upright.
    let vx = f.vx || 0, vy = f.vy || 0
    if (typeof inputToWorld === 'function') { const w = inputToWorld(vx, vy); vx = w[0]; vy = w[1] }
    f.x += vx * dt; f.y += vy * dt
    if (f.life <= 0) floatTexts.splice(i, 1)
  }
}
function renderFloatTexts() {
  const offX = (canvas.width/2 - cam.x) | 0
  const offY = (canvas.height/2 - cam.y) | 0
  ctx.font = 'bold 12px monospace'
  for (const f of floatTexts) {
    // Counter-rotate so damage/loot numbers stay upright while tracking the
    // rotated world position they were spawned at.
    drawUpright(f.x + offX, f.y + offY, () => {
      ctx.globalAlpha = f.life
      ctx.fillStyle = f.color
      ctx.textAlign = 'center'
      ctx.fillText(f.text, 0, 0)
    })
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
