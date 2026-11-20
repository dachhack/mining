// Acting on a square of the map: "mine x,y", "cut x,y" and "support x,y"
// (issues #86 and #94).
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

import { ACTION_COSTS, SURFACE, blockDefByCode } from '../../data';
import {
  isRunActive,
  isSquare,
  knownSquare,
  mineCheck,
  supportCheck,
  unstableAfterMine,
} from '../../engine';
import type {
  CutTreeAction,
  GameState,
  MineAction,
  PlaceSupportAction,
  UnstableSquare,
} from '../../engine';

/** What a typed choice or a tap on a square came to. */
export interface SquareChoice {
  /** The action to take, or `null` if it is refused. */
  entry: MineAction | CutTreeAction | PlaceSupportAction | null;
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
}

function allowed(entry: MineAction | CutTreeAction | PlaceSupportAction): SquareChoice {
  return { entry, refusal: null, makesUnstable: [], warning: null };
}

function refused(refusal: string): SquareChoice {
  return { entry: null, refusal, makesUnstable: [], warning: null };
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

/**
 * Read a typed choice as a square action: "mine 3,4", "cut 3,4" or
 * "support 3,4" (a space or a dash after the word, a comma between the
 * numbers). "mine! 3,4" is a mine the player has confirmed: it is taken even
 * if it would make squares unstable. `null` if the text is not of that form;
 * then it is something else (a listed choice, or a mistake).
 */
export function parseSquareChoice(
  text: string,
): { kind: 'mine' | 'cut' | 'support'; confirmed: boolean; x: number; y: number } | null {
  // The pattern: the word (with an optional "!" after "mine"), a space or
  // dash, digits, a comma, digits. The brackets capture the parts, which
  // come back in `match[1]` to `match[4]`.
  const match = /^(mine|cut|support)(!?)[ -]*(\d+) *, *(\d+)$/.exec(text.trim().toLowerCase());
  if (match === null) {
    return null;
  }
  const word = match[1];
  const confirmed = match[2] === '!';
  if (confirmed && word !== 'mine') {
    return null; // only a mine is ever confirmed
  }
  const kind = word === 'cut' ? 'cut' : word === 'support' ? 'support' : 'mine';
  return { kind, confirmed, x: Number(match[3]), y: Number(match[4]) };
}
