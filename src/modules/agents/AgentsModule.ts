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
import type { ResearchModule } from '@modules/research';

export type AgentArchetype = 'reasoner' | 'coder' | 'vision' | 'planner';

export interface AgentDef {
  id: AgentArchetype;
  name: string;
  description: string;
  /** resources needed to begin training */
  trainingCost: Partial<Record<string, number>>;
  /** real seconds of training to become productive */
  trainingTime: number;
  /**
   * What this agent does once trained: it multiplies the per-second
   * production rate of `boosts.resourceId` by `1 + boosts.multiplierPerAgent
   * * population`. Stacks linearly with population.
   *
   * Example: a Reasoner boosts Compute with multiplierPerAgent=0.25. With
   * 4 trained Reasoners, the Compute rate is multiplied by 2.0.
   *
   * For `planner`, set `resourceId: '*'` to apply to every resource.
   */
  boosts: { resourceId: string | '*'; multiplierPerAgent: number };
  /**
   * Optional direct production: the agent creates `basePerAgent` units of
   * `resourceId` per second. Research can amplify this via the
   * `agentProduction` effect whose targetId matches this agent's `id`.
   * Without any matching research, the agent produces nothing directly.
   */
  produces?: { resourceId: string; basePerAgent: number };
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
    description: 'Strong at math and logic. Trains on data, amplifies Compute production.',
    trainingCost: { data: 30, compute: 10 },
    trainingTime: 8,
    boosts: { resourceId: 'compute', multiplierPerAgent: 0.25 },
    produces: { resourceId: 'data', basePerAgent: 1 },
    color: '#4cc9f0',
    baseSize: 60,
    motion: 'orbit',
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Turns compute into capital. Each trained Coder amplifies Capital production.',
    trainingCost: { compute: 25, data: 10 },
    trainingTime: 12,
    boosts: { resourceId: 'capital', multiplierPerAgent: 0.3 },
    produces: { resourceId: 'capital', basePerAgent: 1 },
    color: '#facc15',
    baseSize: 70,
    motion: 'drift',
  },
  {
    id: 'vision',
    name: 'Vision',
    description: 'Trains slowly but amplifies Alignment Lab output, pushing the soft cap toward 1.0.',
    trainingCost: { compute: 40, data: 50 },
    trainingTime: 20,
    boosts: { resourceId: 'alignment', multiplierPerAgent: 0.4 },
    produces: { resourceId: 'alignment', basePerAgent: 1 },
    color: '#4ade80',
    baseSize: 80,
    motion: 'pulse',
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Meta-agent. Each Planner amplifies every other agent’s boost.',
    trainingCost: { compute: 60, data: 40, capital: 20 },
    trainingTime: 30,
    boosts: { resourceId: '*', multiplierPerAgent: 0.15 },
    produces: { resourceId: 'compute', basePerAgent: 1 },
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
  private research?: ResearchModule;

  init(game: Game): void {
    const res = game.modules.get('resources');
    if (!(res instanceof ResourcesModule)) {
      throw new Error('AgentsModule requires ResourcesModule to be registered first');
    }
    this.resources = res;
    this.bus = game.bus;
    const r = game.modules.get('research');
    if (r && typeof (r as ResearchModule).getEffect === 'function') {
      this.research = r as ResearchModule;
    }
  }

  tick(dt: number): void {
    // Advance training timers, finish any that hit 1.0.
    // Effective training speed per archetype is read from ResearchModule
    // (default 1.0 = no research). Lower mult = faster.
    for (const def of AGENT_DEFS) {
      if (this.state.trainingProgress[def.id] > 0) {
        const speedMult = this.research
          ? this.research.trainingSpeedMult(def.id)
          : 1;
        const p = this.state.trainingProgress[def.id] + dt / def.trainingTime / speedMult;
        if (p >= 1) {
          this.state.trainingProgress[def.id] = 0;
          this.state.population[def.id] += 1;
          this.bus.emit('agent:created', { id: def.id, count: this.state.population[def.id] });
          // Reset the cloud's training visual on the same frame the agent
          // finishes — without this the viz would keep showing the last
          // progress value forever.
          this.bus.emit('agent:trained', { id: def.id, progress: 0 });
        } else {
          this.state.trainingProgress[def.id] = p;
          this.bus.emit('agent:trained', { id: def.id, progress: p });
        }
      }
    }

    // Publish our current boost multipliers to the resources module so
    // BuildingsModule (which ticks after us, see Game module order) can
    // apply them on top of building output. We don't multiply here directly
    // — the resources module is the single source of truth for rates and
    // gets reset by BuildingsModule each tick anyway.
    //
    // Formula: per resource, multiplier = 1 + sum over agents that target
    // that resource of (multiplierPerAgent * pop). The Planner (resourceId
    // '*') contributes additively to a "global" multiplier that gets folded
    // in by BuildingsModule.
    const perResource: Record<string, number> = {};
    let globalMult = 1;
    for (const def of AGENT_DEFS) {
      const pop = this.state.population[def.id] ?? 0;
      if (pop === 0) continue;
      if (def.boosts.resourceId === '*') {
        globalMult += def.boosts.multiplierPerAgent * pop;
      } else {
        const rid = def.boosts.resourceId;
        perResource[rid] = (perResource[rid] ?? 0) + def.boosts.multiplierPerAgent * pop;
      }
    }

    // Swarm Coordination: amplifies the per-resource and global boost
    // multipliers (additive bonus on top of the base boost).
    const boostAmp = this.research
      ? this.research.getEffect('agentBoostMult', '*')
      : 1;
    for (const rid of Object.keys(perResource)) {
      perResource[rid] = (perResource[rid] ?? 0) * boostAmp;
    }
    globalMult = 1 + (globalMult - 1) * boostAmp;

    this.resources.setAgentBoosts(perResource, globalMult);

    // Direct agent production (from research `agentProduction` effects).
    // For each trained agent, we add `valuePerRank * rank` units/sec of
    // the agent's own type. We don't have agent-specific "produces" yet,
    // so we use the agent type's id as the resource target — but in
    // practice the research defs map e.g. reasoner -> data (via targetId).
    // To avoid coupling, we just publish a generic map and let BuildingsModule
    // pick it up via getAgentProduction. The actual mapping lives in
    // RESEARCH_DEFS (targetId on agentProduction).
    const production: Record<string, number> = {};
    for (const def of AGENT_DEFS) {
      const pop = this.state.population[def.id] ?? 0;
      if (pop === 0) continue;
      if (!this.research || !def.produces) continue;
      const per = this.research.getEffect('agentProduction', def.id);
      if (per > 0) {
        const rid = def.produces.resourceId;
        production[rid] = (production[rid] ?? 0) + per * pop;
      }
    }
    this.resources.setAgentProduction(production);
  }

  /** Reset current-run agents (prestige realignment). */
  resetRun(): void {
    this.state.population = { reasoner: 0, coder: 0, vision: 0, planner: 0 };
    this.state.trainingProgress = { reasoner: 0, coder: 0, vision: 0, planner: 0 };
    this.bus.emit('agents:reset', { population: { ...this.state.population } });
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
