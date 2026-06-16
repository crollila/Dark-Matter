// ============================================================
// UI — main menu, class select, HUD, player render, death screen
// ============================================================

// ---- MAIN MENU ----
const MainMenu = (() => {
  let hoverChar = -1
  let hoverNew = false
  let clickNew = false

  function update() {
    // Click detection handled in render via main.js mousedown passthrough
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Background
    ctx.fillStyle = '#080810'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Subtle grid bg
    ctx.strokeStyle = 'rgba(80,80,180,0.07)'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke() }
    for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke() }

    // Title
    ctx.textAlign = 'center'
    ctx.shadowBlur = 24; ctx.shadowColor = '#4cc9f0'
    ctx.fillStyle = '#e0fbfc'
    ctx.font = 'bold 52px monospace'
    ctx.fillText('REALM', canvas.width/2, 80)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#4cc9f088'
    ctx.font = '14px monospace'
    ctx.fillText('A BULLET HELL RPG', canvas.width/2, 108)

    // Account glory
    ctx.fillStyle = '#ffd60a'
    ctx.font = '13px monospace'
    ctx.fillText(`Account Glory: ${account.glory.toLocaleString()}`, canvas.width/2, 134)
    ctx.textAlign = 'left'

    // Character list panel
    const panelW = 320, panelH = Math.max(360, account.characters.length * 80 + 120)
    const panelX = canvas.width/2 - panelW/2
    const panelY = 160

    ctx.fillStyle = 'rgba(10,10,30,0.85)'
    ctx.strokeStyle = '#4cc9f044'
    ctx.lineWidth = 1
    ctx.fillRect(panelX, panelY, panelW, panelH)
    ctx.strokeRect(panelX, panelY, panelW, panelH)

    ctx.fillStyle = '#e0fbfc88'
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SELECT CHARACTER', canvas.width/2, panelY + 22)

    hoverChar = -1
    hoverNew = false

    if (account.characters.length === 0) {
      ctx.fillStyle = '#555'
      ctx.font = '12px monospace'
      ctx.fillText('No characters yet.', canvas.width/2, panelY + 80)
    }

    // Character slots
    for (let i = 0; i < account.characters.length; i++) {
      const c = account.characters[i]
      const cls = CLASSES[c.classKey]
      const cy = panelY + 40 + i * 76
      const isHover = mouse.y > cy && mouse.y < cy + 68 && mouse.x > panelX + 10 && mouse.x < panelX + panelW - 10

      if (isHover) hoverChar = i

      ctx.fillStyle = isHover ? 'rgba(76,201,240,0.12)' : 'rgba(255,255,255,0.04)'
      ctx.strokeStyle = isHover ? cls.color : '#333'
      ctx.lineWidth = isHover ? 2 : 1
      ctx.fillRect(panelX + 10, cy, panelW - 20, 68)
      ctx.strokeRect(panelX + 10, cy, panelW - 20, 68)

      // Class color dot
      ctx.fillStyle = cls.color
      ctx.beginPath(); ctx.arc(panelX + 34, cy + 34, 12, 0, Math.PI*2); ctx.fill()

      ctx.textAlign = 'left'
      ctx.fillStyle = '#e0fbfc'
      ctx.font = 'bold 14px monospace'
      ctx.fillText(c.name, panelX + 54, cy + 22)

      ctx.fillStyle = '#aaa'
      ctx.font = '11px monospace'
      ctx.fillText(`${cls.name}  •  Level ${c.level}`, panelX + 54, cy + 38)

      ctx.fillStyle = '#ffd60a88'
      ctx.fillText(`Glory: ${c.glory.toLocaleString()}`, panelX + 54, cy + 54)

      // HP bar
      const bw = panelW - 80
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(panelX + 54, cy + 58, bw, 4)
      ctx.fillStyle = '#4caf50'; ctx.fillRect(panelX + 54, cy + 58, bw * (c.hp / c.maxHp), 4)
    }

    // New character button
    const btnY = panelY + 40 + account.characters.length * 76 + 8
    const isHoverNew = mouse.y > btnY && mouse.y < btnY + 40 && mouse.x > panelX + 10 && mouse.x < panelX + panelW - 10
    hoverNew = isHoverNew
    ctx.fillStyle = isHoverNew ? 'rgba(76,201,240,0.2)' : 'rgba(76,201,240,0.07)'
    ctx.strokeStyle = '#4cc9f066'
    ctx.lineWidth = 1
    ctx.fillRect(panelX + 10, btnY, panelW - 20, 40)
    ctx.strokeRect(panelX + 10, btnY, panelW - 20, 40)
    ctx.fillStyle = '#4cc9f0'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('+ NEW CHARACTER', canvas.width/2, btnY + 25)
    ctx.textAlign = 'left'
  }

  function onClick() {
    if (hoverNew) { G.enterZone('classSelect'); return }
    if (hoverChar >= 0 && hoverChar < account.characters.length) {
      G.char = account.characters[hoverChar]
      G.enterZone('nexus')
    }
  }

  return { render, update, onClick }
})()

