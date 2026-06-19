import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { EpochModule, EPOCH_ARCHETYPES } from '../src/modules/epoch';

describe('EpochModule', () => {
  let game: Game;
  let res: ResourcesModule;
  let ag: AgentsModule;
  let ep: EpochModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    ag = new AgentsModule();
    ep = new EpochModule();
    game.register(res);
    game.register(ag);
    game.register(ep);
    await game.boot();
  });

  it('starts at zero progress and epochs', () => {
    for (const archetype of EPOCH_ARCHETYPES) {
      expect(ep.progressFor(archetype)).toBe(0);
      expect(ep.countFor(archetype)).toBe(0);
    }
  });

  it('does not advance without trained population', () => {
    ep.tick(10);
    for (const archetype of EPOCH_ARCHETYPES) {
      expect(ep.progressFor(archetype)).toBe(0);
    }
  });

  it('advances progress for an archetype with population', () => {
    // Train a reasoner directly by advancing AgentsModule.
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10); // finish training

    const before = ep.progressFor('reasoner');
    ep.tick(1);
    const after = ep.progressFor('reasoner');
    expect(after).toBeGreaterThan(before);
  });

  it('completes an epoch when progress reaches 1.0', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);

    const events: Array<{ archetype: string; count: number }> = [];
    game.bus.on('epoch:completed', (e) => events.push(e));

    // Rate with one reasoner = (1/10)^0.8 ≈ 0.1585/sec. ~6.3s to fill.
    ep.tick(10);
    expect(ep.countFor('reasoner')).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.archetype === 'reasoner' && e.count >= 1)).toBe(true);
  });

  it('applies reasoner compute bonus', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);
    ep.tick(10);
    const reasonerBonus = ep.bonusFor('agentBoost', 'compute');
    expect(reasonerBonus).toBeGreaterThan(1);
    expect(reasonerBonus).toBeCloseTo(1 + 0.01 * ep.countFor('reasoner'), 5);
  });

  it('applies coder capital bonus', () => {
    res.add('compute', 1000);
    res.add('data', 1000);
    ag.startTraining('coder');
    ag.tick(15);
    ep.tick(10);
    const coderBonus = ep.bonusFor('agentBoost', 'capital');
    expect(coderBonus).toBeGreaterThan(1);
  });

  it('applies vision alignment cap bonus', () => {
    res.add('compute', 1000);
    res.add('data', 1000);
    ag.startTraining('vision');
    ag.tick(25);
    ep.tick(20);
    const capBonus = ep.alignmentCapBonus();
    expect(capBonus).toBeGreaterThan(0);
    expect(capBonus).toBeCloseTo(0.005 * ep.countFor('vision'), 5);
    expect(res.getCapBonus('alignment')).toBeCloseTo(capBonus, 5);
  });

  it('applies planner global agent boost', () => {
    res.add('compute', 5000);
    res.add('data', 5000);
    res.add('capital', 5000);
    ag.startTraining('planner');
    ag.tick(35);
    ep.tick(20);
    const globalBonus = ep.bonusFor('globalAgentBoost');
    expect(globalBonus).toBeGreaterThan(1);
  });

  it('resets progress, counts, and bonuses on prestige:realign', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);
    ep.tick(20);
    expect(ep.countFor('reasoner')).toBeGreaterThan(0);

    game.bus.emit('prestige:realign', { insightGained: 1, totalInsight: 1 });

    for (const archetype of EPOCH_ARCHETYPES) {
      expect(ep.progressFor(archetype)).toBe(0);
      expect(ep.countFor(archetype)).toBe(0);
    }
    expect(ep.bonusFor('agentBoost', 'compute')).toBe(1);
    expect(ep.alignmentCapBonus()).toBe(0);
    expect(res.getCapBonus('alignment')).toBe(0);
  });

  it('publishes epoch:progress events', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);

    const events: Array<{ archetype: string; progress: number }> = [];
    game.bus.on('epoch:progress', (e) => events.push(e));
    ep.tick(1);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].archetype).toBe('reasoner');
  });

  it('serializes and restores state', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);
    ep.tick(20);

    const save = ep.serialize() as {
      progress: Record<string, number>;
      epochs: Record<string, number>;
    };
    expect(save.progress.reasoner).toBeGreaterThanOrEqual(0);
    expect(save.epochs.reasoner).toBeGreaterThanOrEqual(1);

    const fresh = new EpochModule();
    fresh.deserialize(save);
    expect(fresh.progressFor('reasoner')).toBe(save.progress.reasoner);
    expect(fresh.countFor('reasoner')).toBe(save.epochs.reasoner);
  });
});
