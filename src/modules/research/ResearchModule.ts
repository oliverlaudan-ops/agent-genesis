/**
 * Research module.
 *
 * A lightweight, rank-based technology tree. Nodes are unlocked by total
 * building count, purchased resources, or prerequisite research. Each node
 * can have multiple ranks; costs scale with the current rank.
 *
 * Research produces *static modifiers* that other modules query. This keeps
 * the research module decoupled from buildings/agents — they just ask
 * `getEffect('buildingRateMult', buildingId)` etc.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';
import { ResourcesModule } from '@modules/resources';

export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  /** prerequisite research ids */
  requires?: string[];
  /** total building count needed before the node is visible */
  unlockAtBuildings?: number;
  /** resource cost for the next rank */
  baseCost: Partial<Record<string, number>>;
  costMultiplier: number;
  maxRank: number;
  /** effect type + target id + magnitude per rank */
  effect: {
    kind: ResearchEffectKind;
    targetId: string;
    valuePerRank: number;
  };
}

export type ResearchEffectKind =
  | 'buildingRateMult' // multiplies a building's production
  | 'agentTrainingSpeedMult' // divides training time for an archetype
  | 'agentProduction' // agents directly produce resources (units/sec per agent)
  | 'agentBoostMult' // amplifies agent boost multiplier
  | 'resourceCapBonus'; // adds to a capped resource's maximum

export const RESEARCH_DEFS: ResearchNode[] = [
  {
    id: 'data-compression',
    name: 'Data Compression',
    description: 'Pack more signal into every stream. Data Mines produce more.',
    baseCost: { data: 60, compute: 20 },
    costMultiplier: 1.3,
    maxRank: 5,
    effect: { kind: 'buildingRateMult', targetId: 'data-mine', valuePerRank: 0.2 },
  },
  {
    id: 'market-algorithms',
    name: 'Market Algorithms',
    description: 'Smarter VC deployment. VC Funds produce more capital.',
    requires: ['data-compression'],
    unlockAtBuildings: 5,
    baseCost: { data: 120, compute: 60 },
    costMultiplier: 1.35,
    maxRank: 5,
    effect: { kind: 'buildingRateMult', targetId: 'vc-fund', valuePerRank: 0.25 },
  },
  {
    id: 'parallel-training',
    name: 'Parallel Training',
    description: 'Distribute gradients across agents. Reasoners train faster.',
    unlockAtBuildings: 4,
    baseCost: { compute: 80, data: 40 },
    costMultiplier: 1.4,
    maxRank: 4,
    effect: { kind: 'agentTrainingSpeedMult', targetId: 'reasoner', valuePerRank: 0.15 },
  },
  {
    id: 'synthetic-datasets',
    name: 'Synthetic Datasets',
    description: 'Reasoners generate curated training data passively.',
    requires: ['parallel-training'],
    baseCost: { compute: 150, data: 100 },
    costMultiplier: 1.45,
    maxRank: 3,
    effect: { kind: 'agentProduction', targetId: 'reasoner', valuePerRank: 0.05 },
  },
  {
    id: 'auto-trading',
    name: 'Auto-Trading',
    description: 'Coders run micro-arbitrage bots, producing capital directly.',
    unlockAtBuildings: 6,
    baseCost: { compute: 100, capital: 50 },
    costMultiplier: 1.45,
    maxRank: 3,
    effect: { kind: 'agentProduction', targetId: 'coder', valuePerRank: 0.03 },
  },
  {
    id: 'ethical-oversight',
    name: 'Ethical Oversight',
    description: 'Raises the alignment ceiling, allowing riskier research.',
    baseCost: { compute: 120, data: 100, capital: 60 },
    costMultiplier: 1.5,
    maxRank: 5,
    effect: { kind: 'resourceCapBonus', targetId: 'alignment', valuePerRank: 0.15 },
  },
  {
    id: 'swarm-coordination',
    name: 'Swarm Coordination',
    description: 'Planners amplify every other agent’s boost multiplier.',
    requires: ['synthetic-datasets', 'auto-trading'],
    baseCost: { compute: 300, data: 200, capital: 100 },
    costMultiplier: 1.6,
    maxRank: 3,
    effect: { kind: 'agentBoostMult', targetId: '*', valuePerRank: 0.1 },
  },
];

interface ResearchState {
  ranks: Record<string, number>;
}

/**
 * Lightweight duck-typed view of BuildingsModule that lets ResearchModule
 * stay decoupled from a direct import. Avoids a cycle between
 * modules/buildings ↔ modules/research.
 */
interface BuildingsLike {
  count(id: string): number;
  totalBuildings(): number;
}

