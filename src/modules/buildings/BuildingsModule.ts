/**
 * Buildings module.
 *
 * Buildings produce resources. Each building has a base cost, a cost-growth
 * factor (1.15 is the standard idle-game rate), and a per-tick production.
 *
 * Buildings recalculate total resource rates every tick, so producers and
 * multipliers compose cleanly without manual coordination.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { ResourcesModule } from '@modules/resources';

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  baseCost: Partial<Record<string, number>>;
  costMultiplier: number;
  /** resource produced per second per building */
  produces: { resourceId: string; amount: number };
  unlockAt?: number; // total building count required to appear
}

export const BUILDING_DEFS: BuildingDef[] = [
  {
    id: 'data-mine',
    name: 'Data Mine',
    description: 'Streams raw data from public sources. The first rung of any agent.',
    baseCost: { capital: 5 },
    costMultiplier: 1.15,
    produces: { resourceId: 'data', amount: 0.2 },
  },
  {
    id: 'vc-fund',
    name: 'VC Fund',
    description: 'Deploys capital-seeking strategies. The only path to growing Capital.',
    baseCost: { data: 20 },
    costMultiplier: 1.2,
    produces: { resourceId: 'capital', amount: 0.05 },
  },
  {
    id: 'gpu-rack',
    name: 'GPU Rack',
    description: 'Burns capital, generates compute. Pure throughput.',
    baseCost: { capital: 12, data: 4 },
    costMultiplier: 1.17,
    produces: { resourceId: 'compute', amount: 0.4 },
  },
  {
    id: 'alignment-lab',
    name: 'Alignment Lab',
    description: 'Drifts alignment toward 1.0. Slow, expensive, essential.',
    baseCost: { compute: 50, data: 20 },
    costMultiplier: 1.25,
    produces: { resourceId: 'alignment', amount: 0.005 },
    unlockAt: 3,
  },
];

interface BuildingsState {
  counts: Record<string, number>;
}

export class BuildingsModule implements GameModule {
  readonly id = 'buildings';

  private state: BuildingsState = { counts: {} };
  private resources!: ResourcesModule;

  init(game: Game): void {
    const res = game.modules.get('resources');
    if (!(res instanceof ResourcesModule)) {
      throw new Error('BuildingsModule requires ResourcesModule to be registered first');
    }
    this.resources = res;
  }

  tick(_dt: number): void {
    // Reset per-tick rates, then walk every building, then re-emit.
    for (const def of BUILDING_DEFS) {
      this.resources.setRate(def.produces.resourceId, 0); // we recompute below
    }

    // Recompute total rate per resource from all buildings.
    const totals: Record<string, number> = {};
    for (const def of BUILDING_DEFS) {
      const count = this.state.counts[def.id] ?? 0;
      if (count === 0) continue;
      const rid = def.produces.resourceId;
      totals[rid] = (totals[rid] ?? 0) + def.produces.amount * count;
    }
    for (const def of RESOURCE_DEFS_FLAT) {
      // add back base rate (currently zero for all) + building totals
      this.resources.setRate(def.id, (totals[def.id] ?? 0) + def.baseRate);
    }
  }

  count(id: string): number {
    return this.state.counts[id] ?? 0;
  }

  costFor(def: BuildingDef): Partial<Record<string, number>> {
    const owned = this.count(def.id);
    const out: Partial<Record<string, number>> = {};
    for (const [rid, base] of Object.entries(def.baseCost)) {
      out[rid] = Math.ceil((base ?? 0) * Math.pow(def.costMultiplier, owned));
    }
    return out;
  }

  isUnlocked(def: BuildingDef): boolean {
    if (def.unlockAt === undefined) return true;
    let total = 0;
    for (const c of Object.values(this.state.counts)) total += c;
    return total >= def.unlockAt;
  }

  /** Returns true on successful purchase. */
  purchase(defId: string): boolean {
    const def = BUILDING_DEFS.find((b) => b.id === defId);
    if (!def) return false;
    if (!this.isUnlocked(def)) return false;
    const cost = this.costFor(def);
    if (!this.resources.spend(cost)) return false;
    this.state.counts[defId] = (this.state.counts[defId] ?? 0) + 1;
    return true;
  }

  serialize(): unknown {
    return { ...this.state, counts: { ...this.state.counts } };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<BuildingsState>;
    if (d.counts) this.state.counts = { ...d.counts };
  }
}

// Local copy of the def list to avoid a circular import in the loop above.
// (We only need .id and .baseRate; this is a thin shim to keep the module
//  decoupled from the resources package's other exports.)
import { RESOURCE_DEFS } from '@modules/resources';
const RESOURCE_DEFS_FLAT = RESOURCE_DEFS;
