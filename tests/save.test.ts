import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';

describe('SaveManager', () => {
  it('round-trips through JSON', async () => {
    const game = new Game();
    const res = new ResourcesModule();
    game.register(res);
    await game.boot();
    res.add('compute', 123);
    res.setRate('data', 7);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = (game.save as any).snapshot();
    const json = JSON.stringify(blob);
    const restored = JSON.parse(json);

    const game2 = new Game();
    const res2 = new ResourcesModule();
    game2.register(res2);
    await game2.boot();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (game2.save as any).restore(restored);
    expect(res2.get('compute')).toBe(173); // 50 + 123
    expect(res2.getRate('data')).toBe(7);
  });
});
