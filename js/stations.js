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
  // ---- vault view state ----
  const STASH_CAP = 60
  let vaultFilter = 'all'       // all|weapon|armor|acc|ability|rarity
  let vaultPage = 0             // page within the current filtered view
  let vaultSortKey = 'rarity'   // rarity|slot|rating (cycled by Sort button)
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
    open = true; mode = m; sel = []; msg = null
    vaultFilter = 'all'; vaultPage = 0
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
    const slotBtns = GAMBLE_SLOTS.map((s, i) => ({ s, x: rx, y: gy + i * 34, w: 150, h: 28 }))
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
      if (!addItemToInventory(char, res.item)) { account.glory += GAMBLE_COST; flash('Inventory full', '#ff6b6b'); return }
      if (window.saveGame) saveGame()
      flash(`Won ${res.item.name} (${RARITY[res.item.rarity].name}) Roll ${res.item.rollPercent}%`, res.item.color)
    }
  }

  function onClick(x, y, char) {
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
      // filter tabs
      if (L.vaultTabs) for (const t of L.vaultTabs) if (hit(t, x, y)) { vaultFilter = t.key; vaultPage = 0; return true }
      // page + sort controls
      if (L.vaultPrev && hit(L.vaultPrev, x, y)) { vaultPage = Math.max(0, vaultPage - 1); return true }
      if (L.vaultNext && hit(L.vaultNext, x, y)) { vaultPage++; return true }   // clamped on render
      if (L.vaultSort && hit(L.vaultSort, x, y)) { cycleSort(); return true }
      // left grid = inventory → deposit to first empty stash slot (slot-stable:
      // existing stash items never shift).
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
      // right grid = stash → withdraw to inventory. Cells map to real stash
      // indices (c._stashIdx) so filtered/paged views withdraw the right item.
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

    // message
    if (msg) { ctx.fillStyle = msg.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.fillText(msg.text, px + 20, py + PH - 50) }

    if (hoverItem) renderItemTooltip(hoverItem, mouse.x + 12, mouse.y + 12)
  }

  function renderRightInfo(L, char) {
    const rx = L.rx, ry = L.gy
    ctx.textAlign = 'left'
    if (mode === 'reforge') {
      let hov = null
      ctx.fillStyle = '#9fb3c8'; ctx.font = '11px monospace'
      ctx.fillText(`Cost: ${REFORGE_COST} dust of item rarity`, rx, ry)
      ctx.fillText('Rerolls roll% only. Type/rarity/affixes kept.', rx, ry + 16)
      // Equipped gear is also reforgeable (in place). Render a small selectable
      // grid; selection token is 'g:<slotKey>'.
      ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 10px monospace'
      ctx.fillText('EQUIPPED — click to reforge', rx, ry + 38)
      const cw = 52, ch = 52, gp = 6, cols = 5, gy0 = ry + 48
      L.gearCells = []
      let n = 0
      for (const key of REFORGE_GEAR_KEYS) {
        const it = char.gear && char.gear[key]
        if (!it || !it.baseKey) continue   // skip empty + dual-wield arrays
        const cc = n % cols, rr = (n / cols) | 0
        const cell = { x: rx + cc * (cw + gp), y: gy0 + rr * (ch + gp), w: cw, h: ch, gkey: key }
        const h = drawCell(cell, it, sel.indexOf('g:' + key) >= 0)
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
    vaultPage = 0
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
    ctx.fillText(`INVENTORY ${invItemCount(char.inventory)}/${INVENTORY_CAP}  (click → stash)`, L.gx, L.gy - 6)
    for (const c of L.cells) { const h = drawCell(c, char.inventory[c.i], false); if (h) hov = h }

    // --- right: vault with filter tabs + paged grid + sort ---
    const view = buildVaultView()
    const perPage = L.rcells.length
    const pages = Math.max(1, Math.ceil(view.length / perPage))
    if (vaultPage > pages - 1) vaultPage = pages - 1
    if (vaultPage < 0) vaultPage = 0

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
    ctx.fillText(`VAULT ${invItemCount(account.stash)}/${STASH_CAP}  (click → inventory)`, L.rx, L.gy - 6)

    // stash grid (cells map to real stash indices via _stashIdx)
    const start = vaultPage * perPage
    for (let i = 0; i < L.rcells.length; i++) {
      const c = L.rcells[i]
      const si = view[start + i]
      c._stashIdx = (si == null) ? -1 : si
      const it = (si == null) ? null : account.stash[si]
      const h = drawCell(c, it, false); if (h) hov = h
    }

    // controls row under the grid: Sort button + page prev/next + label
    const rowY = L.gy + L.rcells.length / L.cols * (L.cell + L.gap) + 6
    const sortBtn = { x: L.rx, y: rowY, w: 110, h: 22 }
    ctx.fillStyle = 'rgba(76,201,240,0.18)'; ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1
    ctx.fillRect(sortBtn.x, sortBtn.y, sortBtn.w, sortBtn.h); ctx.strokeRect(sortBtn.x, sortBtn.y, sortBtn.w, sortBtn.h)
    ctx.fillStyle = '#4cc9f0'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`AUTO SORT: ${vaultSortKey}`, sortBtn.x + sortBtn.w / 2, sortBtn.y + sortBtn.h / 2)
    L.vaultSort = sortBtn

    // paging controls (right-aligned in the column): ‹  1/2  ›
    const colRight = L.px + L.PW - 20
    const next = { x: colRight - 24, y: rowY, w: 24, h: 22 }
    const prev = { x: next.x - 24 - 44, y: rowY, w: 24, h: 22 }
    drawArrowBtn(prev, '<'); L.vaultPrev = prev
    drawArrowBtn(next, '>'); L.vaultNext = next
    ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`${vaultPage + 1}/${pages}`, (prev.x + prev.w + next.x) / 2, rowY + 11)
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
