import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { AGENT_DEFS } from '../src/modules/agents/AgentsModule';

describe('AgentsModule', () => {
  let game: Game;
  let ag: AgentsModule;
  let res: ResourcesModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    ag = new AgentsModule();
    game.register(res);
    game.register(ag);
    await game.boot();
  });

  it('starts empty', () => {
    expect(ag.population('reasoner')).toBe(0);
    expect(ag.totalPopulation()).toBe(0);
  });

  it('refuses to train when broke', () => {
    res.spend({ data: 100, compute: 100 });
    expect(ag.startTraining('reasoner')).toBe(false);
  });

  it('trains an agent over its training time', () => {
    const def = AGENT_DEFS.find((a) => a.id === 'reasoner')!;
    // Top up so the cost is always affordable
    res.add('data', 1000);
    res.add('compute', 1000);
    const ok = ag.startTraining('reasoner');
    expect(ok).toBe(true);
    // simulate enough ticks
    ag.tick(def.trainingTime + 1);
    expect(ag.population('reasoner')).toBe(1);
    expect(ag.totalPopulation()).toBe(1);
  });

  it('refuses to start a second training while one is in progress', () => {
    ag.startTraining('reasoner');
    expect(ag.startTraining('reasoner')).toBe(false);
  });

  it('publishes boost multipliers to ResourcesModule when agents are trained', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    res.add('capital', 1000);
    // Train + finish a Reasoner (boosts Compute) and a Coder (boosts Capital).
    const reasoner = AGENT_DEFS.find((a) => a.id === 'reasoner')!;
    const coder = AGENT_DEFS.find((a) => a.id === 'coder')!;
    ag.startTraining('reasoner');
    ag.tick(reasoner.trainingTime + 1);
    ag.startTraining('coder');
    ag.tick(coder.trainingTime + 1);
    // The tick above finished the coder; agents publish boosts on every tick,
    // so the next tick (below) will see both populations reflected.
    ag.tick(0.001);
    expect(res.getAgentMultFor('compute')).toBeCloseTo(0.25, 5);
    expect(res.getAgentMultFor('capital')).toBeCloseTo(0.3, 5);
    expect(res.getAgentMultFor('data')).toBe(0);
  });

  it('Planner contributes to the global multiplier only', () => {
    res.add('compute', 5000);
    res.add('data', 5000);
    res.add('capital', 5000);
    const planner = AGENT_DEFS.find((a) => a.id === 'planner')!;
    ag.startTraining('planner');
    ag.tick(planner.trainingTime + 1);
    ag.tick(0.001);
    // One Planner = +0.15 to the global multiplier.
    expect(res.getAgentGlobalMult()).toBeCloseTo(1.15, 5);
    // No per-resource boost from the planner.
    expect(res.getAgentMultFor('compute')).toBe(0);
  });

  it('emits a final agent:trained with progress=0 when training finishes', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    const reasoner = AGENT_DEFS.find((a) => a.id === 'reasoner')!;
    ag.startTraining('reasoner');
    const events: Array<{ id: string; progress: number }> = [];
    game.bus.on('agent:trained', (e: { id: string; progress: number }) => events.push(e));
    ag.tick(reasoner.trainingTime + 1); // crosses the 1.0 boundary this tick
    const last = events[events.length - 1];
    expect(last).toBeDefined();
    expect(last.id).toBe('reasoner');
    expect(last.progress).toBe(0);
  });
});
