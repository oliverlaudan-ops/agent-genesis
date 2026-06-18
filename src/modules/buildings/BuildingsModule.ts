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
import type { ResearchModule } from '@modules/research';

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
  {
    id: 'data-warehouse',
    name: 'Data Warehouse',
    description: 'Bulk storage + reprocessing pipelines. Late-game data scaling.',
    baseCost: { capital: 30, compute: 20 },
    costMultiplier: 1.22,
    produces: { resourceId: 'data', amount: 1.2 },
    unlockAt: 4,
  },
  {
    id: 'compute-cluster',
    name: 'Compute Cluster',
    description: 'Hyperscale GPU farm. Capital-hungry compute monster.',
    baseCost: { capital: 80, data: 40, compute: 30 },
    costMultiplier: 1.3,
    produces: { resourceId: 'compute', amount: 2.5 },
    unlockAt: 6,
  },
];

interface BuildingsState {
  counts: Record<string, number>;
}

export class BuildingsModule implements GameModule {
  readonly id = 'buildings';

  private state: BuildingsState = { counts: {} };
  private resources!: ResourcesModule;
  private research?: ResearchModule;

  init(game: Game): void {
    const res = game.modules.get('resources');
    if (!(res instanceof ResourcesModule)) {
      throw new Error('BuildingsModule requires ResourcesModule to be registered first');
    }
    this.resources = res;
    // ResearchModule is optional — registered after us in main.ts and may
    // not exist in early tests. Use a duck-typed lookup.
    const r = game.modules.get('research');
    if (r && typeof (r as ResearchModule).getEffect === 'function') {
      this.research = r as ResearchModule;
    }
  }

  tick(_dt: number): void {
    // Recompute total rate per resource from all buildings.
    const totals: Record<string, number> = {};
    for (const def of BUILDING_DEFS) {
      const count = this.state.counts[def.id] ?? 0;
      if (count === 0) continue;
      const rid = def.produces.resourceId;
      // Apply research multiplier per building.
      const research = this.research
        ? this.research.getEffect('buildingRateMult', def.id)
        : 1;
      totals[rid] = (totals[rid] ?? 0) + def.produces.amount * count * research;
    }

    // Compose with base rates + agent-derived multipliers. AgentsModule
    // publishes its boost table into ResourcesModule before this runs
    // (see Game module order in main.ts: resources → buildings → agents).
    // The agents' *own* boost calculation happens on the tick that follows
    // here, which is fine — there is at most one tick of latency on the
    // multiplier, invisible in practice.
    const globalMult = this.resources.getAgentGlobalMult();
    for (const def of RESOURCE_DEFS_FLAT) {
      const base = (totals[def.id] ?? 0) + def.baseRate;
      const perRes = 1 + this.resources.getAgentMultFor(def.id);
      const agentProd = this.resources.getAgentProduction(def.id);
      this.resources.setRate(
        def.id,
        (base + agentProd) * perRes * globalMult,
      );
    }
  }

  count(id: string): number {
    return this.state.counts[id] ?? 0;
  }

  /** Sum of all building counts. Used by ResearchModule for unlock gates. */
  totalBuildings(): number {
    let total = 0;
    for (const c of Object.values(this.state.counts)) total += c;
    return total;
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
