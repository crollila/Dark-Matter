# Claude Low-Token Workflow — Epsteins Island

Purpose: keep Claude Code/Codex prompts small and stop the agent from rereading the whole project for every change.

Use this file as a source/context file in Claude. Keep it updated after every patch.

---

## Standing project rules

- Project: **Epsteins Island**.
- Type: browser-based RotMG/private-server-inspired bullet hell RPG.
- Architecture: plain HTML + JavaScript + canvas.
- Entry point: `index.html`.
- Scripts live in `js/`.
- No build tools.
- No external dependencies.
- No backend/database yet.
- No multiplayer yet.
- Keep patches small and reviewable.
- Prefer data-driven definitions over hardcoded one-off logic.
- Do not rewrite architecture unless explicitly asked.
- User manually tests gameplay, so do not run expensive preview/manual verification unless requested.

---

## Low-token operating mode

Claude should follow this by default:

1. **Inspect only the files needed for the specific task.**
2. **Do not read the whole project.**
3. **Do not open large unrelated files for context.**
4. **Do not run preview unless the user explicitly asks.**
5. **Run only a syntax check or tiny targeted check when appropriate.**
6. **Final response must be compact:**

```text
Changed files:
Syntax/smoke check:
Known issues:
```

Avoid long summaries, long manual verification scripts, or detailed explanations unless the user asks.

---

## Standard surgical prompt template

```text
Epsteins Island low-token surgical edit.

Read only:
- js/<file>.js

Task:
<one small task>

Do not inspect unrelated files unless impossible.
Do not run preview.
Run syntax check only if needed.

Final response only:
Changed files:
Syntax/smoke check:
Known issues:
```

---

## Standard medium patch prompt template

```text
Epsteins Island low-token patch.

Relevant files likely:
- js/<file1>.js
- js/<file2>.js

Task:
<small feature or bug cluster>

Constraints:
- No deps/build tools.
- No architecture rewrite.
- Preserve existing gameplay.
- Do not implement unrelated features.
- Inspect only needed files.
- I will manually test gameplay.

Final response only:
Changed files:
Smoke checks:
Known issues:
```

---

## File map / where systems live

Update this map after each patch so future prompts can point Claude to exact files.

### `index.html`
- Loads all JavaScript files.
- If adding a new JS module, update script order here.
- Check script order when adding globals used by later files.

### `js/biomes.js`
- Data-driven world biome defs (`BIOMES`, `BIOME_BY_ID`): palette, mob pool, hazard tile, minimap tint, related dungeon-drop key.
- `BOSS_BIOMES` (ids 7-12: Event Horizon/Glacial Throne/Ash Caldera/Rot Garden/Cursed Court/Starfall Dunes): floor/floorAlt/accent/mini/name. Deliberately NOT in `BIOMES` (so assignBiomes never world-scatters them) but folded into `BIOME_BY_ID` so in-world floor tint + minimap tint + biome-name label resolve them. Painted at runtime by world.js around a world boss.
- `assignBiomes(map, rng)`: paints SEPARATED biome clusters (one spaced blob per biome, neutral grass id 0 in the gaps) onto the world map (`map.biome` Uint8Array, `map.biomeAt`, `map.biomeClusters = [{id,x,y,r}]` in tiles), scatters ice/lava hazard tiles, keeps spawn/home neutral. Defensive fallback placement never crashes.

Use for:
- biome palettes / regions
- which mobs spawn in which biome
- biome hazard tile placement

### `js/engine.js`
- Canvas setup/render helpers.
- Tile constants incl. `T_ICE` (snow, slippery), `T_LAVA` (hell, damage+slow).
- `tileSpeedFactor` (water+lava slow), biome floor tint in `renderTileMap`.
- Input globals.
- Camera/math/tile helpers.
- Collision helpers such as wall blocking/water slowing.
- Bullet/particle/floating text helpers.
- Utility helpers like compact number/star rendering if present.

