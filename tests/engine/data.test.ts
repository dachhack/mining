import { describe, expect, it } from 'vitest';
import { GAME_DATA, blockDefByCode, itemDef, validateData } from '../../src/data';
import type { GameData } from '../../src/data';

/** Run the validator on a deep copy of the real data after `breakIt` has changed it. */
function problemsAfter(breakIt: (data: GameData) => void): string[] {
  // `structuredClone` is the built-in equivalent of Python's `copy.deepcopy`.
  const data = structuredClone(GAME_DATA);
  breakIt(data);
  return validateData(data);
}

/**
 * Look up `table[key]`, failing the test if it is missing. (With this repo's
 * compiler settings, indexing a dict gives "value or undefined".)
 */
function entry<T>(table: Record<string, T>, key: string): T {
  const value = table[key];
  if (value === undefined) {
    throw new Error(`Test setup: no entry "${key}"`);
  }
  return value;
}

describe('validateData', () => {
  it('finds no problems in the real data', () => {
    expect(validateData(GAME_DATA)).toEqual([]);
  });

  it('reports a recipe input that names an unknown item', () => {
    const problems = problemsAfter((data) => {
      data.recipes.push({
        id: 'broken',
        name: 'Broken',
        inputs: [{ item: 'unobtainium', count: 1 }],
        output: { kind: 'item', item: 'ladder', count: 1 },
      });
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('recipe "broken"');
    expect(problems[0]).toContain('unobtainium');
  });

  it('reports a recipe output that names an unknown item or gauge', () => {
    const problems = problemsAfter((data) => {
      data.recipes.push({
        id: 'badItem',
        name: 'Bad item',
        inputs: [{ item: 'coal', count: 1 }],
        output: { kind: 'item', item: 'nothing', count: 1 },
      });
      data.recipes.push({
        id: 'badGauge',
        name: 'Bad gauge',
        inputs: [{ item: 'coal', count: 1 }],
        output: { kind: 'gauge', gauge: 'steam', amount: 1 },
      });
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('unknown item "nothing"');
    expect(problems[1]).toContain('unknown gauge "steam"');
  });

  it('reports a recipe with no inputs, a zero count, or a repeated id', () => {
    const problems = problemsAfter((data) => {
      data.recipes.push({
        id: 'ladder',
        name: 'Free ladders',
        inputs: [],
        output: { kind: 'item', item: 'ladder', count: 0 },
      });
    });
    expect(problems.some((p) => p.includes('used more than once'))).toBe(true);
    expect(problems.some((p) => p.includes('has no inputs'))).toBe(true);
    expect(problems.some((p) => p.includes('output count'))).toBe(true);
  });

  it('reports a negative mine cost', () => {
    const problems = problemsAfter((data) => {
      entry(data.blocks, 'stone').mineCost = -1;
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('block "stone"');
    expect(problems[0]).toContain('mine cost');
  });

  it('reports a yield that names a missing item', () => {
    const problems = problemsAfter((data) => {
      delete data.items['coal'];
    });
    // Coal is a yield (coal seam) and an input of three recipes.
    expect(problems.some((p) => p.includes('block "coalSeam": yield'))).toBe(true);
    expect(problems.some((p) => p.includes('recipe "fuel": input'))).toBe(true);
    expect(problems.every((p) => p.includes('"coal"'))).toBe(true);
  });

  it('reports two blocks with the same code, and a code that does not fit a byte', () => {
    const sameCode = problemsAfter((data) => {
      entry(data.blocks, 'dirt').code = entry(data.blocks, 'stone').code;
    });
    expect(sameCode.some((p) => p.includes('same code'))).toBe(true);

    const tooBig = problemsAfter((data) => {
      entry(data.blocks, 'dirt').code = 256;
    });
    expect(tooBig.some((p) => p.includes('block "dirt" has code 256'))).toBe(true);
  });

  it('reports an unmineable block with a yield, and a drill cost above the normal cost', () => {
    const problems = problemsAfter((data) => {
      entry(data.blocks, 'bedrock').yields = [{ item: 'stone', count: 1 }];
      entry(data.blocks, 'hardRock').mineCostWithDrill = 4;
    });
    expect(problems.some((p) => p.includes('"bedrock" cannot be mined'))).toBe(true);
    expect(problems.some((p) => p.includes('"hardRock" costs more to mine with a drill'))).toBe(
      true,
    );
  });

  it('reports a missing air block', () => {
    const problems = problemsAfter((data) => {
      delete data.blocks['air'];
    });
    expect(problems.some((p) => p.includes('block "air"'))).toBe(true);
  });

  it('reports a negative item weight', () => {
    const problems = problemsAfter((data) => {
      entry(data.items, 'stone').weight = -2;
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('item "stone"');
  });

  it('reports depth bands that leave a gap or do not reach the bottom', () => {
    const gap = problemsAfter((data) => {
      const middle = data.world.depthBands.find((band) => band.id === 'middle');
      if (middle !== undefined) {
        middle.firstLayer = 9;
      }
    });
    expect(gap.some((p) => p.includes('depth band "middle" starts at layer 9'))).toBe(true);

    const short = problemsAfter((data) => {
      data.world.depthBands.pop();
    });
    expect(short.some((p) => p.includes('the cube has 32 layers'))).toBe(true);
  });

  it('reports a start position that is not on the surface', () => {
    const underground = problemsAfter((data) => {
      data.world.startPosition.z = 0;
    });
    expect(underground.some((p) => p.includes('startPosition'))).toBe(true);

    const outside = problemsAfter((data) => {
      data.world.startPosition.x = data.world.size.x;
    });
    expect(outside.some((p) => p.includes('startPosition'))).toBe(true);
  });

  it('reports a structure placed from an unknown item, or using code 0', () => {
    const problems = problemsAfter((data) => {
      const torch = entry(data.structures, 'torch');
      torch.placedFromItem = 'candle';
      torch.code = 0;
    });
    expect(problems.some((p) => p.includes('unknown item "candle"'))).toBe(true);
    expect(problems.some((p) => p.includes('structure "torch" has code 0'))).toBe(true);
  });

  it('reports bad avatar and shift numbers', () => {
    const problems = problemsAfter((data) => {
      data.avatar.startHealth = 0;
      data.avatar.fatalFallBlocks = data.avatar.freeFallBlocks; // must be more
      data.shift.apPerShift = 0;
      data.shift.bankedApPerRefund = 0;
      data.actionCosts.move = -1;
    });
    expect(problems.some((p) => p.includes('avatar.startHealth'))).toBe(true);
    expect(problems.some((p) => p.includes('avatar.fatalFallBlocks'))).toBe(true);
    expect(problems.some((p) => p.includes('shift.apPerShift'))).toBe(true);
    expect(problems.some((p) => p.includes('shift.bankedApPerRefund'))).toBe(true);
    expect(problems.some((p) => p.includes('actionCosts.move'))).toBe(true);
  });

  it('reports a loadout with an unknown item, too much weight, or a missing default', () => {
    const problems = problemsAfter((data) => {
      const standard = entry(data.loadouts, 'standard');
      standard.items.push({ item: 'jetpack', count: 1 });
      // Enough stone to weigh more than the avatar can carry.
      const stoneWeight = entry(data.items, 'stone').weight;
      const tooMany = Math.floor(data.avatar.carryCapacity / stoneWeight) + 1;
      standard.items.push({ item: 'stone', count: tooMany });
      data.defaultLoadoutId = 'deluxe';
    });
    expect(problems.some((p) => p.includes('unknown item "jetpack"'))).toBe(true);
    expect(problems.some((p) => p.includes('more than the carry capacity'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown loadout "deluxe"'))).toBe(true);
  });
});

describe('data lookups', () => {
  it('finds a block by its code and throws on an unknown code', () => {
    expect(blockDefByCode(0).name).toBe('Open space');
    expect(blockDefByCode(entry(GAME_DATA.blocks, 'stone').code).name).toBe('Stone');
    expect(() => blockDefByCode(200)).toThrow('Unknown block code');
  });

  it('finds an item by its id and throws on an unknown id', () => {
    expect(itemDef('timber').name).toBe('Timber');
    expect(() => itemDef('jetpack')).toThrow('Unknown item id');
  });
});
