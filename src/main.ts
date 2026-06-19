/**
 * Agent Genesis — entry point
 *
 * Boots the core engine, wires up UI panels, kicks the loop.
 * Each module registers itself; this file just composes them.
 */
import './styles.css';
import { Game } from '@core/Game';
import { ResourcesModule } from '@modules/resources';
import { PrestigeModule } from '@modules/prestige';
import { BuildingsModule } from '@modules/buildings';
import { AgentsModule } from '@modules/agents';
import { ResearchModule } from '@modules/research';
import { StatsModule } from '@modules/stats';
import { AchievementsModule } from '@modules/achievements';
import { VizModule } from '@viz/VizModule';
import { renderStatsBar } from '@ui/statsBar';
import { renderBuildingPanel } from '@ui/buildingPanel';
import { renderAgentPanel } from '@ui/agentPanel';
import { renderResearchPanel } from '@ui/researchPanel';
import { renderControls } from '@ui/controls';
import { renderPrestigePanel } from '@ui/prestigePanel';
import { renderStatsAchievementsPanel } from '@ui/statsAchievementsPanel';

// Service Worker registration. Only in production builds — Vite's HMR client
// would otherwise intercept the fetch in dev. import.meta.env.PROD inlines to
// a constant at build time and gets dead-code-eliminated in dev.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[sw] registration failed:', err));
  });
}

const root = document.getElementById('game-root');
if (!root) throw new Error('#game-root not found');

// ---------------------------------------------------------------------------
// Layout: desktop = stats bar + 3 columns. Mobile = stats bar + viz + tabbed
// panel. We pick the layout at startup and re-evaluate on resize so the user
// can rotate the device without reload.
// ---------------------------------------------------------------------------
const MOBILE_BREAKPOINT = 900;
type Layout = 'desktop' | 'mobile';