- Screen rotation: `beginWorldTransform`/`endWorldTransform` wrap world-space drawing (rotates about screen center); `screenToWorld`/`worldToScreen` invert/apply the rotation so mouse aim stays correct. HUD/prompts drawn outside the transform. `renderTileMap` pads its tile-draw span to half the screen diagonal when rotated so rotated corners are filled (no black wedges). `renderTileMap` also caps the span at `Settings.tileRenderRadius` (tiles→px) and circular-culls tiles beyond that radius from the camera (visual only; collision/minimap read full map). Default 60 tiles. Player body (`renderPlayer` in ui.js) is inside the transform so it rotates with the world; a world-anchored facing pip makes that visible for symmetric class shapes; aim dot still uses `screenToWorld(mouse)`. Rotation dir: **Q = left/CCW, E = right/CW** (main.js `updateScreenRotation`), Z resets.
- `inputToWorld(vx,vy)`: converts SCREEN-relative WASD/arrow input → world velocity (W always = up on screen at any rotation). Used by all zone movement.
- `drawUpright(ax,ay,fn)`: inside the world transform, draws `fn()` upright (counter-rotated) anchored at offset point `ax,ay` (local +y = screen-down). Used for under-char HP/MP bars (ui.js), loot bags + beam/bounce (items.js `renderLootBag`), portal labels (world.js, now BELOW portal), float texts (engine.js). Loot preview (outside transform) anchors via `worldToScreen`.

Use for:
- movement/collision helpers
- tile behavior
- bullets/projectiles core helpers
- global canvas utilities
- screen rotation transform / aim conversion

Do not use for:
- item definitions
- inventory UI
- station logic

### `js/player.js`
- Character creation.
- Class stats.
- Character inventory/gear shape.
- Stat recalculation from gear.
- Damage calculation / damage taken helpers.
- HP regen / movement stat application.
- XP helpers if present.

Use for:
- stat bugs
- armor/hpRegen/damage bugs
- class restrictions
- death-related character state

### `js/items.js`
- Item definitions and item generation.
- Fixed item identity.
- Rarity-as-tier scaling.
- Universal `rollPercent` item roll model.
- Tier items/mob drops if present.
- Materials/dust definitions.
- Loot table helpers.
- Item tooltip/loot preview helpers if present.
- Salvage/reforge/fusion/gamble item logic if implemented here.
- `BIOME_UNIQUES` (mob-only) + `DUNGEON_EXCLUSIVES` (now 4 per biome dungeon = 3 armor/accessory + 1 class-locked WEAPON, tagged `dungeon:<key>`, `unique:true`): both folded into `ITEM_BASES`, skipped by random/gamble. Exclusive weapons have FIXED `bspd` (single-value range → midpoint, never rerolls/reforges). `EXCLUSIVES_BY_DUNGEON` lookup; `rollDungeonExclusive(key, boost, classKey?)` filters class-locked exclusives to the active class (falls back to agnostic ones if none usable). `generateBossLoot` rolls exclusive (boss high chance), `rollMobDrop` adds a rare exclusive for dungeon basic mobs.
- Class-targeted loot: `CLASS_AFFINITY` (per-class preferred stats) + `baseAffinityWeight` bias `randomItem`'s base pick toward class-fitting gear (weapons already hard class-locked). Old/agnostic bases keep weight 1 — safe.
- `WORLD_BOSS_MYTHICS` (`m_*`): one mythic per world boss, `unique:true` + NO `dungeon` tag (kept out of random/gamble AND EXCLUSIVES_BY_DUNGEON) — rolled directly via `rollItem(base,'mythic')` by world.js `onWorldBossKill`. 5 affixes each. `DUNGEON_EXCLUSIVES` also now carries 3 exclusives for each of the 6 world-boss dungeons.
- Loot ownership: `createLootBag(x,y,loot,life,meta)` where `meta={ownerId,visibility,source}`. Bags carry `ownerId`/`visibility`('public'|'private')/`source`('mob'|'boss'|'drop'). `lootBagAccessible(bag,char)`: non-private→open; private+no owner→open (old shapes safe); private+owner→only matching `char.id`. `bagIsEmpty(bag)`. `pickupLootBag` (pick-all) + `pickLootItem(char,acct,bag,index)` (single item) both gate on access; no dup/delete. `renderLootPreview` rows are clickable (hit-map `_lootPreviewHit`); `handleLootPreviewClick` + a capture mousedown listener pick one item (disabled while inventory/options/stations/chat open). A consumed preview click also clears `mouse.down` (engine sets it first on the same target) so it never fires a gameplay shot.

Use for:
- item stats/rarity/rollPercent
- affix counts
- item generation bugs
- loot tables
- dust amounts
- reforge/fusion/gamble rules

