import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { BuildingsModule } from '../src/modules/buildings/BuildingsModule';
import { BUILDING_DEFS } from '../src/modules/buildings/BuildingsModule';

describe('BuildingsModule', () => {
  let game: Game;
  let bld: BuildingsModule;
  let res: ResourcesModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    bld = new BuildingsModule();
    game.register(res);
    game.register(bld);
    await game.boot();
  });

  it('starts with zero buildings and zero rates', () => {
    expect(bld.count('data-mine')).toBe(0);
    expect(res.getRate('data')).toBe(0);
  });

  it('purchases a building when affordable', () => {
    const ok = bld.purchase('data-mine');
    expect(ok).toBe(true);
    expect(bld.count('data-mine')).toBe(1);
    // rate is recomputed on next tick; force one:
    bld.tick(0.1);
    expect(res.getRate('data')).toBeGreaterThan(0);
  });

  it('refuses to purchase when broke', () => {
    // Drain capital fully (10 starting + 0 top-up - 10 = 0)
    res.spend({ capital: 10 });
    expect(res.get('capital')).toBe(0);
    const ok = bld.purchase('data-mine');
    expect(ok).toBe(false);
  });

  it('gates unlock-at-3 buildings', () => {
    const lab = BUILDING_DEFS.find((b) => b.id === 'alignment-lab')!;
    expect(bld.isUnlocked(lab)).toBe(false);
    // Top up capital/data so purchases always succeed regardless of starting resources
    res.add('capital', 1000);
    res.add('data', 1000);
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    bld.purchase('data-mine');
    expect(bld.isUnlocked(lab)).toBe(true);
  });

  it('scales cost by costMultiplier', () => {
    bld.purchase('data-mine');
    const secondCost = bld.costFor(BUILDING_DEFS[0]);
    const baseCost = BUILDING_DEFS[0].baseCost.capital!;
    expect(secondCost.capital).toBe(Math.ceil(baseCost * 1.15));
  });

  it('has a VC Fund building that produces capital (closes early-game capital dead-end)', () => {
    const vc = BUILDING_DEFS.find((b) => b.id === 'vc-fund');
    expect(vc).toBeDefined();
    expect(vc!.produces.resourceId).toBe('capital');
    expect(vc!.produces.amount).toBeGreaterThan(0);
    // affordable: needs 20 data, starter has 25
    const ok = bld.purchase('vc-fund');
    expect(ok).toBe(true);
    expect(bld.count('vc-fund')).toBe(1);
    bld.tick(0.1);
    expect(res.getRate('capital')).toBeGreaterThan(0);
  });

  it('scales VC Fund cost by its own costMultiplier', () => {
    bld.purchase('vc-fund');
    const vc = BUILDING_DEFS.find((b) => b.id === 'vc-fund')!;
    const secondCost = bld.costFor(vc);
    expect(secondCost.data).toBe(Math.ceil(vc.baseCost.data! * vc.costMultiplier));
  });
});
