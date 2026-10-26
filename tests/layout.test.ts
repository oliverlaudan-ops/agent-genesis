import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/core/Game';
import type { VizModule } from '../src/viz/VizModule';

describe('Desktop/mobile layout transitions', () => {
  let breakpoint: EventTarget & { matches: boolean };
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    breakpoint = Object.assign(new EventTarget(), { matches: false });
    document.body.innerHTML = '<div id="app"><div id="game-root"></div></div><span id="tick-rate"></span><span id="save-status"></span>';
    vi.stubGlobal('matchMedia', vi.fn((query: string) => query.includes('900px') ? breakpoint : { matches: false }));
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    game?.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function boot(contextAvailable: boolean) {
    const ctx = new Proxy({}, {
      get: (_target, key) => key === 'createRadialGradient'
        ? () => ({ addColorStop: () => {} })
        : () => {},
    }) as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((kind: string) => kind === '2d' && contextAvailable ? ctx : null) as HTMLCanvasElement['getContext'],
    );
    const { Game } = await import('../src/core/Game');
    const register = vi.spyOn(Game.prototype, 'register');
    await import('../src/main');
    game = register.mock.instances[0];
    return { register, viz: game.modules.get('viz') as VizModule };
  }

  function changeLayout(mobile: boolean) {
    breakpoint.matches = mobile;
    breakpoint.dispatchEvent(Object.assign(new Event('change'), { matches: mobile }));
  }

  it.each([true, false])('keeps the renderer, progress and game running through repeated changes (2D available: %s)', async (contextAvailable) => {
    const { register, viz } = await boot(contextAvailable);
    game.bus.emit('agent:created', { id: 'reasoner', count: 1 });
    game.bus.emit('agent:trained', { id: 'reasoner', progress: 0.4 });
    viz.tick(0.1);
    const canvas = document.querySelector('canvas');
    const state = JSON.stringify([...game.modules].map(([id, module]) => [id, module.serialize()]));
    const raf = vi.mocked(requestAnimationFrame);

    for (const mobile of [true, false, true, false]) {
      changeLayout(mobile);
      expect(document.querySelector('canvas')).toBe(canvas);
      expect(canvas?.isConnected).toBe(true);
      expect(game.modules.get('viz')).toBe(viz);
      expect(JSON.stringify([...game.modules].map(([id, module]) => [id, module.serialize()]))).toBe(state);
      expect(document.getElementById(mobile ? 'tabbed-panel' : 'left-panel')).not.toBeNull();
      expect(document.getElementById('save-status')?.textContent).not.toContain('Error');
    }
    expect(register.mock.calls.filter(([module]) => module.id === 'viz')).toHaveLength(1);
    expect(raf).toHaveBeenCalledTimes(5); // boot + four successful restarts
    // Event subscriptions survive and are not duplicated by layout changes.
    game.bus.emit('agent:created', { id: 'reasoner', count: 2 });
    expect((viz.serialize() as { cloudCounts: Record<string, number> }).cloudCounts.reasoner).toBe(12);
  });
});