// ---- CLASS SELECT ----
const ClassSelect = (() => {
  let hoverIdx = -1
  let selectedIdx = -1
  let nameInput = ''
  let nameActive = false

  function init() {
    hoverIdx = -1; selectedIdx = -1; nameInput = ''; nameActive = false
  }

  function onKey(e) {
    if (!nameActive) return
    if (e.code === 'Backspace') { nameInput = nameInput.slice(0, -1); return }
    if (e.code === 'Enter') { tryCreate(); return }
    if (e.key.length === 1 && nameInput.length < 16) nameInput += e.key
  }

  function tryCreate() {
    if (selectedIdx < 0) return
    const name = nameInput.trim() || CLASS_ORDER[selectedIdx]
    const char = createCharacter(CLASS_ORDER[selectedIdx], name)
    account.characters.push(char)
    G.char = char
    if (window.saveGame) saveGame()
    G.enterZone('nexus')
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#080810'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#e0fbfc'
    ctx.font = 'bold 28px monospace'
    ctx.fillText('CHOOSE YOUR CLASS', canvas.width/2, 60)

    const cardW = 160, cardH = 220, gap = 20
    const totalW = CLASS_ORDER.length * (cardW + gap) - gap
    const startX = canvas.width/2 - totalW/2

    hoverIdx = -1

    for (let i = 0; i < CLASS_ORDER.length; i++) {
      const key = CLASS_ORDER[i]
      const cls = CLASSES[key]
      const cx = startX + i * (cardW + gap)
      const cy = 90
      const isHover = mouse.x > cx && mouse.x < cx + cardW && mouse.y > cy && mouse.y < cy + cardH
      const isSel = selectedIdx === i
      if (isHover) hoverIdx = i

      ctx.fillStyle = isSel ? 'rgba(76,201,240,0.18)' : isHover ? 'rgba(255,255,255,0.07)' : 'rgba(10,10,30,0.9)'
      ctx.strokeStyle = isSel ? cls.color : isHover ? '#4cc9f066' : '#222'
      ctx.lineWidth = isSel ? 2.5 : 1
      ctx.fillRect(cx, cy, cardW, cardH)
      ctx.strokeRect(cx, cy, cardW, cardH)

      // Class icon — colored circle with initial
      ctx.fillStyle = cls.color
      ctx.shadowBlur = isSel ? 20 : 8; ctx.shadowColor = cls.color
      ctx.beginPath(); ctx.arc(cx + cardW/2, cy + 55, 28, 0, Math.PI*2); ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#000'
      ctx.font = 'bold 22px monospace'
      ctx.fillText(cls.name[0], cx + cardW/2, cy + 63)

      ctx.fillStyle = '#e0fbfc'
      ctx.font = 'bold 15px monospace'
      ctx.fillText(cls.name, cx + cardW/2, cy + 104)

      ctx.fillStyle = '#aaa'
      ctx.font = '10px monospace'
      // Wrap description
      const words = cls.desc.split(' ')
      let line = '', lineY = cy + 124
      for (const w of words) {
        const test = line + w + ' '
        if (ctx.measureText(test).width > cardW - 16) {
          ctx.fillText(line, cx + cardW/2, lineY); line = w + ' '; lineY += 14
        } else line = test
      }
      ctx.fillText(line, cx + cardW/2, lineY)

      // Stats preview
      ctx.fillStyle = '#4cc9f0aa'
      ctx.font = '9px monospace'
      const ms = cls.mainStat.toUpperCase()
      ctx.fillText(`HP ${(cls.max.hp/1000).toFixed(1)}k  MP ${(cls.max.mp/1000).toFixed(1)}k  SPD ${cls.max.spd}`, cx + cardW/2, cy + 194)
      ctx.fillText(`${ms} 100  |  ${cls.abilityName}`, cx + cardW/2, cy + 208)
    }
    ctx.textAlign = 'left'

    // Name input
    if (selectedIdx >= 0) {
      const ny = 340
      ctx.fillStyle = '#e0fbfc'
      ctx.font = '14px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Character Name:', canvas.width/2, ny)
      const iw = 260, ih = 36
      const ix = canvas.width/2 - iw/2
      ctx.fillStyle = nameActive ? 'rgba(76,201,240,0.15)' : 'rgba(255,255,255,0.05)'
      ctx.strokeStyle = nameActive ? '#4cc9f0' : '#444'
      ctx.lineWidth = 1
      ctx.fillRect(ix, ny + 10, iw, ih)
      ctx.strokeRect(ix, ny + 10, iw, ih)
      ctx.fillStyle = '#e0fbfc'
      ctx.font = '15px monospace'
      const displayName = nameInput + (nameActive && Math.floor(Date.now()/500)%2===0 ? '|' : '')
      ctx.fillText(displayName || (nameActive ? '' : CLASSES[CLASS_ORDER[selectedIdx]].name), canvas.width/2, ny + 34)

      // Create button
      const btnW = 200
      const bx = canvas.width/2 - btnW/2
      const isHoverBtn = mouse.x > bx && mouse.x < bx + btnW && mouse.y > ny + 56 && mouse.y < ny + 92
      ctx.fillStyle = isHoverBtn ? 'rgba(76,201,240,0.3)' : 'rgba(76,201,240,0.12)'
      ctx.strokeStyle = '#4cc9f0'
      ctx.fillRect(bx, ny + 56, btnW, 36)
      ctx.strokeRect(bx, ny + 56, btnW, 36)
      ctx.fillStyle = '#4cc9f0'
      ctx.font = 'bold 14px monospace'
      ctx.fillText('CREATE & ENTER', canvas.width/2, ny + 80)
      ctx.textAlign = 'left'
    }

    // Back
    ctx.fillStyle = '#666'
    ctx.font = '12px monospace'
    ctx.fillText('ESC — back', 20, canvas.height - 20)
  }

  function onClick() {
    if (hoverIdx >= 0) { selectedIdx = hoverIdx; nameActive = true; return }
    // Name box click
    const ny = 340, iw = 260, ix = canvas.width/2 - iw/2
    nameActive = mouse.x > ix && mouse.x < ix + iw && mouse.y > ny + 10 && mouse.y < ny + 46

    // Create button
    if (selectedIdx >= 0) {
      const btnW = 200, bx = canvas.width/2 - btnW/2, ny2 = 340
      if (mouse.x > bx && mouse.x < bx + btnW && mouse.y > ny2 + 56 && mouse.y < ny2 + 92) tryCreate()
    }
  }

  return { init, render, onClick, onKey }
})()

