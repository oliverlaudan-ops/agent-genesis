# Changelog

All notable changes to **Agent Genesis** are documented here.
Releases follow [Semantic Versioning](https://semver.org/) loosely for a hobby project.

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
