import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';
import { AgentsModule } from '../src/modules/agents/AgentsModule';
import { EpochModule } from '../src/modules/epoch';
import { renderEpochWheel } from '../src/ui/epochWheel';

describe('renderEpochWheel', () => {
  let game: Game;
  let res: ResourcesModule;
  let ag: AgentsModule;
  let ep: EpochModule;

  beforeEach(async () => {
    game = new Game();
    res = new ResourcesModule();
    ag = new AgentsModule();
    ep = new EpochModule();
    game.register(res);
    game.register(ag);
    game.register(ep);
    await game.boot();
  });

  it('draws an SVG wheel with progress arc and epoch number', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10); // finish one reasoner
    ep.tick(2); // give it some progress

    const host = document.createElement('div');
    renderEpochWheel(host, 'reasoner', game);

    const svg = host.querySelector('svg.epoch-wheel');
    expect(svg).not.toBeNull();

    const bg = host.querySelector('.epoch-wheel-bg');
    const fg = host.querySelector('.epoch-wheel-progress');
    expect(bg).not.toBeNull();
    expect(fg).not.toBeNull();

    const text = host.querySelector('text');
    expect(text?.textContent).toBe('1');

    const title = host.querySelector('title');
    expect(title?.textContent).toContain('Reasoner');
    expect(title?.textContent).toContain('Completed epochs: 0');
  });

  it('shows the next epoch number after a completion', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);
    ep.tick(20); // enough to complete at least one epoch

    const host = document.createElement('div');
    renderEpochWheel(host, 'reasoner', game);

    const text = host.querySelector('text');
    const completed = ep.countFor('reasoner');
    expect(Number(text?.textContent)).toBe(completed + 1);
    expect(completed).toBeGreaterThanOrEqual(1);
  });

  it('renders nothing when the epoch module is missing', () => {
    const gameWithoutEpoch = new Game();
    gameWithoutEpoch.register(new ResourcesModule());
    gameWithoutEpoch.register(new AgentsModule());

    const host = document.createElement('div');
    renderEpochWheel(host, 'reasoner', gameWithoutEpoch);

    expect(host.innerHTML).toBe('');
  });

  it('uses the archetype color on the progress arc', () => {
    res.add('data', 1000);
    res.add('compute', 1000);
    ag.startTraining('reasoner');
    ag.tick(10);

    const host = document.createElement('div');
    renderEpochWheel(host, 'reasoner', game);

    const fg = host.querySelector('.epoch-wheel-progress') as SVGCircleElement | null;
    expect(fg).not.toBeNull();
    expect(fg?.getAttribute('stroke')).toBe('#4cc9f0');
  });
});
