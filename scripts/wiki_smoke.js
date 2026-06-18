// ============================================================
// wiki_smoke.js — non-browser smoke test for the Wiki freeze guard.
// No dependencies. Run:  node scripts/wiki_smoke.js
// ------------------------------------------------------------
// The game froze because an exception thrown out of Wiki.render() killed the
// requestAnimationFrame loop (loop() only reschedules at its end). This stubs the
// minimal browser globals, evaluates js/wiki.js, then calls open()/render()/close()
// and FAILS if anything throws OUT (it must not — render is now try/caught).
// ============================================================
'use strict'
const fs = require('fs')
const path = require('path')

const noop = () => {}
// Canvas 2D context stub: every drawing call is a no-op; measureText returns a
// width; property assignments (fillStyle/font/…) are ignored.
const ctx = new Proxy({}, {
  get(_, p) { return p === 'measureText' ? (() => ({ width: 10 })) : noop },
  set() { return true }
})
globalThis.canvas = { width: 1280, height: 720, addEventListener: noop }
globalThis.ctx = ctx
globalThis.mouse = { x: 0, y: 0 }
globalThis.window = { addEventListener: noop }
globalThis.account = { dungeonCompletions: {} }
// Data globals (DUNGEONS/MOB_DEFS/ITEM_BASES/…) are intentionally left undefined —
// wiki.js's getters use `typeof X !== 'undefined' ? X : {}`, so it builds empty
// tables and must still render without throwing.

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'wiki.js'), 'utf8')
try {
  // Indirect eval → runs in global scope (sloppy) so bare canvas/ctx/window resolve.
  ;(0, eval)(code)
} catch (e) {
  console.error('WIKI SMOKE FAIL: wiki.js threw on load:', e && e.message); process.exit(1)
}

const Wiki = globalThis.window.Wiki
if (!Wiki || typeof Wiki.render !== 'function') {
  console.error('WIKI SMOKE FAIL: Wiki not exported'); process.exit(1)
}
try {
  Wiki.open()
  for (let f = 0; f < 5; f++) Wiki.render()   // a few frames (exercises the cache path)
  Wiki.close()
  Wiki.render()                               // closed → must be a no-op
} catch (e) {
  console.error('WIKI SMOKE FAIL: render threw out (would freeze the game loop):', e && e.message)
  process.exit(1)
}
console.log('WIKI SMOKE OK — open/render/close did not throw')
