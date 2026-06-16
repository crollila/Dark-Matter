// ============================================================
// OPTIONS — ESC settings menu (hotkeys + graphics + screen rotation)
// ------------------------------------------------------------
// Toggle with Esc in gameplay zones. Settings persist to localStorage.
// The "graphics" options are multiplayer placeholders: they are stored
// and displayed, but there are no real other-player projectiles yet, so
// they only take effect once multiplayer exists.
// Screen rotation is live: hold Q/E to rotate, Z to reset to 0° (or the
// Options reset button). Movement is screen-relative and mouse aim is
// converted back through the inverse rotation, so shooting stays correct.
// ============================================================

// Rebindable gameplay hotkeys (stored as KeyboardEvent.code values).
// Move/Shoot/Chat/Command/Options stay fixed — rebinding Esc/Enter/'/' would
// break the menus. Interact defaults to Control (E is now screen-rotate).
const DEFAULT_KEYS = {
  ability:     'Space',
  interact:    'ControlLeft',
  inventory:   'KeyI',
  returnNexus: 'KeyR',
  ring2:       'AltLeft',
}

// Fixed render/AI distances (world px, NOT window-size based). Mobs farther
// than renderDistance from the camera aren't drawn; mobs farther than
// aiWakeDistance from the player sleep (no AI). Bosses ignore both.
// tileRenderRadius is in TILES (blocks): only tiles within this circular radius
// of the camera are drawn (visual only — collision/gameplay data is untouched,
// minimap unaffected). Caps tile count when zoomed/large windows. Default sized
// to fully cover normal screens (60 tiles = 1920px radius).
const PERF_DEFAULTS = { renderDistance: 1500, aiWakeDistance: 1800, tileRenderRadius: 60 }
const PERF_LIMITS = {
  renderDistance: { min: 600, max: 3000, step: 100 },
  aiWakeDistance: { min: 700, max: 4000, step: 100 },
  tileRenderRadius: { min: 20, max: 120, step: 4 },
}

const Settings = {
  hideOtherProjectiles: false,
  otherPlayerOpacity: 100,   // 0..100 (%)
  screenRotation: 0,         // degrees; Q/E rotate the view (applied in render)
  renderDistance: PERF_DEFAULTS.renderDistance,
  aiWakeDistance: PERF_DEFAULTS.aiWakeDistance,
  tileRenderRadius: PERF_DEFAULTS.tileRenderRadius,
  keys: { ...DEFAULT_KEYS },
}
window.Settings = Settings

// Friendly label for a KeyboardEvent.code (for prompts / options UI).
function keyLabel(code) {
  if (!code) return '?'
  if (code.indexOf('Key') === 0)   return code.slice(3)
  if (code.indexOf('Digit') === 0) return code.slice(5)
  if (code.indexOf('Arrow') === 0) return code.slice(5)
  const map = {
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', Space: 'Space', Enter: 'Enter',
    Escape: 'Esc', Slash: '/', Tab: 'Tab', Backspace: 'Bksp',
  }
  return map[code] || code
}

// Central hotkey lookup used by gameplay zones. `down` is side-agnostic for
// modifier keys (either Ctrl/Alt/Shift satisfies the bind).
const Hotkeys = {
  code(action) { return (Settings.keys && Settings.keys[action]) || DEFAULT_KEYS[action] },
  name(action) { return keyLabel(this.code(action)) },
  down(action) {
    const code = this.code(action)
    if (!code) return false
    if (code === 'ControlLeft' || code === 'ControlRight') return !!(keys['ControlLeft'] || keys['ControlRight'])
    if (code === 'AltLeft'     || code === 'AltRight')     return !!(keys['AltLeft']     || keys['AltRight'])
    if (code === 'ShiftLeft'   || code === 'ShiftRight')   return !!(keys['ShiftLeft']   || keys['ShiftRight'])
    return !!keys[code]
  },
}
window.Hotkeys = Hotkeys

