// Acting on a square of the map: "mine x,y", "cut x,y", "support x,y", and
// the camp actions "camp x,y", "rest x,y" and "decommission x,y", which name
// a camp by its centre square (issues #86, #94 and #100).
//
// There is no miner: the player names any square. With some 1,700 squares to
// choose from, these actions are not lines of a list; the play tool takes
// them by name and the phone preview by a tap. Both come here to turn a
// square into the action the play log records, or into the sentence that says
// why it cannot be done.
//
// Nothing here decides a rule. Whether a mine is allowed is the engine's
// `mineCheck`, and the engine checks the action again when it is taken. Like
// view.ts, a square is read only through `knownSquare`, so a sentence can
// never tell something below a top block.

import { ACTION_COSTS, CAMPS, SURFACE, blockDefByCode, itemDef } from '../../data';
import {
  campAtSquare,
  campCentredAt,
  foundCampCheck,
  isRunActive,
  isSquare,
  knownSquare,
  mineCheck,
  supportCheck,
  unstableAfterMine,
} from '../../engine';
import type {
  Camp,
  DecommissionCampAction,
  FoundCampAction,
  FoundCampCheck,
  GameState,
  CutTreeAction,
  MineAction,
  PlaceSupportAction,
  RestAction,
  Square,
  UnstableSquare,
} from '../../engine';

/** The actions that name a square: what `SquareChoice.entry` may hold. */
export type SquareEntry =
  | MineAction
  | CutTreeAction
  | PlaceSupportAction
  | FoundCampAction
  | RestAction
  | DecommissionCampAction;

/** What a typed choice or a tap on a square came to. */
export interface SquareChoice {
  /** The action to take, or `null` if it is refused. */
  entry: SquareEntry | null;
  /** Why it is refused, as a sentence for the player; `null` when `entry` is set. */
  refusal: string | null;
  /**
   * For a mine that is allowed but risky: the squares it would make unstable
   * (design doc 11), and `warning`, the sentence that names them. The play
   * tool and the phone map ask the player to confirm such a mine. Empty and
   * `null` for everything else.
   */
  makesUnstable: UnstableSquare[];
  warning: string | null;
  /**
   * For a refused "camp x,y": the squares of the 3 x 3 patch that are in the
   * way (the ones with a tree, the ones off the level, ...), so that a map
   * can mark them. Empty for everything else.
   */
  blockedSquares: Square[];
}

function allowed(entry: SquareEntry): SquareChoice {
  return { entry, refusal: null, makesUnstable: [], warning: null, blockedSquares: [] };
}

function refused(refusal: string, blockedSquares: Square[] = []): SquareChoice {
  return { entry: null, refusal, makesUnstable: [], warning: null, blockedSquares };
}

/** "x3 y4": how a square is written in every sentence. */
export function squareText(x: number, y: number): string {
  return `x${x} y${y}`;
}

/** The refusal for a square that is not on the map, or `null` if it is. */
function offMapRefusal(state: GameState, x: number, y: number): string | null {
  if (isSquare(state, x, y)) {
    return null;
  }
  return (
    `${squareText(x, y)} is not a square of the map ` +
    `(x is 0 to ${state.size.x - 1}, y is 0 to ${state.size.y - 1}).`
  );
}

