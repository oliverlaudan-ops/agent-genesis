/**
 * Agents module.
 *
 * An agent is a "trained" entity that produces compute passively once trained.
 * Training takes time; you queue training by spending resources.
 *
 * This is the ISEPS-connection: each agent is a particle cloud in the viz.
 * We don't know about the canvas here — the viz module subscribes to
 * 'agent:created' / 'agent:trained' events and renders accordingly.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { ResourcesModule } from '@modules/resources';

export type AgentArchetype = 'reasoner' | 'coder' | 'vision' | 'planner';

export interface AgentDef {
  id: AgentArchetype;
  name: string;
  description: string;
  /** resources needed to begin training */
  trainingCost: Partial<Record<string, number>>;
  /** real seconds of training to become productive */
  trainingTime: number;
  /** resource produced per second once trained */
  produces: { resourceId: string; amount: number };
  /** color for the particle cloud */
  color: string;
  /** base size of cloud in pixels (viz will scale by population) */
  baseSize: number;
  /** particle behavior pattern */
  motion: 'orbit' | 'drift' | 'pulse' | 'spiral';
}

export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'reasoner',
    name: 'Reasoner',
    description: 'Strong at math and logic. Trains on data, produces compute.',
    trainingCost: { data: 30, compute: 10 },
    trainingTime: 8,
    produces: { resourceId: 'compute', amount: 0.3 },
    color: '#4cc9f0',
    baseSize: 60,
    motion: 'orbit',
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Turns compute into capital. Pure utility.',
    trainingCost: { compute: 25, data: 10 },
    trainingTime: 12,
    produces: { resourceId: 'capital', amount: 0.15 },
    color: '#facc15',
    baseSize: 70,
    motion: 'drift',
  },
  {
    id: 'vision',
    name: 'Vision',
    description: 'Trains slowly but unlocks high-alignment research paths.',
    trainingCost: { compute: 40, data: 50 },
    trainingTime: 20,
    produces: { resourceId: 'alignment', amount: 0.002 },
    color: '#4ade80',
    baseSize: 80,
    motion: 'pulse',
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Meta-agent. Boosts every other agent once trained.',
    trainingCost: { compute: 60, data: 40, capital: 20 },
    trainingTime: 30,
    produces: { resourceId: 'compute', amount: 0.5 },
    color: '#a78bfa',
    baseSize: 90,
    motion: 'spiral',
  },
];

interface AgentState {
  population: Record<AgentArchetype, number>;
  trainingProgress: Record<AgentArchetype, number>; // 0..1
}

export class AgentsModule implements GameModule {
  readonly id = 'agents';

  private state: AgentState = {
    population: { reasoner: 0, coder: 0, vision: 0, planner: 0 },
    trainingProgress: { reasoner: 0, coder: 0, vision: 0, planner: 0 },
  };

  private resources!: ResourcesModule;
  private bus!: Game['bus'];

  init(game: Game): void {
    const res = game.modules.get('resources');
    if (!(res instanceof ResourcesModule)) {
      throw new Error('AgentsModule requires ResourcesModule to be registered first');
    }
    this.resources = res;
    this.bus = game.bus;
  }

  tick(dt: number): void {
    // Advance training timers, finish any that hit 1.0
    for (const def of AGENT_DEFS) {
      if (this.state.trainingProgress[def.id] > 0) {
        const p = this.state.trainingProgress[def.id] + dt / def.trainingTime;
        if (p >= 1) {
          this.state.trainingProgress[def.id] = 0;
          this.state.population[def.id] += 1;
          this.bus.emit('agent:created', { id: def.id, count: this.state.population[def.id] });
        } else {
          this.state.trainingProgress[def.id] = p;
          this.bus.emit('agent:trained', { id: def.id, progress: p });
        }
      }
    }

    // Agents are not yet wired into the resource production loop.
    // v1 keeps them as a research/visualization layer; production comes
    // from buildings. v2 will let trained agents modify building rates.
  }

  population(id: AgentArchetype): number {
    return this.state.population[id] ?? 0;
  }

  trainingProgressFor(id: AgentArchetype): number {
    return this.state.trainingProgress[id] ?? 0;
  }

  isTraining(id: AgentArchetype): boolean {
    return this.state.trainingProgress[id] > 0;
  }

  /** Begin training an agent. Deducts cost up front. Returns false if cannot afford. */
  startTraining(id: AgentArchetype): boolean {
    if (this.isTraining(id)) return false;
    const def = AGENT_DEFS.find((a) => a.id === id);
    if (!def) return false;
    if (!this.resources.spend(def.trainingCost)) return false;
    this.state.trainingProgress[id] = 0.0001; // > 0 to mark "in progress"
    return true;
  }

  /** Total agent count across all archetypes (for viz). */
  totalPopulation(): number {
    let n = 0;
    for (const v of Object.values(this.state.population)) n += v;
    return n;
  }

  serialize(): unknown {
    return {
      population: { ...this.state.population },
      trainingProgress: { ...this.state.trainingProgress },
    };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<AgentState>;
    if (d.population) this.state.population = { ...d.population };
    if (d.trainingProgress) this.state.trainingProgress = { ...d.trainingProgress };
  }
}
