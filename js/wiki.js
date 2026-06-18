// ============================================================
// WIKI — in-game compendium (Dungeons / Bosses / Gear / Mobs)
// ------------------------------------------------------------
// Opened from the Nexus "WIKI" station (a panel, NOT a zone — same modal model
// as stations.js). A data-driven LOOT TABLE REGISTRY is generated once from the
// existing item/mob/dungeon definitions (no hand-maintained tables), then the
// four tabs read from it. Robust to missing/partial drop data — never crashes.
//
// Registry is also exposed as window.LootTable for future wiki export / tooling.
// ============================================================

const Wiki = (() => {
  // --- safe global getters (everything lives in shared script scope) ---
  const DUN  = () => (typeof DUNGEONS !== 'undefined') ? DUNGEONS : {}
  const MOBS = () => (typeof MOB_DEFS !== 'undefined') ? MOB_DEFS : {}
  const BASES = () => (typeof ITEM_BASES !== 'undefined') ? ITEM_BASES : {}
  const WB   = () => (typeof WORLD_BOSSES !== 'undefined') ? WORLD_BOSSES : {}
  const EXBYD = () => (typeof EXCLUSIVES_BY_DUNGEON !== 'undefined') ? EXCLUSIVES_BY_DUNGEON : {}
  const WBM  = () => (typeof WORLD_BOSS_MYTHICS !== 'undefined') ? WORLD_BOSS_MYTHICS : {}
  const BIO  = () => (typeof BIOMES !== 'undefined') ? BIOMES : {}
  const biomeName = (id) => (typeof BIOME_BY_ID !== 'undefined' && BIOME_BY_ID[id] && BIOME_BY_ID[id].name) || null
  const itemName = (k) => { const b = BASES()[k]; return (b && b.name) || k }
  const mobName  = (k) => { const m = MOBS()[k]; return (m && m.name) || k }
  const dunName  = (k) => { const d = DUN()[k]; return (d && d.name) || k }
  const starStr = (n) => { n = Math.max(0, Math.min(7, n | 0)); let s = ''; for (let i = 0; i < n; i++) s += '★'; return s }

  // ---- LOOT TABLE REGISTRY (built once) ----
  let _reg = null
  function registry() {
    if (_reg) return _reg
    const dun = DUN(), mobs = MOBS(), bases = BASES(), wb = WB(), exByD = EXBYD(), wbm = WBM(), bio = BIO()

    // reverse lookups
    const uniqueToMob = {}            // biome-unique base → the mob that drops it
    for (const mk in mobs) {
      const ud = mobs[mk].uniqueDrop
      if (ud && ud.base) uniqueToMob[ud.base] = { mobKey: mk, mobName: mobs[mk].name || mk, chance: ud.chance || 0 }
    }
    const mythicToBoss = {}           // world-boss mythic base → world boss
    for (const wk in wb) {
      const w = wb[wk]
      if (w && w.mythic) mythicToBoss[w.mythic] = { mobKey: w.mob, biome: w.biome, dungeon: w.dungeon }
    }
    const bossToDungeons = {}         // boss mob key → [dungeon keys it bosses]
    for (const dk in dun) {
      const b = dun[dk].boss
      if (b) (bossToDungeons[b] || (bossToDungeons[b] = [])).push(dk)
    }
    const mobBiome = {}               // mob key → biome name (world cluster)
    for (const bk in bio) for (const mk of (bio[bk].mobs || [])) mobBiome[mk] = bio[bk].name

    // --- DUNGEONS ---
    const dungeons = Object.keys(dun).map(dk => {
      const d = dun[dk]
      let worldBoss = null
      for (const wk in wb) if (wb[wk].dungeon === dk) worldBoss = mobName(wb[wk].mob)
      return {
        key: dk, name: d.name || dk, stars: d.stars || 0, color: d.color || '#cc88ff',
        theme: d.biome ? (worldBoss ? 'World-Boss dungeon' : 'Biome dungeon') : 'Open-world dungeon',
        bossName: mobName(d.boss),
        exclusives: (exByD[dk] || []).map(itemName),
        worldBoss,
      }
    })

    // --- BOSSES (every isBoss mob def) ---
    const bosses = Object.keys(mobs).filter(mk => mobs[mk].isBoss).map(mk => {
      const m = mobs[mk]
      const dks = bossToDungeons[mk] || []
      let wbInfo = null
      for (const wk in wb) if (wb[wk].mob === mk) wbInfo = wb[wk]
      // dropItems carries the base KEY too, so the Bosses tab can make each drop
      // hoverable (shows the existing item tooltip).
      const dropItems = []
      const seen = {}
      if (wbInfo && wbInfo.mythic) { seen[wbInfo.mythic] = 1; dropItems.push({ key: wbInfo.mythic, name: itemName(wbInfo.mythic) + ' (mythic)' }) }
      for (const dk of dks) for (const k of (exByD[dk] || [])) { if (!seen[k]) { seen[k] = 1; dropItems.push({ key: k, name: itemName(k) }) } }
      let mythic = null, found
      if (wbInfo) {
        mythic = wbInfo.mythic ? itemName(wbInfo.mythic) : null
        found = 'World Boss — ' + (biomeName(wbInfo.biome) || 'open world')
      } else {
        found = dks.length ? dks.map(dunName).join(', ') : 'Unknown'
      }
      return { key: mk, name: m.name || mk, color: m.color || '#ff6b6b', found, dropItems, mythic, isWorld: !!wbInfo }
    })

    // --- GEAR (every item base) ---
    const gear = Object.keys(bases).map(k => {
      const b = bases[k]
      const sources = []
      let cat = 'Random'
      if (mythicToBoss[k]) { sources.push('World Boss: ' + mobName(mythicToBoss[k].mobKey)); cat = 'World Boss' }
      if (b.dungeon)       { sources.push('Dungeon: ' + dunName(b.dungeon) + ' (boss / mobs)'); cat = 'Dungeon' }
      if (uniqueToMob[k])  { sources.push('Mob: ' + uniqueToMob[k].mobName + ' (' + Math.round(uniqueToMob[k].chance * 100) + '%)'); cat = 'Mob unique' }
      if (b.wikiSource && !sources.length) { sources.push(b.wikiSource); cat = b.set ? (b.set + ' set') : 'Class gear' }
      if (!sources.length) {
        if (b.unique) { sources.push('Special'); cat = 'Special' }
        else { sources.push('Random drops • Gamble'); cat = 'Random' }
      }
      return {
        key: k, name: b.name || k, slot: b.slot || '?',
        classes: (b.classes && b.classes.join('/')) || 'Any',
        unique: !!b.unique, sources, cat,
      }
    }).sort((a, b) => (a.slot.localeCompare(b.slot)) || a.name.localeCompare(b.name))

    // --- MOBS (every mob def) ---
    const mobList = Object.keys(mobs).map(mk => {
      const m = mobs[mk]
      let where = mobBiome[mk] ? ('Biome: ' + mobBiome[mk]) : null
      if (!where) {
        const inDun = []
        for (const dk in dun) if ((dun[dk].mobs || []).indexOf(mk) >= 0) inDun.push(dunName(dk))
        if (inDun.length) where = 'Dungeon: ' + inDun.slice(0, 2).join(', ')
      }
      if (!where) where = m.isBoss ? 'Boss' : 'Open World'
      const drops = []
      if (m.uniqueDrop && m.uniqueDrop.base) drops.push(itemName(m.uniqueDrop.base) + ' (' + Math.round((m.uniqueDrop.chance || 0) * 100) + '%)')
      if (m.portalDrop && m.portalDrop.type) drops.push('Portal → ' + dunName(m.portalDrop.type) + ' (' + Math.round((m.portalDrop.chance || 0) * 100) + '%)')
      return { key: mk, name: m.name || mk, color: m.color || '#aaa', isBoss: !!m.isBoss, hp: m.hp || 0, where, drops }
    }).sort((a, b) => (a.isBoss === b.isBoss ? a.hp - b.hp : (a.isBoss ? 1 : -1)))

    _reg = { dungeons, bosses, gear, mobs: mobList }
    if (typeof window !== 'undefined') window.LootTable = _reg
    return _reg
  }

  // ---- representative item instance per base (for hover tooltip) ----
  const _samples = {}
  function sampleFor(key) {
    if (key in _samples) return _samples[key]
    let s = null
    try {
      const b = BASES()[key]
      let rar = 'rare'
      if (WBM()[key]) rar = 'mythic'
      else if (b && b.unique) rar = 'epic'
      if (typeof rollItem === 'function') s = rollItem(key, rar, 100, 'wiki')
    } catch (e) { s = null }
    _samples[key] = s
    return s
  }

  // ---- state ----
  const TABS = ['Dungeons', 'Bosses', 'Gear', 'Mobs']
  let open = false
  let tab = 0
  const scroll = [0, 0, 0, 0]
  const selKey = [null, null, null, null]   // sticky selected entry key per tab
  let _L = null
  let _contentH = 0
  let _cards = []          // current-frame card hit rects: {x,y,w,h,entry}
  let _hoverEntry = null   // entry hovered this frame (overrides the sticky selection)
  let search = ''          // Gear-tab search query
  let searchFocused = false
  let _drag = false        // dragging the scrollbar thumb

  function isOpen() { return open }
  function openPanel() { open = true; try { registry() } catch (e) { _warnOnce('registry/open', e) } }
  function close() { open = false; searchFocused = false; _drag = false }

  // ---- sorting (DISPLAY ONLY — registry/gameplay data untouched) ----
  function rarityRankFor(g) {
    if (WBM()[g.key]) return 5                 // mythic world-boss gear
    const b = BASES()[g.key] || {}
    if (b.unique || b.dungeon) return 4        // dungeon-exclusive / special (epic-ish)
    if (b.tier) return b.tier                  // class gear tier 1-4
    return 1                                   // random/common
  }
  function sortedDungeons(reg) {
    return reg.dungeons.slice().sort((a, b) => (a.stars - b.stars) || a.name.localeCompare(b.name))
  }
  function sortedBosses(reg) {
    return reg.bosses.slice().sort((a, b) =>
      ((a.isWorld ? 1 : 0) - (b.isWorld ? 1 : 0)) || a.found.localeCompare(b.found) || a.name.localeCompare(b.name))
  }
  function sortedGear(reg) {
    let list = reg.gear.slice()
    const q = search.trim().toLowerCase()
    if (q) {
      const terms = q.split(/\s+/)
      list = list.filter(g => {
        const hay = [g.name, g.key, g.slot, g.classes, g.cat, (g.sources || []).join(' '), g.unique ? 'unique' : '']
          .join(' ').toLowerCase()
        return terms.every(t => hay.indexOf(t) >= 0)
      })
    }
    return list.sort((a, b) => (rarityRankFor(b) - rarityRankFor(a)) || a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name))
  }
  function sortedMobs(reg) {
    return reg.mobs.slice().sort((a, b) => a.where.localeCompare(b.where) || a.name.localeCompare(b.name))
  }

  // ---- FREEZE GUARDS -------------------------------------------------------
  // The main loop only reschedules requestAnimationFrame at the END of loop(),
  // so ANY exception thrown out of Wiki.render() permanently stops the game.
  // These guards make the Wiki impossible to freeze: render is wrapped in
  // try/catch (falls back to a safe shell), data is built/sorted ONCE per tab
  // (cached, not every frame), and failures warn at most once (no per-frame spam).
  let _warned = false
  function _warnOnce(where, e) {
    if (_warned) return
    _warned = true
    try { console.warn('[Wiki] render guard caught an error in ' + where + ':', e) } catch (_) {}
  }
  // Per-tab sorted-entry cache (avoids re-sorting the full list every frame).
  const _entriesCache = [null, null, null, null]
  function invalidateCache(t) { if (t == null) { _entriesCache[0] = _entriesCache[1] = _entriesCache[2] = _entriesCache[3] = null } else _entriesCache[t] = null }
  function entriesFor(reg, t) {
    if (_entriesCache[t]) return _entriesCache[t]
    let e
    try {
      e = t === 0 ? sortedDungeons(reg) : t === 1 ? sortedBosses(reg) : t === 2 ? sortedGear(reg) : sortedMobs(reg)
    } catch (err) { _warnOnce('entriesFor[' + t + ']', err); e = [] }
    _entriesCache[t] = Array.isArray(e) ? e : []
    return _entriesCache[t]
  }

  // ---- layout ----
  function layout() {
    const PW = Math.min(880, canvas.width - 36)
    const PH = Math.min(660, canvas.height - 36)
    const px = ((canvas.width - PW) / 2) | 0
    const py = ((canvas.height - PH) / 2) | 0
    const closeBtn = { x: px + PW - 30, y: py + 10, w: 20, h: 20 }
    const tabW = ((PW - 40) / TABS.length) | 0
    const tabs = TABS.map((t, i) => ({ t, i, x: px + 20 + i * tabW, y: py + 40, w: tabW - 6, h: 26 }))
    let gx = px + 16, gy = py + 78, gw = PW - 32
    // Gear tab gets a search box above the grid.
    let searchBox = null
    if (tab === 2) { searchBox = { x: gx, y: gy, w: gw, h: 22 }; gy += 30 }
    // Persistent detail panel pinned BOTTOM-LEFT; the card grid sits above it.
    const detailH = 196
    const detailW = Math.min(440, (gw * 0.62) | 0)
    const detail = { x: gx, y: py + PH - 16 - detailH, w: detailW, h: detailH }
    const gh = (detail.y - 10) - gy
    const sb = { x: gx + gw - 7, y: gy, w: 7, h: gh }
    return { PW, PH, px, py, closeBtn, tabs, gx, gy, gw, gh, sb, searchBox, detail }
  }
  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  // ---- input ----
  function onClick(x, y) {
    if (!open || !_L) return false
    const L = _L
    if (hit(L.closeBtn, x, y)) { close(); return true }
    for (const t of L.tabs) if (hit(t, x, y)) { tab = t.i; searchFocused = false; return true }
    if (hit(L.sb, x, y)) { _drag = true; scrollToY(y); searchFocused = false; return true }
    if (L.searchBox && hit(L.searchBox, x, y)) { searchFocused = true; return true }
    searchFocused = false
    // Card click inside the grid → pin it in the detail panel.
    if (x >= L.gx && x <= L.gx + L.gw && y >= L.gy && y <= L.gy + L.gh) {
      for (const c of _cards) if (hit(c, x, y)) { selKey[tab] = c.entry.key; return true }
      return true
    }
    if (x < L.px || x > L.px + L.PW || y < L.py || y > L.py + L.PH) { close(); return true }
    return true   // swallow clicks inside the panel
  }
  function scrollToY(y) {
    if (!_L) return
    const max = Math.max(0, _contentH - _L.gh)
    if (max <= 0) { scroll[tab] = 0; return }
    const t = (y - _L.sb.y) / _L.sb.h
    scroll[tab] = Math.max(0, Math.min(max, t * max))
  }
  function onWheel(dy) {
    if (!open) return
    const viewH = _L ? _L.gh : 400
    const max = Math.max(0, _contentH - viewH)
    scroll[tab] = Math.max(0, Math.min(max, scroll[tab] + dy))
  }

  // ---- render helpers ----
  // Card frame with left accent + hover/selected highlight.
  function cardFrame(x, y, w, h, accent, isSel, isHover) {
    ctx.fillStyle = isSel ? 'rgba(177,91,255,0.16)' : isHover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = isSel ? '#b15bff' : (accent || '#2a2f44'); ctx.lineWidth = isSel ? 2 : 1
    ctx.strokeRect(x, y, w, h)
    ctx.fillStyle = accent || '#3a3f5a'; ctx.fillRect(x, y, 3, h)
  }
  // Left-aligned text truncated (no ellipsis) to maxW px.
  function text2(t, x, y, c, bold, maxW) {
    ctx.font = (bold ? 'bold ' : '') + '11px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = c || '#d8e6f2'
    if (maxW) { while (t.length > 2 && ctx.measureText(t).width > maxW) t = t.slice(0, -1) }
    ctx.fillText(t, x, y)
  }
  // Dungeon icon = its portal sprite (themed) when available, else a colored diamond.
  function drawDungeonIcon(key, color, cx, cy, size) {
    let spec = null
    if (typeof dungeonPortalSpec === 'function') { try { spec = dungeonPortalSpec(key) } catch (e) { spec = null } }
    if (spec && window.Sprites && Sprites.drawPortal && Sprites.drawPortal(spec, cx, cy, size)) return
    ctx.fillStyle = color || '#cc88ff'
    ctx.beginPath(); ctx.moveTo(cx, cy - size / 2); ctx.lineTo(cx + size / 2, cy)
    ctx.lineTo(cx, cy + size / 2); ctx.lineTo(cx - size / 2, cy); ctx.closePath(); ctx.fill()
  }

  // Draw a small icon (item sprite or mob marker) centered at (cx,cy), size px.
  // Items use the assigned sprite when present, else a colored letter tile. Mobs
  // use a real mob sprite ONLY if one is assigned (none ship yet) — never a
  // weapon/item sprite — otherwise a geometric colored marker.
  function drawIcon(icon, cx, cy, size) {
    if (!icon) return
    if (icon.type === 'item') {
      const s = sampleFor(icon.key)
      if (s && window.Sprites && Sprites.drawForItem && Sprites.drawForItem(s, cx, cy, size)) return
      const col = (s && s.color) || '#7a86a8'
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(cx - size / 2, cy - size / 2, size, size)
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(cx - size / 2, cy - size / 2, size, size)
      ctx.fillStyle = col; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(((icon.label || '?')[0] || '?').toUpperCase(), cx, cy + 1)
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    } else { // mob / boss — bosses take priority; NEVER a weapon/item sprite
      // New 2-frame boss-sheet art first (matches in-world boss rendering).
      if (window.Sprites && Sprites.drawBossSheet && Sprites.drawBossSheet({ key: icon.key }, cx, cy, size)) return
      const id = (window.bossSpriteAssignments && bossSpriteAssignments[icon.key])
        || (window.mobSpriteAssignments && mobSpriteAssignments[icon.key])
      if (id && window.Sprites && Sprites.draw && Sprites.draw(id, cx, cy, size)) return
      // Regular mobs: 2-frame mob-sheet sprite (idle alternates over time; no
      // shootTimer here so it just animates). Bosses already handled above.
      if (window.Sprites && Sprites.drawMobSheet && Sprites.drawMobSheet({ key: icon.key }, cx, cy, size)) return
      ctx.fillStyle = icon.color || '#aab8c8'
      ctx.beginPath(); ctx.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke()
    }
  }

  // ---- card grid render. Returns total content height. ----
  // Lays entries out in a clipped, scrollable grid; records hit rects in _cards
  // and sets _hoverEntry. drawCard(entry,x,y,w,h,isSel,isHover) paints one card.
  function renderGrid(L, entries, cardH, cols, drawCard) {
    _cards = []
    const gap = 8
    const cw = ((L.gw - 7 - (cols - 1) * gap) / cols) | 0   // 7px reserved for scrollbar
    ctx.save()
    ctx.beginPath(); ctx.rect(L.gx, L.gy, L.gw, L.gh); ctx.clip()
    for (let i = 0; i < entries.length; i++) {
      const c = i % cols, r = (i / cols) | 0
      const cx = L.gx + c * (cw + gap)
      const cy = L.gy + r * (cardH + gap) - scroll[tab]
      if (cy + cardH >= L.gy && cy <= L.gy + L.gh) {
        const isSel = selKey[tab] === entries[i].key
        const isHover = mouse.x >= cx && mouse.x <= cx + cw && mouse.y >= cy && mouse.y <= cy + cardH
          && mouse.y >= L.gy && mouse.y <= L.gy + L.gh && mouse.x >= L.gx && mouse.x <= L.gx + L.gw
        if (isHover) _hoverEntry = entries[i]
        try { drawCard(entries[i], cx, cy, cw, cardH, isSel, isHover) } catch (err) { _warnOnce('drawCard', err) }
        _cards.push({ x: cx, y: cy, w: cw, h: cardH, entry: entries[i] })
      }
    }
    ctx.restore()
    return Math.ceil(entries.length / cols) * (cardH + gap)
  }

  // ---- per-tab card drawers ----
  function cardDungeon(d, x, y, w, h, isSel, isHover) {
    cardFrame(x, y, w, h, d.color, isSel, isHover)
    drawDungeonIcon(d.key, d.color, x + 24, y + h / 2, 32)
    const tx = x + 46
    text2(d.name, tx, y + 18, d.color, true, w - 52)
    text2(starStr(d.stars) + '  ' + d.theme, tx, y + 35, '#9fb3c8', false, w - 52)
    text2('Boss: ' + d.bossName, tx, y + 52, '#aab8c8', false, w - 52)
  }
  function cardBoss(b, x, y, w, h, isSel, isHover) {
    cardFrame(x, y, w, h, b.color, isSel, isHover)
    text2(b.name, x + 8, y + 16, b.color, true, w - 16)           // name ABOVE the sprite
    if (b.isWorld) { ctx.fillStyle = '#ffd60a'; ctx.font = '8px monospace'; ctx.textAlign = 'right'; ctx.fillText('WORLD', x + w - 6, y + 14); ctx.textAlign = 'left' }
    drawIcon({ type: 'mob', key: b.key, color: b.color }, x + w / 2, y + h / 2 + 10, Math.min(w - 26, h - 36))
  }
  function cardGear(g, x, y, w, h, isSel, isHover) {
    const s = sampleFor(g.key); const col = (s && s.color) || '#7a86a8'
    cardFrame(x, y, w, h, col, isSel, isHover)
    drawIcon({ type: 'item', key: g.key, label: g.name }, x + 22, y + h / 2, 28)
    const tx = x + 42
    text2(g.name + (g.unique ? '  ✦' : ''), tx, y + 20, col, true, w - 48)
    text2(g.slot + ' • ' + g.classes, tx, y + 37, '#9fb3c8', false, w - 48)
    text2(g.cat, tx, y + 52, '#7e8aa6', false, w - 48)
  }
  function cardMob(m, x, y, w, h, isSel, isHover) {
    cardFrame(x, y, w, h, m.color, isSel, isHover)
    drawIcon({ type: 'mob', key: m.key, color: m.color }, x + 24, y + h / 2, 32)
    const tx = x + 46
    text2(m.name + (m.isBoss ? '  [BOSS]' : ''), tx, y + 20, m.color, true, w - 52)
    text2(m.where, tx, y + 37, '#9fb3c8', false, w - 52)
    text2('HP ' + (m.hp ? m.hp.toLocaleString() : '?'), tx, y + 52, '#aab8c8', false, w - 52)
  }

  // Visible scrollbar: always draws a track; proportional thumb when content
  // overflows the grid view. Track is click/drag-scrollable.
  function drawScrollbar(L) {
    const sb = L.sb, viewH = L.gh
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(sb.x, sb.y, sb.w, sb.h)
    const max = Math.max(0, _contentH - viewH)
    if (max <= 0) return
    const thumbH = Math.max(24, sb.h * (viewH / _contentH))
    const thumbY = sb.y + (scroll[tab] / max) * (sb.h - thumbH)
    ctx.fillStyle = _drag ? '#b15bff' : 'rgba(177,91,255,0.55)'
    ctx.fillRect(sb.x, thumbY, sb.w, thumbH)
  }

  // ---- bottom-left DETAIL panel (replaces cursor tooltips) ----
  function statRangeLabel(k, r) {
    const lo = r[0], hi = r[1]
    if (k === 'atkSpd') return 'ATK/S ' + (1 / hi).toFixed(2) + '–' + (1 / lo).toFixed(2)
    if (k === 'range')  return 'RANGE ' + lo + '–' + hi
    return k.toUpperCase() + ' ' + lo + '–' + hi
  }
  function renderDetail(L, entry) {
    const d = L.detail
    ctx.fillStyle = 'rgba(8,10,20,0.96)'; ctx.fillRect(d.x, d.y, d.w, d.h)
    ctx.strokeStyle = '#3a2f5a'; ctx.lineWidth = 1; ctx.strokeRect(d.x, d.y, d.w, d.h)
    ctx.fillStyle = '#7a86a8'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left'
    ctx.fillText('DETAILS', d.x + 10, d.y + 14)
    if (!entry) { ctx.fillStyle = '#5a6480'; ctx.font = '10px monospace'; ctx.fillText('Hover or click an entry for details.', d.x + 10, d.y + 36); return }
    const innerX = d.x + 10, maxW = d.w - 20
    let dy = d.y + 32
    const line = (t, c, bold) => {
      if (dy > d.y + d.h - 4) return
      ctx.fillStyle = c || '#cdd9e6'; ctx.font = (bold ? 'bold ' : '') + '10px monospace'; ctx.textAlign = 'left'
      let s = t; while (s.length > 2 && ctx.measureText(s).width > maxW) s = s.slice(0, -1)
      ctx.fillText(s, innerX, dy); dy += 14
    }
    if (tab === 0) {
      line(entry.name + '  ' + starStr(entry.stars), entry.color, true)
      line(entry.theme, '#9fb3c8')
      line('Boss: ' + entry.bossName + (entry.worldBoss ? '  (via ' + entry.worldBoss + ')' : ''), '#aab8c8')
      const comp = (typeof account !== 'undefined' && account.dungeonCompletions) || {}
      line('Cleared: ' + (comp[entry.key] || 0), '#7e8aa6')
      line('Notable drops:', '#9fb3c8')
      if (entry.exclusives.length) for (const ex of entry.exclusives.slice(0, 8)) line('• ' + ex, '#cdd9e6')
      else line('• —', '#7e8aa6')
    } else if (tab === 1) {
      drawIcon({ type: 'mob', key: entry.key, color: entry.color }, d.x + d.w - 34, d.y + 36, 44)
      const m = MOBS()[entry.key] || {}
      line(entry.name + (entry.isWorld ? '  [WORLD BOSS]' : ''), entry.color, true)
      line('Found: ' + entry.found, '#9fb3c8')
      if (m.hp) line('HP ' + m.hp.toLocaleString() + '   DMG ' + (m.dmg || '?'), '#aab8c8')
      line('Drops:', '#9fb3c8')
      const drops = entry.dropItems || []
      if (drops.length) for (const it of drops.slice(0, 7)) line('• ' + it.name, '#cdd9e6')
      else line('• —', '#7e8aa6')
    } else if (tab === 2) {
      const s = sampleFor(entry.key); const col = (s && s.color) || '#cdd9e6'
      drawIcon({ type: 'item', key: entry.key, label: entry.name }, d.x + d.w - 30, d.y + 34, 36)
      line(entry.name + (entry.unique ? '  ✦' : ''), col, true)
      line(entry.slot + '  •  ' + entry.classes + '  •  ' + entry.cat, '#9fb3c8')
      line('From: ' + (entry.sources || []).join(' | '), '#aab8c8')
      const b = BASES()[entry.key] || {}, core = b.core || {}
      const keys = Object.keys(core).filter(k => k !== 'bspd')
      if (keys.length) { line('Base stat ranges:', '#9fb3c8'); for (const k of keys) line('• ' + statRangeLabel(k, core[k]), '#cdd9e6') }
      line('Roll% scales each stat lo→hi; rarity adds affixes (1→5).', '#7e8aa6')
    } else {
      drawIcon({ type: 'mob', key: entry.key, color: entry.color }, d.x + d.w - 30, d.y + 34, 40)
      const m = MOBS()[entry.key] || {}
      line(entry.name + (entry.isBoss ? '  [BOSS]' : ''), entry.color, true)
      line(entry.where, '#9fb3c8')
      line('HP ' + (m.hp ? m.hp.toLocaleString() : '?') + '   DMG ' + (m.dmg || '?') + '   XP ' + (m.xp || '?'), '#aab8c8')
      if (m.ai) line('AI: ' + m.ai, '#7e8aa6')
      line('Drops:', '#9fb3c8')
      if (entry.drops && entry.drops.length) for (const dr of entry.drops.slice(0, 6)) line('• ' + dr, '#cdd9e6')
      else line('• common gear pool', '#7e8aa6')
    }
  }

  // Public render: computes layout up-front (so the close/tab buttons always work
  // via onClick even if the body fails), then renders the body INSIDE a try/catch.
  // A thrown body can no longer kill the game loop — it shows a safe shell instead.
  function render() {
    if (!open) return
    const L = layout(); _L = L
    try { _renderBody(L) }
    catch (e) { _warnOnce('render', e); _renderSafeShell(L) }
  }

  // Minimal always-safe shell: panel chrome + tabs + close + a message. Drawn only
  // when the real body throws, so the Wiki stays open/closable and the game runs.
  function _renderSafeShell(L) {
    try {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(10,12,26,0.97)'; ctx.strokeStyle = '#b15bff66'; ctx.lineWidth = 1
      ctx.fillRect(L.px, L.py, L.PW, L.PH); ctx.strokeRect(L.px, L.py, L.PW, L.PH)
      ctx.textAlign = 'left'; ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 14px monospace'
      ctx.fillText('WIKI — Compendium', L.px + 20, L.py + 28)
      ctx.strokeStyle = '#ff6b6b88'; ctx.strokeRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h)
      ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('X', L.closeBtn.x + 10, L.closeBtn.y + 14)
      for (const t of L.tabs) {
        const active = t.i === tab
        ctx.fillStyle = active ? 'rgba(177,91,255,0.22)' : 'rgba(255,255,255,0.04)'; ctx.fillRect(t.x, t.y, t.w, t.h)
        ctx.strokeStyle = active ? '#b15bff' : '#2a2f44'; ctx.lineWidth = 1; ctx.strokeRect(t.x, t.y, t.w, t.h)
        ctx.fillStyle = active ? '#e0c8ff' : '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
        ctx.fillText(t.t, t.x + t.w / 2, t.y + 17)
      }
      ctx.fillStyle = '#9fb3c8'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Content temporarily unavailable for this tab.', L.px + L.PW / 2, L.py + L.PH / 2)
      ctx.fillStyle = '#6a7290'; ctx.font = '9px monospace'
      ctx.fillText('esc / click outside to close', L.px + L.PW / 2, L.py + L.PH - 12)
      ctx.textAlign = 'left'
    } catch (_) { /* even the shell must never throw out */ }
  }

  function _renderBody(L) {
    _hoverEntry = null
    const reg = registry()

    // dim + panel
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(10,12,26,0.97)'; ctx.strokeStyle = '#b15bff66'; ctx.lineWidth = 1
    ctx.fillRect(L.px, L.py, L.PW, L.PH); ctx.strokeRect(L.px, L.py, L.PW, L.PH)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#e0fbfc'; ctx.font = 'bold 14px monospace'
    ctx.fillText('WIKI — Compendium', L.px + 20, L.py + 28)

    // close
    ctx.strokeStyle = '#ff6b6b88'; ctx.strokeRect(L.closeBtn.x, L.closeBtn.y, L.closeBtn.w, L.closeBtn.h)
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('X', L.closeBtn.x + 10, L.closeBtn.y + 14); ctx.textAlign = 'left'

    // tabs
    for (const t of L.tabs) {
      const active = t.i === tab
      ctx.fillStyle = active ? 'rgba(177,91,255,0.22)' : 'rgba(255,255,255,0.04)'
      ctx.fillRect(t.x, t.y, t.w, t.h)
      ctx.strokeStyle = active ? '#b15bff' : '#2a2f44'; ctx.lineWidth = 1; ctx.strokeRect(t.x, t.y, t.w, t.h)
      ctx.fillStyle = active ? '#e0c8ff' : '#9fb3c8'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(t.t, t.x + t.w / 2, t.y + 17)
    }
    ctx.textAlign = 'left'

    // Gear search box
    if (L.searchBox) {
      const s = L.searchBox
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(s.x, s.y, s.w, s.h)
      ctx.strokeStyle = searchFocused ? '#b15bff' : '#2a2f44'; ctx.lineWidth = 1
      ctx.strokeRect(s.x, s.y, s.w, s.h)
      ctx.font = '11px monospace'; ctx.textAlign = 'left'
      if (search) { ctx.fillStyle = '#e0e6f2'; ctx.fillText(search + (searchFocused ? '_' : ''), s.x + 8, s.y + 15) }
      else { ctx.fillStyle = '#6a7290'; ctx.fillText('Search gear (name / slot / class / source)…', s.x + 8, s.y + 15) }
    }

    // entries (CACHED per tab — built/sorted ONCE, not every frame) + grid config
    const entries = entriesFor(reg, tab)
    let cols, cardH, drawCard
    if (tab === 0)      { cols = 3; cardH = 66;  drawCard = cardDungeon }
    else if (tab === 1) { cols = 4; cardH = 112; drawCard = cardBoss }
    else if (tab === 2) { cols = 4; cardH = 62;  drawCard = cardGear }
    else                { cols = 4; cardH = 70;  drawCard = cardMob }

    _contentH = renderGrid(L, entries, cardH, cols, drawCard)
    drawScrollbar(L)

    // Bottom-left detail panel — hovered entry overrides the pinned selection.
    const selEntry = entries.find(e => e.key === selKey[tab]) || null
    try { renderDetail(L, _hoverEntry || selEntry) } catch (e) { _warnOnce('renderDetail', e) }

    // hint
    ctx.fillStyle = '#6a7290'; ctx.font = '9px monospace'; ctx.textAlign = 'right'
    ctx.fillText('wheel/drag: scroll  •  click: pin details  •  esc/outside: close', L.px + L.PW - 16, L.py + L.PH - 8)
    ctx.textAlign = 'left'
  }

  // ---- listeners (mirror stations.js) ----
  window.addEventListener('keydown', e => {
    if (!open) return
    if (e.code === 'Escape') {
      // Esc clears search focus first, then closes the panel.
      if (searchFocused) { searchFocused = false } else { close() }
      e.stopPropagation(); e.preventDefault(); return
    }
    // Gear search typing (only while the box is focused).
    if (searchFocused) {
      if (e.code === 'Backspace') search = search.slice(0, -1)
      else if (e.key && e.key.length === 1 && search.length < 40) search += e.key
      else return
      invalidateCache(2)   // gear list is filtered by search → rebuild the cache
      scroll[2] = 0        // reset scroll when the filter changes
      e.stopPropagation(); e.preventDefault()
    }
  }, true)
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || !open) return
    if (onClick(e.clientX, e.clientY)) e.stopPropagation()
  }, true)
  canvas.addEventListener('mousemove', e => {
    if (open && _drag) { scrollToY(e.clientY); e.stopPropagation() }
  }, true)
  window.addEventListener('mouseup', () => { _drag = false })
  canvas.addEventListener('wheel', e => {
    if (!open) return
    onWheel(e.deltaY)
    e.stopPropagation(); e.preventDefault()
  }, { capture: true, passive: false })

  return { isOpen, open: openPanel, close, render }
})()

window.Wiki = Wiki
