// ============================================================
// OPTIONS — ESC settings menu (hotkeys + graphics + screen rotation)
// ------------------------------------------------------------
// Toggle with Esc in gameplay zones. Settings persist to localStorage.
// The "graphics" options are multiplayer placeholders: they are stored
// and displayed, but there are no real other-player projectiles yet, so
// they only take effect once multiplayer exists.
// Screen rotation has a full settings UI + reset; APPLYING the rotation
// to gameplay is intentionally deferred — the renderer is offset-based
// and rotating it would break mouse aim/shooting. The value is stored.
// ============================================================

const Settings = {
  hideOtherProjectiles: false,
  otherPlayerOpacity: 100,   // 0..100 (%)
  screenRotation: 0,         // degrees; gameplay application deferred
}
window.Settings = Settings

const Options = (() => {
  const LS_KEY = 'realm_settings'
  let open = false
  let _L = null

  function isOpen() { return open }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
  function hit(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

  function inGameplay() {
    return typeof G !== 'undefined' && (G.zone === 'nexus' || G.zone === 'world' || G.zone === 'dungeon' || G.zone === 'vault')
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const s = JSON.parse(raw)
      if (!s || typeof s !== 'object') return
      if (typeof s.hideOtherProjectiles === 'boolean') Settings.hideOtherProjectiles = s.hideOtherProjectiles
      if (typeof s.otherPlayerOpacity === 'number') Settings.otherPlayerOpacity = clamp(Math.round(s.otherPlayerOpacity), 0, 100)
      if (typeof s.screenRotation === 'number') Settings.screenRotation = ((Math.round(s.screenRotation) % 360) + 360) % 360
    } catch (e) { /* ignore bad/old settings */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Settings)) } catch (e) { /* storage unavailable */ }
  }

  function toggle() { open = !open }
  function close() { open = false }

  const HOTKEYS = [
    ['Move', 'WASD / Arrows'],
    ['Shoot', 'Left Click'],
    ['Ability', 'Space'],
    ['Interact', 'E'],
    ['Inventory', 'I'],
    ['Return to Nexus', 'R'],
    ['Chat', 'Enter'],
    ['Command', '/'],
    ['Compare / equip ring 2', 'Alt + hover / click'],
    ['Options', 'Esc'],
  ]

  // ---- small draw helpers ----
  function drawToggle(r, on) {
    uiPanel(r.x, r.y, r.w, r.h, 5, on ? UI.good : '#33405e', on ? 'rgba(95,208,106,0.18)' : UI.panelBg2)
    ctx.fillStyle = on ? UI.good : UI.textDim; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
    ctx.fillText(on ? 'ON' : 'OFF', r.x + r.w / 2, r.y + 15); ctx.textAlign = 'left'
  }
  function drawStep(r, label) {
    const hov = hit(r, mouse.x, mouse.y)
    uiPanel(r.x, r.y, r.w, r.h, 5, hov ? UI.accent : '#33405e', hov ? 'rgba(76,201,240,0.10)' : UI.panelBg2)
    ctx.fillStyle = UI.text; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'
    ctx.fillText(label, r.x + r.w / 2, r.y + 16); ctx.textAlign = 'left'
  }
  function drawButton(r, label) {
    const hov = hit(r, mouse.x, mouse.y)
    uiPanel(r.x, r.y, r.w, r.h, 6, UI.accent, hov ? 'rgba(76,201,240,0.22)' : 'rgba(76,201,240,0.10)')
    ctx.fillStyle = UI.accent; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 4); ctx.textAlign = 'left'
  }

  function render() {
    if (!open) return
    const PW = 440, PH = 484
    const px = ((canvas.width - PW) / 2) | 0
    const py = Math.max(8, ((canvas.height - PH) / 2) | 0)

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    uiPanel(px, py, PW, PH, 12, UI.panelBorder, UI.panelBg)
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = UI.accent; ctx.font = 'bold 15px monospace'
    ctx.fillText('OPTIONS', px + 22, py + 30)

    const closeBtn = { x: px + PW - 30, y: py + 12, w: 20, h: 20 }
    uiPanel(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 5, UI.bad + '99', UI.panelBg2)
    ctx.fillStyle = UI.bad; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('X', closeBtn.x + 10, closeBtn.y + 14); ctx.textAlign = 'left'

    const sect = (title, y) => {
      ctx.fillStyle = UI.textDim; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'
      ctx.fillText(title, px + 22, y); y += 5
      ctx.strokeStyle = '#1f2740'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px + 20, y); ctx.lineTo(px + PW - 20, y); ctx.stroke()
      return y + 16
    }

    // ---- HOTKEYS ----
    let y = sect('HOTKEYS', py + 56)
    ctx.font = '10px monospace'
    for (const [k, v] of HOTKEYS) {
      ctx.fillStyle = UI.textDim; ctx.textAlign = 'left'; ctx.fillText(k, px + 24, y)
      ctx.fillStyle = UI.text; ctx.textAlign = 'right'; ctx.fillText(v, px + PW - 24, y)
      y += 15
    }
    ctx.textAlign = 'left'; y += 12

    // ---- GRAPHICS ----
    y = sect('GRAPHICS (multiplayer placeholders)', y)
    ctx.fillStyle = UI.text; ctx.font = '11px monospace'
    ctx.fillText("Hide other players' projectiles", px + 24, y + 5)
    const hideToggle = { x: px + PW - 110, y: y - 9, w: 86, h: 22 }
    drawToggle(hideToggle, Settings.hideOtherProjectiles)
    y += 34

    ctx.fillStyle = UI.text; ctx.font = '11px monospace'; ctx.fillText('Other player opacity', px + 24, y + 5)
    const opMinus = { x: px + PW - 150, y: y - 9, w: 24, h: 22 }
    const opTrack = { x: px + PW - 120, y: y - 4, w: 60, h: 12 }
    const opPlus  = { x: px + PW - 54,  y: y - 9, w: 24, h: 22 }
    drawStep(opMinus, '-'); drawStep(opPlus, '+')
    uiBar(opTrack.x, opTrack.y, opTrack.w, opTrack.h, Settings.otherPlayerOpacity / 100, UI.accent, UI.mpTrack, null, 4)
    y += 28
    ctx.fillStyle = UI.textFaint; ctx.font = '9px monospace'
    ctx.fillText(Settings.otherPlayerOpacity + '%   (applies once other players exist)', px + 24, y)
    y += 22

    // ---- SCREEN ----
    y = sect('SCREEN', y)
    ctx.fillStyle = UI.text; ctx.font = '11px monospace'; ctx.fillText('Screen rotation', px + 24, y + 5)
    const rotMinus = { x: px + PW - 150, y: y - 9, w: 24, h: 22 }
    const rotPlus  = { x: px + PW - 54,  y: y - 9, w: 24, h: 22 }
    drawStep(rotMinus, '-'); drawStep(rotPlus, '+')
    ctx.fillStyle = UI.text; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText(Settings.screenRotation + '°', px + PW - 90, y + 5); ctx.textAlign = 'left'
    y += 32
    const rotReset = { x: px + 24, y: y - 8, w: 180, h: 24 }
    drawButton(rotReset, 'Reset rotation to 0°')
    y += 32
    ctx.fillStyle = UI.textFaint; ctx.font = '9px monospace'
    ctx.fillText('Gameplay rotation deferred (keeps mouse aim correct).', px + 24, y)

    ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Esc to close', px + PW / 2, py + PH - 12); ctx.textAlign = 'left'

    _L = { px, py, PW, PH, closeBtn, hideToggle, opMinus, opTrack, opPlus, rotMinus, rotPlus, rotReset }
  }

  function onClick(x, y) {
    if (!open || !_L) return false
    const L = _L
    if (hit(L.closeBtn, x, y)) { close(); return true }
    if (hit(L.hideToggle, x, y)) { Settings.hideOtherProjectiles = !Settings.hideOtherProjectiles; save(); return true }
    if (hit(L.opMinus, x, y)) { Settings.otherPlayerOpacity = clamp(Settings.otherPlayerOpacity - 10, 0, 100); save(); return true }
    if (hit(L.opPlus, x, y))  { Settings.otherPlayerOpacity = clamp(Settings.otherPlayerOpacity + 10, 0, 100); save(); return true }
    if (hit(L.opTrack, x, y)) { Settings.otherPlayerOpacity = clamp(Math.round((x - L.opTrack.x) / L.opTrack.w * 20) * 5, 0, 100); save(); return true }
    if (hit(L.rotMinus, x, y)) { Settings.screenRotation = ((Settings.screenRotation - 15) % 360 + 360) % 360; save(); return true }
    if (hit(L.rotPlus, x, y))  { Settings.screenRotation = (Settings.screenRotation + 15) % 360; save(); return true }
    if (hit(L.rotReset, x, y)) { Settings.screenRotation = 0; save(); return true }
    return true   // swallow all clicks while the menu is open
  }

  // ---- input ----
  // Esc on the BUBBLE phase: chat/stations consume Esc in the capture phase
  // (stopPropagation), so this only fires when neither has claimed it.
  window.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return
    if (open) { close(); e.preventDefault(); return }
    if (window.Chat && Chat.isOpen()) return
    if (window.Stations && Stations.isOpen()) return
    if (!inGameplay()) return
    toggle(); e.preventDefault()
  })

  // Clicks while open are routed here first (capture) and swallowed.
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    if (open) { onClick(e.clientX, e.clientY); e.stopPropagation() }
  }, true)

  load()
  return { isOpen, render, toggle, close }
})()

window.Options = Options
