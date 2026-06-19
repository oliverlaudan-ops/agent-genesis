/**
 * Statistics module.
 *
 * Tracks lifetime and per-run aggregates of everything the player does.
 * Other modules (especially Achievements) read these values; StatsModule itself
 * does not judge or reward — it only counts.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';

interface StatsState {
  /** Total real-world seconds this save has been active. */
  playtimeSeconds: number;
  /** Number of times the player has realigned. */
  realignCount: number;
  /** Total insight ever earned across all realignments. */
  totalInsightEarned: number;

  // Lifetime aggregates
  lifetimeResourcesProduced: Record<string, number>;
  lifetimeResourcesSpent: Record<string, number>;
  totalBuildingsPurchased: number;
  totalAgentsTrained: number;
  totalResearchRanksPurchased: number;

  // Per-run aggregates (reset on realignment)
  runResourcesProduced: Record<string, number>;
  runBuildingsPurchased: number;
  runAgentsTrained: number;
  runResearchRanksPurchased: number;

  // Peaks
  allTimePeakResources: Record<string, number>;
  maxAgentsOwnedAtOnce: number;
  maxBuildingsOwnedAtOnce: number;
}

export class StatsModule implements GameModule {
  readonly id = 'stats';

  private state: StatsState;

  constructor() {
    this.state = this.getDefaultState();
  }

  private getDefaultState(): StatsState {
    return {
      playtimeSeconds: 0,
      realignCount: 0,
      totalInsightEarned: 0,
      lifetimeResourcesProduced: {},
      lifetimeResourcesSpent: {},
      totalBuildingsPurchased: 0,
      totalAgentsTrained: 0,
      totalResearchRanksPurchased: 0,
      runResourcesProduced: {},
      runBuildingsPurchased: 0,
      runAgentsTrained: 0,
      runResearchRanksPurchased: 0,
      allTimePeakResources: {},
      maxAgentsOwnedAtOnce: 0,
      maxBuildingsOwnedAtOnce: 0,
    };
  }

  init(game: Game): void {
    this.subscribe(game);
  }

  private subscribe(game: Game): void {
    game.bus.on('resource:changed', ({ id, amount, delta }) => {
      if (delta > 0) {
        this.state.lifetimeResourcesProduced[id] =
          (this.state.lifetimeResourcesProduced[id] ?? 0) + delta;
        this.state.runResourcesProduced[id] =
          (this.state.runResourcesProduced[id] ?? 0) + delta;
      } else if (delta < 0) {
        this.state.lifetimeResourcesSpent[id] =
          (this.state.lifetimeResourcesSpent[id] ?? 0) - delta;
      }
      this.updatePeak(id, amount);
    });

    game.bus.on('building:purchased', ({ count }) => {
      this.state.totalBuildingsPurchased += 1;
      this.state.runBuildingsPurchased += 1;
      this.state.maxBuildingsOwnedAtOnce = Math.max(
        this.state.maxBuildingsOwnedAtOnce,
        count,
      );
    });

    game.bus.on('agent:created', ({ count }) => {
      this.state.totalAgentsTrained += 1;
      this.state.runAgentsTrained += 1;
      this.state.maxAgentsOwnedAtOnce = Math.max(
        this.state.maxAgentsOwnedAtOnce,
        count,
      );
    });

    game.bus.on('research:purchased', () => {
      this.state.totalResearchRanksPurchased += 1;
      this.state.runResearchRanksPurchased += 1;
    });

    game.bus.on('prestige:realign', ({ insightGained }) => {
      this.state.realignCount += 1;
      this.state.totalInsightEarned += insightGained;
      this.resetRunStats();
    });
  }

  tick(dt: number): void {
    this.state.playtimeSeconds += dt;
  }

  /** Reset only the per-run counters (called on realignment). */
  resetRunStats(): void {
    this.state.runResourcesProduced = {};
    this.state.runBuildingsPurchased = 0;
    this.state.runAgentsTrained = 0;
    this.state.runResearchRanksPurchased = 0;
  }

  private updatePeak(id: string, amount: number): void {
    const currentPeak = this.state.allTimePeakResources[id] ?? 0;
    if (amount > currentPeak) {
      this.state.allTimePeakResources[id] = amount;
    }
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  get playtimeSeconds(): number {
    return this.state.playtimeSeconds;
  }

  get realignCount(): number {
    return this.state.realignCount;
  }

  get totalInsightEarned(): number {
    return this.state.totalInsightEarned;
  }

  lifetimeProduced(id: string): number {
    return this.state.lifetimeResourcesProduced[id] ?? 0;
  }

  lifetimeSpent(id: string): number {
    return this.state.lifetimeResourcesSpent[id] ?? 0;
  }

  runProduced(id: string): number {
    return this.state.runResourcesProduced[id] ?? 0;
  }

  peakResource(id: string): number {
    return this.state.allTimePeakResources[id] ?? 0;
  }

  get totalBuildingsPurchased(): number {
    return this.state.totalBuildingsPurchased;
  }

  get totalAgentsTrained(): number {
    return this.state.totalAgentsTrained;
  }

  get totalResearchRanksPurchased(): number {
    return this.state.totalResearchRanksPurchased;
  }

  get maxAgentsOwnedAtOnce(): number {
    return this.state.maxAgentsOwnedAtOnce;
  }

  get maxBuildingsOwnedAtOnce(): number {
    return this.state.maxBuildingsOwnedAtOnce;
  }

  get runBuildingsPurchased(): number {
    return this.state.runBuildingsPurchased;
  }

  get runAgentsTrained(): number {
    return this.state.runAgentsTrained;
  }

  get runResearchRanksPurchased(): number {
    return this.state.runResearchRanksPurchased;
  }

  serialize(): unknown {
    return { ...this.state };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<StatsState>;
    const defaults = this.getDefaultState();
    this.state = {
      playtimeSeconds: d.playtimeSeconds ?? defaults.playtimeSeconds,
      realignCount: d.realignCount ?? defaults.realignCount,
      totalInsightEarned: d.totalInsightEarned ?? defaults.totalInsightEarned,
      lifetimeResourcesProduced: {
        ...defaults.lifetimeResourcesProduced,
        ...d.lifetimeResourcesProduced,
      },
      lifetimeResourcesSpent: {
        ...defaults.lifetimeResourcesSpent,
        ...d.lifetimeResourcesSpent,
      },
      totalBuildingsPurchased:
        d.totalBuildingsPurchased ?? defaults.totalBuildingsPurchased,
      totalAgentsTrained: d.totalAgentsTrained ?? defaults.totalAgentsTrained,
      totalResearchRanksPurchased:
        d.totalResearchRanksPurchased ?? defaults.totalResearchRanksPurchased,
      runResourcesProduced: {
        ...defaults.runResourcesProduced,
        ...d.runResourcesProduced,
      },
      runBuildingsPurchased: d.runBuildingsPurchased ?? defaults.runBuildingsPurchased,
      runAgentsTrained: d.runAgentsTrained ?? defaults.runAgentsTrained,
      runResearchRanksPurchased:
        d.runResearchRanksPurchased ?? defaults.runResearchRanksPurchased,
      allTimePeakResources: {
        ...defaults.allTimePeakResources,
        ...d.allTimePeakResources,
      },
      maxAgentsOwnedAtOnce: d.maxAgentsOwnedAtOnce ?? defaults.maxAgentsOwnedAtOnce,
      maxBuildingsOwnedAtOnce:
        d.maxBuildingsOwnedAtOnce ?? defaults.maxBuildingsOwnedAtOnce,
    };
  }
}
