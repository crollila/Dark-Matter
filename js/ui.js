// ============================================================
// UI — main menu, class select, HUD, player render, death screen
// ============================================================

// ---- SHARED UI THEME ----
// Central place for colors/styling so the look can be retuned later without
// hunting through every draw call. New HUD / inventory / minimap all read this.
const UI = {
  panelBg:     'rgba(12,14,24,0.94)',
  panelBg2:    'rgba(18,21,36,0.96)',
  panelBorder: '#33405e',
  accent:      '#4cc9f0',
  text:        '#e0fbfc',
  textDim:     '#9fb3c8',
  textFaint:   '#5d6b85',
  hp:          '#43c463', hpTrack: '#10261a',
  mp:          '#3aa0ff', mpTrack: '#0c1830',
  xp:          '#ffd60a', xpTrack: '#2c2406',
  glory:       '#cc44ff', gloryTrack: '#1c0a2a',
  good:        '#5fd06a', bad: '#ff6b6b',
}

// ---- SHARED DRAW HELPERS ----
function uiRoundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}
function uiPanel(x, y, w, h, r = 8, border = UI.panelBorder, bg = UI.panelBg) {
  uiRoundRect(x, y, w, h, r)
  ctx.fillStyle = bg; ctx.fill()
  if (border) { ctx.lineWidth = 1; ctx.strokeStyle = border; ctx.stroke() }
}
// Horizontal stat bar with rounded ends, inner sheen, and optional centered label.
function uiBar(x, y, w, h, frac, fill, track, label, r) {
  if (r == null) r = Math.min(h / 2, 5)
  frac = Math.max(0, Math.min(1, frac || 0))
  uiRoundRect(x, y, w, h, r); ctx.fillStyle = track; ctx.fill()
  if (frac > 0) {
    ctx.save()
    uiRoundRect(x, y, w, h, r); ctx.clip()
    ctx.fillStyle = fill; ctx.fillRect(x, y, w * frac, h)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x, y, w * frac, Math.max(2, h * 0.42))
    ctx.restore()
  }
  uiRoundRect(x, y, w, h, r); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke()
  if (label && h >= 11) {
    ctx.fillStyle = UI.text; ctx.font = `bold ${Math.min(11, h - 5)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5)
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  }
}

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

    // When empty, the "+ NEW CHARACTER" button is pushed down so this hint
    // sits cleanly above it instead of overlapping.
    const emptyOffset = account.characters.length === 0 ? 40 : 0
    if (account.characters.length === 0) {
      ctx.fillStyle = '#888'
      ctx.font = '12px monospace'
      ctx.fillText('No characters yet — create one below.', canvas.width/2, panelY + 64)
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
    const btnY = panelY + 40 + account.characters.length * 76 + 8 + emptyOffset
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
// Cohesive bottom-center vitals module (HP / MP / XP) + integrated ability slot,
// zone banner top-center, minimap top-right. `map`/`mobs` are optional and only
// used to feed the minimap (safe zones pass an empty mob list).
function renderHUD(char, zoneName, map, mobs) {
  const pad = 12
  const w = canvas.width, h = canvas.height
  const cls = CLASSES[char.classKey]
  const capped = char.level >= LEVEL_CAP

  // ---- Bottom-center vitals module ----
  const barsW = 270, slot = 54, gap = 12
  const modW = pad + barsW + gap + slot + pad
  const modH = 76
  const mx = ((w - modW) / 2) | 0
  const my = h - modH - 12

  uiPanel(mx, my, modW, modH, 11, UI.panelBorder, UI.panelBg)
  // accent top edge for a bit of identity
  ctx.save(); uiRoundRect(mx, my, modW, modH, 11); ctx.clip()
  ctx.fillStyle = cls.color + '22'; ctx.fillRect(mx, my, modW, 3); ctx.restore()

  const bx = mx + pad
  // header line: class + level (left), xp/glory readout (right)
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = cls.color; ctx.font = 'bold 12px monospace'
  ctx.fillText(cls.name, bx, my + 16)
  ctx.fillStyle = UI.textDim; ctx.font = 'bold 11px monospace'
  ctx.fillText(`Lv.${char.level}`, bx + ctx.measureText(cls.name).width + 12, my + 16)

  ctx.textAlign = 'right'; ctx.font = '9px monospace'
  ctx.fillStyle = capped ? UI.glory : UI.xp
  ctx.fillText(capped ? `GLORY ${char.glory.toLocaleString()}`
                      : `XP ${char.xp | 0} / ${char.xpNext | 0}`, bx + barsW, my + 16)
  ctx.textAlign = 'left'

  // HP + MP (clearly separated, color-coded, labelled)
  uiBar(bx, my + 22, barsW, 18, char.hp / char.maxHp, UI.hp, UI.hpTrack,
        `HP  ${compactNum(char.hp)} / ${compactNum(char.maxHp)}`)
  uiBar(bx, my + 44, barsW, 14, char.mp / char.maxMp, UI.mp, UI.mpTrack,
        `MP  ${compactNum(char.mp)} / ${compactNum(char.maxMp)}`)
  // XP / glory — secondary thin bar
  const xpFrac = capped ? (char.glory % 1000) / 1000 : Math.min(1, char.xp / char.xpNext)
  uiBar(bx, my + 62, barsW, 6, xpFrac, capped ? UI.glory : UI.xp,
        capped ? UI.gloryTrack : UI.xpTrack, null, 3)

  // ---- Ability slot (integrated on the right of the module) ----
  const ax = mx + modW - pad - slot, ay = my + (modH - slot) / 2
  const ready = char.abilityCooldown <= 0
  uiPanel(ax, ay, slot, slot, 8, ready ? cls.color + 'aa' : '#2a3450', 'rgba(0,0,0,0.5)')
  if (!ready) {
    const cdMax = 5, f = Math.min(1, char.abilityCooldown / cdMax)
    ctx.save(); uiRoundRect(ax, ay, slot, slot, 8); ctx.clip()
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(ax, ay, slot, slot * f); ctx.restore()
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = ready ? cls.color : UI.textFaint; ctx.font = 'bold 8px monospace'
  ctx.fillText((window.Hotkeys ? Hotkeys.name('ability') : 'Space').toUpperCase(), ax + slot / 2, ay + 13)
  ctx.fillStyle = ready ? UI.text : UI.textFaint; ctx.font = '7px monospace'
  ctx.fillText(cls.abilityName.split(' ')[0].toUpperCase(), ax + slot / 2, ay + 26)
  if (!ready) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'
    ctx.fillText(char.abilityCooldown.toFixed(1), ax + slot / 2, ay + 43)
  } else {
    ctx.fillStyle = cls.color; ctx.font = 'bold 9px monospace'
    ctx.fillText('READY', ax + slot / 2, ay + 43)
  }
  ctx.textAlign = 'left'

  // ---- Zone banner (top-center) ----
  ctx.font = 'bold 11px monospace'
  const znW = Math.max(130, ctx.measureText(zoneName).width + 28)
  uiPanel(w / 2 - znW / 2, pad - 4, znW, 22, 6)
  ctx.fillStyle = UI.accent; ctx.textAlign = 'center'
  ctx.fillText(zoneName, w / 2, pad + 11)
  ctx.textAlign = 'left'

  // ---- return hint (top-left; clear of minimap) ----
  const rKey = window.Hotkeys ? Hotkeys.name('returnNexus') : 'R'
  const iKey = window.Hotkeys ? Hotkeys.name('inventory') : 'I'
  if (zoneName !== 'NEXUS') {
    ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'
    ctx.fillText(`[${rKey}] Return to Nexus`, pad, pad + 11)
  }
  // inventory hint just under it
  ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'
  ctx.fillText(`[${iKey}] Inventory`, pad, pad + 26)

  // ---- Minimap (top-right) ----
  if (typeof Minimap !== 'undefined' && map) Minimap.render(char, map, mobs || [])

  // Tiny "Saved" flash (drawn across all zones that use the HUD)
  if (window.renderSaveIndicator) renderSaveIndicator()
}

// ---- MINIMAP ----
// Tactical top-right map: full tile layout (cached per-map to an offscreen
// canvas), player position + facing, enemy dots, bosses as gold diamonds.
const Minimap = (() => {
  const SIZE = 172
  let zoom = 1                 // in-memory minimap zoom (1 = whole map)
  const ZMIN = 1, ZMAX = 6
  let _rect = null             // last drawn minimap bounds (for wheel hover test)

  function tileRGBA(t) {
    switch (t) {
      case T_VOID:           return [0, 0, 0, 0]
      case T_WALL:           return [26, 30, 46, 255]
      case T_FLOOR:          return [58, 62, 78, 255]
      case T_WATER:          return [26, 58, 92, 255]
      case T_GRASS:          return [42, 74, 26, 255]
      case T_STATION:        return [120, 120, 200, 255]
      case T_SPAWN:          return [40, 50, 70, 255]
      case T_PORTAL_WORLD:   return [40, 200, 110, 255]
      case T_PORTAL_RAID:    return [210, 60, 60, 255]
      case T_PORTAL_DUNGEON: return [170, 80, 230, 255]
      case T_PORTAL_VAULT:   return [170, 100, 240, 255]
      case T_ICE:            return [159, 212, 232, 255]
      case T_LAVA:           return [200, 70, 30, 255]
      default:               return [40, 44, 58, 255]
    }
  }

  function build(map) {
    const c = document.createElement('canvas')
    c.width = map.w; c.height = map.h
    const g = c.getContext('2d')
    const img = g.createImageData(map.w, map.h)
    const d = img.data
    const hasBiome = !!map.biome && typeof BIOME_BY_ID !== 'undefined'
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, y)
        let [r, gg, b, a] = tileRGBA(t)
        // Tint floor/grass by biome so regions read on the minimap.
        if (hasBiome && (t === T_FLOOR || t === T_GRASS)) {
          const bd = BIOME_BY_ID[map.biome[y * map.w + x]]
          if (bd && bd.mini) { r = bd.mini[0]; gg = bd.mini[1]; b = bd.mini[2]; a = 255 }
        }
        const i = (y * map.w + x) * 4
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a
      }
    }
    g.putImageData(img, 0, 0)
    return c
  }

  function render(char, map, mobs) {
    if (!map || !map.w) return
    if (!map._mini) map._mini = build(map)

    const x = canvas.width - SIZE - 14, y = 14
    _rect = { x: x - 3, y: y - 3, w: SIZE + 6, h: SIZE + 6 }
    uiPanel(x - 3, y - 3, SIZE + 6, SIZE + 6, 8)

    // Visible window in TILES. zoom=1 shows the whole map; higher zoom shows a
    // smaller area centered on the player, clamped to the map bounds.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const viewW = map.w / zoom, viewH = map.h / zoom
    const vx0 = clamp(char.x / TILE - viewW / 2, 0, Math.max(0, map.w - viewW))
    const vy0 = clamp(char.y / TILE - viewH / 2, 0, Math.max(0, map.h - viewH))
    const sc = SIZE / Math.max(viewW, viewH)
    const dw = viewW * sc, dh = viewH * sc
    const ox = x + (SIZE - dw) / 2, oy = y + (SIZE - dh) / 2

    ctx.save()
    uiRoundRect(x, y, SIZE, SIZE, 6); ctx.clip()
    ctx.fillStyle = '#05060c'; ctx.fillRect(x, y, SIZE, SIZE)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(map._mini, vx0, vy0, viewW, viewH, ox, oy, dw, dh)

    const w2m = (wx, wy) => [ox + (wx / TILE - vx0) * sc, oy + (wy / TILE - vy0) * sc]

    // Enemies
    for (const e of mobs) {
      if (!e || !e.alive) continue
      const [ex, ey] = w2m(e.x, e.y)
      if (e.isBoss) {
        ctx.fillStyle = '#ffd700'
        ctx.beginPath()
        ctx.moveTo(ex, ey - 4); ctx.lineTo(ex + 4, ey)
        ctx.lineTo(ex, ey + 4); ctx.lineTo(ex - 4, ey)
        ctx.closePath(); ctx.fill()
        ctx.strokeStyle = '#fff8'; ctx.lineWidth = 1; ctx.stroke()
      } else {
        ctx.fillStyle = '#ff5454'
        ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, Math.PI * 2); ctx.fill()
      }
    }

    // Player + facing
    const [px, py] = w2m(char.x, char.y)
    const [wx, wy] = screenToWorld(mouse.x, mouse.y)
    const ang = Math.atan2(wy - char.y, wx - char.x)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(px, py)
    ctx.lineTo(px + Math.cos(ang) * 9, py + Math.sin(ang) * 9); ctx.stroke()
    ctx.fillStyle = CLASSES[char.classKey].color
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
    ctx.restore()

    // Label + zoom readout
    ctx.fillStyle = UI.textFaint; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left'
    ctx.fillText('MAP', x + 4, y + 11)
    if (zoom > 1.001) {
      ctx.textAlign = 'right'; ctx.fillText(zoom.toFixed(1) + 'x', x + SIZE - 4, y + 11)
    }
    ctx.textAlign = 'left'
  }

  // Mouse-wheel zoom while hovering the minimap (in-memory; clamped).
  canvas.addEventListener('wheel', e => {
    if (!_rect) return
    if (mouse.x >= _rect.x && mouse.x <= _rect.x + _rect.w &&
        mouse.y >= _rect.y && mouse.y <= _rect.y + _rect.h) {
      zoom = Math.max(ZMIN, Math.min(ZMAX, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
      e.preventDefault(); e.stopPropagation()
    }
  }, { passive: false })

  return { render }
})()

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

  // World-anchored facing marker: a bright wedge on the body's forward edge,
  // drawn inside the world transform with NO counter-rotation, so it rotates
  // WITH the map/screen rotation (Q/E). This makes the body's rotation clearly
  // visible even for the rotationally-symmetric (circle) class shapes — the
  // body now visibly turns with the world. Distinct from the mouse aim dot.
  ctx.fillStyle = '#0a0a12'
  ctx.beginPath()
  ctx.moveTo(sx, sy - PLAYER_RADIUS - 5)
  ctx.lineTo(sx - 5, sy - PLAYER_RADIUS + 4)
  ctx.lineTo(sx + 5, sy - PLAYER_RADIUS + 4)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.stroke()

  // Direction dot (toward mouse)
  const [wx, wy] = screenToWorld(mouse.x, mouse.y)
  const ang = Math.atan2(wy - char.y, wx - char.x)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(sx + Math.cos(ang) * (PLAYER_RADIUS + 5), sy + Math.sin(ang) * (PLAYER_RADIUS + 5), 3, 0, Math.PI*2)
  ctx.fill()

  // Small HP/MP bars directly under the character (drawn last so bullets/
  // particles don't cover them). The main HUD bars remain the primary readout.
  // Counter-rotated so they stay visually UNDER the character on the rotated
  // screen instead of swinging around with the world rotation.
  const bw = 36, bh = 4
  const bx = -bw / 2, by = PLAYER_RADIUS + 6
  const hpF = char.maxHp ? Math.max(0, Math.min(1, char.hp / char.maxHp)) : 0
  const mpF = char.maxMp ? Math.max(0, Math.min(1, char.mp / char.maxMp)) : 0
  drawUpright(sx, sy, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh * 2 + 4)
    ctx.fillStyle = UI.hpTrack; ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = UI.hp;      ctx.fillRect(bx, by, bw * hpF, bh)
    ctx.fillStyle = UI.mpTrack; ctx.fillRect(bx, by + bh + 2, bw, bh)
    ctx.fillStyle = UI.mp;      ctx.fillRect(bx, by + bh + 2, bw * mpF, bh)
  })
}