// ---- HUD ----
function renderHUD(char, zoneName) {
  const pad = 12
  const w = canvas.width, h = canvas.height

  // Bottom-left: HP + MP bars
  const barW = 220, barH = 14
  const bx = pad, by = h - pad - barH * 2 - 8

  // HP
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx-1, by-1, barW+2, barH+2)
  ctx.fillStyle = '#1a3a1a'; ctx.fillRect(bx, by, barW, barH)
  ctx.fillStyle = '#4caf50'; ctx.fillRect(bx, by, barW * Math.max(0, char.hp / char.maxHp), barH)
  ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 9px monospace'
  ctx.fillText(`HP  ${compactNum(char.hp)} / ${compactNum(char.maxHp)}`, bx + 4, by + 10)

  // MP
  const my = by + barH + 4
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx-1, my-1, barW+2, barH+2)
  ctx.fillStyle = '#0a1a3a'; ctx.fillRect(bx, my, barW, barH)
  ctx.fillStyle = '#4cc9f0'; ctx.fillRect(bx, my, barW * Math.max(0, char.mp / char.maxMp), barH)
  ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 9px monospace'
  ctx.fillText(`MP  ${compactNum(char.mp)} / ${compactNum(char.maxMp)}`, bx + 4, my + 10)

  // XP bar (thin, above HP)
  if (char.level < LEVEL_CAP) {
    const xy = by - 6
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx-1, xy-1, barW+2, 5)
    ctx.fillStyle = '#3a2a00'; ctx.fillRect(bx, xy, barW, 4)
    ctx.fillStyle = '#ffd60a'; ctx.fillRect(bx, xy, barW * Math.min(1, char.xp / char.xpNext), 4)
  } else {
    // Glory bar post-cap
    const xy = by - 6
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx-1, xy-1, barW+2, 5)
    ctx.fillStyle = '#1a0a2a'; ctx.fillRect(bx, xy, barW, 4)
    ctx.fillStyle = '#cc44ff'; ctx.fillRect(bx, xy, Math.min(barW, (char.glory % 1000) / 1000 * barW), 4)
  }

  // Level + class
  ctx.fillStyle = '#e0fbfc'
  ctx.font = 'bold 12px monospace'
  const cls = CLASSES[char.classKey]
  ctx.fillText(`${cls.name}  Lv.${char.level}`, bx, by - 12)

  if (char.level >= LEVEL_CAP) {
    ctx.fillStyle = '#cc44ff'
    ctx.fillText(`Glory: ${char.glory.toLocaleString()}`, bx + 130, by - 12)
  }

  // Ability cooldown slot (bottom center)
  const aw = 44, ax = w/2 - aw/2, ay = h - pad - aw
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.strokeStyle = '#4cc9f055'; ctx.lineWidth = 1
  ctx.fillRect(ax, ay, aw, aw); ctx.strokeRect(ax, ay, aw, aw)
  const cdFrac = char.abilityCooldown <= 0 ? 1 : 0
  if (cdFrac < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ax, ay, aw, aw)
    ctx.fillStyle = '#333'
    const cdMax = 5
    ctx.fillRect(ax, ay + aw * (char.abilityCooldown / cdMax), aw, aw * (1 - char.abilityCooldown / cdMax))
  }
  ctx.fillStyle = char.abilityCooldown <= 0 ? cls.color : '#555'
  ctx.font = '8px monospace'; ctx.textAlign = 'center'
  ctx.fillText('SPACE', ax + aw/2, ay + 14)
  ctx.font = '7px monospace'
  ctx.fillText(cls.abilityName.split(' ')[0], ax + aw/2, ay + 26)
  if (char.abilityCooldown > 0) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'
    ctx.fillText(char.abilityCooldown.toFixed(1), ax + aw/2, ay + 38)
  }
  ctx.textAlign = 'left'

  // Zone name (top center) — box auto-sizes to fit name + stars
  ctx.font = 'bold 11px monospace'
  const znW = Math.max(120, ctx.measureText(zoneName).width + 24)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(w/2 - znW/2, pad - 2, znW, 20)
  ctx.fillStyle = '#4cc9f0cc'; ctx.textAlign = 'center'
  ctx.fillText(zoneName, w/2, pad + 12)
  ctx.textAlign = 'left'

  // R to nexus reminder (top right, only outside nexus)
  if (zoneName !== 'NEXUS') {
    ctx.fillStyle = '#ffffff33'; ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('[R] Return to Nexus', w - pad, pad + 12)
    ctx.textAlign = 'left'
  }

  // Tiny "Saved" flash (drawn across all zones that use the HUD)
  if (window.renderSaveIndicator) renderSaveIndicator()
}

