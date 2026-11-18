// Words for the play interface: what each choice in the action list means,
// and what happened after one was taken.
//
// Like view.ts, these functions say only what the avatar could know. A choice
// is described from the action itself (which the engine offers only for cells
// in reach, all of them revealed) and from the data tables.

import {
  BLOCKS,
  STRUCTURES,
  TELLS,
  WORLD,
  blockDefByCode,
  findRecipe,
  itemDef,
} from '../../src/data';
import type { ItemStack, Vec3 } from '../../src/data';
import {
  blockDefAt,
  canCarry,
  countItem,
  fallDamage,
  isFatalFall,
  isRevealed,
  isSolid,
  looseItemsAt,
  showsMineralTraces,
  structureAt,
} from '../../src/engine';
import type { Action, GameEvent, GameState } from '../../src/engine';
import type { LogEntry } from './log';
import { tracedSymbolsText } from './symbols';

/** "2 Stone, 1 Coal", or "nothing". */
export function stackListText(stacks: ItemStack[]): string {
  if (stacks.length === 0) {
    return 'nothing';
  }
  return stacks.map((stack) => `${stack.count} ${itemDef(stack.item).name}`).join(', ');
}

/** "the surface" or "layer 3". Layer 0 is the top layer of rock. */
export function layerName(z: number): string {
  return z === WORLD.surfaceZ ? 'the surface' : `layer ${z}`;
}

/** Compass word for a sideways offset, e.g. (1, -1) -> "north-east". '' for none. */
export function compass(dx: number, dy: number): string {
  const northSouth = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
  const eastWest = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  if (northSouth !== '' && eastWest !== '') {
    return `${northSouth}-${eastWest}`;
  }
  return northSouth + eastWest;
}

/**
 * Where the cell `to` is, seen from `from`, for a cell that touches it:
 * "your cell", "above you", "below you", "north", "north-east",
 * "north-east, one layer down", "north, one layer up".
 */
function whereFrom(from: Vec3, to: Vec3): string {
  const side = compass(to.x - from.x, to.y - from.y);
  const dz = to.z - from.z;
  if (side === '') {
    return dz === 0 ? 'your cell' : dz < 0 ? 'above you' : 'below you';
  }
  if (dz === 0) {
    return side;
  }
  return `${side}, one layer ${dz < 0 ? 'up' : 'down'}`;
}

function blocksText(count: number): string {
  return count === 1 ? '1 block' : `${count} blocks`;
}

/**
 * What the player knows about the fall that follows mining the block the
 * avatar stands on, for the action list. This is the one lethal choice in
 * M1, and it costs health from the first block (an uncontrolled fall,
 * decision note 0010), so the list must say what it costs.
 *
 * It is worked out from revealed cells only. The column under the avatar is
 * walked downwards, and at the first cell the player has not seen the answer
 * stops at "at least so far": what lies beyond is not looked at, so the text
 * cannot give it away. (The engine's own fall, in gravity.ts, uses the real
 * cube; the two agree whenever the whole column is revealed.)
 *
 * "N blocks or more" is said only when that first unseen cell is met, and the
 * text names its layer; with the bottom of the fall seen it is "N blocks"
 * exactly (issue #47 item 5). In a bare one-cell shaft the cell under the
 * block underfoot is not seen (the lamp shows the floor, not what is under
 * it), so there the honest answer stays "1 block or more".
 */
