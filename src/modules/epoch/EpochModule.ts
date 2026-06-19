/**
 * Epoch module.
 *
 * Each agent archetype has its own circular progression wheel. Progress fills
 * faster as the trained population of that archetype grows. On every full
 * revolution the archetype gains a permanent run-internal epoch count and a
 * small permanent bonus for the current run. Progress and bonuses are reset
 * on prestige realignment.
 *
 * The module never mutates other modules directly. Other modules query the
 * bonuses via this module's public API.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import type { AgentArchetype } from '@modules/agents';
import type { ResourcesModule } from '@modules/resources';

export type EpochBonusKind =
  | 'agentBoost' // +% to agent boosts (reasoner → compute, coder → capital)
  | 'alignmentCap' // +% to alignment cap (vision)
  | 'globalAgentBoost'; // +% to every agent boost (planner)

export const EPOCH_ARCHETYPES: AgentArchetype[] = [
  'reasoner',
  'coder',
  'vision',
  'planner',
];

export interface EpochDef {
  archetype: AgentArchetype;
  /** Permanent run-internal bonus granted per completed epoch. */
  bonus: {
    kind: EpochBonusKind;
    /** Target resource id for agentBoost bonuses; ignored otherwise. */
    resourceId?: string;
    /** Fractional bonus per epoch, e.g. 0.01 = +1%. */
    value: number;
  };
}

export const EPOCH_DEFS: EpochDef[] = [
  {
    archetype: 'reasoner',
    bonus: { kind: 'agentBoost', resourceId: 'compute', value: 0.01 },
  },
  {
    archetype: 'coder',
    bonus: { kind: 'agentBoost', resourceId: 'capital', value: 0.01 },
  },
  {
    archetype: 'vision',
    bonus: { kind: 'alignmentCap', value: 0.005 },
  },
  {
    archetype: 'planner',
    bonus: { kind: 'globalAgentBoost', value: 0.01 },
  },
];

interface EpochState {
  /** Current progress for each archetype in the range [0, 1). */
  progress: Record<AgentArchetype, number>;
  /** Number of completed epochs for each archetype this run. */
  epochs: Record<AgentArchetype, number>;
}

/** Population required to fill the wheel in one real second. */
const POPULATION_REFERENCE = 10;

/** Maximum progress rate per second, prevents runaway filling at huge pops. */
const MAX_RATE_PER_SEC = 0.5;

export class EpochModule implements GameModule {
  readonly id = 'epoch';

  private state: EpochState = {
    progress: { reasoner: 0, coder: 0, vision: 0, planner: 0 },
    epochs: { reasoner: 0, coder: 0, vision: 0, planner: 0 },
  };

  private bus!: Game['bus'];
  private agents?: {
    population(id: AgentArchetype): number;
    totalPopulation(): number;
  };
  private resources?: ResourcesModule;

  init(game: Game): void {
    this.bus = game.bus;

    const agents = game.modules.get('agents');
    if (
      agents &&
      typeof (agents as unknown as { population?: (id: AgentArchetype) => number }).population === 'function'
    ) {
      this.agents = agents as unknown as {
        population(id: AgentArchetype): number;
        totalPopulation(): number;
      };
    }

    const resources = game.modules.get('resources');
    if (resources && typeof (resources as ResourcesModule).setCapBonus === 'function') {
      this.resources = resources as ResourcesModule;
    }

    this.bus.on('agent:created', (e) => {
      const archetype = e.id as AgentArchetype;
      if (EPOCH_ARCHETYPES.includes(archetype)) {
        this.bus.emit('epoch:progress', {
          archetype,
          progress: this.state.progress[archetype],
          population: e.count,
          epochs: this.state.epochs[archetype],
        });
      }
    });

    this.bus.on('prestige:realign', () => {
      this.resetRun();
    });

    this.applyAlignmentCapBonus();
  }

