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
});
