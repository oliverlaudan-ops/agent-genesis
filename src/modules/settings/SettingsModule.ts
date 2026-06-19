/**
 * Settings module.
 *
 * Persists player preferences that are not tied to a specific run, such as
 * visual toggles. Stored as part of the save blob, but defaults are safe
 * (Canvas2D on touch devices) so older saves without this slice keep working.
 */
import type { Game } from '@core/Game';
import type { GameModule } from '@core/GameModule';

export interface SettingsState {
  /** Force-enable the experimental WebGL renderer on touch devices. */
  webglEnabled: boolean;
}

const DEFAULT_STATE: SettingsState = {
  webglEnabled: false,
};

export class SettingsModule implements GameModule {
  readonly id = 'settings';

  private state: SettingsState = { ...DEFAULT_STATE };

  init(_game: Game): void {
    // nothing to wire up at boot
  }

  tick(): void {
    // event-driven
  }

  get webglEnabled(): boolean {
    return this.state.webglEnabled;
  }

  setWebglEnabled(value: boolean): void {
    this.state.webglEnabled = value;
  }

  serialize(): unknown {
    return { ...this.state };
  }

  deserialize(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<SettingsState>;
    this.state = {
      webglEnabled: d.webglEnabled ?? DEFAULT_STATE.webglEnabled,
    };
  }
}
