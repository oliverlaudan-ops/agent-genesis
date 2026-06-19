/**
 * Null renderer — last-resort fallback when neither WebGL nor Canvas2D is
 * available on the device. Keeps the same public interface as WebGLViz
 * and FallbackCanvasViz so VizModule can still track cloud state and the
 * game remains playable even without visuals.
 */
import { AGENT_DEFS, type AgentArchetype, type AgentDef } from '@modules/agents';

interface Cloud {
  def: AgentDef;
  targetCount: number;
  currentCount: number;
  training: number;
  trainingPhase: number;
  cx: number;
  cy: number;
}

export class NullViz {
  readonly id = 'viz';
  private clouds = new Map<AgentArchetype, Cloud>();
  private rafOffset = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.initClouds();
  }

  getClouds(): ReadonlyMap<AgentArchetype, Cloud> {
    return this.clouds;
  }

  getRafOffset(): number {
    return this.rafOffset;
  }

  setRafOffset(value: number): void {
    this.rafOffset = value;
  }

  resize(): void {
    // No-op: we have no surface to resize.
  }

  initClouds(): void {
    const cx = this.canvas.clientWidth / 2 || 150;
    const cy = this.canvas.clientHeight / 2 || 150;
    const ringRadius = Math.min(cx, cy) * 0.28;
    this.clouds.clear();
    AGENT_DEFS.forEach((def, i) => {
      const angle = (i / AGENT_DEFS.length) * Math.PI * 2;
      this.clouds.set(def.id, {
        def,
        targetCount: 0,
        currentCount: 0,
        training: 0,
        trainingPhase: 0,
        cx: cx + Math.cos(angle) * ringRadius,
        cy: cy + Math.sin(angle) * ringRadius,
      });
    });
  }

  tick(_dt: number): void {
    // No-op render. Keep currentCount in sync with target so the rest of
    // the game behaves consistently.
    for (const cloud of this.clouds.values()) {
      cloud.currentCount = cloud.targetCount;
    }
  }

  isFallback(): boolean {
    return true;
  }
}