export class ResearchModule implements GameModule {
  readonly id = 'research';

  private state: ResearchState = { ranks: {} };
  private resources!: ResourcesModule;
  private bus!: Game['bus'];
  private game!: Game;

  init(game: Game): void {
    const res = game.modules.get('resources');
    if (!(res instanceof ResourcesModule)) {
      throw new Error('ResearchModule requires ResourcesModule to be registered first');
    }
    this.resources = res;
    this.bus = game.bus;
    this.game = game;

    // Initial sync of static effects like resource caps.
    this.syncStaticEffects();
  }

  tick(): void {
    // Research is event-driven (purchases). Nothing to do every frame.
  }

  /**
   * Push static research effects (like resource caps) to other modules.
   * Called on init and after every purchase.
   */
  private syncStaticEffects(): void {
    // Sync Alignment cap bonus.
    const alignmentBonus = this.getEffect('resourceCapBonus', 'alignment');
    this.resources.setCapBonus('alignment', alignmentBonus);
  }

  /** Whether the node is visible in the UI. */
  isUnlocked(node: ResearchNode): boolean {
    if (node.requires && node.requires.some((id) => this.rank(id) === 0)) return false;

    if (node.unlockAtBuildings !== undefined) {
      const bld = this.game.modules.get('buildings') as BuildingsLike | undefined;
      if (!bld) return false;
      return bld.totalBuildings() >= node.unlockAtBuildings;
    }

    return true;
  }

  rank(id: string): number {
    return this.state.ranks[id] ?? 0;
  }

  isMaxed(node: ResearchNode): boolean {
    return this.rank(node.id) >= node.maxRank;
  }

  costFor(node: ResearchNode): Partial<Record<string, number>> {
    const owned = this.rank(node.id);
    const out: Partial<Record<string, number>> = {};
    for (const [rid, base] of Object.entries(node.baseCost)) {
      out[rid] = Math.ceil((base ?? 0) * Math.pow(node.costMultiplier, owned));
    }
    return out;
  }

  /** Reset current-run research ranks (prestige realignment). */
  resetRun(): void {
    this.state.ranks = {};
    this.syncStaticEffects();
  }

  /** Total purchased research ranks across all nodes. */
  totalRanks(): number {
    let total = 0;
    for (const rank of Object.values(this.state.ranks)) {
      total += rank ?? 0;
    }
    return total;
  }

  /** Attempt to purchase the next rank. Returns true on success. */
  purchase(id: string): boolean {
    const node = RESEARCH_DEFS.find((n) => n.id === id);
    if (!node) return false;
    if (!this.isUnlocked(node)) return false;
    if (this.isMaxed(node)) return false;
    const cost = this.costFor(node);
    if (!this.resources.spend(cost)) return false;

    this.state.ranks[id] = (this.state.ranks[id] ?? 0) + 1;
    this.bus.emit('research:purchased', { id, rank: this.state.ranks[id] });

    // Ensure static effects are updated immediately.
    this.syncStaticEffects();

    // Emit unlock events for nodes that may now be visible.
    for (const n of RESEARCH_DEFS) {
      if (n.id !== id && this.isUnlocked(n) && this.rank(n.id) === 0) {
        this.bus.emit('research:unlocked', { id: n.id });
      }
    }
    return true;
  }

  /**
   * Aggregate effect value for a given kind/target.
   * For multiplicative kinds this is the total multiplier (1.0 = base).
   * For additive effects (agentProduction, resourceCapBonus) it is the sum.
   */
  getEffect(kind: ResearchEffectKind, targetId: string): number {
    let value = 0;
    for (const node of RESEARCH_DEFS) {
      if (node.effect.kind !== kind) continue;
      // targetId '*' matches every target for multiplicative effects.
      if (node.effect.targetId !== targetId && node.effect.targetId !== '*') continue;
      value += node.effect.valuePerRank * this.rank(node.id);
    }

    const isMultiplicative: ResearchEffectKind[] = [
      'buildingRateMult',
      'agentTrainingSpeedMult',
      'agentBoostMult',
    ];
    if (isMultiplicative.includes(kind)) {
      return 1 + value;
    }
    return value;
  }

  /** Training duration multiplier for an agent archetype (< 1.0 means faster). */
  trainingSpeedMult(archetypeId: string): number {
    const mult = this.getEffect('agentTrainingSpeedMult', archetypeId);
    // mult ≥ 1.0; we want the duration divisor, so return 1 / mult.
    return 1 / mult;
  }

  serialize(): unknown {
    return { ranks: { ...this.state.ranks } };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<ResearchState>;
    if (d.ranks) this.state.ranks = { ...d.ranks };
  }
}
