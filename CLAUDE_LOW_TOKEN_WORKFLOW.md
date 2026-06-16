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

### `js/engine.js`
- Canvas setup/render helpers.
- Input globals.
- Camera/math/tile helpers.
- Collision helpers such as wall blocking/water slowing.
- Bullet/particle/floating text helpers.
- Utility helpers like compact number/star rendering if present.

Use for:
- movement/collision helpers
- tile behavior
- bullets/projectiles core helpers
- global canvas utilities

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

Use for:
- inventory UI bugs
- item tooltips inside inventory
- equip/unequip/swap issues
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

Use for:
- mob stats/AI
- boss bullet patterns
- dungeon metadata like stars if located here
- XP/drop source data if stored on mobs

### `js/world.js`
- Open world zone.
- World mobs/combat.
- World portal drops/spawns.
- Portal labels/interact-to-enter.
- World loot bags and mob drops if implemented here.
- Water movement in world update if zone-specific.

Use for:
- world portal behavior
- world mob drops
- world movement/input bugs
- portal expiry

### `js/dungeon.js`
- Dungeon zone runtime.
- Dungeon combat loop.
- Boss kill hook.
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
- [x] Materials
- [x] Dust
- [x] Salvage
- [x] Reforge
- [x] Fusion
- [x] Gamble
- [x] Void multiplier stats
- [x] Vault room/account stash
- [x] Chat/debug commands
- [x] Water slows player
- [x] Dungeon portals require E
- [x] Dungeons: goblin_warren, fungal_cavern, void_rift

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
  - void: random 6–10 affixes
- Each item rolls one `rollPercent` from 1–100.
- That one roll percent applies to all stats on the item.
- Do not average per-stat rolls.
- Reforge changes only rollPercent/stat values.
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
- Remove vault access from character panel if not already done; vault should be accessed through Nexus/vault room only.
- Ensure rarity affix counts exactly match current rule.
- Tune mob drop rates and XP if too fast/slow.
- Improve dungeon generator minimum room/mob reliability if degenerate seeds still happen.
- Add more dungeons later: Space, Pirate, Hell, Heaven.
- Add safe-zone-only or pause behavior for inventory/station panels if desired.
- Add scroll for vault stash beyond first 30 slots if needed.
