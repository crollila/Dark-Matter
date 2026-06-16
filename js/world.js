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
  const MAX_MOBS = 18
  const WORLD_MOB_POOL = ['slime', 'forest_sprite', 'goblin_scout']

  function init(char) {
    map = buildWorld()
    mobs = []
    pendingPortals = []
    portalPrompt = null
    eLatchW = false
    lootBags = []
    eLatchLoot = false
    nearBag = null
    pBullets.reset(); eBullets.reset()
    particles.length = 0; floatTexts.length = 0
    char.x = map.spawnPos.x; char.y = map.spawnPos.y
    cam.x = char.x; cam.y = char.y
    grid = makeGrid(WORLD_W, WORLD_H)

    // Initial mob fill
    for (let i = 0; i < MAX_MOBS; i++) spawnWorldMob()
  }

  function spawnWorldMob() {
    let x, y, attempts = 0
    do {
      const a = Math.random() * Math.PI * 2
      const r = 320 + Math.random() * 240
      x = G.char.x + Math.cos(a) * r
      y = G.char.y + Math.sin(a) * r
      attempts++
    } while (map.blocked(x, y) && attempts < 20)
    const key = WORLD_MOB_POOL[Math.random() * WORLD_MOB_POOL.length | 0]
    const mob = spawnMob(key, x, y)
    if (mob) mobs.push(mob)
  }

  function update(dt, char) {
    const chatOpen = (window.Chat && Chat.isOpen())
    const inputBlocked = chatOpen || (window.Inventory && Inventory.isOpen())

    // R key → nexus (permadeath escape)
    if (keys['KeyR'] && !chatOpen) { G.enterZone('nexus'); return }

    // Player movement (water slows)
    let vx = 0, vy = 0
    const spd = char.spd
    if (!chatOpen) {
      if (keys['KeyW'] || keys['ArrowUp'])    vy = -spd
      if (keys['KeyS'] || keys['ArrowDown'])  vy =  spd
      if (keys['KeyA'] || keys['ArrowLeft'])  vx = -spd
      if (keys['KeyD'] || keys['ArrowRight']) vx =  spd
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
    }
    const wf = tileSpeedFactor(map, char.x, char.y)
    moveWithCollision(char, vx * wf, vy * wf, dt, PLAYER_RADIUS, map)
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
    if (keys['Space'] && char.abilityCooldown <= 0 && !chatOpen) {
      CLASSES[char.classKey].ability(char)
      keys['Space'] = false
    }

    // Update bullets
    updateBullets(pBullets, (x, y) => map.blocked(x, y), dt)
    updateBullets(eBullets, (x, y) => map.blocked(x, y), dt)

    // Rebuild spatial grid
    grid.clear()
    for (const e of mobs) if (e.alive) grid.add(e)

    // Update mobs
    for (let i = mobs.length - 1; i >= 0; i--) {
      const e = mobs[i]
      if (!e.alive) { mobs.splice(i, 1); continue }
      updateMob(e, dt, char, map)
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
      const dx = b.x - char.x, dy = b.y - char.y, d2 = dx*dx + dy*dy
      if (d2 < nd) { nd = d2; nearBag = b }
    }
    if (nearBag && keys['KeyE'] && !eLatchLoot && !inputBlocked) {
      const empty = pickupLootBag(char, account, nearBag)
      if (empty) { const idx = lootBags.indexOf(nearBag); if (idx >= 0) lootBags.splice(idx, 1); nearBag = null }
      if (window.saveGame) saveGame()
      eLatchLoot = true
    }
    if (!keys['KeyE']) eLatchLoot = false

    // Repop mobs
    if (mobs.filter(e => e.alive).length < MAX_MOBS) spawnWorldMob()

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
    const eDown = !!keys['KeyE']
    if (nearPortal) {
      const def = DUNGEONS[nearPortal.dungeonKey]
      portalPrompt = { key: nearPortal.dungeonKey, name: (def && def.name) || nearPortal.dungeonKey, stars: (def && def.stars) || 0 }
      // Loot pickup takes priority over portal entry when overlapping.
      if (eDown && !eLatchW && !inputBlocked && !nearBag) {
        G.enterZone('dungeon', nearPortal.dungeonKey); return
      }
    }
    eLatchW = eDown

    updateCharacter(char, dt)
    updateParticles(dt)
    updateFloatTexts(dt)
  }

  function killMob(e, char) {
    e.alive = false
    const xp = mobKillXp(e.xp, char, 0)
    char.xp += xp
    if (char.level >= LEVEL_CAP) char.glory += xp
    spawnParticles(e.x, e.y, e.color, 14)
    spawnFloatText(e.x, e.y - 20, `+${xp} XP`, '#ffd60a')

    // Small mob loot drop (tier 1–2 in open world)
    const drop = rollMobDrop(0, { source: 'world' })
    if (drop) {
      const bag = createLootBag(e.x, e.y, drop, 60)
      lootBags.push(bag)
      spawnParticles(e.x, e.y, bag.color, 10, 90)
    }

    // Portal drop — dropped portals are temporary (expire after 30s). Tracked
    // only in pendingPortals (NOT map.dungeonPortals, which are permanent).
    if (e.portalDrop && Math.random() < e.portalDrop.chance) {
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

    // [E] Enter <Dungeon> ★★ prompt (bottom-center) when near a portal
    if (portalPrompt) {
      const txt = `[E] Enter ${portalPrompt.name}${portalPrompt.stars ? '  ' + starString(portalPrompt.stars) : ''}`
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
      ctx.fillText('[E] Pick up loot', canvas.width/2, canvas.height - 100)
      ctx.textAlign = 'left'
    }

    renderHUD(char, 'WORLD', map, mobs)
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
      const sx = p.tx * TILE + TILE/2 + offX
      const sy = p.ty * TILE + offY - 6
      if (sx < -40 || sx > canvas.width + 40 || sy < -10 || sy > canvas.height + 10) continue
      const label = name + (def && def.stars ? ' ' + starString(def.stars) : '')
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - tw/2 - 4, sy - 10, tw + 8, 13)
      ctx.fillStyle = (def && def.color) || '#cc88ff'
      ctx.fillText(label, sx, sy)
    }
    ctx.textAlign = 'left'
  }

  return { init, update, render }
})()