### `js/inventory.js`
- Inventory panel.
- Equipped gear panel.
- Stats/materials tabs.
- Vault tab if present, unless removed from character panel.
- Item select/equip/unequip/swap UI.
- Inventory/stash transfer helpers if they live here.
- Inventory debug helpers.

- Drag/drop: grid items are drag-aware. `onMouseDown`/`onMouseMove`/`onMouseUp` (window-level mouseup so off-panel drops are caught). Plain click = equip (old feel). Drag to another grid cell = slot-stable `moveItem` (move/swap, never compacts). Drag to an equipment slot = equip. Drag released OUTSIDE the window = `dropToGround` → creates a PRIVATE (owner=char.id, source 'drop') loot bag at the character via `window.activeLootZone.addBag` (world/dungeon only; item kept if bag creation fails; leaves a hole). Drag ghost + "drop" hint rendered at cursor.

Use for:
- inventory UI bugs
- item tooltips inside inventory
- equip/unequip/swap issues / drag-drop / drop-to-ground
- panel layout
- removing vault access from character panel

### `js/save.js`
- localStorage save/load.
- Save schema version/defaults.
- Account persistence.
- Character serialization/deserialization.
- Stash/materials/dust/glory persistence.
- Death/permadeath persistence filtering.

Use for:
- save/load bugs
- old save compatibility
- stash/material/dust persistence
- dead character accidentally saved

### `js/map.js`
- Map/dungeon generation definitions/helpers.
- `DUNGEONS` definitions may live here or in `mobs.js` depending on current project state.
- Nexus/dungeon/vault map building if present.
- Tile palettes/spawn positions.

Use for:
- dungeon generation issues
- map layout
- portal tile placement
- vault room map if build function is here

### `js/mobs.js`
- Mob definitions.
- Boss definitions.
- Mob/boss AI patterns.
- Dungeon definitions may currently live here.
- Star ratings may be on dungeon defs here.
- `DUNGEONS` includes 3 OG (goblin_warren/fungal_cavern/void_rift) + 6 biome dungeons (dark_matter_core, frozen_catacombs, infernal_pit, plague_grotto, fallen_keep, astral_tomb, each tagged `biome: true`), each with tileColor/mobs/boss/rooms/roomSize/mobsPerRoom. Biome dungeon bosses reuse boss_void/boss_mycelian/boss_goblin AI. Unknown key → `buildDungeon` returns null → DungeonZone.init bails to world. `biome: true` keeps them out of world scatter (map.js) — they enter only via biome mob portal drops. Biome mob `portalDrop.chance` = 0.25 (used raw in world.js, no multiplier).

- Perf: `updateMob`/`renderMob` do offscreen culling + AI sleep using FIXED world-px distances from Options (`Settings.renderDistance`/`aiWakeDistance`, NOT window size). `_mobRenderDist()` (cull radius from camera) + `_mobWakeDist()` (sleep radius from player; forced ≥ render+200 so visible mobs stay awake). Cull/sleep are RADIAL (distance², not viewport rect) so rotation-safe. Mobs past render dist aren't drawn; past wake dist sleep (`e.asleep=true`, skip AI). Bosses never sleep/cull. Mobs are NEVER removed from arrays when culled. Counters in `MobDebug`; `mobStats()` logs. Minimap unaffected (reads `mobs` array directly).
- Aggro/leash (in `updateMob`, applies to world+dungeon): per-mob `aggroRange`/`deAggroRange`/`homeLeash` (optional def overrides) with safe AI-type defaults (`_aggroRange`/`_deAggroRange`/`_homeLeash`; bosses ALWAYS active, never sleep/leash). Mob idles/returns toward `homeX/homeY` until player enters aggro range (no shots while non-aggro or asleep). De-aggros past `deAggroRange` (hysteresis) OR when dragged off `homeLeash` / out of its `biome` tile → walks home. Getting hit by a player bullet sets `e.aggro=true` (world.js/dungeon.js). Dungeon mobs/bosses have no biome/home → idle-in-place then fight; bosses unaffected.
- Enemy HP bar + boss name in `renderMob` use `drawUpright(sx,sy,…)` (like player bars) — pinned above the mob, readable/upright, position tracks world under rotation.

