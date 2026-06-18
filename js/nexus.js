// ============================================================
// NEXUS — safe zone: no enemies, portals, stations
// ============================================================

const NexusZone = (() => {
  let map = null
  let promptLabel = ''
  let promptTimer = 0
  let eLatch = false
  let charBtn = null    // top-left "Characters" button rect (switch / create)

  function overlayOpen() {
    return (window.Stations && Stations.isOpen()) || (window.Wiki && Wiki.isOpen()) ||
           (window.Chat && Chat.isOpen()) || (window.Options && Options.isOpen()) ||
           (window.Inventory && Inventory.isOpen())
  }

  // Clicking the nexus "Characters" button saves and returns to the roster menu,
  // where the player can switch to another character or create a new one.
  function onClick(x, y) {
    if (overlayOpen()) return false
    if (charBtn && x >= charBtn.x && x <= charBtn.x + charBtn.w && y >= charBtn.y && y <= charBtn.y + charBtn.h) {
      // Open the character-select roster (saves + state-preserving). Uses the
      // shared G helper when present, falling back to the inline path.
      if (G.openCharacterSelect) G.openCharacterSelect()
      else { if (window.saveGame) saveGame(); G.enterZone('menu') }
      return true
    }
    return false
  }

  function init(char) {
    eLatch = false
    map = buildNexus()
    char.x = map.spawnPos.x
    char.y = map.spawnPos.y
    cam.x = char.x; cam.y = char.y
    particles.length = 0
    floatTexts.length = 0
    promptLabel = ''
  }

  function update(dt, char) {
    const stationOpen = (window.Stations && Stations.isOpen()) || (window.Wiki && Wiki.isOpen())
    const chatOpen = (window.Chat && Chat.isOpen()) || stationOpen || (window.Options && Options.isOpen())
    // Movement (water slows)
    let vx = 0, vy = 0
    const spd = char.spd
    if (!chatOpen) {
      if (Hotkeys.down('moveUp')    || keys['ArrowUp'])    vy = -spd
      if (Hotkeys.down('moveDown')  || keys['ArrowDown'])  vy =  spd
      if (Hotkeys.down('moveLeft')  || keys['ArrowLeft'])  vx = -spd
      if (Hotkeys.down('moveRight') || keys['ArrowRight']) vx =  spd
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      ;[vx, vy] = inputToWorld(vx, vy)   // screen-relative movement (rotation-aware)
    }
    const wf = tileSpeedFactor(map, char.x, char.y)
    vx *= wf; vy *= wf
    moveWithCollision(char, vx, vy, dt, PLAYER_RADIUS, map)
    camFollow(char.x, char.y, dt)

    updateParticles(dt)
    updateFloatTexts(dt)

    // Prompt timer
    if (promptTimer > 0) promptTimer -= dt

    const ik = Hotkeys.name('interact')
    const eDown = Hotkeys.down('interact') && !chatOpen
    const tx = (char.x / TILE) | 0, ty = (char.y / TILE) | 0
    const tile = map.get(tx, ty)

    // Station/portal keys: map station.key → station panel mode
    const STATION_MODE = { gamble: 'gamble', upgrade: 'reforge', destroy: 'salvage', transmute: 'fusion', vault: 'vault' }

    if (tile === T_PORTAL_WORLD) {
      promptLabel = `[${ik}] Enter World`
      promptTimer = 0.4
      if (eDown && !eLatch) { G.enterZone('world'); return }
    } else if (tile === T_PORTAL_VAULT) {
      promptLabel = `[${ik}] Enter Vault`
      promptTimer = 0.4
      if (eDown && !eLatch) { G.enterZone('vault'); return }
    } else if (tile === T_PORTAL_RAID) {
      promptLabel = '[RAID] Coming soon'
      promptTimer = 1.0
    } else if (tile === T_STATION) {
      const st = map.stations && map.stations.find(s => s.x === tx && s.y === ty)
      if (st) {
        const isWiki = st.key === 'wiki'
        const mode = STATION_MODE[st.key]
        promptLabel = (mode || isWiki) ? `[${ik}] ${st.label}` : `[${ik}] ${st.label} — Coming soon`
        promptTimer = 0.4
        if (eDown && !eLatch) {
          if (isWiki && window.Wiki) Wiki.open()
          else if (mode && window.Stations) Stations.open(mode)
        }
      }
    } else if (promptTimer <= 0) {
      promptLabel = ''
    }

    eLatch = Hotkeys.down('interact')
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    beginWorldTransform()
    renderTileMap(map, true)

    // Station labels
    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0
    if (map.stations) {
      for (const st of map.stations) {
        const sx = st.x * TILE + TILE/2 + offX
        const sy = st.y * TILE - 2 + offY
        // Upright-but-world-anchored so portal/station text rotates correctly
        // with the screen (same behavior as other rotated world labels).
        drawUpright(sx, sy, () => {
          ctx.fillStyle = '#aaa8cc'; ctx.font = '7px monospace'; ctx.textAlign = 'center'
          ctx.fillText(st.label, 0, 0)
        })
      }
    }

    // Room labels in upper box
    const labelOffX = offX, labelOffY = offY
    drawUpright(4 * TILE + TILE/2 + labelOffX, 5 * TILE + labelOffY, () => {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
      ctx.fillText('LEADERBOARD', 0, 0)
    })
    drawUpright(34 * TILE + TILE/2 + labelOffX, 5 * TILE + labelOffY, () => {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
      ctx.fillText('GUILD HALL', 0, 0)
    })
    ctx.textAlign = 'left'

    renderParticles()
    renderPlayer(char, offX, offY)
    renderFloatTexts()
    endWorldTransform()

    // Prompt
    if (promptLabel && promptTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(canvas.width/2 - 140, canvas.height - 128, 280, 32)
      ctx.fillStyle = '#e0fbfc'; ctx.font = '13px monospace'; ctx.textAlign = 'center'
      ctx.fillText(promptLabel, canvas.width/2, canvas.height - 107)
      ctx.textAlign = 'left'
    }

    renderHUD(char, 'NEXUS', map, [])

    // Top-left "Characters" button — switch character or create a new one.
    charBtn = { x: 12, y: 10, w: 168, h: 26 }
    const hov = mouse.x >= charBtn.x && mouse.x <= charBtn.x + charBtn.w && mouse.y >= charBtn.y && mouse.y <= charBtn.y + charBtn.h
    ctx.fillStyle = hov ? 'rgba(76,201,240,0.22)' : 'rgba(10,12,26,0.8)'
    ctx.strokeStyle = '#4cc9f088'; ctx.lineWidth = 1
    ctx.fillRect(charBtn.x, charBtn.y, charBtn.w, charBtn.h)
    ctx.strokeRect(charBtn.x, charBtn.y, charBtn.w, charBtn.h)
    ctx.fillStyle = '#9fe6ff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText('⮌  CHARACTERS', charBtn.x + 12, charBtn.y + charBtn.h / 2 + 1)
    ctx.textBaseline = 'alphabetic'
  }

  return { init, update, render, onClick }
})()
