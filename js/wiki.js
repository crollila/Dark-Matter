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
      const drops = []
      const seen = {}
      for (const dk of dks) for (const k of (exByD[dk] || [])) { if (!seen[k]) { seen[k] = 1; drops.push(itemName(k)) } }
      let mythic = null, found
      if (wbInfo) {
        mythic = wbInfo.mythic ? itemName(wbInfo.mythic) : null
        found = 'World Boss — ' + (biomeName(wbInfo.biome) || 'open world')
      } else {
        found = dks.length ? dks.map(dunName).join(', ') : 'Unknown'
      }
      return { key: mk, name: m.name || mk, color: m.color || '#ff6b6b', found, drops, mythic, isWorld: !!wbInfo }
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
  let _L = null
  let _contentH = 0
  let _hoverItem = null

  function isOpen() { return open }
  function openPanel() { open = true; registry() }
  function close() { open = false }

  // ---- layout ----
  function layout() {
    const PW = Math.min(780, canvas.width - 40)
    const PH = Math.min(600, canvas.height - 40)
    const px = ((canvas.width - PW) / 2) | 0
    const py = ((canvas.height - PH) / 2) | 0
    const closeBtn = { x: px + PW - 30, y: py + 10, w: 20, h: 20 }
    const tabW = ((PW - 40) / TABS.length) | 0
    const tabs = TABS.map((t, i) => ({ t, i, x: px + 20 + i * tabW, y: py + 40, w: tabW - 6, h: 26 }))
    const lx = px + 20, ly = py + 80, lw = PW - 40, lh = PH - 100
    return { PW, PH, px, py, closeBtn, tabs, lx, ly, lw, lh }
  }
  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  // ---- input ----
  function onClick(x, y) {
    if (!open || !_L) return false
    const L = _L
    if (hit(L.closeBtn, x, y)) { close(); return true }
    for (const t of L.tabs) if (hit(t, x, y)) { tab = t.i; return true }
    if (x < L.px || x > L.px + L.PW || y < L.py || y > L.py + L.PH) { close(); return true }
    return true   // swallow clicks inside the panel
  }
  function onWheel(dy) {
    if (!open) return
    const viewH = _L ? _L.lh : 400
    const max = Math.max(0, _contentH - viewH)
    scroll[tab] = Math.max(0, Math.min(max, scroll[tab] + dy))
  }

  // ---- render helpers ----
  function rowBg(x, y, w, h, accent) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = accent || '#3a3f5a'; ctx.fillRect(x, y, 3, h)
  }
  function text(t, x, y, c, bold) {
    ctx.fillStyle = c || '#d8e6f2'; ctx.font = (bold ? 'bold ' : '') + '11px monospace'; ctx.textAlign = 'left'
    ctx.fillText(t, x, y)
  }
  // join an array of short strings, truncated to fit a pixel width
  function clamp(str, max) {
    ctx.font = '10px monospace'
    if (ctx.measureText(str).width <= max) return str
    while (str.length > 4 && ctx.measureText(str + '…').width > max) str = str.slice(0, -1)
    return str + '…'
  }

  // ---- per-tab list render. Returns total content height. ----
  function renderList(L, rows) {
    let cy = L.ly - scroll[tab]
    let total = 0
    ctx.save()
    ctx.beginPath(); ctx.rect(L.lx, L.ly, L.lw, L.lh); ctx.clip()
    for (const row of rows) {
      const h = row.lines.length * 15 + 12
      if (cy + h > L.ly && cy < L.ly + L.lh) {
        rowBg(L.lx, cy, L.lw, h, row.accent)
        let ty = cy + 16
        for (const ln of row.lines) { text(clamp(ln.t, L.lw - 24), L.lx + 10, ty, ln.c, ln.b); ty += 15 }
        if (row.hoverKey && mouse.x >= L.lx && mouse.x <= L.lx + L.lw && mouse.y >= cy && mouse.y <= cy + h
            && mouse.y >= L.ly && mouse.y <= L.ly + L.lh) {
          const s = sampleFor(row.hoverKey)
          if (s) _hoverItem = s
        }
      }
      cy += h + 4; total += h + 4
    }
    ctx.restore()
    return total
  }

  function rowsForDungeons(reg) {
    const comp = (typeof account !== 'undefined' && account.dungeonCompletions) || {}
    return reg.dungeons.map(d => {
      const lines = [
        { t: d.name + '  ' + starStr(d.stars), c: d.color, b: true },
        { t: d.theme + '  •  Boss: ' + d.bossName + (d.worldBoss ? '  •  via ' + d.worldBoss : ''), c: '#9fb3c8' },
        { t: 'Cleared: ' + (comp[d.key] || 0) + '   Notable: ' + (d.exclusives.length ? d.exclusives.slice(0, 4).join(', ') : '—'), c: '#aab8c8' },
      ]
      return { lines, accent: d.color }
    })
  }
  function rowsForBosses(reg) {
    return reg.bosses.map(b => {
      const lines = [
        { t: b.name + (b.isWorld ? '  [WORLD BOSS]' : ''), c: b.color, b: true },
        { t: 'Found: ' + b.found, c: '#9fb3c8' },
        { t: 'Drops: ' + (b.mythic ? b.mythic + ' (mythic), ' : '') + (b.drops.length ? b.drops.join(', ') : '—'), c: '#aab8c8' },
      ]
      return { lines, accent: b.color }
    })
  }
  function rowsForGear(reg) {
    return reg.gear.map(g => {
      const lines = [
        { t: g.name + (g.unique ? '  ✦' : ''), c: '#e0e6f2', b: true },
        { t: g.slot + '  •  ' + g.classes + '  •  ' + g.cat, c: '#9fb3c8' },
        { t: 'From: ' + g.sources.join('  |  '), c: '#aab8c8' },
      ]
      return { lines, accent: '#5a6a8a', hoverKey: g.key }
    })
  }
  function rowsForMobs(reg) {
    return reg.mobs.map(m => {
      const lines = [
        { t: m.name + (m.isBoss ? '  [BOSS]' : ''), c: m.color, b: true },
        { t: m.where + '   HP ' + (m.hp ? m.hp.toLocaleString() : '?'), c: '#9fb3c8' },
        { t: 'Drops: ' + (m.drops.length ? m.drops.join(', ') : 'common gear pool'), c: '#aab8c8' },
      ]
      return { lines, accent: m.color }
    })
  }

  function render() {
    if (!open) return
    const L = layout(); _L = L
    _hoverItem = null
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

    let rows
    if (tab === 0) rows = rowsForDungeons(reg)
    else if (tab === 1) rows = rowsForBosses(reg)
    else if (tab === 2) rows = rowsForGear(reg)
    else rows = rowsForMobs(reg)

    _contentH = renderList(L, rows)

    // scrollbar hint
    ctx.fillStyle = '#6a7290'; ctx.font = '9px monospace'; ctx.textAlign = 'right'
    ctx.fillText('scroll: wheel   •   esc / click outside: close', L.px + L.PW - 16, L.py + L.PH - 8)
    ctx.textAlign = 'left'

    if (_hoverItem && typeof renderItemTooltip === 'function') renderItemTooltip(_hoverItem, mouse.x + 12, mouse.y + 12)
  }

  // ---- listeners (mirror stations.js) ----
  window.addEventListener('keydown', e => {
    if (open && e.code === 'Escape') { close(); e.stopPropagation(); e.preventDefault() }
  }, true)
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || !open) return
    if (onClick(e.clientX, e.clientY)) e.stopPropagation()
  }, true)
  canvas.addEventListener('wheel', e => {
    if (!open) return
    onWheel(e.deltaY)
    e.stopPropagation(); e.preventDefault()
  }, { capture: true, passive: false })

  return { isOpen, open: openPanel, close, render }
})()

window.Wiki = Wiki
