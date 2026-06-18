/**
 * Prestige panel — shows persistent Insight and the Realignment action.
 *
 * Desktop: sits below Controls in the right column.
 * Mobile: rendered as its own tab.
 */
import type { Game } from '@core/Game';
import { PrestigeModule } from '@modules/prestige';
import { BuildingsModule } from '@modules/buildings';
import { ResourcesModule } from '@modules/resources';
import { ResearchModule } from '@modules/research';

export function renderPrestigePanel(host: HTMLElement, game: Game): void {
  const prestige = game.modules.get('prestige') as PrestigeModule | undefined;
  if (!prestige) return;

  let container = host.querySelector<HTMLElement>('.prestige-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'prestige-panel';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    const heading = document.createElement('h2');
    heading.textContent = 'Prestige';
    container.appendChild(heading);

    const card = document.createElement('div');
    card.className = 'building-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';

    const insightRow = document.createElement('div');
    insightRow.className = 'title';
    insightRow.textContent = 'Insight';
    const insightValue = document.createElement('span');
    insightValue.id = 'prestige-insight-value';
    insightValue.style.cssText = 'float:right;color:var(--accent);';
    insightValue.textContent = '0';
    insightRow.appendChild(insightValue);
    card.appendChild(insightRow);

    const multiplierRow = document.createElement('div');
    multiplierRow.className = 'meta';
    multiplierRow.textContent = 'Global production multiplier: ';
    const multiplierValue = document.createElement('span');
    multiplierValue.id = 'prestige-multiplier-value';
    multiplierValue.style.color = 'var(--good)';
    multiplierValue.textContent = '×1.00';
    multiplierRow.appendChild(multiplierValue);
    card.appendChild(multiplierRow);

    const headStartRow = document.createElement('div');
    headStartRow.className = 'meta';
    headStartRow.textContent = 'Next-run head start: ';
    const headStartValue = document.createElement('span');
    headStartValue.id = 'prestige-headstart-value';
    headStartValue.style.color = 'var(--fg)';
    headStartValue.textContent = 'Data 0 · Compute 0';
    headStartRow.appendChild(headStartValue);
    card.appendChild(headStartRow);

    const gainedRow = document.createElement('div');
    gainedRow.className = 'meta';
    gainedRow.textContent = 'Insight on realign: ';
    const gainedValue = document.createElement('span');
    gainedValue.id = 'prestige-gained-value';
    gainedValue.style.color = 'var(--warn)';
    gainedValue.textContent = '+0';
    gainedRow.appendChild(gainedValue);
    card.appendChild(gainedRow);

    const realignBtn = document.createElement('button');
    realignBtn.id = 'prestige-realign-btn';
    realignBtn.className = 'primary';
    realignBtn.textContent = 'Realign Lab';
    realignBtn.addEventListener('click', () => {
      if (prestige.performRealign()) {
        location.reload();
      }
    });
    card.appendChild(realignBtn);

    const requirementNote = document.createElement('div');
    requirementNote.id = 'prestige-requirement-note';
    requirementNote.className = 'meta';
    requirementNote.style.color = 'var(--fg-dim)';
    requirementNote.style.fontSize = '10px';
    card.appendChild(requirementNote);

    container.appendChild(card);
    host.appendChild(container);
  }

  const insightValue = container.querySelector<HTMLElement>('#prestige-insight-value');
  const multiplierValue = container.querySelector<HTMLElement>('#prestige-multiplier-value');
  const headStartValue = container.querySelector<HTMLElement>('#prestige-headstart-value');
  const gainedValue = container.querySelector<HTMLElement>('#prestige-gained-value');
  const realignBtn = container.querySelector<HTMLButtonElement>('#prestige-realign-btn');
  const requirementNote = container.querySelector<HTMLElement>('#prestige-requirement-note');

  if (
    !insightValue ||
    !multiplierValue ||
    !headStartValue ||
    !gainedValue ||
    !realignBtn ||
    !requirementNote
  ) {
    return;
  }

  const insight = prestige.insight();
  const multiplier = prestige.globalProductionMult();
  const headStart = prestige.headStartBonus();
  const gained = prestige.insightGainedOnRealign();
  const allowed = prestige.realignAllowed();

  const buildings = game.modules.get('buildings') as BuildingsModule | undefined;
  const resources = game.modules.get('resources') as ResourcesModule | undefined;
  const research = game.modules.get('research') as ResearchModule | undefined;
  const totalBuildings = buildings?.totalBuildings() ?? 0;
  const capBonus = resources?.getCapBonus('alignment') ?? 0;
  const ethicalRanks = research?.rank('ethical-oversight') ?? 0;

  insightValue.textContent = insight.toLocaleString();
  multiplierValue.textContent = `×${multiplier.toFixed(2)}`;
  headStartValue.textContent = `Data ${headStart.data.toLocaleString()} · Compute ${headStart.compute.toLocaleString()}`;
  gainedValue.textContent = `+${gained.toLocaleString()}`;
  realignBtn.disabled = !allowed;
  const buildingOk = totalBuildings >= 50;
  const alignmentOk = capBonus > 0.0001 || ethicalRanks > 0;
  requirementNote.innerHTML = allowed
    ? 'Ready to realign. Progress converts into permanent Insight.'
    : `<span style="color:${buildingOk ? 'var(--good)' : 'var(--bad)'}">Buildings ${totalBuildings}/50</span> · <span style="color:${alignmentOk ? 'var(--good)' : 'var(--bad)'}">Alignment bonus ${capBonus.toFixed(2)}</span>`;
}
