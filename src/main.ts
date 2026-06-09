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

const root = document.getElementById('game-root');
if (!root) throw new Error('#game-root not found');

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

root.append(leftPanel, vizPanel, rightPanel);

const game = new Game();
game.register(new ResourcesModule());
game.register(new BuildingsModule());
game.register(new AgentsModule());
game.register(new VizModule(canvas));

// UI renderers subscribe to the bus; render is idempotent + cheap on no-change.
const tickRateEl = document.getElementById('tick-rate')!;
const saveStatusEl = document.getElementById('save-status')!;

game.bus.on('tick', (dt) => {
  if (tickRateEl) tickRateEl.textContent = `tick: ${(1000 / dt).toFixed(1)}/s`;
  renderResourcePanel(leftPanel, game);
  renderBuildingPanel(leftPanel, game);
  renderAgentPanel(rightPanel, game);
  renderControls(rightPanel, game, saveStatusEl);
});

await game.boot();
game.start();