/** "x3 y3 (north, depth 1) and x4 y4 (east, depth 0)". */
function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) {
    return parts.join('');
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

/**
 * "mine x,y": the mine action for the square (x, y), or why it is refused:
 * off the map, a tree, no block left, the level rule (naming each neighbour
 * that is too high and its depth: design doc 4.2), or too little AP.
 */
export function mineChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  const where = squareText(x, y);
  const check = mineCheck(state, x, y);
  if (check.refusal === 'tree') {
    return refused(`A tree stands on ${where}: cut it first ("cut ${x},${y}").`);
  }
  if (check.refusal === 'bottom') {
    return refused(`${where} has no block left: it is at the bedrock floor of the cube.`);
  }
  if (check.refusal === 'camp') {
    const camp = campAtSquare(state, x, y);
    // The camp is named by its centre square.
    const command = camp === null ? '' : ` ("decommission ${camp.pos.x},${camp.pos.y}")`;
    return refused(
      `A camp stands on ${where}: its squares cannot be mined while it stands. ` +
        `To mine there, decommission the camp first${command}.`,
    );
  }
  if (check.refusal === 'neighbourHigher') {
    const depth = knownSquare(state, x, y).depth;
    const higher = check.higherNeighbours.map(
      (neighbour) =>
        `${squareText(neighbour.x, neighbour.y)} (${neighbour.direction}, depth ${neighbour.depth})`,
    );
    return refused(
      `The level rule: ${where} is at depth ${depth}, and a square may be mined only when ` +
        `no square beside it is higher. Too high: ${joinWithAnd(higher)}. Mine there first.`,
    );
  }
  if (check.ap === null) {
    // `mineCheck` gives a cost whenever it gives no refusal.
    return refused(`${where} cannot be mined.`);
  }
  if (check.ap > state.ap) {
    return refused(
      `Mining ${where} costs ${check.ap} AP and you have ${state.ap} left this shift.`,
    );
  }
  const entry: MineAction = { type: 'mine', x, y, ap: check.ap };
  // The squares this mine would make unstable. Every input of that rule is
  // seen by the player (depths, top blocks, trees, supports), so naming them
  // tells nothing hidden.
  const makesUnstable = unstableAfterMine(state, x, y);
  if (makesUnstable.length === 0) {
    return allowed(entry);
  }
  return {
    entry,
    refusal: null,
    makesUnstable,
    warning: unstableWarning(state, x, y, makesUnstable),
    blockedSquares: [],
  };
}

/** "x3 y4 (Dirt, at the top of a slope that falls 2)". */
function unstableSquareText(state: GameState, square: UnstableSquare): string {
  const top = knownSquare(state, square.x, square.y).top;
  const name = top === null ? 'ground' : blockDefByCode(top.block).name;
  const why =
    square.reason === 'steep'
      ? 'beside a step of 2 or more'
      : `at the top of a slope that would fall ${square.fall}`;
  return `${squareText(square.x, square.y)} (${name}, ${why})`;
}

/**
 * The warning for a mine that would make squares unstable: which squares,
 * why, and what will happen to them.
 */
function unstableWarning(
  state: GameState,
  x: number,
  y: number,
  squares: UnstableSquare[],
): string {
  const names = squares.map((square) => unstableSquareText(state, square));
  const it = squares.length === 1 ? 'It' : 'Each';
  return (
    `Mining ${squareText(x, y)} would make ${joinWithAnd(names)} unstable. ` +
    `${it} would crack when the shift ends and slump into the pit later, ` +
    'unless it is supported or the slope is made gentler first.'
  );
}

/**
 * "support x,y": the action that places a support on the square (x, y), or
 * why it is refused: off the map, no support to place, a tree, no block
 * left, something already placed there, or too little AP.
 */
export function supportChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  const where = squareText(x, y);
  const check = supportCheck(state, x, y);
  if (check.refusal === 'noSupport') {
    return refused('You have no support to place: craft one first ("craft-support").');
  }
  if (check.refusal === 'tree') {
    return refused(
      `A tree stands on ${where}: nothing is placed on a tree, and its roots hold the square anyway.`,
    );
  }
  if (check.refusal === 'bottom') {
    return refused(`${where} has no block left to support: it is at the bedrock floor.`);
  }
  if (check.refusal === 'occupied') {
    return refused(`Something is already placed on ${where}: a square holds one thing.`);
  }
  if (check.refusal === 'camp') {
    return refused(`A camp stands on ${where}: nothing is placed on a camp square.`);
  }
  if (check.ap === null) {
    // `supportCheck` gives a cost whenever it gives no refusal.
    return refused(`A support cannot be placed on ${where}.`);
  }
  if (check.ap > state.ap) {
    return refused(
      `Placing a support costs ${check.ap} AP and you have ${state.ap} left this shift.`,
    );
  }
  return allowed({ type: 'placeSupport', x, y, ap: check.ap });
}

/** What placing a support costs in AP, for the lines that say how to. */
export const SUPPORT_AP = ACTION_COSTS.placeSupport;

/**
 * "cut x,y": the action that cuts the tree on the square (x, y), or why it
 * is refused: off the map, no tree there, or too little AP.
 */
