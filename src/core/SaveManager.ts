/**
 * Save / Load system.
 *
 * v1: localStorage (fast, simple, 5–10MB limit per origin — plenty for now).
 * Plus JSON export/import for cross-device moves and backups.
 *
 * Save format is a single versioned blob:
 *   v1: { v: 1, savedAt, modules: { resources, buildings, agents } }
 *   v2: adds 'viz' to modules (cloud particle counts per archetype)
 *
 * Each module owns its own slice via `serialize()` / `deserialize()`. The
 * SaveManager just shuttles bytes in and out.
 */
import type { Game } from './Game';

const STORAGE_KEY = 'agent-genesis:save:v1';
const CURRENT_VERSION = 2 as const;

export interface SaveBlob {
  v: number;
  savedAt: string;
  modules: Record<string, unknown>;
}

export class SaveManager {
  constructor(private game: Game) {}

  /** Collect every registered module's serializable state. */
  private snapshot(): SaveBlob {
    const modules: Record<string, unknown> = {};
    for (const m of this.game.modules.values()) {
      modules[m.id] = m.serialize();
    }
    return { v: CURRENT_VERSION, savedAt: new Date().toISOString(), modules };
  }

  private restore(blob: SaveBlob): boolean {
    if (blob.v !== 1 && blob.v !== CURRENT_VERSION) {
      console.warn(`[save] unknown save version: ${blob.v}`);
      return false;
    }
    for (const m of this.game.modules.values()) {
      const slice = blob.modules[m.id];
      if (slice !== undefined) {
        m.deserialize(slice);
      }
    }
    return true;
  }

  /** Auto-save to localStorage. Returns true on success. */
  saveLocal(): boolean {
    try {
      const blob = this.snapshot();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
      return true;
    } catch (err) {
      console.error('[save] localStorage write failed:', err);
      return false;
    }
  }

  /** Auto-load from localStorage. Returns true if a save was applied. */
  loadLocal(): boolean {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const blob = JSON.parse(raw) as SaveBlob;
      return this.restore(blob);
    } catch (err) {
      console.error('[save] localStorage read failed:', err);
      return false;
    }
  }

  /** Export current state as a downloadable JSON file. */
  exportToFile(): void {
    const blob = this.snapshot();
    const json = JSON.stringify(blob, null, 2);
    const file = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-genesis-${blob.savedAt.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Import a save from a File object. Returns true on success. */
  async importFromFile(file: File): Promise<boolean> {
    try {
      const text = await file.text();
      const blob = JSON.parse(text) as SaveBlob;
      const ok = this.restore(blob);
      if (ok) this.game.bus.emit('load', undefined);
      return ok;
    } catch (err) {
      console.error('[save] import failed:', err);
      return false;
    }
  }

  /** Wipe all save state (memory + localStorage). */
  hardReset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.game.bus.emit('reset', undefined);
  }
}
