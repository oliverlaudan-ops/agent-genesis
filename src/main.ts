/**
 * Agent Genesis — entry point
 *
 * Boots the core engine, wires up UI panels, kicks the loop.
 * Each module registers itself; this file just composes them.
 */
import './styles.css';
import { Game } from '@core/Game';
import { ResourcesModule } from '@modules/resources';
import { BuildingsModule } from '@modules/buildings';
import { AgentsModule } from '@modules/agents';
import { VizModule } from '@viz/VizModule';
import { renderResourcePanel } from '@ui/resourcePanel';
import { renderBuildingPanel } from '@ui/buildingPanel';
import { renderAgentPanel } from '@ui/agentPanel';
import { renderControls } from '@ui/controls';

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
// Layout: desktop = 3 columns (left, viz, right). Mobile = viz-on-top +
// tabbed panel below. We pick the layout at startup and re-evaluate on
// resize so the user can rotate the device without reload.
// ---------------------------------------------------------------------------
const MOBILE_BREAKPOINT = 900;
type Layout = 'desktop' | 'mobile';

function isMobile(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

interface PanelLayout {
  /** Where the resource panel renders. */
  leftPanel: HTMLElement;
  /** Where the building panel renders (desktop: same as left; mobile: own tab). */
  buildingHost: HTMLElement;
  /** Where the agent panel renders. */
  rightPanel: HTMLElement;
  /** Where the controls panel renders (desktop: same as right; mobile: own tab). */
  controlsHost: HTMLElement;
  /** The canvas element. */
  canvas: HTMLCanvasElement;
  /** The viz panel wrapping the canvas. */
  vizPanel: HTMLElement;
}

function buildDesktopLayout(): PanelLayout {
  root!.innerHTML = '';
  root!.style.gridTemplateColumns = '280px 1fr 320px';
  root!.style.gridTemplateRows = '1fr';

  const leftPanel = document.createElement('section');
  leftPanel.className = 'panel';
  leftPanel.id = 'left-panel';

  const vizPanel = document.createElement('section');
  vizPanel.className = 'panel';
  vizPanel.id = 'viz-panel';
  const canvas = document.createElement('canvas');
  canvas.id = 'viz-canvas';
  vizPanel.appendChild(canvas);

  const rightPanel = document.createElement('section');
  rightPanel.className = 'panel';
  rightPanel.id = 'right-panel';

  root!.append(leftPanel, vizPanel, rightPanel);

  return { leftPanel, buildingHost: leftPanel, rightPanel, controlsHost: rightPanel, canvas, vizPanel };
}

function buildMobileLayout(): PanelLayout {
  root!.innerHTML = '';
  root!.style.gridTemplateColumns = '1fr';
  root!.style.gridTemplateRows = 'minmax(0, 40vh) minmax(0, 1fr)';

  const vizPanel = document.createElement('section');
  vizPanel.className = 'panel';
  vizPanel.id = 'viz-panel';
  const canvas = document.createElement('canvas');
  canvas.id = 'viz-canvas';
  vizPanel.appendChild(canvas);

  // Single tabbed panel — on mobile we don't have space for two side panels,
  // so resources/buildings/agents/controls all live here under a tab strip.
  const tabbedPanel = document.createElement('section');
  tabbedPanel.className = 'panel';
  tabbedPanel.id = 'tabbed-panel';

  // Tab strip
  const tabs = document.createElement('div');
  tabs.className = 'mobile-tabs';
  const tabDefs = [
    { id: 'resources', label: 'Resources' },
    { id: 'buildings', label: 'Buildings' },
    { id: 'agents', label: 'Agents' },
    { id: 'controls', label: 'Controls' },
  ];
  for (const t of tabDefs) {
    const btn = document.createElement('button');
    btn.textContent = t.label;
    btn.dataset.tabBtn = t.id;
    btn.addEventListener('click', () => activateTab(t.id));
    tabs.appendChild(btn);
  }
  tabbedPanel.appendChild(tabs);

  // One content div per tab. The render functions append their containers to
  // these by class — so we map each panel to its tab wrapper.
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
  activateTab('resources');

  root!.append(vizPanel, tabbedPanel);

  return {
    leftPanel: wrappers.resources,
    buildingHost: wrappers.buildings,
    rightPanel: wrappers.agents,
    controlsHost: wrappers.controls,
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
game.register(new BuildingsModule());
game.register(new AgentsModule());
game.register(new VizModule(panelLayout.canvas));

const tickRateEl = document.getElementById('tick-rate')!;
const saveStatusEl = document.getElementById('save-status')!;

function renderAllPanels(): void {
  renderResourcePanel(panelLayout.leftPanel, game);
  renderBuildingPanel(panelLayout.buildingHost, game);
  renderAgentPanel(panelLayout.rightPanel, game);
  renderControls(panelLayout.controlsHost, game, saveStatusEl);
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
