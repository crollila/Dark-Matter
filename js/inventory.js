// ============================================================
// INVENTORY / CHARACTER PANEL — tabs: Items, Stats, Materials
// (Vault storage is accessed in its own room via the nexus purple portal.)
// ------------------------------------------------------------
// Toggle with I. Click a cell to select; press E or click [Equip] to
// equip into a compatible slot. Click an equipped row to unequip.
// Tabs switch the right-hand content. Details panel sits BELOW the
// item grid (never overlaps it). All swaps are 1-for-1 and defensive.
//
// Driven from the main loop in gameplay zones:
//   Inventory.update(char); Inventory.render(char)
// Other scripts gate input with Inventory.isOpen().
// ============================================================

const Inventory = (() => {
  let open = false
  let tab = 'items'             // 'items' | 'stats' | 'materials'
  let selectedIndex = -1
  let iLatch = false
  let eLatch = false
  let _layout = null
  let _msg = null

  const GEAR_SLOTS = ['weapon', 'helmet', 'chest', 'hands', 'pants', 'boots', 'ring1', 'ring2', 'amulet', 'ability']
  const TABS = [['items', 'Items'], ['stats', 'Stats'], ['materials', 'Materials']]
  const CAP = () => (typeof INVENTORY_CAP === 'number' ? INVENTORY_CAP : 30)

  function isOpen() { return open }
  function flash(text, color) { _msg = { text, color: color || '#e0fbfc', at: Date.now() } }

  function ensureChar(char) {
    if (!char) return false
    if (!char.gear || typeof char.gear !== 'object') char.gear = {}
    if (!Array.isArray(char.inventory)) char.inventory = []
    return true
  }

  // ---- equip target resolution ----
  function resolveGearSlot(char, item) {
    const s = item && item.slot
    if (!s) return null
    if (s === 'ring') {
      if (!char.gear.ring1) return 'ring1'
      if (!char.gear.ring2) return 'ring2'
      return 'ring1'
    }
    if (s in char.gear) return s
    return null
  }

  function clampVitals(char) {
    char.hp = Math.max(0, Math.min(char.hp, char.maxHp))
    char.mp = Math.max(0, Math.min(char.mp, char.maxMp))
  }

  function equip(char, idx) {
    if (!ensureChar(char)) return
    const inv = char.inventory
    const item = inv[idx]
    if (!item) return
    if (item.classes && item.classes.indexOf(char.classKey) < 0) {
      flash(`${item.name} is ${item.classes.join('/')}-only`, '#ff6b6b')
      spawnFloatText(char.x, char.y - 40, 'Wrong class', '#ff6b6b')
      return
    }
    const slot = resolveGearSlot(char, item)
    if (!slot) {
      flash(`Can't equip ${item.name} (${item.slot || '?'})`, '#ff6b6b')
      spawnFloatText(char.x, char.y - 40, 'Cannot equip there', '#ff6b6b')
      return
    }
    const prev = char.gear[slot] || null
    inv.splice(idx, 1)
    if (prev) {
      if (inv.length >= CAP()) { inv.splice(idx, 0, item); flash('Inventory full — cannot swap', '#ff6b6b'); return }
      inv.push(prev)
    }
    char.gear[slot] = item
    recalcStats(char)
    clampVitals(char)
    selectedIndex = -1
    if (window.saveGame) saveGame()
    flash(`Equipped ${item.name}`, item.color || '#e0fbfc')
    spawnFloatText(char.x, char.y - 40, `Equipped ${item.name}`, item.color || '#e0fbfc')
  }

  function unequip(char, key) {
    if (!ensureChar(char)) return
    const it = char.gear[key]
    if (!it) return
    const inv = char.inventory
    if (inv.length >= CAP()) { flash('Inventory full — cannot unequip', '#ff6b6b'); return }
    char.gear[key] = null
    inv.push(it)
    recalcStats(char)
    clampVitals(char)
    if (window.saveGame) saveGame()
    flash(`Unequipped ${it.name}`, it.color || '#e0fbfc')
    spawnFloatText(char.x, char.y - 40, `Unequipped ${it.name}`, it.color || '#e0fbfc')
  }

  function update(char) {
    if (!ensureChar(char)) { open = false; return }
    const iDown = !!keys['KeyI']
    if (iDown && !iLatch) {
      open = !open
      selectedIndex = -1
      if (open) eLatch = true
    }
    iLatch = iDown
    if (!open) return
    const eDown = !!keys['KeyE']
    if (eDown && !eLatch && tab === 'items' && selectedIndex >= 0) equip(char, selectedIndex)
    eLatch = eDown
  }

  // ---- layout ----
  function computeLayout() {
    const PW = 620, PH = 560
    const px = ((canvas.width - PW) / 2) | 0
    const py = ((canvas.height - PH) / 2) | 0

    const closeBtn = { x: px + PW - 30, y: py + 10, w: 20, h: 20 }

    // tab row
    const tabW = 96, tabH = 24, tabY = py + 40
    const tabs = TABS.map(([key, label], i) => ({ key, label, x: px + 20 + i * (tabW + 6), y: tabY, w: tabW, h: tabH }))

    // equipped column (always shown)
    const eqX = px + 20, eqY = py + 96, eqRowH = 24, eqW = 200
    const equipRows = GEAR_SLOTS.map((key, i) => ({ key, x: eqX, y: eqY + i * eqRowH, w: eqW, h: eqRowH - 3 }))

    // right content area
    const rx = px + 240
    const cell = 58, gap = 6, cols = 5, rows = 6
    const gx = rx, gy = py + 110
    const cells = []
    for (let i = 0; i < cols * rows; i++) {
      const c = i % cols, r = (i / cols) | 0
      cells.push({ i, x: gx + c * (cell + gap), y: gy + r * (cell + gap), w: cell, h: cell })
    }
    // details box sits below the grid (grid ends at gy + 6*64 - 6 = gy+378)
    const detailBox = { x: px + 20, y: gy + 384, w: PW - 40, h: 72 }
    const equipBtn = { x: px + PW - 150, y: py + PH - 34, w: 130, h: 24 }

    return { PW, PH, px, py, closeBtn, tabs, equipRows, rx, cells, gx, gy, cols, rows, cell, gap, detailBox, equipBtn }
  }

  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  function onClick(x, y, char) {
    if (!open || !_layout) return false
    const L = _layout
    if (hit(L.closeBtn, x, y)) { open = false; selectedIndex = -1; return true }
    for (const t of L.tabs) if (hit(t, x, y)) { tab = t.key; selectedIndex = -1; return true }

    // equipped rows clickable on every tab
    for (const row of L.equipRows) {
      if (hit(row, x, y) && char.gear[row.key]) { unequip(char, row.key); return true }
    }

    if (tab === 'items') {
      if (selectedIndex >= 0 && hit(L.equipBtn, x, y)) { equip(char, selectedIndex); return true }
      const inv = char.inventory || []
      for (const c of L.cells) {
        if (hit(c, x, y)) { if (inv[c.i]) selectedIndex = (selectedIndex === c.i ? -1 : c.i); return true }
      }
    }

    if (x < L.px || x > L.px + L.PW || y < L.py || y > L.py + L.PH) { open = false; selectedIndex = -1 }
    return true
  }

  // ---- rendering helpers ----
  function fmtVal(v) { return (typeof v === 'number' && !Number.isInteger(v)) ? v.toFixed(2) : v }

  function drawDetails(L, item) {
    const b = L.detailBox
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.textAlign = 'left'
    if (!item) {
      ctx.fillStyle = '#667'; ctx.font = '12px monospace'
      ctx.fillText('Select or hover an item to see details.', b.x + 12, b.y + 22)
      return
    }
    const roll = (typeof item.rollPercent === 'number') ? item.rollPercent : item.rating
    ctx.fillStyle = item.color || '#e0fbfc'; ctx.font = 'bold 13px monospace'
    ctx.fillText(`${item.name}   Roll ${typeof roll === 'number' ? roll + '%' : '—'}`, b.x + 12, b.y + 18)

    const rar = (RARITY && RARITY[item.rarity]) ? RARITY[item.rarity].name : (item.rarity || '?')
    const cls = item.classes ? item.classes.join('/') : 'any class'
    ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'
    ctx.fillText(`${rar}  •  ${item.slot || '?'}  •  ${cls}`, b.x + 12, b.y + 34)

    // per-stat values (universal rollPercent already applied)
    const stats = item.stats || {}
    ctx.font = '10px monospace'
    let sx = b.x + 12, sy = b.y + 50
    for (const k in stats) {
      const s = (window.fmtStatLine) ? fmtStatLine(k, stats[k]) : `${k.toUpperCase()} ${fmtVal(stats[k])}`
      ctx.fillStyle = (item.void && window.PCT_KEYS && PCT_KEYS[k]) ? '#b18bff' : '#d8e6f2'
      ctx.fillText(s, sx, sy)
      sx += 150
      if (sx > b.x + b.w - 150) { sx = b.x + 12; sy += 14 }
    }
  }

  function renderItemsTab(L, char) {
    const inv = char.inventory || []
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
    ctx.fillText(`ITEMS  ${inv.length}/${CAP()}`, L.gx, L.gy - 8)

    let hoverItem = null
    for (const c of L.cells) {
      const it = inv[c.i]
      const isSel = selectedIndex === c.i
      const isHover = hit(c, mouse.x, mouse.y)
      if (isHover && it) hoverItem = it
      ctx.fillStyle = it ? hexA(it.color, 0.16) : 'rgba(255,255,255,0.02)'
      ctx.fillRect(c.x, c.y, c.w, c.h)
      ctx.lineWidth = isSel ? 2.5 : 1
      ctx.strokeStyle = isSel ? '#ffd60a' : it ? (it.color || '#888') : '#2a2f44'
      ctx.strokeRect(c.x, c.y, c.w, c.h)
      if (it) {
        ctx.fillStyle = it.color || '#e0fbfc'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'
        ctx.fillText((it.slot || '?')[0].toUpperCase(), c.x + c.w / 2, c.y + 26)
        ctx.fillStyle = '#d8e6f2'; ctx.font = '9px monospace'
        ctx.fillText(typeof it.rating === 'number' ? it.rating + '%' : '', c.x + c.w / 2, c.y + 46)
        ctx.textAlign = 'left'
      }
    }
    drawDetails(L, hoverItem || inv[selectedIndex] || null)

    const canEquip = selectedIndex >= 0 && inv[selectedIndex]
    const eb = L.equipBtn
    ctx.fillStyle = canEquip ? 'rgba(76,201,240,0.22)' : 'rgba(255,255,255,0.04)'
    ctx.strokeStyle = canEquip ? '#4cc9f0' : '#334'; ctx.lineWidth = 1
    ctx.fillRect(eb.x, eb.y, eb.w, eb.h); ctx.strokeRect(eb.x, eb.y, eb.w, eb.h)
    ctx.fillStyle = canEquip ? '#4cc9f0' : '#556'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('[E] EQUIP', eb.x + eb.w / 2, eb.y + 16)
    ctx.textAlign = 'left'
  }

  function renderStatsTab(L, char) {
    const dmg = (typeof calcDamage === 'function') ? calcDamage(char) : 0
    const acct = (typeof account !== 'undefined') ? account : { glory: 0 }
    const rows = [
      ['HP', `${compactNum(char.hp)} / ${compactNum(char.maxHp)}`],
      ['MP', `${compactNum(char.mp)} / ${compactNum(char.maxMp)}`],
      ['Damage', '' + dmg],
      ['Armor', '' + (char.armor || 0)],
      ['Speed', '' + (char.spd || 0)],
      ['STR', '' + (char.str || 0)],
      ['DEX', '' + (char.dex || 0)],
      ['INT', '' + (char.int || 0)],
      ['HP Regen', (char.hpRegen || 0) + ' /s'],
      ['Level', '' + char.level],
      ['XP', char.level >= (typeof LEVEL_CAP !== 'undefined' ? LEVEL_CAP : 20) ? 'MAX' : `${char.xp | 0} / ${char.xpNext | 0}`],
      ['Glory (life)', '' + (char.glory | 0)],
      ['Account Glory', '' + ((acct.glory) | 0)],
    ]
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('STATS', L.rx, L.gy - 8)
    let y = L.gy + 8
    for (const [k, v] of rows) {
      ctx.fillStyle = '#8aa0b8'; ctx.font = '11px monospace'
      ctx.fillText(k, L.rx + 4, y)
      ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 11px monospace'
      ctx.fillText(v, L.rx + 160, y)
      y += 22
    }
  }

  function renderMaterialsTab(L) {
    const mats = (typeof account !== 'undefined' && account.materials) || {}
    const keys = Object.keys(mats)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('MATERIALS', L.rx, L.gy - 8)
    if (!keys.length) {
      ctx.fillStyle = '#667'; ctx.font = '11px monospace'
      ctx.fillText('No materials yet. Kill dungeon bosses.', L.rx + 4, L.gy + 12)
      return
    }
    let y = L.gy + 10
    for (const k of keys) {
      const m = (typeof MATERIALS !== 'undefined') ? MATERIALS[k] : null
      ctx.fillStyle = (m && m.color) || '#ccc'
      ctx.beginPath(); ctx.arc(L.rx + 8, y - 4, 5, 0, Math.PI * 2); ctx.fill()
      ctx.font = '11px monospace'
      ctx.fillText(m ? m.name : k, L.rx + 22, y)
      ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 11px monospace'
      ctx.fillText('x' + mats[k], L.rx + 220, y)
      y += 22
    }

    // Dust (salvage output)
    const dust = (typeof account !== 'undefined' && account.dust) || {}
    y += 10
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('DUST', L.rx, y); y += 18
    for (const k of (window.RARITY_ORDER || [])) {
      const d = (window.DUST || {})[k]
      ctx.fillStyle = (d && d.color) || '#ccc'
      ctx.beginPath(); ctx.arc(L.rx + 8, y - 4, 5, 0, Math.PI * 2); ctx.fill()
      ctx.font = '11px monospace'
      ctx.fillText(d ? d.name : k, L.rx + 22, y)
      ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 11px monospace'
      ctx.fillText('x' + (dust[k] || 0), L.rx + 220, y)
      y += 20
    }
  }

  function render(char) {
    if (!open) return
    if (!ensureChar(char)) { open = false; return }
    const L = computeLayout()
    _layout = L
    const { px, py, PW, PH } = L

    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(10,12,26,0.96)'; ctx.strokeStyle = '#4cc9f066'; ctx.lineWidth = 1
    ctx.fillRect(px, py, PW, PH); ctx.strokeRect(px, py, PW, PH)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 15px monospace'
    ctx.fillText('CHARACTER', px + 20, py + 28)
    ctx.fillStyle = '#556'; ctx.font = '10px monospace'
    ctx.fillText('[I] close   click equipped row to unequip', px + 150, py + 28)

    // close
    ctx.strokeStyle = '#ff6b6b88'; ctx.strokeRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h)
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('X', L.closeBtn.x + L.closeBtn.w / 2, L.closeBtn.y + 14); ctx.textAlign = 'left'

    // tabs
    for (const t of L.tabs) {
      const active = tab === t.key
      const hover = hit(t, mouse.x, mouse.y)
      ctx.fillStyle = active ? 'rgba(76,201,240,0.22)' : hover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.strokeStyle = active ? '#4cc9f0' : '#334'; ctx.lineWidth = 1
      ctx.fillRect(t.x, t.y, t.w, t.h); ctx.strokeRect(t.x, t.y, t.w, t.h)
      ctx.fillStyle = active ? '#4cc9f0' : '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(t.label, t.x + t.w / 2, t.y + 16)
    }
    ctx.textAlign = 'left'

    // equipped column (always)
    ctx.fillStyle = '#9fb3c8'; ctx.font = 'bold 11px monospace'
    ctx.fillText('EQUIPPED', px + 20, py + 88)
    for (const row of L.equipRows) {
      const it = char.gear[row.key]
      const hover = hit(row, mouse.x, mouse.y)
      ctx.fillStyle = hover && it ? 'rgba(76,201,240,0.10)' : 'rgba(255,255,255,0.03)'
      ctx.fillRect(row.x, row.y, row.w, row.h)
      ctx.fillStyle = '#778'; ctx.font = '9px monospace'
      ctx.fillText(row.key, row.x + 5, row.y + 14)
      ctx.textAlign = 'right'
      if (it) { ctx.fillStyle = it.color || '#e0fbfc'; ctx.fillText(itemDisplayName(it), row.x + row.w - 5, row.y + 14) }
      else { ctx.fillStyle = '#445'; ctx.fillText('—', row.x + row.w - 5, row.y + 14) }
      ctx.textAlign = 'left'
    }

    if (tab === 'items') renderItemsTab(L, char)
    else if (tab === 'stats') renderStatsTab(L, char)
    else if (tab === 'materials') renderMaterialsTab(L)

    if (_msg && Date.now() - _msg.at < 2500) {
      ctx.fillStyle = _msg.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'
      ctx.fillText(_msg.text, px + 20, py + PH - 12)
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
        open, tab, selectedIndex,
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
    if (Inventory.onClick(e.clientX, e.clientY, G.char)) { e.stopPropagation() }
  }
}, true)

window.Inventory = Inventory