export function cutChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  const where = squareText(x, y);
  if (!knownSquare(state, x, y).tree) {
    return refused(`There is no tree on ${where} to cut.`);
  }
  const cost = SURFACE.cutTree.ap;
  if (cost > state.ap) {
    return refused(
      `Cutting the tree on ${where} costs ${cost} AP and you have ${state.ap} left this shift.`,
    );
  }
  return allowed({ type: 'cutTree', x, y, ap: cost });
}

// ---------------------------------------------------------------------------
// Camps (design doc 8; issue #100)
// ---------------------------------------------------------------------------

/** "x2 y3, x3 y3 and x4 y3". */
function squareListText(squares: Square[]): string {
  return joinWithAnd(squares.map((square) => squareText(square.x, square.y)));
}

/** "x2-4, y2-4": the 3 x 3 patch round a centre square, as the player reads it off the map. */
export function patchText(x: number, y: number): string {
  const half = CAMPS.halfWidth;
  return `x${x - half}-${x + half}, y${y - half}-${y + half}`;
}

/**
 * The sentence for a patch `foundCampCheck` refuses: the reason, and the
 * squares in the way. `x`, `y` is the centre square that was asked about.
 */
function foundRefusalText(state: GameState, x: number, y: number, check: FoundCampCheck): string {
  const patch = `the 3 x 3 patch round ${squareText(x, y)} (${patchText(x, y)})`;
  const which = squareListText(check.squares);
  switch (check.refusal) {
    case 'noKit':
      return (
        `You have no ${itemDef(CAMPS.kitItem).name.toLowerCase()}: founding a camp uses one up. ` +
        'One is crafted at a camp ("craft-camp-kit").'
      );
    case 'offMap':
      return (
        `A camp needs a 3 x 3 patch of squares, and the patch round ${squareText(x, y)} would reach ` +
        'over the edge of the map. Name a centre square that is not on the edge.'
      );
    case 'tree':
      return `A camp needs clear ground, and ${patch} has a tree on ${which}. Cut it first.`;
    case 'notFlat': {
      const depth = knownSquare(state, x, y).depth;
      const others = check.squares.map(
        (square) =>
          `${squareText(square.x, square.y)} (depth ${knownSquare(state, square.x, square.y).depth})`,
      );
      return (
        `A camp needs a flat patch: all 9 squares at the same depth. ${squareText(x, y)} is at ` +
        `depth ${depth}; not level with it: ${joinWithAnd(others)}.`
      );
    }
    case 'bottom':
      return `${patch} is at the bedrock floor of the cube: there is nothing to stand a camp on.`;
    case 'water':
      return `A camp cannot be founded in water: ${which} of ${patch} is flooded.`;
    case 'lava':
      return `A camp cannot be founded on lava: there is lava on ${which} of ${patch}.`;
    case 'gas':
      return `A camp cannot be founded in gas: there is gas on ${which} of ${patch}.`;
    case 'structure':
      return `Something is placed on ${which}: a camp needs a patch with nothing built on it.`;
    case 'camp':
      return `Another camp already stands on ${which}: camps do not overlap.`;
    case null:
      return `A camp cannot be founded round ${squareText(x, y)}.`;
  }
}

/**
 * "camp x,y": the action that founds a camp on the flat 3 x 3 patch whose
 * centre square is (x, y), or why it is refused, with the squares in the way
 * (`blockedSquares`). Founding costs all the AP left in the shift.
 */
export function campChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  const check = foundCampCheck(state, x, y);
  if (!check.allowed) {
    return refused(foundRefusalText(state, x, y, check), check.squares);
  }
  if (state.ap < CAMPS.foundMinAp) {
    return refused(
      `Founding a camp takes the rest of the shift and needs at least ${CAMPS.foundMinAp} AP; ` +
        `you have ${state.ap} left this shift.`,
    );
  }
  return allowed({ type: 'foundCamp', x, y, ap: state.ap });
}

