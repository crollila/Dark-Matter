// ============================================================
// MAIN — boot, game loop, zone state machine
// ============================================================

// Global state object — the seam where server data would be injected
const G = {
  zone: 'menu',   // 'menu' | 'classSelect' | 'nexus' | 'world' | 'dungeon' | 'dead'
  char: null,     // active character object (from player.js)
  dungeonKey: null,

  enterZone(zone, arg) {
    // Clear key state on transition to avoid sticky inputs
    for (const k in keys) keys[k] = false

    this.zone = zone

    if (zone === 'nexus') {
      if (!this.char) return
      // Restore HP to full on nexus entry (safe zone)
      this.char.hp = this.char.maxHp
      NexusZone.init(this.char)

    } else if (zone === 'world') {
      if (!this.char) return
      WorldZone.init(this.char)

    } else if (zone === 'dungeon') {
      if (!this.char) return
      this.dungeonKey = arg || 'goblin_warren'
      DungeonZone.init(this.char, this.dungeonKey)

    } else if (zone === 'vault') {
      if (!this.char) return
      this.char.hp = this.char.maxHp   // safe room
      VaultZone.init(this.char)

    } else if (zone === 'classSelect') {
      ClassSelect.init()

    } else if (zone === 'dead') {
      // glory already transferred in onCharacterDeath
      // remove dead char from account list; player picks new one from menu
      if (this.char) {
        const idx = account.characters.indexOf(this.char)
        if (idx >= 0) account.characters.splice(idx, 1)
      }
      // Persist account glory transfer + character removal (permadeath)
      if (window.saveGame) saveGame()
    }
  }
}

// ---- SCREEN ROTATION INPUT ----
// Hold Q (left) / E (right) to rotate the view. Value lives in Settings so the
// Options menu can display/reset it. Not persisted per-frame to avoid storage
// thrash; the Options +/- and reset buttons persist explicit changes.
function updateScreenRotation(dt) {
  if (typeof Settings === 'undefined') return
  // Z instantly resets rotation to 0° (mirrors the Options reset button).
  if (keys['KeyZ']) {
    keys['KeyZ'] = false
    if (Settings.screenRotation) {
      Settings.screenRotation = 0
      if (window.Options && Options.save) Options.save()
    }
  }
  let d = 0
  if (keys['KeyQ']) d -= 1
  if (keys['KeyE']) d += 1
  if (!d) return
  const SPD = 100 // degrees / second
  Settings.screenRotation = (((Settings.screenRotation || 0) + d * SPD * dt) % 360 + 360) % 360
}

// ---- GAME LOOP ----
let lastTime = 0

function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05)  // cap dt at 50ms
  lastTime = ts

  switch (G.zone) {
    case 'menu':
      MainMenu.render()
      break

    case 'classSelect':
      ClassSelect.render()
      break

    case 'nexus':
      if (G.char) {
        NexusZone.update(dt, G.char)
        NexusZone.render(G.char)
      }
      break

    case 'world':
      if (G.char) {
        WorldZone.update(dt, G.char)
        WorldZone.render(G.char)
      }
      break

    case 'dungeon':
      if (G.char) {
        DungeonZone.update(dt, G.char)
        DungeonZone.render(G.char)
      }
      break

    case 'vault':
      if (G.char) {
        VaultZone.update(dt, G.char)
        VaultZone.render(G.char)
      }
      break

    case 'dead':
      renderDead(G.char || { name: '???', classKey: 'warrior', level: 1, glory: 0 })
      break
  }

  // Inventory overlay (gameplay zones only; drawn on top of the HUD)
  if (G.char && (G.zone === 'nexus' || G.zone === 'world' || G.zone === 'dungeon' || G.zone === 'vault')) {
    // Suppress inventory hotkeys while the chat input or a station panel is open.
    const overlayOpen = (window.Chat && Chat.isOpen()) || (window.Stations && Stations.isOpen()) || (window.Options && Options.isOpen())
    if (!overlayOpen) updateScreenRotation(dt)
    if (!overlayOpen) Inventory.update(G.char)
    Inventory.render(G.char)
    // Station panels (salvage/reforge/fusion/gamble/vault), then chat, then options on top.
    if (window.Stations) Stations.render(G.char)
    if (window.Chat) Chat.render()
    if (window.Options) Options.render()
  }

  requestAnimationFrame(loop)
}

// ---- INPUT ROUTING ----
canvas.addEventListener('click', e => {
  if (e.button !== 0) return
  if (G.zone === 'menu')        MainMenu.onClick()
  if (G.zone === 'classSelect') ClassSelect.onClick()
})

window.addEventListener('keydown', e => {
  if (G.zone === 'classSelect') ClassSelect.onKey(e)
  if (G.zone === 'dead' && e.code === 'Enter') { G.char = null; G.enterZone('menu') }
  if (G.zone === 'classSelect' && e.code === 'Escape') G.enterZone('menu')
}, { capture: true })

// ---- BOOT ----
// Ensure account-side fields exist, then restore any local save.
// Bad/missing save data is handled inside loadGame (logs + fresh start).
if (window.ensureSaveDefaults) ensureSaveDefaults(account)
if (window.loadGame) {
  try { loadGame() } catch (e) { console.warn('[boot] loadGame threw; starting fresh:', e) }
}

// Best-effort save when the tab closes/reloads
window.addEventListener('beforeunload', () => { if (window.saveGame) saveGame() })

requestAnimationFrame(loop)