function isMobile(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

interface PanelLayout {
  /** Hosts the (desktop) buildings panel. */
  buildingHost: HTMLElement;
  /** Hosts the (desktop) research panel. */
  researchHost: HTMLElement;
  /** Hosts the (desktop) agents panel. */
  rightPanel: HTMLElement;
  /** Hosts the (desktop) controls panel. */
  controlsHost: HTMLElement;
  /** Hosts the prestige panel on desktop (below controls). */
  prestigeHost: HTMLElement;
  /** Hosts the stats & achievements panel on desktop (below prestige). */
  statsAchievementsHost: HTMLElement;
  /** The canvas element. */
  canvas: HTMLCanvasElement;
  /** The viz panel wrapping the canvas. */
  vizPanel: HTMLElement;
  /** Hosts the stats bar (used on both layouts). */
  statsBar: HTMLElement;
}

function buildDesktopLayout(): PanelLayout {
  const root = document.getElementById('game-root')!;
  const app = document.getElementById('app')!;
  root.innerHTML = '';
  root.style.gridTemplateColumns = '300px 1fr 320px';
  root.style.gridTemplateRows = '1fr';

  // Stats bar lives between header and game-root, full-width. It is inserted
  // into #app (the outer grid), not into #game-root, so it spans the full
  // viewport width regardless of the inner column layout.
  let statsBar = document.getElementById('stats-bar');
  if (!statsBar) {
    statsBar = document.createElement('div');
    statsBar.id = 'stats-bar';
    app.insertBefore(statsBar, root);
  }

  const leftPanel = document.createElement('section');
  leftPanel.className = 'panel';
  leftPanel.id = 'left-panel';
  leftPanel.style.display = 'flex';
  leftPanel.style.flexDirection = 'column';
  leftPanel.style.gap = '20px';

  const buildingHost = document.createElement('div');
  const researchHost = document.createElement('div');
  leftPanel.append(buildingHost, researchHost);

  const vizPanel = document.createElement('section');
  vizPanel.className = 'panel';
  vizPanel.id = 'viz-panel';
  const canvas = document.createElement('canvas');
  canvas.id = 'viz-canvas';
  vizPanel.appendChild(canvas);

  const rightPanel = document.createElement('section');
  rightPanel.className = 'panel';
  rightPanel.id = 'right-panel';
  rightPanel.style.display = 'flex';
  rightPanel.style.flexDirection = 'column';
  rightPanel.style.gap = '20px';

  const controlsHost = document.createElement('div');
  rightPanel.appendChild(controlsHost);

  const prestigeHost = document.createElement('div');
  prestigeHost.style.flex = '1 1 auto';
  prestigeHost.style.minHeight = '0';
  prestigeHost.style.overflowY = 'auto';
  rightPanel.appendChild(prestigeHost);

  const statsAchievementsHost = document.createElement('div');
  statsAchievementsHost.style.flex = '1 1 auto';
  statsAchievementsHost.style.minHeight = '0';
  statsAchievementsHost.style.overflowY = 'auto';
  rightPanel.appendChild(statsAchievementsHost);

  root.append(leftPanel, vizPanel, rightPanel);

  return {
    statsBar,
    buildingHost,
    researchHost,
    rightPanel,
    controlsHost,
    prestigeHost,
    statsAchievementsHost,
    canvas,
    vizPanel,
  };
}

function buildMobileLayout(): PanelLayout {
  const root = document.getElementById('game-root')!;
  const app = document.getElementById('app')!;
  root.innerHTML = '';
  root.style.gridTemplateColumns = '1fr';
  root.style.gridTemplateRows = 'minmax(0, 40vh) minmax(0, 1fr)';

  let statsBar = document.getElementById('stats-bar');
  if (!statsBar) {
    statsBar = document.createElement('div');
    statsBar.id = 'stats-bar';
    app.insertBefore(statsBar, root);
  }

  const vizPanel = document.createElement('section');
  vizPanel.className = 'panel';
  vizPanel.id = 'viz-panel';
  const canvas = document.createElement('canvas');
  canvas.id = 'viz-canvas';
  vizPanel.appendChild(canvas);

  // Tabbed panel — Buildings, Agents, Research, Controls, Prestige. (Resources live in the
  // stats bar above the viz, so they don't need a tab.)
  const tabbedPanel = document.createElement('section');
  tabbedPanel.className = 'panel';
  tabbedPanel.id = 'tabbed-panel';

  const tabs = document.createElement('div');
  tabs.className = 'mobile-tabs';
  const tabDefs = [
    { id: 'buildings', label: 'Buildings' },
    { id: 'agents', label: 'Agents' },
    { id: 'research', label: 'Research' },
    { id: 'controls', label: 'Controls' },
    { id: 'prestige', label: 'Prestige' },
    { id: 'stats', label: 'Stats' },
  ];
  for (const t of tabDefs) {
    const btn = document.createElement('button');
    btn.textContent = t.label;
    btn.dataset.tabBtn = t.id;
    btn.addEventListener('click', () => activateTab(t.id));
    tabs.appendChild(btn);
  }
  tabbedPanel.appendChild(tabs);

  const wrappers: Record<string, HTMLDivElement> = {};
  for (const t of tabDefs) {
    const w = document.createElement('div');
    w.dataset.tab = t.id;
    w.classList.add('tab-content');
    tabbedPanel.appendChild(w);
    wrappers[t.id] = w;
  }

  function activateTab(id: string) {
    for (const t of tabDefs) {
      const wrap = wrappers[t.id];
      const btn = tabs.querySelector<HTMLButtonElement>(`[data-tab-btn="${t.id}"]`);
      if (!wrap || !btn) continue;
      if (t.id === id) {
        wrap.classList.add('active');
        btn.classList.add('active');
      } else {
        wrap.classList.remove('active');
        btn.classList.remove('active');
      }
    }
  }
  activateTab('buildings');

  root.append(vizPanel, tabbedPanel);

  return {
    statsBar,
    buildingHost: wrappers.buildings,
    researchHost: wrappers.research,
    rightPanel: wrappers.agents,
    controlsHost: wrappers.controls,
    prestigeHost: wrappers.prestige,
    statsAchievementsHost: wrappers.stats,
    canvas,
    vizPanel,
  };
}

let currentLayout: Layout = isMobile() ? 'mobile' : 'desktop';
let panelLayout: PanelLayout = currentLayout === 'mobile' ? buildMobileLayout() : buildDesktopLayout();

function setupLayout(layoutKind: Layout): void {
  currentLayout = layoutKind;
  panelLayout = layoutKind === 'mobile' ? buildMobileLayout() : buildDesktopLayout();
}

// ---------------------------------------------------------------------------
// Game boot
// ---------------------------------------------------------------------------
const game = new Game();
game.register(new ResourcesModule());
game.register(new PrestigeModule()); // Before Buildings/Agents/Research so they can query prestige during init
game.register(new ResearchModule()); // Register before Buildings/Agents so they can query it during tick
game.register(new StatsModule()); // Tracks lifetime stats for achievements
game.register(new AchievementsModule()); // Provides permanent bonuses for milestones
game.register(new AgentsModule());
game.register(new BuildingsModule());
game.register(new VizModule(panelLayout.canvas));

const tickRateEl = document.getElementById('tick-rate')!;
const saveStatusEl = document.getElementById('save-status')!;

function renderAllPanels(): void {
  renderStatsBar(panelLayout.statsBar, game);
  renderBuildingPanel(panelLayout.buildingHost, game);
  renderResearchPanel(panelLayout.researchHost, game);
  renderAgentPanel(panelLayout.rightPanel, game);
  renderControls(panelLayout.controlsHost, game, saveStatusEl);
  renderPrestigePanel(panelLayout.prestigeHost, game);
  renderStatsAchievementsPanel(panelLayout.statsAchievementsHost, game);
}

game.bus.on('tick', (dt) => {
  if (tickRateEl) tickRateEl.textContent = `tick: ${(1000 / dt).toFixed(1)}/s`;
  renderAllPanels();
});

await game.boot();
game.start();

// Re-init layout on breakpoint cross. The Game instance is reused; only the
// DOM scaffolding is rebuilt. Saves stay intact (LocalStorage).
const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
mql.addEventListener('change', (e) => {
  const next: Layout = e.matches ? 'mobile' : 'desktop';
  if (next === currentLayout) return;
  // Tear down before we throw away the canvas element. VizModule's rAF
  // touches the canvas each frame; if we don't stop the game, it crashes
  // when the element gets detached from the DOM.
  game.stop();
  setupLayout(next);
  game.register(new VizModule(panelLayout.canvas));
  game.start();
  // Force a render so the new panels aren't blank until the next tick.
  renderAllPanels();
});
