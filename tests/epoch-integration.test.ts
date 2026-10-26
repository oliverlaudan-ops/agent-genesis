import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { PrestigeModule } from '../src/modules/prestige/PrestigeModule';
import { ResearchModule } from '../src/modules/research/ResearchModule';
import { EpochModule } from '../src/modules/epoch/EpochModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { renderAgentPanel } from '../src/ui/agentPanel';

async function bootGame() {
  const game = new Game();
  const resources = new ResourcesModule();
  const prestige = new PrestigeModule();
  const research = new ResearchModule();
  const epoch = new EpochModule();
  const agents = new AgentsModule();
  const buildings = new BuildingsModule();
  // Match the production module order in main.ts.
  for (const module of [resources, prestige, research, epoch, agents, buildings]) {
    game.register(module);
  }
  await game.boot();
  return { game, resources, prestige, research, epoch, agents, buildings };
}

function step(game: Game, dt = 0) {
  for (const module of game.modules.values()) module.tick(dt);
}

describe('Epoch effects across gameplay modules', () => {
  beforeEach(() => localStorage.clear());

  it('applies Reasoner, Coder and Planner epochs to actual production and UI', async () => {
    const { game, resources, epoch, agents, buildings } = await bootGame();
    agents.deserialize({ population: { reasoner: 1, coder: 1, vision: 1, planner: 1 } });
    buildings.deserialize({ counts: { 'gpu-rack': 1, 'vc-fund': 1, 'alignment-lab': 1 } });
    step(game);
    expect(resources.getRate('compute')).toBeCloseTo(0.4 * 1.25 * 1.15);

    epoch.deserialize({ epochs: { reasoner: 10, coder: 20, vision: 0, planner: 30 } });
    step(game);
    const global = 1 + 0.15 * 1.3;
    expect(resources.getRate('compute')).toBeCloseTo(0.4 * (1 + 0.25 * 1.1 * 1.3) * global);
    expect(resources.getRate('capital')).toBeCloseTo(0.05 * (1 + 0.3 * 1.2 * 1.3) * global);
    expect(resources.getRate('alignment')).toBeCloseTo(0.005 * (1 + 0.4 * 1.3) * global);
    const before = resources.get('compute');
    resources.tick(1);
    expect(resources.get('compute') - before).toBeCloseTo(resources.getRate('compute'));

    const host = document.createElement('div');
    renderAgentPanel(host, game);
    const badges = host.querySelectorAll('.boost-active');
    expect(badges[0].textContent).toBe('+36%');
    expect(badges[1].textContent).toBe('+47%');
    expect(badges[3].textContent).toBe('+19%');
  });

  it('keeps Ethical Oversight through ticks and adds Vision epochs in either order', async () => {
    const { game, resources, research, epoch } = await bootGame();
    resources.add('compute', 10000);
    resources.add('data', 10000);
    resources.add('capital', 10000);
    expect(research.purchase('ethical-oversight')).toBe(true);
    step(game);
    expect(resources.getCapBonus('alignment')).toBeCloseTo(0.15);
    epoch.deserialize({ epochs: { vision: 4 } });
    step(game);
    expect(resources.getCapBonus('alignment')).toBeCloseTo(0.17);
    expect(research.purchase('ethical-oversight')).toBe(true);
    step(game);
    expect(resources.getCapBonus('alignment')).toBeCloseTo(0.32);
    resources.add('alignment', 100);
    expect(resources.get('alignment')).toBeCloseTo(1.32);
    resources.setRate('alignment', 1);
    resources.tick(1);
    expect(resources.get('alignment')).toBeCloseTo(1.32);

    epoch.resetRun();
    expect(resources.getCapBonus('alignment')).toBeCloseTo(0.3);
    epoch.deserialize({ epochs: { vision: 4 } });
    research.resetRun();
    expect(resources.getCapBonus('alignment')).toBeCloseTo(0.02);
  });

  it('restores combined caps and production from an existing-format save', async () => {
    const first = await bootGame();
    first.resources.add('compute', 10000);
    first.resources.add('data', 10000);
    first.resources.add('capital', 10000);
    first.research.purchase('ethical-oversight');
    first.agents.deserialize({ population: { reasoner: 1, coder: 1, vision: 1, planner: 1 } });
    first.buildings.deserialize({ counts: { 'gpu-rack': 1, 'vc-fund': 1 } });
    first.epoch.deserialize({ epochs: { reasoner: 10, coder: 20, vision: 4, planner: 30 } });
    step(first.game);
    expect(first.game.save.saveLocal()).toBe(true);

    const loaded = await bootGame();
    step(loaded.game);
    expect(loaded.resources.getCapBonus('alignment')).toBeCloseTo(0.17);
    expect(loaded.resources.getRate('compute')).toBeCloseTo(0.4 * (1 + 0.25 * 1.1 * 1.3) * (1 + 0.15 * 1.3));
    expect(loaded.resources.getRate('capital')).toBeCloseTo(first.resources.getRate('capital'));
  });

  it('allows research-based prestige without Vision, then resets all run bonuses', async () => {
    const { game, resources, research, epoch, buildings, prestige, agents } = await bootGame();
    resources.add('compute', 10000);
    resources.add('data', 10000);
    resources.add('capital', 10000);
    research.purchase('ethical-oversight');
    buildings.deserialize({ counts: { 'data-mine': 50 } });
    step(game);
    expect(prestige.realignAllowed()).toBe(true);

    agents.deserialize({ population: { reasoner: 1, coder: 1, vision: 1, planner: 1 } });
    epoch.deserialize({ epochs: { reasoner: 10, coder: 20, vision: 4, planner: 30 } });
    step(game);
    expect(prestige.performRealign()).toBe(true);
    step(game);
    expect(resources.getCapBonus('alignment')).toBe(0);
    expect(resources.getAgentMultFor('compute')).toBe(0);
    expect(resources.getAgentGlobalMult()).toBe(1);
    expect(epoch.countFor('vision')).toBe(0);
    expect(research.totalRanks()).toBe(0);
    expect(prestige.insight()).toBeGreaterThan(0);
  });
});
