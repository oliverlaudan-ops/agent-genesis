import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { ResearchModule } from '../src/modules/research/ResearchModule';
import { PrestigeModule } from '../src/modules/prestige/PrestigeModule';

describe('Realign debug', () => {
  let game: Game;
  let res: ResourcesModule;
  let bld: BuildingsModule;
  let ag: AgentsModule;
  let research: ResearchModule;
  let prestige: PrestigeModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    prestige = new PrestigeModule();
    research = new ResearchModule();
    ag = new AgentsModule();
    bld = new BuildingsModule();
    game.register(res);
    game.register(prestige);
    game.register(research);
    game.register(ag);
    game.register(bld);
    await game.boot();
  });

  it('reports why realign is blocked without enough buildings', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    res.add('compute', 100000);
    research.purchase('ethical-oversight');
    expect(research.getEffect('resourceCapBonus', 'alignment')).toBeGreaterThan(0);
    expect(bld.totalBuildings()).toBe(0);
    expect(prestige.realignAllowed()).toBe(false);
  });

  it('reports why realign is blocked without ethical oversight', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    expect(bld.totalBuildings()).toBeGreaterThanOrEqual(50);
    expect(research.getEffect('resourceCapBonus', 'alignment')).toBe(0);
    expect(prestige.realignAllowed()).toBe(false);
  });

  it('allows realign with 50+ buildings and ethical oversight', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    res.add('compute', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    research.purchase('ethical-oversight');
    expect(bld.totalBuildings()).toBeGreaterThanOrEqual(50);
    expect(research.getEffect('resourceCapBonus', 'alignment')).toBeGreaterThan(0);
    expect(prestige.realignAllowed()).toBe(true);
  });
});