function knownFallText(state: GameState): string {
  const here = state.avatar.pos;
  // A ladder in the avatar's own cell is footing: it holds whatever is mined.
  if (structureAt(state, here) === STRUCTURES.ladder.code) {
    return 'your ladder holds you, you will not fall';
  }
  // With the block gone the avatar drops into its cell: a fall of 1. It
  // falls on from a cell while that cell has no ladder and the cell below it
  // is open.
  let fall = 1;
  let known = true;
  // The layer of the first unseen cell, if the walk meets one.
  let unseenLayer = 0;
  for (;;) {
    const below = { x: here.x, y: here.y, z: here.z + fall + 1 };
    if (!isRevealed(state, below)) {
      known = false;
      unseenLayer = below.z;
      break;
    }
    if (isSolid(state, below)) {
      break;
    }
    fall += 1;
    if (structureAt(state, below) === STRUCTURES.ladder.code) {
      break; // a ladder further down catches the fall
    }
  }

  // The cost of the fall as far as it is known. If the bottom is unseen the
  // real fall may be longer, so the real cost may be higher, never lower.
  const cost = fallDamage('uncontrolled', fall);
  let harm: string;
  if (isFatalFall(fall) || cost >= state.avatar.health) {
    harm = ', FATAL';
  } else if (cost > 0) {
    harm = known ? ` and lose ${cost} health` : ` and lose at least ${cost} health`;
  } else {
    harm = known ? ', no harm' : '';
  }
  return known
    ? `you will fall ${blocksText(fall)}${harm}`
    : `you will fall ${blocksText(fall)} or more${harm}; the cell under that (${layerName(unseenLayer)}) is unseen`;
}

/** What the player is told when the run is over, in words (the engine's ids are not shown). */
const RUN_END_TEXT: Record<string, string> = {
  left: 'you left the cube alive with what you carried (a "salvage" run)',
  fell: 'you died of a fall',
  outOfFuel: 'you ran out of fuel and died',
};

/** How a run ended, in words. `cause` is the engine's `RunEndCause`. */
export function runEndText(cause: string): string {
  return RUN_END_TEXT[cause] ?? cause;
}

/**
 * What mining the revealed block at `target` gives: "Stone, mineral traces,
 * gives 1 Stone". `underfoot` is put after the block's name; it is the note
 * about the fall for the block the avatar stands on, and '' otherwise.
 */
function mineOutcomeText(state: GameState, target: Vec3, underfoot: string): string {
  const block = blockDefAt(state, target);
  // A yield that does not fit the carry limit is left in the hole.
  const fits = block.yields.every((stack) => canCarry(state, stack.item, stack.count));
  const tooHeavy = fits ? '' : ' (too heavy to carry: it will be left lying there)';
  // Shown only for a block the player has seen traces on; the engine decides.
  const traces = showsMineralTraces(state, target) ? ', mineral traces' : '';
  return `${block.name}${traces}${underfoot}, gives ${stackListText(block.yields)}${tooHeavy}`;
}

