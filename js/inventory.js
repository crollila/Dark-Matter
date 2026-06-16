// ============================================================
// INVENTORY — Diablo-style character window (right side of screen)
// ------------------------------------------------------------
// Toggle with I. Layout:
//   • Equipment panel (top): 4 slots left column, 4 right column, weapon +
//     ability on the bottom row, character silhouette anchored in the center.
//   • Inventory grid (bottom): 30 icon-only slots.
//   • STATS popup (toggle button) attaches to the LEFT of the main window and
//     shows full character stats + materials; opens/closes independently.
//
// Interaction:
//   • Hover any item (grid or equipped) → tooltip follows the mouse.
//   • Hover a grid item that has an equipped counterpart → a second "EQUIPPED"
//     tooltip is shown alongside for instant comparison (with stat deltas).
//   • Click a grid item → equip it. Click an equipped slot → unequip.
//
// Driven from the main loop:  Inventory.update(char); Inventory.render(char)
// Other scripts gate input with Inventory.isOpen().
// ============================================================

const Inventory = (() => {
  let open = false
  let statsOpen = true
  let iLatch = false
  let _layout = null
  let _msg = null

  // gear key → display label / single-letter icon
  const SLOT_META = {
    helmet:  { label: 'Helmet',  ic: 'H' },
    chest:   { label: 'Chest',   ic: 'C' },
    hands:   { label: 'Hands',   ic: 'G' },
    pants:   { label: 'Legs',    ic: 'L' },
    boots:   { label: 'Boots',   ic: 'B' },
    ring1:   { label: 'Ring',    ic: 'O' },
    ring2:   { label: 'Ring',    ic: 'O' },
    amulet:  { label: 'Amulet',  ic: 'A' },
    weapon:  { label: 'Weapon',  ic: 'W' },
    ability: { label: 'Ability', ic: '✦' },
  }
  const LEFT_COL  = ['helmet', 'chest', 'hands', 'pants']
  const RIGHT_COL = ['boots', 'ring1', 'ring2', 'amulet']
  const BOTTOM    = ['weapon', 'ability']

  const CAP = () => (typeof INVENTORY_CAP === 'number' ? INVENTORY_CAP : 30)

  function isOpen() { return open }
  function flash(text, color) { _msg = { text, color: color || UI.text, at: Date.now() } }

  function ensureChar(char) {
    if (!char) return false
    if (!char.gear || typeof char.gear !== 'object') char.gear = {}
    if (!Array.isArray(char.inventory)) char.inventory = []
    return true
  }

  function altHeld() { return !!(keys['AltLeft'] || keys['AltRight']) }

  // ---- equip target resolution ----
  // Rings: normally fill ring1 first, then ring2. With Alt, always target ring2.
  function resolveGearSlot(char, item, alt) {
    const s = item && item.slot
    if (!s) return null
    if (s === 'ring') {
      if (alt) return 'ring2'
      if (!char.gear.ring1) return 'ring1'
      if (!char.gear.ring2) return 'ring2'
      return 'ring1'
    }
    if (s in char.gear) return s
    return null
  }

  // Which equipped item a hovered item compares against. Rings compare to ring1
  // by default and ring2 with Alt, regardless of which slots are filled.
  function compareSlot(char, item, alt) {
    if (item && item.slot === 'ring') return alt ? 'ring2' : 'ring1'
    return resolveGearSlot(char, item, false)
  }

  function clampVitals(char) {
    char.hp = Math.max(0, Math.min(char.hp, char.maxHp))
    char.mp = Math.max(0, Math.min(char.mp, char.maxMp))
  }

  function equip(char, idx, alt) {
    if (!ensureChar(char)) return
    const inv = char.inventory
    const item = inv[idx]
    if (!item) return
    if (item.classes && item.classes.indexOf(char.classKey) < 0) {
      flash(`${item.name} is ${item.classes.join('/')}-only`, UI.bad)
      spawnFloatText(char.x, char.y - 40, 'Wrong class', UI.bad)
      return
    }
    const slot = resolveGearSlot(char, item, alt)
    if (!slot) {
      flash(`Can't equip ${item.name} (${item.slot || '?'})`, UI.bad)
      spawnFloatText(char.x, char.y - 40, 'Cannot equip there', UI.bad)
      return
    }
    const prev = char.gear[slot] || null
    inv.splice(idx, 1)
    if (prev) {
      if (inv.length >= CAP()) { inv.splice(idx, 0, item); flash('Inventory full — cannot swap', UI.bad); return }
      inv.push(prev)
    }
    char.gear[slot] = item
    recalcStats(char)
    clampVitals(char)
    if (window.saveGame) saveGame()
    flash(`Equipped ${item.name}`, item.color || UI.text)
    spawnFloatText(char.x, char.y - 40, `Equipped ${item.name}`, item.color || UI.text)
  }

  function unequip(char, key) {
    if (!ensureChar(char)) return
    const it = char.gear[key]
    if (!it) return
    const inv = char.inventory
    if (inv.length >= CAP()) { flash('Inventory full — cannot unequip', UI.bad); return }
    char.gear[key] = null
    inv.push(it)
    recalcStats(char)
    clampVitals(char)
    if (window.saveGame) saveGame()
    flash(`Unequipped ${it.name}`, it.color || UI.text)
    spawnFloatText(char.x, char.y - 40, `Unequipped ${it.name}`, it.color || UI.text)
  }

  function update(char) {
    if (!ensureChar(char)) { open = false; return }
    const iDown = !!keys['KeyI']
    if (iDown && !iLatch) open = !open
    iLatch = iDown
  }

  // ---- layout ----
  function computeLayout() {
    // PW/px clamp so the window stays fully on-screen on small/laptop windows.
    const PW = Math.min(372, canvas.width - 16)
    const PH = Math.min(canvas.height - 24, 588)
    const px = Math.max(8, canvas.width - PW - 16)
    const py = ((canvas.height - PH) / 2) | 0

    const closeBtn  = { x: px + PW - 30, y: py + 12, w: 20, h: 20 }
    const statsBtn  = { x: px + PW - 110, y: py + 12, w: 72, h: 20 }

    // Equipment region
    const eqTop = py + 44
    const ss = 46, vGap = 10
    const colY = i => eqTop + 8 + i * (ss + vGap)
    const leftX = px + 18
    const rightX = px + PW - 18 - ss
    const slots = []
    LEFT_COL.forEach((k, i)  => slots.push({ key: k, x: leftX,  y: colY(i), w: ss, h: ss }))
    RIGHT_COL.forEach((k, i) => slots.push({ key: k, x: rightX, y: colY(i), w: ss, h: ss }))
    // bottom row (weapon + ability) centered under silhouette
    const bottomY = colY(3) + ss + 14
    const cx = px + PW / 2
    slots.push({ key: 'weapon',  x: cx - ss - 8, y: bottomY, w: ss, h: ss })
    slots.push({ key: 'ability', x: cx + 8,      y: bottomY, w: ss, h: ss })

    const silhouette = { x: leftX + ss, y: eqTop + 6, w: rightX - (leftX + ss), h: colY(3) + ss - (eqTop + 6) }
    const eqBottom = bottomY + ss

    // Inventory grid (6 x 5 = 30), icon-only
    const cols = 6, rows = 5, cell = 50, g = 6
    const gridW = cols * cell + (cols - 1) * g
    const gx = px + ((PW - gridW) / 2) | 0
    const gy = eqBottom + 26
    const cells = []
    for (let i = 0; i < cols * rows; i++) {
      const c = i % cols, r = (i / cols) | 0
      cells.push({ i, x: gx + c * (cell + g), y: gy + r * (cell + g), w: cell, h: cell })
    }

    // Stats popup attached to the LEFT of the window. On narrow windows there
    // isn't room beside the window, so it becomes an on-top overlay instead of
    // overlapping the inventory awkwardly.
    const SW = 220
    const statsFits = (px - SW - 10) >= 8
    const statsPanel = { x: Math.max(8, px - SW - 10), y: py, w: SW, h: PH }

    return { PW, PH, px, py, closeBtn, statsBtn, slots, silhouette, cells, gx, gy, cols, rows, cell,
             gridLabel: { x: gx, y: gy - 8 }, statsPanel, statsFits }
  }

  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  function onClick(x, y, char, alt) {
    if (window.Options && Options.isOpen()) return false
    if (!open || !_layout) return false
    const L = _layout
    if (hit(L.closeBtn, x, y)) { open = false; return true }
    if (hit(L.statsBtn, x, y)) { statsOpen = !statsOpen; return true }

    // equipped slots → unequip
    for (const s of L.slots) {
      if (hit(s, x, y)) { if (char.gear[s.key]) unequip(char, s.key); return true }
    }
    // grid items → equip (Alt → into ring2 when possible)
    const inv = char.inventory || []
    for (const c of L.cells) {
      if (hit(c, x, y)) { if (inv[c.i]) equip(char, c.i, alt); return true }
    }

    // click inside stats popup → swallow; click outside whole window → close
    if (statsOpen && hit(L.statsPanel, x, y)) return true
    if (x < L.px || x > L.px + L.PW || y < L.py || y > L.py + L.PH) { open = false }
    return true
  }

  // ---- tooltip helpers ----
  function fmtVal(v) { return (typeof v === 'number' && !Number.isInteger(v)) ? v.toFixed(2) : v }

  // Build the text lines for an item tooltip. When `compareTo` is provided,
  // additive stat lines get a colored (+/-) delta vs the equipped item.
  function buildTipLines(item, headerTag, compareTo) {
    const lines = []
    if (headerTag) lines.push({ t: headerTag, c: UI.textFaint, s: 9 })
    lines.push({ t: item.name, c: item.color || UI.text, b: true })
    const rar = (RARITY && RARITY[item.rarity]) ? RARITY[item.rarity].name : (item.rarity || '?')
    const cls = item.classes ? item.classes.join('/') : 'any class'
    const roll = (typeof item.rollPercent === 'number') ? item.rollPercent : item.rating
    lines.push({ t: `${rar}  •  ${item.slot || '?'}  •  ${cls}`, c: UI.textDim, s: 9 })
    if (typeof roll === 'number') lines.push({ t: `Roll ${roll}%`, c: UI.xp, s: 9 })

    const stats = item.stats || {}
    const cStats = (compareTo && compareTo.stats) || null
    for (const k in stats) {
      const base = (window.fmtStatLine) ? fmtStatLine(k, stats[k]) : `${k.toUpperCase()} ${fmtVal(stats[k])}`
      let t = base, c = (item.void && window.PCT_KEYS && PCT_KEYS[k]) ? '#b18bff' : '#d8e6f2'
      if (cStats && typeof stats[k] === 'number' && !(window.PCT_KEYS && PCT_KEYS[k])) {
        const d = Math.round((stats[k] - (cStats[k] || 0)) * 100) / 100
        if (d !== 0) t += d > 0 ? `  (+${fmtVal(d)})` : `  (${fmtVal(d)})`
      }
      lines.push({ t, c })
    }
    return lines
  }

  function drawTip(lines, accent, anchorX, anchorY, alignRight) {
    let w = 0
    for (const l of lines) { ctx.font = `${l.b ? 'bold ' : ''}${l.s || 10}px monospace`; w = Math.max(w, ctx.measureText(l.t).width) }
    const pw = w + 18, ph = lines.length * 14 + 12
    let px = alignRight ? anchorX - pw : anchorX
    px = Math.max(6, Math.min(px, canvas.width - pw - 6))
    let py = Math.max(6, Math.min(anchorY, canvas.height - ph - 6))
    uiPanel(px, py, pw, ph, 6, accent || '#888', 'rgba(6,8,16,0.96)')
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    let yy = py + 18
    for (const l of lines) {
      ctx.fillStyle = l.c; ctx.font = `${l.b ? 'bold ' : ''}${l.s || 10}px monospace`
      ctx.fillText(l.t, px + 9, yy); yy += 14
    }
    return { px, w: pw, h: ph }
  }

  // Hovered item near the mouse; equipped counterpart offset alongside it.
  function drawHoverTooltips(char, hoverItem, equippedItem) {
    if (!hoverItem) return
    const hx = mouse.x, hy = mouse.y
    // Hovered tooltip anchored to the LEFT of the cursor (window is on the right)
    const main = drawTip(buildTipLines(hoverItem, null, equippedItem), hoverItem.color, hx - 14, hy + 12, true)
    if (equippedItem && equippedItem !== hoverItem) {
      // Comparison tooltip to the left of the hovered one
      drawTip(buildTipLines(equippedItem, 'EQUIPPED', null), equippedItem.color, main.px - 8, hy + 12, true)
    }
  }

  // ---- rendering ----
  function drawSlot(s, char) {
    const it = char.gear[s.key]
    const meta = SLOT_META[s.key] || { label: s.key, ic: '?' }
    const hover = hit(s, mouse.x, mouse.y)
    uiPanel(s.x, s.y, s.w, s.h, 7, it ? (it.color || '#888') : (hover ? UI.accent + '66' : '#2a3450'),
            it ? hexA(it.color, 0.16) : UI.panelBg2)
    if (it) {
      ctx.fillStyle = it.color || UI.text; ctx.font = 'bold 18px monospace'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(meta.ic, s.x + s.w / 2, s.y + s.h / 2 - 4)
      ctx.fillStyle = '#d8e6f2'; ctx.font = '8px monospace'
      ctx.fillText(typeof it.rating === 'number' ? it.rating + '%' : '', s.x + s.w / 2, s.y + s.h - 8)
    } else {
      ctx.fillStyle = UI.textFaint; ctx.font = '8px monospace'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(meta.label, s.x + s.w / 2, s.y + s.h / 2)
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
  }

  function drawSilhouette(b, char) {
    const cls = CLASSES[char.classKey]
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = cls.color + '88'; ctx.fillStyle = cls.color + '22'; ctx.lineWidth = 2
    // head
    ctx.beginPath(); ctx.arc(cx, cy - 34, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    // torso
    ctx.beginPath()
    ctx.moveTo(cx - 16, cy - 18); ctx.lineTo(cx + 16, cy - 18)
    ctx.lineTo(cx + 12, cy + 22); ctx.lineTo(cx - 12, cy + 22); ctx.closePath()
    ctx.fill(); ctx.stroke()
    // legs
    ctx.beginPath(); ctx.moveTo(cx - 8, cy + 22); ctx.lineTo(cx - 9, cy + 50)
    ctx.moveTo(cx + 8, cy + 22); ctx.lineTo(cx + 9, cy + 50); ctx.stroke()
    // arms
    ctx.beginPath(); ctx.moveTo(cx - 16, cy - 14); ctx.lineTo(cx - 26, cy + 14)
    ctx.moveTo(cx + 16, cy - 14); ctx.lineTo(cx + 26, cy + 14); ctx.stroke()
    ctx.restore()
    ctx.fillStyle = UI.textFaint; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText(char.name, cx, b.y + b.h - 2)
    ctx.textAlign = 'left'
  }

  function renderStatsPanel(p, char) {
    uiPanel(p.x, p.y, p.w, p.h, 11, UI.panelBorder, UI.panelBg)
    ctx.fillStyle = UI.accent; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'
    ctx.fillText('STATS', p.x + 16, p.y + 26)
    ctx.strokeStyle = '#1f2740'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(p.x + 14, p.y + 34); ctx.lineTo(p.x + p.w - 14, p.y + 34); ctx.stroke()

    const dmg = (typeof calcDamage === 'function') ? calcDamage(char) : 0
    const acct = (typeof account !== 'undefined') ? account : { glory: 0 }
    const cap = (typeof LEVEL_CAP !== 'undefined' ? LEVEL_CAP : 20)
    const rows = [
      ['HP', `${compactNum(char.hp)} / ${compactNum(char.maxHp)}`, UI.hp],
      ['MP', `${compactNum(char.mp)} / ${compactNum(char.maxMp)}`, UI.mp],
      ['Damage', '' + dmg, UI.text],
      ['Armor', '' + (char.armor || 0), UI.text],
      ['Speed', '' + (char.spd || 0), UI.text],
      ['STR', '' + (char.str || 0), UI.textDim],
      ['DEX', '' + (char.dex || 0), UI.textDim],
      ['INT', '' + (char.int || 0), UI.textDim],
      ['HP Regen', (char.hpRegen || 0) + ' /s', UI.textDim],
      ['Level', '' + char.level, UI.text],
      ['XP', char.level >= cap ? 'MAX' : `${char.xp | 0} / ${char.xpNext | 0}`, UI.xp],
      ['Glory (life)', '' + (char.glory | 0), UI.glory],
      ['Account Glory', '' + ((acct.glory) | 0), UI.glory],
    ]
    let y = p.y + 54
    for (const [k, v, c] of rows) {
      ctx.fillStyle = UI.textDim; ctx.font = '11px monospace'; ctx.textAlign = 'left'
      ctx.fillText(k, p.x + 16, y)
      ctx.fillStyle = c; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'right'
      ctx.fillText(v, p.x + p.w - 16, y)
      y += 20
    }
    ctx.textAlign = 'left'

    // Dust below stats (salvage output / reforge fuel)
    y += 8
    ctx.fillStyle = UI.accent; ctx.font = 'bold 11px monospace'
    ctx.fillText('DUST', p.x + 16, y); y += 6
    ctx.strokeStyle = '#1f2740'; ctx.beginPath(); ctx.moveTo(p.x + 14, y); ctx.lineTo(p.x + p.w - 14, y); ctx.stroke()
    y += 16
    const dust = (typeof account !== 'undefined' && account.dust) || {}
    const dk = (typeof DUST !== 'undefined' ? Object.keys(DUST) : Object.keys(dust)).filter(k => (dust[k] | 0) > 0)
    if (!dk.length) { ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'; ctx.fillText('None — salvage items for dust.', p.x + 16, y); y += 16 }
    for (const k of dk) {
      const d = (typeof DUST !== 'undefined') ? DUST[k] : null
      ctx.fillStyle = (d && d.color) || '#ccc'
      ctx.beginPath(); ctx.arc(p.x + 20, y - 3, 4, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px monospace'; ctx.textAlign = 'left'
      ctx.fillText(d ? d.name : k, p.x + 30, y)
      ctx.fillStyle = UI.text; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right'
      ctx.fillText('x' + (dust[k] | 0), p.x + p.w - 16, y); y += 18
    }
    ctx.textAlign = 'left'
  }

  function render(char) {
    if (!open) return
    if (!ensureChar(char)) { open = false; return }
    const L = computeLayout()
    _layout = L
    const { px, py, PW, PH } = L

    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Stats popup (left of window) — drawn first so the main window reads on top.
    // On narrow windows it doesn't fit beside the window, so it's drawn LAST
    // (as an overlay) further below instead.
    if (statsOpen && L.statsFits) renderStatsPanel(L.statsPanel, char)

    // Main window
    uiPanel(px, py, PW, PH, 12, UI.panelBorder, UI.panelBg)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = UI.text; ctx.font = 'bold 14px monospace'
    ctx.fillText('CHARACTER', px + 18, py + 26)

    // STATS toggle button
    const sb = L.statsBtn, sActive = statsOpen, sHover = hit(sb, mouse.x, mouse.y)
    uiPanel(sb.x, sb.y, sb.w, sb.h, 5, sActive ? UI.accent : '#33405e',
            sActive ? 'rgba(76,201,240,0.18)' : (sHover ? 'rgba(255,255,255,0.06)' : UI.panelBg2))
    ctx.fillStyle = sActive ? UI.accent : UI.textDim; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('STATS', sb.x + sb.w / 2, sb.y + 14)

    // Close button
    const cb = L.closeBtn
    uiPanel(cb.x, cb.y, cb.w, cb.h, 5, UI.bad + '99', UI.panelBg2)
    ctx.fillStyle = UI.bad; ctx.font = 'bold 12px monospace'
    ctx.fillText('X', cb.x + cb.w / 2, cb.y + 14)
    ctx.textAlign = 'left'

    // Section label
    ctx.fillStyle = UI.textDim; ctx.font = 'bold 10px monospace'
    ctx.fillText('EQUIPMENT', px + 18, py + 42)

    // Equipment: silhouette behind, slots on top
    drawSilhouette(L.silhouette, char)
    let hoverEquipped = null
    for (const s of L.slots) {
      drawSlot(s, char)
      if (hit(s, mouse.x, mouse.y) && char.gear[s.key]) hoverEquipped = char.gear[s.key]
    }

    // Inventory grid
    const inv = char.inventory || []
    ctx.fillStyle = UI.textDim; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`INVENTORY   ${inv.length}/${CAP()}`, L.gridLabel.x, L.gridLabel.y)
    let hoverGrid = null
    for (const c of L.cells) {
      const it = inv[c.i]
      const isHover = hit(c, mouse.x, mouse.y)
      if (isHover && it) hoverGrid = it
      uiPanel(c.x, c.y, c.w, c.h, 6, it ? (it.color || '#888') : (isHover ? UI.accent + '55' : '#222b40'),
              it ? hexA(it.color, 0.15) : 'rgba(255,255,255,0.02)')
      if (it) {
        const meta = SLOT_META[it.slot] || SLOT_META[(it.slot === 'ring' ? 'ring1' : it.slot)] || { ic: (it.slot || '?')[0].toUpperCase() }
        ctx.fillStyle = it.color || UI.text; ctx.font = 'bold 18px monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(meta.ic || (it.slot || '?')[0].toUpperCase(), c.x + c.w / 2, c.y + c.h / 2 - 4)
        ctx.fillStyle = '#d8e6f2'; ctx.font = '8px monospace'
        ctx.fillText(typeof it.rating === 'number' ? it.rating + '%' : '', c.x + c.w / 2, c.y + c.h - 8)
      }
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'

    // Hint / flash message footer
    if (_msg && Date.now() - _msg.at < 2500) {
      ctx.fillStyle = _msg.color; ctx.font = 'bold 11px monospace'
      ctx.fillText(_msg.text, px + 18, py + PH - 12)
    } else {
      ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'
      ctx.fillText('[I] close   •   click item to equip   •   click slot to unequip', px + 18, py + PH - 12)
    }

    // Narrow window: draw the stats popup on top as an overlay (no room beside).
    if (statsOpen && !L.statsFits) renderStatsPanel(L.statsPanel, char)

    // Tooltips (on top of everything). Alt compares a ring against ring2.
    if (hoverGrid) {
      const slot = compareSlot(char, hoverGrid, altHeld())
      drawHoverTooltips(char, hoverGrid, slot ? char.gear[slot] : null)
    } else if (hoverEquipped) {
      drawHoverTooltips(char, hoverEquipped, null)
    }
  }

  function hexA(hex, a) {
    if (typeof hex !== 'string' || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return `rgba(200,200,200,${a})`
    let r, g, b
    if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16) }
    else { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16) }
    return `rgba(${r},${g},${b},${a})`
  }

  // ---- console-only debug helpers ----
  function debugGiveItem(defKey) {
    try {
      const c = (typeof G !== 'undefined') && G.char
      if (!c) return 'no active character'
      const defKeys = (typeof ITEM_DEFS !== 'undefined') ? Object.keys(ITEM_DEFS) : []
      const key = defKey || defKeys[0]
      if (!key || !ITEM_DEFS[key]) return 'unknown defKey. valid: ' + defKeys.join(', ')
      const it = rollItemInstance(key, ITEM_DEFS[key].source || null)
      if (!it) return 'roll failed for: ' + key
      if (!addItemToInventory(c, it)) return 'inventory full'
      if (window.saveGame) saveGame()
      return `gave ${it.name} (${it.rating}%)`
    } catch (e) { return 'debugGiveItem error: ' + String(e) }
  }

  function debugState() {
    try {
      const c = (typeof G !== 'undefined') && G.char
      return {
        open, statsOpen,
        zone: (typeof G !== 'undefined') ? G.zone : null,
        char: c ? {
          id: c.id, classKey: c.classKey, level: c.level, alive: c.alive,
          invCount: Array.isArray(c.inventory) ? c.inventory.length : 0, cap: CAP(),
          gear: Object.keys(c.gear || {}).reduce((o, k) => { o[k] = c.gear[k] ? `${c.gear[k].name} (${c.gear[k].rating}%)` : null; return o }, {}),
        } : null,
      }
    } catch (e) { return { error: String(e) } }
  }

  return { update, render, onClick, isOpen, equip, unequip, debugGiveItem, debugState }
})()

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  if (Inventory.isOpen() && typeof G !== 'undefined' && G.char) {
    if (Inventory.onClick(e.clientX, e.clientY, G.char, e.altKey)) { e.stopPropagation() }
  }
}, true)

window.Inventory = Inventory
