import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { StatsModule } from '../src/modules/stats/StatsModule';
import { AchievementsModule, ACHIEVEMENT_DEFS } from '../src/modules/achievements/AchievementsModule';

describe('AchievementsModule', () => {
  let game: Game;
  let res: ResourcesModule;
  let bld: BuildingsModule;
  let ag: AgentsModule;
  let stats: StatsModule;
  let ach: AchievementsModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    bld = new BuildingsModule();
    ag = new AgentsModule();
    stats = new StatsModule();
    ach = new AchievementsModule();
    game.register(res);
    game.register(bld);
    game.register(ag);
    game.register(stats);
    game.register(ach);
    await game.boot();
  });

  it('starts with no achievements unlocked', () => {
    expect(ach.isUnlocked('first-steps')).toBe(false);
    expect(ach.bonusFor('trainingSpeed')).toBe(1);
  });

  it('unlocks First Steps when training an agent', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);
    ach.tick();
    expect(ach.isUnlocked('first-steps')).toBe(true);
    expect(ach.bonusFor('trainingSpeed')).toBe(1.02);
  });

  it('unlocks Data Miner when owning 5 data mines', () => {
    res.add('capital', 1000);
    for (let i = 0; i < 5; i++) bld.purchase('data-mine');
    ach.tick();
    expect(ach.isUnlocked('data-miner')).toBe(true);
    expect(ach.bonusFor('resourceRate', 'data')).toBe(1.05);
    expect(ach.bonusFor('resourceRate', 'capital')).toBe(1);
  });

  it('unlocks Compute Rush when reaching 100 compute', () => {
    res.add('compute', 150);
    ach.tick();
    expect(ach.isUnlocked('compute-rush')).toBe(true);
    expect(ach.bonusFor('resourceRate', 'compute')).toBe(1.05);
  });

  it('emits achievement:unlocked event', () => {
    const events: Array<{ id: string; name: string }> = [];
    game.bus.on('achievement:unlocked', (e) => events.push(e));
    res.add('compute', 150);
    ach.tick();
    expect(events).toContainEqual({ id: 'compute-rush', name: 'Compute Rush' });
  });

  it('ignores bogus ids on deserialize', () => {
    ach.deserialize({ unlocked: ['compute-rush', 'not-real'] });
    expect(ach.isUnlocked('compute-rush')).toBe(true);
    expect(ach.isUnlocked('not-real')).toBe(false);
  });

  it('all achievement conditions reference valid stats or modules', () => {
    for (const def of ACHIEVEMENT_DEFS) {
      expect(typeof def.condition(stats, game)).toBe('boolean');
    }
  });
});