const Options = (() => {
  const LS_KEY = 'realm_settings'
  let open = false
  let _L = null
  let rebinding = null   // action currently waiting for a key press, or null

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
      if (typeof s.renderDistance === 'number') Settings.renderDistance = clamp(Math.round(s.renderDistance), PERF_LIMITS.renderDistance.min, PERF_LIMITS.renderDistance.max)
      if (typeof s.aiWakeDistance === 'number') Settings.aiWakeDistance = clamp(Math.round(s.aiWakeDistance), PERF_LIMITS.aiWakeDistance.min, PERF_LIMITS.aiWakeDistance.max)
      if (typeof s.tileRenderRadius === 'number') Settings.tileRenderRadius = clamp(Math.round(s.tileRenderRadius), PERF_LIMITS.tileRenderRadius.min, PERF_LIMITS.tileRenderRadius.max)
      if (s.keys && typeof s.keys === 'object') {
        for (const k in DEFAULT_KEYS) {
          if (typeof s.keys[k] === 'string') Settings.keys[k] = s.keys[k]
        }
      }
    } catch (e) { /* ignore bad/old settings */ }
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Settings)) } catch (e) { /* storage unavailable */ }
  }

  function toggle() { open = !open }
  function close() { open = false; rebinding = null }

  // Rows with an `action` are rebindable; rows with `fixed` are display-only.
  const HOTKEY_ROWS = [
    { label: 'Move',            fixed: 'WASD / Arrows' },
    { label: 'Shoot',           fixed: 'Left Click' },
    { label: 'Ability',         action: 'ability' },
    { label: 'Interact',        action: 'interact' },
    { label: 'Inventory',       action: 'inventory' },
    { label: 'Return to Nexus', action: 'returnNexus' },
    { label: 'Ring 2 modifier', action: 'ring2' },
    { label: 'Chat',            fixed: 'Enter' },
    { label: 'Command',         fixed: '/' },
    { label: 'Rotate screen',   fixed: 'Hold Q / E' },
    { label: 'Reset rotation',  fixed: 'Z' },
    { label: 'Options',         fixed: 'Esc' },
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
    const PW = 460
    const PH = Math.min(canvas.height - 12, 648)
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

    // ---- HOTKEYS (click a row, then press a key to rebind) ----
    let y = sect('HOTKEYS', py + 56)
    ctx.font = '10px monospace'
    const keyRows = []
    for (const row of HOTKEY_ROWS) {
      ctx.fillStyle = UI.textDim; ctx.textAlign = 'left'; ctx.font = '10px monospace'
      ctx.fillText(row.label, px + 24, y)
      if (row.action) {
        const isReb = rebinding === row.action
        const r = { action: row.action, x: px + PW - 156, y: y - 11, w: 132, h: 15 }
        const hov = hit(r, mouse.x, mouse.y)
        uiPanel(r.x, r.y, r.w, r.h, 4,
          isReb ? UI.accent : (hov ? UI.accent + '88' : '#33405e'),
          isReb ? 'rgba(76,201,240,0.20)' : (hov ? 'rgba(76,201,240,0.10)' : UI.panelBg2))
        ctx.fillStyle = isReb ? UI.accent : UI.text; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'
        ctx.fillText(isReb ? 'press a key…' : keyLabel(Hotkeys.code(row.action)), r.x + r.w / 2, y)
        keyRows.push(r)
      } else {
        ctx.fillStyle = UI.text; ctx.textAlign = 'right'; ctx.fillText(row.fixed, px + PW - 24, y)
      }
      y += 15
    }
    ctx.textAlign = 'left'; y += 8
    const resetKeys = { x: px + 24, y: y - 9, w: 200, h: 22 }
    drawButton(resetKeys, 'Reset hotkeys to default')
    y += 24

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
    ctx.fillText(Math.round(Settings.screenRotation) + '°', px + PW - 90, y + 5); ctx.textAlign = 'left'
    y += 32
    const rotReset = { x: px + 24, y: y - 8, w: 180, h: 24 }
    drawButton(rotReset, 'Reset rotation to 0°')
    y += 32
    ctx.fillStyle = UI.textFaint; ctx.font = '9px monospace'
    ctx.fillText('Hold Q / E in-game to rotate · Z resets to 0°. Aim stays correct while rotated.', px + 24, y)
    y += 18

    // ---- PERFORMANCE (fixed render/AI distances, not window-size based) ----
    y = sect('PERFORMANCE', y)
    ctx.fillStyle = UI.text; ctx.font = '11px monospace'; ctx.fillText('Render distance', px + 24, y + 5)
    const rdMinus = { x: px + PW - 170, y: y - 9, w: 24, h: 22 }
    const rdPlus  = { x: px + PW - 54,  y: y - 9, w: 24, h: 22 }
    drawStep(rdMinus, '-'); drawStep(rdPlus, '+')
    ctx.fillStyle = UI.text; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText(Settings.renderDistance + '', px + PW - 100, y + 5); ctx.textAlign = 'left'
    y += 30
    ctx.fillStyle = UI.text; ctx.font = '11px monospace'; ctx.fillText('AI wake distance', px + 24, y + 5)
    const awMinus = { x: px + PW - 170, y: y - 9, w: 24, h: 22 }
    const awPlus  = { x: px + PW - 54,  y: y - 9, w: 24, h: 22 }
    drawStep(awMinus, '-'); drawStep(awPlus, '+')
    ctx.fillStyle = UI.text; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText(Settings.aiWakeDistance + '', px + PW - 100, y + 5); ctx.textAlign = 'left'
    y += 30
    ctx.fillStyle = UI.text; ctx.font = '11px monospace'; ctx.fillText('Tile render radius (blocks)', px + 24, y + 5)
    const trMinus = { x: px + PW - 170, y: y - 9, w: 24, h: 22 }
    const trPlus  = { x: px + PW - 54,  y: y - 9, w: 24, h: 22 }
    drawStep(trMinus, '-'); drawStep(trPlus, '+')
    ctx.fillStyle = UI.text; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
    ctx.fillText(Settings.tileRenderRadius + '', px + PW - 100, y + 5); ctx.textAlign = 'left'
    y += 28
    ctx.fillStyle = UI.textFaint; ctx.font = '9px monospace'
    ctx.fillText('Lower = better performance. Bosses always render/active.', px + 24, y)

    ctx.fillStyle = UI.textFaint; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Esc to close', px + PW / 2, py + PH - 10); ctx.textAlign = 'left'

    _L = { px, py, PW, PH, closeBtn, keyRows, resetKeys, hideToggle, opMinus, opTrack, opPlus, rotMinus, rotPlus, rotReset, rdMinus, rdPlus, awMinus, awPlus, trMinus, trPlus }
  }

  function onClick(x, y) {
    if (!open || !_L) return false
    const L = _L
    if (hit(L.closeBtn, x, y)) { close(); return true }
    for (const r of (L.keyRows || [])) {
      if (hit(r, x, y)) { rebinding = (rebinding === r.action) ? null : r.action; return true }
    }
    if (hit(L.resetKeys, x, y)) { Settings.keys = { ...DEFAULT_KEYS }; rebinding = null; save(); return true }
    if (hit(L.hideToggle, x, y)) { Settings.hideOtherProjectiles = !Settings.hideOtherProjectiles; save(); return true }
    if (hit(L.opMinus, x, y)) { Settings.otherPlayerOpacity = clamp(Settings.otherPlayerOpacity - 10, 0, 100); save(); return true }
    if (hit(L.opPlus, x, y))  { Settings.otherPlayerOpacity = clamp(Settings.otherPlayerOpacity + 10, 0, 100); save(); return true }
    if (hit(L.opTrack, x, y)) { Settings.otherPlayerOpacity = clamp(Math.round((x - L.opTrack.x) / L.opTrack.w * 20) * 5, 0, 100); save(); return true }
    if (hit(L.rotMinus, x, y)) { Settings.screenRotation = ((Settings.screenRotation - 15) % 360 + 360) % 360; save(); return true }
    if (hit(L.rotPlus, x, y))  { Settings.screenRotation = (Settings.screenRotation + 15) % 360; save(); return true }
    if (hit(L.rotReset, x, y)) { Settings.screenRotation = 0; save(); return true }
    const rd = PERF_LIMITS.renderDistance, aw = PERF_LIMITS.aiWakeDistance, tr = PERF_LIMITS.tileRenderRadius
    if (hit(L.rdMinus, x, y)) { Settings.renderDistance = clamp(Settings.renderDistance - rd.step, rd.min, rd.max); save(); return true }
    if (hit(L.rdPlus, x, y))  { Settings.renderDistance = clamp(Settings.renderDistance + rd.step, rd.min, rd.max); save(); return true }
    if (hit(L.awMinus, x, y)) { Settings.aiWakeDistance = clamp(Settings.aiWakeDistance - aw.step, aw.min, aw.max); save(); return true }
    if (hit(L.awPlus, x, y))  { Settings.aiWakeDistance = clamp(Settings.aiWakeDistance + aw.step, aw.min, aw.max); save(); return true }
    if (hit(L.trMinus, x, y)) { Settings.tileRenderRadius = clamp(Settings.tileRenderRadius - tr.step, tr.min, tr.max); save(); return true }
    if (hit(L.trPlus, x, y))  { Settings.tileRenderRadius = clamp(Settings.tileRenderRadius + tr.step, tr.min, tr.max); save(); return true }
    return true   // swallow all clicks while the menu is open
  }

  // ---- key rebinding (capture phase: claim the next key while listening) ----
  window.addEventListener('keydown', e => {
    if (!open || !rebinding) return
    e.preventDefault(); e.stopPropagation()
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
    // Esc cancels; Enter/'/' are reserved for chat/command so can't be bound.
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Slash') { rebinding = null; return }
    Settings.keys[rebinding] = e.code
    rebinding = null
    save()
  }, true)

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
  return { isOpen, render, toggle, close, save }
})()

window.Options = Options
