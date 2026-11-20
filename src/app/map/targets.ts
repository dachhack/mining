// What a tap on the map does (issue #86).
//
// There is no miner and no menu: a tap on a square mines its top block, or
// cuts its tree if it has one (design doc 11). The text layer decides which
// (`tapChoice` in ../text/squares.ts, which the play tool's "mine x,y" and
// "cut x,y" use too) and words a refusal. This file adds what the map needs
// to show a refusal: which square was tapped, and, for the level rule, which
// neighbours are too high (design doc 4.2: "a tap on a square the rule
// forbids says which neighbours are too high").
//
// Everything is read through `knownSquare` and `mineCheck`, which look at
// nothing below a top block.

import { isRunActive, isSquare, knownSquare, mineCheck } from '../../engine';
import type { GameState } from '../../engine';
import { contentsNames, depthName, topBlockText } from '../text/describe';
import { campChoice, squareText, supportChoice, tapChoice } from '../text/squares';
import type { SquareEntry } from '../text/squares';

/** A square of the map. */
export interface MapSquare {
  x: number;
  y: number;
}

/**
 * What a tap on the map does (design doc 11: "other actions are chosen from a
 * tool bar and then aimed with a tap"):
 * - 'dig': mine the square, or cut its tree;
 * - 'support': place a support on the square (issue #94);
 * - 'camp': found a camp on the 3 x 3 patch round the square (issue #100).
 */
export type MapTool = 'dig' | 'support' | 'camp';

/**
 * What the map marks after a tap that was not taken: one the rules refused,
 * or a risky mine waiting for a second tap. Nothing is marked after a tap
 * that was taken.
 */
export interface MapMarks {
  /** The square that was tapped, or `null`. */
  selected: MapSquare | null;
  /** The neighbours that are too high for the level rule. */
  tooHigh: MapSquare[];
  /** The squares the mine would make unstable (design doc 11). */
  unstable: MapSquare[];
  /**
   * The squares of a 3 x 3 patch that stop a camp being founded there: the
   * ones with a tree, the ones off the level, and so on (issue #100).
   */
  blocked: MapSquare[];
}

/** No marks at all. */
export const NO_MARKS: MapMarks = { selected: null, tooHigh: [], unstable: [], blocked: [] };

/** What a tap on a square came to. */
export interface TapOutcome {
  /** The action to take, or `null` if the tap is refused or needs a second tap. */
  entry: SquareEntry | null;
  /** The lines to show the player when nothing is taken; empty when `entry` is set. */
  lines: string[];
  /** What to mark on the map when nothing is taken; `NO_MARKS` when `entry` is set. */
  marks: MapMarks;
  /**
   * True if the tap was a risky mine (it would make squares unstable): a
   * second tap on the same square takes it (design doc 11).
   */
  needsConfirm: boolean;
}

/**
 * One line about the square (x, y), as far as the player knows it:
 * "x12 y3, depth 2: Stone, gives 1 Stone" or "x4 y4, ground level: a tree";
 * with water on the square, "...; on it: 3 water".
 */
export function squareSummary(state: GameState, x: number, y: number): string {
  const square = knownSquare(state, x, y);
  const where = `${squareText(x, y)}, ${depthName(square.depth)}`;
  if (square.tree) {
    return `${where}: a tree`;
  }
  // What stands on the square (water, lava, gas), which the map draws too.
  const standing = contentsNames(square);
  const onIt = standing.length > 0 ? `; on it: ${standing.join(', ')}` : '';
  return `${where}: ${topBlockText(state, x, y)}${onIt}`;
}

/**
 * A tap on the square (x, y) with the tool `tool`: the action it stands for,
 * or why it is not taken and what to mark. Does not change `state`.
 *
 * `confirmed` is true for the second tap in a row on the same square. A mine
 * that would make squares unstable is taken only then; the first tap shows
 * the warning and marks those squares.
 */
export function tapOutcome(
  state: GameState,
  x: number,
  y: number,
  tool: MapTool = 'dig',
  confirmed = false,
): TapOutcome {
  let choice = tapChoice(state, x, y);
  if (tool === 'support') {
    choice = supportChoice(state, x, y);
  } else if (tool === 'camp') {
    choice = campChoice(state, x, y);
  }
  const risky = choice.entry !== null && choice.warning !== null;
  if (choice.entry !== null && (!risky || confirmed)) {
    return { entry: choice.entry, lines: [], marks: NO_MARKS, needsConfirm: false };
  }
  if (choice.entry !== null && choice.warning !== null) {
    // A risky mine, tapped once: warn, mark, and wait for the second tap.
    return {
      entry: null,
      lines: [
        `${squareSummary(state, x, y)}.`,
        choice.warning,
        'Tap the square again to mine it all the same.',
      ],
      marks: {
        selected: { x, y },
        tooHigh: [],
        unstable: choice.makesUnstable.map((square) => ({ x: square.x, y: square.y })),
        blocked: [],
      },
      needsConfirm: true,
    };
  }
  const refusal = choice.refusal ?? 'That cannot be done.';
  if (!isRunActive(state) || !isSquare(state, x, y)) {
    return { entry: null, lines: [refusal], marks: NO_MARKS, needsConfirm: false };
  }
  // The neighbours the level rule names. A tap on a tree is a cut, and a
  // support is not a mine: the level rule refuses neither, so nothing is
  // marked for them.
  const tooHigh: MapSquare[] = [];
  if (tool === 'dig' && !knownSquare(state, x, y).tree) {
    for (const neighbour of mineCheck(state, x, y).higherNeighbours) {
      tooHigh.push({ x: neighbour.x, y: neighbour.y });
    }
  }
  return {
    entry: null,
    lines: [`${squareSummary(state, x, y)}.`, refusal],
    marks: {
      selected: { x, y },
      tooHigh,
      unstable: [],
      // For a refused camp: the squares of the patch that are in the way.
      blocked: choice.blockedSquares.map((square) => ({ x: square.x, y: square.y })),
    },
    needsConfirm: false,
  };
}