- `WORLD_BOSSES` (+ `WORLD_BOSS_KEYS`, `window.WORLD_BOSSES`): 6 `wb_*` boss mob defs (reuse boss_void/boss_mycelian/boss_goblin AIs) mapped to boss biome id / mythic base / dungeon key. 6 world-boss `DUNGEONS` entries (`biome:true`) reuse biome mobs + existing dungeon bosses. Spawn/biome/loot logic lives in world.js.

Use for:
- mob stats/AI
- boss bullet patterns
- world boss defs / world-boss dungeon defs (`WORLD_BOSSES`, DUNGEONS)
- dungeon metadata like stars if located here
- XP/drop source data if stored on mobs
- offscreen culling / AI sleep / mob perf tuning

### `js/world.js`
- Open world zone.
- World mobs/combat.
- World portal drops/spawns.
- Portal labels/interact-to-enter.
- World loot bags and mob drops if implemented here.
- Water movement in world update if zone-specific.
- Spawning: `populateWorld` spreads biome mobs across each `map.biomeClusters` blob at world-gen (+ a few neutral wanderers); `spawnInBiome`/`spawnNeutral`/`findBiomeSpot` find valid tiles inside the right biome, away from player/home. NO spawn-near-player repop.
- Respawn: dead biome mobs scheduled in `respawnQueue` (random 1–30s via `worldTime`), respawn as a random one of that biome's 3 mobs inside the same biome, not next to player.
- Drop tuning consts in `killMob`: `BIOME_LOOT_CHANCE`/`NEUTRAL_LOOT_CHANCE`, `PORTAL_MULT`, `UNIQUE_MULT`. Biome mobs still share common drops + keep their unique.

- World bosses: `WORLD_BOSSES` (mobs.js) maps each of 6 world bosses → boss biome id, signature mythic base, related dungeon. `killMob` counts NON-boss world kills (`mobKillCount`); every `WORLD_BOSS_EVERY` (6) it calls `trySpawnWorldBoss` (cap 1 active). `spawnWorldBoss` finds a walkable spot away from home/player (avoids water/lava), spawns the boss (`worldBoss`, `boss.worldBoss=true`, always aggro/never sleeps), paints its boss biome via `paintBossBiome` (overwrites `map.biome` ids in a radius, saves prev ids on `boss._biomePatch`, nulls `map._mini`), shows "World Boss Awakened". `bossDamage` tracks per-player hits. `onWorldBossKill` (boss branch at top of `killMob`): grants XP, `restoreBossBiome`, drops a PRIVATE bag with the boss mythic (`rollItem(base,'mythic')`) + a bonus item gated by the 2% threshold, then drops a `pendingPortals` portal to the boss's dungeon (always, 90s). Debug hooks `WorldZone.debugSpawnBoss/debugWorldBoss` (chat `/spawnboss`,`/worldboss`).

Use for:
- world portal behavior
- world mob drops / drop rates
- biome mob spawn distribution + respawn timing
- world movement/input bugs
- portal expiry
- world boss spawn rule / boss biome paint / world boss loot+dungeon portal

### `js/dungeon.js`
- Dungeon zone runtime.
- Dungeon combat loop.
- Boss kill hook. `bossDamage = {[charId]: total}` (per-player damage map, reset in `init`) accumulated on each player-bullet boss hit. `onBossKill` first spawns a return portal (sets boss tile to `T_PORTAL_DUNGEON`, BEFORE the loot gate so it always appears; reuses the exit-tile prompt + enter-to-`world` logic, which already yields to loot pickup via `!nearBag`), then gates loot: only spawns if `dealt >= 0.02 * boss.maxHp` (single-player passes naturally), else float "No loot: not enough boss contribution". Boss bag is PRIVATE (owner=char.id, source 'boss'). Mob drops are PUBLIC mob bags. Empty bags (single-item picked) removed in the loot loop via `bagIsEmpty`. `init` registers `window.activeLootZone`.
- Boss loot bag spawning.
- Dungeon loot bags/previews.
- Dungeon exit portal behavior.
- Dungeon mob drops/XP.
- Dungeon HUD boss bar position if implemented here.

Use for:
- boss loot not spawning
- dungeon mob drops
- dungeon E pickup/portal conflicts
- boss HP bar overlap
- dungeon exit behavior