  tick(dt: number): void {
    for (const def of EPOCH_DEFS) {
      const archetype = def.archetype;
      const population = this.agents?.population(archetype) ?? 0;
      if (population <= 0) continue;

      const rate = this.progressRate(population);
      let next = this.state.progress[archetype] + rate * dt;

      while (next >= 1) {
        next -= 1;
        this.completeEpoch(archetype);
      }

      this.state.progress[archetype] = next;
      this.bus.emit('epoch:progress', {
        archetype,
        progress: next,
        population,
        epochs: this.state.epochs[archetype],
      });
    }

    this.applyAlignmentCapBonus();
  }

  /** Progress rate per real second for a given trained population. */
  progressRate(population: number): number {
    if (population <= 0) return 0;
    return Math.min((population / POPULATION_REFERENCE) ** 0.8, MAX_RATE_PER_SEC);
  }

  private completeEpoch(archetype: AgentArchetype): void {
    this.state.epochs[archetype] += 1;
    const def = EPOCH_DEFS.find((d) => d.archetype === archetype)!;
    this.bus.emit('epoch:completed', {
      archetype,
      count: this.state.epochs[archetype],
      bonus: def.bonus,
    });
  }

  /** Reset run-internal epoch progress, counts, and their bonuses. */
  resetRun(): void {
    for (const archetype of EPOCH_ARCHETYPES) {
      this.state.progress[archetype] = 0;
      this.state.epochs[archetype] = 0;
    }
    this.applyAlignmentCapBonus();
    this.bus.emit('epoch:progress', {
      archetype: 'reasoner',
      progress: 0,
      population: 0,
      epochs: 0,
    });
  }

  progressFor(archetype: AgentArchetype): number {
    return this.state.progress[archetype] ?? 0;
  }

  countFor(archetype: AgentArchetype): number {
    return this.state.epochs[archetype] ?? 0;
  }

  /**
   * Total run-internal bonus for a given kind.
   *
   * - `agentBoost` requires a target resource id.
   * - `alignmentCap` returns the additive cap bonus.
   * - `globalAgentBoost` returns the multiplier applied to every agent boost.
   *
   * The result is additive (1.0 = no bonus) so consumers multiply their base.
   */
  bonusFor(kind: EpochBonusKind, targetResource?: string): number {
    let bonus = 0;
    for (const def of EPOCH_DEFS) {
      if (def.bonus.kind !== kind) continue;
      if (kind === 'agentBoost' && def.bonus.resourceId !== targetResource) continue;
      const count = this.state.epochs[def.archetype];
      if (count > 0) {
        bonus += def.bonus.value * count;
      }
    }
    return 1 + bonus;
  }

  /** Total bonus to the alignment cap (additive, in absolute units). */
  alignmentCapBonus(): number {
    let bonus = 0;
    for (const def of EPOCH_DEFS) {
      if (def.bonus.kind !== 'alignmentCap') continue;
      const count = this.state.epochs[def.archetype];
      if (count > 0) {
        bonus += def.bonus.value * count;
      }
    }
    return bonus;
  }

  private applyAlignmentCapBonus(): void {
    if (!this.resources) return;
    this.resources.setCapBonus('alignment', this.alignmentCapBonus());
  }

  serialize(): unknown {
    return {
      progress: { ...this.state.progress },
      epochs: { ...this.state.epochs },
    };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<EpochState>;
    if (d.progress) {
      for (const archetype of EPOCH_ARCHETYPES) {
        const value = d.progress[archetype];
        if (typeof value === 'number') {
          this.state.progress[archetype] = Math.max(0, Math.min(1, value));
        }
      }
    }
    if (d.epochs) {
      for (const archetype of EPOCH_ARCHETYPES) {
        const value = d.epochs[archetype];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          this.state.epochs[archetype] = Math.floor(value);
        }
      }
    }
    this.applyAlignmentCapBonus();
  }
}
