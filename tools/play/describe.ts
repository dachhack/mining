// Words for the play interface: what each choice in the action list means,
// and what happened after one was taken.
//
// Like view.ts, these functions say only what the avatar could know. A choice
// is described from the action itself (which the engine offers only for cells
// in reach, all of them revealed) and from the data tables.

import { AVATAR, STRUCTURES, WORLD, blockDefByCode, findRecipe, itemDef } from '../../src/data';
import type { ItemStack, Vec3 } from '../../src/data';
import { blockDefAt, canCarry, isRevealed, isSolid, structureAt } from '../../src/engine';
import type { Action, GameEvent, GameState } from '../../src/engine';
import type { LogEntry } from './log';

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
 * M1, so the list must say it.
 *
 * It is worked out from revealed cells only. The column under the avatar is
 * walked downwards, and at the first cell the player has not seen the answer
 * stops at "at least so far": what lies beyond is not looked at, so the text
 * cannot give it away. (The engine's own fall, in gravity.ts, uses the real
 * cube; the two agree whenever the whole column is revealed.)
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
  for (;;) {
    const below = { x: here.x, y: here.y, z: here.z + fall + 1 };
    if (!isRevealed(state, below)) {
      known = false;
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

  const harm =
    fall >= AVATAR.fatalFallBlocks
      ? ', FATAL'
      : fall > AVATAR.freeFallBlocks
        ? ', it will cost health'
        : known
          ? ', no harm'
          : '';
  return known
    ? `you will fall ${blocksText(fall)}${harm}`
    : `you will fall ${blocksText(fall)} or more${harm}; below that is unseen`;
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
      const block = blockDefAt(state, action.target);
      // A yield that does not fit the carry limit is left in the hole.
      const fits = block.yields.every((stack) => canCarry(state, stack.item, stack.count));
      const tooHeavy = fits ? '' : ' (too heavy to carry: it will be left lying there)';
      const underfoot =
        action.target.x === here.x && action.target.y === here.y
          ? ` (you are standing on it: ${knownFallText(state)})`
          : '';
      return (
        `Mine ${whereFrom(here, action.target)}: ${block.name}${underfoot}` +
        `, gives ${stackListText(block.yields)}${tooHeavy}`
      );
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
      return `Pick up ${stackListText(stack)} from ${placeWhere(here, action.from)}`;
    }
    case 'drop': {
      const name = itemDef(action.item).name;
      return action.count === 1 ? `Drop 1 ${name}` : `Drop all ${action.count} ${name}`;
    }
    case 'leave':
      return 'Leave the cube with what you carry (ends the run alive)';
  }
}

/** "your cell", "the cell above you", "the cell north". */
function placeWhere(here: Vec3, target: Vec3): string {
  const where = whereFrom(here, target);
  return where === 'your cell' ? where : `the cell ${where}`;
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
  bankedApRefund: 'banked AP',
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
  for (const event of events) {
    switch (event.type) {
      case 'moved':
        // The new position is in the view; no need to say it twice.
        break;
      case 'fell':
        lines.push(`You fell ${blocksText(event.distance)}.`);
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
        lines.push(`${event.count} ${itemDef(event.item).name} fell ${where}.`);
        break;
      }
      case 'structurePlaced':
        lines.push(`Placed a ${structureNameByCode(event.structure)}.`);
        break;
      case 'crafted':
        lines.push(`Crafted ${findRecipe(event.recipe)?.name ?? event.recipe}.`);
        break;
      case 'apBanked':
        if (event.amount > 0) {
          lines.push(`Banked ${event.amount} AP (counter now ${event.bankedAp}).`);
        }
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

/** "+3" or "-1". */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
