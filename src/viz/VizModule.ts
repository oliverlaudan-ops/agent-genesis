/**
 * Viz module — the ISEPS-style particle system.
 *
 * Listens to agent + building events on the bus and renders particle clouds
 * on a single canvas. One cloud per agent archetype; population scales the
 * particle count and cloud size.
 *
 * v0.6 introduces a WebGL renderer. VizModule delegates to either WebGLViz
 * or a Canvas2D fallback while keeping the same public GameModule interface.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { type AgentArchetype, type AgentDef } from '@modules/agents';
import { WebGLViz } from './WebGLViz';

interface Cloud {
  def: AgentDef;
  targetCount: number;
  currentCount: number;
  training: number;
  trainingPhase: number;
}

export class VizModule implements GameModule {
  readonly id = 'viz';

  private renderer: WebGLViz;
  private bus!: Game['bus'];
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLViz(canvas);
    this.resizeHandler = () => this.renderer.resize();
  }

  init(game: Game): void {
    this.bus = game.bus;
    this.renderer.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.renderer.initClouds();

    // React to agent events: bump the target particle count.
    this.bus.on('agent:created', ({ id }) => {
      const cloud = this.renderer.getClouds().get(id as AgentArchetype) as Cloud | undefined;
      if (!cloud) return;
      // 6 particles per agent, capped to keep the canvas sane
      cloud.targetCount = Math.min(600, (cloud.targetCount ?? 0) + 6);
    });

    // Track in-progress training so we can pulse the cloud + draw a
    // progress ring. 0 means idle.
    this.bus.on('agent:trained', ({ id, progress }) => {
      const cloud = this.renderer.getClouds().get(id as AgentArchetype) as Cloud | undefined;
      if (!cloud) return;
      cloud.training = Math.max(0, Math.min(1, progress));
    });

    // Reset clouds when the agent run is reset (e.g. prestige realignment).
    this.bus.on('agents:reset', () => {
      for (const cloud of this.renderer.getClouds().values() as IterableIterator<Cloud>) {
        cloud.targetCount = 0;
        cloud.currentCount = 0;
        cloud.training = 0;
        cloud.trainingPhase = 0;
      }
    });
  }

  tick(_dt: number): void {
    this.renderer.tick(_dt);
  }

  serialize(): unknown {
    const cloudCounts: Partial<Record<AgentArchetype, number>> = {};
    for (const [id, cloud] of this.renderer.getClouds().entries() as IterableIterator<[AgentArchetype, Cloud]>) {
      cloudCounts[id] = cloud.targetCount;
    }
    return { rafOffset: this.renderer.getRafOffset(), cloudCounts };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { rafOffset?: number; cloudCounts?: Partial<Record<AgentArchetype, number>> };
    if (typeof d.rafOffset === 'number') this.renderer.setRafOffset(d.rafOffset);
    if (d.cloudCounts) {
      for (const [id, count] of Object.entries(d.cloudCounts)) {
        const cloud = this.renderer.getClouds().get(id as AgentArchetype) as Cloud | undefined;
        if (cloud && typeof count === 'number') {
          cloud.targetCount = Math.max(0, count);
          // Snap currentCount to target so the cloud doesn't fade in from 0
          // after a reload — players expect to see the same scene they left.
          cloud.currentCount = cloud.targetCount;
        }
      }
    }
  }
}