function describeAction(state: GameState, action: Action): string {
  const here = state.avatar.pos;
  switch (action.type) {
    case 'move': {
      const side = compass(action.to.x - here.x, action.to.y - here.y);
      const landsOn = layerName(action.to.z + action.drop);
      const drop = action.drop > 0 ? `, then drop ${blocksText(action.drop)} to ${landsOn}` : '';
      if (side === '') {
        return action.to.z < here.z
          ? `Climb up the ladder to ${layerName(action.to.z)}`
          : `Climb down the ladder${drop === '' ? ` to ${landsOn}` : drop}`;
      }
      if (action.to.z < here.z) {
        return `Step up ${side} to ${layerName(action.to.z)}`;
      }
      return `Move ${side}${drop}`;
    }
    case 'mine': {
      const underfoot =
        action.target.x === here.x && action.target.y === here.y
          ? ` (you are standing on it: ${knownFallText(state)})`
          : '';
      return `Mine ${whereFrom(here, action.target)}: ${mineOutcomeText(state, action.target, underfoot)}`;
    }
    case 'placeLadder':
      return `Place a ladder in ${placeWhere(here, action.target)}`;
    case 'placeTorch':
      return `Place a torch in ${placeWhere(here, action.target)}`;
    case 'craft': {
      const recipe = findRecipe(action.recipe);
      if (recipe === undefined) {
        return `Craft ${action.recipe}`;
      }
      return `Craft ${recipe.name} from ${stackListText(recipe.inputs)}`;
    }
    case 'pickUp': {
      const stack = [{ item: action.item, count: action.count }];
      const from = placeWhere(here, action.from);
      // The engine offers as much of a pile as fits the carry limit. When that
      // is not the whole pile, say so, or "Pick up 4 Stone" beside "Loose in
      // your cell: 5 Stone" looks like a mistake (issue #47 item 6). The pile
      // is in a cell touching the avatar's, which is always revealed; the
      // check is there so that this function can never read an unseen cell.
      let pile = action.count;
      if (isRevealed(state, action.from)) {
        for (const loose of looseItemsAt(state, action.from)) {
          if (loose.item === action.item) {
            pile = loose.count;
          }
        }
      }
      if (pile > action.count) {
        const name = itemDef(action.item).name;
        return `Pick up ${action.count} of the ${pile} ${name} from ${from} (only ${action.count} fit your carry limit)`;
      }
      return `Pick up ${stackListText(stack)} from ${from}`;
    }
    case 'drop': {
      const name = itemDef(action.item).name;
      return action.count === 1 ? `Drop 1 ${name}` : `Drop all ${action.count} ${name}`;
    }
    case 'leave':
      return 'Leave the cube with what you carry (ends the run alive)';
    // The M2 actions. The engine offers none of them yet (their modules are
    // stubs; decision note 0015), so these plain lines are never shown. The
    // play-tool task (M2-6) gives each its wording.
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'placeSafetyLamp':
    case 'seal':
      return `${action.type} in ${placeWhere(here, action.target)}`;
    case 'scan':
      return `scan around x${action.centre.x} y${action.centre.y} ${layerName(action.centre.z)}`;
    case 'stashPut':
    case 'stashTake':
      return `${action.type} ${action.count} ${itemDef(action.item).name}`;
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
    case 'giveUp':
      return action.type;
  }
}

/** "your cell", "the cell above you", "the cell north". */
function placeWhere(here: Vec3, target: Vec3): string {
  const where = whereFrom(here, target);
  return where === 'your cell' ? where : `the cell ${where}`;
}

/** "n", "ne", "sw", ... for a sideways offset; '' for none. The short form of `compass`. */
function compassShort(dx: number, dy: number): string {
  return (dy < 0 ? 'n' : dy > 0 ? 's' : '') + (dx > 0 ? 'e' : dx < 0 ? 'w' : '');
}

/**
 * The short form of `whereFrom`, for the names of choices: "here", "up",
 * "down", "n", "ne", "n-down" (north, one layer down), "n-up".
 */
function whereShort(from: Vec3, to: Vec3): string {
  const side = compassShort(to.x - from.x, to.y - from.y);
  const dz = to.z - from.z;
  const level = dz === 0 ? '' : dz < 0 ? 'up' : 'down';
  if (side === '') {
    return level === '' ? 'here' : level;
  }
  return level === '' ? side : `${side}-${level}`;
}

