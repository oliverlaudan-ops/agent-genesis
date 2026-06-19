import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { VizModule } from '../src/viz/VizModule';
import { WebGLViz } from '../src/viz/WebGLViz';
import { FallbackCanvasViz } from '../src/viz/fallbackCanvasViz';
import type { AgentArchetype } from '../src/modules/agents';

function makeNoopCanvas2D(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'canvas') return null;
        if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  (canvas as unknown as { getContext: (id: string) => CanvasRenderingContext2D | null }).getContext =
    (id: string) => (id === '2d' ? makeNoopCanvas2D() : null);
  return canvas;
}

describe('WebGL viz scaffolding', () => {
  it('WebGLViz falls back to Canvas2D when WebGL context is unavailable', () => {
    const canvas = makeCanvas();
    const viz = new WebGLViz(canvas);
    expect(viz.isFallback()).toBe(true);
    expect((viz as unknown as { renderer: unknown }).renderer).toBeInstanceOf(FallbackCanvasViz);
  });

  it('VizModule instantiates even when the canvas has no WebGL context', async () => {
    const canvas = makeCanvas();
    const module = new VizModule(canvas);
    expect(module.id).toBe('viz');

    const game = new Game();
    game.register(new ResourcesModule());
    game.register(new AgentsModule());
    game.register(module);
    await game.boot();

    expect((module as unknown as { renderer: WebGLViz }).renderer.isFallback()).toBe(true);
  });

  it('activates fallback renderer on missing WebGL', () => {
    const canvas = makeCanvas();
    const webglViz = new WebGLViz(canvas);
    webglViz.resize();
    webglViz.initClouds();
    expect(webglViz.isFallback()).toBe(true);
    expect(webglViz.getClouds().size).toBe(4); // reasoner, coder, vision, planner
  });

  it('keeps the same public interface after fallback activation', () => {
    const canvas = makeCanvas();
    const webglViz = new WebGLViz(canvas);
    expect(typeof webglViz.tick).toBe('function');
    expect(typeof webglViz.resize).toBe('function');
    expect(typeof webglViz.initClouds).toBe('function');
  });
});

describe('VizModule persistence with WebGL scaffolding', () => {
  let game: Game;
  let viz: VizModule;

  beforeEach(async () => {
    game = new Game();
    viz = new VizModule(makeCanvas());
    game.register(new ResourcesModule());
    game.register(new AgentsModule());
    game.register(viz);
    await game.boot();
  });

  it('serializes cloud target counts per archetype', () => {
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 1 });
    const blob = viz.serialize() as { cloudCounts: Record<string, number> };
    expect(blob.cloudCounts.reasoner).toBe(6);
    expect(blob.cloudCounts.coder).toBe(0);
  });

  it('deserializes cloud target counts and restores them', async () => {
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 1 });
    game.bus.emit('agent:created', { id: 'reasoner' as AgentArchetype, count: 2 });
    game.bus.emit('agent:created', { id: 'coder' as AgentArchetype, count: 1 });

    const blob = viz.serialize() as { cloudCounts: Record<string, number> };
    const serialized = JSON.stringify(blob);
    const restored = JSON.parse(serialized) as { cloudCounts: Record<string, number>; rafOffset: number };

    const game2 = new Game();
    const viz2 = new VizModule(makeCanvas());
    game2.register(new ResourcesModule());
    game2.register(new AgentsModule());
    game2.register(viz2);
    await game2.boot();
    viz2.deserialize(restored);

    const blob2 = viz2.serialize() as { cloudCounts: Record<string, number> };
    expect(blob2.cloudCounts.reasoner).toBe(12);
    expect(blob2.cloudCounts.coder).toBe(6);
    expect(blob2.cloudCounts.vision).toBe(0);
    expect(blob2.cloudCounts.planner).toBe(0);
  });
});
