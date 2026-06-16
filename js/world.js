// ============================================================
// WORLD — open world zone: roaming enemies, dungeon portals
// ============================================================

const WorldZone = (() => {
  let map = null
  let mobs = []
  let pendingPortals = []   // { x, y, dungeonKey, timer } — freshly dropped portals
  let grid = null
  let portalPrompt = null   // { key, name, stars } when standing near a portal
  let eLatchW = false       // edge latch for [E] portal entry
  let lootBags = []         // mob-drop loot bags
  let eLatchLoot = false    // edge latch for [E] loot pickup
  let nearBag = null        // closest pickupable bag (for preview)
  let currentBiome = null   // biome def the player is currently standing in (or null)
  let worldTime = 0         // seconds since this world was generated
  let respawnQueue = []     // [{ biome, at }] — scheduled biome respawns
  const WORLD_MOB_POOL = ['slime', 'forest_sprite', 'goblin_scout']
  const BIOME_SPAWN = 9     // biome mobs spawned per biome at world-gen
  const NEUTRAL_SPAWN = 12  // wandering neutral mobs scattered in open terrain
  const RESPAWN_MIN = 1, RESPAWN_MAX = 30   // seconds
  const RESPAWN_PLAYER_GAP2 = 360 * 360      // don't respawn this close to player

  function init(char) {
    map = buildWorld()
    mobs = []
    pendingPortals = []
    portalPrompt = null
    eLatchW = false
    lootBags = []
    eLatchLoot = false
    nearBag = null
    // Register this zone as the active loot sink so dropped items land here.
    window.activeLootZone = { addBag: (b) => lootBags.push(b) }
    currentBiome = null
    worldTime = 0
    respawnQueue = []
    pBullets.reset(); eBullets.reset()
    particles.length = 0; floatTexts.length = 0
    char.x = map.spawnPos.x; char.y = map.spawnPos.y
    cam.x = char.x; cam.y = char.y
    grid = makeGrid(WORLD_W, WORLD_H)

    populateWorld(char)
  }

  // Spread biome mobs throughout each biome cluster + a few neutral wanderers.
  function populateWorld(char) {
    for (const c of (map.biomeClusters || [])) {
      for (let i = 0; i < BIOME_SPAWN; i++) spawnInBiome(c.id, char, true)
    }
    for (let i = 0; i < NEUTRAL_SPAWN; i++) spawnNeutral(char, true)
  }

  // Find a valid walkable tile (world coords) inside `biomeId`, away from the
  // player on respawn. Biased to the biome's cluster for efficiency. Returns
  // null if none found (no crash — just fewer mobs).
  function findBiomeSpot(biomeId, char, initial) {
    const c = (map.biomeClusters || []).find(k => k.id === biomeId)
    const gap2 = initial ? 0 : RESPAWN_PLAYER_GAP2
    for (let attempt = 0; attempt < 70; attempt++) {
      let tx, ty
      if (c) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * c.r
        tx = (c.x + Math.cos(a) * r) | 0; ty = (c.y + Math.sin(a) * r) | 0
      } else {
        tx = (Math.random() * WORLD_W) | 0; ty = (Math.random() * WORLD_H) | 0
      }
      if ((map.biomeAt ? map.biomeAt(tx, ty) : 0) !== biomeId) continue
      const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2
      if (map.blocked(wx, wy)) continue
      if (gap2) { const dx = wx - char.x, dy = wy - char.y; if (dx * dx + dy * dy < gap2) continue }
      return { x: wx, y: wy }
    }
    return null
  }

  function spawnInBiome(biomeId, char, initial) {
    if (!biomeId) return spawnNeutral(char, initial)
    const spot = findBiomeSpot(biomeId, char, initial)
    if (!spot) return null
    const bdef = BIOME_BY_ID[biomeId]
    const pool = (bdef && bdef.mobs) || WORLD_MOB_POOL   // random of the 3 biome mobs
    const key = pool[Math.random() * pool.length | 0]
    const mob = spawnMob(key, spot.x, spot.y)
    if (mob) { mob.biome = biomeId; mob.homeX = spot.x; mob.homeY = spot.y; mobs.push(mob) }
    return mob
  }

  // Neutral wanderer in open (id 0) terrain, clear of home + player.
  function spawnNeutral(char, initial) {
    const gap2 = initial ? 0 : RESPAWN_PLAYER_GAP2
    const homeGap2 = (TILE * 12) * (TILE * 12)
    for (let attempt = 0; attempt < 70; attempt++) {
      const tx = (Math.random() * WORLD_W) | 0, ty = (Math.random() * WORLD_H) | 0
      if ((map.biomeAt ? map.biomeAt(tx, ty) : 0) !== 0) continue
      const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2
      if (map.blocked(wx, wy)) continue
      const hx = wx - map.spawnPos.x, hy = wy - map.spawnPos.y
      if (hx * hx + hy * hy < homeGap2) continue           // keep home clear
      if (gap2) { const dx = wx - char.x, dy = wy - char.y; if (dx * dx + dy * dy < gap2) continue }
      const key = WORLD_MOB_POOL[Math.random() * WORLD_MOB_POOL.length | 0]
      const mob = spawnMob(key, wx, wy)
      if (mob) { mob.biome = 0; mob.homeX = wx; mob.homeY = wy; mobs.push(mob); return mob }
    }
    return null
  }

  function update(dt, char) {
    const chatOpen = (window.Chat && Chat.isOpen()) || (window.Options && Options.isOpen())
    const inputBlocked = chatOpen || (window.Inventory && Inventory.isOpen())

    // Return to nexus (permadeath escape)
    if (Hotkeys.down('returnNexus') && !chatOpen) { G.enterZone('nexus'); return }

    // Player movement (water slows)
    let vx = 0, vy = 0
    const spd = char.spd
    if (!chatOpen) {
      if (keys['KeyW'] || keys['ArrowUp'])    vy = -spd
      if (keys['KeyS'] || keys['ArrowDown'])  vy =  spd
      if (keys['KeyA'] || keys['ArrowLeft'])  vx = -spd
      if (keys['KeyD'] || keys['ArrowRight']) vx =  spd
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      // Screen-relative: W always moves toward the top of the screen, etc.,
      // regardless of the current screen rotation.
      ;[vx, vy] = inputToWorld(vx, vy)
    }
    const curTile = map.get((char.x / TILE) | 0, (char.y / TILE) | 0)
    const wf = tileSpeedFactor(map, char.x, char.y)
    let mvx = vx * wf, mvy = vy * wf
    // Snow ice: slippery — low acceleration + retained momentum when no input.
    if (curTile === T_ICE) {
      const a = Math.min(1, dt * 2.2)
      char.iceVx = (char.iceVx || 0) + (mvx - (char.iceVx || 0)) * a
      char.iceVy = (char.iceVy || 0) + (mvy - (char.iceVy || 0)) * a
      mvx = char.iceVx; mvy = char.iceVy
    } else { char.iceVx = mvx; char.iceVy = mvy }
    moveWithCollision(char, mvx, mvy, dt, PLAYER_RADIUS, map)
    // Hell lava: damage over time (raw DoT, bypasses armor) — already slows via wf.
    if (curTile === T_LAVA && !char.godmode) {
      char.hp -= 90 * dt
      if (Math.random() < dt * 3) spawnFloatText(char.x, char.y - 22, 'lava', '#ff6b35')
      if (char.hp <= 0) { char.hp = 0; onCharacterDeath(char, account); G.enterZone('dead'); return }
    }
    // Track which biome the player is in (for the subtle name label).
    const pbid = map.biomeAt ? map.biomeAt((char.x / TILE) | 0, (char.y / TILE) | 0) : 0
    currentBiome = (pbid && BIOME_BY_ID[pbid]) || null
    camFollow(char.x, char.y, dt)

    // Shoot
    const w = equippedWeapon(char)
    if (mouse.down && char.shootTimer <= 0 && !inputBlocked) {
      const [wx, wy] = screenToWorld(mouse.x, mouse.y)
      const dx = wx - char.x, dy = wy - char.y
      const d = Math.sqrt(dx*dx + dy*dy) || 1
      spawnBullet(pBullets, char.x, char.y, dx/d * w.bspd, dy/d * w.bspd, calcDamage(char), w.range)
      char.shootTimer = w.atkSpd
    }

    // Ability
    if (Hotkeys.down('ability') && char.abilityCooldown <= 0 && !chatOpen) {
      CLASSES[char.classKey].ability(char)
      keys[Hotkeys.code('ability')] = false
    }

    // Update bullets
    updateBullets(pBullets, (x, y) => map.blocked(x, y), dt)
    updateBullets(eBullets, (x, y) => map.blocked(x, y), dt)

    // Rebuild spatial grid
    grid.clear()
    for (const e of mobs) if (e.alive) grid.add(e)

    // Update mobs
    MobDebug.reset()
    for (let i = mobs.length - 1; i >= 0; i--) {
      const e = mobs[i]
      if (!e.alive) { mobs.splice(i, 1); continue }
      updateMob(e, dt, char, map)
      // Leash: biome mobs that drift outside their home biome get steered back
      // toward their spawn tile (collision-respecting), so they don't wander off.
      if (e.biome && map.biomeAt) {
        const etx = (e.x / TILE) | 0, ety = (e.y / TILE) | 0
        if (map.biomeAt(etx, ety) !== e.biome) {
          const dx = e.homeX - e.x, dy = e.homeY - e.y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          moveWithCollision(e, dx / d * e.spd * 1.6, dy / d * e.spd * 1.6, dt, e.radius, map)
        }
      }
    }

    // Player bullets vs mobs
    const nearby = []
    pBullets.each(b => {
      nearby.length = 0
      grid.query(b.x, b.y, 60, nearby)
      for (const e of nearby) {
        if (!e.alive) continue
        const dx = b.x - e.x, dy = b.y - e.y
        if (dx*dx + dy*dy < (BULLET_RADIUS + e.radius)**2) {
          e.hp -= b.dmg; e.hitFlash = 0.08; b.alive = false
          spawnFloatText(e.x, e.y - e.radius, `-${b.dmg}`, '#ff6')
          if (e.hp <= 0) killMob(e, char)
          break
        }
      }
    })

    // Enemy bullets vs player
    eBullets.each(b => {
      const dx = b.x - char.x, dy = b.y - char.y
      if (dx*dx + dy*dy < (BULLET_RADIUS + PLAYER_RADIUS)**2) {
        const dealt = damagePlayer(char, b.dmg); b.alive = false
        spawnParticles(char.x, char.y, '#fff', 6)
        spawnFloatText(char.x, char.y - 20, `-${dealt}`, '#f44')
        if (char.hp <= 0) { char.hp = 0; onCharacterDeath(char, account); G.enterZone('dead'); return }
      }
    })

    // Mob melee contact (charger type)
    for (const e of mobs) {
      if (!e.alive) continue
      const dx = e.x - char.x, dy = e.y - char.y
      if (dx*dx + dy*dy < (e.radius + PLAYER_RADIUS)**2 && e.ai === 'charger' && e.charging) {
        char.hp -= e.dmg * dt * 2
        if (char.hp <= 0) { char.hp = 0; onCharacterDeath(char, account); G.enterZone('dead') }
      }
    }

    // Warrior ability — push nearby enemies
    if (char.abilityActive && char.classKey === 'warrior') {
      for (const e of mobs) {
        if (!e.alive) continue
        const dx = e.x - char.x, dy = e.y - char.y
        const d = Math.sqrt(dx*dx + dy*dy) || 1
        if (d < 100) { e.vx = dx/d * 400; e.vy = dy/d * 400; e.hp -= 200 }
      }
      char.abilityActive = false
    }

    // Mage ability — nova burst
    if (char.abilityActive && char.classKey === 'mage') {
      const dmg = calcDamage(char) * 3
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8
        spawnBullet(pBullets, char.x, char.y, Math.cos(a)*500, Math.sin(a)*500, dmg, 280)
      }
      char.abilityActive = false
    }

    // Archer ability — volley burst toward mouse
    if (char.abilityActive && char.classKey === 'archer') {
      const [wx, wy] = screenToWorld(mouse.x, mouse.y)
      const dx = wx - char.x, dy = wy - char.y
      const ang = Math.atan2(dy, dx)
      for (let i = -3; i <= 3; i++) {
        const a = ang + i * 0.15
        spawnBullet(pBullets, char.x, char.y, Math.cos(a)*w.bspd*1.2, Math.sin(a)*w.bspd*1.2, calcDamage(char), w.range * 1.3)
      }
      char.abilityActive = false
    }

    // ---- LOOT BAGS: lifetime, proximity, [E] pickup ----
    LootLog.update(dt)
    nearBag = null
    let nd = 55 * 55
    for (let i = lootBags.length - 1; i >= 0; i--) {
      const b = lootBags[i]
      b.life -= dt
      if (b.life <= 0) { lootBags.splice(i, 1); continue }
      if (bagIsEmpty(b)) { lootBags.splice(i, 1); continue }  // emptied by single-item pick
      const dx = b.x - char.x, dy = b.y - char.y, d2 = dx*dx + dy*dy
      if (d2 < nd) { nd = d2; nearBag = b }
    }
    if (nearBag && Hotkeys.down('interact') && !eLatchLoot && !inputBlocked) {
      const empty = pickupLootBag(char, account, nearBag)
      if (empty) { const idx = lootBags.indexOf(nearBag); if (idx >= 0) lootBags.splice(idx, 1); nearBag = null }
      if (window.saveGame) saveGame()
      eLatchLoot = true
    }
    if (!Hotkeys.down('interact')) eLatchLoot = false

    // Respawn timing — dead biome mobs come back after a random 1–30s delay,
    // somewhere valid inside the same biome (never instantly next to the player).
    worldTime += dt
    for (let i = respawnQueue.length - 1; i >= 0; i--) {
      if (worldTime >= respawnQueue[i].at) {
        const r = respawnQueue.splice(i, 1)[0]
        spawnInBiome(r.biome | 0, char, false)
      }
    }

    // Pending (dropped) portal timers — expire after 30s and restore the tile.
    for (let i = pendingPortals.length - 1; i >= 0; i--) {
      const pp = pendingPortals[i]
      pp.timer -= dt
      if (pp.timer <= 0) {
        if (map.get(pp.tx, pp.ty) === T_PORTAL_DUNGEON) map.set(pp.tx, pp.ty, T_FLOOR)
        pendingPortals.splice(i, 1)
      }
    }

    // Dungeon portal interaction — stand on/adjacent + press E
    portalPrompt = null
    const tx = (char.x / TILE) | 0, ty = (char.y / TILE) | 0
    let nearPortal = null
    for (const [ox, oy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
      const ptx = tx + ox, pty = ty + oy
      if (map.get(ptx, pty) === T_PORTAL_DUNGEON) {
        nearPortal = (map.dungeonPortals && map.dungeonPortals.find(p => p.tx === ptx && p.ty === pty))
          || pendingPortals.find(p => (p.x/TILE|0) === ptx && (p.y/TILE|0) === pty)
        if (nearPortal) break
      }
    }
    const eDown = Hotkeys.down('interact')
    if (nearPortal) {
      const def = DUNGEONS[nearPortal.dungeonKey]
      portalPrompt = { key: nearPortal.dungeonKey, name: (def && def.name) || nearPortal.dungeonKey, stars: (def && def.stars) || 0 }
      // Loot pickup takes priority over portal entry when overlapping.
      if (eDown && !eLatchW && !inputBlocked && !nearBag) {
        // Enter only valid, real dungeons. Unknown/placeholder keys (e.g. a
        // stale runtime portal) show a notice instead of crashing the zone.
        if (!def || def.placeholder) {
          spawnFloatText(char.x, char.y - 30, `${(def && def.name) || 'Dungeon'}: not yet open`, '#ffb000')
        } else {
          G.enterZone('dungeon', nearPortal.dungeonKey); return
        }
      }
    }
    eLatchW = eDown

    updateCharacter(char, dt)
    updateParticles(dt)
    updateFloatTexts(dt)
  }

  // Drop-rate tuning. Biome mobs drop common loot more often and roll their
  // portal/unique a bit higher; rates stay moderate to avoid inventory flooding.
  const BIOME_LOOT_CHANCE = 0.22
  const NEUTRAL_LOOT_CHANCE = 0.12
  const PORTAL_MULT = 2.0
  const UNIQUE_MULT = 1.5

  function killMob(e, char) {
    e.alive = false
    const isBiome = !!e.biome
    const xp = mobKillXp(e.xp, char, 0)
    char.xp += xp
    if (char.level >= LEVEL_CAP) char.glory += xp
    spawnParticles(e.x, e.y, e.color, 14)
    spawnFloatText(e.x, e.y - 20, `+${xp} XP`, '#ffd60a')

    // Schedule this biome to repopulate after a random 1–30s delay.
    if (isBiome) respawnQueue.push({ biome: e.biome, at: worldTime + RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN) })

    // Common mob loot drop (shared by all world mobs; biome mobs a bit higher).
    const drop = rollMobDrop(0, { source: 'world', chance: isBiome ? BIOME_LOOT_CHANCE : NEUTRAL_LOOT_CHANCE })
    if (drop) {
      // Common mob loot is public — first player to reach it gets it.
      const bag = createLootBag(e.x, e.y, drop, 60, { ownerId: null, visibility: 'public', source: 'mob' })
      lootBags.push(bag)
      spawnParticles(e.x, e.y, bag.color, 10, 90)
    }

    // Unique mob-only biome drop — one signature item per biome monster.
    if (e.uniqueDrop && Math.random() < e.uniqueDrop.chance * UNIQUE_MULT) {
      const it = rollItem(e.uniqueDrop.base, e.uniqueDrop.rarity || 'epic', null, e.uniqueDrop.source || 'biome')
      if (it) {
        const bag = createLootBag(e.x, e.y, { items: [it] }, 90, { ownerId: null, visibility: 'public', source: 'mob' })
        lootBags.push(bag)
        spawnFloatText(e.x, e.y - 56, 'UNIQUE!', it.color)
        spawnParticles(e.x, e.y, it.color, 16, 110)
      }
    }

    // Portal drop — dropped portals are temporary (expire after 30s). Tracked
    // only in pendingPortals (NOT map.dungeonPortals, which are permanent).
    // Biome mobs use their portalDrop.chance directly (tuned to 25%). World
    // dungeon mobs (forest_sprite/goblin_scout) keep the legacy multiplier.
    const portalChance = isBiome
      ? Math.min(0.95, (e.portalDrop ? e.portalDrop.chance : 0))
      : Math.min(0.9, (e.portalDrop ? e.portalDrop.chance : 0) * PORTAL_MULT)
    if (e.portalDrop && Math.random() < portalChance) {
      const ptx = (e.x/TILE)|0, pty = (e.y/TILE)|0
      map.set(ptx, pty, T_PORTAL_DUNGEON)
      pendingPortals.push({ x: e.x, y: e.y, tx: ptx, ty: pty, dungeonKey: e.portalDrop.type, timer: 30 })
      spawnFloatText(e.x, e.y - 40, `PORTAL!`, '#cc44ff')
      spawnParticles(e.x, e.y, '#cc44ff', 20, 120)
    }
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0a10'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    beginWorldTransform()
    renderTileMap(map, false)

    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0

    // Pending portals glow
    for (const p of pendingPortals) {
      const sx = p.x + offX, sy = p.y + offY
      const pulse = 0.5 + Math.sin(Date.now()/300) * 0.3
      ctx.fillStyle = `rgba(160,40,220,${pulse})`
      ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI*2); ctx.fill()
    }

    // Portal name + stars floating above each (fixed + pending) dungeon portal
    drawPortalLabels(offX, offY)

    // Loot bags (under bullets/mobs so beams read as ground glow)
    const tnow = Date.now()
    for (const bag of lootBags) renderLootBag(bag, offX, offY, tnow)

    renderBullets()
    for (const e of mobs) if (e.alive) renderMob(e, offX, offY)
    renderParticles()
    renderPlayer(char, offX, offY)
    renderFloatTexts()
    endWorldTransform()

    // [interact] Enter <Dungeon> ★★ prompt (bottom-center) when near a portal
    if (portalPrompt) {
      const txt = `[${Hotkeys.name('interact')}] Enter ${portalPrompt.name}${portalPrompt.stars ? '  ' + starString(portalPrompt.stars) : ''}`
      ctx.font = 'bold 14px monospace'
      const tw = ctx.measureText(txt).width
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(canvas.width/2 - tw/2 - 12, canvas.height - 120, tw + 24, 30)
      ctx.fillStyle = '#cc88ff'; ctx.textAlign = 'center'
      ctx.fillText(txt, canvas.width/2, canvas.height - 100)
      ctx.textAlign = 'left'
    }

    // Loot chest preview + [E] prompt near a bag
    if (nearBag) {
      renderLootPreview(nearBag, offX, offY)
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(canvas.width/2 - 110, canvas.height - 120, 220, 30)
      ctx.fillStyle = '#ffd60a'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'
      ctx.fillText(`[${Hotkeys.name('interact')}] Pick up loot`, canvas.width/2, canvas.height - 100)
      ctx.textAlign = 'left'
    }

    renderHUD(char, 'WORLD', map, mobs)

    // Subtle biome name under the top-center zone banner (only while in a biome).
    if (currentBiome) {
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      const t = currentBiome.name, tw = ctx.measureText(t).width
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(canvas.width / 2 - tw / 2 - 8, 34, tw + 16, 17)
      ctx.fillStyle = currentBiome.accent || '#cfe'
      ctx.fillText(t, canvas.width / 2, 46)
      ctx.textAlign = 'left'
    }

    renderLootHUD(char, account)
  }

  // Draw a small name + stars label above each dungeon portal in view
  function drawPortalLabels(offX, offY) {
    const seen = new Set()
    const list = []
    if (map.dungeonPortals) for (const p of map.dungeonPortals) list.push({ tx: p.tx, ty: p.ty, key: p.dungeonKey })
    for (const p of pendingPortals) list.push({ tx: (p.x/TILE|0), ty: (p.y/TILE|0), key: p.dungeonKey })
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
    for (const p of list) {
      const id = p.tx + ',' + p.ty
      if (seen.has(id)) continue
      seen.add(id)
      const def = DUNGEONS[p.key]
      const name = (def && def.name) || p.key
      // Anchor at the portal CENTER (pre-rotation offset coords). Cull on the
      // true rotated screen position so off-screen portals are skipped.
      const ax = p.tx * TILE + TILE/2 + offX
      const ay = p.ty * TILE + TILE/2 + offY
      const [rsx, rsy] = worldToScreen(p.tx * TILE + TILE/2, p.ty * TILE + TILE/2)
      if (rsx < -60 || rsx > canvas.width + 60 || rsy < -30 || rsy > canvas.height + 30) continue
      const label = name + (def && def.stars ? ' ' + starString(def.stars) : '')
      const tw = ctx.measureText(label).width
      // Counter-rotated, placed BELOW the portal relative to the rotated screen.
      drawUpright(ax, ay, () => {
        const ly = TILE/2 + 12   // below the portal tile, screen-down
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-tw/2 - 4, ly - 10, tw + 8, 13)
        ctx.fillStyle = (def && def.color) || '#cc88ff'
        ctx.fillText(label, 0, ly)
      })
    }
    ctx.textAlign = 'left'
  }

  return { init, update, render }
})()
