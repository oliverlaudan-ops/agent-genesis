/**
 * Stats & Achievements panel.
 *
 * Shows lifetime aggregates and a list of unlockable achievements with
 * their bonus effects. Pure render; state lives in StatsModule and
 * AchievementsModule.
 */
import type { Game } from '@core/Game';
import { StatsModule } from '@modules/stats';
import { AchievementsModule, ACHIEVEMENT_DEFS } from '@modules/achievements';
import { RESOURCE_DEFS } from '@modules/resources';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function renderStatsAchievementsPanel(host: HTMLElement, game: Game): void {
  const stats = game.modules.get('stats') as StatsModule | undefined;
  const achievements = game.modules.get('achievements') as AchievementsModule | undefined;
  if (!stats || !achievements) return;

  let container = host.querySelector<HTMLElement>('.stats-achievements-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'stats-achievements-panel';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '16px';

    const heading = document.createElement('h2');
    heading.textContent = 'Stats & Achievements';
    container.appendChild(heading);

    // Stats section
    const statsSection = document.createElement('div');
    statsSection.className = 'panel-section';

    const statsTitle = document.createElement('h3');
    statsTitle.textContent = 'Statistics';
    statsSection.appendChild(statsTitle);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'stats-grid';
    statsGrid.id = 'stats-grid';
    statsSection.appendChild(statsGrid);

    container.appendChild(statsSection);

    // Achievements section
    const achievementsSection = document.createElement('div');
    achievementsSection.className = 'panel-section';

    const achievementsTitle = document.createElement('h3');
    achievementsTitle.textContent = 'Achievements';
    achievementsSection.appendChild(achievementsTitle);

    const achievementsList = document.createElement('div');
    achievementsList.className = 'achievements-list';
    achievementsList.id = 'achievements-list';
    achievementsSection.appendChild(achievementsList);

    container.appendChild(achievementsSection);
    host.appendChild(container);
  }

  const statsGrid = container.querySelector<HTMLElement>('#stats-grid')!;
  statsGrid.innerHTML = '';

  const playtimeRow = document.createElement('div');
  playtimeRow.className = 'stat-row';
  playtimeRow.innerHTML = `<span class="stat-label">Playtime</span><span class="stat-value">${formatDuration(stats.playtimeSeconds)}</span>`;
  statsGrid.appendChild(playtimeRow);

  const realignRow = document.createElement('div');
  realignRow.className = 'stat-row';
  realignRow.innerHTML = `<span class="stat-label">Realignments</span><span class="stat-value">${stats.realignCount}</span>`;
  statsGrid.appendChild(realignRow);

  const insightRow = document.createElement('div');
  insightRow.className = 'stat-row';
  insightRow.innerHTML = `<span class="stat-label">Insight earned</span><span class="stat-value">${formatNumber(stats.totalInsightEarned)}</span>`;
  statsGrid.appendChild(insightRow);

  const agentsRow = document.createElement('div');
  agentsRow.className = 'stat-row';
  agentsRow.innerHTML = `<span class="stat-label">Agents trained</span><span class="stat-value">${formatNumber(stats.totalAgentsTrained)}</span>`;
  statsGrid.appendChild(agentsRow);

  const buildingsRow = document.createElement('div');
  buildingsRow.className = 'stat-row';
  buildingsRow.innerHTML = `<span class="stat-label">Buildings bought</span><span class="stat-value">${formatNumber(stats.totalBuildingsPurchased)}</span>`;
  statsGrid.appendChild(buildingsRow);

  const researchRow = document.createElement('div');
  researchRow.className = 'stat-row';
  researchRow.innerHTML = `<span class="stat-label">Research ranks</span><span class="stat-value">${formatNumber(stats.totalResearchRanksPurchased)}</span>`;
  statsGrid.appendChild(researchRow);

  for (const def of RESOURCE_DEFS) {
    const produced = stats.lifetimeProduced(def.id);
    if (produced <= 0) continue;
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span class="stat-label">${def.icon} ${def.name} produced</span><span class="stat-value" style="color:${def.color}">${formatNumber(produced)}</span>`;
    statsGrid.appendChild(row);
  }

  const achievementsList = container.querySelector<HTMLElement>('#achievements-list')!;
  achievementsList.innerHTML = '';

  for (const def of ACHIEVEMENT_DEFS) {
    const unlocked = achievements.isUnlocked(def.id);
    const item = document.createElement('div');
    item.className = `achievement-item${unlocked ? ' unlocked' : ' locked'}`;

    const icon = document.createElement('span');
    icon.className = 'achievement-icon';
    icon.textContent = unlocked ? '★' : '☆';
    item.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'achievement-body';

    const title = document.createElement('div');
    title.className = 'achievement-title';
    title.textContent = def.name;
    body.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'achievement-desc';
    desc.textContent = def.description;
    body.appendChild(desc);

    const bonus = document.createElement('div');
    bonus.className = 'achievement-bonus';
    bonus.textContent = bonusText(def, unlocked);
    body.appendChild(bonus);

    item.appendChild(body);
    achievementsList.appendChild(item);
  }
}

function bonusText(def: typeof ACHIEVEMENT_DEFS[number], unlocked: boolean): string {
  const sign = def.bonus > 0 ? '+' : '';
  const pct = `${sign}${Math.round(def.bonus * 100)}%`;
  const prefix = unlocked ? 'Active: ' : 'Reward: ';
  switch (def.kind) {
    case 'trainingSpeed':
      return `${prefix}${pct} training speed`;
    case 'buildingRate':
      return `${prefix}${pct} building production`;
    case 'agentBoost':
      return `${prefix}${pct} agent boost`;
    case 'researchCost':
      return `${prefix}${pct} research cost`;
    case 'insightGain':
      return `${prefix}${pct} insight gain`;
    case 'globalProduction':
      return `${prefix}${pct} global production`;
    case 'resourceRate':
      return `${prefix}${pct} ${def.targetResource ?? 'resource'} production`;
    default:
      return `${prefix}${pct}`;
  }
}
