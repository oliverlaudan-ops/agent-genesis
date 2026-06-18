import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { ResearchModule } from '../src/modules/research/ResearchModule';
import { PrestigeModule } from '../src/modules/prestige/PrestigeModule';

describe('PrestigeModule', () => {
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

  it('starts with zero insight', () => {
    expect(prestige.insight()).toBe(0);
    expect(prestige.globalProductionMult()).toBe(1);
  });

  it('does not allow realignment before requirements are met', () => {
    expect(prestige.realignAllowed()).toBe(false);
    expect(prestige.performRealign()).toBe(false);
  });

  it('allows realignment once requirements are met and grants insight', () => {
    // Buy 50 cheap buildings.
    res.add('capital', 100000);
    res.add('data', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    expect(bld.totalBuildings()).toBeGreaterThanOrEqual(50);

    // Buy a rank of Ethical Oversight to raise the alignment cap.
    res.add('compute', 100000);
    research.purchase('ethical-oversight');
    expect(research.getEffect('resourceCapBonus', 'alignment')).toBeGreaterThan(0);

    expect(prestige.realignAllowed()).toBe(true);
    const gained = prestige.insightGainedOnRealign();
    expect(gained).toBeGreaterThan(0);

    const ok = prestige.performRealign();
    expect(ok).toBe(true);
    expect(prestige.insight()).toBe(gained);
  });

  it('resets run state on realignment while keeping insight', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    res.add('compute', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    research.purchase('ethical-oversight');

    // Buy an agent to make the reset observable.
    ag.startTraining('reasoner');
    ag.tick(10);
    expect(ag.totalPopulation()).toBeGreaterThan(0);

    prestige.performRealign();

    expect(bld.totalBuildings()).toBe(0);
    expect(ag.totalPopulation()).toBe(0);
    expect(research.totalRanks()).toBe(0);
    expect(prestige.insight()).toBeGreaterThan(0);
  });

  it('applies a global production multiplier based on insight', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    res.add('compute', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    research.purchase('ethical-oversight');
    prestige.performRealign();

    const insight = prestige.insight();
    expect(prestige.globalProductionMult()).toBe(1 + insight * 0.02);
  });

  it('head-start bonus scales with insight', () => {
    res.add('capital', 100000);
    res.add('data', 100000);
    res.add('compute', 100000);
    for (let i = 0; i < 50; i++) {
      bld.purchase('data-mine');
    }
    research.purchase('ethical-oversight');
    prestige.performRealign();

    const bonus = prestige.headStartBonus();
    expect(bonus.data).toBeGreaterThanOrEqual(0);
    expect(bonus.compute).toBeGreaterThanOrEqual(0);
  });
});
