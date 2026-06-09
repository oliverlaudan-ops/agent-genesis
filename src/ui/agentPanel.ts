/**
 * Agent panel — right column.
 * One card per agent archetype with population, training progress, and a
 * "Train" button that kicks off the training timer.
 */
import type { Game } from '@core/Game';
import { AGENT_DEFS } from '@modules/agents';
import { AgentsModule } from '@modules/agents';
import { ResourcesModule } from '@modules/resources';
import { RESOURCE_DEFS } from '@modules/resources';

export function renderAgentPanel(host: HTMLElement, game: Game): void {
  const ag = game.modules.get('agents') as AgentsModule | undefined;
  const res = game.modules.get('resources') as ResourcesModule | undefined;
  if (!ag || !res) return;

  let container = host.querySelector<HTMLElement>('.agent-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'agent-panel';
    const h = document.createElement('h2');
    h.textContent = 'Agents';
    container.appendChild(h);
    const list = document.createElement('div');
    list.className = 'agent-list';
    container.appendChild(list);
    host.appendChild(container);
  }
  const list = container.querySelector('.agent-list')!;
  list.innerHTML = '';

  for (const def of AGENT_DEFS) {
    const pop = ag.population(def.id);
    const training = ag.trainingProgressFor(def.id);
    const inTraining = ag.isTraining(def.id);

    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.borderLeft = `3px solid ${def.color}`;
    card.innerHTML = `
      <div class="title">${def.name} <span style="float:right;color:var(--accent)">×${pop}</span></div>
      <div class="meta">${def.description}</div>
    `;

    if (inTraining) {
      const bar = document.createElement('div');
      bar.style.cssText = 'height:6px;background:var(--bg-elev);border-radius:3px;overflow:hidden;';
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;width:${(training * 100).toFixed(1)}%;background:${def.color};transition:width 0.2s;`;
      bar.appendChild(fill);
      card.appendChild(bar);
      const label = document.createElement('div');
      label.className = 'meta';
      label.textContent = `Training… ${(training * 100).toFixed(0)}%`;
      card.appendChild(label);
    } else {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = `Train · ${formatCost(def.trainingCost)} · ${def.trainingTime}s`;
      btn.addEventListener('click', () => {
        ag.startTraining(def.id);
      });
      card.appendChild(btn);
    }
    list.appendChild(card);
  }
}

function formatCost(cost: Partial<Record<string, number>>): string {
  return Object.entries(cost)
    .map(([id, amt]) => `${resourceName(id)} ${amt}`)
    .join(' + ');
}

function resourceName(id: string): string {
  return RESOURCE_DEFS.find((r) => r.id === id)?.name ?? id;
}
