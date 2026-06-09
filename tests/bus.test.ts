import { describe, it, expect, beforeEach } from 'vitest';
import { Bus } from '../src/core/Bus';

describe('Bus', () => {
  let bus: Bus;

  beforeEach(() => {
    bus = new Bus();
  });

  it('delivers emitted events to listeners', () => {
    let received = 0;
    bus.on('tick', () => received++);
    bus.emit('tick', 0.1);
    bus.emit('tick', 0.1);
    expect(received).toBe(2);
  });

  it('stops delivering after unsubscribe', () => {
    let received = 0;
    const off = bus.on('tick', () => received++);
    bus.emit('tick', 0.1);
    off();
    bus.emit('tick', 0.1);
    expect(received).toBe(1);
  });

  it('does not let one bad listener kill others', () => {
    const calls: string[] = [];
    bus.on('tick', () => calls.push('a'));
    bus.on('tick', () => {
      throw new Error('boom');
    });
    bus.on('tick', () => calls.push('c'));
    bus.emit('tick', 0.1);
    expect(calls).toEqual(['a', 'c']);
  });
});
