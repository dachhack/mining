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
  const start = world.startPosition;
  const startInside =
    isWholeNumber(start.x) &&
    isWholeNumber(start.y) &&
    start.x >= 0 &&
    start.x < world.size.x &&
    start.y >= 0 &&
    start.y < world.size.y;
  if (!startInside || start.z !== world.surfaceZ) {
    problems.push(
      `world.startPosition (${start.x}, ${start.y}, ${start.z}) must be on the surface layer, above the cube`,
    );
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

  // --- Items ---
  for (const [itemId, item] of Object.entries(data.items)) {
    if (!Number.isFinite(item.weight) || item.weight < 0) {
      problems.push(`item "${itemId}" has a negative or invalid weight (${item.weight})`);
    }
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

  // --- Generation ---
  const generation = data.generation;
  requireWholeAtLeast(generation.veinPlacementTries, 1, 'generation.veinPlacementTries');
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
  const recipeIds = new Set<string>();
  for (const recipe of data.recipes) {
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

  // --- Avatar ---
  const avatar = data.avatar;
  requireWholeAtLeast(avatar.startHealth, 1, 'avatar.startHealth');
  if (!Number.isFinite(avatar.carryCapacity) || avatar.carryCapacity < 0) {
    problems.push(`avatar.carryCapacity is negative or invalid (${avatar.carryCapacity})`);
  }
  requireWholeAtLeast(avatar.lightRadiusWithoutOil, 0, 'avatar.lightRadiusWithoutOil');
  requireWholeAtLeast(
    avatar.lightRadiusWithOil,
    Math.max(0, avatar.lightRadiusWithoutOil),
    'avatar.lightRadiusWithOil (at least the radius without oil)',
  );
  requireWholeAtLeast(avatar.torchLightRadius, 0, 'avatar.torchLightRadius');
  requireWholeAtLeast(avatar.freeFallBlocks, 0, 'avatar.freeFallBlocks');
  requireWholeAtLeast(avatar.fallDamagePerBlock, 0, 'avatar.fallDamagePerBlock');
  requireWholeAtLeast(
    avatar.fatalFallBlocks,
    Math.max(0, avatar.freeFallBlocks) + 1,
    'avatar.fatalFallBlocks (more than the free fall)',
  );
  requireWholeAtLeast(avatar.maxChosenDropBlocks, 0, 'avatar.maxChosenDropBlocks');
  if (avatar.maxChosenDropBlocks >= avatar.fatalFallBlocks) {
    problems.push('avatar.maxChosenDropBlocks must be less than avatar.fatalFallBlocks');
  }

  // --- Shift ---
  const shift = data.shift;
  requireWholeAtLeast(shift.firstShiftNumber, 0, 'shift.firstShiftNumber');
  requireWholeAtLeast(shift.apPerShift, 1, 'shift.apPerShift');
  requireWholeAtLeast(shift.fuelPerShift, 0, 'shift.fuelPerShift');
  requireWholeAtLeast(shift.lampOilBurnEveryShifts, 1, 'shift.lampOilBurnEveryShifts');
  requireWholeAtLeast(shift.lampOilPerBurn, 0, 'shift.lampOilPerBurn');

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
    requireWholeAtLeast(loadout.lampOil, 0, `${where}: lamp oil`);
    checkStacks(loadout.items, `${where}: items`);
    let weight = 0;
    for (const stack of loadout.items) {
      const item = Object.hasOwn(data.items, stack.item) ? data.items[stack.item] : undefined;
      if (item !== undefined) {
        weight += item.weight * stack.count;
      }
    }
    if (weight > avatar.carryCapacity) {
      problems.push(
        `${where} weighs ${weight}, more than the carry capacity of ${avatar.carryCapacity}`,
      );
    }
  }
  if (!Object.hasOwn(data.loadouts, data.defaultLoadoutId)) {
    problems.push(`defaultLoadoutId names an unknown loadout "${data.defaultLoadoutId}"`);
  }
  if (data.contractIds.length === 0) {
    problems.push('contractIds is empty; createRun needs at least one contract id');
  }

  return problems;
}
