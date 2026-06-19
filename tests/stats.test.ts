import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { StatsModule } from '../src/modules/stats/StatsModule';

describe('StatsModule', () => {
  let game: Game;
  let res: ResourcesModule;
  let bld: BuildingsModule;
  let ag: AgentsModule;
  let stats: StatsModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    bld = new BuildingsModule();
    ag = new AgentsModule();
    stats = new StatsModule();
    game.register(res);
    game.register(bld);
    game.register(ag);
    game.register(stats);
    await game.boot();
  });

  it('starts at zero', () => {
    expect(stats.playtimeSeconds).toBe(0);
    expect(stats.totalBuildingsPurchased).toBe(0);
    expect(stats.totalAgentsTrained).toBe(0);
    expect(stats.realignCount).toBe(0);
  });

  it('counts produced resources', () => {
    res.setRate('data', 2);
    res.tick(1);
    // Initial 25 + 2 produced
    expect(res.get('data')).toBe(27);
    expect(stats.lifetimeProduced('data')).toBe(2);
    expect(stats.runProduced('data')).toBe(2);
  });

  it('counts spent resources', () => {
    res.spend({ data: 10 });
    expect(stats.lifetimeSpent('data')).toBe(10);
  });

  it('tracks all-time peak resource amount', () => {
    res.add('data', 50);
    expect(stats.peakResource('data')).toBe(75);
    res.spend({ data: 30 });
    expect(stats.peakResource('data')).toBe(75);
  });

  it('counts building purchases', () => {
    res.add('capital', 100);
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    expect(stats.totalBuildingsPurchased).toBe(2);
    expect(stats.runBuildingsPurchased).toBe(2);
    expect(stats.maxBuildingsOwnedAtOnce).toBe(2);
  });

  it('counts trained agents', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10); // reasoner training time is 8s
    expect(stats.totalAgentsTrained).toBe(1);
    expect(stats.runAgentsTrained).toBe(1);
    expect(stats.maxAgentsOwnedAtOnce).toBe(1);
  });

  it('counts realignments and resets run stats', () => {
    res.add('capital', 1000);
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    bld.purchase('data-mine'); // 5 buildings
    res.add('data', 1000);
    res.add('compute', 1000);
    res.add('capital', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);

    game.bus.emit('prestige:realign', { insightGained: 5, totalInsight: 5 });
    expect(stats.realignCount).toBe(1);
    expect(stats.totalInsightEarned).toBe(5);
    expect(stats.runBuildingsPurchased).toBe(0);
    expect(stats.runAgentsTrained).toBe(0);
    expect(stats.totalBuildingsPurchased).toBe(5); // lifetime keeps
  });

  it('serializes and deserializes', () => {
    res.add('data', 50);
    bld.purchase('data-mine');
    ag.startTraining('reasoner');
    ag.tick(10);
    stats.tick(123);

    const saved = stats.serialize();
    const stats2 = new StatsModule();
    stats2.deserialize(saved);

    expect(stats2.lifetimeProduced('data')).toBeGreaterThan(0);
    expect(stats2.totalBuildingsPurchased).toBe(1);
    expect(stats2.totalAgentsTrained).toBe(1);
    expect(stats2.playtimeSeconds).toBe(123);
  });
});
