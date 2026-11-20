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
// The camp-made tools (issue #104) are aimed the same way: with the pump,
// seal or scan tool on, a tap uses that tool on the square. A pump and a scan
// use up something scarce and reach beyond the square, so their first tap
// only shows the range (the squares the pump would drain, the squares the
// scan would look under) and the second tap takes it. With the look tool on,
// or when the player holds a square, the square's known blocks are listed
// (design doc 7.2: "listed when the player holds it").
//
// Everything is read through `knownSquare` and `mineCheck`, which look at
// nothing the player has not been shown.

import { HAZARDS, STRUCTURES } from '../../data';
import {
  blastSquares,
  isRunActive,
  isSquare,
  knownSquare,
  mineCheck,
  scanSquares,
  squaresWithinSteps,
} from '../../engine';
import type { GameState } from '../../engine';
import { belowLines } from '../below';
import { contentsNames, depthName, topBlockText } from '../text/describe';
import {
  PUMP_REACH,
  PUMP_UNITS,
  SCAN_DEPTH,
  campChoice,
  explosiveChoice,
  pumpChoice,
  scanChoice,
  sealChoice,
  squareText,
  supportChoice,
  tapChoice,
} from '../text/squares';
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
 * - 'camp': found a camp on the 3 x 3 patch round the square (issue #100);
 * - 'explosive': place an explosive on the square (issue #103). The first
 *   tap shows the blast; a second tap on the same square places it;
 * - 'pump': place a pump on the square (issue #104);
 * - 'seal': use sealant on the square;
 * - 'scan': aim a scan at the square;
 * - 'look': change nothing; list what is known of the square.
 */
export type MapTool = 'dig' | 'support' | 'camp' | 'explosive' | 'pump' | 'seal' | 'scan' | 'look';

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
   * ones with a tree, the ones off the level, and so on (issue #100). For a
   * refused seal: the deeper squares beside it.
   */
  blocked: MapSquare[];
  /**
   * The squares of a blast the tap would cause (design doc 6.6): of the
   * explosive about to be placed, or of unstable ore the mine would arm.
   */
  blast: MapSquare[];
  /**
   * A range (issue #104): the squares a pump on the selected square reaches,
   * or the squares a scan aimed at it looks under.
   */
  range: MapSquare[];
}

/** No marks at all. */
export const NO_MARKS: MapMarks = {
  selected: null,
  tooHigh: [],
  unstable: [],
  blocked: [],
  blast: [],
  range: [],
};

/** The squares a pump on the square (x, y) reaches: within `PUMP_REACH` steps, itself included. */
export function pumpRange(state: GameState, x: number, y: number): MapSquare[] {
  return squaresWithinSteps(state.size.x, state.size.y, x, y, HAZARDS.water.pumpReach).map(
    (square) => ({ x: square.x, y: square.y }),
  );
}

/**
 * Holding a square, or tapping it with the look tool: what the player knows
 * of it, as lines, and what to mark. Nothing is done. The lines are the
 * square's summary, then the blocks known under its top (design doc 7.2); on
 * a square with a pump, the pump's range is marked.
 */
export function lookOutcome(state: GameState, x: number, y: number): TapOutcome {
  if (!isSquare(state, x, y)) {
    return { entry: null, lines: [], marks: NO_MARKS, needsConfirm: false };
  }
  const square = knownSquare(state, x, y);
  const lines = [`${squareSummary(state, x, y)}.`];
  let range: MapSquare[] = [];
  if (square.top !== null && square.top.structure === STRUCTURES.pump.code) {
    lines.push(
      `A pump stands here: each shift it takes up to ${PUMP_UNITS} water from the marked squares ` +
        `(within ${PUMP_REACH} steps).`,
    );
    range = pumpRange(state, x, y);
  }
  const below = belowLines(square);
  if (below.length === 0) {
    lines.push('Nothing is known under the top block: only a scan shows what is below.');
  } else {
    lines.push('Known under the top block:', ...below);
  }
  return {
    entry: null,
    lines,
    marks: { ...NO_MARKS, selected: { x, y }, range },
    needsConfirm: false,
  };
}

/** What a tap on a square came to. */
export interface TapOutcome {
  /** The action to take, or `null` if the tap is refused or needs a second tap. */
  entry: SquareEntry | null;
  /** The lines to show the player when nothing is taken; empty when `entry` is set. */
  lines: string[];
  /** What to mark on the map when nothing is taken; `NO_MARKS` when `entry` is set. */
  marks: MapMarks;
  /**
   * True if the tap was a risky mine (it would make squares unstable, or arm
   * unstable ore) or the first tap of an explosive: a second tap on the same
   * square takes it (design doc 11).
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
 * A tap with the explosive tool (design doc 4.1 and 6.6). The first tap on a
 * square places nothing: it marks the squares of the blast and says what the
 * charge will do. A second tap on the same square (`confirmed`) places it.
 * Only what the player sees is read.
 */
function explosiveTap(state: GameState, x: number, y: number, confirmed: boolean): TapOutcome {
  // Whether it may be placed, and the sentence if not, are the play tool's
  // (`explosiveChoice` in ../text/squares.ts), so both views say the same.
  const choice = explosiveChoice(state, x, y);
  if (choice.entry === null) {
    const refusal = choice.refusal ?? 'An explosive cannot be placed there.';
    if (!isRunActive(state) || !isSquare(state, x, y)) {
      return { entry: null, lines: [refusal], marks: NO_MARKS, needsConfirm: false };
    }
    return {
      entry: null,
      lines: [`${squareSummary(state, x, y)}.`, refusal],
      marks: { ...NO_MARKS, selected: { x, y } },
      needsConfirm: false,
    };
  }
  if (confirmed) {
    return { entry: choice.entry, lines: [], marks: NO_MARKS, needsConfirm: false };
  }
  const blast = blastSquares(state, x, y).map((square) => ({ x: square.x, y: square.y }));
  return {
    entry: null,
    lines: [
      `${squareSummary(state, x, y)}.`,
      `An explosive here goes off when this shift ends and destroys the top block of the ${blast.length} marked squares, with no yield. ` +
        'It hurts the crew only if the blast includes a square you worked this shift.',
      'Tap the square again to place it.',
    ],
    marks: { ...NO_MARKS, selected: { x, y }, blast },
    needsConfirm: true,
  };
}

/**
 * A tap on the square (x, y) with the tool `tool`: the action it stands for,
 * or why it is not taken and what to mark. Does not change `state`.
 *
 * `confirmed` is true for the second tap in a row on the same square. A mine
 * or a seal that would make squares unstable, or a mine that would arm
 * unstable ore, is taken only then; the first tap shows the warning and marks
 * those squares and the blast. A pump, a scan and an explosive are also taken
 * only at the second tap: the first marks their range or blast.
 */
export function tapOutcome(
  state: GameState,
  x: number,
  y: number,
  tool: MapTool = 'dig',
  confirmed = false,
): TapOutcome {
  if (tool === 'explosive') {
    return explosiveTap(state, x, y, confirmed);
  }
  let choice = tapChoice(state, x, y);
  if (tool === 'support') {
    choice = supportChoice(state, x, y);
  } else if (tool === 'camp') {
    choice = campChoice(state, x, y);
  } else if (tool === 'pump') {
    choice = pumpChoice(state, x, y);
  } else if (tool === 'seal') {
    choice = sealChoice(state, x, y);
  } else if (tool === 'scan') {
    choice = scanChoice(state, x, y);
  } else if (tool === 'look') {
    return lookOutcome(state, x, y);
  }
  // A pump or a scan that is allowed, tapped once: show its range and wait.
  if (choice.entry !== null && !confirmed && (tool === 'pump' || tool === 'scan')) {
    const range =
      tool === 'pump'
        ? pumpRange(state, x, y)
        : scanSquares(state, x, y).map((square) => ({ x: square.x, y: square.y }));
    const what =
      tool === 'pump'
        ? `A pump here takes up to ${PUMP_UNITS} water a shift from the ${range.length} marked squares ` +
          `(within ${PUMP_REACH} steps). Tap the square again to place it.`
        : `A scan here shows the ${SCAN_DEPTH} blocks under the top block of each of the ` +
          `${range.length} marked squares. Tap the square again to scan.`;
    return {
      entry: null,
      lines: [`${squareSummary(state, x, y)}.`, what],
      marks: { ...NO_MARKS, selected: { x, y }, range },
      needsConfirm: true,
    };
  }
  const risky = choice.entry !== null && choice.warning !== null;
  if (choice.entry !== null && (!risky || confirmed)) {
    return { entry: choice.entry, lines: [], marks: NO_MARKS, needsConfirm: false };
  }
  if (choice.entry !== null && choice.warning !== null) {
    // A risky mine, tapped once: warn, mark, and wait for the second tap.
    // The marks: the squares it would make unstable, and the blast of each
    // unstable ore block it would arm (design doc 6.6), each square once.
    const blast: MapSquare[] = [];
    for (const ore of choice.armsOre) {
      for (const square of blastSquares(state, ore.x, ore.y)) {
        if (!blast.some((seen) => seen.x === square.x && seen.y === square.y)) {
          blast.push({ x: square.x, y: square.y });
        }
      }
    }
    return {
      entry: null,
      lines: [
        `${squareSummary(state, x, y)}.`,
        choice.warning,
        tool === 'seal'
          ? 'Tap the square again to seal it all the same.'
          : 'Tap the square again to mine it all the same.',
      ],
      marks: {
        selected: { x, y },
        tooHigh: [],
        unstable: choice.makesUnstable.map((square) => ({ x: square.x, y: square.y })),
        blocked: [],
        blast,
        range: [],
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
      blast: [],
      range: [],
    },
    needsConfirm: false,
  };
}
