/**
 * GameModule contract.
 *
 * Every gameplay module (resources, buildings, agents, …) implements this.
 * The Game orchestrator never reaches into a module's internals — it only
 * calls lifecycle hooks and serialize/deserialize for save support.
 */
import type { Game as GameClass } from './Game';

export interface GameModule {
  /** Stable id used as the key in save blobs. Never change after release. */
  readonly id: string;

  /** Called once during boot, after registration and after the bus is up. */
  init(game: GameClass): void | Promise<void>;

  /** Called every engine tick with delta in seconds. */
  tick(dt: number): void;

  /** Return this module's save slice. Must be JSON-serializable. */
  serialize(): unknown;

  /** Restore this module's state from a save slice. */
  deserialize(data: unknown): void;
}
