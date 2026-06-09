/**
 * Resources module.
 *
 * Owns all currency-like values. Buildings and Agents *request* changes via
 * the bus / direct methods; the Resources module is the only writer.
 *
 * v1 ships four: Compute, Data, Capital, Alignment.
 * Alignment is a soft-cap flavor stat — it gates unsafe research paths.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';

export interface ResourceDef {
  id: string;
  name: string;
  icon: string;
  /** base gain per real second at zero producers */
  baseRate: number;
  /** optional soft cap (e.g. Alignment has a 0..1 range) */
  cap?: number;
  /** color for UI */
  color: string;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  { id: 'compute', name: 'Compute', icon: '⚡', baseRate: 0, color: '#4cc9f0' },
  { id: 'data', name: 'Data', icon: '◐', baseRate: 0, color: '#a78bfa' },
  { id: 'capital', name: 'Capital', icon: '◆', baseRate: 0, color: '#facc15' },
  { id: 'alignment', name: 'Alignment', icon: '✦', baseRate: 0, cap: 1, color: '#4ade80' },
];

interface ResourcesState {
  amounts: Record<string, number>;
  rates: Record<string, number>;
}

export class ResourcesModule implements GameModule {
  readonly id = 'resources';

  private state: ResourcesState = {
    amounts: { compute: 50, data: 25, capital: 10, alignment: 0.5 },
    rates: { compute: 0, data: 0, capital: 0, alignment: 0 },
  };

  init(_game: Game): void {
    // nothing to wire right now; future: hook into bus for derived stats
  }

  tick(dt: number): void {
    for (const def of RESOURCE_DEFS) {
      const current = this.state.amounts[def.id] ?? 0;
      const rate = this.state.rates[def.id] ?? 0;
      if (rate === 0) continue;
      let next = current + rate * dt;
      if (def.cap !== undefined) {
        next = Math.max(0, Math.min(def.cap, next));
      } else {
        next = Math.max(0, next);
      }
      this.state.amounts[def.id] = next;
    }
  }

  get(id: string): number {
    return this.state.amounts[id] ?? 0;
  }

  getRate(id: string): number {
    return this.state.rates[id] ?? 0;
  }

  setRate(id: string, rate: number): void {
    this.state.rates[id] = rate;
  }

  add(id: string, amount: number): void {
    const def = RESOURCE_DEFS.find((r) => r.id === id);
    if (!def) return;
    let next = (this.state.amounts[id] ?? 0) + amount;
    if (def.cap !== undefined) next = Math.max(0, Math.min(def.cap, next));
    else next = Math.max(0, next);
    this.state.amounts[id] = next;
  }

  /** Returns true if the player can afford the cost, then *deducts* atomically. */
  spend(cost: Partial<Record<string, number>>): boolean {
    for (const [id, amt] of Object.entries(cost)) {
      if ((this.state.amounts[id] ?? 0) < (amt ?? 0)) return false;
    }
    for (const [id, amt] of Object.entries(cost)) {
      this.state.amounts[id] = (this.state.amounts[id] ?? 0) - (amt ?? 0);
    }
    return true;
  }

  /** For UI / save purposes */
  snapshot(): { amounts: Record<string, number>; rates: Record<string, number> } {
    return { ...this.state, amounts: { ...this.state.amounts }, rates: { ...this.state.rates } };
  }

  serialize(): unknown {
    return this.state;
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<ResourcesState>;
    if (d.amounts) this.state.amounts = { ...d.amounts };
    if (d.rates) this.state.rates = { ...d.rates };
  }
}
