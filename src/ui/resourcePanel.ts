/**
 * Resource panel — left column. Shows all resources with their current
 * amount and per-second rate. Pure render; reads from ResourcesModule.
 */
import type { Game } from '@core/Game';
import { RESOURCE_DEFS } from '@modules/resources';
import { ResourcesModule } from '@modules/resources';

export function renderResourcePanel(host: HTMLElement, game: Game): void {
  const res = game.modules.get('resources') as ResourcesModule | undefined;
  if (!res) return;

  let container = host.querySelector<HTMLElement>('.resource-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'resource-panel';
    host.appendChild(container);
    const h = document.createElement('h2');
    h.textContent = 'Resources';
    container.appendChild(h);
    const list = document.createElement('div');
    list.className = 'resource-list';
    container.appendChild(list);
  }
  const list = container.querySelector('.resource-list')!;
  // Replace children each tick — fast and simple, fine for ~4 resources.
  list.innerHTML = '';
  for (const def of RESOURCE_DEFS) {
    const amount = res.get(def.id);
    const rate = res.getRate(def.id);
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.innerHTML = `
      <span class="name" style="color:${def.color}">${def.icon} ${def.name}</span>
      <span>
        <span class="value">${formatNumber(amount, def.cap)}</span>
        ${rate > 0 ? `<span class="rate">+${rate.toFixed(2)}/s</span>` : ''}
      </span>
    `;
    list.appendChild(row);
  }
}

function formatNumber(n: number, cap?: number): string {
  if (cap !== undefined) return `${(n * 100).toFixed(1)}%`;
  if (n < 1000) return n.toFixed(n < 10 ? 1 : 0);
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(2)}${units[i]}`;
}
