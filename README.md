# Agent Genesis

> Modular AI-agent idle/incremental game. Train, evolve, and visualize autonomous agents as living particle systems.

Built with **TypeScript + Vite**. UI in English. 100% offline-friendly. Hobby project.

## Concept

You're running an AI research lab. You stream data, spin up GPU racks, train specialized agents (Reasoner, Coder, Vision, Planner), and watch them come alive as particle clouds on screen — the more you train, the denser the swarm. Layered on top of ISEPS-style particle visualizations and Revolution-Idle-inspired progression.

## Stack

- **Language:** TypeScript 5 (strict)
- **Build:** Vite 5
- **Tests:** Vitest + jsdom
- **Lint:** ESLint + Prettier
- **Persistence:** LocalStorage + JSON export/import (no backend)
- **PWA:** Service Worker (cache-first for static assets) + Web App Manifest

## PWA

Agent Genesis installs as a standalone app (Add to Home Screen on iOS/Android,
install icon in Chrome/Edge). Once installed:

- Loads from cache, so it works offline after the first visit
- Runs in fullscreen / no browser chrome
- Saves (LocalStorage) are not affected by the SW — SW only caches the
  static app shell, not user data

To install on iOS: open the live demo in Safari, tap the Share button, then
"Add to Home Screen". On Android: Chrome menu → "Install app".

## Mobile

Responsive layout: on phones (≤ 900px), the three-column desktop layout
collapses to a viz-on-top + tabbed-panel-below design. Resources, Buildings,
Agents, and Controls live behind a tab strip. Safe-area insets are respected
on notched devices.

## Architecture

Strict module boundaries — everything talks through a typed event bus:

```
src/
├── core/           # Game engine, Bus, SaveManager
├── modules/        # Independent gameplay modules
│   ├── resources/  # Compute, Data, Capital, Alignment
│   ├── buildings/  # Data Mine, GPU Rack, Alignment Lab, ...
│   ├── agents/     # Reasoner, Coder, Vision, Planner
│   ├── research/   # Rank-based technology tree
│   ├── prestige/   # Realignment meta-progression
│   ├── stats/      # Lifetime and per-run statistics
│   └── achievements/ # Milestones with permanent bonuses
├── viz/            # Canvas particle system (one cloud per agent type)
├── ui/             # Pure-render panels
└── main.ts         # Entry point — composes modules
```

A new module (research, prestige, achievements, …) is one folder + one class implementing the `GameModule` interface.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check + bundle
npm run test         # unit tests
npm run test:watch
npm run lint
npm run format
npm run typecheck
```

## Roadmap (high level)

- [x] v0.1 — Core loop, resources, buildings, agents, particle viz, save/load/export
- [x] v0.1.1 — PWA (manifest, icons, service worker, installable)
- [x] v0.1.2 — Mobile responsive layout (tabbed panel under viz on small screens)
- [x] v0.2 — Research tree, more buildings, agent production wiring
- [x] v0.3 — Prestige layer (Realignment)
- [x] v0.3.1 — Prestige usability & stability patch
- [x] v0.4 — Achievements + statistics
- [x] v0.5 — Epoch Wheel (RevIdle-inspired per-agent progression)
- [ ] v0.6 — WebGL particle upgrade
- [ ] v0.5 — Epoch Wheel (RevIdle-inspired per-agent progression)
- [ ] v0.6 — WebGL particle upgrade
- [ ] v1.0 — Polish, balance, tutorial

## License

MIT
