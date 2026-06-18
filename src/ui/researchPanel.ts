/**
 * Research panel — shows technology tree nodes.
 * Each card shows current rank, description, cost, and a "Research" button.
 */
import type { Game } from '@core/Game';
import { RESEARCH_DEFS } from '@modules/research';
import { ResearchModule } from '@modules/research';
import { ResourcesModule } from '@modules/resources';
import { RESOURCE_DEFS } from '@modules/resources';

export function renderResearchPanel(host: HTMLElement, game: Game): void {
  const resModule = game.modules.get('research') as ResearchModule | undefined;
  const resources = game.modules.get('resources') as ResourcesModule | undefined;
  if (!resModule || !resources) return;

  let container = host.querySelector<HTMLElement>('.research-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'research-panel';
    const h = document.createElement('h2');
    h.textContent = 'Research';
    container.appendChild(h);
    const list = document.createElement('div');
    list.className = 'research-list';
    container.appendChild(list);
    host.appendChild(container);
  }
  const list = container.querySelector('.research-list')!;
  list.innerHTML = '';

  for (const def of RESEARCH_DEFS) {
    if (!resModule.isUnlocked(def)) continue;

    const rank = resModule.rank(def.id);
    const isMaxed = resModule.isMaxed(def);
    const cost = resModule.costFor(def);
    const canAfford = canAffordCost(resources, cost);

    const card = document.createElement('div');
    card.className = 'building-card research-card'; // Reuse building-card styles
    if (isMaxed) card.classList.add('maxed');

    card.innerHTML = `
      <div class="title">${def.name} <span style="float:right;color:var(--accent)">Rank ${rank}/${def.maxRank}</span></div>
      <div class="meta">${def.description}</div>
    `;

    if (!isMaxed) {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.disabled = !canAfford;
      btn.textContent = `Research · ${formatCost(cost)}`;
      btn.addEventListener('click', () => {
        resModule.purchase(def.id);
      });
      card.appendChild(btn);
    } else {
      const badge = document.createElement('div');
      badge.className = 'meta';
      badge.style.color = 'var(--good)';
      badge.style.fontWeight = '600';
      badge.textContent = '✓ Maximized';
      card.appendChild(badge);
    }
    list.appendChild(card);
  }
}

function canAffordCost(res: ResourcesModule, cost: Partial<Record<string, number>>): boolean {
  for (const [id, amt] of Object.entries(cost)) {
    if (res.get(id) < (amt ?? 0)) return false;
  }
  return true;
}

function formatCost(cost: Partial<Record<string, number>>): string {
  return Object.entries(cost)
    .map(([id, amt]) => `${resourceName(id)} ${amt}`)
    .join(' · ');
}

function resourceName(id: string): string {
  return RESOURCE_DEFS.find((r) => r.id === id)?.name ?? id;
}
