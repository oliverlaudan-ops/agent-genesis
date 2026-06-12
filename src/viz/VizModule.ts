/**
 * Viz module — the ISEPS-style particle system.
 *
 * Listens to agent + building events on the bus and renders particle clouds
 * on a single canvas. One cloud per agent archetype; population scales the
 * particle count and cloud size.
 *
 * v1 is intentionally vanilla canvas — no WebGL, no shader. Easy to upgrade
 * to WebGL later (one file to swap) without touching gameplay.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { AGENT_DEFS, type AgentArchetype, type AgentDef } from '@modules/agents';

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
}

interface Cloud {
  def: AgentDef;
  particles: Particle[];
  targetCount: number;
  currentCount: number;
  /** 0..1, set by 'agent:trained' events; 0 when idle. */
  training: number;
  /** 0..2π phase, advances while training is active so the pulse looks alive. */
  trainingPhase: number;
}

export class VizModule implements GameModule {
  readonly id = 'viz';

  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private clouds = new Map<AgentArchetype, Cloud>();
  private rafOffset = 0;
  private bus!: Game['bus'];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context not available');
    this.ctx = ctx;
  }

  init(game: Game): void {
    this.bus = game.bus;
    this.resize();
    window.addEventListener('resize', this.resize);

    // Build one cloud per agent archetype, positioned in a circle around center.
    const cx = this.width / 2;
    const cy = this.height / 2;
    const ringRadius = Math.min(this.width, this.height) * 0.28;
    AGENT_DEFS.forEach((def, i) => {
      const angle = (i / AGENT_DEFS.length) * Math.PI * 2;
      this.clouds.set(def.id, {
        def,
        particles: [],
        targetCount: 0,
        currentCount: 0,
        training: 0,
        trainingPhase: 0,
        // store center as a synthetic particle with angle=0; we use a fixed offset
        ...{ cx: cx + Math.cos(angle) * ringRadius, cy: cy + Math.sin(angle) * ringRadius },
      } as Cloud & { cx: number; cy: number });
    });

    // React to agent events: bump the target particle count.
    this.bus.on('agent:created', ({ id }) => {
      const cloud = this.clouds.get(id as AgentArchetype);
      if (!cloud) return;
      // 6 particles per agent, capped to keep the canvas sane
      cloud.targetCount = Math.min(600, (cloud.targetCount ?? 0) + 6);
    });

    // Track in-progress training so we can pulse the cloud + draw a
    // progress ring. 0 means idle.
    this.bus.on('agent:trained', ({ id, progress }) => {
      const cloud = this.clouds.get(id as AgentArchetype);
      if (!cloud) return;
      cloud.training = Math.max(0, Math.min(1, progress));
    });
  }

  tick(_dt: number): void {
    this.rafOffset += _dt;
    // Advance each cloud's training phase so the pulse looks alive.
    // We only tick the phase while training > 0 to save a bit of work
    // when the player is idle.
    for (const cloud of this.clouds.values()) {
      if (cloud.training > 0) cloud.trainingPhase += _dt * 2.2;
    }
    this.draw();
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  };

  private draw(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.width, this.height);

    const t = this.rafOffset;

    for (const cloud of this.clouds.values()) {
      // smoothly grow/shrink the particle pool
      cloud.currentCount += (cloud.targetCount - cloud.currentCount) * 0.05;
      const want = Math.floor(cloud.currentCount);
      while (cloud.particles.length < want) {
        cloud.particles.push(this.spawnParticle(cloud.def));
      }
      if (cloud.particles.length > want) {
        cloud.particles.length = want;
      }

      const c = cloud as Cloud & { cx: number; cy: number };
      // Pulse the cloud while it is training. Adds 0..15% to the visible
      // radius and brightens the glow, fading smoothly when training ends.
      const pulseAmt = cloud.training; // 0..1
      const pulse = 1 + 0.15 * pulseAmt * (0.5 + 0.5 * Math.sin(cloud.trainingPhase));
      const baseSize = cloud.def.baseSize * pulse;
      const pop = want / 6; // 6 particles per agent

      // soft glow background — brighter while training
      const glowAlpha = 0.18 + 0.22 * pulseAmt;
      const grad = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, baseSize + pop * 0.6);
      grad.addColorStop(0, this.withAlpha(cloud.def.color, glowAlpha));
      grad.addColorStop(1, this.withAlpha(cloud.def.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.cx, c.cy, baseSize + pop * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // particles
      for (const p of cloud.particles) {
        const pos = this.positionFor(cloud.def, c.cx, c.cy, baseSize, pop, p, t);
        // Brighten particles during training so the cloud visibly 'wakes up'.
        const a = Math.min(1, p.alpha + 0.3 * pulseAmt);
        ctx.fillStyle = this.withAlpha(cloud.def.color, a);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Progress ring while training. Drawn as a thick stroked arc that
      // grows from 0% to 100% as the agent finishes its training time.
      if (pulseAmt > 0) {
        const ringR = baseSize + pop * 0.6 + 10;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + Math.PI * 2 * pulseAmt;
        ctx.strokeStyle = this.withAlpha(cloud.def.color, 0.85);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(c.cx, c.cy, ringR, startAngle, endAngle);
        ctx.stroke();

        // Trailing dot at the tip of the arc — reinforces the 'something is
        // happening' reading even at a glance.
        const tipX = c.cx + Math.cos(endAngle) * ringR;
        const tipY = c.cy + Math.sin(endAngle) * ringR;
        ctx.fillStyle = this.withAlpha(cloud.def.color, 1);
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // label
      ctx.fillStyle = '#e6e9ef';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const labelY = c.cy + baseSize + pop * 0.6 + 18;
      const baseLabel = `${cloud.def.name} · ${want / 6 | 0}`;
      ctx.fillText(
        pulseAmt > 0 ? `${baseLabel} · training ${(pulseAmt * 100).toFixed(0)}%` : baseLabel,
        c.cx,
        labelY,
      );
    }

    ctx.restore();
  }

  private spawnParticle(_def: AgentDef): Particle {
    return {
      angle: Math.random() * Math.PI * 2,
      radius: Math.random(),
      speed: 0.4 + Math.random() * 0.6,
      size: 1.2 + Math.random() * 1.6,
      alpha: 0.4 + Math.random() * 0.5,
    };
  }

  private positionFor(
    def: AgentDef,
    cx: number,
    cy: number,
    baseSize: number,
    pop: number,
    p: Particle,
    t: number,
  ): { x: number; y: number } {
    const r = baseSize * 0.4 + baseSize * 0.6 * p.radius + pop * 0.4;
    const phase = t * p.speed;
    switch (def.motion) {
      case 'orbit':
        return { x: cx + Math.cos(p.angle + phase) * r, y: cy + Math.sin(p.angle + phase) * r };
      case 'drift':
        return {
          x: cx + Math.cos(p.angle * 2 + phase * 0.5) * r + Math.sin(phase + p.angle) * 4,
          y: cy + Math.sin(p.angle * 3 + phase * 0.3) * r + Math.cos(phase + p.angle) * 4,
        };
      case 'pulse':
        return {
          x: cx + Math.cos(p.angle + phase) * r * (0.7 + 0.3 * Math.sin(phase * 2 + p.angle * 4)),
          y: cy + Math.sin(p.angle + phase) * r * (0.7 + 0.3 * Math.sin(phase * 2 + p.angle * 4)),
        };
      case 'spiral':
        return {
          x: cx + Math.cos(p.angle * 3 + phase) * r * (0.5 + 0.5 * Math.sin(p.angle + phase * 0.5)),
          y: cy + Math.sin(p.angle * 3 + phase) * r * (0.5 + 0.5 * Math.cos(p.angle + phase * 0.5)),
        };
    }
  }

  private withAlpha(hex: string, alpha: number): string {
    const a = Math.max(0, Math.min(1, alpha));
    return `${hex}${Math.floor(a * 255)
      .toString(16)
      .padStart(2, '0')}`;
  }

  serialize(): unknown {
    return { rafOffset: this.rafOffset };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { rafOffset?: number };
    if (typeof d.rafOffset === 'number') this.rafOffset = d.rafOffset;
  }
}
