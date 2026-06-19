# Changelog

All notable changes to **Agent Genesis** are documented here.
Releases follow [Semantic Versioning](https://semver.org/) loosely for a hobby project.

## [v0.6.4] — 2026-06-19

### Fixed
- **Mobile tabs show no content** — added defensive re-activation of the default tab after boot and a global error handler that surfaces JavaScript errors visibly (red banner) on devices without an accessible browser console.
- `renderAllPanels` is now wrapped in try/catch; any panel-render failure will show an error message instead of silently leaving tabs blank.

## [v0.6.3] — 2026-06-19

### Added
- **Settings module** — persists player preferences such as the experimental WebGL toggle.
- **WebGL experimental toggle** — touch-device users can now enable WebGL manually from the Controls panel. The game still defaults to the safe Canvas2D renderer on mobile; the setting is saved and requires a reload to apply.

## [v0.6.2] — 2026-06-19

### Fixed
- **Mobile black screen persists on some devices** — since the v0.6.1 WebGL fixes did not resolve the issue on all smartphones, the game now defaults to the proven Canvas2D renderer on touch devices. WebGL remains active on desktop where it was working correctly.
- Added `preferFallback` option to `WebGLViz`; `VizModule` selects Canvas2D when `ontouchstart` or `navigator.maxTouchPoints` indicates a touch-capable device.

## [v0.6.1] — 2026-06-19

### Fixed
- **Mobile black screen after WebGL deployment** — corrected clip-space coordinate calculation in the vertex shader so particles are not rendered outside the viewport on non-square / resized canvases.
- **Robust WebGL fallback** — if the WebGL context is lost or a runtime draw error occurs, the renderer now switches seamlessly to the Canvas2D fallback instead of staying black.
- Avoid recreating the canvas/WebGL context when the viewport size hasn't actually changed, preventing context loss on mobile orientation changes.
- Raised fragment shader precision to `highp` for better compatibility with mobile GPUs.
- Ensured minimum point sprite size of 2 px for devices that clamp small points.

## [v0.6] — 2026-06-19

### Added
- **WebGL particle renderer** — replaced the vanilla Canvas2D visualization with a WebGL-based point-sprite renderer.
- **Instanced particle rendering** — supports many more particles with smoother glow and better mobile performance.
- **Vertex-shader motion patterns** — all four archetype motions (`orbit`, `drift`, `pulse`, `spiral`) are now computed on the GPU.
- **Transparent Canvas2D fallback** — when WebGL is unavailable, the renderer automatically falls back to the previous Canvas2D implementation.
- New files `src/viz/WebGLViz.ts`, `src/viz/shaders.ts`, and `src/viz/fallbackCanvasViz.ts`.

### Changed
- `src/viz/VizModule.ts` now delegates to `WebGLViz` while keeping the same public `GameModule` interface.
- Bundle size grew slightly (≈8 kB gzip) due to the new shader/buffer code, but runtime particle performance improves significantly.

## [v0.5] — 2026-06-19

### Added
- **Epoch Wheel system** — each agent archetype has its own circular progress wheel (RevIdle-inspired). The more agents of that archetype exist, the faster the wheel fills.
- **Epoch rewards** — every completed revolution grants a run-long bonus:
  - Reasoner: +1% Compute boost per epoch
  - Coder: +1% Capital boost per epoch
  - Vision: +0.5% Alignment cap per epoch
  - Planner: +1% global agent boost per epoch
- **EpochModule** (`src/modules/epoch/`) — tracks per-archetype progress, completed epochs, and bonus multipliers; resets on Realignment.
- **Epoch Wheel UI** — circular SVG progress ring rendered on each agent card between description and boost badge, showing current epoch number and color-coded by archetype.
- New bus events `epoch:progress` and `epoch:completed`.
- AgentsModule consumes epoch bonuses when composing agent boosts.

## [v0.4] — 2026-06-19

### Added
- **Statistics module** — tracks lifetime and per-run aggregates: playtime, total resources produced/spent, buildings bought, agents trained, research ranks purchased, realignments, peak resource amounts, and max agents/buildings owned at once.
- **Achievements module** — 10 unlockable milestones with small permanent bonuses:
  - `First Steps` — +2% training speed
  - `Data Miner` — +5% Data production
  - `Capital Flow` — +5% Capital production
  - `Compute Rush` — +5% Compute production
  - `Alignment Aware` — +5% Alignment production
  - `Swarm` — +5% agent boost multiplier
  - `City of Racks` — +5% building production
  - `Researcher` — -5% research cost
  - `Realignment` — +10% insight gain
  - `Omniscient` — +10% global production
- **Stats & Achievements panel** — new desktop panel and mobile tab showing lifetime stats, unlocked/locked achievements, and active bonus effects.
- New bus event `achievement:unlocked` emitted when a milestone is reached.
- New bus event `resource:changed` now emitted on every material resource change (production, spending, manual add), consumed by the statistics module.

### Changed
- Resources, Buildings, Agents, Research, and Prestige modules now consume achievement bonuses where applicable.

## [v0.3.1] — 2026-06-19

Usability & stability patch after the v0.3 prestige release.

### Fixed
- **Prestige panel reachable everywhere** — added a dedicated button so the Realignment panel is accessible on desktop *and* mobile.
- **Live requirement status** — the prestige panel now shows requirements (agent count, buildings, research) updating live, instead of requiring a manual re-open.
- **Post-v0.3 usability fixes** — smaller UI/UX rough edges discovered right after release.
- **Particle clouds cleared on prestige reset** — no ghost agents remain after Realignment.
- **Crash when saving during realignment** — the save cycle is paused while prestige math is running.
- **Research static effects re-synced after save/load** — flat bonuses from completed research are correctly restored from a save.

## [v0.3] — 2026-06-18

### Added
- **Prestige layer: Realignment** — reset progress to gain permanent meta-upgrades and faster early-game progression.
- Realignment panel with requirement overview and meta-upgrade selection.

## [v0.2] — 2026-06-18

### Added
- **Research tree** — unlockable techs that boost resources, agents, and buildings.
- **Research UI** — new panel to browse, queue, and complete research.
- **Agent production wiring** — trained agents now actually apply production multipliers to the economy.
- **New buildings:** Data Warehouse, Compute Cluster.

### Fixed
- Ethical Oversight research no longer consumes Alignment while active.

## [v0.1.2] — before v0.2

### Added
- **Mobile responsive layout** — on phones (≤ 900px) the three-column desktop layout collapses to visualization-on-top + tabbed panels below.
- Safe-area insets respected on notched devices.

## [v0.1.1] — before v0.2

### Added
- **PWA support** — Web App Manifest, icons, and a cache-first service worker.
- App is now installable on iOS Safari and Android Chrome; works offline after the first visit.
- Service worker only caches the static app shell, **not** LocalStorage saves.

## [v0.1] — initial release

### Added
- Core idle/incremental loop: Compute, Data, Capital, Alignment resources.
- Buildings: Data Mine, GPU Rack, Alignment Lab.
- Agents: Reasoner, Coder, Vision, Planner.
- Canvas particle visualization (one living cloud per agent type).
- Save/load/export/import via LocalStorage and JSON.
- Typed event-bus architecture with strict module boundaries.
- Vitest test suite, ESLint + Prettier tooling.