// ---- DEATH SCREEN ----
function renderDead(char) {
  ctx.fillStyle = 'rgba(0,0,0,0.82)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.textAlign = 'center'

  ctx.shadowBlur = 30; ctx.shadowColor = '#e63946'
  ctx.fillStyle = '#e63946'; ctx.font = 'bold 64px monospace'
  ctx.fillText('YOU DIED', canvas.width/2, canvas.height/2 - 80)
  ctx.shadowBlur = 0

  ctx.fillStyle = '#e0fbfc'; ctx.font = '18px monospace'
  ctx.fillText(`${char.name}  —  ${CLASSES[char.classKey].name}  —  Level ${char.level}`, canvas.width/2, canvas.height/2 - 24)

  ctx.fillStyle = '#ffd60a'; ctx.font = '14px monospace'
  ctx.fillText(`Glory earned this life: ${char.glory.toLocaleString()}  →  transferred to account`, canvas.width/2, canvas.height/2 + 10)
  ctx.fillStyle = '#cc44ff'
  ctx.fillText(`Account Glory: ${account.glory.toLocaleString()}`, canvas.width/2, canvas.height/2 + 34)

  ctx.fillStyle = '#888'; ctx.font = '13px monospace'
  ctx.fillText('Press ENTER to continue', canvas.width/2, canvas.height/2 + 80)
  ctx.textAlign = 'left'
}

// ---- PLAYER RENDER ----
function renderPlayer(char, offX, offY) {
  const sx = char.x + offX, sy = char.y + offY
  const cls = CLASSES[char.classKey]

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath(); ctx.ellipse(sx, sy + PLAYER_RADIUS - 2, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.35, 0, 0, Math.PI*2); ctx.fill()

  // Glow
  ctx.shadowBlur = 18; ctx.shadowColor = cls.color
  ctx.fillStyle = cls.color
  // Class shapes
  if (char.classKey === 'warrior') {
    ctx.fillRect(sx - 9, sy - 10, 18, 20)
  } else if (char.classKey === 'mage') {
    ctx.beginPath()
    ctx.moveTo(sx, sy - 12); ctx.lineTo(sx + 10, sy + 8); ctx.lineTo(sx - 10, sy + 8)
    ctx.closePath(); ctx.fill()
  } else {
    ctx.beginPath(); ctx.arc(sx, sy, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill()
  }
  ctx.shadowBlur = 0

  // Direction dot (toward mouse)
  const [wx, wy] = screenToWorld(mouse.x, mouse.y)
  const ang = Math.atan2(wy - char.y, wx - char.x)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(sx + Math.cos(ang) * (PLAYER_RADIUS + 5), sy + Math.sin(ang) * (PLAYER_RADIUS + 5), 3, 0, Math.PI*2)
  ctx.fill()
}
