import { describe, expect, it } from 'vitest';
import {
  GAME_DATA,
  blockDefByCode,
  findCampRecipe,
  findRecipe,
  itemDef,
  validateData,
} from '../../src/data';
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
        output: { kind: 'item', item: 'support', count: 1 },
      });
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('recipe "broken"');
    expect(problems[0]).toContain('unobtainium');
  });

  it('does not take a name every object inherits for an item', () => {
    const problems = problemsAfter((data) => {
      data.recipes.push({
        id: 'sneaky',
        name: 'Sneaky',
        inputs: [{ item: 'toString', count: 1 }],
        output: { kind: 'item', item: 'constructor', count: 1 },
      });
      data.defaultLoadoutId = 'valueOf';
    });
    expect(problems).toHaveLength(3);
    expect(problems.some((p) => p.includes('unknown item "toString"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown item "constructor"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown loadout "valueOf"'))).toBe(true);
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
        id: 'support',
        name: 'Free supports',
        inputs: [],
        output: { kind: 'item', item: 'support', count: 0 },
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

  it('has no carrying numbers: no item weight, no carry capacity, no pick-up, drop or stash cost (issue #92)', () => {
    // Design doc 4.1 and 5.4: the stockpile has no limit.
    for (const item of Object.values(GAME_DATA.items)) {
      expect(Object.keys(item)).toEqual(['name']);
    }
    // The avatar table (it held only the carry capacity) is gone.
    expect(Object.keys(GAME_DATA)).not.toContain('avatar');
    const costNames = Object.keys(GAME_DATA.actionCosts);
    for (const gone of ['pickUp', 'drop', 'stash', 'leave']) {
      expect(costNames).not.toContain(gone);
    }
    // "Close the mine" costs 0 AP (design doc 4.1; owner question 88).
    expect(GAME_DATA.actionCosts.closeMine).toBe(0);
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

  it('reports bad numbers for underground spaces', () => {
    const problems = problemsAfter((data) => {
      const middle = data.generation.bands[1];
      const deep = data.generation.bands[2];
      if (middle === undefined || deep === undefined) throw new Error('test setup');
      data.generation.spacePlacementTries = 0;
      // The middle band lists water, gas and caverns, in that order.
      (middle.spaces[0] as { kind: string }).kind = 'acid';
      (middle.spaces[1] as { maxSize: number }).maxSize = 100; // 400 units of gas
      (middle.spaces[2] as { spacesPer1000Cells: number }).spacesPer1000Cells = 0;
      // A second entry for lava in the deep band, smaller than its own minimum.
      deep.spaces.push({ kind: 'lava', spacesPer1000Cells: 1, minSize: 5, maxSize: 4 });
    });
    for (const part of [
      'generation.spacePlacementTries',
      'space "acid": the kind must be cavern, water, lava or gas',
      'would hold 400 units',
      'space "cavern": spacesPer1000Cells must be more than 0',
      'space "lava": the kind is listed more than once',
      'space "lava": maxSize (at least minSize)',
    ]) {
      expect(
        problems.some((p) => p.includes(part)),
        `no problem mentions ${part}`,
      ).toBe(true);
    }
    expect(problems).toHaveLength(6);
  });

  it('reports a structure placed from an unknown item, or using code 0', () => {
    const problems = problemsAfter((data) => {
      const support = entry(data.structures, 'support');
      support.placedFromItem = 'candle';
      support.code = 0;
    });
    expect(problems.some((p) => p.includes('unknown item "candle"'))).toBe(true);
    expect(problems.some((p) => p.includes('structure "support" has code 0'))).toBe(true);
  });

  it('reports bad crew, avatar and shift numbers', () => {
    const problems = problemsAfter((data) => {
      data.crew.startHealth = 0;
      data.shift.apPerShift = 0;
      data.actionCosts.move = -1;
    });
    expect(problems.some((p) => p.includes('crew.startHealth'))).toBe(true);
    expect(problems.some((p) => p.includes('shift.apPerShift'))).toBe(true);
    expect(problems.some((p) => p.includes('actionCosts.move'))).toBe(true);
  });

  it('reports bad mineral-trace data', () => {
    const problems = problemsAfter((data) => {
      data.tells.mineralTraces.distance = 0;
      data.tells.mineralTraces.sourceBlocks = ['ironOre', 'mithril', 'air', 'ironOre'];
      data.tells.mineralTraces.shownOnBlocks = [];
    });
    expect(problems.some((p) => p.includes('tells.mineralTraces.distance'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown block "mithril"'))).toBe(true);
    expect(problems.some((p) => p.includes('"air", which is not a solid block'))).toBe(true);
    expect(problems.some((p) => p.includes('lists block "ironOre" more than once'))).toBe(true);
    expect(problems.some((p) => p.includes('shownOnBlocks is empty'))).toBe(true);
  });

  it('reports a block that both gives mineral traces and shows them', () => {
    const problems = problemsAfter((data) => {
      data.tells.mineralTraces.shownOnBlocks.push('crystal');
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('lists block "crystal" more than once');
  });

  it('reports a loadout with an unknown item or a missing default; a big kit is fine', () => {
    const problems = problemsAfter((data) => {
      const standard = entry(data.loadouts, 'standard');
      standard.items.push({ item: 'jetpack', count: 1 });
      // The stockpile has no limit, so no kit is too big (issue #92).
      standard.items.push({ item: 'stone', count: 1000 });
      data.defaultLoadoutId = 'deluxe';
    });
    expect(problems.some((p) => p.includes('unknown item "jetpack"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown loadout "deluxe"'))).toBe(true);
    expect(problems).toHaveLength(2);
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
    // Names every JavaScript object inherits are not items.
    expect(() => itemDef('constructor')).toThrow('Unknown item id');
    expect(() => itemDef('toString')).toThrow('Unknown item id');
  });

  // --- Generation (src/data/generation.ts) ---

  it('reports generation data that names an unknown band or misses one', () => {
    const problems = problemsAfter((data) => {
      const first = data.generation.bands[0];
      if (first !== undefined) {
        first.bandId = 'attic';
      }
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('"attic"');
    expect(problems[1]).toContain('depth band "upper" has no entry');
  });

  it('reports a band listed twice in the generation data', () => {
    const problems = problemsAfter((data) => {
      const first = data.generation.bands[0];
      if (first !== undefined) {
        data.generation.bands.push(structuredClone(first));
      }
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('listed more than once');
  });

  it('reports generated blocks that are unknown or cannot be dug', () => {
    const problems = problemsAfter((data) => {
      const upper = data.generation.bands[0];
      upper?.rock.push({ block: 'air', weightAtTop: 1, weightAtBottom: 1 });
      upper?.veins.push({ block: 'bedrock', veinsPer1000Cells: 1, minSize: 2, maxSize: 3 });
      upper?.veins.push({ block: 'cheese', veinsPer1000Cells: 1, minSize: 2, maxSize: 3 });
    });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('"air"');
    expect(problems[1]).toContain('"bedrock"');
    expect(problems[2]).toContain('unknown block "cheese"');
  });

  it('reports a block listed twice in one band', () => {
    const problems = problemsAfter((data) => {
      data.generation.bands[0]?.veins.push({
        block: 'dirt',
        veinsPer1000Cells: 1,
        minSize: 2,
        maxSize: 3,
      });
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"dirt" is listed more than once');
  });

  it('reports bad rock weights', () => {
    const negative = problemsAfter((data) => {
      const rock = data.generation.bands[0]?.rock[0];
      if (rock !== undefined) {
        rock.weightAtTop = -1;
      }
    });
    expect(negative).toHaveLength(1);
    expect(negative[0]).toContain('negative or invalid weight');

    const allZero = problemsAfter((data) => {
      for (const rock of data.generation.bands[0]?.rock ?? []) {
        rock.weightAtBottom = 0;
      }
    });
    expect(allZero).toHaveLength(1);
    expect(allZero[0]).toContain('add up to more than 0');

    const noRock = problemsAfter((data) => {
      const upper = data.generation.bands[0];
      if (upper !== undefined) {
        upper.rock = [];
      }
    });
    expect(noRock).toHaveLength(1);
    expect(noRock[0]).toContain('add up to more than 0');
  });

  it('reports bad vein numbers', () => {
    const problems = problemsAfter((data) => {
      const vein = data.generation.bands[0]?.veins[0];
      if (vein !== undefined) {
        vein.veinsPer1000Cells = 0;
        vein.minSize = 0;
        vein.maxSize = 2.5;
      }
      data.generation.veinPlacementTries = 0;
    });
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('veinPlacementTries');
    expect(problems[1]).toContain('veinsPer1000Cells');
    expect(problems[2]).toContain('minSize');
    expect(problems[3]).toContain('maxSize');

    const upsideDown = problemsAfter((data) => {
      const vein = data.generation.bands[0]?.veins[0];
      if (vein !== undefined) {
        vein.minSize = 6;
        vein.maxSize = 5;
      }
    });
    expect(upsideDown).toHaveLength(1);
    expect(upsideDown[0]).toContain('maxSize');
  });
});

// The tables the M2 skeleton added (issue #50): the numbers of decision note
// 0014, checked against the note so that a typo in src/data shows here, and
// the validator's checks on them.
describe('M2 data (decision note 0014)', () => {
  it('gives every block that can be dug its slump limit (design doc 3.5)', () => {
    const limits: Record<string, number | null> = {};
    for (const [blockId, block] of Object.entries(GAME_DATA.blocks)) {
      limits[blockId] = block.slumpLimit;
    }
    // Dirt and rubble 1, hard rock and crystal 3, every other block 2.
    expect(limits).toEqual({
      air: null,
      bedrock: null,
      dirt: 1,
      rubble: 1,
      hardRock: 3,
      crystal: 3,
      stone: 2,
      coalSeam: 2,
      timberRoot: 2,
      ironOre: 2,
      copperOre: 2,
      unstableOre: 2,
      relic: 2,
      keystone: 2,
      sealed: 2,
    });
  });

  it('has rubble and sealed rock as the note describes them (items 8 and 12)', () => {
    const rubble = entry(GAME_DATA.blocks, 'rubble');
    expect([rubble.solid, rubble.mineCost, rubble.yields]).toEqual([true, 1, []]);
    const sealed = entry(GAME_DATA.blocks, 'sealed');
    expect([sealed.solid, sealed.mineCost, sealed.yields]).toEqual([true, 2, []]);
    // New codes only: the codes of the M1 blocks are part of the save format.
    expect(entry(GAME_DATA.blocks, 'bedrock').code).toBe(12);
    expect([rubble.code, sealed.code]).toEqual([13, 14]);
  });

  it('has the hazard numbers of the note', () => {
    expect(GAME_DATA.hazards).toEqual({
      slump: { crackCountdown: 2, steepStep: 2 },
      water: {
        unitsPerCell: 1,
        floodedMineExtraAp: 1,
        flowMinDrop: 2,
        pumpUnitsPerShift: 3,
        pumpReach: 2,
      },
      gas: { pocketUnitsPerCell: 4, ventReach: 2 },
      explosion: {
        blastReach: 1,
        chanceBlocks: ['relic', 'keystone'],
        chanceBlockDestroyed: 0.5,
      },
      lava: {
        unitsPerCell: 1,
        flowEveryShifts: 2,
        sourcePocketCellsOver: 8,
        sourceUnitsPerStep: 1,
        sourceKeepsUnits: 1,
      },
      forecast: { unseenBlock: 'stone' },
    });
    expect(GAME_DATA.tells.hazards).toEqual({
      dampStoneDistance: 1,
      pittedRockDistance: 1,
      warmGlowDistance: 2,
    });
  });

  it('has the camp numbers of design doc 8, and the camp tools of the note (item 31)', () => {
    expect(GAME_DATA.camps).toEqual({
      kitItem: 'campKit',
      halfWidth: 1,
      foundMinAp: 1,
      restMinAp: 1,
      upkeepFuel: 1,
      upkeepEveryShifts: 4,
      // Mining near a camp is cheaper (owner, question 90).
      mineDiscountAp: 1,
      mineMinAp: 1,
      mineDiscountSteps: 4,
      mineDiscountMaxDeeper: 4,
    });
    expect(GAME_DATA.campTools).toEqual({
      drillItem: 'drill',
      sealantItem: 'sealant',
      sealedBlock: 'sealed',
      scanChargeItem: 'scannerCharge',
      scanChargesPerScan: 1,
      // 3 x 3 squares, 3 blocks under each top (owner question 93).
      scanHalfWidth: 1,
      scanDepth: 3,
    });
  });

  it('has the camp recipes of design doc 7.2, each with its own id', () => {
    /** "2 rawIronOre + 1 coal -> 2 ironIngot" */
    const lines = GAME_DATA.campRecipes.map((recipe) => {
      const inputs = recipe.inputs.map((stack) => `${stack.count} ${stack.item}`).join(' + ');
      const output =
        recipe.output.kind === 'item' ? `${recipe.output.count} ${recipe.output.item}` : 'a gauge';
      return `${recipe.id}: ${inputs} -> ${output}`;
    });
    expect(lines).toEqual([
      'ironIngot: 2 rawIronOre + 1 coal -> 2 ironIngot',
      'copperIngot: 2 rawCopperOre + 1 coal -> 2 copperIngot',
      'drill: 3 ironIngot -> 1 drill',
      'pump: 2 ironIngot + 1 copperIngot -> 1 pump',
      'vent: 2 copperIngot + 1 timber -> 1 vent',
      'scannerCharge: 1 copperIngot + 1 crystal -> 1 scannerCharge',
      'sealant: 1 stone + 1 coal -> 1 sealant',
      'explosive: 2 coal + 1 ironIngot -> 1 explosive',
      'campKit: 4 ironIngot + 4 timber + 2 copperIngot -> 1 campKit',
    ]);
    const fieldIds = GAME_DATA.recipes.map((recipe) => recipe.id);
    for (const recipe of GAME_DATA.campRecipes) {
      expect(fieldIds).not.toContain(recipe.id);
    }
    expect(findCampRecipe('pump')?.name).toBe('Pump');
    expect(findCampRecipe('support')).toBeUndefined();
    // Removed with light (issue #89).
    expect(findCampRecipe('safetyLamp')).toBeUndefined();
    expect(findRecipe('torch')).toBeUndefined();
    expect(findRecipe('lampOil')).toBeUndefined();
    // Camp recipes are not field recipes: nothing can craft them yet.
    expect(findRecipe('pump')).toBeUndefined();
  });

  it('has a structure for each placed tool, with new codes only', () => {
    const codes: Record<string, number> = {};
    for (const [structureId, structure] of Object.entries(GAME_DATA.structures)) {
      codes[structureId] = structure.code;
      expect(structure.placedFromItem).toBe(structureId);
    }
    // Code 1 was the ladder (removed, issue #80); 2 and 6 were the torch and the
    // safety lamp (removed, issue #89). They are not given to anything else.
    expect(codes).toEqual({
      support: 3,
      vent: 4,
      pump: 5,
      explosive: 7,
    });
  });

  it('reports a diggable block with no slump limit or one below 1, and bedrock with one', () => {
    const problems = problemsAfter((data) => {
      entry(data.blocks, 'stone').slumpLimit = null;
      // 0 would let a block "slump" down a 1-level step without moving down.
      entry(data.blocks, 'dirt').slumpLimit = 0;
      entry(data.blocks, 'bedrock').slumpLimit = 2;
    });
    expect(problems).toHaveLength(3);
    expect(
      problems.some((p) => p.includes('block "stone"') && p.includes('needs a slump limit')),
    ).toBe(true);
    expect(problems.some((p) => p.includes('block "dirt": slump limit'))).toBe(true);
    expect(problems.some((p) => p.includes('block "bedrock" never slumps'))).toBe(true);
  });

  it('reports a missing rubble block, or sealed rock with a yield', () => {
    const problems = problemsAfter((data) => {
      delete data.blocks['rubble'];
      entry(data.blocks, 'sealed').yields = [{ item: 'stone', count: 1 }];
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('there must be a block "rubble"');
    expect(problems[1]).toContain('block "sealed" must not have a yield');
  });

  it('reports a camp recipe that reuses a field recipe id or names an unknown item', () => {
    const problems = problemsAfter((data) => {
      data.campRecipes.push({
        id: 'support',
        name: 'Clash',
        inputs: [{ item: 'adamantium', count: 1 }],
        output: { kind: 'item', item: 'support', count: 1 },
      });
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('recipe id "support" is used more than once');
    expect(problems[1]).toContain('unknown item "adamantium"');
  });

  it('has the crew numbers of design doc 5.1 and 5.2', () => {
    expect(GAME_DATA.crew).toEqual({
      startHealth: 10,
      damage: {
        slump: 3,
        water: 1,
        lavaOn: 5,
        lavaBeside: 1,
        gas: 1,
        gasExplosion: 3,
        explosion: 6,
      },
    });
  });

  it('reports bad crew damage numbers', () => {
    const problems = problemsAfter((data) => {
      data.crew.damage.slump = -1;
      data.crew.damage.gas = 1.5;
      data.crew.damage.lavaOn = 0;
    });
    expect(problems).toHaveLength(3);
    for (const part of ['crew.damage.slump', 'crew.damage.gas', 'crew.damage.lavaOn must be']) {
      expect(
        problems.some((p) => p.includes(part)),
        `no problem mentions ${part}`,
      ).toBe(true);
    }
  });

  it('reports bad hazard numbers', () => {
    const problems = problemsAfter((data) => {
      data.hazards.slump.crackCountdown = 0;
      data.hazards.slump.steepStep = 1;
      data.hazards.water.unitsPerCell = 2;
      data.hazards.gas.pocketUnitsPerCell = 300;
      data.hazards.lava.flowEveryShifts = 0;
      data.hazards.forecast.unseenBlock = 'air';
      data.tells.hazards.warmGlowDistance = 0;
    });
    // 7 bad numbers; the gas one is reported twice, the second time because a
    // generated gas pocket would then hold more than one square can store.
    expect(problems).toHaveLength(8);
    for (const part of [
      'space "gas": a space of maxSize',
      'hazards.slump.crackCountdown',
      'hazards.slump.steepStep',
      'hazards.water.unitsPerCell',
      'hazards.gas.pocketUnitsPerCell',
      'hazards.lava.flowEveryShifts',
      'hazards.forecast.unseenBlock',
      'tells.hazards.warmGlowDistance',
    ]) {
      expect(
        problems.some((p) => p.includes(part)),
        `no problem mentions ${part}`,
      ).toBe(true);
    }
  });

  it('reports bad explosion numbers (design doc 6.6)', () => {
    const problems = problemsAfter((data) => {
      data.hazards.explosion.blastReach = -1;
      data.hazards.explosion.chanceBlockDestroyed = 1.5;
      data.hazards.explosion.chanceBlocks = ['relic', 'unobtainium'];
    });
    expect(problems).toHaveLength(3);
    for (const part of [
      'hazards.explosion.blastReach',
      'hazards.explosion.chanceBlockDestroyed must be from 0 to 1',
      'hazards.explosion.chanceBlocks names an unknown block "unobtainium"',
    ]) {
      expect(
        problems.some((p) => p.includes(part)),
        `no problem mentions ${part}`,
      ).toBe(true);
    }
  });

  it('reports bad water and lava flow numbers (decision note 0033)', () => {
    const problems = problemsAfter((data) => {
      // A drop of 1 would let a unit of water swap back and forth for ever.
      data.hazards.water.flowMinDrop = 1;
      data.hazards.water.floodedMineExtraAp = -1;
      data.hazards.lava.sourceUnitsPerStep = 0;
      // A cell with no lava is never a source, so a source keeps at least 1.
      data.hazards.lava.sourceKeepsUnits = 0;
    });
    expect(problems).toHaveLength(4);
    for (const part of [
      'hazards.water.flowMinDrop must be a whole number of at least 2',
      'hazards.water.floodedMineExtraAp',
      'hazards.lava.sourceUnitsPerStep',
      'hazards.lava.sourceKeepsUnits',
    ]) {
      expect(
        problems.some((p) => p.includes(part)),
        `no problem mentions ${part}`,
      ).toBe(true);
    }
  });

  it('reports bad camp numbers and unknown camp items', () => {
    const problems = problemsAfter((data) => {
      data.camps.kitItem = 'tent';
      data.camps.mineMinAp = 0;
      data.camps.upkeepEveryShifts = 0;
      data.campTools.scanChargeItem = 'battery';
      data.campTools.scanDepth = 0;
      data.campTools.sealedBlock = 'air';
    });
    expect(problems).toHaveLength(6);
    expect(problems[0]).toContain('unknown item "tent"');
    expect(problems[1]).toContain('camps.upkeepEveryShifts');
    expect(problems[2]).toContain('camps.mineMinAp');
    expect(problems[3]).toContain('unknown item "battery"');
    expect(problems[4]).toContain('campTools.scanDepth');
    expect(problems[5]).toContain('campTools.sealedBlock');
  });

  it('reports a bad cost for an M2 action', () => {
    const problems = problemsAfter((data) => {
      data.actionCosts.scan = -2;
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('actionCosts.scan');
  });
});
