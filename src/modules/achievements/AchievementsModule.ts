/**
 * Achievements module.
 *
 * Tracks unlockable milestones and the permanent bonuses they grant.
 * Achievements are evaluated against the StatsModule; they never mutate
 * other modules directly. Instead, other modules query
 * `achievementBonus(kind)` to apply the effect.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { StatsModule } from '@modules/stats';

export type AchievementKind =
  | 'trainingSpeed'
  | 'buildingRate'
  | 'agentBoost'
  | 'researchCost'
  | 'insightGain'
  | 'globalProduction'
  | 'resourceRate'; // per-resource multiplier

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /**
   * The kind of permanent bonus this achievement grants.
   * `resourceRate` multipliers also need `targetResource`.
   */
  kind: AchievementKind;
  /** Multiplier magnitude, e.g. 0.05 = +5%. */
  bonus: number;
  /** For `resourceRate` only: which resource receives the bonus. */
  targetResource?: string;
  /**
   * Predicate evaluated against the StatsModule every tick.
   * Receives the Game instance for module-specific queries (e.g. building counts).
   */
  condition: (stats: StatsModule, game: Game) => boolean;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Train your first agent.',
    kind: 'trainingSpeed',
    bonus: 0.02,
    condition: (s) => s.totalAgentsTrained >= 1,
  },
  {
    id: 'data-miner',
    name: 'Data Miner',
    description: 'Purchase 5 Data Mines.',
    kind: 'resourceRate',
    bonus: 0.05,
    targetResource: 'data',
    condition: (_stats, game) => {
      const bld = game.modules.get('buildings') as { count?: (id: string) => number } | undefined;
      return (bld?.count?.('data-mine') ?? 0) >= 5;
    },
  },
  {
    id: 'capital-flow',
    name: 'Capital Flow',
    description: 'Purchase 3 VC Funds.',
    kind: 'resourceRate',
    bonus: 0.05,
    targetResource: 'capital',
    condition: (_stats, game) => {
      const bld = game.modules.get('buildings') as { count?: (id: string) => number } | undefined;
      return (bld?.count?.('vc-fund') ?? 0) >= 3;
    },
  },
  {
    id: 'compute-rush',
    name: 'Compute Rush',
    description: 'Reach 100 Compute at once.',
    kind: 'resourceRate',
    bonus: 0.05,
    targetResource: 'compute',
    condition: (s) => s.peakResource('compute') >= 100,
  },
  {
    id: 'alignment-aware',
    name: 'Alignment Aware',
    description: 'Reach 0.8 Alignment at once.',
    kind: 'resourceRate',
    bonus: 0.05,
    targetResource: 'alignment',
    condition: (s) => s.peakResource('alignment') >= 0.8,
  },
  {
    id: 'swarm',
    name: 'Swarm',
    description: 'Have 10 agents trained at the same time.',
    kind: 'agentBoost',
    bonus: 0.05,
    condition: (s) => s.maxAgentsOwnedAtOnce >= 10,
  },
  {
    id: 'city-of-racks',
    name: 'City of Racks',
    description: 'Own 20 buildings at the same time.',
    kind: 'buildingRate',
    bonus: 0.05,
    condition: (s) => s.maxBuildingsOwnedAtOnce >= 20,
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Purchase 10 research ranks in total.',
    kind: 'researchCost',
    bonus: 0.05,
    condition: (s) => s.totalResearchRanksPurchased >= 10,
  },
  {
    id: 'realignment',
    name: 'Realignment',
    description: 'Perform your first Realignment.',
    kind: 'insightGain',
    bonus: 0.10,
    condition: (s) => s.realignCount >= 1,
  },
  {
    id: 'omniscient',
    name: 'Omniscient',
    description: 'Produce 1,000,000 Data over all runs.',
    kind: 'globalProduction',
    bonus: 0.10,
    condition: (s) => s.lifetimeProduced('data') >= 1_000_000,
  },
];

interface AchievementsState {
  unlocked: string[];
}

export class AchievementsModule implements GameModule {
  readonly id = 'achievements';

  private state: AchievementsState = { unlocked: [] };
  private stats?: StatsModule;
  private bus!: Game['bus'];
  private game!: Game;

  init(game: Game): void {
    this.game = game;
    this.bus = game.bus;
    const stats = game.modules.get('stats');
    if (stats instanceof StatsModule) {
      this.stats = stats;
    }
  }

  tick(): void {
    this.checkAll();
  }

  private checkAll(): void {
    if (!this.stats) return;
    for (const def of ACHIEVEMENT_DEFS) {
      if (this.isUnlocked(def.id)) continue;
      if (def.condition(this.stats, this.game)) {
        this.unlock(def);
      }
    }
  }

  private unlock(def: AchievementDef): void {
    if (this.isUnlocked(def.id)) return;
    this.state.unlocked.push(def.id);
    this.bus.emit('achievement:unlocked', { id: def.id, name: def.name });
  }

  isUnlocked(id: string): boolean {
    return this.state.unlocked.includes(id);
  }

  list(): readonly AchievementDef[] {
    return ACHIEVEMENT_DEFS;
  }

  /**
   * Aggregate bonus for a given kind.
   * - `trainingSpeed`: total training speed multiplier (1.0 = base).
   * - `buildingRate`: total building production multiplier.
   * - `agentBoost`: total agent boost multiplier.
   * - `researchCost`: cost reduction multiplier (< 1.0 = cheaper).
   * - `insightGain`: insight gain multiplier.
   * - `globalProduction`: global production multiplier.
   * - `resourceRate`: per-resource multiplier (requires `targetResource`).
   */
  bonusFor(kind: AchievementKind, targetResource?: string): number {
    let bonus = 0;
    for (const id of this.state.unlocked) {
      const def = ACHIEVEMENT_DEFS.find((a) => a.id === id);
      if (!def) continue;
      if (def.kind !== kind) continue;
      if (kind === 'resourceRate' && def.targetResource !== targetResource) continue;
      bonus += def.bonus;
    }

    if (kind === 'researchCost') {
      return 1 - bonus; // reduction
    }
    return 1 + bonus;
  }

  serialize(): unknown {
    return { unlocked: [...this.state.unlocked] };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<AchievementsState>;
    if (Array.isArray(d.unlocked)) {
      this.state.unlocked = d.unlocked.filter((id) =>
        ACHIEVEMENT_DEFS.some((def) => def.id === id),
      );
    }
  }
}
