// ============================================================
// NEXUS — safe zone: no enemies, portals, stations
// ============================================================

const NexusZone = (() => {
  let map = null
  let promptLabel = ''
  let promptTimer = 0
  let eLatch = false

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
    const stationOpen = (window.Stations && Stations.isOpen())
    const chatOpen = (window.Chat && Chat.isOpen()) || stationOpen || (window.Options && Options.isOpen())
    // Movement (water slows)
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
    vx *= wf; vy *= wf
    moveWithCollision(char, vx, vy, dt, PLAYER_RADIUS, map)
    camFollow(char.x, char.y, dt)

    updateParticles(dt)
    updateFloatTexts(dt)

    // Prompt timer
    if (promptTimer > 0) promptTimer -= dt

    const eDown = !!keys['KeyE'] && !chatOpen
    const tx = (char.x / TILE) | 0, ty = (char.y / TILE) | 0
    const tile = map.get(tx, ty)

    // Station/portal keys: map station.key → station panel mode
    const STATION_MODE = { gamble: 'gamble', upgrade: 'reforge', destroy: 'salvage', transmute: 'fusion', vault: 'vault' }

    if (tile === T_PORTAL_WORLD) {
      promptLabel = '[E] Enter World'
      promptTimer = 0.4
      if (eDown && !eLatch) { G.enterZone('world'); return }
    } else if (tile === T_PORTAL_VAULT) {
      promptLabel = '[E] Enter Vault'
      promptTimer = 0.4
      if (eDown && !eLatch) { G.enterZone('vault'); return }
    } else if (tile === T_PORTAL_RAID) {
      promptLabel = '[RAID] Coming soon'
      promptTimer = 1.0
    } else if (tile === T_STATION) {
      const st = map.stations && map.stations.find(s => s.x === tx && s.y === ty)
      if (st) {
        const mode = STATION_MODE[st.key]
        promptLabel = mode ? `[E] ${st.label}` : `[E] ${st.label} — Coming soon`
        promptTimer = 0.4
        if (eDown && !eLatch && mode && window.Stations) Stations.open(mode)
      }
    } else if (promptTimer <= 0) {
      promptLabel = ''
    }

    eLatch = !!keys['KeyE']
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    renderTileMap(map, true)

    // Station labels
    const offX = (canvas.width/2 - cam.x) | 0
    const offY = (canvas.height/2 - cam.y) | 0
    if (map.stations) {
      for (const st of map.stations) {
        const sx = st.x * TILE + TILE/2 + offX
        const sy = st.y * TILE - 2 + offY
        ctx.fillStyle = '#aaa8cc'
        ctx.font = '7px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(st.label, sx, sy)
      }
    }

    // Room labels in upper box
    const labelOffX = offX, labelOffY = offY
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'
    ctx.fillText('LEADERBOARD', 4 * TILE + TILE/2 + labelOffX, 5 * TILE + labelOffY)
    ctx.fillText('GUILD HALL',  34 * TILE + TILE/2 + labelOffX, 5 * TILE + labelOffY)
    ctx.textAlign = 'left'

    renderParticles()
    renderPlayer(char, offX, offY)
    renderFloatTexts()

    // Prompt
    if (promptLabel && promptTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillRect(canvas.width/2 - 140, canvas.height - 128, 280, 32)
      ctx.fillStyle = '#e0fbfc'; ctx.font = '13px monospace'; ctx.textAlign = 'center'
      ctx.fillText(promptLabel, canvas.width/2, canvas.height - 107)
      ctx.textAlign = 'left'
    }

    renderHUD(char, 'NEXUS', map, [])
  }

  return { init, update, render }
})()
