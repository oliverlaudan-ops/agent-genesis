/**
 * Prestige / Realignment module.
 *
 * Owns the persistent meta-resource `insight`, which persists across runs.
 * Realignment resets the current run and grants insight based on the
 * accomplishments of that run.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import type { AgentsModule } from '@modules/agents';
import type { BuildingsModule } from '@modules/buildings';
import type { ResearchModule } from '@modules/research';
import type { ResourcesModule } from '@modules/resources';

export interface PrestigeNodeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
}

export const PRESTIGE_DEFS: PrestigeNodeDef[] = [];

interface PrestigeState {
  insight: number;
}

interface ModulesLike {
  agents?: {
    totalPopulation(): number;
    resetRun(): void;
  };
  buildings?: {
    totalBuildings(): number;
    resetRun(): void;
  };
  research?: {
    totalRanks?(): number;
    getEffect(kind: string, targetId: string): number;
    resetRun(): void;
  };
  resources?: {
    getCapBonus(id: string): number;
    resetRun(): void;
  };
}

export class PrestigeModule implements GameModule {
  readonly id = 'prestige';

  private state: PrestigeState = { insight: 0 };
  private modules: ModulesLike = {};
  private bus!: Game['bus'];
  private gameRef?: Game;

  init(game: Game): void {
    this.gameRef = game;
    this.bus = game.bus;

    const agents = game.modules.get('agents');
    if (agents && typeof (agents as AgentsModule).totalPopulation === 'function') {
      this.modules.agents = agents as AgentsModule;
    }

    const buildings = game.modules.get('buildings');
    if (buildings && typeof (buildings as BuildingsModule).totalBuildings === 'function') {
      this.modules.buildings = buildings as BuildingsModule;
    }

    const research = game.modules.get('research');
    if (research && typeof (research as ResearchModule).getEffect === 'function') {
      this.modules.research = research as ResearchModule;
    }

    const resources = game.modules.get('resources');
    if (resources && typeof (resources as ResourcesModule).getCapBonus === 'function') {
      this.modules.resources = resources as ResourcesModule;
    }
  }

  tick(): void {
    // Insight is a persistent meta-resource; nothing updates per-frame.
  }

  /** Total insight accumulated across all realignments. */
  insight(): number {
    return this.state.insight;
  }

  /** Insight that would be gained by realigning right now. */
  insightGainedOnRealign(): number {
    const totalResearchRanks = this.modules.research?.totalRanks?.() ?? 0;
    const totalAgents = this.modules.agents?.totalPopulation() ?? 0;
    const totalBuildings = this.modules.buildings?.totalBuildings() ?? 0;
    return Math.floor(totalResearchRanks * 0.5 + totalAgents * 0.2 + totalBuildings * 0.1);
  }

  /** Whether the current run can be converted into insight. */
  realignAllowed(): boolean {
    const capBonus = this.modules.resources?.getCapBonus('alignment') ?? 0;
    const totalBuildings = this.modules.buildings?.totalBuildings() ?? 0;
    return capBonus > 0.0001 && totalBuildings >= 50;
  }

  /** Convert the current run into insight, reset the run, save, and emit bus events. */
  performRealign(): boolean {
    if (!this.realignAllowed()) return false;
    const insightGained = this.insightGainedOnRealign();
    const previous = this.state.insight;
    this.state.insight += insightGained;

    // Reset every other module's current-run state before saving so the
    // next run starts fresh while preserving our newly earned insight.
    this.modules.resources?.resetRun();
    this.modules.buildings?.resetRun();
    this.modules.agents?.resetRun();
    this.modules.research?.resetRun();

    // Emit events after reset so listeners see the post-realignment state.
    this.bus.emit('prestige:realign', {
      insightGained,
      totalInsight: this.state.insight,
    });
    this.bus.emit('prestige:insightChanged', {
      total: this.state.insight,
      delta: this.state.insight - previous,
    });

    // Persist immediately so the reset state survives the page reload.
    this.gameRef?.save?.saveLocal();
    return true;
  }

  /** Global multiplier applied to all production, based on insight. */
  globalProductionMult(): number {
    return 1 + this.state.insight * 0.02;
  }

  /** Starting bonus resources for the next run after realigning. */
  headStartBonus(): { data: number; compute: number } {
    return {
      data: Math.floor(this.state.insight / 5) * 10,
      compute: Math.floor(this.state.insight / 10) * 10,
    };
  }

  serialize(): unknown {
    return { insight: this.state.insight };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<PrestigeState>;
    if (typeof d.insight === 'number') this.state.insight = d.insight;
  }
}
