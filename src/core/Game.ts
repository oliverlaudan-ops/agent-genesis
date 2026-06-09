/**
 * Game orchestrator.
 *
 * Owns the module registry, the bus, the save manager, and the tick loop.
 * Modules are completely independent — they communicate only via the bus.
 */
import { Bus } from './Bus';
import { SaveManager } from './SaveManager';
import type { GameModule } from './GameModule';

const AUTO_SAVE_INTERVAL_MS = 15_000;

export class Game {
  readonly bus = new Bus();
  readonly modules = new Map<string, GameModule>();
  readonly save: SaveManager;

  private running = false;
  private lastTick = 0;
  private rafId = 0;
  private lastAutoSave = 0;
  private booted = false;

  constructor() {
    this.save = new SaveManager(this);
  }

  register(module: GameModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`Module "${module.id}" already registered`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  /** Boot all modules, then attempt to load from localStorage. */
  async boot(): Promise<void> {
    if (this.booted) return;
    for (const m of this.modules.values()) {
      await m.init(this);
    }
    this.save.loadLocal();
    this.booted = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dtMs = now - this.lastTick;
      this.lastTick = now;
      const dt = Math.min(dtMs / 1000, 0.1); // cap to 100ms so a tab switch doesn't explode the world
      this.tick(dt);

      if (now - this.lastAutoSave > AUTO_SAVE_INTERVAL_MS) {
        this.save.saveLocal();
        this.lastAutoSave = now;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick(dt: number): void {
    for (const m of this.modules.values()) {
      try {
        m.tick(dt);
      } catch (err) {
        console.error(`[tick] module "${m.id}" threw:`, err);
      }
    }
    this.bus.emit('tick', dt);
  }

  /** Manually trigger a save (e.g. on user click of "Save" button). */
  saveNow(): boolean {
    const ok = this.save.saveLocal();
    this.bus.emit('save', undefined);
    return ok;
  }
}
