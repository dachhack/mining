// A hand-written check of the data tables (decision note 0005 item 24).
//
// TypeScript already checks the *shape* of each table (a mine cost is a
// number, a recipe has inputs). This checks what the type system cannot: that
// ids refer to things that exist, and that numbers are in a sensible range.

import type { GameData, ItemStack } from './types';

// The cube's typed arrays hold one byte per cell, so codes must fit in a byte.
const MAX_CODE = 255;

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Check every table in `data`. Returns a list of problems in plain English;
 * an empty list means the data is good. It never throws.
 */
export function validateData(data: GameData): string[] {
  const problems: string[] = [];

  // Small helpers that add to `problems`. `where` says which entry is wrong.
  function requireWholeAtLeast(value: number, minimum: number, where: string): void {
    if (!isWholeNumber(value) || value < minimum) {
      problems.push(`${where} must be a whole number of at least ${minimum}, but is ${value}`);
    }
  }
  function requireKnownItem(itemId: string, where: string): void {
    if (!Object.hasOwn(data.items, itemId)) {
      problems.push(`${where} names an unknown item "${itemId}"`);
    }
  }
  function checkStacks(stacks: ItemStack[], where: string): void {
    for (const stack of stacks) {
      requireKnownItem(stack.item, where);
      requireWholeAtLeast(stack.count, 1, `${where}: count of "${stack.item}"`);
    }
  }

  // --- World ---
  const world = data.world;
  requireWholeAtLeast(world.size.x, 1, 'world.size.x');
  requireWholeAtLeast(world.size.y, 1, 'world.size.y');
  requireWholeAtLeast(world.size.z, 1, 'world.size.z');
  if (world.surfaceZ !== -1) {
    // The engine treats the layer directly above z = 0 as the surface.
    problems.push(`world.surfaceZ must be -1, but is ${world.surfaceZ}`);
  }
  // Depth bands must cover every layer exactly once, in order.
  let nextLayer = 0;
  const bandIds = new Set<string>();
  for (const band of world.depthBands) {
    if (bandIds.has(band.id)) {
      problems.push(`depth band id "${band.id}" is used more than once`);
    }
    bandIds.add(band.id);
    if (band.firstLayer !== nextLayer) {
      problems.push(
        `depth band "${band.id}" starts at layer ${band.firstLayer}, but layer ${nextLayer} is the next one not covered`,
      );
    }
    if (!isWholeNumber(band.lastLayer) || band.lastLayer < band.firstLayer) {
      problems.push(`depth band "${band.id}" ends (${band.lastLayer}) before it starts`);
    }
    nextLayer = band.lastLayer + 1;
  }
  if (nextLayer !== world.size.z) {
    problems.push(
      `depth bands cover layers 0 to ${nextLayer - 1}, but the cube has ${world.size.z} layers`,
    );
  }

  // --- Blocks ---
  const blockCodes = new Map<number, string>();
  for (const [blockId, block] of Object.entries(data.blocks)) {
    const where = `block "${blockId}"`;
    if (!isWholeNumber(block.code) || block.code < 0 || block.code > MAX_CODE) {
      problems.push(
        `${where} has code ${block.code}; codes must be whole numbers 0 to ${MAX_CODE}`,
      );
    }
    const sameCode = blockCodes.get(block.code);
    if (sameCode !== undefined) {
      problems.push(`${where} has the same code (${block.code}) as block "${sameCode}"`);
    }
    blockCodes.set(block.code, blockId);

    if (block.mineCost !== null) {
      requireWholeAtLeast(block.mineCost, 0, `${where}: mine cost`);
      if (!block.solid) {
        problems.push(`${where} is not solid, so it must not have a mine cost`);
      }
    }
    if (block.mineCostWithDrill !== null) {
      requireWholeAtLeast(block.mineCostWithDrill, 0, `${where}: mine cost with a drill`);
      if (block.mineCost === null) {
        problems.push(`${where} has a drill cost but cannot be mined`);
      } else if (block.mineCostWithDrill > block.mineCost) {
        problems.push(`${where} costs more to mine with a drill than without`);
      }
    }
    if (block.mineCost === null && block.yields.length > 0) {
      problems.push(`${where} cannot be mined, so it must not have a yield`);
    }
    checkStacks(block.yields, `${where}: yield`);

    // The slump limit: every block that can be dug has one; open space and
    // bedrock have none. It must be at least 1: then an unstable square's
    // foot is at least 2 levels deeper, so a slumping block always comes to
    // rest lower than it started and a cascade always ends (design doc 6.1).
    const canSlump = block.solid && block.mineCost !== null;
    if (canSlump) {
      if (block.slumpLimit === null) {
        problems.push(`${where} is a solid, mineable block, so it needs a slump limit`);
      } else {
        requireWholeAtLeast(block.slumpLimit, 1, `${where}: slump limit`);
      }
    } else if (block.slumpLimit !== null) {
      problems.push(`${where} never slumps, so its slump limit must be null`);
    }
  }
  // The engine relies on these three blocks.
  const air = data.blocks['air'];
  if (air === undefined || air.code !== 0 || air.solid) {
    problems.push('there must be a block "air" with code 0 that is not solid');
  }
  const bedrock = data.blocks['bedrock'];
  if (bedrock === undefined || !bedrock.solid || bedrock.mineCost !== null) {
    problems.push('there must be a block "bedrock" that is solid and cannot be mined');
  }
  if (data.blocks['stone'] === undefined) {
    problems.push('there must be a block "stone"');
  }
  // The cave-in and sealant rules turn cells into these two (0014 items 8, 12).
  for (const blockId of ['rubble', 'sealed']) {
    const block = Object.hasOwn(data.blocks, blockId) ? data.blocks[blockId] : undefined;
    if (block === undefined || !block.solid || block.mineCost === null) {
      problems.push(`there must be a block "${blockId}" that is solid and can be mined`);
    } else if (block.yields.length > 0) {
      problems.push(`block "${blockId}" must not have a yield`);
    }
  }

  // --- Generation ---
  const generation = data.generation;
  requireWholeAtLeast(generation.veinPlacementTries, 1, 'generation.veinPlacementTries');
  requireWholeAtLeast(generation.spacePlacementTries, 1, 'generation.spacePlacementTries');
  // What one cell of each kind of pocket holds. When a pocket is broken into,
  // everything it holds is put on one square, and a cell of the state stores
  // one byte (0 to 255): so the largest pocket must not hold more than that.
  const unitsPerSpaceCell: Record<string, number> = {
    cavern: 0,
    water: data.hazards.water.unitsPerCell,
    lava: data.hazards.lava.unitsPerCell,
    gas: data.hazards.gas.pocketUnitsPerCell,
  };
  // A generated block must be one the avatar can dig through: solid and mineable.
  function requireDiggableBlock(blockId: string, where: string): void {
    const block = Object.hasOwn(data.blocks, blockId) ? data.blocks[blockId] : undefined;
    if (block === undefined) {
      problems.push(`${where} names an unknown block "${blockId}"`);
    } else if (!block.solid || block.mineCost === null) {
      problems.push(`${where} names "${blockId}", which is not a solid, mineable block`);
    }
  }
  const generatedBandIds = new Set<string>();
  for (const bandDef of generation.bands) {
    const where = `generation for band "${bandDef.bandId}"`;
    if (!bandIds.has(bandDef.bandId)) {
      problems.push(`${where}: there is no depth band with that id`);
    }
    if (generatedBandIds.has(bandDef.bandId)) {
      problems.push(`${where}: the band is listed more than once`);
    }
    generatedBandIds.add(bandDef.bandId);

    const blocksInBand = new Set<string>();
    let totalAtTop = 0;
    let totalAtBottom = 0;
    for (const rock of bandDef.rock) {
      requireDiggableBlock(rock.block, `${where}: rock`);
      if (blocksInBand.has(rock.block)) {
        problems.push(`${where}: block "${rock.block}" is listed more than once`);
      }
      blocksInBand.add(rock.block);
      for (const weight of [rock.weightAtTop, rock.weightAtBottom]) {
        if (!Number.isFinite(weight) || weight < 0) {
          problems.push(
            `${where}: rock "${rock.block}" has a negative or invalid weight (${weight})`,
          );
        }
      }
      totalAtTop += rock.weightAtTop;
      totalAtBottom += rock.weightAtBottom;
    }
    // `!(x > 0)` rather than `x <= 0`, so that NaN is caught as well.
    if (!(totalAtTop > 0) || !(totalAtBottom > 0)) {
      problems.push(
        `${where}: the rock weights must add up to more than 0 at the top and at the bottom`,
      );
    }
    for (const vein of bandDef.veins) {
      const veinWhere = `${where}: vein of "${vein.block}"`;
      requireDiggableBlock(vein.block, `${where}: vein`);
      if (blocksInBand.has(vein.block)) {
        problems.push(`${where}: block "${vein.block}" is listed more than once`);
      }
      blocksInBand.add(vein.block);
      if (!Number.isFinite(vein.veinsPer1000Cells) || vein.veinsPer1000Cells <= 0) {
        problems.push(
          `${veinWhere}: veinsPer1000Cells must be more than 0, but is ${vein.veinsPer1000Cells}`,
        );
      }
      requireWholeAtLeast(vein.minSize, 1, `${veinWhere}: minSize`);
      requireWholeAtLeast(
        vein.maxSize,
        Math.max(1, vein.minSize),
        `${veinWhere}: maxSize (at least minSize)`,
      );
    }
    const spaceKindsInBand = new Set<string>();
    for (const space of bandDef.spaces) {
      const spaceWhere = `${where}: space "${space.kind}"`;
      const unitsPerCell = Object.hasOwn(unitsPerSpaceCell, space.kind)
        ? unitsPerSpaceCell[space.kind]
        : undefined;
      if (unitsPerCell === undefined) {
        problems.push(`${spaceWhere}: the kind must be cavern, water, lava or gas`);
        continue;
      }
      if (spaceKindsInBand.has(space.kind)) {
        problems.push(`${spaceWhere}: the kind is listed more than once`);
      }
      spaceKindsInBand.add(space.kind);
      if (!Number.isFinite(space.spacesPer1000Cells) || space.spacesPer1000Cells <= 0) {
        problems.push(
          `${spaceWhere}: spacesPer1000Cells must be more than 0, but is ${space.spacesPer1000Cells}`,
        );
      }
      requireWholeAtLeast(space.minSize, 1, `${spaceWhere}: minSize`);
      requireWholeAtLeast(
        space.maxSize,
        Math.max(1, space.minSize),
        `${spaceWhere}: maxSize (at least minSize)`,
      );
      if (space.maxSize * unitsPerCell > 255) {
        problems.push(
          `${spaceWhere}: a space of maxSize ${space.maxSize} would hold ${space.maxSize * unitsPerCell} units, more than the 255 one square can store`,
        );
      }
    }
  }
  for (const band of world.depthBands) {
    if (!generatedBandIds.has(band.id)) {
      problems.push(`depth band "${band.id}" has no entry in generation.bands`);
    }
  }

  // --- Structures ---
  const structureCodes = new Map<number, string>();
  for (const [structureId, structure] of Object.entries(data.structures)) {
    const where = `structure "${structureId}"`;
    // Code 0 means "no structure", so real structures start at 1.
    if (!isWholeNumber(structure.code) || structure.code < 1 || structure.code > MAX_CODE) {
      problems.push(
        `${where} has code ${structure.code}; codes must be whole numbers 1 to ${MAX_CODE}`,
      );
    }
    const sameCode = structureCodes.get(structure.code);
    if (sameCode !== undefined) {
      problems.push(`${where} has the same code (${structure.code}) as structure "${sameCode}"`);
    }
    structureCodes.set(structure.code, structureId);
    requireKnownItem(structure.placedFromItem, where);
  }

  // --- Recipes ---
  // Field and camp recipes are checked the same way, and share one set of
  // ids: a `craft` action names a recipe by its id alone.
  const recipeIds = new Set<string>();
  for (const recipe of [...data.recipes, ...data.campRecipes]) {
    const where = `recipe "${recipe.id}"`;
    if (recipeIds.has(recipe.id)) {
      problems.push(`recipe id "${recipe.id}" is used more than once`);
    }
    recipeIds.add(recipe.id);
    if (recipe.inputs.length === 0) {
      problems.push(`${where} has no inputs`);
    }
    checkStacks(recipe.inputs, `${where}: input`);
    const output = recipe.output;
    if (output.kind === 'item') {
      requireKnownItem(output.item, `${where}: output`);
      requireWholeAtLeast(output.count, 1, `${where}: output count`);
    } else {
      if (!data.gauges.includes(output.gauge)) {
        problems.push(`${where}: output names an unknown gauge "${output.gauge}"`);
      }
      requireWholeAtLeast(output.amount, 1, `${where}: output amount`);
    }
  }

  // --- Crew ---
  const crew = data.crew;
  requireWholeAtLeast(crew.startHealth, 1, 'crew.startHealth');
  // `Object.entries` gives (name, value) pairs, like `dict.items()` in Python.
  for (const [name, amount] of Object.entries(crew.damage)) {
    requireWholeAtLeast(amount as number, 0, `crew.damage.${name}`);
  }
  // "Lava 5 on / 1 beside": standing in it is never the lesser of the two.
  if (crew.damage.lavaOn < crew.damage.lavaBeside) {
    problems.push('crew.damage.lavaOn must be at least crew.damage.lavaBeside');
  }

  // --- Tells ---
  const traces = data.tells.mineralTraces;
  requireWholeAtLeast(traces.distance, 1, 'tells.mineralTraces.distance');
  if (traces.sourceBlocks.length === 0) {
    problems.push('tells.mineralTraces.sourceBlocks is empty');
  }
  if (traces.shownOnBlocks.length === 0) {
    problems.push('tells.mineralTraces.shownOnBlocks is empty');
  }
  const traceBlocks = new Set<string>();
  for (const [listName, blockIds] of [
    ['sourceBlocks', traces.sourceBlocks],
    ['shownOnBlocks', traces.shownOnBlocks],
  ] as const) {
    for (const blockId of blockIds) {
      const where = `tells.mineralTraces.${listName}`;
      const block = Object.hasOwn(data.blocks, blockId) ? data.blocks[blockId] : undefined;
      if (block === undefined) {
        problems.push(`${where} names an unknown block "${blockId}"`);
      } else if (!block.solid) {
        problems.push(`${where} names "${blockId}", which is not a solid block`);
      }
      // A block is a source of traces or shows them, never both, and is
      // listed once.
      if (traceBlocks.has(blockId)) {
        problems.push(`tells.mineralTraces lists block "${blockId}" more than once`);
      }
      traceBlocks.add(blockId);
    }
  }

  const hazardTells = data.tells.hazards;
  requireWholeAtLeast(hazardTells.dampStoneDistance, 1, 'tells.hazards.dampStoneDistance');
  requireWholeAtLeast(hazardTells.pittedRockDistance, 1, 'tells.hazards.pittedRockDistance');
  requireWholeAtLeast(hazardTells.warmGlowDistance, 1, 'tells.hazards.warmGlowDistance');

  // --- Hazards ---
  const hazards = data.hazards;
  // The cube stores a crack's countdown in one byte, and 0 there means "no
  // crack", so the countdown is 1 to 255.
  requireWholeAtLeast(hazards.slump.crackCountdown, 1, 'hazards.slump.crackCountdown');
  if (hazards.slump.crackCountdown > MAX_CODE) {
    problems.push(`hazards.slump.crackCountdown must be at most ${MAX_CODE}`);
  }
  // A steep step of less than 2 would let a block slump without moving down.
  requireWholeAtLeast(hazards.slump.steepStep, 2, 'hazards.slump.steepStep');
  // The flow rules of 0014 item 12 are written for one unit in a cell.
  if (hazards.water.unitsPerCell !== 1) {
    problems.push(`hazards.water.unitsPerCell must be 1, but is ${hazards.water.unitsPerCell}`);
  }
  if (hazards.lava.unitsPerCell !== 1) {
    problems.push(`hazards.lava.unitsPerCell must be 1, but is ${hazards.lava.unitsPerCell}`);
  }
  requireWholeAtLeast(hazards.water.floodedMineExtraAp, 0, 'hazards.water.floodedMineExtraAp');
  // With a drop of 1, a unit of water would move back and forth for ever.
  requireWholeAtLeast(hazards.water.flowMinDrop, 2, 'hazards.water.flowMinDrop');
  requireWholeAtLeast(hazards.water.pumpUnitsPerShift, 1, 'hazards.water.pumpUnitsPerShift');
  requireWholeAtLeast(hazards.water.pumpReach, 0, 'hazards.water.pumpReach');
  requireWholeAtLeast(hazards.gas.pocketUnitsPerCell, 1, 'hazards.gas.pocketUnitsPerCell');
  if (hazards.gas.pocketUnitsPerCell > MAX_CODE) {
    problems.push(`hazards.gas.pocketUnitsPerCell must be at most ${MAX_CODE}`);
  }
  requireWholeAtLeast(hazards.gas.ventReach, 0, 'hazards.gas.ventReach');
  requireWholeAtLeast(hazards.lava.flowEveryShifts, 1, 'hazards.lava.flowEveryShifts');
  requireWholeAtLeast(hazards.lava.sourcePocketCellsOver, 0, 'hazards.lava.sourcePocketCellsOver');
  requireWholeAtLeast(hazards.lava.sourceUnitsPerStep, 1, 'hazards.lava.sourceUnitsPerStep');
  // A cell with no lava is never a source (state.ts), so a source keeps some.
  requireWholeAtLeast(hazards.lava.sourceKeepsUnits, 1, 'hazards.lava.sourceKeepsUnits');
  const unseen = Object.hasOwn(data.blocks, hazards.forecast.unseenBlock)
    ? data.blocks[hazards.forecast.unseenBlock]
    : undefined;
  if (unseen === undefined || !unseen.solid) {
    problems.push(
      `hazards.forecast.unseenBlock names "${hazards.forecast.unseenBlock}", which is not a solid block`,
    );
  }

  // --- Camps and camp tools ---
  const camps = data.camps;
  requireKnownItem(camps.kitItem, 'camps.kitItem');
  requireWholeAtLeast(camps.halfWidth, 0, 'camps.halfWidth');
  requireWholeAtLeast(camps.foundMinAp, 0, 'camps.foundMinAp');
  requireWholeAtLeast(camps.restMinAp, 0, 'camps.restMinAp');
  requireWholeAtLeast(camps.upkeepFuel, 0, 'camps.upkeepFuel');
  requireWholeAtLeast(camps.upkeepEveryShifts, 1, 'camps.upkeepEveryShifts');
  requireWholeAtLeast(camps.mineDiscountAp, 0, 'camps.mineDiscountAp');
  // A mine that cost 0 AP could be repeated without end in one shift.
  requireWholeAtLeast(camps.mineMinAp, 1, 'camps.mineMinAp');
  requireWholeAtLeast(camps.mineDiscountSteps, 0, 'camps.mineDiscountSteps');
  requireWholeAtLeast(camps.mineDiscountMaxDeeper, 0, 'camps.mineDiscountMaxDeeper');
  const campTools = data.campTools;
  requireKnownItem(campTools.drillItem, 'campTools.drillItem');
  requireKnownItem(campTools.sealantItem, 'campTools.sealantItem');
  requireKnownItem(campTools.scanChargeItem, 'campTools.scanChargeItem');
  requireWholeAtLeast(campTools.scanChargesPerScan, 0, 'campTools.scanChargesPerScan');
  requireWholeAtLeast(campTools.scanHalfWidth, 0, 'campTools.scanHalfWidth');
  // A scan that revealed no block would use up a charge for nothing.
  requireWholeAtLeast(campTools.scanDepth, 1, 'campTools.scanDepth');
  // Sealant places a block that can then be mined out again.
  requireDiggableBlock(campTools.sealedBlock, 'campTools.sealedBlock');

  // --- Shift ---
  const shift = data.shift;
  requireWholeAtLeast(shift.firstShiftNumber, 0, 'shift.firstShiftNumber');
  requireWholeAtLeast(shift.apPerShift, 1, 'shift.apPerShift');
  requireWholeAtLeast(shift.fuelPerShift, 0, 'shift.fuelPerShift');

  // --- Action costs ---
  for (const [actionName, cost] of Object.entries(data.actionCosts)) {
    // `Object.entries` loses the value type on an interface, hence the check.
    if (typeof cost !== 'number') {
      problems.push(`actionCosts.${actionName} is not a number`);
    } else {
      requireWholeAtLeast(cost, 0, `actionCosts.${actionName}`);
    }
  }

  // --- Loadouts and contracts ---
  for (const [loadoutId, loadout] of Object.entries(data.loadouts)) {
    const where = `loadout "${loadoutId}"`;
    requireWholeAtLeast(loadout.fuel, 0, `${where}: fuel`);
    checkStacks(loadout.items, `${where}: items`);
  }
  if (!Object.hasOwn(data.loadouts, data.defaultLoadoutId)) {
    problems.push(`defaultLoadoutId names an unknown loadout "${data.defaultLoadoutId}"`);
  }
  if (data.contractIds.length === 0) {
    problems.push('contractIds is empty; createRun needs at least one contract id');
  }

  return problems;
}
