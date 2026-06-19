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
import { renderEpochWheel } from '@ui/epochWheel';

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

    // Epoch wheel slot sits between description and the boost badge.
    const epochSlot = document.createElement('div');
    epochSlot.className = 'epoch-wheel-slot';
    epochSlot.style.cssText = 'display:flex;justify-content:flex-end;margin:-4px 0 2px 0;';
    const epochWheel = document.createElement('div');
    epochWheel.className = 'epoch-wheel-container';
    epochSlot.appendChild(epochWheel);
    card.appendChild(epochSlot);

    // Render if the epoch module is available; otherwise leave the slot
    // empty for backwards compatibility during parallel work.
    if (game.modules.get('epoch')) {
      renderEpochWheel(epochWheel, def.id, game);
    }

    // Boost badge: shows the current effective multiplier for this agent's
    // target. Stays visible at all times so the player can see at a glance
    // which agents are doing work and how much. Greyed out at pop=0.
    const boostBadge = document.createElement('div');
    boostBadge.className = 'boost-badge';
    const target = def.boosts.resourceId === '*'
      ? 'all resources'
      : resourceName(def.boosts.resourceId);
    const perAgentPct = (def.boosts.multiplierPerAgent * 100).toFixed(0);
    const effectiveMult = 1 + def.boosts.multiplierPerAgent * pop;
    const effectivePct = ((effectiveMult - 1) * 100).toFixed(0);
    boostBadge.innerHTML = pop > 0
      ? `<span class="boost-active">+${effectivePct}%</span> ${target} <span class="boost-detail">(${perAgentPct}%/pop · ×${pop})</span>`
      : `<span class="boost-idle">+${perAgentPct}%/pop</span> ${target}`;
    card.appendChild(boostBadge);

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
