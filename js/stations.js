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
  let lastGamble = null         // most recent gambled item (shown in the result box)
  let msg = null                // { text, color }
  let _L = null
  // ---- vault view state ----
  const STASH_CAP = 60
  let vaultFilter = 'all'       // all|weapon|armor|acc|ability|rarity
  let vaultScroll = 0           // top ROW offset of the scrollable stash grid
  let vaultSortKey = 'rarity'   // rarity|slot|rating (cycled by Sort button)
  let vDrag = null              // active bank drag: { from:'inv'|'stash', idx, item }
  const VAULT_TABS = [
    { key: 'all',     label: 'ALL' },
    { key: 'weapon',  label: 'WEAP' },
    { key: 'armor',   label: 'ARMOR' },
    { key: 'acc',     label: 'ACC' },
    { key: 'ability', label: 'ABIL' },
    { key: 'rarity',  label: 'HI★' },
  ]
  const VAULT_ARMOR = ['helmet', 'chest', 'hands', 'pants', 'boots']
  const VAULT_ACC = ['ring', 'amulet']
  const VAULT_HI = ['epic', 'legendary', 'mythic', 'void']
  const SLOT_SORT_ORDER = ['weapon', 'helmet', 'chest', 'hands', 'pants', 'boots', 'ring', 'amulet', 'ability']

  // Equipped slots that can be reforged in-place (single items only; a dual-wield
  // weapon array has no baseKey and is skipped). Selection token for an equipped
  // slot is the string 'g:<slotKey>' (inventory selections stay numeric indices).
  const REFORGE_GEAR_KEYS = ['weapon', 'helmet', 'chest', 'hands', 'pants', 'boots', 'ring1', 'ring2', 'amulet', 'ability']

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
    open = true; mode = m; sel = []; msg = null; lastGamble = null
    vaultFilter = 'all'; vaultScroll = 0; vDrag = null
    if (window.ensureDust) ensureDust(account)
    if (!Array.isArray(account.stash)) account.stash = []
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
    // Gamble slot picker lives on the LEFT now (one row per equippable slot).
    const slotBtns = GAMBLE_SLOTS.map((s, i) => ({ s, x: gx, y: gy + i * 30, w: 170, h: 26 }))
    return { PW, PH, px, py, closeBtn, cell, gap, cols, gx, gy, cells, rx, rcells, actionBtn, slotBtns }
  }

  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  // ---- actions ----
  function doAction(char) {
    if (mode === 'salvage') {
      if (!sel.length) { flash('Select items to salvage', '#ff6b6b'); return }
      let n = 0
      // Slot-stable: clear salvaged slots in place (leave holes) so unrelated
      // items keep their positions.
      for (const i of sel) { const it = char.inventory[i]; if (it) { salvageItem(account, it); char.inventory[i] = null; n++ } }
      sel = []
      if (window.saveGame) saveGame()
      flash(`Salvaged ${n} item(s) into dust`, '#b18bff')
    } else if (mode === 'reforge') {
      if (sel.length !== 1) { flash('Select one item', '#ff6b6b'); return }
      const t = sel[0]
      if (typeof t === 'string' && t.indexOf('g:') === 0) {
        // Equipped gear: reforge in place. reforgeItem preserves id/baseKey/
        // rarity/slot/affixes, so the item stays equipped — no dup/delete.
        const key = t.slice(2)
        const it = char.gear && char.gear[key]
        if (!it) { flash('No equipped item there', '#ff6b6b'); return }
        const res = reforgeItem(account, it)
        if (res.error) { flash(res.error, '#ff6b6b'); return }
        char.gear[key] = res.item
        if (typeof recalcStats === 'function') recalcStats(char)
        if (window.saveGame) saveGame()
        flash(`Reforged ${res.item.name} → Roll ${res.item.rollPercent}%`, res.item.color)
      } else {
        const it = char.inventory[t]
        const res = reforgeItem(account, it)
        if (res.error) { flash(res.error, '#ff6b6b'); return }
        char.inventory[t] = res.item
        if (window.saveGame) saveGame()
        flash(`Reforged → Roll ${res.item.rollPercent}%`, res.item.color)
      }
    } else if (mode === 'fusion') {
      if (sel.length !== 3) { flash('Select exactly 3 items', '#ff6b6b'); return }
      const items = sel.map(i => char.inventory[i])
      const res = fuseItems(items)
      if (res.error) { flash(res.error, '#ff6b6b'); return }
      // Slot-stable: clear the 3 consumed slots in place, drop the result into
      // the first empty slot (reuses one of the now-empty consumed slots).
      for (const i of sel) char.inventory[i] = null
      sel = []
      addItemToInventory(char, res.item)
      if (window.saveGame) saveGame()
      flash(`Fused → ${res.item.name} Roll ${res.item.rollPercent}%`, res.item.color)
    } else if (mode === 'gamble') {
      const res = gambleItem(account, char, gambleSlot)
      if (res.error) { flash(res.error, '#ff6b6b'); return }
      if (!addItemToInventory(char, res.item)) { account.glory += (res.cost || 0); flash('Inventory full', '#ff6b6b'); return }
      lastGamble = res.item   // show in the result box (hover for tooltip)
      if (window.saveGame) saveGame()
      flash(`Won ${res.item.name} (${RARITY[res.item.rarity].name}) Roll ${res.item.rollPercent}%`, res.item.color)
    }
  }

  // Left mouse-down. In the vault this starts a drag (grid cells) or hits a
  // control; in other modes it selects cells / presses buttons (old behavior).
  function onMouseDown(x, y, char) {
    if (window.Options && Options.isOpen()) return false
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
      if (L.vaultTabs) for (const t of L.vaultTabs) if (hit(t, x, y)) { vaultFilter = t.key; vaultScroll = 0; return true }
      if (L.vaultSort && hit(L.vaultSort, x, y)) { cycleSort(); return true }
      if (L.vaultUp && hit(L.vaultUp, x, y)) { vaultScroll = Math.max(0, vaultScroll - 1); return true }
      if (L.vaultDown && hit(L.vaultDown, x, y)) { vaultScroll++; return true }   // clamped on render
      // start a drag from a filled inventory or stash cell
      for (const c of L.cells) if (hit(c, x, y)) {
        const it = char.inventory[c.i]
        if (it) vDrag = { from: 'inv', idx: c.i, item: it, x, y, sx: x, sy: y, moved: false }
        return true
      }
      for (const c of L.rcells) if (hit(c, x, y)) {
        const si = c._stashIdx
        if (si != null && si >= 0 && account.stash[si]) vDrag = { from: 'stash', idx: si, item: account.stash[si], x, y, sx: x, sy: y, moved: false }
        return true
      }
      return true
    }

    // salvage/reforge/fusion: select inventory cells + action
    if (hit(L.actionBtn, x, y)) { doAction(char); return true }
    // reforge also accepts equipped-gear cells (rendered in the right column)
    if (mode === 'reforge' && L.gearCells) {
      for (const c of L.gearCells) if (hit(c, x, y)) { toggleSel('g:' + c.gkey); return true }
    }
    for (const c of L.cells) if (hit(c, x, y)) { if (char.inventory[c.i]) toggleSel(c.i); return true }
    return true
  }

  function onMouseMove(x, y) {
    if (vDrag) { vDrag.x = x; vDrag.y = y; if (Math.abs(x - vDrag.sx) > 4 || Math.abs(y - vDrag.sy) > 4) vDrag.moved = true }
  }

  // Resolve a bank drag-drop. Items can be dropped into ANY stash slot (deposit /
  // rearrange) or any inventory slot (withdraw); occupied targets swap.
  function onMouseUp(x, y, char) {
    const d = vDrag; vDrag = null
    if (!d || !open || mode !== 'vault' || !_L) return
    const L = _L
    if (d.from === 'inv') {
      for (const c of L.rcells) if (hit(c, x, y)) {
        let si = c._stashIdx
        if (si == null) return
        if (si < 0) { si = firstEmptySlot(account.stash, STASH_CAP); if (si < 0) { flash('Stash full', '#ff6b6b'); return } }
        const cur = account.stash[si]
        account.stash[si] = d.item; char.inventory[d.idx] = cur || null
        if (window.saveGame) saveGame(); flash(`Stashed ${d.item.name}`, d.item.color)
        return
      }
    } else if (d.from === 'stash') {
      for (const c of L.cells) if (hit(c, x, y)) {
        const cur = char.inventory[c.i]
        char.inventory[c.i] = d.item; account.stash[d.idx] = cur || null
        if (window.saveGame) saveGame(); flash(`Withdrew ${d.item.name}`, d.item.color)
        return
      }
      for (const c of L.rcells) if (hit(c, x, y)) {
        const si = c._stashIdx
        if (si == null || si < 0) return
        const cur = account.stash[si]
        account.stash[si] = d.item; account.stash[d.idx] = cur || null
        if (window.saveGame) saveGame()
        return
      }
    }
  }

  // Right-click = quick deposit (inventory → bank) / withdraw (bank → inventory).
  function onRightClick(x, y, char) {
    if (window.Options && Options.isOpen()) return false
    if (!open || !_L || mode !== 'vault') return false
    const L = _L
    for (const c of L.cells) if (hit(c, x, y)) {
      const it = char.inventory[c.i]
      if (it) {
        const si = firstEmptySlot(account.stash, STASH_CAP)
        if (si < 0) { flash('Stash full', '#ff6b6b'); return true }
        account.stash[si] = it; char.inventory[c.i] = null
        if (window.saveGame) saveGame(); flash(`Stashed ${it.name}`, it.color)
      }
      return true
    }
    for (const c of L.rcells) if (hit(c, x, y)) {
      const si = c._stashIdx
      if (si == null || si < 0) return true
      const it = account.stash[si]
      if (it) {
        const ii = firstEmptySlot(char.inventory, INVENTORY_CAP)
        if (ii < 0) { flash('Inventory full', '#ff6b6b'); return true }
        char.inventory[ii] = it; account.stash[si] = null
        if (window.saveGame) saveGame(); flash(`Withdrew ${it.name}`, it.color)
      }
      return true
    }
    return false
  }

  function onWheel(x, y, deltaY) {
    if (!open || mode !== 'vault' || !_L) return false
    const L = _L
    if (x < L.rx - 12 || x > L.px + L.PW || y < L.gy - 12) return false
    vaultScroll = Math.max(0, vaultScroll + (deltaY > 0 ? 1 : -1))
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
      ctx.fillText(`INVENTORY ${invItemCount(char.inventory)}/${INVENTORY_CAP}`, L.gx, L.gy - 6)
      for (const c of L.cells) { const h = drawCell(c, char.inventory[c.i], sel.indexOf(c.i) >= 0); if (h) hoverItem = h }
      hoverItem = renderRightInfo(L, char) || hoverItem
    }

    // dust totals (bottom-left strip)
    renderDustStrip(L)

    // action button
    if (mode !== 'vault') drawActionButton(L, char)

    // Reforge dust cost — shown near the button ONLY once an item is selected.
    if (mode === 'reforge' && sel.length === 1) {
      const t = sel[0]
      const selItem = (typeof t === 'string' && t.indexOf('g:') === 0)
        ? (char.gear && char.gear[t.slice(2)]) : char.inventory[t]
      if (selItem) {
        const r = selItem.rarity || 'common'
        const have = (account.dust && account.dust[r]) || 0
        const enough = have >= REFORGE_COST
        ctx.fillStyle = enough ? '#7CFC9A' : '#ff8888'; ctx.font = '10px monospace'; ctx.textAlign = 'right'
        ctx.fillText(`Cost: ${REFORGE_COST} ${(DUST[r] || {}).name || r}  (have ${have})`,
          L.actionBtn.x + L.actionBtn.w, L.actionBtn.y - 6)
        ctx.textAlign = 'left'
      }
    }

    // message
    if (msg) { ctx.fillStyle = msg.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.fillText(msg.text, px + 20, py + PH - 50) }

    // Bank drag ghost — the dragged item follows the cursor.
    if (vDrag && vDrag.item && vDrag.moved) {
      const it = vDrag.item
      ctx.fillStyle = hexA(it.color, 0.3); ctx.strokeStyle = it.color || '#888'; ctx.lineWidth = 1
      ctx.fillRect(mouse.x - 16, mouse.y - 16, 32, 32); ctx.strokeRect(mouse.x - 16, mouse.y - 16, 32, 32)
      const drew = (typeof Sprites !== 'undefined') && Sprites.drawForItem(it, mouse.x, mouse.y - 2, 26)
      if (!drew) {
        ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'
        ctx.fillText((it.slot || '?')[0].toUpperCase(), mouse.x, mouse.y + 2); ctx.textAlign = 'left'
      }
    } else if (hoverItem) {
      renderItemTooltip(hoverItem, mouse.x + 12, mouse.y + 12)
    }
  }

  function renderRightInfo(L, char) {
    const rx = L.rx, ry = L.gy
    ctx.textAlign = 'left'
    if (mode === 'reforge') {
      let hov = null
      ctx.fillStyle = '#9fb3c8'; ctx.font = '11px monospace'
      ctx.fillText('Rerolls roll% only. Type / rarity / affixes kept.', rx, ry)
      // Equipped gear is also reforgeable (in place). It's drawn here on the RIGHT
      // with a gold-tagged box + header so it's clearly distinct from the cyan
      // INVENTORY grid on the left. Selection token is 'g:<slotKey>'.
      const cw = 52, ch = 52, gp = 6, cols = 5, headY = ry + 24, gy0 = headY + 16
      ctx.fillStyle = '#ffd60a'; ctx.font = 'bold 10px monospace'
      ctx.fillText('EQUIPPED GEAR — click to reforge in place', rx, headY)
      L.gearCells = []
      let n = 0
      for (const key of REFORGE_GEAR_KEYS) {
        const it = char.gear && char.gear[key]
        if (!it || !it.baseKey) continue   // skip empty + dual-wield arrays
        const cc = n % cols, rr = (n / cols) | 0
        const cell = { x: rx + cc * (cw + gp), y: gy0 + rr * (ch + gp), w: cw, h: ch, gkey: key }
        const h = drawCell(cell, it, sel.indexOf('g:' + key) >= 0)
        // Gold top stripe marks these as EQUIPPED (vs plain inventory cells).
        ctx.fillStyle = '#ffd60a'; ctx.fillRect(cell.x, cell.y, cell.w, 3)
        if (h) hov = h
        L.gearCells.push(cell)
        n++
      }
      // selected item summary (equipped token or inventory index)
      const t = sel[0]
      let selItem = null
      if (typeof t === 'string' && t.indexOf('g:') === 0) selItem = char.gear && char.gear[t.slice(2)]
      else if (typeof t === 'number') selItem = char.inventory[t]
      if (selItem) drawItemSummary(rx, gy0 + 2 * (ch + gp) + 16, selItem)
      return hov
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
      ctx.fillStyle = '#b18bff'; ctx.font = 'bold 11px monospace'
      ctx.fillText(`Selected: ${sel.length}`, rx, ry + 22)
      // Preview the dust you'll get, broken down by type, BEFORE salvaging.
      const yields = {}
      for (const i of sel) {
        const it = char.inventory[i]; if (!it) continue
        const r = it.rarity || 'common'
        yields[r] = (yields[r] || 0) + (RARITY[r] || RARITY.common).tier
      }
      ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'
      ctx.fillText("YOU'LL GET:", rx, ry + 48)
      let yy = ry + 66
      const order = (typeof RARITY_ORDER !== 'undefined') ? RARITY_ORDER : Object.keys(yields)
      const any = order.some(k => yields[k])
      if (!any) { ctx.fillStyle = '#6b7b90'; ctx.font = '10px monospace'; ctx.fillText('— nothing selected —', rx, yy) }
      for (const k of order) {
        if (!yields[k]) continue
        const d = (typeof DUST !== 'undefined') ? DUST[k] : null
        ctx.fillStyle = (d && d.color) || '#ccc'
        ctx.beginPath(); ctx.arc(rx + 5, yy - 3, 4, 0, Math.PI * 2); ctx.fill()
        ctx.font = '10px monospace'; ctx.textAlign = 'left'
        ctx.fillText(`${d ? d.name : k}  +${yields[k]}`, rx + 16, yy)
        yy += 17
      }
    }
    return null
  }

  function drawItemSummary(x, y, it) {
    ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = '10px monospace'
    ctx.fillText(`${it.name} (${RARITY[it.rarity].name}) ${it.rollPercent != null ? it.rollPercent : it.rating}%`, x, y)
  }

  function renderGamble(L, char) {
    const costOf = (typeof gambleCost === 'function') ? gambleCost : (() => GAMBLE_COST)
    ctx.textAlign = 'left'
    // --- LEFT: choose slot (each row shows its own Glory cost) ---
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('CHOOSE SLOT', L.gx, L.gy - 6)
    for (const b of L.slotBtns) {
      const active = gambleSlot === b.s, hov = hit(b, mouse.x, mouse.y)
      ctx.fillStyle = active ? 'rgba(177,91,255,0.25)' : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? '#b15bff' : '#334'; ctx.lineWidth = 1
      ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.fillStyle = active ? '#d9b8ff' : '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
      ctx.fillText(b.s.toUpperCase(), b.x + 10, b.y + 17)
      ctx.fillStyle = '#ffd60a'; ctx.font = '10px monospace'; ctx.textAlign = 'right'
      ctx.fillText(costOf(b.s) + 'G', b.x + b.w - 8, b.y + 17)
    }
    ctx.textAlign = 'left'

    // --- RIGHT: result box (shows the last item won; hover for full tooltip) ---
    const rx = L.rx, ry = L.gy
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('RESULT', rx, ry - 6)
    const box = { x: rx, y: ry + 4, w: 230, h: 158 }
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.strokeStyle = lastGamble ? (lastGamble.color || '#445') : '#334'; ctx.lineWidth = 1
    ctx.fillRect(box.x, box.y, box.w, box.h); ctx.strokeRect(box.x, box.y, box.w, box.h)
    let hov = null
    if (lastGamble) {
      const it = lastGamble
      const drew = (typeof Sprites !== 'undefined') && Sprites.drawForItem(it, box.x + box.w / 2, box.y + 52, 52)
      if (!drew) {
        ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'center'
        ctx.fillText((it.slot || '?')[0].toUpperCase(), box.x + box.w / 2, box.y + 64)
      }
      ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
      ctx.fillText(it.name, box.x + box.w / 2, box.y + 102)
      ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'
      ctx.fillText(`${RARITY[it.rarity].name} • Roll ${it.rollPercent != null ? it.rollPercent : it.rating}%`, box.x + box.w / 2, box.y + 120)
      ctx.fillStyle = '#6b7b90'; ctx.font = '9px monospace'
      ctx.fillText('hover for details', box.x + box.w / 2, box.y + 142)
      ctx.textAlign = 'left'
      if (hit(box, mouse.x, mouse.y)) hov = it
    } else {
      ctx.fillStyle = '#6b7b90'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Roll to win an item', box.x + box.w / 2, box.y + box.h / 2)
      ctx.textAlign = 'left'
    }
    ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`Class-filtered for ${CLASSES[char.classKey].name}.`, rx, box.y + box.h + 20)
    ctx.fillStyle = '#ffd60a'
    ctx.fillText(`Cost: ${costOf(gambleSlot)} Glory  (${gambleSlot})`, rx, box.y + box.h + 36)
    return hov
  }

  // ---- vault filter / sort helpers (identity-safe: only move references) ----
  function matchFilter(it, f) {
    if (!it) return false
    const s = it.slot
    if (f === 'weapon')  return s === 'weapon'
    if (f === 'armor')   return VAULT_ARMOR.indexOf(s) >= 0
    if (f === 'acc')     return VAULT_ACC.indexOf(s) >= 0
    if (f === 'ability') return s === 'ability'
    if (f === 'rarity')  return VAULT_HI.indexOf(it.rarity) >= 0
    return true
  }
  // Returns the list of stash indices to display. 'all' shows every slot 0..cap-1
  // (including empties) so positions stay slot-stable & visible; filters show only
  // matching items.
  function buildVaultView() {
    const out = []
    if (vaultFilter === 'all') { for (let i = 0; i < STASH_CAP; i++) out.push(i); return out }
    for (let i = 0; i < STASH_CAP; i++) if (matchFilter(account.stash[i], vaultFilter)) out.push(i)
    return out
  }
  function cycleSort() {
    vaultSortKey = vaultSortKey === 'rarity' ? 'slot' : vaultSortKey === 'slot' ? 'rating' : 'rarity'
    sortStash(vaultSortKey)
    vaultScroll = 0
    flash(`Sorted by ${vaultSortKey}`, '#b18bff')
  }
  // User-triggered compacting sort. Reorders references only — never recreates or
  // drops items (identity/roll data preserved). Rebuilds a clean cap-length array.
  function sortStash(key) {
    const items = account.stash.filter(Boolean)
    const rRank = it => RARITY_ORDER.indexOf(it.rarity)
    const sRank = it => { const i = SLOT_SORT_ORDER.indexOf(it.slot); return i < 0 ? 99 : i }
    const rate = it => (it.rollPercent != null ? it.rollPercent : it.rating || 0)
    items.sort((a, b) => {
      if (key === 'slot') return sRank(a) - sRank(b) || rRank(b) - rRank(a) || rate(b) - rate(a)
      if (key === 'rating') return rate(b) - rate(a) || rRank(b) - rRank(a)
      return rRank(b) - rRank(a) || sRank(a) - sRank(b) || rate(b) - rate(a)   // rarity
    })
    const next = new Array(STASH_CAP).fill(null)
    for (let i = 0; i < items.length && i < STASH_CAP; i++) next[i] = items[i]
    account.stash = next
    if (window.saveGame) saveGame()
  }

  function renderVault(L, char) {
    let hov = null
    // --- left: inventory (deposit) ---
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`INVENTORY ${invItemCount(char.inventory)}/${INVENTORY_CAP}  (right-click / drag → stash)`, L.gx, L.gy - 6)
    for (const c of L.cells) { const h = drawCell(c, char.inventory[c.i], false); if (h) hov = h }

    // --- right: vault with filter tabs + SCROLLABLE grid + sort ---
    const view = buildVaultView()
    const vcols = L.cols
    const visibleRows = (L.rcells.length / vcols) | 0
    const totalRows = Math.max(1, Math.ceil(view.length / vcols))
    const maxScroll = Math.max(0, totalRows - visibleRows)
    if (vaultScroll > maxScroll) vaultScroll = maxScroll
    if (vaultScroll < 0) vaultScroll = 0

    // filter tabs row (just under the title, above the grid)
    L.vaultTabs = []
    const tabsY = L.py + 44, tabH = 13, tabGap = 4
    const tabW = ((L.px + L.PW - 20 - L.rx) - tabGap * (VAULT_TABS.length - 1)) / VAULT_TABS.length
    ctx.font = 'bold 8px monospace'; ctx.textBaseline = 'middle'
    for (let i = 0; i < VAULT_TABS.length; i++) {
      const t = VAULT_TABS[i]
      const r = { x: L.rx + i * (tabW + tabGap), y: tabsY, w: tabW, h: tabH, key: t.key }
      const active = vaultFilter === t.key
      ctx.fillStyle = active ? 'rgba(177,91,255,0.25)' : 'rgba(255,255,255,0.04)'
      ctx.strokeStyle = active ? '#b15bff' : '#334'; ctx.lineWidth = 1
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.fillStyle = active ? '#d9b8ff' : '#9fb3c8'; ctx.textAlign = 'center'
      ctx.fillText(t.label, r.x + r.w / 2, r.y + r.h / 2)
      L.vaultTabs.push(r)
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'

    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'
    ctx.fillText(`VAULT ${invItemCount(account.stash)}/${STASH_CAP}  (right-click / drag)`, L.rx, L.gy - 6)

    // scrollable stash grid (cells map to real stash indices via _stashIdx)
    const vstart = vaultScroll * vcols
    for (let i = 0; i < L.rcells.length; i++) {
      const c = L.rcells[i]
      const si = view[vstart + i]
      c._stashIdx = (si == null) ? -1 : si
      const it = (si == null) ? null : account.stash[si]
      const h = drawCell(c, it, false); if (h) hov = h
    }

    // scrollbar track + thumb on the right edge of the stash grid
    const gridTop = L.gy
    const gridH = visibleRows * (L.cell + L.gap) - L.gap
    const sbX = L.rx + vcols * (L.cell + L.gap) - L.gap + 6
    const sbW = 8
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(sbX, gridTop, sbW, gridH)
    const thumbH = Math.max(22, gridH * visibleRows / totalRows)
    const thumbY = gridTop + (maxScroll > 0 ? (gridH - thumbH) * (vaultScroll / maxScroll) : 0)
    ctx.fillStyle = '#4cc9f0aa'; ctx.fillRect(sbX, thumbY, sbW, thumbH)

    // controls row under the grid: AUTO SORT + scroll up/down nudge arrows
    const rowY = gridTop + gridH + 8
    const sortBtn = { x: L.rx, y: rowY, w: 130, h: 22 }
    ctx.fillStyle = 'rgba(76,201,240,0.18)'; ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1
    ctx.fillRect(sortBtn.x, sortBtn.y, sortBtn.w, sortBtn.h); ctx.strokeRect(sortBtn.x, sortBtn.y, sortBtn.w, sortBtn.h)
    ctx.fillStyle = '#4cc9f0'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`AUTO SORT: ${vaultSortKey}`, sortBtn.x + sortBtn.w / 2, sortBtn.y + sortBtn.h / 2)
    L.vaultSort = sortBtn
    const down = { x: sbX + sbW - 22, y: rowY, w: 22, h: 22 }
    const up = { x: down.x - 26, y: rowY, w: 22, h: 22 }
    drawArrowBtn(up, '▲'); L.vaultUp = up
    drawArrowBtn(down, '▼'); L.vaultDown = down
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'
    return hov
  }

  function drawArrowBtn(r, glyph) {
    const hov = hit(r, mouse.x, mouse.y)
    ctx.fillStyle = hov ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'
    ctx.strokeStyle = '#445'; ctx.lineWidth = 1
    ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = '#cfe'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2)
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
    const labels = { salvage: 'SALVAGE SELECTED', reforge: 'REFORGE', fusion: 'FUSE', gamble: 'GAMBLE' }
    ctx.fillStyle = 'rgba(76,201,240,0.20)'; ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1
    ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = '#4cc9f0'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText(labels[mode] || 'GO', b.x + b.w / 2, b.y + 18); ctx.textAlign = 'left'
  }

  // Esc closes
  window.addEventListener('keydown', e => {
    if (open && e.code === 'Escape') { close(); e.stopPropagation(); e.preventDefault() }
  }, true)

  return { isOpen, open: openPanel, close, render, onMouseDown, onMouseMove, onMouseUp, onRightClick, onWheel }
})()

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  if (Stations.isOpen() && typeof G !== 'undefined' && G.char) {
    if (Stations.onMouseDown(e.clientX, e.clientY, G.char)) e.stopPropagation()
  }
}, true)
canvas.addEventListener('mousemove', e => {
  if (Stations.isOpen()) Stations.onMouseMove(e.clientX, e.clientY)
}, true)
window.addEventListener('mouseup', e => {
  if (e.button !== 0) return
  if (Stations.isOpen() && typeof G !== 'undefined' && G.char) Stations.onMouseUp(e.clientX, e.clientY, G.char)
}, true)
canvas.addEventListener('contextmenu', e => {
  if (Stations.isOpen() && typeof G !== 'undefined' && G.char) {
    if (Stations.onRightClick(e.clientX, e.clientY, G.char)) { e.preventDefault(); e.stopPropagation() }
  }
}, true)
canvas.addEventListener('wheel', e => {
  if (Stations.isOpen() && Stations.onWheel(e.clientX, e.clientY, e.deltaY)) { e.preventDefault(); e.stopPropagation() }
}, { passive: false, capture: true })

window.Stations = Stations