/** "lampOil" -> "lamp-oil": an id from src/data in the lower case a choice is typed in. */
function idInLowerCase(id: string): string {
  return id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The name of a choice: what the player may type instead of its number.
 *
 * A number says where a choice stands in the list, and the list changes
 * after every action. A name says what the choice does, seen from where the
 * avatar stands ("e" is always "go east", "mine-down" is always "mine the
 * block underfoot"), so it means the same thing at every step and is safe in
 * a chain (issue #30). It is made from the action alone, never from the cube.
 *
 * The names:
 * - moves: n, e, s, w (a walk or a step up: a direction offers one or the
 *   other, never both), up and down (on a ladder);
 * - mine-n, mine-ne, ... on your layer; mine-down for the block underfoot;
 *   mine-n-down, mine-ne-down, ... for the layer below;
 * - ladder-here, ladder-n, ladder-up, ladder-down; torch- the same;
 * - craft-ladder, craft-lamp-oil, ...: "craft-" and the recipe;
 * - take-here-stone, take-n-coal, ...: "take-", where from, and the item;
 * - drop-stone (one) and drop-all-stone (the whole stack);
 * - leave, and end for "end the shift".
 */
export function choiceName(state: GameState, entry: LogEntry): string {
  const here = state.avatar.pos;
  switch (entry.type) {
    case 'endShift':
      return 'end';
    case 'move': {
      const side = compassShort(entry.to.x - here.x, entry.to.y - here.y);
      if (side !== '') {
        return side;
      }
      return entry.to.z < here.z ? 'up' : 'down';
    }
    case 'mine':
      return `mine-${whereShort(here, entry.target)}`;
    case 'placeLadder':
      return `ladder-${whereShort(here, entry.target)}`;
    case 'placeTorch':
      return `torch-${whereShort(here, entry.target)}`;
    case 'craft':
      return `craft-${idInLowerCase(entry.recipe)}`;
    case 'pickUp':
      return `take-${whereShort(here, entry.from)}-${idInLowerCase(entry.item)}`;
    case 'drop':
      return entry.count === 1
        ? `drop-${idInLowerCase(entry.item)}`
        : `drop-all-${idInLowerCase(entry.item)}`;
    case 'leave':
      return 'leave';
    // The M2 actions: never offered yet (see `describeAction`). M2-6 names them.
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'placeSafetyLamp':
    case 'seal':
      return `${idInLowerCase(entry.type)}-${whereShort(here, entry.target)}`;
    case 'scan':
      return `scan-${whereShort(here, entry.centre)}`;
    case 'stashPut':
    case 'stashTake':
      return `${idInLowerCase(entry.type)}-${entry.count}-${idInLowerCase(entry.item)}`;
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
    case 'giveUp':
      return idInLowerCase(entry.type);
  }
}

/**
 * What a choice has in common with others that may share its line of the
 * list, or `null` for a choice that always has a line of its own.
 *
 * - A mine action: "Mine Stone, gives 1 Stone". Mine actions with the same
 *   words here and the same AP cost differ only in direction (issue #30).
 *   `null` for the block underfoot, whose line says what the fall will cost.
 * - A drop: "Drop Ladder (one, or all 6)". The two drops of an item, one and
 *   the whole stack, share a line (issue #46 item 3). With one carried there
 *   is a single drop, which then has a line of its own.
 */
export function choiceGroupText(state: GameState, entry: LogEntry): string | null {
  if (entry.type === 'drop') {
    const carried = countItem(state, entry.item);
    return `Drop ${itemDef(entry.item).name} (one, or all ${carried})`;
  }
  if (entry.type !== 'mine') {
    return null;
  }
  const here = state.avatar.pos;
  if (entry.target.x === here.x && entry.target.y === here.y) {
    return null;
  }
  return `Mine ${mineOutcomeText(state, entry.target, '')}`;
}

/** The text of one line of the action list. */
export function describeChoice(state: GameState, entry: LogEntry): string {
  if (entry.type === 'endShift') {
    return 'End the shift';
  }
  return describeAction(state, entry);
}

/** The display name of the structure with this code. */
function structureNameByCode(code: number): string {
  for (const def of Object.values(STRUCTURES)) {
    if (def.code === code) {
      return def.name.toLowerCase();
    }
  }
  return 'structure';
}

const GAUGE_REASONS: Record<string, string> = {
  upkeep: 'the shift',
  crafted: 'crafted',
};

const DAMAGE_CAUSES: Record<string, string> = { fall: 'the fall' };

/**
 * What happened in one step, as short sentences. `after` is the state the
 * step led to; it is used only to check that a place is one the player can
 * see before naming it.
 */
export function describeEvents(after: GameState, events: GameEvent[]): string[] {
  const lines: string[] = [];
  // Said once for a step, however many blocks it was seen on.
  let tracesSaid = false;
  const tracesLine = tracesSeenText(events);
  for (const event of events) {
    switch (event.type) {
      case 'moved':
        // The new position is in the view; no need to say it twice.
        break;
      case 'fell':
        lines.push(
          event.kind === 'chosenDrop'
            ? `You dropped ${blocksText(event.distance)}.`
            : `You lost your footing and fell ${blocksText(event.distance)}.`,
        );
        break;
      case 'damageTaken':
        lines.push(
          `You lost ${event.amount} health from ${DAMAGE_CAUSES[event.cause] ?? event.cause} (now ${event.health}).`,
        );
        break;
      case 'blockMined':
        lines.push(`Mined ${blockDefByCode(event.block).name}.`);
        break;
      case 'blockRevealed':
        // The map shows what is newly known.
        break;
      case 'mineralTracesSeen':
        if (!tracesSaid) {
          lines.push(tracesLine);
          tracesSaid = true;
        }
        break;
      case 'itemGained':
        lines.push(`Got ${event.count} ${itemDef(event.item).name}.`);
        break;
      case 'itemPickedUp':
        lines.push(`Picked up ${event.count} ${itemDef(event.item).name}.`);
        break;
      case 'itemLeft':
        lines.push(
          `${event.count} ${itemDef(event.item).name} did not fit your carry limit and was left there.`,
        );
        break;
      case 'itemDropped':
        lines.push(`Dropped ${event.count} ${itemDef(event.item).name}.`);
        break;
      case 'itemFell': {
        // Where it came to rest is said only if the player can see that cell.
        const where = isRevealed(after, event.to)
          ? `${blocksText(event.to.z - event.from.z)} to ${layerName(event.to.z)}`
          : 'out of sight';
        // "A loose pile of": so that "Got 1 Stone. 1 Stone fell ..." is not
        // read as the stone just got falling (issue #47 item 6).
        lines.push(`A loose pile of ${event.count} ${itemDef(event.item).name} fell ${where}.`);
        break;
      }
      case 'structurePlaced':
        lines.push(`Placed a ${structureNameByCode(event.structure)}.`);
        break;
      case 'crafted':
        lines.push(`Crafted ${findRecipe(event.recipe)?.name ?? event.recipe}.`);
        break;
      case 'shiftEnded':
        lines.push(`Shift ${event.shift} ended; shift ${event.nextShift} begins.`);
        break;
      case 'fuelChanged':
        lines.push(
          `Fuel ${signed(event.delta)} (${GAUGE_REASONS[event.reason] ?? event.reason}), now ${event.fuel}.`,
        );
        break;
      case 'lampOilChanged':
        lines.push(
          `Lamp oil ${signed(event.delta)} (${GAUGE_REASONS[event.reason] ?? event.reason}), now ${event.lampOil}.` +
            (event.lampOil === 0 ? ' The lamp is out.' : ''),
        );
        break;
      case 'runEnded':
        // The view that follows opens with the outcome.
        break;
    }
  }
  return lines;
}

/**
 * The sentence for a step in which mineral traces were first seen.
 *
 * The engine notes traces after the action is done (`applyAction`: the mine,
 * then gravity, reveal, traces). So when a step mines an ore and traces are
 * then noticed on rock it uncovered, the mined ore is already gone from the
 * cube: those traces come from OTHER ore, still in the rock. The sentence
 * says so, because a player may otherwise take them for traces of the ore
 * now in the pack (issue #47 item 6; review of PR #48). Only the step's
 * events are read: which block was mined, and that traces were seen.
 */
function tracesSeenText(events: GameEvent[]): string {
  const onMap = `(On the map: ${tracedSymbolsText()}.)`;
  const oreNames: string[] = TELLS.mineralTraces.sourceBlocks;
  const minedOre = events.some(
    (event) => event.type === 'blockMined' && oreNames.includes(blockIdByCode(event.block)),
  );
  if (minedOre) {
    return (
      'You notice mineral traces in the rock this uncovered: other ore is near ' +
      `(the ore you just mined no longer counts). ${onMap}`
    );
  }
  return `You notice mineral traces in the rock: ore is near. ${onMap}`;
}

/** The id in src/data of the block with this code ("ironOre"), or '' if there is none. */
function blockIdByCode(code: number): string {
  for (const [blockId, def] of Object.entries(BLOCKS)) {
    if (def.code === code) {
      return blockId;
    }
  }
  return '';
}

/** "+3" or "-1". */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
