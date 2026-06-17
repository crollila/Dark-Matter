// ============================================================
// DUNGEON — instanced dungeon zone: BSP map, mob spawns, boss
// ============================================================

const DungeonZone = (() => {
  let map = null
  let mobs = []
  let grid = null
  let bossDefeated = false
  let defKey = 'goblin_warren'
  let promptLabel = ''
  let promptTimer = 0
  let lootBags = []
  let nearBags = []    // nearby accessible bags (click-to-pick previews)
  // Boss damage attribution: { [charId]: totalDamageDealtToBoss }. Single-player
  // today, but the per-player map is the seam future multiplayer plugs into.
  let bossDamage = {}

  function init(char, dungeonKey = 'goblin_warren') {
    defKey = dungeonKey
    map = buildDungeon(dungeonKey)
    // Safety: unknown dungeon key → buildDungeon returns null. Bail back to the
    // world instead of crashing on a null map.
    if (!map) { console.warn('Unknown dungeon key:', dungeonKey); G.enterZone('world'); return }
    mobs = []
    bossDefeated = false
    lootBags = []
    nearBags = []
    bossDamage = {}
    // Register this zone as the active loot sink so dropped items land here.
    window.activeLootZone = { addBag: (b) => lootBags.push(b), getBags: () => lootBags }
    pBullets.reset(); eBullets.reset()
    particles.length = 0; floatTexts.length = 0
    grid = makeGrid(map.w, map.h)

    // Place char at dungeon entrance
    char.x = map.spawnPos.x; char.y = map.spawnPos.y
    cam.x = char.x; cam.y = char.y

    // Spawn mobs from map.mobs list
    for (const ms of map.mobs) {
      const mob = spawnMob(ms.key, ms.x, ms.y)
      if (mob) mobs.push(mob)
    }
  }

  function update(dt, char) {
    const chatOpen = (window.Chat && Chat.isOpen()) || (window.Options && Options.isOpen())
    const inputBlocked = chatOpen || (window.Inventory && Inventory.isOpen())

    // Return → nexus always
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
      ;[vx, vy] = inputToWorld(vx, vy)   // screen-relative movement (rotation-aware)
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
    if (Hotkeys.down('ability') && char.abilityCooldown <= 0 && !chatOpen) {
      CLASSES[char.classKey].ability(char)
      keys[Hotkeys.code('ability')] = false
    }

    updateBullets(pBullets, (x, y) => map.blocked(x, y), dt)
    updateBullets(eBullets, (x, y) => map.blocked(x, y), dt)

    // Spatial grid rebuild
    grid.clear()
    for (const e of mobs) if (e.alive) grid.add(e)

    // Update mobs
    MobDebug.reset()
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
          e.hp -= b.dmg; e.hitFlash = 0.08; b.alive = false; e.aggro = true
          // Track per-player damage to the boss for the loot-contribution gate.
          if (e.isBoss) bossDamage[char.id] = (bossDamage[char.id] || 0) + b.dmg
          spawnFloatText(e.x, e.y - e.radius, `-${b.dmg}`, '#ff6')
          if (e.hp <= 0) {
            e.alive = false
            const stars = (DUNGEONS[defKey] && DUNGEONS[defKey].stars) || 0
            const xp = mobKillXp(e.xp, char, stars)
            char.xp += xp
            if (char.level >= LEVEL_CAP) char.glory += xp
            spawnParticles(e.x, e.y, e.color, e.isBoss ? 30 : 14)
            spawnFloatText(e.x, e.y - 30, `+${xp} XP`, '#ffd60a')
            if (e.isBoss) { bossDefeated = true; onBossKill(char, e) }
            else {
              // Small mob loot drop (bosses still drop better loot via onBossKill)
              const drop = rollMobDrop(stars, { source: defKey, matKey: DUNGEON_MATERIAL[defKey], chance: 0.12 })
              if (drop) {
                // Basic mob loot is public (first to pick gets it).
                const bag = createLootBag(e.x, e.y, drop, 90, { ownerId: null, visibility: 'public', source: 'mob' })
                lootBags.push(bag)
                spawnParticles(e.x, e.y, bag.color, 10, 90)
              }
            }
          }
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

    // Charger contact
    for (const e of mobs) {
      if (!e.alive) continue
      const dx = e.x - char.x, dy = e.y - char.y
      if (dx*dx + dy*dy < (e.radius + PLAYER_RADIUS)**2 && e.ai === 'charger' && e.charging) {
        char.hp -= e.dmg * dt * 2
        if (char.hp <= 0) { char.hp = 0; onCharacterDeath(char, account); G.enterZone('dead') }
      }
    }

    // Class abilities
    if (char.abilityActive && char.classKey === 'warrior') {
      for (const e of mobs) {
        if (!e.alive) continue
        const dx = e.x - char.x, dy = e.y - char.y
        const d = Math.sqrt(dx*dx + dy*dy) || 1
        if (d < 100) { e.vx = dx/d * 400; e.vy = dy/d * 400; e.hp -= 200 }
      }
      char.abilityActive = false
    }
    if (char.abilityActive && char.classKey === 'mage') {
      const dmg = calcDamage(char) * 3
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8
        spawnBullet(pBullets, char.x, char.y, Math.cos(a)*500, Math.sin(a)*500, dmg, 280)
      }
      char.abilityActive = false
    }
    if (char.abilityActive && char.classKey === 'archer') {
      const [wx, wy] = screenToWorld(mouse.x, mouse.y)
      const dx = wx - char.x, dy = wy - char.y
      const ang = Math.atan2(dy, dx)
      const w2 = equippedWeapon(char)
      for (let i = -3; i <= 3; i++) {
        const a = ang + i * 0.15
        spawnBullet(pBullets, char.x, char.y, Math.cos(a)*w2.bspd*1.2, Math.sin(a)*w2.bspd*1.2, calcDamage(char), w2.range * 1.3)
      }
      char.abilityActive = false
    }

    // ---- LOOT BAGS: lifetime + proximity (CLICK-TO-PICK ONLY; no hotkey) ----
    LootLog.update(dt)
    const near = []
    const previewR2 = 90 * 90
    for (let i = lootBags.length - 1; i >= 0; i--) {
      const bag = lootBags[i]
      bag.life -= dt
      if (bag.life <= 0) { lootBags.splice(i, 1); continue }
      if (bagIsEmpty(bag)) { lootBags.splice(i, 1); continue }  // emptied by single-item pick
      const dx = bag.x - char.x, dy = bag.y - char.y, d2 = dx*dx + dy*dy
      if (d2 < previewR2 && lootBagAccessible(bag, char)) near.push({ bag, d2 })
    }
    near.sort((a, c) => a.d2 - c.d2)
    nearBags = near.map(o => o.bag)

    // Prompt timer
    if (promptTimer > 0) promptTimer -= dt

    // Exit portal — press E to step back to the world (no longer instant).
    const tx = (char.x / TILE) | 0, ty = (char.y / TILE) | 0
    if (map.get(tx, ty) === T_PORTAL_DUNGEON) {
      promptLabel = `[${Hotkeys.name('interact')}] Exit dungeon — return to world`
      promptTimer = 0.3
      if (Hotkeys.down('interact') && !inputBlocked) { G.enterZone('world'); return }
    }

    updateCharacter(char, dt)
    updateParticles(dt)
    updateFloatTexts(dt)
  }

  function onBossKill(char, boss) {
    spawnFloatText(G.char.x, G.char.y - 50, 'BOSS DEFEATED!', '#ffd700')

    // Return portal under the boss body → back to the world. Spawned BEFORE the
    // loot gate so it always appears, even when loot is withheld for low boss
    // contribution. Reuses the dungeon-exit tile, so the existing [interact]
    // prompt + enter logic apply — and that logic already yields to loot pickup
    // (it only fires when the player isn't standing on a loot bag).
    if (boss && map) {
      const ptx = (boss.x / TILE) | 0, pty = (boss.y / TILE) | 0
      const ut = map.get(ptx, pty)
      if (ut !== T_WALL && ut !== T_VOID) map.set(ptx, pty, T_PORTAL_DUNGEON)
    }

    // Loot-contribution gate: a player only earns boss loot if they dealt at
    // least 2% of the boss's max HP. Single-player solo kills pass naturally;
    // the per-player bossDamage map is what multiplayer would consult per player.
    const maxHp = (boss && boss.maxHp) || 0
    const required = maxHp * 0.02
    const dealt = bossDamage[char.id] || 0
    if (maxHp > 0 && dealt < required) {
      spawnFloatText(char.x, char.y - 72, 'No loot: not enough boss contribution', '#ff7777')
      LootLog.push('No loot: not enough boss contribution', '#ff7777')
    } else {
      // Boss loot is PRIVATE to the player who earned it.
      const loot = generateBossLoot(defKey)
      const bx = (boss ? boss.x : char.x) + (Math.random() * 24 - 12)
      const by = (boss ? boss.y : char.y) + (Math.random() * 24 - 12)
      const bag = createLootBag(bx, by, loot, 120, { ownerId: char.id, visibility: 'private', source: 'boss' })
      lootBags.push(bag)
      spawnParticles(bx, by, bag.color, 24, 140)
    }

    // Dungeon completion tracking (account-side, data-driven; persisted).
    if (account.dungeonCompletions && typeof account.dungeonCompletions === 'object') {
      account.dungeonCompletions[defKey] = (account.dungeonCompletions[defKey] || 0) + 1
    }
    if (window.saveGame) saveGame()
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Dungeon bg — tinted darker than world
    const tc = map.tileColor || {}
    ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    beginWorldTransform()
    renderDungeonTiles()

    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0

    // Loot bags (drawn under bullets/mobs so beams read as ground glow)
    const tnow = Date.now()
    for (const bag of lootBags) renderLootBag(bag, offX, offY, tnow)

    renderBullets()
    for (const e of mobs) if (e.alive) renderMob(e, offX, offY)
    renderParticles()
    renderPlayer(char, offX, offY)
    renderFloatTexts()
    endWorldTransform()

    // Boss HP bar (screen-fixed top bar — drawn upright, outside the rotation)
    const boss = mobs.find(e => e.alive && e.isBoss)
    if (boss) renderBossBar(boss)

    if (promptLabel && promptTimer > 0) {
      // sits above the bottom-center HUD module (which occupies ~height-88..height-12)
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(canvas.width/2 - 140, canvas.height - 128, 280, 32)
      ctx.fillStyle = '#e0fbfc'; ctx.font = '13px monospace'; ctx.textAlign = 'center'
      ctx.fillText(promptLabel, canvas.width/2, canvas.height - 107)
      ctx.textAlign = 'left'
    }

    // Loot frames near bags — click an item row to take it (no hotkey).
    if (nearBags.length) renderLootPreviews(nearBags, offX, offY)

    const ddef = DUNGEONS[defKey]
    const dungeonName = ((ddef && ddef.name) || defKey).toUpperCase()
    const label = dungeonName + (ddef && ddef.stars ? '  ' + starString(ddef.stars) : '')
    renderHUD(char, label, map, mobs)
    renderLootHUD(char, account)
  }

  function renderDungeonTiles() {
    const tc = map.tileColor || {}
    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0
    const startX = Math.max(0, (cam.x - canvas.width/2)  / TILE | 0)
    const endX   = Math.min(map.w, startX + (canvas.width  / TILE | 0) + 2)
    const startY = Math.max(0, (cam.y - canvas.height/2) / TILE | 0)
    const endY   = Math.min(map.h, startY + (canvas.height / TILE | 0) + 2)

    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const t = map.get(tx, ty)
        if (t === T_VOID) continue
        const px = tx * TILE + offX, py = ty * TILE + offY
        const alt = (tx + ty) % 2 === 0
        let color
        if (t === T_WALL) color = alt ? tc.wall || '#1a1a2a' : (tc.accent || '#1e1e2e')
        else if (t === T_FLOOR) color = alt ? tc.floor || '#2a2a3a' : '#252535'
        else color = TILE_COLORS[t] || '#111'
        ctx.fillStyle = color
        ctx.fillRect(px, py, TILE, TILE)
        if (t === T_WALL) {
          ctx.fillStyle = 'rgba(255,255,255,0.04)'
          ctx.fillRect(px, py, TILE, 3)
        }
        if (t === T_PORTAL_DUNGEON) {
          ctx.fillStyle = '#2a2a3a'; ctx.fillRect(px, py, TILE, TILE)
          const pulse = 0.6 + Math.sin(Date.now()/500) * 0.4
          ctx.fillStyle = `rgba(100,220,120,${pulse})`
          ctx.fillRect(px+4, py+4, TILE-8, TILE-8)
          // Upright-but-world-anchored (counter-rotates with screen rotation,
          // like other rotated world labels) so "EXIT" stays readable.
          drawUpright(px + TILE/2, py + TILE/2, () => {
            ctx.fillStyle = '#fff'; ctx.font = '7px monospace'
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText('EXIT', 0, 0)
            ctx.textBaseline = 'alphabetic'
          })
          ctx.textAlign = 'left'
        }
      }
    }
  }

  function renderBossBar(boss) {
    // Width capped so the centered bar never runs under the top-right minimap
    // (~186px wide) on narrow windows.
    const bw = Math.max(160, Math.min(canvas.width * 0.5, canvas.width - 388))
    const bx = canvas.width/2 - bw/2
    const by = 44   // pushed below the top-center dungeon-name box (no overlap)
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(bx - 2, by - 2, bw + 4, 22)
    ctx.fillStyle = '#8b0000'
    ctx.fillRect(bx, by, bw, 18)
    ctx.fillStyle = '#ff4444'
    ctx.fillRect(bx, by, bw * (boss.hp / boss.maxHp), 18)
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${boss.name}  ${(boss.hp/1000).toFixed(1)}k / ${(boss.maxHp/1000).toFixed(1)}k`, canvas.width/2, by + 13)
    ctx.textAlign = 'left'
  }

  // ---- DEBUG HELPERS (no gameplay change; for manual/console verification) ----
  // Exercises the REAL boss-kill path: injects a lethal player bullet on the
  // living boss so the normal collision → death → onBossKill → loot runs on the
  // next update tick. Returns false if not in a dungeon / no boss present.
  function debugKillBoss() {
    const boss = mobs.find(e => e.alive && e.isBoss)
    if (!boss) return false
    spawnBullet(pBullets, boss.x, boss.y, 0, 0, boss.hp + 1, 9999)
    return true
  }
  // Snapshot of loot-relevant state for console assertions.
  function debugState() {
    return {
      defKey,
      mobCount: mobs.length,
      bossAlive: mobs.some(e => e.alive && e.isBoss),
      bossDefeated,
      lootBags: lootBags.map(b => ({
        x: b.x, y: b.y,
        items: b.items.length,
        materials: { ...b.materials },
        rarity: b.rarity,
        life: Math.round(b.life),
      })),
    }
  }

  return { init, update, render, debugKillBoss, debugState }
})()
