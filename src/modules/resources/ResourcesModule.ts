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
  /**
   * Multipliers applied on top of building-derived base rates. Populated by
   * AgentsModule each tick. Read by BuildingsModule to compose the final
   * rate. We store additive (1 + sum) so the consumer can multiply.
   */
  agentMultPerResource: Record<string, number>;
  /** Multiplier applied to every resource (Planners). 1.0 = no boost. */
  agentGlobalMult: number;
  /**
   * Direct agent production: units of `resourceId` produced per real second
   * per agent of that archetype. Composed by AgentsModule each tick from
   * the trained population × research `agentProduction` effects. Read by
   * BuildingsModule when it composes the final rate per resource.
   */
  agentProduction: Record<string, number>;
  /**
   * Bonus added on top of the static cap (if any) for resources that have
   * a soft cap. Populated by ResearchModule via `resourceCapBonus`. Read in
   * tick() to keep amounts inside the (possibly raised) cap.
   */
  capBonuses: Record<string, number>;
}

interface HeadStartBonus {
  data: number;
  compute: number;
}

export class ResourcesModule implements GameModule {
  readonly id = 'resources';

  private state!: ResourcesState;
  private initialAmounts = { compute: 50, data: 25, capital: 10, alignment: 0.5 };
  private bus!: Game['bus'];
  private gameRef?: Game;

  /**
   * Reset the current run (used by prestige realignment). Keeps prestige
   * insight intact by reading it from the prestige module again and applying
   * the current head-start bonus.
   */
  resetRun(): void {
    let headStart: HeadStartBonus = { data: 0, compute: 0 };
    const p = this.gameRef?.modules.get('prestige');
    const prestigeLike = p as unknown as { headStartBonus?: () => HeadStartBonus } | undefined;
    if (prestigeLike && typeof prestigeLike.headStartBonus === 'function') {
      headStart = prestigeLike.headStartBonus();
    }
    this.state.amounts = {
      compute: this.initialAmounts.compute + (headStart.compute ?? 0),
      data: this.initialAmounts.data + (headStart.data ?? 0),
      capital: this.initialAmounts.capital,
      alignment: this.initialAmounts.alignment,
    };
    this.state.rates = { compute: 0, data: 0, capital: 0, alignment: 0 };
    this.state.agentMultPerResource = {};
    this.state.agentGlobalMult = 1;
    this.state.agentProduction = {};
  }

  init(game: Game): void {
    this.gameRef = game;
    this.bus = game.bus;
    this.state = {
      amounts: { compute: 50, data: 25, capital: 10, alignment: 0.5 },
      rates: { compute: 0, data: 0, capital: 0, alignment: 0 },
      agentMultPerResource: {},
      agentGlobalMult: 1,
      agentProduction: {},
      capBonuses: {},
    };
    // Apply prestige head-start bonus if a prestige module is registered.
    const p = game.modules?.get('prestige');
    const prestigeLike = p as unknown as { headStartBonus?: () => HeadStartBonus } | undefined;
    if (prestigeLike && typeof prestigeLike.headStartBonus === 'function') {
      const bonus = prestigeLike.headStartBonus();
      this.state.amounts.compute += bonus.compute ?? 0;
      this.state.amounts.data += bonus.data ?? 0;
    }
  }

  tick(dt: number): void {
    for (const def of RESOURCE_DEFS) {
      const current = this.state.amounts[def.id] ?? 0;
      const rate = this.state.rates[def.id] ?? 0;
      if (rate === 0) continue;
      let next = current + rate * dt;
      if (def.cap !== undefined) {
        const cap = def.cap + (this.state.capBonuses[def.id] ?? 0);
        next = Math.max(0, Math.min(cap, next));
      } else {
        next = Math.max(0, next);
      }
      const delta = next - current;
      this.state.amounts[def.id] = next;
      if (Math.abs(delta) > 0) {
        this.bus?.emit('resource:changed', { id: def.id, amount: next, delta });
      }
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

  /**
   * Called by AgentsModule each tick. The multipliers are applied by
   * BuildingsModule on top of the building-derived rate, so we just store
   * them here for the next composition pass.
   */
  setAgentBoosts(perResource: Record<string, number>, globalMult: number): void {
    this.state.agentMultPerResource = { ...perResource };
    this.state.agentGlobalMult = globalMult;
  }

  /** Per-resource additive multiplier (1.0 = no boost). */
  getAgentMultFor(id: string): number {
    return this.state.agentMultPerResource[id] ?? 0;
  }

  /** Global additive multiplier from meta-agents (Planners). 1.0 = none. */
  getAgentGlobalMult(): number {
    return this.state.agentGlobalMult;
  }

  /**
   * Replace the agent production table (units per second per resource).
   * Called by AgentsModule each tick.
   */
  setAgentProduction(production: Record<string, number>): void {
    this.state.agentProduction = { ...production };
  }

  /** Read the current agent production rate for a resource. */
  getAgentProduction(id: string): number {
    return this.state.agentProduction[id] ?? 0;
  }

  /**
   * Add a bonus to a capped resource's maximum. Idempotent if you want a
   * stable, additive effect (the research module accumulates and passes
   * the total). The cap is exposed in tick() above.
   */
  setCapBonus(id: string, bonus: number): void {
    if (bonus <= 0) {
      delete this.state.capBonuses[id];
    } else {
      this.state.capBonuses[id] = bonus;
    }
  }

  getCapBonus(id: string): number {
    return this.state.capBonuses[id] ?? 0;
  }

  add(id: string, amount: number): void {
    const def = RESOURCE_DEFS.find((r) => r.id === id);
    if (!def) return;
    const current = this.state.amounts[id] ?? 0;
    let next = current + amount;
    if (def.cap !== undefined) next = Math.max(0, Math.min(def.cap, next));
    else next = Math.max(0, next);
    const delta = next - current;
    this.state.amounts[id] = next;
    if (Math.abs(delta) > 0) {
      this.bus?.emit('resource:changed', { id, amount: next, delta });
    }
  }

  /** Returns true if the player can afford the cost, then *deducts* atomically. */
  spend(cost: Partial<Record<string, number>>): boolean {
    for (const [id, amt] of Object.entries(cost)) {
      if ((this.state.amounts[id] ?? 0) < (amt ?? 0)) return false;
    }
    for (const [id, amt] of Object.entries(cost)) {
      const current = this.state.amounts[id] ?? 0;
      const next = current - (amt ?? 0);
      this.state.amounts[id] = next;
      this.bus?.emit('resource:changed', { id, amount: next, delta: -(amt ?? 0) });
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
