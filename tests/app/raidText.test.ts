// The night's line about a raid (owner, after the 0.28.0 build: "Show
// strength vs defense in the night message").
import { describe, expect, it } from 'vitest';
import { raidText } from '../../src/app/lab/raidText';

const base = { campId: 2, stolen: [], upgradesLost: 0, animalsTaken: 0 };

describe('the raid line of the night message', () => {
  it('gives the marauders’ strength and the camp’s defense when they are turned away', () => {
    const text = raidText({ ...base, strength: 2, defense: 3, turnedAway: true });
    expect(text).toContain('strength 2');
    expect(text).toContain('defense 3');
    expect(text).toContain('camp 2');
    expect(text).toContain('turned them away');
  });

  it('gives both, how far short the camp was, and what was taken, when they get in', () => {
    const text = raidText({
      ...base,
      strength: 4,
      defense: 1,
      turnedAway: false,
      stolen: [{ item: 'wood', count: 30 }],
      upgradesLost: 2,
    });
    expect(text).toContain('strength 4');
    expect(text).toContain('defense 1');
    expect(text).toContain('3 short');
    expect(text).toContain('30 wood');
    expect(text).toContain('2 upgrades');
    // What would have stopped them.
    expect(text).toContain('defense 4');
  });

  it('says so when a camp has no defenses, and when nothing was there to take', () => {
    const text = raidText({ ...base, strength: 1, defense: 0, turnedAway: false });
    expect(text).toContain('strength 1');
    expect(text).toContain('no defenses');
    expect(text).toContain('took nothing');
  });
});