### `js/nexus.js`
- Nexus safe zone.
- Station/portal interactions.
- World portal/vault portal entry from Nexus.
- Station placeholders/labels.
- E-to-interact station behavior.

Use for:
- Nexus station prompts
- vault portal from Nexus
- station access bugs

### `js/stations.js`
- Station modal/panel UI.
- Salvage/Reforge/Fusion/Gamble screens.
- Station item selection logic.
- Dust/glory cost display.

Use for:
- salvage/reforge/fusion/gamble UI bugs
- station selection edge cases
- station panel rendering

### `js/vault.js`
- Vault room zone.
- Vault chests/storage room rendering.
- Vault room interaction logic if present.

Use for:
- vault room bugs
- stash room portal behavior
- chest storage room UI

### `js/chat.js`
- Local debug command console.
- Commands like `/help`, `/godmode`, `/giveitem`, `/givemat`, `/givedust`, `/giveglory`, `/xp`, `/level`, `/enter`.
- Chat log rendering/input suppression.

Use for:
- command bugs
- debug input conflicts

### `js/ui.js`
- General HUD/menu/class select/death screen rendering.
- HUD zone labels and compact HP/MP display.
- Top UI layout.

Use for:
- HUD overlap
- menu/class selection UI
- death/menu render issues

### `js/options.js`
- ESC options menu (gameplay zones only).
- Rebindable hotkeys: click a row → press a key (stored as `KeyboardEvent.code`). Graphics placeholders, screen rotation +/- + reset, reset-hotkeys button. PERFORMANCE section: render distance + AI wake distance + tile render radius (blocks) +/- steppers (clamped via `PERF_LIMITS`, defaults `PERF_DEFAULTS` 1500/1800/60). `tileRenderRadius` (tiles) feeds `renderTileMap` circular tile cull.
- `Settings` global (incl. `Settings.keys`, `renderDistance`, `aiWakeDistance`, `tileRenderRadius`) + localStorage persistence (`realm_settings`); unknown/old settings fall back to defaults.
- `DEFAULT_KEYS`: interact=Control, inventory=I, returnNexus=R, ability=Space, ring2=Alt. Move/Shoot/Chat/Command/Options are fixed (Esc/Enter/'/' can't be bound).
- Global `Hotkeys` helper: `Hotkeys.code/name/down(action)` (modifier-side-agnostic). Zones use this instead of hardcoded `keys['KeyE']` etc.
- Screen rotation is now LIVE: hold Q/E to rotate (handled in `main.js` `updateScreenRotation`); render transform + aim conversion live in `engine.js`.
- Zones gate input via `Options.isOpen()`.

Use for:
- options/settings UI
- hotkey list
- persisted client settings

### `js/main.js`
- Boot sequence.
- Global game state `G`.
- Zone switching.
- Main update/render loop.
- Calls zone update/render and overlay modules.
- Save/load boot integration.

Use for:
- zone wiring
- new module update/render calls
- script initialization order issues
- global input gating between modules

---

## Current implemented systems checklist

Keep updated.

- [x] Plain canvas game boots from `index.html`
- [x] Character creation/classes
- [x] Nexus/world/dungeon zones
- [x] Loot bags/chests
- [x] Boss loot
- [x] Basic mob drops
- [x] Fixed item identity
- [x] Rarity-as-tier scaling
- [x] Universal `rollPercent`
- [x] Per-stat roll percent display
- [x] Inventory/equip
- [x] Save/load
- [x] Permadeath separation: character gear/inventory dies, account data survives
- [ ] Materials — REMOVED (no drops/UI; old saves' `account.materials` kept but unused)
- [x] Dust (still required for Salvage/Reforge)
- [x] Salvage
- [x] Reforge
- [x] Fusion
- [x] Gamble
- [x] Void multiplier stats
- [x] Account stash via Nexus VAULT station (now on a hallway `???` alcove at tile 29,16; standalone spawn-room vault tile removed; old vault zone code retained but unused)
- [x] ESC options menu + persisted client settings + rebindable hotkeys
- [x] Screen rotation (hold Q/E; **Z resets to 0°**; reset button in Options). Movement is screen-relative (`inputToWorld`); world-anchored overlays (HP/MP bars, loot bags+beam/bounce, portal labels, float texts) stay upright via `drawUpright`.
- [x] Inventory is SLOT-STABLE: fixed-cap array with null holes; equip/unequip/swap/salvage/fusion/vault deposit-withdraw/pickup never auto-shift other items (`firstEmptySlot`/`invItemCount`). Equip returns swapped item to the exact slot. **Organize** button (inventory header) compacts+sorts by rarity desc → slot → name → roll% desc.
- [x] HP/MP bars under the player character
- [x] Chat/debug commands + in-game error log
- [x] Water slows player
- [x] Dungeon portals require E
- [x] Dungeons: goblin_warren, fungal_cavern, void_rift
- [x] World map: large (200×200), low wall density, grass-heavy neutral terrain between biomes
- [x] World biomes (6): dark_matter, snow, hell, toxic, ruined, astral — SEPARATED clusters (grass gaps), palette, minimap tint, biome name label
- [x] Biome mobs spawned throughout each biome at world-gen; respawn 1–30s inside same biome (random of its 3); never next to player
- [x] Perf: offscreen render culling + far-mob AI sleep — FIXED world-px distances from Options render/AI-wake settings (not window size); bosses exempt; mobs never removed from arrays; minimap still shows all mobs; `mobStats()` debug
- [x] Minimap mouse-wheel zoom (hover, clamped 1–6x, in-memory)
- [x] Biome terrain: ice (slippery), lava (DoT+slow)
- [x] Biome mobs (3/biome) spawn in-biome (spread at world-gen, ~9/biome) + leash back if they wander out
- [x] Enemy aggro/leash: per-mob aggro/de-aggro ranges (AI-type defaults, larger for bosses), idle/return-home until aggroed, de-aggro when player too far or biome mob pulled out of biome/home; player hits force-aggro; bosses always active
- [x] Rotation polish: Q=CCW/E=CW, player body rotates with world (facing pip), enemy HP bars/boss names upright-but-attached via drawUpright, rotated tile corners filled (no black wedges)
- [x] Biome drops: shared biome dungeon-portal drop per biome + one unique mob-only item per monster (`u_*` bases, `unique:true`, mob-only)
- [x] Biome dungeons (dark_matter_core, frozen_catacombs, infernal_pit, plague_grotto, fallen_keep, astral_tomb): REAL/enterable — themed palette, biome's 3 mobs + dedicated boss (reuses existing boss AIs), 4 dungeon-exclusive drops each (3 armor/accessory + 1 class-locked weapon). Mob-drop-ONLY entry (25% biome mob portal drop); NOT in fixed world scatter. World scatter = OG dungeons only.
- [x] Class-targeted loot: weapons hard class-locked; armor/accessory drops biased toward class stats via `CLASS_AFFINITY`/`baseAffinityWeight`; gamble + exclusive rolls class-filtered.
- [x] Item drag/drop: drag a grid item to another cell (move/swap, slot-stable), to an equipment slot (equip), or outside the window to DROP it on the ground as a private loot bag. Plain click still equips.
- [x] Loot chest single-item pickup: click an item row in the chest preview to take just that item (inventory room permitting); pick-all ([E]) still works; chest removes only the picked item; empty chests vanish.
- [x] Boss loot contribution gate: per-player `bossDamage` map; loot only for a player who dealt ≥2% of boss max HP (solo passes), else "No loot" feedback. Boss flow unaffected.
- [x] World bosses (6): Event Horizon Devourer/Frost Titan Ymir/Ashen Worldeater/Plague Matriarch/The Hollow King/Astral Pharaoh (`wb_*` mob defs, reuse existing boss AIs, distinct color/HP/cadence). Spawn every 6 normal world kills (cap 1 active) at a valid spot away from home/player. Each paints a runtime BOSS_BIOME patch (ids 7-12) around itself, drops a private signature MYTHIC (`m_*`, 5 affixes) gated by 2% damage, and on death drops a portal to its own real dungeon. Bigger pulsing minimap marker (`e.worldBoss`). `/worldboss`,`/spawnboss <key>` debug commands.
- [x] World-boss dungeons (6, real/enterable, `biome:true` so off world scatter): event_horizon_vault/titan_glacier/worldeater_forge/plague_hive/cursed_throne/starfall_pyramid — themed palette, 3 reused biome mobs + a dungeon boss, 3 exclusive drops each (items.js DUNGEON_EXCLUSIVES). Entered only via the world-boss death portal.
- [x] Boss death return portal: `onBossKill` sets the boss tile to `T_PORTAL_DUNGEON` (return to world), spawned before the loot gate so it appears even with no loot; loot pickup keeps interaction priority (portal entry only when not on a loot bag).
- [x] Tile render radius option (`Settings.tileRenderRadius`, blocks/tiles, default 60, clamped 20–120): `renderTileMap` caps span + circular-culls distant tiles (visual only; collision + minimap unaffected).
- [x] Player body rotates with world rotation: a bright world-anchored facing wedge on the body makes rotation visible for all class shapes; HP/MP bars stay upright via `drawUpright`; aim dot/shooting still use mouse aim.
- [x] Loot ownership: bags carry `ownerId`/`visibility`/`source`. Boss bags PRIVATE to earner; mob/common bags PUBLIC (first to pick). Access checks (`lootBagAccessible`) default old/partial bags to safe-accessible. Data-only, no networking.

---

## Important item system rules

- Item identity is fixed.
- Items have predefined stat identities.
- No random replacement of stat types.
- Only stat values/rollPercent change.
- Rarity is a tier, not only drop chance.
- Rarity determines stat ranges and affix count.
- Current affix count rule:
  - common: 1 affix
  - rare: 2 affixes
  - epic: 3 affixes
  - legendary: 4 affixes
  - mythic: 5 affixes
  - void: exactly 5 multiplier (%) affixes (fixed ordered VOID_AFFIXES keys → identity/count stable; reforge only re-rolls values)
- Each item rolls one `rollPercent` from 1–100.
- That one roll percent applies to all stats on the item.
- Do not average per-stat rolls.
- Reforge changes only rollPercent/stat values.
- bspd (projectile speed) is a FIXED weapon property (midpoint, ignores rollPercent); reforge never changes it; not an affix.
- Reforge must not change baseKey, rarity, slot, class lock, or stat identities.
- Fusion consumes 3 identical items: same base item + same rarity.
- Fusion output keeps main item identity and rolls between highest input rollPercent and 100.
- Salvage destroys one item and gives dust by rarity.
- Gamble costs Glory, chooses slot, and respects class filters.
- Void items can have multiplier stats like HP%, damage%, move speed%.

---

## Account vs character persistence rules

Account-side persistent data:
- glory
- materials
- dust
- stash/vault items
- dungeon completions
- unlocked classes placeholders
- titles/cosmetics placeholders

Character-bound data:
- equipped gear
- inventory
- level
- XP
- current stats

Death rule:
- Dead character is removed.
- Dead character inventory/equipped gear are lost.
- Account glory/materials/dust/stash survive.
- No protected carried items.

---

## Prompt size rules

Bad prompt pattern:
- “Read the whole project and fix everything below...”
- Asking for 10 systems at once.
- Asking for long verification reports.
- Asking Claude to manually test gameplay every time.

Good prompt pattern:
- One task.
- One to three files named.
- No preview unless needed.
- Short response.

Example:

```text
Surgical edit only. Read only js/items.js.
Task: enforce rarity affix counts: common=1, rare=2, epic=3, legendary=4, mythic=5, void=random 6-10.
Do not change other item rules.
Run syntax check only.
Final response: Changed files / Syntax check / Known issues.
```

---

## Auto-update instruction for Claude

When a patch changes architecture, file responsibilities, implemented systems, or important rules, update this file in the same patch.

Do not rewrite the whole file. Only edit the relevant section:
- File map
- Implemented systems checklist
- Item system rules
- Persistence rules
- Known current tasks

Keep updates short.

---

## Known current tasks / backlog

Move completed items out of this list after patches.

- Stabilize item overhaul/stations after big rewrite.
- Vault is now a Nexus VAULT station (E to open stash). Old `vault.js` zone + `buildVault` are unused but intact; remove later if desired.
- Ensure rarity affix counts exactly match current rule.
- Tune mob drop rates and XP if too fast/slow.
- Improve dungeon generator minimum room/mob reliability if degenerate seeds still happen.
- Add more dungeons later: Space, Pirate, Hell, Heaven.
- Add safe-zone-only or pause behavior for inventory/station panels if desired.
- Add scroll for vault stash beyond first 30 slots if needed.
