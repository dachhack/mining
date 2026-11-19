// Words for the play interface: what each choice in the action list means,
// and what happened after one was taken.
//
// Like view.ts, these functions say only what the avatar could know. A choice
// is described from the action itself (which the engine offers only for cells
// in reach, all of them revealed) and from the data tables.

import {
  AVATAR,
  BLOCKS,
  STRUCTURES,
  SURFACE,
  TELLS,
  WORLD,
  blockDefByCode,
  findRecipe,
  itemDef,
} from '../../data';
import type { ItemStack, Vec3 } from '../../data';
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
} from '../../engine';
import type { Action, GameEvent, GameState } from '../../engine';
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
 * What the player knows about the drop that follows mining the block the
 * avatar stands on (digging down; owner, issue #75).
 *
 * Digging down drops the avatar into the cell of the block it mined. If the
 * cell under that one gives footing, that is a safe one-block drop
 * (`AVATAR.safeDigDownBlocks`), as in Minecraft. If not, the avatar keeps
 * falling, and the whole fall, counted from where it stood, is uncontrolled
 * and hurts (decision note 0010).
 *
 * Worked out from revealed cells only. The column under the mined block is
 * walked downwards; at the first cell the player has not seen the answer
 * stops, and says only what could happen, so the text cannot give away what
 * that cell holds (issue #75 item 2).
 */
function knownFallText(state: GameState): string {
  const drop = knownDigDownDrop(state);
  if (drop.kind === 'ladder') {
    return 'your ladder holds you, you will not fall';
  }
  const fall = drop.blocks;
  if (drop.kind === 'unseen') {
    const unseen = layerName(drop.unseenZ);
    if (fall <= AVATAR.safeDigDownBlocks) {
      return `you drop at least ${blocksText(fall)}; if there is nothing under it (${unseen}, unseen) you will fall further and be hurt`;
    }
    const cost = fallDamage('uncontrolled', fall);
    return `you will fall ${blocksText(fall)} or more and lose at least ${cost} health; the cell under that (${unseen}) is unseen`;
  }
  if (fall <= AVATAR.safeDigDownBlocks) {
    return `you drop ${blocksText(fall)}, no harm`;
  }
  // A known fall longer than the safe drop: uncontrolled from the first block.
  const cost = fallDamage('uncontrolled', fall);
  const harm =
    isFatalFall(fall) || cost >= state.avatar.health ? ', FATAL' : ` and lose ${cost} health`;
  return `you will fall ${blocksText(fall)}${harm}`;
}

/**
 * What the player knows of the drop that digging down would cause. One of:
 * - `{ kind: 'ladder' }`: a ladder in the avatar's own cell holds it;
 * - `{ kind: 'known', blocks }`: the whole fall is known, `blocks` long;
 * - `{ kind: 'unseen', blocks, unseenZ }`: the avatar falls at least
 *   `blocks`, and the layer `unseenZ` cell that decides whether it falls on
 *   is unseen.
 *
 * Read from revealed cells only. With the block gone the avatar drops into
 * its cell: a fall of 1. It falls on while the cell below is open and has no
 * ladder. The walk stops at the first unseen cell, so nothing here depends on
 * what that cell holds (issue #75 item 2). `knownFallText` and
 * `digDownIsKnownSafe` both use it, so the list and the tap map cannot
 * disagree.
 */
type DigDownDrop =
  | { kind: 'ladder' }
  | { kind: 'known'; blocks: number }
  | { kind: 'unseen'; blocks: number; unseenZ: number };

function knownDigDownDrop(state: GameState): DigDownDrop {
  const here = state.avatar.pos;
  if (structureAt(state, here) === STRUCTURES.ladder.code) {
    return { kind: 'ladder' };
  }
  let fall = 1;
  for (;;) {
    const below = { x: here.x, y: here.y, z: here.z + fall + 1 };
    if (!isRevealed(state, below)) {
      return { kind: 'unseen', blocks: fall, unseenZ: below.z };
    }
    if (isSolid(state, below)) {
      return { kind: 'known', blocks: fall };
    }
    fall += 1;
    if (structureAt(state, below) === STRUCTURES.ladder.code) {
      return { kind: 'known', blocks: fall }; // a ladder further down catches the fall
    }
  }
}

/**
 * True if the drop that digging down would cause is known to be safe: a
 * ladder holds the avatar, or the whole drop is known and no longer than
 * `AVATAR.safeDigDownBlocks`. For the tap map: such a dig needs no warning.
 */
function digDownIsKnownSafe(state: GameState): boolean {
  const drop = knownDigDownDrop(state);
  if (drop.kind === 'ladder') {
    return true;
  }
  return drop.kind === 'known' && drop.blocks <= AVATAR.safeDigDownBlocks;
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
    case 'cutTree': {
      // Like mining: say what it gives, and if that is too heavy to carry.
      const yields = SURFACE.cutTree.yields;
      const fits = yields.every((stack) => canCarry(state, stack.item, stack.count));
      const tooHeavy = fits ? '' : ' (too heavy to carry: it will be left lying there)';
      const side = compass(action.target.x - here.x, action.target.y - here.y);
      return `Cut the tree ${side}: gives ${stackListText(yields)}${tooHeavy}; the ground under it shows, and a tree grows back in ${SURFACE.regrowShifts} shifts if the stump is left alone`;
    }
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
 * - mine-n, mine-e, mine-s, mine-w beside you; mine-down for the block
 *   underfoot; mine-up overhead (only with a support, issue #75);
 * - ladder-here, ladder-n, ladder-up, ladder-down; torch- the same;
 * - craft-ladder, craft-lamp-oil, ...: "craft-" and the recipe;
 * - take-here-stone, take-n-coal, ...: "take-", where from, and the item;
 * - drop-stone (one) and drop-all-stone (the whole stack);
 * - cut-n, cut-e, cut-s, cut-w: cut the tree in that direction (issue #70);
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
    case 'cutTree':
      return `cut-${whereShort(here, entry.target)}`;
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
      case 'treeCut':
        lines.push('You cut down the tree; a stump is left.');
        break;
      case 'treeGrew': {
        const here = after.avatar.pos;
        const side = compass(event.pos.x - here.x, event.pos.y - here.y);
        const where = side === '' ? '' : ` at x${event.pos.x} y${event.pos.y} (${side} of you)`;
        lines.push(`A tree grew back on a stump${where}.`);
        break;
      }
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

/**
 * The warning a choice carries, or `null` if it carries none: a fall or
 * a drop (which may cost health), or a yield (of mining or of cutting a
 * tree) too heavy to carry. The tap map
 * of the phone preview (src/app/map) acts at once on a tap only for a choice
 * with no warning; one with a warning is shown first, with this text.
 * Worked out from revealed cells only, like the rest of this file.
 */
export function choiceWarning(state: GameState, entry: LogEntry): string | null {
  const here = state.avatar.pos;
  if (entry.type === 'move' && entry.drop > 0) {
    return `you will drop ${blocksText(entry.drop)} to ${layerName(entry.to.z + entry.drop)}`;
  }
  if (entry.type === 'mine') {
    if (entry.target.x === here.x && entry.target.y === here.y && entry.target.z > here.z) {
      // A dig known to end in the safe one-block drop needs no warning: one
      // tap digs (issue #75). Otherwise the warning says what could happen.
      if (!digDownIsKnownSafe(state)) {
        return `you are standing on it: ${knownFallText(state)}`;
      }
    }
    const block = blockDefAt(state, entry.target);
    const fits = block.yields.every((stack) => canCarry(state, stack.item, stack.count));
    if (!fits) {
      return 'too heavy to carry: it will be left lying there';
    }
  }
  if (entry.type === 'cutTree') {
    // Like mining: timber that does not fit is left on the stump (issue #70).
    const fits = SURFACE.cutTree.yields.every((stack) => canCarry(state, stack.item, stack.count));
    if (!fits) {
      return 'too heavy to carry: the timber will be left lying on the stump';
    }
  }
  return null;
}
