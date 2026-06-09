/**
 * Building panel — left column, below resources.
 * Each card shows count, description, current cost, and a "Buy" button.
 */
import type { Game } from '@core/Game';
import { BUILDING_DEFS } from '@modules/buildings';
import { BuildingsModule } from '@modules/buildings';
import { ResourcesModule } from '@modules/resources';
import { RESOURCE_DEFS } from '@modules/resources';

export function renderBuildingPanel(host: HTMLElement, game: Game): void {
  const bld = game.modules.get('buildings') as BuildingsModule | undefined;
  const res = game.modules.get('resources') as ResourcesModule | undefined;
  if (!bld || !res) return;

  let container = host.querySelector<HTMLElement>('.building-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'building-panel';
    const h = document.createElement('h2');
    h.textContent = 'Buildings';
    container.appendChild(h);
    const list = document.createElement('div');
    list.className = 'building-list';
    container.appendChild(list);
    host.appendChild(container);
  }
  const list = container.querySelector('.building-list')!;
  list.innerHTML = '';

  for (const def of BUILDING_DEFS) {
    const unlocked = bld.isUnlocked(def);
    const count = bld.count(def.id);
    const cost = bld.costFor(def);
    const canAfford = res.snapshot().amounts && canAffordCost(res, cost);

    const card = document.createElement('div');
    card.className = 'building-card';
    card.innerHTML = `
      <div class="title">${def.name} <span style="float:right;color:var(--accent)">×${count}</span></div>
      <div class="meta">${def.description}</div>
      <div class="meta" style="color:var(--good)">+${def.produces.amount} ${resourceName(def.produces.resourceId)}/s each</div>
    `;
    if (!unlocked) {
      const lock = document.createElement('div');
      lock.className = 'meta';
      lock.style.color = 'var(--fg-dim)';
      lock.textContent = `🔒 Unlocks at ${def.unlockAt} buildings`;
      card.appendChild(lock);
    } else {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.disabled = !canAfford;
      btn.textContent = `Buy · ${formatCost(cost)}`;
      btn.addEventListener('click', () => {
        bld.purchase(def.id);
      });
      card.appendChild(btn);
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
