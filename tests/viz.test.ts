import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { VizModule } from '../src/viz/VizModule';
import type { AgentArchetype } from '../src/modules/agents';

function makeCanvas(): HTMLCanvasElement {
  // jsdom doesn't provide CanvasRenderingContext2D by default, so stub it.
  // The viz module throws in its constructor if getContext('2d') returns null,
  // so we satisfy that without exercising any of the drawing code.
  const noopCtx = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'canvas') return null;
        if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement('canvas');
  // jsdom's HTMLCanvasElement.prototype.getContext normally returns null;
  // we override per-instance.
  (canvas as unknown as { getContext: (id: string) => CanvasRenderingContext2D | null }).getContext =
    (id: string) => (id === '2d' ? noopCtx : null);
  return canvas;
}

describe('VizModule persistence', () => {
  let game: Game;
  let agents: AgentsModule;
  let viz: VizModule;

  beforeEach(async () => {
    game = new Game();
    const res = new ResourcesModule();
    agents = new AgentsModule();
    viz = new VizModule(makeCanvas());
    game.register(res);
    game.register(agents);
    game.register(viz);
    await game.boot();
  });

  it('serializes cloud target counts per archetype', () => {
    // Train one reasoner to completion so cloud.targetCount becomes 6.
    // We bypass the timer by emitting the bus event the trainer would
    // emit on completion.
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 1 });

    const blob = viz.serialize() as { cloudCounts: Record<string, number> };
    expect(blob.cloudCounts.reasoner).toBe(6);
    expect(blob.cloudCounts.coder).toBe(0);
  });

  it('restores cloud target counts on deserialize (regression: viz reset to 0 on reload)', async () => {
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 1 });
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 2 });
    game.bus.emit('agent:created', { id: 'coder' as AgentArchetype, count: 1 });

    // Round-trip through SaveManager (this is what happens on a reload).
    const snap = (game.save as unknown as { snapshot: () => unknown }).snapshot();
    const json = JSON.stringify(snap);
    const restored = JSON.parse(json) as { modules: Record<string, unknown> };

    const game2 = new Game();
    const viz2 = new VizModule(makeCanvas());
    game2.register(new ResourcesModule());
    game2.register(new AgentsModule());
    game2.register(viz2);
    await game2.boot();
    (game2.save as unknown as { restore: (b: unknown) => void }).restore(restored);

    const blob2 = viz2.serialize() as { cloudCounts: Record<string, number> };
    expect(blob2.cloudCounts.reasoner).toBe(12); // 2 trains × 6 particles
    expect(blob2.cloudCounts.coder).toBe(6);
    expect(blob2.cloudCounts.vision).toBe(0);
    expect(blob2.cloudCounts.planner).toBe(0);
  });

  it('handles missing viz slice in v1 saves (backward compatible)', () => {
    // Simulate a v1 save blob (no viz module) being restored into a v2 game.
    const v1Blob = {
      v: 1,
      savedAt: new Date().toISOString(),
      modules: {
        resources: { amounts: { compute: 50, data: 25, capital: 10, alignment: 0.5 } },
        buildings: { counts: {} },
        agents: { population: { reasoner: 0, coder: 0, vision: 0, planner: 0 } },
      },
    };
    expect(() =>
      (game.save as unknown as { restore: (b: unknown) => void }).restore(v1Blob),
    ).not.toThrow();
    // Viz stays at zero — the player just sees an empty cloud until they
    // train the first agent of each archetype.
    const blob = viz.serialize() as { cloudCounts: Record<string, number> };
    expect(blob.cloudCounts.reasoner).toBe(0);
  });
});
