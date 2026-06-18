/**
 * Tiny typed event bus.
 *
 * Modules talk to each other *only* through the bus — no direct cross-imports.
 * That keeps modules independently testable and swappable.
 *
 * Usage:
 *   bus.on('resource:changed', (r) => { ... });
 *   bus.emit('resource:changed', { id: 'compute', amount: 10 });
 */
export type EventMap = {
  // engine
  tick: number; // delta seconds
  save: void;
  load: void;
  reset: void;

  // resources
  'resource:changed': { id: string; amount: number; delta: number };
  'resource:spend': { id: string; amount: number; ok: boolean };

  // buildings
  'building:purchased': { id: string; count: number };
  'building:produces': { id: string; resourceId: string; amount: number };

  // agents
  'agent:created': { id: string; count: number };
  'agent:trained': { id: string; progress: number };

  // research
  'research:purchased': { id: string; rank: number };
  'research:unlocked': { id: string };

  // meta
  prestige: { layer: string; gained: number };
};

type Handler<T> = (payload: T) => void;

export class Bus {
  private listeners = new Map<keyof EventMap, Set<Handler<unknown>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as Handler<EventMap[K]>)(payload);
      } catch (err) {
        // never let one bad listener kill the loop
        console.error(`[bus] handler for "${String(event)}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
