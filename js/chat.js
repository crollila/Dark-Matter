// ============================================================
// CHAT / DEBUG COMMANDS — local console (no networking)
// ------------------------------------------------------------
// Toggle with Enter (empty) or '/' (prefilled). While open,
// gameplay input is suppressed (zones check Chat.isOpen()).
// Commands: /help /godmode /giveitem /givedust /xp /level /enter
// ============================================================

const Chat = (() => {
  let open = false
  let buffer = ''
  const log = []   // { text, color, at }

  function isOpen() { return open }

  function inGameplay() {
    return typeof G !== 'undefined' && (G.zone === 'world' || G.zone === 'nexus' || G.zone === 'dungeon' || G.zone === 'vault')
  }

  function pushLog(text, color) {
    log.push({ text, color: color || '#cfe', at: Date.now() })
    while (log.length > 8) log.shift()
  }

  function openChat(prefill) { open = true; buffer = prefill || '' }
  function closeChat() { open = false; buffer = ''; for (const k in keys) keys[k] = false }

  function submit() {
    const line = buffer.trim()
    if (line) { pushLog(line, '#8af'); try { exec(line) } catch (e) { pushLog('error: ' + e, '#ff6b6b') } }
    closeChat()
  }

  // ---- command dispatch ----
  function exec(line) {
    const parts = line.replace(/^\//, '').split(/\s+/)
    const cmd = (parts[0] || '').toLowerCase()
    const a = parts.slice(1)
    const c = (typeof G !== 'undefined') ? G.char : null
    switch (cmd) {
      case 'help':
        pushLog('/godmode  /giveitem <slot|baseKey> [tier1-6]  /givedust <rarity> <n>', '#9fb3c8')
        pushLog('/givedust <rarity> <n>  /giveglory <n>  /xp <n>  /level <n>', '#9fb3c8')
        pushLog('/enter <world|nexus|vault|dungeonKey>', '#9fb3c8')
        break
      case 'godmode':
        if (c) { c.godmode = !c.godmode; pushLog('godmode ' + (c.godmode ? 'ON' : 'OFF'), '#ffd60a') }
        else pushLog('no character', '#ff6b6b')
        break
      case 'giveitem': giveItem(c, a); break
      case 'givemat':  giveMat(a); break
      case 'givedust': giveDust(a); break
      case 'giveglory': if (a[0]) { account.glory += Math.max(0, parseInt(a[0]) || 0); if (window.saveGame) saveGame(); pushLog('+' + a[0] + ' glory', '#cc44ff') } break
      case 'xp':
        if (c && a[0]) { const n = Math.max(0, parseInt(a[0]) || 0); c.xp += n; pushLog('+' + n + ' xp', '#ffd60a') }
        break
      case 'level':    setLevel(c, a); break
      case 'enter':    doEnter(a); break
      default: pushLog('unknown command: ' + cmd + '  (try /help)', '#ff6b6b')
    }
  }

  function giveItem(c, a) {
    if (!c) { pushLog('no character', '#ff6b6b'); return }
    const key = a[0]
    if (!key) { pushLog('usage: /giveitem <slot|defKey> [tier]', '#ff6b6b'); return }
    let it = null
    if (window.ITEM_DEFS && ITEM_DEFS[key]) it = rollItemInstance(key, ITEM_DEFS[key].source)
    else if (window.ITEM_SLOTS && ITEM_SLOTS.indexOf(key) >= 0) it = genTierItem(key, parseInt(a[1]) || 1, 'debug')
    else { pushLog('unknown item/slot: ' + key, '#ff6b6b'); return }
    if (!it) { pushLog('roll failed', '#ff6b6b'); return }
    if (addItemToInventory(c, it)) { pushLog('gave ' + it.name + ' ' + it.rating + '%', it.color); if (window.saveGame) saveGame() }
    else pushLog('inventory full', '#ff6b6b')
  }

  function giveMat(a) {
    // Materials removed from the game. Use /givedust instead.
    pushLog('materials removed — use /givedust <rarity> <n>', '#ff6b6b')
  }

  function giveDust(a) {
    const key = a[0], n = parseInt(a[1]) || 1
    if (!key || !(window.DUST && DUST[key])) { pushLog('dust: ' + Object.keys(window.DUST || {}).join(', '), '#ff6b6b'); return }
    addDust(account, key, n)
    if (window.saveGame) saveGame()
    pushLog('+' + n + ' ' + DUST[key].name, DUST[key].color)
  }

  function setLevel(c, a) {
    if (!c) { pushLog('no character', '#ff6b6b'); return }
    let lv = parseInt(a[0]); if (!lv) { pushLog('usage: /level <n>', '#ff6b6b'); return }
    lv = Math.max(1, Math.min(LEVEL_CAP, lv))
    c.level = lv; c.xp = 0; c.xpNext = xpForLevel(lv + 1)
    recalcStats(c); c.hp = c.maxHp; c.mp = c.maxMp
    if (window.saveGame) saveGame()
    pushLog('level set to ' + lv, '#ffd60a')
  }

  function doEnter(a) {
    const z = a[0]
    if (!z) { pushLog('usage: /enter <world|nexus|dungeonKey>', '#ff6b6b'); return }
    if (z === 'world' || z === 'nexus' || z === 'vault') { closeChat(); G.enterZone(z); return }
    if (window.DUNGEONS && DUNGEONS[z]) { closeChat(); G.enterZone('dungeon', z); return }
    pushLog('unknown zone: ' + z + '  (' + Object.keys(window.DUNGEONS || {}).join(', ') + ')', '#ff6b6b')
  }

  // ---- input (capture phase, runs before engine's bubble handler) ----
  window.addEventListener('keydown', e => {
    if (open) {
      if (e.code === 'Enter')      { submit(); e.stopPropagation(); e.preventDefault(); return }
      if (e.code === 'Escape')     { closeChat(); e.stopPropagation(); e.preventDefault(); return }
      if (e.code === 'Backspace')  { buffer = buffer.slice(0, -1); e.stopPropagation(); e.preventDefault(); return }
      if (e.key && e.key.length === 1 && buffer.length < 80) { buffer += e.key; e.stopPropagation(); e.preventDefault(); return }
      e.stopPropagation()
      return
    }
    if (!inGameplay()) return
    if (window.Options && Options.isOpen()) return   // don't open chat over the options menu
    if (e.code === 'Enter') { openChat(''); e.stopPropagation(); e.preventDefault(); return }
    if (e.key === '/')      { openChat('/'); e.stopPropagation(); e.preventDefault(); return }
  }, true)

  // ---- error console: surface runtime errors locally (no networking) ----
  // Kept quiet during normal play — only fires on actual errors/rejections.
  window.addEventListener('error', e => {
    try { pushLog('⚠ ' + ((e && e.message) || 'error'), '#ff6b6b') } catch (_) {}
  })
  window.addEventListener('unhandledrejection', e => {
    try { pushLog('⚠ ' + ((e && e.reason && e.reason.message) || (e && e.reason) || 'rejection'), '#ff6b6b') } catch (_) {}
  })

  // ---- render (top-left; called from main loop in gameplay zones) ----
  function render() {
    if (!inGameplay()) return
    ctx.textAlign = 'left'
    // Start below the top-left [R]/[I] HUD hints so the log doesn't overlap them.
    let y = 58
    if (open) {
      const bw = Math.min(560, canvas.width - 20)
      ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(10, 56, bw, 24)
      ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1; ctx.strokeRect(10, 56, bw, 24)
      ctx.fillStyle = '#e0fbfc'; ctx.font = '12px monospace'
      const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '_' : ''
      ctx.fillText('> ' + buffer + cursor, 16, 72)
      y = 96
    }
    ctx.font = '11px monospace'
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i]
      const age = Date.now() - e.at
      let alpha = open ? 1 : Math.max(0, 1 - (age - 6000) / 2000)
      if (alpha <= 0) continue
      ctx.globalAlpha = alpha
      ctx.fillStyle = e.color
      ctx.fillText(e.text, 14, y)
      y += 15
    }
    ctx.globalAlpha = 1
  }

  return { isOpen, render, exec, openChat, closeChat }
})()

window.Chat = Chat
