import { describe, it, expect, beforeEach } from 'vitest';
import { ResourcesModule } from '../src/modules/resources/ResourcesModule';

describe('ResourcesModule', () => {
  let res: ResourcesModule;

  beforeEach(() => {
    res = new ResourcesModule();
    res.init({} as never);
  });

  it('starts with the default starting amounts', () => {
    expect(res.get('compute')).toBe(50);
    expect(res.get('data')).toBe(25);
    expect(res.get('capital')).toBe(10);
    expect(res.get('alignment')).toBe(0.5);
  });

  it('spend deducts cost atomically and refuses partial spends', () => {
    const ok = res.spend({ compute: 100, data: 5 });
    expect(ok).toBe(false);
    expect(res.get('compute')).toBe(50); // untouched

    const ok2 = res.spend({ compute: 10 });
    expect(ok2).toBe(true);
    expect(res.get('compute')).toBe(40);
  });

  it('tick adds resources per rate', () => {
    res.setRate('data', 1); // 1 per second
    res.tick(2);
    expect(res.get('data')).toBe(27);
  });

  it('clamps alignment to [0, 1]', () => {
    res.add('alignment', 100);
    expect(res.get('alignment')).toBe(1);
    res.add('alignment', -100);
    expect(res.get('alignment')).toBe(0);
  });
});
