// Words for the play interface: what each choice means, and what happened
// after one was taken.
//
// Like view.ts, these functions say only what the player could know. A
// square is read only through the engine's `knownSquare`, which never answers
// for a block below a top or under a tree that was never cut.

import {
  BLOCKS,
  STRUCTURES,
  SURFACE,
  TELLS,
  blockDefByCode,
  findRecipe,
  itemDef,
} from '../../data';
import type { ItemStack } from '../../data';
import { isSquare, knownSquare } from '../../engine';
import type { Action, GameEvent, GameState } from '../../engine';
import type { LogEntry } from './log';
import { squareText } from './squares';
import { tracedSymbolsText } from './symbols';

/** "2 Stone, 1 Coal", or "nothing". */
export function stackListText(stacks: ItemStack[]): string {
  if (stacks.length === 0) {
    return 'nothing';
  }
  return stacks.map((stack) => `${stack.count} ${itemDef(stack.item).name}`).join(', ');
}

/** "ground level" or "depth 3". A square's depth is how many blocks were taken from it. */
export function depthName(depth: number): string {
  return depth === 0 ? 'ground level' : `depth ${depth}`;
}

/** What the player is told when the run is over, in words (the engine's ids are not shown). */
const RUN_END_TEXT: Record<string, string> = {
  mineClosed:
    'you closed the mine: the run ended alive, with what was in the stockpile (a "salvage" run)',
  outOfFuel: 'you ran out of fuel and the run is lost',
  // The crew lost its last health (design doc 5.3).
  buried: 'the crew was buried by a slumping pit wall and the run is lost',
  drowned: 'the crew drowned and the run is lost',
  burned: 'the crew was burned and the run is lost',
  poisoned: 'the crew was poisoned by gas and the run is lost',
};

/** How a run ended, in words. `cause` is the engine's `RunEndCause`. */
export function runEndText(cause: string): string {
  return RUN_END_TEXT[cause] ?? cause;
}

/**
 * What the top block of the square (x, y) is and gives, as far as the player
 * knows: "Stone, mineral traces, gives 1 Stone". "ground you have not seen"
 * under a tree that was never cut.
 */
export function topBlockText(state: GameState, x: number, y: number): string {
  const square = knownSquare(state, x, y);
  if (square.top === null) {
    return square.depth >= state.size.z ? 'the bedrock floor' : 'ground you have not seen';
  }
  const block = blockDefByCode(square.top.block);
  const traces = square.traces ? ', mineral traces' : '';
  return `${block.name}${traces}, gives ${stackListText(block.yields)}`;
}

function describeAction(state: GameState, action: Action): string {
  switch (action.type) {
    case 'mine': {
      const where = squareText(action.x, action.y);
      // An entry from a log may name a square that is not on the map; the
      // engine refuses it, but this line is worked out first.
      if (!isSquare(state, action.x, action.y)) {
        return `Mine ${where}`;
      }
      const depth = depthName(knownSquare(state, action.x, action.y).depth);
      return `Mine ${where} (${depth}): ${topBlockText(state, action.x, action.y)}`;
    }
    case 'cutTree':
      return (
        `Cut the tree on ${squareText(action.x, action.y)}: ` +
        `gives ${stackListText(SURFACE.cutTree.yields)}; the ground under it shows`
      );
    case 'craft': {
      const recipe = findRecipe(action.recipe);
      if (recipe === undefined) {
        return `Craft ${action.recipe}`;
      }
      return `Craft ${recipe.name} from ${stackListText(recipe.inputs)}`;
    }
    case 'closeMine':
      return 'Close the mine: ends the run alive, with what is in the stockpile';
    // The M2 actions. The engine offers none of them yet (their modules are
    // stubs; decision note 0015), so these plain lines are never shown. The
    // play-tool task for the hazards (T14) gives each its wording.
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'seal':
      return `${action.type} at ${squareText(action.target.x, action.target.y)}`;
    case 'scan':
      return `scan around ${squareText(action.centre.x, action.centre.y)}`;
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
      return action.type;
  }
}

