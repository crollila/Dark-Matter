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
  let nearBags = []         // nearby accessible bags (click-to-pick previews)
  let currentBiome = null   // biome def the player is currently standing in (or null)
  let worldTime = 0         // seconds since this world was generated
  let respawnQueue = []     // [{ biome, at }] — scheduled biome respawns
  // --- World bosses ---
  let worldBoss = null      // the single active world boss (cap 1), or null
  let bossProximate = false // latch: player currently within render dist of boss
  let mobKillCount = 0      // normal world-mob kills (NOT bosses/dungeon mobs)
  let bossDamage = {}       // { [charId]: damage dealt to the active world boss }
  const WORLD_BOSS_EVERY = 6     // spawn a world boss every N normal world kills
  const BOSS_BIOME_RADIUS = 22   // boss-biome paint radius (tiles)
  const WORLD_MOB_POOL = ['slime', 'forest_sprite', 'goblin_scout']
  const BIOME_SPAWN = 12    // biome mobs spawned per biome at world-gen
  const NEUTRAL_SPAWN = 300 // wandering neutral mobs scattered in open terrain (~5x density; biome/boss spawns unchanged). Offscreen cull + AI sleep keep this cheap.
  const RESPAWN_MIN = 1, RESPAWN_MAX = 30   // seconds
  const RESPAWN_PLAYER_GAP2 = 360 * 360      // don't respawn this close to player

  // --- NORTHWARD DIFFICULTY GRADIENT ---------------------------------------
  // South (home band, high y) = 0 (easy); the far North (y→0) = 1 (hard). Used
  // to scale mob stats + loot quality at spawn time, so deeper-north mobs hit
  // harder, give more XP, and drop better gear. Home/south stays gentle.
  const HOME_Y_FRAC = (typeof WORLD_HOME_Y_FRAC !== 'undefined') ? WORLD_HOME_Y_FRAC : 0.82
  function worldDifficulty(wy) {
    const ty = wy / TILE
    const homeTy = WORLD_H * HOME_Y_FRAC
    return Math.max(0, Math.min(1, (homeTy - ty) / homeTy))
  }
  // Scale a freshly spawned mob's combat stats by the difficulty at its tile and
  // stamp `_diff` on it so killMob can scale the loot roll to match.
  function applyDifficulty(mob, diff) {
    if (!mob) return mob
    mob._diff = diff
    if (diff <= 0) return mob
    mob.hp = mob.maxHp = Math.round(mob.maxHp * (1 + diff * 1.6))
    mob.dmg = Math.round(mob.dmg * (1 + diff * 1.0))
    mob.xp = Math.round(mob.xp * (1 + diff * 1.5))
    return mob
  }

  function init(char) {
    map = buildWorld()
    mobs = []
    pendingPortals = []
    portalPrompt = null
    // Theme each dungeon portal tile by the dungeon it leads to. sprites.js resolves
    // a dungeon key -> a portal spec (a theme string OR an explicit { sheet, variant }).
    // renderTileMap calls this per portal tile and passes the result straight to
    // Sprites.drawPortal (which accepts either form); unknown tiles fall back to the
    // default theme for that portal type.
    map.portalThemeAt = (tx, ty) => {
      let key = null
      if (map.dungeonPortals) { const p = map.dungeonPortals.find(p => p.tx === tx && p.ty === ty); if (p) key = p.dungeonKey }
      if (!key) { const p = pendingPortals.find(p => (p.x/TILE|0) === tx && (p.y/TILE|0) === ty); if (p) key = p.dungeonKey }
      return (key && typeof dungeonPortalSpec !== 'undefined' && dungeonPortalSpec(key)) || null
    }
    eLatchW = false
    lootBags = []
    nearBags = []
    // Register this zone as the active loot sink so dropped items land here.
    window.activeLootZone = { addBag: (b) => lootBags.push(b), getBags: () => lootBags }
    currentBiome = null
    worldTime = 0
    respawnQueue = []
    worldBoss = null
    mobKillCount = 0
    bossDamage = {}
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
    if (mob) {
      mob.biome = biomeId; mob.homeX = spot.x; mob.homeY = spot.y
      applyDifficulty(mob, worldDifficulty(spot.y))
      mobs.push(mob)
    }
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
      if (mob) {
        mob.biome = 0; mob.homeX = wx; mob.homeY = wy
        applyDifficulty(mob, worldDifficulty(wy))
        mobs.push(mob); return mob
      }
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
    _pBulletKind = char.classKey   // visual-only: tag player shots for weapon projectile sprites
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
      // Aggro/leash (incl. biome return-home) is handled inside updateMob.
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
          // Per-player damage to the active world boss (for the 2% loot gate).
          if (e.isBoss) bossDamage[char.id] = (bossDamage[char.id] || 0) + b.dmg
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

    // ---- LOOT BAGS: lifetime + proximity (CLICK-TO-PICK ONLY; no hotkey) ----
    LootLog.update(dt)
    const near = []
    const previewR2 = 90 * 90
    for (let i = lootBags.length - 1; i >= 0; i--) {
      const b = lootBags[i]
      b.life -= dt
      if (b.life <= 0) { lootBags.splice(i, 1); continue }
      if (bagIsEmpty(b)) { lootBags.splice(i, 1); continue }  // emptied by single-item pick
      const dx = b.x - char.x, dy = b.y - char.y, d2 = dx*dx + dy*dy
      if (d2 < previewR2 && lootBagAccessible(b, char)) near.push({ b, d2 })
    }
    near.sort((a, c) => a.d2 - c.d2)
    nearBags = near.map(o => o.b)

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
      // Loot is now click-only, so [interact] is free to enter the portal.
      if (eDown && !eLatchW && !inputBlocked) {
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
    // World boss death → special path (mythic + dungeon portal). Bosses do NOT
    // count toward the spawn counter and never schedule a respawn.
    if (e.isBoss) { onWorldBossKill(e, char); return }
    const isBiome = !!e.biome
    const xp = mobKillXp(e.xp, char, 0)
    char.xp += xp
    if (char.level >= LEVEL_CAP) char.glory += xp
    spawnParticles(e.x, e.y, e.color, 14)
    spawnFloatText(e.x, e.y - 20, `+${xp} XP`, '#ffd60a')

    // Schedule a 1:1 repopulation after a random 1–30s delay so the world stays
    // populated. Biome mobs respawn inside their biome; neutral (biome 0) mobs
    // respawn as wandering neutrals (spawnInBiome(0) → spawnNeutral).
    respawnQueue.push({ biome: isBiome ? e.biome : 0, at: worldTime + RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN) })

    // Common mob loot drop (shared by all world mobs; biome mobs a bit higher).
    // Northward difficulty raises both the rarity roll and the drop chance (a
    // bit), capped so inventory isn't flooded. Bosses remain the best source.
    const diff = e._diff || 0
    const baseChance = isBiome ? BIOME_LOOT_CHANCE : NEUTRAL_LOOT_CHANCE
    const drop = rollMobDrop(diff * 4, { source: 'world', chance: Math.min(0.5, baseChance * (1 + diff * 0.6)) })
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

    // World-boss spawn rule: every Nth normal world-mob kill awakens one boss
    // (capped at a single active boss at a time).
    mobKillCount++
    if (mobKillCount % WORLD_BOSS_EVERY === 0) trySpawnWorldBoss(char)
  }

  // ---- WORLD BOSSES -------------------------------------------------------
  // Paint a circular boss-biome patch (overwrites biome ids → in-world floor
  // tint + minimap tint change). Saves the overwritten ids on the boss so the
  // patch is restored on death. Visual only — terrain/collision untouched.
  function paintBossBiome(centerTx, centerTy, biomeId, boss) {
    if (!map.biome) return
    const W = map.w, H = map.h, r = BOSS_BIOME_RADIUS
    const patch = []
    for (let y = Math.max(1, centerTy - r); y <= Math.min(H - 2, centerTy + r); y++) {
      for (let x = Math.max(1, centerTx - r); x <= Math.min(W - 2, centerTx + r); x++) {
        const dx = x - centerTx, dy = y - centerTy
        if (dx * dx + dy * dy > r * r) continue
        const i = y * W + x
        patch.push({ i, prev: map.biome[i] })
        map.biome[i] = biomeId
      }
    }
    if (boss) boss._biomePatch = patch
    map._mini = null   // force the minimap to re-tint with the boss biome
  }
  function restoreBossBiome(boss) {
    if (!boss || !boss._biomePatch || !map.biome) return
    for (const p of boss._biomePatch) map.biome[p.i] = p.prev
    boss._biomePatch = null
    map._mini = null
  }

  // Find a walkable world tile away from home/player, avoiding water/lava.
  function findWorldBossSpot(char) {
    const homeGap2 = (TILE * 24) * (TILE * 24)
    const playerGap2 = (TILE * 16) * (TILE * 16)
    for (let pass = 0; pass < 2; pass++) {
      for (let attempt = 0; attempt < 120; attempt++) {
        const tx = (Math.random() * (WORLD_W - 20) + 10) | 0
        const ty = (Math.random() * (WORLD_H - 20) + 10) | 0
        const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2
        if (map.blocked(wx, wy)) continue
        const t = map.get(tx, ty)
        if (t === T_WATER || t === T_LAVA) continue
        if (pass === 0) {
          const hx = wx - map.spawnPos.x, hy = wy - map.spawnPos.y
          if (hx * hx + hy * hy < homeGap2) continue
          const dx = wx - char.x, dy = wy - char.y
          if (dx * dx + dy * dy < playerGap2) continue
        }
        return { x: wx, y: wy, tx, ty }
      }
    }
    return null   // never found a spot → caller simply skips the spawn (no crash)
  }

  // Spawn a specific world boss (cap: only one active at a time). Returns the
  // boss instance or null.
  function spawnWorldBoss(key, char) {
    if (worldBoss && worldBoss.alive) return null
    const wb = (typeof WORLD_BOSSES !== 'undefined') && WORLD_BOSSES[key]
    if (!wb) return null
    const spot = findWorldBossSpot(char)
    if (!spot) return null
    const boss = spawnMob(wb.mob, spot.x, spot.y)
    if (!boss) return null
    boss.worldBoss = true
    boss.homeX = spot.x; boss.homeY = spot.y
    // Leash radius keeps the boss inside its painted boss-biome patch (see
    // updateMob in mobs.js). Slightly inside BOSS_BIOME_RADIUS so it stays home.
    boss.leashRadius = (BOSS_BIOME_RADIUS - 1) * TILE
    boss.aggro = true
    mobs.push(boss)
    worldBoss = boss
    bossDamage = {}
    if (wb.biome) paintBossBiome(spot.tx, spot.ty, wb.biome, boss)
    // Short location/flavor hint from the boss biome name (if resolvable).
    const hint = (wb.biome && typeof BIOME_BY_ID !== 'undefined' && BIOME_BY_ID[wb.biome] && BIOME_BY_ID[wb.biome].name) || ''
    spawnFloatText(char.x, char.y - 60, 'World Boss Awakened: ' + boss.name, '#ff5db1')
    if (typeof LootLog !== 'undefined') LootLog.push('World Boss Awakened: ' + boss.name, '#ff5db1')
    // Chat-log announcement (does not require the chat input to be open).
    if (window.Chat && Chat.announce) {
      Chat.announce('World Boss Awakened: ' + boss.name + (hint ? ' — ' + hint : ''), '#ff5db1')
    }
    spawnParticles(spot.x, spot.y, boss.color, 36, 160)
    return boss
  }

  function trySpawnWorldBoss(char) {
    if (worldBoss && worldBoss.alive) return null
    const key = WORLD_BOSS_KEYS[Math.random() * WORLD_BOSS_KEYS.length | 0]
    return spawnWorldBoss(key, char)
  }

  function onWorldBossKill(boss, char) {
    const wb = (typeof WORLD_BOSSES !== 'undefined' && WORLD_BOSSES[boss.key]) || {}
    const xp = mobKillXp(boss.xp, char, 6)   // high-star-equivalent XP
    char.xp += xp
    if (char.level >= LEVEL_CAP) char.glory += xp
    spawnParticles(boss.x, boss.y, boss.color, 40, 180)
    spawnFloatText(boss.x, boss.y - 40, `+${xp} XP`, '#ffd60a')
    spawnFloatText(boss.x, boss.y - 64, 'WORLD BOSS DEFEATED!', '#ffd700')
    if (typeof LootLog !== 'undefined') LootLog.push(boss.name + ' defeated!', '#ffd700')

    // Restore the overwritten biome patch so the world stays clean.
    restoreBossBiome(boss)

    // Mythic signature drop — private to the player, gated by the 2% damage
    // threshold (solo fights pass naturally). Plus one bonus generic item.
    const maxHp = boss.maxHp || 0
    const dealt = bossDamage[char.id] || 0
    if (maxHp > 0 && dealt < maxHp * 0.02) {
      spawnFloatText(char.x, char.y - 72, 'No loot: not enough boss contribution', '#ff7777')
      if (typeof LootLog !== 'undefined') LootLog.push('No loot: not enough boss contribution', '#ff7777')
    } else {
      const items = []
      if (wb.mythic) { const m = rollItem(wb.mythic, 'mythic', null, 'world_boss'); if (m) items.push(m) }
      const extra = randomItem('world_boss', { boost: 0.6 }); if (extra) items.push(extra)
      if (items.length) {
        const bag = createLootBag(boss.x, boss.y, { items }, 180, { ownerId: char.id, visibility: 'private', source: 'boss' })
        lootBags.push(bag)
        spawnParticles(boss.x, boss.y, bag.color, 30, 160)
        if (wb.mythic) spawnFloatText(boss.x, boss.y - 88, 'MYTHIC!', '#ff3b6b')
      }
    }

    // Drop a portal to the boss's related dungeon (always, even with no loot).
    if (wb.dungeon && typeof DUNGEONS !== 'undefined' && DUNGEONS[wb.dungeon]) {
      const ptx = (boss.x / TILE) | 0, pty = (boss.y / TILE) | 0
      map.set(ptx, pty, T_PORTAL_DUNGEON)
      pendingPortals.push({ x: boss.x, y: boss.y, tx: ptx, ty: pty, dungeonKey: wb.dungeon, timer: 90 })
      spawnFloatText(boss.x, boss.y - 24, 'PORTAL!', '#cc44ff')
      spawnParticles(boss.x, boss.y, '#cc44ff', 22, 130)
    }

    worldBoss = null
    if (window.saveGame) saveGame()
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0a10'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    beginWorldTransform()
    renderTileMap(map, false)

    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0

    // (Dropped portals now render with the full portal-entity treatment via the
    // portal tile in renderTileMap — no separate flat glow circle needed.)

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

    // Loot frames near bags — click an item row to take it (no hotkey).
    if (nearBags.length) renderLootPreviews(nearBags, offX, offY)

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

    // World-boss tracker (screen-fixed): sigil + name + arrow toward the boss.
    if (worldBoss && worldBoss.alive) {
      renderBossIndicator(worldBoss)
      renderBossProximityAlert(worldBoss, char)
    } else {
      bossProximate = false
    }

    // Small progress tracker (kills toward next boss, or active boss name).
    renderBossTracker()

    renderLootHUD(char, account)
  }

  // Compact screen-fixed tracker, top-left below the return/inventory hints and
  // clear of the minimap (top-right) and chat (bottom). Shows kills toward the
  // next world boss, or the active boss name while one is alive (the directional
  // arrow indicator stays as the separate renderBossIndicator box).
  function renderBossTracker() {
    const alive = !!(worldBoss && worldBoss.alive)
    let label, col
    if (alive) {
      col = worldBoss.color || '#ff5db1'
      label = 'World Boss Alive: ' + (worldBoss.name || 'World Boss')
    } else {
      col = '#ffd60a'
      const done = mobKillCount % WORLD_BOSS_EVERY
      const left = WORLD_BOSS_EVERY - done
      label = 'World Boss: ' + done + '/' + WORLD_BOSS_EVERY + ' kills  (' + left + ' to go)'
    }
    ctx.font = 'bold 11px monospace'
    const tw = ctx.measureText(label).width
    const bx = 12, by = 70, boxW = tw + 18, boxH = 20
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, boxW, boxH)
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(bx, by, boxW, boxH)
    ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 9, by + boxH / 2)
    ctx.textBaseline = 'alphabetic'
  }

  // Clean screen-fixed proximity banner: shown only while the player is within
  // render distance of the active world boss (a single steady banner, not a
  // per-frame notification). Announces once via chat on entering range. Keeps
  // the existing minimap/tracker/arrow indicators untouched.
  function renderBossProximityAlert(boss, char) {
    if (!boss || !char) return
    const rd = (window.Settings && Settings.renderDistance) || 1500
    const dist = Math.hypot(boss.x - char.x, boss.y - char.y)
    if (dist > rd) { bossProximate = false; return }
    if (!bossProximate) {
      bossProximate = true
      if (window.Chat && Chat.announce) Chat.announce('⚠ World Boss nearby: ' + (boss.name || 'World Boss'), boss.color || '#ff5db1')
    }
    const name = boss.name || 'World Boss'
    const col = boss.color || '#ff5db1'
    const boxW = 280, boxH = 46
    const bx = ((canvas.width - boxW) / 2) | 0, by = 84
    ctx.fillStyle = 'rgba(20,0,12,0.82)'; ctx.fillRect(bx, by, boxW, boxH)
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(bx, by, boxW, boxH)
    ctx.fillStyle = col; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText('⚠ BOSS NEARBY — ' + name, bx + boxW / 2, by + 16)
    // HP bar (when the boss exposes hp/maxHp)
    if (boss.maxHp) {
      const frac = Math.max(0, Math.min(1, (boss.hp || 0) / boss.maxHp))
      const barX = bx + 12, barY = by + 24, barW = boxW - 24, barH = 13
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, barY, barW, barH)
      ctx.fillStyle = col; ctx.fillRect(barX, barY, barW * frac, barH)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, barH)
      ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(Math.ceil(boss.hp || 0) + ' / ' + boss.maxHp, bx + boxW / 2, barY + barH / 2)
      ctx.textBaseline = 'alphabetic'
    }
    ctx.textAlign = 'left'
  }

  // Small screen-fixed indicator pointing at the active world boss. Uses
  // worldToScreen (which already applies the screen rotation) so the arrow points
  // correctly at any rotation. Shows a dot ("nearby") when the boss is on-screen.
  function renderBossIndicator(boss) {
    const cw = canvas.width, ch = canvas.height
    const [bsx, bsy] = worldToScreen(boss.x, boss.y)
    const onScreen = bsx >= 0 && bsx <= cw && bsy >= 0 && bsy <= ch
    const col = boss.color || '#ff5db1'
    const name = boss.name || 'World Boss'
    ctx.font = 'bold 11px monospace'
    const tw = ctx.measureText(name).width
    const boxW = tw + 40, boxH = 24
    const bx = ((cw - boxW) / 2) | 0, by = 56
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(bx, by, boxW, boxH)
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(bx, by, boxW, boxH)
    const my = by + boxH / 2
    // Name (the old static left spire/sigil marker was removed — it was a dead,
    // non-rotation-aware indicator; only the rotation-correct arrow remains).
    ctx.fillStyle = '#ffd7ec'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(name, bx + 12, my)
    ctx.textBaseline = 'alphabetic'
    // Arrow toward boss, or a "nearby" dot when on-screen
    const ax = bx + boxW - 14, ay = by + boxH / 2
    if (onScreen) {
      ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill()
    } else {
      const ang = Math.atan2(bsy - ch / 2, bsx - cw / 2)
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang)
      ctx.fillStyle = col
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
    ctx.textAlign = 'left'
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

  return {
    init, update, render,
    // Debug/console hooks (used by chat /spawnboss and /worldboss).
    debugSpawnBoss: (key) => spawnWorldBoss(key, G.char),
    debugWorldBoss: () => ({
      killCount: mobKillCount,
      every: WORLD_BOSS_EVERY,
      alive: !!(worldBoss && worldBoss.alive),
      name: worldBoss && worldBoss.name,
      keys: WORLD_BOSS_KEYS,
    }),
  }
})()
window.WorldZone = WorldZone
