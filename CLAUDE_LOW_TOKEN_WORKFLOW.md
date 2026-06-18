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
- `js/wiki.js` loads after `stations.js`, before `chat.js` (needs items/mobs/map globals).

### `js/sprites.js`
- Sprite-sheet indexing FOUNDATION (opt-in; does not replace geometric art). Loaded right after `engine.js` in `index.html`.
- `SPRITE_SHEETS` (MULTI-SHEET, each `{path,tile}`): `weapons` (assets/sprites/weapons_black_outline.png), `armor` (assets/sprites/armor.png), `main` (assets/sprites/sheet.png, fallback/general). All 16px tiles. PLUS 10 MOB ATLASES `mobs_{neutral,forest,goblin,fungal,void,frost,infernal,plague,astral,cursed}` (each `{path,cols:8,rows:8}`, 1254x1254 non-power-of-two → tiles addressed by grid fraction of natural size, NOT a fixed `tile` px). Each is 8x8=64 tiles=32 mob PAIRS; per mob: frame A (idle/move) at even col, frame B (active/attack) at col+1.
- 2-FRAME MOB SHEETS: `mobSheetAssignments` (mob `e.key`→`{sheet,pair}` 0..31) maps 30 regular/dungeon mobs by biome/theme (dark-matter rides void sheet; goblin_scout→goblin; slime→neutral). `Sprites.drawMobSheet(e,cx,cy,size)`: shows frame B when the mob just fired (read-only `shootTimer>=atkSpd-0.18`) else alternates A/B on a ~2.8Hz timer (idle still animates). `_drawSheetTile(sheet,col,row,...)` derives tile px from the loaded image. `drawForMob` order: bosses → `mobSpriteAssignments` (empty) → `drawMobSheet` → geometric fallback. Wiki Mobs tab `drawIcon` also calls `drawMobSheet({key})` after the boss/registry check (bosses still win; never weapon/item art). No stats/loot/save changes.
- PORTAL SHEETS (SEPARATE system from mob/item): 10 atlases `portal_{void_arcane,blue_green,ice,void_dark,forest,infernal,plague,astral,fungal,cursed}` in SPRITE_SHEETS (cleaned/bg-removed, still 1254x1254, `cols:8,rows:8`; sheet 06 file renamed `..._inferna.png`→`..._infernal.png` to match the registry). EXPLICIT VARIANT SYSTEM: each portal = `PORTAL_FRAMES`(3) adjacent tiles L→R (A idle/B swirl/C peak); variants packed `PORTAL_VARIANTS_PER_ROW`(2) per row (cols 0-2,3-5; 6,7 spare) by `portalVariantRect(v)`→`{col,row,frames}`; `PORTAL_VARIANT_TABLE` (sheet→[{variant,col,row,frames}], 16/sheet) is the enumerable labeled list. ASSIGNMENT TABLES (only place a visual is chosen, never auto-picked): `portalVariantAssignments` (theme→`{sheet,variant}`), `dungeonPortalAssignments` (DUNGEONS key→theme string OR explicit `{sheet,variant}` override — edit ONE line), `biomePortalAssignments` (biome→theme, reference only, not wired). `dungeonPortalTheme`=alias of `dungeonPortalAssignments`; `PORTAL_THEME_SHEET` derived back-compat. `Sprites.portalSpec(themeOrSpec)` resolves theme/obj→`{sheet,variant}` (unknown→`magic`); `Sprites.drawPortal(themeOrSpec,cx,cy,size[,ctx])` loops 3 frames (~6.25fps) at the variant's col/row via `_drawSheetTile`; unloaded→false (rect fallback kept). Wired in `renderTileMap` (engine.js) for ALL portal tiles: spec = `tileMap.portalThemeAt(tx,ty)` else `PORTAL_TILE_THEME[t]`. world.js `map.portalThemeAt` resolves dungeonPortals/pendingPortals via `dungeonPortalSpec(key)` (returns theme/obj). `portal_debug.html` (standalone, loads sprites.js) inspects every sheet+variant: boxed/labeled variants on the sheet, animated thumbnails, click→sheet/variant/start col,row + copy-ready `{sheet,variant}` snippet. No portal art on non-portal entities. PORTAL ENTITY TREATMENT: `Sprites.drawPortalEntity(themeOrSpec,cx,cy,size,ctx,seed)` renders a portal as a living world object — ground shadow + soft radial aura (tint from `PORTAL_SHEET_GLOW[sheet]`) + time-based bob + subtle pulse/scale shimmer + the cropped, edge-glowing 3-frame art; `seed` (tile coords) gives a stable per-portal phase (no per-portal state object). All knobs live in `PORTAL_VIS` (bobAmp/bobSpeed/pulse/glow/shadow/fps/cropInset; window-exposed for tuning). `_drawSheetTile` gained an optional `inset` arg = fraction cropped off each source-tile edge to drop baked-in square padding. Bare `Sprites.drawPortal` (3-frame loop, used by portal_debug.html) is UNCHANGED. Zones call drawPortalEntity INSIDE `drawUpright(anchor,…)` (cx,cy=0,0) so glow/shadow/art stay screen-coherent under rotation like loot bags: engine.js `renderTileMap` (all portal tiles; tiles also paint a grass/floor base instead of a bright portal-colored square) + dungeon.js exit portal (theme 'magic', EXIT label moved BELOW). world.js dropped-portal flat glow circle removed (tile treatment covers it).
- STANDALONE-FILE sprites: registry entries may use `src` (a full image path) instead of `sheet`+coords → loader blits the WHOLE image (aspect-fit). An entry may also carry `fw/fh/frames/cols/fps` for a minimal time-based animation loop from a strip/grid in that file. Loader split into `sheet(name)` (tile sheets, `_imgs`) + `image(path)` (files, `_files`) sharing `_load`; `_rec(e)` picks the right backing image; `rect/ready/draw/drawAt` handle both kinds. `draw` now aspect-fits into the `size` box (square tiles unchanged).
- CREATURE ART: 20 standalone PNGs ("20 Free Fantasy Flying Creatures", ugly UUID filenames) registered as `flying_boss_01..20` (deterministic IDs, original paths preserved, category 'boss'); these are LARGE 1024x1024 AI renders (often padded → render smallish in the mob box). `Crystal Knight.png` (384x768) registered as `crystal_knight` — animated, top-row idle frames only (96x96 ×4 @6fps). NEW: "Monster Creature sprites (pack 1 by batareya)" = 20 crisp 64x96 single-sprite PNGs registered `monster_boss_01..20` (category 'boss', paths verbatim) — render large/sharp, used for DUNGEON bosses.
- BOSS SHEETS (2-frame boss atlases, SEPARATE from the legacy standalone boss art): 3 sheets `bosses_core`/`bosses_void`/`bosses_world` in SPRITE_SHEETS (each `assets/sprites/bosses_sheet_0{1,2,3}_*.png`, 1536x1024). REAL LAYOUT (verified from art, was wrongly assumed 6x4): `cols:9,rows:6` = a 3x2 arrangement of SIX boss BLOCKS, each block its own 3x3 frame grid (170.67px cells). `bossSheetAssignments` (boss `e.key`→`{sheet,pair}` where `pair` 0..5 picks a BLOCK: 0=top-left…5=bottom-right; all 15 bosses, EXPLICIT/data-driven): sheet01 core=goblin/fungal/frost/infernal dungeon bosses, sheet02=void/singularity/plague/cursed/astral, sheet03=all `wb_*` world bosses. `Sprites.drawBossSheet(e,cx,cy,size[,ctx])` = 2-frame draw of the block's top-row frames A/B (`blockW=cols/3,blockH=rows/2; baseCol=(pair%3)*blockW, baseRow=floor(pair/3)*blockH`; B on fresh shot else ~2.5Hz idle flip) — exactly ONE cell at a time, dest centered, only source moves (no sliding/duplication). Wiki boss icons route through the same helper. `drawForMob` order now: **drawBossSheet → legacy `bossSpriteAssignments` (standalone files, graceful fallback if a boss sheet is missing) → `mobSpriteAssignments` → `drawMobSheet` → geometry**. Wiki `drawIcon` (mob/boss) tries `drawBossSheet` FIRST. To remap a boss, edit ONE `{sheet,pair}` line. Boss/enemy sprite ART now drawn via `drawUpright` in `renderMob` (mobs.js) so it stays upright/facing the screen under rotation (shadow/HP already were); covers world + dungeon (shared renderMob). No gameplay/loot/spawn changes.
- `bossSpriteAssignments` (boss mob `e.key`→sprite ID): 15 bosses. DUNGEON bosses (3 OG + 6 biome: goblin_warchief/mycelian_king/void_harbinger/singularity_tyrant/frost_monarch/infernal_lord/plague_mother/fallen_monarch/astral_pharaoh) → `monster_boss_01..09` (crisp). WORLD bosses (`wb_*`) → flying creatures / `crystal_knight` (Frost Titan) per spec. All keys verified against MOB_DEFS; all assigned IDs resolve to real files. `drawForMob` (needs `e.key`, set by `spawnMob`) checks bosses FIRST (scale 2.8), then `mobSpriteAssignments`; unmapped enemies keep geometric fallback. Console-safe `bossSpriteMap()` (window) lists boss→sprite→file→ready for auditing. Wiki `drawIcon` (mob/boss) also checks `bossSpriteAssignments` first, never weapon/item sprites. `SPRITE_REGISTRY` (per-ID `{sheet,col/row or x/y,w/h,category}`; category hint mob/boss/item/weapon/armor/projectile/unknown). Assignment maps `mobSpriteAssignments` (mob `e.key`→id), `itemSpriteAssignments`, `projectileSpriteAssignments`. `mobSpriteAssignments` is now EMPTY on purpose — the only shipped sheet (`sheet.png`) is a WEAPON/ITEM sheet with no mob art, so the old mob→`main` wiring rendered neutral mobs as swords. Leave mobs on geometric fallback until real mob art exists; never point mob keys at the weapon/armor/item sheets.
- All 15 MOB_DEFS bosses (3 OG/dungeon + 6 biome-dungeon + 6 world `wb_*`) are mapped in `bossSpriteAssignments`; every assigned ID resolves to a real PNG (`flying_boss_01..20` + `crystal_knight`). `draw`/`drawAt` wrap `drawImage` in try/catch → a broken/partly-decoded image returns false (geometric fallback) instead of crashing the render loop.
- `Sprites` global: lazy `sheet()` image load (missing file = silent no-op), `rect(id)`, `ready(id)`, `draw(id,cx,cy,size[,ctx])` centered (returns false→fallback), `drawAt(id,dx,dy,dw,dh[,ctx])`, `drawForMob(e,sx,sy)`, `drawForItem(it,cx,cy,size)` (looks up `itemSpriteAssignments[it.baseKey]`). `renderMob` (mobs.js) calls `drawForMob`; inventory grid cells + equipment slots + drag ghost (inventory.js) and loot frame rows (items.js `_lootFrameDraw`) call `drawForItem` — all draw the geometric letter/dot only when it returns false. Tooltip has no icon area so it's untouched.
- Registry now has the full weapons set (8 icons) + full armor/accessory set (helms/chests/pants/boots/gloves rows + gem/ring row at row7, accessories tagged category 'item'). Wired item sprites: 5 class starter weapons + generic armor (iron_helm/iron_plate/iron_greaves/swift_boots/leather_gloves) + accessories (band_of_might/band_of_focus→rings, vital_amulet→gem, arcane_focus→blue crystal). All 3 sheets 8x8 @16px, present in assets. Tile coords are best-guess by color/row — verify in sprites_debug.html. Tooltip has no icon area so it stays text-only.
- No images ship yet, so everything currently falls back to geometry. Drop PNGs at the paths above to activate. `sprites_debug.html` (standalone, loads `js/sprites.js`) = sheet SLICER: dropdown picks a sheet, renders it on a 16px grid, hover/click a tile for its sheet-prefixed ID (`weapons_3_2`/`armor_0_1`/`main_1_4`) + col/row/xy + copy-ready registry snippet.
- GEAR ICON + PROJECTILE SHEETS (4 new 1254x1254 sheets in `SPRITE_SHEETS` as clean `cols:8,rows:8` grids = 156.75px cells, addressed by grid FRACTION via `_drawSheetTile`; the "32" in the projectile filenames = intended display size, NOT source cell px): `gear_armor_icons`, `gear_accessory_ability_relic_icons`, `projectiles_weapons` (`projectiles_weapons_32.png`), `projectiles_bosses` (`projectiles_bosses_32.png`). ASSIGNMENT TABLES (only place a visual is chosen; data-driven/remappable one line each):
  - Item icons: `itemSlotIconAssignments` (item SLOT → `{sheet,col,row}`, the default for every item of that slot — armor slots → gear_armor_icons; ring/amulet/ability/relic/accessory → gear_accessory_ability_relic_icons) + `itemIconAssignments` (per-baseKey OVERRIDE, empty by default; supports `{sheet,col,row}` or `{sheet,index}`). Weapons are intentionally NOT slot-mapped so they keep existing weapon art (`itemSpriteAssignments`). `Sprites.drawItemIcon(itemOrDefKey,cx,cy,size[,ctx])` resolves override→slot→legacy-registry→false; `Sprites.drawForItem` now just delegates to it, so inventory grid/equipment slots/loot frames/wiki gear rows show the new icons with the SAME geometric fallback when unmapped/unloaded. Cell coords are FIRST-PASS guesses — retune col/row.
  - Projectiles (VISUAL-ONLY — never change bullet speed/damage/hitbox/pierce/lifetime/collision): `projectileWeaponAssignments` (player CLASS → cell) + `projectileBossAssignments` (boss/mob `e.key` → cell), each `{sheet,col,row}|{sheet,index}` with optional `{frames,fps}` same-row anim + `{angleOffset}`. Bullets carry a visual `kind` tag via two engine.js globals (`_pBulletKind`=`char.classKey`, set before player shoot in world.js/dungeon.js; `_eBulletKind`=`e.key`, set before each mob's AI in mobs.js); `spawnBullet` stamps `b.kind` from the firing pool (signature unchanged). `engine.js renderBullets` calls `Sprites.drawWeaponProjectile`/`drawBossProjectile` (centered on the bullet, ROTATED to travel dir via `_drawRotatedTile`; drawn INSIDE the world transform so sprite-rotation + screen-rotation compose — NO double-rotation), falling back to the original glowing circle when unmapped/unloaded. Global facing tweak `PROJECTILE_ART_ANGLE` (set `Math.PI/2` if art points UP). Exactly ONE cell sampled per shot/icon (no multi-cell block sampling, no sliding).
- ENVIRONMENT TILES — **ACTIVE renderer = individual 32x32 PNGs** (`SIMPLE_ENV_TILES_ENABLED = true`). The old large env_* ATLAS system stays DISABLED (`ENV_SPRITES_ENABLED = false`) because the packed sheets never tiled the grid cleanly. The active system uses one exact 32x32 file per terrain visual (`assets/sprites/tile_*.png`), drawn directly into one map tile (NO slicing/grid math). Tables in `js/sprites.js`: `SIMPLE_TILE_IMAGES` (key→path; note `tile_plague_Poison_2.png` has a capital P on disk), `SIMPLE_TILE_THEMES` (theme→role→[keys], roles floor/floorAlt/path/wall/wallAlt/hazard/water/specialFloor; aliased `BIOME_TILE_MAP`/`DUNGEON_TILE_MAP`), `SIMPLE_ROLE_FALLBACK` (unmapped floorAlt/path/special→floor, wallAlt→wall, water→hazard). Themes resolve via the existing `biomeEnvThemeMap`/`dungeonEnvThemeMap` (`Sprites.simpleThemeForBiome/forDungeon`). `Sprites.drawSimpleTile(theme,role,x,y,size,ctx,seed)` stretches the whole PNG to fill the tile; deterministic per-tile variant (no flicker); returns false→flat colored tile fallback. Wired in `engine.js renderTileMap` (world, per-tile biome theme) + `dungeon.js renderDungeonTiles` (dungeon theme from key) AFTER the dormant atlas block, gated on `!tileMap.disableEnvSprites` so Nexus/vault stay gray. NO object/decor pass, NO collision/generation/hazard changes. Mappings: neutral floor=neutral_1..5/path=6..8; forest floor=forest_1,2/alt=3/path=neutral_6; goblin floor=1,2,3/path=4/special=5,6,7; frost floor=frost_1,2/ice special=ice_1..3/wall=ice_stone_1..3; fungal floor=1,2/special=3; cursed floor=1,2/path&special=3/wall=4; infernal floor=1,2,4/special=3,5,6/hazard=lava_1; plague floor=1..5/hazard&water=poison_1,2,4; void floor=1,2/special=3,4/hazard=5. (neutral/forest/goblin walls = colored fallback.)
- ENVIRONMENT SHEETS (OLD ATLAS) — **CURRENTLY DISABLED.** Global master switch `ENV_SPRITES_ENABLED = false` (top of sprites.js, exposed on `window`). The ACTIVE map renderer is the BASIC COLORED TILES (world basic biome tiles / dungeon basic dungeon tiles / Nexus default gray) — no env terrain overlays, no env object/decor. `drawEnvTile`/`drawEnvObject` short-circuit to false on the flag, and `engine.js renderTileMap` + `dungeon.js renderDungeonTiles` gate their whole env block on it, so no env underpaint/+1px-oversize/decor touches the basic tiles and the old lava-pulse/ice-shine/wall-stripe overlays render normally. The full system below (sheets, role tables, helpers, `env_debug.html`) is PRESERVED for future tuning — flip `ENV_SPRITES_ENABLED` back to `true` to re-enable. Nexus/vault also keep `disableEnvSprites=true` (harmless/redundant while the global flag is off). The rest of this entry describes the (dormant) system:
- ENVIRONMENT SHEETS (9 1254x1254 sheets in `SPRITE_SHEETS`, `cols:8,rows:8` = 156.75px cells, addressed by grid FRACTION via `_drawSheetTile`; ONE cell per tile, never a block): `env_neutral/forest/goblin/fungal/void/frost/infernal/cursed/plague`. VISUAL-ONLY — generation/collision/hazards/portals/mobs/loot/stations untouched; the flat-color tile fill remains the fallback. **The system now SEPARATES TERRAIN ROLES from OBJECT/DECOR ROLES — object cells are NEVER used as terrain.** Each sheet has its OWN layout (NOT a shared template — verified from the art). DATA-DRIVEN PER-THEME tables (all in sprites.js, remap one `{col,row}` line):
  - `ENV_SHEET_BY_THEME` (theme→sheet).
  - `ENV_TERRAIN_ROLES` (theme → { floor/floorAlt/path/wall/wallAlt/hazard/water/specialFloor → candidate cells }) — ONLY real ground/stone/liquid tiles; special/symbol/lava/vortex cells stay OUT of plain floor (hazard/specialFloor only, used just for actual hazard/special map tiles).
  - `ENV_OBJECT_ROLES` (theme → { tree/rock/crystal/mushroom/ruin/fence/campProp/bone/altar/pillar/plant/smallDecor/... → cells }) — props drawn ON TOP of a terrain tile.
  - `ENV_OBJECT_DENSITY` (theme → `{small,large}` chance; large ~disabled/0 first pass) + `ENV_OBJECT_RULES` (theme → which object roles feed the small/large sparse passes).
  - `envHazardAssignments` (tile-name→role), `biomeEnvThemeMap`, `dungeonEnvThemeMap`.
  Helpers: `Sprites.drawEnvTile(theme,role,cx,cy,size,ctx,seed[,opts.inset])` (TERRAIN only; ONE deterministic variant from `seed`, returns false→flat fill), `drawEnvObject(theme,tx,ty,cx,cy,size,ctx)` (at most ONE sparse prop, deterministic via `envHash`, drawn AFTER terrain, ONLY on walkable floor — never collision), `envThemeForBiome/forDungeon/envDecorChance`, `envHash(x,y,salt)`. DRAW FLOW (`engine.js renderTileMap` world biome per-tile theme; `dungeon.js renderDungeonTiles` theme from `defKey`): A. flat base color → B. ONE terrain tile (oversized +1px to reduce black gaps) → C. ONE sparse object on floor/grass only. **NEXUS/VAULT skip the env layer entirely via `tileMap.disableEnvSprites=true` (set in map.js buildNexus/buildVault) — they stay default gray.** Old lava-pulse/ice-shine/wall-stripe overlays draw only when env didn't (`!drewEnv`). Cells are FIRST-PASS — tune in **`env_debug.html`** (the correct env tuning page: exact naturalW/H + cols/rows + cellW/H, aligned overlay grid sharing the image scale, cols/rows + inset/object-safe-crop controls, click→copy-ready `{col,row}` + terrain/object lines, separate terrain vs object role previews). Cull/camera/rotation/portal passes unchanged.

Use for:
- assigning real sprites to mobs/bosses/items/projectiles
- sprite registry / sheet coords / draw helpers
- the dev contact sheet

### `js/biomes.js`
- Data-driven world biome defs (`BIOMES`, `BIOME_BY_ID`): palette, mob pool, hazard tile, minimap tint, related dungeon-drop key.
- `BOSS_BIOMES` (ids 7-12: Event Horizon/Glacial Throne/Ash Caldera/Rot Garden/Cursed Court/Starfall Dunes): floor/floorAlt/accent/mini/name. Deliberately NOT in `BIOMES` (so assignBiomes never world-scatters them) but folded into `BIOME_BY_ID` so in-world floor tint + minimap tint + biome-name label resolve them. Painted at runtime by world.js around a world boss.
- `BIOMES` now has 13 world biomes: the original 6 (ids 1-6) + 7 added low/mid biomes (ids 13-19: meadow/fen 1★, frostfields/sunken 2★, scorched/starlit/nullfringe 3★) that REUSE existing mob pools + biome dungeons (no new mobs/dungeons) to fill the southern half. ids 7-12 stay reserved for runtime BOSS_BIOMES.
- `BIOME_HARDNESS` (biome id → 0..1): hardest biomes (dark_matter .92/hell .82/astral .86) bias NORTH; snow/toxic/ruined (~.4-.5) mid; new biomes .10-.48 bias SOUTH by star tier. `assignBiomes` maps hardness→latitude as `targetYFrac = 0.16 + (1-hard)*0.62` (hard=far north, easy=deep south near home), `minSep` 0.15·minDim, blob r 0.055-0.105·minDim. New biomes auto-spawn (populateWorld iterates `biomeClusters`, mobs via `BIOME_BY_ID[id].mobs`); southward latitude scaling makes them read easier.
- `assignBiomes(map, rng)`: paints SEPARATED biome clusters (one spaced blob per biome, neutral grass id 0 in the gaps) onto the world map (`map.biome` Uint8Array, `map.biomeAt`, `map.biomeClusters = [{id,x,y,r}]` in tiles), scatters ice/lava hazard tiles, keeps spawn/home neutral. Home center is the SOUTH band (`cy = H*WORLD_HOME_Y_FRAC`, matches map.js spawn). Each cluster's Y is biased by `BIOME_HARDNESS` (hard=north) with jitter; `minSep` 0.2·minDim. Defensive fallback placement never crashes.

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
- Floating text (`spawnFloatText`/`updateFloatTexts`): vx/vy are SCREEN-relative drift (default screen-up `vy:-40`); `updateFloatTexts` converts them to world velocity via `inputToWorld` each frame so numbers rise UP ON SCREEN at any rotation (was applying vy in world space → drifted off-angle when rotated). `renderFloatTexts` (called inside the world transform) still counter-rotates glyphs upright.

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
- Starter gear: `createCharacter` calls `giveStarterGear(char)` (before `recalcStats`) → equips a common class weapon (`STARTER_WEAPONS`) + 2 common bag items (swift_boots/iron_helm). Creation-only, common rarity, low fixed rollPercent; permadeath/save unaffected (gear dies with the char). Safe no-op if `rollItem` not loaded.
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
- CLASS GEAR SETS (100 items, `_buildClassGear()` → `Object.assign(ITEM_BASES,…)`): 5 classes × 4 tiers × (1 weapon + 4 armor/accessory), keys `${cls}_t${tier}_${slot}`, all class-LOCKED (`classes:[cls]`), non-unique → flow through normal class-filtered random/gamble/boss rolls. `CLASS_GEAR_THEME` holds per-class main/sub stat + weapon profile + set names + 5-key affix pool (identity-safe: no INT on warrior gear, etc.). `tier` (1 early→4 chase) raises base ranges on top of rarity scale; `set`+`wikiSource` are wiki metadata. Tier gate: `randomItem` honours `opts.maxTier/minTier` (missing tier=1, never empties pool). `rollMobDrop` maps stars→maxTier (mobs cap tier 3); `generateBossLoot` rolls minTier 2 + a 40% tier-3/4 chase; `gambleItem` excludes tier 4 (boss-only). Wiki gear tab shows `wikiSource` when present.
- `WORLD_BOSS_MYTHICS` (`m_*`): one mythic per world boss, `unique:true` + NO `dungeon` tag (kept out of random/gamble AND EXCLUSIVES_BY_DUNGEON) — rolled directly via `rollItem(base,'mythic')` by world.js `onWorldBossKill`. 5 affixes each. `DUNGEON_EXCLUSIVES` also now carries 3 exclusives for each of the 6 world-boss dungeons.
- `renderLootHUD(char,acct)` (top-right) now draws ONLY the temporary fading `LootLog` pickup notifications. The old persistent stacked inventory list under them was removed (the full inventory lives in the inventory panel).
- Bag capacity: `MAX_BAG_ITEMS` (12) gates the inventory drop-into-bag merge (not boss/mob fills, which may exceed it). `renderLootPreview` header shows `LOOT  n/12` or `Bag full`.
- Loot ownership: `createLootBag(x,y,loot,life,meta)` where `meta={ownerId,visibility,source}`. Bags carry `ownerId`/`visibility`('public'|'private')/`source`('mob'|'boss'|'drop'). `lootBagAccessible(bag,char)`: non-private→open; private+no owner→open (old shapes safe); private+owner→only matching `char.id`. `bagIsEmpty(bag)`. `pickLootItem(char,acct,bag,index)` (single item) gates on access; no dup/delete. `pickupLootBag` (pick-all) still defined but UNUSED (no hotkey pickup anymore).
- Loot is CLICK-ONLY (no hotkey/[E]/Ctrl pickup). `renderLootPreviews(bags,offX,offY)` draws up to `LOOT_PREVIEW_MAX` (3) nearest accessible bag frames, anchored above each bag (rotation-correct via `worldToScreen`) and nudged so frames never overlap; only the hovered row's tooltip shows (tooltips never stack). Combined hit-map `_lootPreviewHit={frames:[{bag,rows}]}`; `handleLootPreviewClick` (capture mousedown, disabled while inventory/options/stations/chat open) picks one item from the correct bag and clears `mouse.down` so it never fires a shot. `renderLootPreview(bag)` is a thin back-compat wrapper. Zones (world.js/dungeon.js) build `nearBags` (accessible bags within 90px, nearest-first) each update and call `renderLootPreviews`; portal/exit [interact] no longer guards on a near bag.

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

- Drag/drop: grid items are drag-aware. `onMouseDown`/`onMouseMove`/`onMouseUp` (window-level mouseup so off-panel drops are caught). Plain click = equip (old feel). Drag to another grid cell = slot-stable `moveItem` (move/swap, never compacts). Drag to an equipment slot = equip. Drag released OUTSIDE the window = `dropToGround` (world/dungeon only): FIRST tries to merge the item into the closest accessible nearby bag (`lootBagAccessible`, within 70px, `< MAX_BAG_ITEMS`) via `zone.getBags()` (same object ref → id/stats preserved); else creates a PRIVATE (owner=char.id, source 'drop') loot bag at the character via `zone.addBag`. Item only leaves its slot after it is safely in a bag (kept on failure; leaves a hole). `window.activeLootZone` (world.js/dungeon.js) now exposes `{ addBag, getBags }`. Drag ghost + "drop" hint rendered at cursor.

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

- World size: `WORLD_W=WORLD_H=400` (~4x old area). `WORLD_HOME_Y_FRAC=0.82` — spawn/home sits in the safer SOUTH band (`buildWorld` spawn = `findFloorNear(W/2, H*0.82)`); difficulty rises north (world.js).
- `buildDungeon`: LARGER, randomly-sized per run. Room count = `def.rooms.min/max + round(stars*1.3) starBonus + typeBonus + rng`, harder (more stars) → bigger. `typeBonus`/cap by kind: world-boss dungeons (keys in `WORLD_BOSSES[*].dungeon`) +6 rooms / cap 240; biome dungeons (`def.biome`) +3 / cap 210; others cap 180. Tile map grows to fit (`MAP_W = clamp(56 + rCount*7, 80, sizeCap)`, square). dungeon.js reads `map.w/map.h` for the grid + tile-render bounds (no hardcoded 80).

Use for:
- dungeon generation issues
- map layout / world size / dungeon size scaling
- portal tile placement
- vault room map if build function is here
- nexus station list (the 6th alcove is now the `wiki` station, label 'WIKI')

### `js/mobs.js`
- Mob definitions.
- Boss definitions.
- Mob/boss AI patterns.
- Dungeon definitions may currently live here.
- Star ratings may be on dungeon defs here.
- `DUNGEONS` includes 3 OG (goblin_warren/fungal_cavern/void_rift) + 6 biome dungeons (dark_matter_core, frozen_catacombs, infernal_pit, plague_grotto, fallen_keep, astral_tomb, each tagged `biome: true`), each with tileColor/mobs/boss/rooms/roomSize/mobsPerRoom. Biome dungeon bosses reuse boss_void/boss_mycelian/boss_goblin AI. Unknown key → `buildDungeon` returns null → DungeonZone.init bails to world. `biome: true` keeps them out of world scatter (map.js) — they enter only via biome mob portal drops. Biome mob `portalDrop.chance` = 0.25 (used raw in world.js, no multiplier).

- Perf: `updateMob`/`renderMob` do offscreen culling + AI sleep using FIXED world-px distances from Options (`Settings.renderDistance`/`aiWakeDistance`, NOT window size). `_mobRenderDist()` (cull radius from camera) + `_mobWakeDist()` (sleep radius from player; forced ≥ render+200 so visible mobs stay awake). Cull/sleep are RADIAL (distance², not viewport rect) so rotation-safe. Mobs past render dist aren't drawn; past wake dist sleep (`e.asleep=true`, skip AI). Bosses never sleep/cull. Mobs are NEVER removed from arrays when culled. Counters in `MobDebug`; `mobStats()` logs. Minimap unaffected (reads `mobs` array directly).
- Aggro/leash (in `updateMob`, applies to world+dungeon): per-mob `aggroRange`/`deAggroRange`/`homeLeash` (optional def overrides) with safe AI-type defaults (`_aggroRange`/`_deAggroRange`/`_homeLeash`; bosses ALWAYS active, never sleep/leash). Mob idles/returns toward `homeX/homeY` until player enters aggro range (no shots while non-aggro or asleep). De-aggros past `deAggroRange` (hysteresis) OR when dragged off `homeLeash` / out of its `biome` tile → walks home. Getting hit by a player bullet sets `e.aggro=true` (world.js/dungeon.js). Dungeon mobs/bosses have no biome/home → idle-in-place then fight; bosses unaffected.
- Enemy HP bar + boss name in `renderMob` use `drawUpright(sx,sy,…)` (like player bars) — pinned above the mob, readable/upright, position tracks world under rotation. The mob/boss SHADOW also uses `drawUpright` so it stays a flat ellipse pinned under the mob on screen at any rotation (was tilting with the world).

- `WORLD_BOSSES` (+ `WORLD_BOSS_KEYS`, `window.WORLD_BOSSES`): 6 `wb_*` boss mob defs (reuse boss_void/boss_mycelian/boss_goblin AIs) mapped to boss biome id / mythic base / dungeon key. 6 world-boss `DUNGEONS` entries (`biome:true`) reuse biome mobs + existing dungeon bosses. Spawn/biome/loot logic lives in world.js.
- World-boss leash (`updateMob`): world bosses never sleep, but if `e.worldBoss` is dragged past `e.leashRadius` from `homeX/homeY` they enter `_returning` mode — walk back toward spawn center, skip attack AI (de-aggro), re-engage once within 40% of leash (hysteresis). No teleport. Dungeon bosses (no `worldBoss`/`leashRadius`) are unaffected. `leashRadius` is set in world.js `spawnWorldBoss` = `(BOSS_BIOME_RADIUS-1)*TILE`.

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
- Spawning: `populateWorld` spreads biome mobs across each `map.biomeClusters` blob at world-gen (`BIOME_SPAWN` 12/biome) + `NEUTRAL_SPAWN` (300, ~5x density) neutral wanderers; `spawnInBiome`/`spawnNeutral`/`findBiomeSpot` find valid tiles inside the right biome, away from player/home (neutrals also kept ≥12 tiles from home). NO spawn-near-player repop.
- Northward difficulty: `worldDifficulty(wy)` → 0 at/south-of home (`HOME_Y_FRAC` 0.82), up to 1 at the far north. `applyDifficulty(mob,diff)` scales hp/dmg/xp at spawn + stamps `mob._diff`; applied in `spawnInBiome`/`spawnNeutral` so respawns scale too. `killMob` uses `_diff` to raise the mob-drop rarity roll (`stars=diff*4`) + drop chance (capped 0.5). Bosses remain best loot; world bosses still spawn randomly every 6 kills.
- Respawn: ALL dead world mobs scheduled in `respawnQueue` (random 1–30s via `worldTime`) for 1:1 replacement — biome mobs respawn as a random one of that biome's 3 inside the same biome; neutral mobs (`biome:0`) respawn as wandering neutrals (`spawnInBiome(0)`→`spawnNeutral`); never next to player.
- World-boss tracker: `render` draws `renderBossIndicator(worldBoss)` while a boss is alive — screen-fixed box (top-center, y56) with boss name + a single rotation-correct arrow (via `worldToScreen`) toward the boss, or a dot when on-screen. (The old static left spire/sigil marker was removed — it was a dead, non-rotation-aware indicator.) ALSO `renderBossTracker()` (always): small top-left box (x12,y70, clear of minimap/chat/hints) showing `World Boss: done/EVERY kills (N to go)` when no boss is up, or `World Boss Alive: <name>` while one is. Spawn also fires `Chat.announce('World Boss Awakened: <name> — <biome name hint>')` plus the existing float + `LootLog`.
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
- Salvage/Reforge/Fusion/Gamble/Vault screens.
- Station item selection logic.
- Dust/glory cost display.
- Reforge accepts EQUIPPED gear too (right-column gear grid, token `g:<slot>`); reforges in place via `reforgeItem`+`recalcStats` (identity preserved).
- VAULT (`renderVault`/vault `onClick`): all `STASH_CAP`(60) slots reachable. Filter tabs `VAULT_TABS` (all/weapon/armor/acc/ability/rarity[=HI★ epic+]) set `vaultFilter`; paged (30/page via `L.rcells`) with `<`/`>` + `vaultPage`; `_stashIdx` maps each rendered cell → real stash index so filtered/paged withdraw hits the right item. Deposit = first-empty (slot-stable). `AUTO SORT` button cycles `vaultSortKey` rarity→slot→rating and `sortStash()` compacts a fresh 60-len array (reorders refs only — identity/roll preserved, saves). Stash stays a plain array (`save.js` load-compatible).

Use for:
- salvage/reforge/fusion/gamble/vault UI bugs
- vault filter/sort/paging, equipped-gear reforge
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

### `js/wiki.js`
- In-game WIKI compendium panel (NOT a zone — modal like stations.js). Opened from the Nexus `wiki` station (`Wiki.open()`); `window.Wiki` + `window.LootTable`.
- Data-driven LOOT TABLE REGISTRY built once from existing globals (DUNGEONS/MOB_DEFS/ITEM_BASES/WORLD_BOSSES/EXCLUSIVES_BY_DUNGEON/WORLD_BOSS_MYTHICS/BIOMES) — no hand-kept tables. `registry()` → `{ dungeons, bosses, gear, mobs }`; cached, robust to missing fields.
- 4 tabs (Dungeons/Bosses/Gear/Mobs) now render as a SCROLLABLE CARD GRID (`renderGrid` + per-tab `cardDungeon`/`cardBoss`/`cardGear`/`cardMob`) instead of a vertical list. SORTED for display only (data untouched): dungeons by stars→name; gear by rarity/tier(`rarityRankFor`)→slot→name; bosses by world/source→name; mobs by where→name. Card icons: dungeon = its portal sprite (`drawDungeonIcon`→`dungeonPortalSpec`+`Sprites.drawPortal`, else colored diamond); gear = item icon (`Sprites.drawForItem`, else letter tile); boss/mob = mob/boss sprite (`drawIcon`: `drawBossSheet`/`bossSpriteAssignments`/`drawMobSheet`, NEVER a weapon/item sprite; else colored marker). Boss cards put the NAME above a large sprite.
- BOTTOM-LEFT DETAIL PANEL (`renderDetail`, rect `L.detail`) replaces cursor tooltips: hovering a card (or clicking to PIN via `selKey[tab]`) shows full details there — gear (icon/name/rarity color/slot/class/source/base stat RANGES from `ITEM_BASES.core` via `statRangeLabel`/roll note), dungeon (name/stars/theme/boss/clears/notable), boss (sprite/name/found/HP+DMG from `MOB_DEFS`/drops), mob (sprite/where/HP+DMG+XP/AI/drops). No more giant overlapping `renderItemTooltip` at the cursor inside the wiki. `registry()`/`sampleFor()` data layer UNCHANGED (no gameplay/loot impact).
- Own Esc/mousedown(capture)/mousemove(capture)/wheel(capture)/window-mouseup listeners; click tabs/close/outside; wheel scrolls. Gated into `overlayOpen` (main.js) + nexus `stationOpen` so gameplay input is suppressed while open.
- Every tab has a VISIBLE right-edge scrollbar (`drawScrollbar`/`L.sb`, viewH=`L.gh`): always-drawn track + proportional thumb when content overflows; click/drag the track to scroll (`scrollToY`, `_drag`). Gear tab has a SEARCH box (`L.searchBox`, focus via click) — `sortedGear` filters by name/key/slot/class/cat/source (AND of space-split terms); typing handled in the keydown listener (Esc clears focus before closing), scroll resets on filter change. Card hover/select drives the detail panel (no cursor tooltips), so search/scrollbar don't cause tooltip flicker.

Use for:
- wiki panel UI / tabs / scrolling
- loot-table registry (what drops where) / future wiki export

### `js/chat.js`
- Local debug command console.
- Commands like `/help`, `/godmode`, `/giveitem`, `/givemat`, `/givedust`, `/giveglory`, `/xp`, `/level`, `/enter`.
- Chat log rendering/input suppression.
- `Chat.announce(text,color)`: push a log line WITHOUT opening the input (used by world.js world-boss announcements).
- Copy/paste: while open, `Ctrl/Cmd+V` pastes clipboard text into the input (async `navigator.clipboard.readText`, newlines→spaces, clamped 80); other Ctrl/Cmd combos (C/X/A) pass through to the browser and are never appended as text nor leaked to gameplay.

Use for:
- command bugs
- debug input conflicts

### `js/ui.js`
- General HUD/menu/class select/death screen rendering.
- HUD zone labels and compact HP/MP display.
- Top UI layout.
- `Minimap` (top-right): non-boss mob markers now only draw within `Settings.renderDistance` of the player (not the whole world); bosses/world bosses stay global. BIOME WAYPOINTS: a biome cluster becomes "discovered" once the player nears its center (`map._wpDiscovered`); discovered centers draw a tinted diamond marker; a bubble-phase canvas `mousedown` (after engine's, so it clears `mouse.down` to cancel the shot) teleports the player to a floor tile near that center via `findFloorNear` (avoids walls/water). Only active on maps with `biomeClusters` (world); suppressed while Chat/Stations/Wiki/Options open.
- `GAME_VERSION`/`GAME_PATCH` consts (top of file) — bump each patch; shown bottom-center of the MainMenu (home/character-select) as `v0.4.0 — World Bosses`.

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
- [x] Player body rotates with world rotation: drawn inside the world transform (not counter-rotated); a BRIGHT white world-anchored facing wedge (class-color outline) makes rotation visible for all class shapes incl. symmetric circles; HP/MP bars stay upright via `drawUpright`; aim dot/shooting still use mouse aim.
- [x] World-boss leash: world bosses can't leave their boss-biome patch — past `leashRadius` they de-aggro and walk back to spawn (no teleport, no cross-map chase); still fight normally inside the zone; still never sleep.
- [x] World-boss progress tracker (top-left HUD): `World Boss: done/EVERY kills (N to go)`, or `World Boss Alive: <name>` while one is up; updates as normal world mobs die; existing arrow indicator unchanged.
- [x] HUD inventory count removed (was clutter); count still shown inside the inventory panel.
- [x] World-boss tracking: chat announcement on spawn (`Chat.announce`, name + biome hint) + screen-fixed direction indicator (sigil/name/rotation-correct arrow) while the boss is alive
- [x] Home/character-select shows `v<GAME_VERSION> — <GAME_PATCH>` (ui.js consts) bottom-center
- [x] Chat input copy/paste (Ctrl/Cmd+V paste via clipboard; C/X/A pass through; never leaks to gameplay)
- [x] Neutral mob density raised (`NEUTRAL_SPAWN` 30) + 1:1 respawn for ALL world mobs; neutrals count toward world-boss kill counter
- [x] Inventory drop-into-bag: dropping merges into the closest accessible nearby bag with room (`MAX_BAG_ITEMS` 12) else creates a new bag; id/stats preserved, item kept on failure. Loot preview shows `n/12`/`Bag full`
- [x] Loot ownership: bags carry `ownerId`/`visibility`/`source`. Boss bags PRIVATE to earner; mob/common bags PUBLIC (first to pick). Access checks (`lootBagAccessible`) default old/partial bags to safe-accessible. Data-only, no networking.
- [x] World scaled ~4x (400×400); spawn/home moved to safer SOUTH band (`WORLD_HOME_Y_FRAC` 0.82). Biomes spread further apart; hardest biomes (Dark Matter/Hell/Astral) bias NORTH (`BIOME_HARDNESS`).
- [x] Northward difficulty gradient: mob hp/dmg/xp + loot rarity/chance scale with how far north a mob spawns (`worldDifficulty`/`applyDifficulty`); south stays easy. World bosses still random. Neutral mob density raised + scales too.
- [x] Larger random dungeons: per-run room count + map size scale with stars (harder=bigger); dungeon grid + tile-render read `map.w/h`. Spawn/mobs/boss/exit still valid.
- [x] In-game Wiki station (Nexus `wiki` alcove, label 'WIKI'): data-driven loot-table registry + 4-tab panel (Dungeons/Bosses/Gear/Mobs) with completion counts, drop sources/rates, gear hover tooltip. `window.Wiki`/`window.LootTable`.
- [x] 100 class gear items (20/class, 4 partial sets/class across 4 tiers, all 9 slots): class-locked, identity-safe stats, `tier` progression + `set`/`wikiSource` metadata. Easy mobs→tier1-2, dungeon bosses→tier2-3, hard bosses→tier3-4 chase; gamble excludes chase; world-boss mythics still top. Affix counts/ bspd rules preserved; old saves unaffected (`_buildClassGear` in items.js).
- [x] Mob/boss shadows use `drawUpright` → stay pinned under the enemy on screen at any screen rotation (HP bars unchanged).
- [x] Minimap player arrow shows screen-up / world-facing direction for the current rotation (NOT mouse aim): north/up at 0°, swings with Q/E.
- [x] Boss/world-boss sprites: standalone-file + minimal-animation support in sprites.js; 20 flying-creature PNGs (`flying_boss_01..20`) + animated `crystal_knight`; `bossSpriteAssignments` maps all 15 bosses by theme (Crystal Knight → Frost Titan); unmapped enemies keep geometric fallback; no weapon/item icons on mobs/bosses; Wiki Bosses/Mobs tabs show the sprite/icon.
- [x] Bigger dungeons by kind: world-boss dungeons +6 rooms/cap 240, biome dungeons +3/cap 210, others cap 180 — all still randomized per run + star-trending.
- [x] 13 world biomes (added 2×1★, 2×2★, 3×3★ low/mid, ids 13-19) reusing existing mobs/dungeons; hardness→latitude fills the southern half with easy biomes and keeps hard biomes north.
- [x] Minimap shows non-boss mobs only within `Settings.renderDistance` (bosses global); click discovered biome waypoint markers to teleport near that biome center (avoids walls/water).
- [x] Floating damage/combat text rises up-on-screen at any screen rotation (screen-relative drift via `inputToWorld`), staying upright.
- [x] Character window layout (inventory.js): LEFT equip column now has 5 slots incl. boots (`LEFT_COL` helmet/chest/hands/pants/boots); RIGHT column shows only 3 (`RIGHT_COL` amulet/ring1/ring2) vertically centered against the left span; decorative "CHARACTER"/"EQUIPMENT" header text removed (STATS/close buttons kept); center figure + bottom weapon/ability row preserved. Layout math generalized to column lengths (`leftSpan`/`rightSpan`/`rightTop`/`leftBottom`); click-unequip, hover tooltips, drag/drop, sprite icons all unchanged (slot logic keyed by item slot, not display position).
- [x] Vault upgrade (stations.js): all 60 stash slots reachable via paged grid (30/page, `<`/`>`); filter tabs (All/Weapons/Armor/Acc/Ability/HI★ rarity); AUTO SORT button cycles rarity→slot→rating (compacts a clean 60-len array, identity/roll preserved, user-triggered only). Deposit slot-stable (first-empty); filtered/paged withdraw maps cells→real stash index. Stash stays a plain array → old saves load unchanged, no dup/loss.
- [x] Monster Creature pack registered (`monster_boss_01..20`, crisp 64x96); dungeon bosses (9) remapped to it for sharp visible art; world bosses kept on flying-creature/Crystal-Knight per spec. All boss keys verified vs MOB_DEFS, all sprite IDs resolve to real files; `drawForMob` wired for every boss/world-boss (via `e.key` from `spawnMob`). Console-safe `bossSpriteMap()` audit helper. Wiki Bosses/Mobs tabs already show mapped sprites; all tabs have a visible scrollbar; drop tooltips intact.
- [x] World-boss proximity alert: while within `Settings.renderDistance` of the active world boss, a clean screen-fixed banner (top-center y84) shows ⚠ name + HP bar; announces once via `Chat.announce` on entering range (latch `bossProximate`); existing minimap/tracker/arrow indicators unchanged.
- [x] Rotation text: dungeon EXIT tile label + Nexus station/portal + room labels now use `drawUpright` (upright-but-world-anchored) so they rotate correctly with screen rotation like other world labels; fixed HUD text untouched.
- [x] Reforge accepts EQUIPPED gear in addition to inventory: right panel shows a selectable equipped-gear grid (selection token `g:<slot>`); reforge in place via `reforgeItem` (id/baseKey/rarity/slot/affixes preserved → no dup/delete) + `recalcStats`. Dual-wield weapon arrays skipped (no baseKey).
- [x] Character panel: Amulet (top) and Boots (bottom) swapped in the right equip column (`RIGHT_COL` order); slot behavior keyed on slot key, unchanged.
- [x] Boss sprite sheets (3 new 2-frame atlases `bosses_core`/`bosses_void`/`bosses_world`): all 15 bosses assigned via explicit `bossSheetAssignments` (`{sheet,pair}`, theme-grouped, easy to remap one line); `Sprites.drawBossSheet` 2-frame anim; `drawForMob` prioritizes boss sheets then legacy standalone art then mob sheets then geometry; Wiki boss icons use it. Boss/enemy sprite ART now `drawUpright` in `renderMob` → stays upright/facing under screen rotation (world + dungeon), coherent with shadow/HP/loot/portal. No gameplay/loot/spawn changes; geometric fallback if sheets missing.
- [x] Portal entity render treatment: portals (world/raid/vault/dungeon-drop + dungeon EXIT) draw as living world objects — ground shadow + soft tinted aura + time-based bob + subtle pulse + cropped edge-glowing 3-frame art (`Sprites.drawPortalEntity`, tuned via `PORTAL_VIS`). No bright square backing (portal tiles paint grass/floor base; `cropInset` trims baked-in tile padding). Rotation-correct via `drawUpright` (glow/shadow/art stay screen-coherent). Explicit variant/assignment tables unchanged; bare `drawPortal` (debug page) unchanged.
- [x] Portal reads as a CIRCLE (not a square tile): `drawPortalEntity` now clips the sheet art to a disc (`coreScale`) so square edges vanish, slowly spins the art for a vortex swirl (`spinSpeed`, local rotation independent of screen rotation), draws it tighter-cropped/oversized to fill the disc (`artCropInset`/`artScale`), then layers an additive energy core (`coreBloom`/`coreAlpha`), a glowing rim ring (`rimAlpha`), and optional orbiting sparks (`particles`) over the themed aura/shadow/bob/pulse — all knobs in `PORTAL_VIS`. Fallback (no art) discs in engine.js/dungeon.js are now circles too. Variant/assignment tables + gameplay/destination logic unchanged.
- [x] Loot is CLICK-ONLY: no hotkey/[E] pickup or prompt. Click an item row in a loot frame to take that one item (inventory-room permitting; left in bag if full). Up to 3 nearest accessible bag frames render offset so they never overlap; one tooltip at a time. Public/private ownership, drop-into-bag, 12-cap, old bags all still work.
- [x] Environment terrain = individual 32x32 PNGs (`SIMPLE_ENV_TILES_ENABLED`, active): one exact `tile_*.png` per terrain visual drawn directly into one map tile (no slicing). `SIMPLE_TILE_IMAGES`/`SIMPLE_TILE_THEMES` (roles floor/floorAlt/path/wall/wallAlt/hazard/water/specialFloor) in sprites.js; wired in `renderTileMap`/`renderDungeonTiles`; flat colored tile is the fallback; Nexus/vault stay gray. The old packed env_* atlas system stays disabled (`ENV_SPRITES_ENABLED=false`). VISUAL-ONLY; no object/decor; no collision/generation changes.
- [~] Environment terrain sheets (9 new 8x8 sheets, biome + dungeon themed) — SUPERSEDED/DISABLED (atlas never tiled cleanly; replaced by the 32x32 tile PNGs above): floors/walls/hazards/liquids + sparse decor rendered over the flat tile fill in `renderTileMap` (world/nexus/vault) and `renderDungeonTiles` (dungeon). Data-driven theme/role/decor tables + `Sprites.drawEnvTile`/`envHash` in sprites.js; deterministic per-tile variants (no flicker); `biomeEnvThemeMap`/`dungeonEnvThemeMap` pick the sheet; flat color stays as fallback when unmapped/unloaded. VISUAL-ONLY — generation/collision/hazards/portals/mobs/loot/stations unchanged. First-pass cells pending visual tuning.
- [x] Gear icon + projectile sprite sheets (4 new 8x8 sheets): gear icons (`gear_armor_icons`/`gear_accessory_ability_relic_icons`) shown for inventory/equip/loot/wiki via slot-based `itemSlotIconAssignments` (+ per-item `itemIconAssignments` override), geometric fallback preserved; weapons keep existing art. Player/enemy shots use `projectiles_weapons`/`projectiles_bosses` via class-keyed `projectileWeaponAssignments` + `e.key`-keyed `projectileBossAssignments` (VISUAL-ONLY `b.kind` tag; bullet stats/collision untouched), centered + travel-rotated inside the world transform, circle fallback when unmapped/unloaded. All cells data-driven/remappable; first-pass coords pending visual tuning.

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
- Restore `assets/sprites/mobs_astral.png` (currently absent; astral mobs star_scarab/mirage_stalker/sunseer fall back to geometry until it's re-added — mapping in sprites.js `mobSheetAssignments` is intact and will auto-activate). Other 9 mob sheets verified 1254×1254 / 8×8 after background cleanup.

---

## Patch — Sprite folder integration + hazard/wall update

Asset moves + behavior:
- **32×32 terrain tiles now live in `assets/sprites/tiles/`** (`SIMPLE_TILE_IMAGES` paths updated). Simple env tiles stay ACTIVE (`SIMPLE_ENV_TILES_ENABLED=true`); old atlas stays disabled (`ENV_SPRITES_ENABLED=false`).
- **Boss PNGs now live in subfolders**: `assets/sprites/Bosses/` (themed dungeon-boss art), `assets/sprites/Dungon Bosses/` (generic RotMG bosses, unused for now), `assets/sprites/Event Gods/` (world/event bosses).
- **`bossFileAssignments` (sprites.js)**: boss `e.key` → standalone PNG path. `drawForMob` checks it FIRST (`drawBossFilePath`, aspect-fit), then falls back to boss sheets → legacy art → geometry (missing file = graceful fallback, no crash). Dungeon bosses → `Bosses/`; world bosses (`wb_*`) → `Event Gods/`. `wb_frost_titan` intentionally unmapped → keeps icy `crystal_knight`. No boss AI/stats/loot changes.
- **Walls are visually suppressed**: in both `engine.js renderTileMap` and `dungeon.js renderDungeonTiles`, `T_WALL` now renders as floor (biome-tinted) — base fill + simple-tile role both treat walls as floor, wall-stripe overlay removed. Collision/map logic unchanged (walls still block).
- **Hazards now CLUSTER into pools** (`biomes.js assignBiomes`): per-tile scatter replaced by a per-cluster random-walk patch generator used by ALL hazards (lava, ice, poison) so they "group up" the same way.
- **`T_POISON` (=13)** new hazard tile. `fen` biome (id 14, plague theme) gets `hazard:T_POISON`. Renders the plague-theme poison tiles; `frost` theme gained a `hazard` role = ice tiles so `T_ICE` patches show ice art.
- **Poison damages without slow**: world.js DoT (70/s, bypasses armor) next to lava; `tileSpeedFactor` does NOT include poison → full move speed.
- **Ice is slippery without slow**: ice was never in `tileSpeedFactor` (no slow); slippery momentum slide preserved. No change needed beyond clustering + ice-tile rendering.

---

## Asset inventory (subfolders under `assets/sprites/`)

Filenames-only audit. Individual PNGs unless noted. "Integrated" = wired in code now; "Pending" = needs a future system.

| Folder | ~Count | What it is | Status |
|---|---|---|---|
| `tiles/` | 50 | 32×32 terrain tiles | **Integrated** (`SIMPLE_TILE_IMAGES`) |
| `Bosses/` | 38 | Themed dungeon-boss art (goblin/ice/fungal/infernal/void/voidharb/poison/undead/pharoh) + ability/power-up frames | **Integrated** (base `_boss_1` files → `bossFileAssignments`); ability/power-up frames pending an animation/phase system |
| `Dungon Bosses/` | 93 | Generic RotMG bosses (Oryx, etc.) | Pending — no theme match to current 9 dungeon bosses; reserve for future dungeons |
| `Event Gods/` | 18 | RotMG event bosses (Cube God, Lich, Sphinx…) | **Integrated** (5 of 6 world bosses → `bossFileAssignments`) |
| `Rings/` | 42 | RotMG ring art | Pending — no clean baseKey↔file map; hook = `itemIconAssignments` per baseKey |
| `Abilities/` | 117 | Ability/skill art | Pending — abilities aren't class-specific items yet; hook = `itemIconAssignments` / ability slot |
| `Armors/` | 39 | Robe/leather/plate art | Pending — generic ITEM_BASES, no 1:1; hook = `itemIconAssignments` |
| `Potions/` | 16 | Stat potions (Atk/Def/Dex/Life/Mana/Spd/Vit/Wis + Greater) | Pending — no potion items/inventory system exists |
| `Status Effects/` | 26 | RotMG status icons (Slowed/Sick/Berserk/Curse/Stunned…) | Pending — see "Status system" below |
| `Gravestones/` | 11 | Tiered graves: `1-8..8-8 Grave` (level brackets), `Level 20 Grave` (cap), `Small Grave`, `Grave` | Pending — death screen draws NO grave today; see "Gravestone" below |
| `Portals/` | 31 | RotMG dungeon portal art | Pending — current portals use `portal_sheet_*` atlases; could add per-dungeon `Portals/` overrides via `dungeonPortalAssignments` |
| `Misc/` | 8 | UI bits (Character-Slot, Battle Pass, Realmeye, Towers, Apple of maxing) | Pending — UI/meta features |
| `Environment/` | 12 | Bushes / trees / cloud (decor props) | Pending — feeds the DORMANT env object/decor pass (`ENV_OBJECT_ROLES`); not the active simple-tile renderer |
| `MotMG Items/` | 21 | Aspirant class weapons+armor, Magus/Sniper rings, tokens | Pending — closest to a clean win: Aspirant weapons could map to the 5 class starter weapons via `itemIconAssignments`, but verify art first |
| `NPC's/` | 2 | Guilliam, The Enchanter | Pending — no NPC system |
| `Classes/` | 19 | Class portraits (Warrior/Wizard/Archer/Priest/Rogue + others) | Pending — could skin class-select cards (ui.js `ClassSelect`) and player body later |
| `Skins/` | 5 | Directional skin sheets (Exalted Huntress, Tidal Kensei) | Pending — no skin system |
| `Animated Gifs/` | 23 | Ability/effect GIFs (activations, transitions, lightning) | Pending — no GIF/effect playback; canvas can't loop GIFs without a frame-strip conversion |

### Integrated now (this audit)
- Nothing new wired from the audit folders beyond Patch A's tiles + boss files. No clean 1:1 item-icon mapping exists (RotMG filenames ≠ generic `ITEM_BASES` keys), so item icons keep their current `gear_*_icons` + geometric fallback. No item stats/loot/save changes.

### Status system (future hook)
- `Status Effects/` icons map to a future debuff/buff system. Hook point: a per-character `statusEffects[]` + a small HUD strip near the vitals bar (ui.js `renderHUD`); tick logic in `player.js updateCharacter`. Icons by name (Slowed/Sick/Bleeding/etc.). DO NOT build the system yet.

### Gravestone (future hook)
- No grave is drawn on death today (`ui.js renderDead` has none). Future: on death, pick a grave by the character's level — `Small Grave` (low), `1-8 Grave`…`8-8 Grave` (level brackets, 1-8 = bracket index), `Level 20 Grave` (cap). Hook = `renderDead` + a stored death record. DO NOT build yet.

### Recommended next implementation order
1. Verify boss PNGs render (manual) and retune any bad theme matches in `bossFileAssignments`.
2. Aspirant (`MotMG Items/`) → class starter weapon icons via `itemIconAssignments` (smallest clean item-icon win once art is verified).
3. Class portraits (`Classes/`) → `ClassSelect` cards.
4. `Environment/` props → re-enable + populate the dormant env object/decor pass.
5. Status-effect system (data + HUD strip) using `Status Effects/`.
6. Gravestone-on-death using `Gravestones/`.
7. Per-dungeon portal overrides from `Portals/`; potions/NPC/skin/GIF systems last.

---

## Patch — World boss overhaul + HUD prompt lane

- **HUD prompt lane**: the world portal/interact prompt (`world.js` render, the `[Ctrl] Enter <Dungeon>` hint) now draws at `canvas.height - 156` (box) so it sits ABOVE the scaled bottom HP/MP vitals module (scaled top ≈ `h-116`) instead of under it.
- **World boss SESSION persistence** (`world.js init`): while `worldBoss && worldBoss.alive`, re-entering the world RE-ENTERS THE SAME REALM (closure state survives a Nexus/dungeon round-trip; init only rebinds transient bits + drops the player at home) — so the tracker/indicator keep pointing at the live boss. No duplicate spawn. Regenerates fresh once the boss dies (`worldBoss=null` in `onWorldBossKill`). Not saved across full browser reload.
- **New `boss_world` AI** (`mobs.js MOB_AI`): all six `wb_*` world bosses now use it (was `boss_goblin`/`boss_mycelian`/`boss_void`). Orbit movement (no teleport) + 3 HP phases (opener/mid/enrage) scaling bullet count/spread; recurring **POWERUP charge** (boss slows, `renderMob` draws a pulsing telegraph ring + powerup sprite) then `_wbReleaseBig` fires a rotating wall with a fair dodge gap + aimed lance (+ dense counter-ring on enrage). Patterns: radial fire ring / aimed shotgun / counter-rotating spirals. **Ashen Worldeater** is fixed (no longer inert) and hard. Shots carry `e.key` so `drawBossProjectile` uses each boss's themed projectile sprite (already mapped). Boss HP/dmg/loot/portal/leash logic unchanged.
- **Powerup sprites** (`sprites.js`): `bossPowerupAssignments` (wb_key → `assets/sprites/Bosses/*_power_up_*.png`) + `Sprites.drawBossPowerup(e,…)` (delegates to `drawBossFilePath`; missing file ⇒ only the telegraph ring shows).

---

## Patch — Wall collision fix (no invisible walls)

- Wall TILES are visually suppressed (render as floor; see the earlier sprite-folder patch). To remove the resulting INVISIBLE WALLS in the open world, `map.js buildWorld` now converts every generated `T_WALL → T_FLOOR` after cave-gen, gated by `const WORLD_WALLS_AS_FLOOR = true`. The world is fully walkable; no `engine.js`/collision change was needed.
- **Outer bounds still block**: `makeTileMap.get` returns `T_WALL` past the map edges, and `blocked()` still blocks `T_WALL`/`T_VOID` — so out-of-bounds keeps the player inside the map even though there are no in-world wall tiles.
- **Dungeons**: unchanged — they fill non-room space with `T_VOID` (visible black, correctly blocking), so they never had invisible walls.
- **Nexus/Vault**: unchanged — they keep their own `T_WALL` structure/logic (safe rooms; out of this patch's world/dungeon scope).
- **Hazards/water**: unaffected — `T_WATER`/`T_LAVA`/`T_ICE`/`T_POISON` are walkable and still apply their effects.
- **Minimap**: needs no change — with no world `T_WALL` tiles, the minimap renders the world as floor/biome (no fake wall coloring).
