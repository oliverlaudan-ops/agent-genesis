/**
 * WebGL-based particle renderer for the agent visualization.
 *
 * Tries to use WebGL first; if that fails at any step, falls back to the
 * Canvas2D renderer transparently.
 *
 * The vertex shader owns the four motion patterns (orbit, drift, pulse,
 * spiral).  JavaScript only uploads per-particle attributes and per-cloud
 * uniforms.
 */
import { AGENT_DEFS, type AgentArchetype, type AgentDef } from '@modules/agents';
import { FallbackCanvasViz } from './fallbackCanvasViz';
import { vertexShaderSource, fragmentShaderSource } from './shaders';

const MOTION_INDEX: Record<AgentDef['motion'], number> = {
  orbit: 0,
  drift: 1,
  pulse: 2,
  spiral: 3,
};

export interface Cloud {
  def: AgentDef;
  cx: number;
  cy: number;
  targetCount: number;
  currentCount: number;
  /** 0..1, set by 'agent:trained' events; 0 when idle. */
  training: number;
  /** 0..2π phase, advances while training is active so the pulse looks alive. */
  trainingPhase: number;
}

interface ParticleState {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  alpha: number;
}

interface WebGLProgramInfo {
  program: WebGLProgram;
  attribLocations: {
    aAngle: number;
    aRadius: number;
    aSpeed: number;
    aSize: number;
    aAlpha: number;
    aMotion: number;
    aColor: number;
  };
  uniformLocations: {
    uCenter: WebGLUniformLocation | null;
    uResolution: WebGLUniformLocation | null;
    uTime: WebGLUniformLocation | null;
    uBaseSize: WebGLUniformLocation | null;
    uPopulation: WebGLUniformLocation | null;
    uTrainingPulse: WebGLUniformLocation | null;
  };
}

interface WebGLBuffers {
  angle: WebGLBuffer;
  radius: WebGLBuffer;
  speed: WebGLBuffer;
  size: WebGLBuffer;
  alpha: WebGLBuffer;
  motion: WebGLBuffer;
  color: WebGLBuffer;
}

/**
 * Internal WebGL renderer. If WebGL is unavailable or shader compilation
 * fails, this class throws; the caller should then instantiate
 * FallbackCanvasViz instead.
 */
class WebGLRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private programInfo: WebGLProgramInfo;
  private buffers: WebGLBuffers;
  private rafOffset = 0;
  private clouds = new Map<AgentArchetype, Cloud>();
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;

    const program = this.createProgram();
    if (!program) throw new Error('Failed to compile WebGL shaders');

    this.programInfo = {
      program,
      attribLocations: {
        aAngle: gl.getAttribLocation(program, 'aAngle'),
        aRadius: gl.getAttribLocation(program, 'aRadius'),
        aSpeed: gl.getAttribLocation(program, 'aSpeed'),
        aSize: gl.getAttribLocation(program, 'aSize'),
        aAlpha: gl.getAttribLocation(program, 'aAlpha'),
        aMotion: gl.getAttribLocation(program, 'aMotion'),
        aColor: gl.getAttribLocation(program, 'aColor'),
      },
      uniformLocations: {
        uCenter: gl.getUniformLocation(program, 'uCenter'),
        uResolution: gl.getUniformLocation(program, 'uResolution'),
        uTime: gl.getUniformLocation(program, 'uTime'),
        uBaseSize: gl.getUniformLocation(program, 'uBaseSize'),
        uPopulation: gl.getUniformLocation(program, 'uPopulation'),
        uTrainingPulse: gl.getUniformLocation(program, 'uTrainingPulse'),
      },
    };

    this.buffers = this.createBuffers();
    this.resize();
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
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(1, Math.floor(rect.width * this.dpr));
    const nextHeight = Math.max(1, Math.floor(rect.height * this.dpr));

    // Avoid touching the canvas size if nothing changed; resetting the
    // dimensions on mobile can destroy/recreate the WebGL context.
    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) return;

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.width = rect.width;
    this.height = rect.height;

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.initClouds();
  }

  initClouds(): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const ringRadius = Math.min(this.width, this.height) * 0.28;
    this.clouds.clear();
    AGENT_DEFS.forEach((def, i) => {
      const angle = (i / AGENT_DEFS.length) * Math.PI * 2;
      this.clouds.set(def.id, {
        def,
        cx: cx + Math.cos(angle) * ringRadius,
        cy: cy + Math.sin(angle) * ringRadius,
        targetCount: 0,
        currentCount: 0,
        training: 0,
        trainingPhase: 0,
      });
    });
  }

  advanceTrainingPhase(dt: number): void {
    for (const cloud of this.clouds.values()) {
      if (cloud.training > 0) cloud.trainingPhase += dt * 2.2;
    }
  }

  tick(dt: number): void {
    this.rafOffset += dt;
    this.advanceTrainingPhase(dt);
    this.draw();
  }

  private draw(): void {
    if (this.gl.isContextLost()) {
      throw new Error('WebGL context lost');
    }

    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.useProgram(this.programInfo.program);
    gl.uniform1f(this.programInfo.uniformLocations.uTime, this.rafOffset);
    gl.uniform2f(this.programInfo.uniformLocations.uResolution, this.width, this.height);

    for (const cloud of this.clouds.values()) {
      cloud.currentCount += (cloud.targetCount - cloud.currentCount) * 0.05;
      const want = Math.floor(cloud.currentCount);
      if (want <= 0) continue;

      const pulseAmt = cloud.training;
      const pulse = 1 + 0.15 * pulseAmt * (0.5 + 0.5 * Math.sin(cloud.trainingPhase));
      const baseSize = cloud.def.baseSize * pulse;
      const pop = want / 6;

      this.drawCloud(cloud, want, baseSize, pop);
    }

    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      // Log once per error type; some mobile drivers report benign warnings.
      console.warn('[WebGLViz] draw GL error:', err);
    }
  }

  private drawCloud(cloud: Cloud, count: number, baseSize: number, pop: number): void {
    const gl = this.gl;
    const motion = MOTION_INDEX[cloud.def.motion];
    const color = this.hexToRgb(cloud.def.color);

    const angles = new Float32Array(count);
    const radii = new Float32Array(count);
    const speeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const motions = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const p = this.spawnParticle(cloud.def, cloud.training);
      angles[i] = p.angle;
      radii[i] = p.radius;
      speeds[i] = p.speed;
      sizes[i] = p.size;
      alphas[i] = p.alpha;
      motions[i] = motion;
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }

    this.setBuffer(this.buffers.angle, angles, this.programInfo.attribLocations.aAngle, 1);
    this.setBuffer(this.buffers.radius, radii, this.programInfo.attribLocations.aRadius, 1);
    this.setBuffer(this.buffers.speed, speeds, this.programInfo.attribLocations.aSpeed, 1);
    this.setBuffer(this.buffers.size, sizes, this.programInfo.attribLocations.aSize, 1);
    this.setBuffer(this.buffers.alpha, alphas, this.programInfo.attribLocations.aAlpha, 1);
    this.setBuffer(this.buffers.motion, motions, this.programInfo.attribLocations.aMotion, 1);
    this.setBuffer(this.buffers.color, colors, this.programInfo.attribLocations.aColor, 3);

    gl.uniform2f(this.programInfo.uniformLocations.uCenter, cloud.cx, cloud.cy);
    gl.uniform2f(this.programInfo.uniformLocations.uResolution, this.width, this.height);
    gl.uniform1f(this.programInfo.uniformLocations.uBaseSize, baseSize);
    gl.uniform1f(this.programInfo.uniformLocations.uPopulation, pop);
    gl.uniform1f(this.programInfo.uniformLocations.uTrainingPulse, pulseAmtForCloud(cloud));

    gl.drawArrays(gl.POINTS, 0, count);
  }

  private setBuffer(
    buffer: WebGLBuffer,
    data: Float32Array,
    location: number,
    size: number,
  ): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    if (location >= 0) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }
  }

  private spawnParticle(_def: AgentDef, _training: number): ParticleState {
    return {
      angle: Math.random() * Math.PI * 2,
      radius: Math.random(),
      speed: 0.4 + Math.random() * 0.6,
      size: 1.2 + Math.random() * 1.6,
      alpha: 0.4 + Math.random() * 0.5,
    };
  }

  private hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const int = parseInt(clean, 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
  }

  private createProgram(): WebGLProgram | null {
    const gl = this.gl;
    const vs = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fs = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[WebGLViz] program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  private compileShader(source: string, type: number): WebGLShader | null {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[WebGLViz] shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createBuffers(): WebGLBuffers {
    const gl = this.gl;
    const create = () => {
      const b = gl.createBuffer();
      if (!b) throw new Error('Failed to create WebGL buffer');
      return b;
    };
    return {
      angle: create(),
      radius: create(),
      speed: create(),
      size: create(),
      alpha: create(),
      motion: create(),
      color: create(),
    };
  }
}

function pulseAmtForCloud(cloud: Cloud): number {
  return cloud.training;
}

/**
 * Public WebGL visualization entry point.
 *
 * Tries to use WebGL first; if that fails at any step, falls back to the
 * Canvas2D renderer transparently.
 */
export class WebGLViz {
  readonly id = 'viz';
  private canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | FallbackCanvasViz;
  private fallbackActivated = false;

  constructor(canvas: HTMLCanvasElement, preferFallback = false) {
    this.canvas = canvas;
    if (preferFallback) {
      console.info('[WebGLViz] touch/mobile device detected, using Canvas2D renderer');
      this.renderer = new FallbackCanvasViz(canvas);
      this.fallbackActivated = true;
      return;
    }

    try {
      this.renderer = new WebGLRenderer(canvas);
      this.attachContextListeners();
    } catch (err) {
      console.warn('[WebGLViz] WebGL initialization failed, falling back to Canvas2D:', err);
      this.renderer = new FallbackCanvasViz(canvas);
      this.fallbackActivated = true;
    }
  }

  private attachContextListeners(): void {
    this.canvas.addEventListener('webglcontextlost', () => {
      console.warn('[WebGLViz] WebGL context lost; switching to Canvas2D fallback');
      this.activateFallback();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[WebGLViz] WebGL context restored, but staying on Canvas2D for stability');
    });
  }

  private activateFallback(): void {
    if (this.fallbackActivated) return;
    this.fallbackActivated = true;
    const offset = this.renderer.getRafOffset();
    const clouds = this.renderer.getClouds();
    this.renderer = new FallbackCanvasViz(this.canvas);
    this.renderer.setRafOffset(offset);
    // Carry over current cloud counts so the switch is seamless.
    const targetMap = new Map<AgentArchetype, number>();
    for (const [id, cloud] of clouds) {
      targetMap.set(id, cloud.targetCount);
    }
    this.renderer.initClouds();
    for (const [id, cloud] of this.renderer.getClouds()) {
      cloud.targetCount = targetMap.get(id) ?? 0;
      cloud.currentCount = cloud.targetCount;
    }
  }

  getClouds(): ReadonlyMap<AgentArchetype, Cloud> {
    return this.renderer.getClouds();
  }

  getRafOffset(): number {
    return this.renderer.getRafOffset();
  }

  setRafOffset(value: number): void {
    this.renderer.setRafOffset(value);
  }

  resize(): void {
    this.renderer.resize();
  }

  initClouds(): void {
    this.renderer.initClouds();
  }

  tick(dt: number): void {
    try {
      this.renderer.tick(dt);
    } catch (err) {
      if (this.renderer instanceof WebGLRenderer) {
        console.warn('[WebGLViz] draw/runtime error, falling back to Canvas2D:', err);
        this.activateFallback();
        this.renderer.tick(dt);
      } else {
        throw err;
      }
    }
  }

  /**
   * True when the fallback Canvas2D renderer is active (WebGL unavailable or failed).
   */
  isFallback(): boolean {
    return this.fallbackActivated || this.renderer instanceof FallbackCanvasViz;
  }
}
