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
import type { CutTreeAction, GameState, MineAction } from '../../engine';
import { depthName, topBlockText } from '../text/describe';
import { squareText, tapChoice } from '../text/squares';

/** A square of the map. */
export interface MapSquare {
  x: number;
  y: number;
}

/** What the map marks after a tap that was refused. Nothing is marked after one that was taken. */
export interface MapMarks {
  /** The square that was tapped, or `null`. */
  selected: MapSquare | null;
  /** The neighbours that are too high for the level rule. */
  tooHigh: MapSquare[];
}

/** No marks at all. */
export const NO_MARKS: MapMarks = { selected: null, tooHigh: [] };

/** What a tap on a square came to. */
export interface TapOutcome {
  /** The action to take, or `null` if the tap is refused. */
  entry: MineAction | CutTreeAction | null;
  /** The lines to show the player for a refused tap; empty when `entry` is set. */
  lines: string[];
  /** What to mark on the map for a refused tap; `NO_MARKS` when `entry` is set. */
  marks: MapMarks;
}

/**
 * One line about the square (x, y), as far as the player knows it:
 * "x12 y3, depth 2: Stone, gives 1 Stone" or "x4 y4, ground level: a tree".
 */
export function squareSummary(state: GameState, x: number, y: number): string {
  const square = knownSquare(state, x, y);
  const where = `${squareText(x, y)}, ${depthName(square.depth)}`;
  if (square.tree) {
    return `${where}: a tree`;
  }
  return `${where}: ${topBlockText(state, x, y)}`;
}

/**
 * A tap on the square (x, y): the action it stands for, or why it is refused
 * and what to mark. Does not change `state`.
 */
export function tapOutcome(state: GameState, x: number, y: number): TapOutcome {
  const choice = tapChoice(state, x, y);
  if (choice.entry !== null) {
    return { entry: choice.entry, lines: [], marks: NO_MARKS };
  }
  const refusal = choice.refusal ?? 'That cannot be done.';
  if (!isRunActive(state) || !isSquare(state, x, y)) {
    return { entry: null, lines: [refusal], marks: NO_MARKS };
  }
  // The neighbours the level rule names. A tap on a tree is a cut, which the
  // level rule never refuses, so nothing is marked for it.
  const tooHigh: MapSquare[] = [];
  if (!knownSquare(state, x, y).tree) {
    for (const neighbour of mineCheck(state, x, y).higherNeighbours) {
      tooHigh.push({ x: neighbour.x, y: neighbour.y });
    }
  }
  return {
    entry: null,
    lines: [`${squareSummary(state, x, y)}.`, refusal],
    marks: { selected: { x, y }, tooHigh },
  };
}