/** The refusal for a camp action that names a square with no camp centred on it. */
function noCampRefusal(state: GameState, x: number, y: number): string {
  if (state.camps.length === 0) {
    return 'There is no camp yet: found one first ("camp X,Y").';
  }
  const centres = state.camps.map((camp: Camp) => squareText(camp.pos.x, camp.pos.y));
  return (
    `No camp is centred on ${squareText(x, y)}. A camp is named by its centre square: ` +
    `${joinWithAnd(centres)}.`
  );
}

/**
 * "rest x,y": the action that rests the crew at the camp whose centre square
 * is (x, y), or why it is refused. Resting costs all the AP left.
 */
export function restChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  if (campCentredAt(state, x, y) === null) {
    return refused(noCampRefusal(state, x, y));
  }
  if (state.crew.restingAt !== null) {
    return refused('The crew is already resting this shift.');
  }
  if (state.ap < CAMPS.restMinAp) {
    return refused(
      `Resting takes the rest of the shift and needs at least ${CAMPS.restMinAp} AP; ` +
        `you have ${state.ap} left this shift.`,
    );
  }
  return allowed({ type: 'rest', x, y, ap: state.ap });
}

/**
 * "decommission x,y": the action that takes down the camp whose centre
 * square is (x, y), or why it is refused.
 */
export function decommissionChoice(state: GameState, x: number, y: number): SquareChoice {
  if (!isRunActive(state)) {
    return refused('The run has ended.');
  }
  const offMap = offMapRefusal(state, x, y);
  if (offMap !== null) {
    return refused(offMap);
  }
  if (campCentredAt(state, x, y) === null) {
    return refused(noCampRefusal(state, x, y));
  }
  const cost = ACTION_COSTS.decommissionCamp;
  if (cost > state.ap) {
    return refused(
      `Decommissioning a camp costs ${cost} AP and you have ${state.ap} left this shift.`,
    );
  }
  return allowed({ type: 'decommissionCamp', x, y, ap: cost });
}

/**
 * A tap on the square (x, y) of the phone map: cut its tree if it has one,
 * otherwise mine it (design doc 11: "a tap on a square mines it, or cuts its
 * tree"). The refusal is the one of the action the tap stood for.
 */
export function tapChoice(state: GameState, x: number, y: number): SquareChoice {
  if (isRunActive(state) && isSquare(state, x, y) && knownSquare(state, x, y).tree) {
    return cutChoice(state, x, y);
  }
  return mineChoice(state, x, y);
}

/** The words that name a square action, as they are typed. */
export const SQUARE_CHOICE_KINDS = [
  'mine',
  'cut',
  'support',
  'camp',
  'rest',
  'decommission',
] as const;

/** One of the words above. `(typeof X)[number]` is "any one element of the list X". */
export type SquareChoiceKind = (typeof SQUARE_CHOICE_KINDS)[number];

const SQUARE_CHOICE_PATTERN = new RegExp(
  `^(${SQUARE_CHOICE_KINDS.join('|')})(!?)[ -]*(\\d+) *, *(\\d+)$`,
);

/**
 * Read a typed choice as a square action: "mine 3,4", "cut 3,4",
 * "support 3,4", "camp 3,4", "rest 3,4" or "decommission 3,4" (a space or a
 * dash after the word, a comma between the numbers). "mine! 3,4" is a mine the player has confirmed: it is taken even
 * if it would make squares unstable. `null` if the text is not of that form;
 * then it is something else (a listed choice, or a mistake).
 */
export function parseSquareChoice(
  text: string,
): { kind: SquareChoiceKind; confirmed: boolean; x: number; y: number } | null {
  // The pattern: the word (with an optional "!" after "mine"), a space or
  // dash, digits, a comma, digits. The brackets capture the parts, which
  // come back in `match[1]` to `match[4]`.
  const match = SQUARE_CHOICE_PATTERN.exec(text.trim().toLowerCase());
  if (match === null) {
    return null;
  }
  const word = match[1];
  const confirmed = match[2] === '!';
  if (confirmed && word !== 'mine') {
    return null; // only a mine is ever confirmed
  }
  // `find` gives back the word as one of the kinds, or `undefined`.
  const kind = SQUARE_CHOICE_KINDS.find((known) => known === word);
  if (kind === undefined) {
    return null;
  }
  return { kind, confirmed, x: Number(match[3]), y: Number(match[4]) };
}
