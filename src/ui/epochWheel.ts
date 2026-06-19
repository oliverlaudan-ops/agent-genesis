/**
 * Epoch Wheel UI widget.
 *
 * Circular SVG progress indicator for one agent archetype, inspired by
 * Revolution Idle. Shows current epoch number in the centre and exposes
 * the active epoch bonus via a tooltip.
 */
import type { Game } from '@core/Game';
import type { AgentArchetype } from '@modules/agents';
import { AGENT_DEFS } from '@modules/agents';
import type { EpochModule } from '@modules/epoch';

export function renderEpochWheel(
  host: HTMLElement,
  archetype: AgentArchetype,
  game: Game,
): void {
  const epochMod = game.modules.get('epoch') as EpochModule | undefined;

  // If the module is not registered we render nothing and leave any prior
  // wheel in place. Consumers should clear the slot before calling us.
  if (!epochMod) return;

  const progress = epochMod.progressFor(archetype);
  const count = epochMod.countFor(archetype);
  const currentEpoch = count + 1;

  const svg = makeWheelSVG(archetype, progress, currentEpoch, epochMod);
  host.innerHTML = '';
  host.appendChild(svg);
}

/** Create the wheel SVG and its tooltip wrapper. */
function makeWheelSVG(
  archetype: AgentArchetype,
  progress: number,
  epoch: number,
  epochMod: EpochModule,
): SVGSVGElement {
  const size = 48;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getArchetypeColor(archetype);
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'epoch-wheel');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Epoch ${epoch} for ${archetype}, progress ${(progress * 100).toFixed(0)}%`,
  );

  const bg = document.createElementNS(ns, 'circle');
  bg.setAttribute('cx', String(size / 2));
  bg.setAttribute('cy', String(size / 2));
  bg.setAttribute('r', String(radius));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'currentColor');
  bg.setAttribute('stroke-width', String(stroke));
  bg.setAttribute('class', 'epoch-wheel-bg');
  svg.appendChild(bg);

  const fg = document.createElementNS(ns, 'circle');
  fg.setAttribute('cx', String(size / 2));
  fg.setAttribute('cy', String(size / 2));
  fg.setAttribute('r', String(radius));
  fg.setAttribute('fill', 'none');
  fg.setAttribute('stroke', color);
  fg.setAttribute('stroke-width', String(stroke));
  fg.setAttribute('stroke-linecap', 'round');
  fg.setAttribute('stroke-dasharray', String(circumference));
  fg.setAttribute('stroke-dashoffset', String(offset));
  fg.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  fg.setAttribute('class', 'epoch-wheel-progress');
  svg.appendChild(fg);

  const text = document.createElementNS(ns, 'text');
  text.setAttribute('x', String(size / 2));
  text.setAttribute('y', String(size / 2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('fill', 'currentColor');
  text.setAttribute('font-size', '14');
  text.setAttribute('font-weight', '600');
  text.setAttribute('style', 'pointer-events:none');
  text.textContent = String(epoch);
  svg.appendChild(text);

  const title = document.createElementNS(ns, 'title');
  title.textContent = buildTooltip(archetype, progress, epoch, epochMod);
  svg.appendChild(title);

  return svg;
}

function getArchetypeColor(archetype: AgentArchetype): string {
  const def = AGENT_DEFS.find((d) => d.id === archetype);
  return def?.color ?? 'var(--accent)';
}

function buildTooltip(
  archetype: AgentArchetype,
  progress: number,
  epoch: number,
  epochMod: EpochModule,
): string {
  const lines: string[] = [];
  lines.push(`${capitalize(archetype)} — Epoch ${epoch}`);
  lines.push(`Progress: ${(progress * 100).toFixed(0)}%`);
  lines.push(`Completed epochs: ${epoch - 1}`);

  const bonusLines = describeBonuses(archetype, epochMod);
  if (bonusLines.length) {
    lines.push(`Current bonus: ${bonusLines.join(', ')}`);
  }

  return lines.join('\n');
}

function describeBonuses(archetype: AgentArchetype, epochMod: EpochModule): string[] {
  const out: string[] = [];
  const count = epochMod.countFor(archetype);
  if (count <= 0) return out;

  switch (archetype) {
    case 'reasoner': {
      const b = epochMod.bonusFor('agentBoost', 'compute') - 1;
      out.push(`+${(b * 100).toFixed(1)}% Compute`);
      break;
    }
    case 'coder': {
      const b = epochMod.bonusFor('agentBoost', 'capital') - 1;
      out.push(`+${(b * 100).toFixed(1)}% Capital`);
      break;
    }
    case 'vision': {
      const b = epochMod.alignmentCapBonus();
      out.push(`+${(b * 100).toFixed(1)}% Alignment cap`);
      break;
    }
    case 'planner': {
      const b = epochMod.bonusFor('globalAgentBoost') - 1;
      out.push(`+${(b * 100).toFixed(1)}% all agent boosts`);
      break;
    }
  }

  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
