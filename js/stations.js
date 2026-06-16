// ============================================================
// STATIONS — Salvage, Reforge, Fusion, Gamble, Vault transfer
// ------------------------------------------------------------
// Modal canvas panels opened from nexus stations / vault chests.
// While open, gameplay input is suppressed (Stations.isOpen()).
// Shares the item model in items.js. Clicks routed via mousedown.
// ============================================================

const Stations = (() => {
  let open = false
  let mode = null               // 'salvage'|'reforge'|'fusion'|'gamble'|'vault'
  let sel = []                  // selected inventory indices
  let gambleSlot = 'weapon'
  let msg = null                // { text, color }
  let _L = null

  const TITLES = {
    salvage: 'SALVAGE — destroy items for dust',
    reforge: 'REFORGE — reroll roll% using dust',
    fusion:  'FUSION — combine 3 identical items',
    gamble:  'GAMBLE — spend Glory for a random item',
    vault:   'VAULT — store items safely (survives death)',
  }

  function isOpen() { return open }
  function flash(t, c) { msg = { text: t, color: c || '#e0fbfc' } }

  function openPanel(m) {
    open = true; mode = m; sel = []; msg = null
    if (window.ensureDust) ensureDust(account)
    if (account.stash == null) account.stash = []
  }
  function close() { open = false; mode = null; sel = [] }

  function maxSel() { return mode === 'reforge' ? 1 : mode === 'fusion' ? 3 : mode === 'salvage' ? 99 : 0 }
  function toggleSel(i) {
    const k = sel.indexOf(i)
    if (k >= 0) { sel.splice(k, 1); return }
    if (sel.length >= maxSel()) { if (maxSel() === 1) sel = [i]; else return }
    else sel.push(i)
  }

  // ---- layout ----
  function layout() {
    const PW = 680, PH = 540
    const px = ((canvas.width - PW) / 2) | 0
    const py = ((canvas.height - PH) / 2) | 0
    const closeBtn = { x: px + PW - 30, y: py + 10, w: 20, h: 20 }

    const cell = 52, gap = 6, cols = 5
    const gx = px + 20, gy = py + 70
    const cells = []
    for (let i = 0; i < cols * 6; i++) {
      const c = i % cols, r = (i / cols) | 0
      cells.push({ i, x: gx + c * (cell + gap), y: gy + r * (cell + gap), w: cell, h: cell })
    }
    // right column (stash grid for vault, controls otherwise)
    const rx = px + 360
    const rcells = []
    for (let i = 0; i < cols * 6; i++) {
      const c = i % cols, r = (i / cols) | 0
      rcells.push({ i, x: rx + c * (cell + gap), y: gy + r * (cell + gap), w: cell, h: cell })
    }
    const actionBtn = { x: px + PW - 200, y: py + PH - 40, w: 180, h: 28 }
    const slotBtns = GAMBLE_SLOTS.map((s, i) => ({ s, x: rx, y: gy + i * 34, w: 150, h: 28 }))
    return { PW, PH, px, py, closeBtn, cell, gap, cols, gx, gy, cells, rx, rcells, actionBtn, slotBtns }
  }

  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  // ---- actions ----
  function doAction(char) {
    if (mode === 'salvage') {
      if (!sel.length) { flash('Select items to salvage', '#ff6b6b'); return }
      const idxs = sel.slice().sort((a, b) => b - a)
      let n = 0
      for (const i of idxs) { const it = char.inventory[i]; if (it) { salvageItem(account, it); char.inventory.splice(i, 1); n++ } }
      sel = []
      if (window.saveGame) saveGame()
      flash(`Salvaged ${n} item(s) into dust`, '#b18bff')
    } else if (mode === 'reforge') {
      if (sel.length !== 1) { flash('Select one item', '#ff6b6b'); return }
      const it = char.inventory[sel[0]]
      const res = reforgeItem(account, it)
      if (res.error) { flash(res.error, '#ff6b6b'); return }
      char.inventory[sel[0]] = res.item
      if (window.saveGame) saveGame()
      flash(`Reforged → Roll ${res.item.rollPercent}%`, res.item.color)
    } else if (mode === 'fusion') {
      if (sel.length !== 3) { flash('Select exactly 3 items', '#ff6b6b'); return }
      const items = sel.map(i => char.inventory[i])
      const res = fuseItems(items)
      if (res.error) { flash(res.error, '#ff6b6b'); return }
      const idxs = sel.slice().sort((a, b) => b - a)
      for (const i of idxs) char.inventory.splice(i, 1)
      sel = []
      addItemToInventory(char, res.item)
      if (window.saveGame) saveGame()
      flash(`Fused → ${res.item.name} Roll ${res.item.rollPercent}%`, res.item.color)
    } else if (mode === 'gamble') {
      const res = gambleItem(account, char, gambleSlot)
      if (res.error) { flash(res.error, '#ff6b6b'); return }
      if (!addItemToInventory(char, res.item)) { account.glory += GAMBLE_COST; flash('Inventory full', '#ff6b6b'); return }
      if (window.saveGame) saveGame()
      flash(`Won ${res.item.name} (${RARITY[res.item.rarity].name}) Roll ${res.item.rollPercent}%`, res.item.color)
    }
  }

  function onClick(x, y, char) {
    if (!open || !_L) return false
    const L = _L
    if (hit(L.closeBtn, x, y)) { close(); return true }
    if (x < L.px || x > L.px + L.PW || y < L.py || y > L.py + L.PH) { close(); return true }

    if (mode === 'gamble') {
      for (const b of L.slotBtns) if (hit(b, x, y)) { gambleSlot = b.s; return true }
      if (hit(L.actionBtn, x, y)) { doAction(char); return true }
      return true
    }

    if (mode === 'vault') {
      // left grid = inventory → deposit to stash
      for (const c of L.cells) if (hit(c, x, y)) {
        const it = char.inventory[c.i]
        if (it) {
          if (account.stash.length >= 60) { flash('Stash full', '#ff6b6b'); return true }
          char.inventory.splice(c.i, 1); account.stash.push(it)
          if (window.saveGame) saveGame(); flash(`Stashed ${it.name}`, it.color)
        }
        return true
      }
      // right grid = stash → withdraw to inventory
      for (const c of L.rcells) if (hit(c, x, y)) {
        const it = account.stash[c.i]
        if (it) {
          if (char.inventory.length >= INVENTORY_CAP) { flash('Inventory full', '#ff6b6b'); return true }
          account.stash.splice(c.i, 1); char.inventory.push(it)
          if (window.saveGame) saveGame(); flash(`Withdrew ${it.name}`, it.color)
        }
        return true
      }
      return true
    }

    // salvage/reforge/fusion: select inventory cells + action
    if (hit(L.actionBtn, x, y)) { doAction(char); return true }
    for (const c of L.cells) if (hit(c, x, y)) { if (char.inventory[c.i]) toggleSel(c.i); return true }
    return true
  }

  // ---- render helpers ----
  function drawCell(c, it, selected) {
    const hov = hit(c, mouse.x, mouse.y)
    ctx.fillStyle = it ? hexA(it.color, 0.16) : 'rgba(255,255,255,0.02)'
    ctx.fillRect(c.x, c.y, c.w, c.h)
    ctx.lineWidth = selected ? 2.5 : 1
    ctx.strokeStyle = selected ? '#ffd60a' : it ? (it.color || '#888') : '#2a2f44'
    ctx.strokeRect(c.x, c.y, c.w, c.h)
    if (it) {
      ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'
      ctx.fillText((it.slot || '?')[0].toUpperCase(), c.x + c.w / 2, c.y + 24)
      ctx.fillStyle = '#d8e6f2'; ctx.font = '9px monospace'
      ctx.fillText((it.rollPercent != null ? it.rollPercent : it.rating || 0) + '%', c.x + c.w / 2, c.y + 42)
      ctx.textAlign = 'left'
    }
    return hov && it ? it : null
  }

  function hexA(hex, a) {
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return `rgba(200,200,200,${a})`
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  function render(char) {
    if (!open) return
    if (!char || !Array.isArray(char.inventory)) { close(); return }
    const L = layout(); _L = L
    const { px, py, PW, PH } = L

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(10,12,26,0.97)'; ctx.strokeStyle = '#b15bff66'; ctx.lineWidth = 1
    ctx.fillRect(px, py, PW, PH); ctx.strokeRect(px, py, PW, PH)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 14px monospace'
    ctx.fillText(TITLES[mode] || mode, px + 20, py + 30)
    ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'
    ctx.fillText(`Glory: ${(account.glory | 0).toLocaleString()}`, px + 20, py + 48)

    // close
    ctx.strokeStyle = '#ff6b6b88'; ctx.strokeRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h)
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('X', L.closeBtn.x + 10, L.closeBtn.y + 14); ctx.textAlign = 'left'

    let hoverItem = null

    if (mode === 'gamble') {
      hoverItem = renderGamble(L, char)
    } else if (mode === 'vault') {
      hoverItem = renderVault(L, char)
    } else {
      // inventory grid (left)
      ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'
      ctx.fillText(`INVENTORY ${char.inventory.length}/${INVENTORY_CAP}`, L.gx, L.gy - 6)
      for (const c of L.cells) { const h = drawCell(c, char.inventory[c.i], sel.indexOf(c.i) >= 0); if (h) hoverItem = h }
      hoverItem = renderRightInfo(L, char) || hoverItem
    }

    // dust totals (bottom-left strip)
    renderDustStrip(L)

    // action button
    if (mode !== 'vault') drawActionButton(L, char)

    // message
    if (msg) { ctx.fillStyle = msg.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.fillText(msg.text, px + 20, py + PH - 50) }

    if (hoverItem) renderItemTooltip(hoverItem, mouse.x + 12, mouse.y + 12)
  }

  function renderRightInfo(L, char) {
    const rx = L.rx, ry = L.gy
    ctx.textAlign = 'left'
    if (mode === 'reforge') {
      ctx.fillStyle = '#9fb3c8'; ctx.font = '11px monospace'
      ctx.fillText(`Cost: ${REFORGE_COST} dust of item rarity`, rx, ry)
      ctx.fillText('Rerolls roll% only.', rx, ry + 18)
      ctx.fillText('Type, rarity, affixes unchanged.', rx, ry + 34)
      if (sel.length === 1) { const it = char.inventory[sel[0]]; if (it) drawItemSummary(rx, ry + 60, it) }
    } else if (mode === 'fusion') {
      ctx.fillStyle = '#9fb3c8'; ctx.font = '11px monospace'
      ctx.fillText('Pick 3 of the SAME base + rarity.', rx, ry)
      ctx.fillText('New roll: highest of the 3 → 100.', rx, ry + 18)
      const items = sel.map(i => char.inventory[i]).filter(Boolean)
      ctx.fillStyle = (items.length === 3 && canFuse(items)) ? '#7CFC9A' : '#ff8888'
      ctx.fillText(`Selected: ${items.length}/3${items.length === 3 ? (canFuse(items) ? ' ✓' : ' ✗ mismatch') : ''}`, rx, ry + 44)
      let yy = ry + 66
      for (const it of items) { drawItemSummary(rx, yy, it); yy += 22 }
    } else if (mode === 'salvage') {
      ctx.fillStyle = '#9fb3c8'; ctx.font = '11px monospace'
      ctx.fillText('Select items, then Salvage.', rx, ry)
      ctx.fillText('Returns dust of each rarity.', rx, ry + 18)
      ctx.fillStyle = '#b18bff'; ctx.fillText(`Selected: ${sel.length}`, rx, ry + 40)
    }
    return null
  }

  function drawItemSummary(x, y, it) {
    ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = '10px monospace'
    ctx.fillText(`${it.name} (${RARITY[it.rarity].name}) ${it.rollPercent != null ? it.rollPercent : it.rating}%`, x, y)
  }

  function renderGamble(L, char) {
    const rx = L.rx, ry = L.gy
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('CHOOSE SLOT', rx, ry - 6)
    for (const b of L.slotBtns) {
      const active = gambleSlot === b.s, hov = hit(b, mouse.x, mouse.y)
      ctx.fillStyle = active ? 'rgba(177,91,255,0.25)' : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? '#b15bff' : '#334'; ctx.lineWidth = 1
      ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.fillStyle = active ? '#b15bff' : '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
      ctx.fillText(b.s.toUpperCase(), b.x + 10, b.y + 18)
    }
    ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'
    ctx.fillText(`Class-filtered for ${CLASSES[char.classKey].name}.`, L.gx, L.gy + 8)
    ctx.fillText(`Cost: ${GAMBLE_COST} Glory per roll.`, L.gx, L.gy + 26)
    return null
  }

  function renderVault(L, char) {
    let hov = null
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`INVENTORY ${char.inventory.length}/${INVENTORY_CAP}  (click → stash)`, L.gx, L.gy - 6)
    ctx.fillText(`VAULT ${account.stash.length}/60  (click → inventory)`, L.rx, L.gy - 6)
    for (const c of L.cells) { const h = drawCell(c, char.inventory[c.i], false); if (h) hov = h }
    for (const c of L.rcells) { const h = drawCell(c, account.stash[c.i], false); if (h) hov = h }
    return hov
  }

  function renderDustStrip(L) {
    ensureDust(account)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'
    let x = L.px + 20, y = L.py + L.PH - 22
    ctx.fillText('DUST:', x, y); x += 44
    ctx.font = '10px monospace'
    for (const k of RARITY_ORDER) {
      const n = account.dust[k] || 0
      ctx.fillStyle = (DUST[k] || {}).color || '#ccc'
      ctx.fillText(`${k[0].toUpperCase()}${n}`, x, y); x += 36
    }
  }

  function drawActionButton(L, char) {
    const b = L.actionBtn
    const labels = { salvage: 'SALVAGE SELECTED', reforge: 'REFORGE', fusion: 'FUSE', gamble: `GAMBLE (${GAMBLE_COST}G)` }
    ctx.fillStyle = 'rgba(76,201,240,0.20)'; ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1
    ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = '#4cc9f0'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText(labels[mode] || 'GO', b.x + b.w / 2, b.y + 18); ctx.textAlign = 'left'
  }

  // Esc closes
  window.addEventListener('keydown', e => {
    if (open && e.code === 'Escape') { close(); e.stopPropagation(); e.preventDefault() }
  }, true)

  return { isOpen, open: openPanel, close, render, onClick }
})()

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  if (Stations.isOpen() && typeof G !== 'undefined' && G.char) {
    if (Stations.onClick(e.clientX, e.clientY, G.char)) e.stopPropagation()
  }
}, true)

window.Stations = Stations