/** "placeSupport" -> "place-support": an id from src/data in the lower case a choice is typed in. */
function idInLowerCase(id: string): string {
  return id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The name of a choice: what the player types to take it. It is made from
 * the action alone, never from the cube, so it means the same at every step
 * and is safe in a chain (issue #30).
 *
 * The names:
 * - "mine 3,4": mine the top block of the square x 3, y 4;
 * - "cut 3,4": cut the tree on that square;
 * - craft-fuel, craft-support, ...: "craft-" and the recipe;
 * - close-mine, and end for "end the shift".
 */
export function choiceName(entry: LogEntry): string {
  switch (entry.type) {
    case 'endShift':
      return 'end';
    case 'mine':
      return `mine ${entry.x},${entry.y}`;
    case 'cutTree':
      return `cut ${entry.x},${entry.y}`;
    case 'craft':
      return `craft-${idInLowerCase(entry.recipe)}`;
    case 'closeMine':
      return 'close-mine';
    // The M2 actions: never offered yet (see `describeAction`).
    case 'placeSupport':
    case 'placeExplosive':
    case 'placePump':
    case 'placeVent':
    case 'seal':
      return `${idInLowerCase(entry.type)} ${entry.target.x},${entry.target.y}`;
    case 'scan':
      return `scan ${entry.centre.x},${entry.centre.y}`;
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
      return idInLowerCase(entry.type);
  }
}

/**
 * The words for a choice: a line of the action list, and the start of the
 * line that says what was done (`takeTurn`). Describe the choice in the state
 * before it is taken.
 */
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

/**
 * The kinds of hazard that hurt the crew, in words (design doc 5.2). The
 * keys are the engine's `DamageCause`; a cause not listed is shown by its id.
 */
const DAMAGE_CAUSES: Record<string, string> = {
  slump: 'a slumping pit wall',
  water: 'water',
  lava: 'lava',
  gas: 'gas',
  gasExplosion: 'a gas explosion',
  explosion: 'an explosion',
};

/**
 * What the player now sees on top of the square (x, y) of `after`, as a
 * sentence: "The top block there is now Coal seam (depth 2)."
 */
function newTopText(after: GameState, x: number, y: number): string {
  const square = knownSquare(after, x, y);
  if (square.top === null) {
    return `Nothing is left there: ${squareText(x, y)} is at the bedrock floor.`;
  }
  const block = blockDefByCode(square.top.block);
  const traces = square.traces ? ', with mineral traces' : '';
  return `The top block there is now ${block.name}${traces} (${depthName(square.depth)}).`;
}

/**
 * What happened in one step, as short sentences. `after` is the state the
 * step led to; it is read only through `knownSquare`, to say what a square
 * shows now.
 */
export function describeEvents(after: GameState, events: GameEvent[]): string[] {
  const lines: string[] = [];
  // Said once for a step, however many blocks it was seen on.
  let tracesSaid = false;
  const tracesLine = tracesSeenText(events);
  // A roof that fell in says what the new top is itself.
  const roofFell = events.some((event) => event.type === 'roofCollapsed');
  for (const event of events) {
    switch (event.type) {
      case 'damageTaken':
        lines.push(
          `The crew lost ${event.amount} health to ${DAMAGE_CAUSES[event.cause] ?? event.cause} where it worked this shift (crew health is now ${event.health}).`,
        );
        break;
      case 'blockMined':
        lines.push(`Mined ${blockDefByCode(event.block).name}.`);
        if (!roofFell) {
          lines.push(newTopText(after, event.pos.x, event.pos.y));
        }
        break;
      case 'roofCollapsed':
        lines.push(
          "It was the roof of an open space, which fell in: the square's new top is rubble.",
        );
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
        // Every yield goes straight into the stockpile (design doc 4.1).
        lines.push(`Got ${event.count} ${itemDef(event.item).name}.`);
        break;
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
      case 'runEnded':
        // The view that follows opens with the outcome.
        break;
      case 'treeCut':
        lines.push(
          `You cut down the tree; a stump is left. ${newTopText(after, event.pos.x, event.pos.y)}`,
        );
        break;
      case 'treeGrew':
        lines.push(`A tree grew back on the stump at ${squareText(event.pos.x, event.pos.y)}.`);
        break;
    }
  }
  return lines;
}

/**
 * The sentence for a step in which mineral traces were first seen.
 *
 * The engine notes traces after the action is done (`applyAction`: the mine,
 * then reveal, then traces). So when a step mines an ore and traces are then
 * noticed on the rock it uncovered, the mined ore is already gone from the
 * cube: those traces come from OTHER ore, still in the rock. The sentence
 * says so, because a player may otherwise take them for traces of the ore
 * just mined (issue #47 item 6; review of PR #48). Only the step's events are
 * read: which block was mined, and that traces were seen.
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
