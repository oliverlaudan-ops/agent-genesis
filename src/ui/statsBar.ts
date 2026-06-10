/**
 * Stats bar — a compact, single-row (or 2×2 on very narrow screens) read-only
 * display of all resources. Used both at the top of the mobile layout and as
 * a horizontal strip under the header on desktop.
 *
 * No interactions — tapping does nothing. This is a glanceable HUD element;
 * for detail views the user can open a future "Resources" panel or use the
 * desktop side panel (which still has a fuller version).
 */
import type { Game } from '@core/Game';
import { RESOURCE_DEFS } from '@modules/resources';
import { ResourcesModule } from '@modules/resources';

/** Compact number format: 1.2K / 3.4M / 1.5B. Drops trailing zeros. */
function formatCompact(n: number, cap?: number): string {
  if (cap !== undefined) return `${(n * 100).toFixed(0)}%`;
  if (Math.abs(n) < 1000) {
    // Drop trailing .0, keep one decimal for sub-100 values
    return n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n).toString();
  }
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)}${units[i]}`;
}

export function renderStatsBar(host: HTMLElement, game: Game): void {
  const res = game.modules.get('resources') as ResourcesModule | undefined;
  if (!res) return;

  let bar = host.querySelector<HTMLElement>('.stats-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'stats-bar';
    host.appendChild(bar);
  }
  // Replace children each tick — N is small (4) and the per-tick DOM cost
  // is negligible. Avoids any diff/staleness logic.
  bar.innerHTML = '';
  for (const def of RESOURCE_DEFS) {
    const amount = res.get(def.id);
    const rate = res.getRate(def.id);

    const item = document.createElement('div');
    item.className = 'stats-item';
    item.style.setProperty('--stat-color', def.color);

    const top = document.createElement('div');
    top.className = 'stats-top';
    top.innerHTML = `<span class="stats-icon">${def.icon}</span><span class="stats-value">${formatCompact(amount, def.cap)}</span>`;

    const sub = document.createElement('div');
    sub.className = 'stats-sub';
    if (def.cap !== undefined) {
      sub.textContent = def.name;
    } else {
      sub.innerHTML = `<span class="stats-name">${def.name}</span>${rate > 0 ? `<span class="stats-rate">+${formatCompact(rate)}/s</span>` : ''}`;
    }

    item.append(top, sub);
    bar.appendChild(item);
  }
}
