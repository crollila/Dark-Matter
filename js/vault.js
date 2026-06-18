// ============================================================
// VAULT ZONE — its own room reached via the purple portal in the
// nexus. Walk to a chest and press E to open the storage panel
// (transfer items inventory ↔ vault). Stash survives death.
// ============================================================

const VaultZone = (() => {
  let map = null
  let prompt = ''
  let eLatch = false

  function init(char) {
    map = buildVault()
    char.x = map.spawnPos.x; char.y = map.spawnPos.y
    cam.x = char.x; cam.y = char.y
    particles.length = 0; floatTexts.length = 0
    prompt = ''; eLatch = false
  }

  function update(dt, char) {
    const blocked = (window.Chat && Chat.isOpen()) || (window.Stations && Stations.isOpen()) || (window.Options && Options.isOpen())

    // Return to nexus
    if (Hotkeys.down('returnNexus') && !blocked) { G.enterZone('nexus'); return }

    let vx = 0, vy = 0
    const spd = char.spd
    if (!blocked) {
      if (Hotkeys.down('moveUp')    || keys['ArrowUp'])    vy = -spd
      if (Hotkeys.down('moveDown')  || keys['ArrowDown'])  vy =  spd
      if (Hotkeys.down('moveLeft')  || keys['ArrowLeft'])  vx = -spd
      if (Hotkeys.down('moveRight') || keys['ArrowRight']) vx =  spd
      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
      ;[vx, vy] = inputToWorld(vx, vy)   // screen-relative movement (rotation-aware)
    }
    moveWithCollision(char, vx, vy, dt, PLAYER_RADIUS, map)
    camFollow(char.x, char.y, dt)
    updateParticles(dt); updateFloatTexts(dt)

    prompt = ''
    const ik = Hotkeys.name('interact')
    const tx = (char.x / TILE) | 0, ty = (char.y / TILE) | 0
    const eDown = Hotkeys.down('interact') && !blocked

    // Return portal
    if (map.get(tx, ty) === T_PORTAL_VAULT) {
      prompt = `[${ik}] Return to Nexus`
      if (eDown && !eLatch) { G.enterZone('nexus'); return }
    } else {
      // Near a chest → open vault panel
      let near = false
      for (const c of (map.chests || [])) {
        const dx = (c.x * TILE + TILE / 2) - char.x, dy = (c.y * TILE + TILE / 2) - char.y
        if (dx * dx + dy * dy < (TILE * 1.6) ** 2) { near = true; break }
      }
      if (near) {
        prompt = `[${ik}] Open Vault`
        if (eDown && !eLatch && window.Stations) Stations.open('vault')
      }
    }
    eLatch = Hotkeys.down('interact')
  }

  function render(char) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0a0816'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    beginWorldTransform()
    renderTileMap(map, true)

    const offX = (canvas.width / 2 - cam.x) | 0
    const offY = (canvas.height / 2 - cam.y) | 0

    // Chests
    for (const c of (map.chests || [])) {
      const sx = c.x * TILE + TILE / 2 + offX, sy = c.y * TILE + TILE / 2 + offY
      ctx.fillStyle = '#7a5a2a'; ctx.fillRect(sx - 11, sy - 8, 22, 16)
      ctx.fillStyle = '#caa050'; ctx.fillRect(sx - 11, sy - 8, 22, 4)
      ctx.fillStyle = '#3a2a14'; ctx.fillRect(sx - 2, sy - 4, 4, 8)
    }

    renderParticles()
    renderPlayer(char, offX, offY)
    renderFloatTexts()
    endWorldTransform()

    if (prompt) {
      ctx.font = 'bold 14px monospace'
      const tw = ctx.measureText(prompt).width
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(canvas.width / 2 - tw / 2 - 12, canvas.height - 128, tw + 24, 30)
      ctx.fillStyle = '#cc88ff'; ctx.textAlign = 'center'
      ctx.fillText(prompt, canvas.width / 2, canvas.height - 108); ctx.textAlign = 'left'
    }

    renderHUD(char, 'VAULT', map, [])
  }

  return { init, update, render }
})()

window.VaultZone = VaultZone
