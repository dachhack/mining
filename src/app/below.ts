// What the player knows of the cells under a square's top block, in words
// and as marks (design doc 7.2; owner question 93; issue #104).
//
// "The map shows a mark on a scanned square for what lies beneath (ore, a
// pocket, a cavern), and the square's known blocks are listed when the
// player holds it." The play tool and the phone map both come here, so that
// they say the same thing.
//
// Everything is read from `KnownSquare.below`, which holds revealed cells
// only (the engine's `knownSquare`). Nothing here reads the state.

import { BLOCKS, blockDefByCode, itemDef } from '../data';
import type { KnownBelow, KnownSquare } from '../engine';

/** What the map marks on a square for what is known to lie under its top. */
export interface BelowMarks {
  /** At least one cell under the top is known. */
  any: boolean;
  /** A known block under the top gives something other than stone (coal, ore, crystal, a relic, ...). */
  ore: boolean;
  /** A known open cell under the top holds water, lava or gas: a pocket. */
  pocket: boolean;
  /** A known open cell under the top is empty: a cavern. */
  cavern: boolean;
}

/** True if the cell is open space (no block). */
function isOpenCell(cell: KnownBelow): boolean {
  return cell.cell.block === BLOCKS.air.code;
}

/** True if mining the block would give something other than plain stone. */
function givesOre(cell: KnownBelow): boolean {
  if (isOpenCell(cell)) {
    return false;
  }
  return blockDefByCode(cell.cell.block).yields.some((stack) => stack.item !== 'stone');
}

/** The marks for one square (see `BelowMarks`). All false where nothing under the top is known. */
export function belowMarksOf(square: KnownSquare): BelowMarks {
  const marks: BelowMarks = {
    any: square.below.length > 0,
    ore: false,
    pocket: false,
    cavern: false,
  };
  for (const cell of square.below) {
    if (givesOre(cell)) {
      marks.ore = true;
    } else if (isOpenCell(cell)) {
      const holds = cell.cell.water + cell.cell.lava + cell.cell.gas;
      if (holds > 0) {
        marks.pocket = true;
      } else {
        marks.cavern = true;
      }
    }
  }
  return marks;
}

/** "ore, a pocket": the marks in words, or "plain rock" when there is none. */
export function belowMarksText(marks: BelowMarks): string {
  const names: string[] = [];
  if (marks.ore) names.push('ore');
  if (marks.pocket) names.push('a pocket');
  if (marks.cavern) names.push('a cavern');
  return names.length === 0 ? 'plain rock' : names.join(', ');
}

/**
 * One known cell under a top, in words: "Iron ore (gives 1 Raw iron ore)",
 * "Stone, damp", "open space: 1 water (a pocket)", "open space (a cavern)".
 */
export function belowCellText(cell: KnownBelow): string {
  if (isOpenCell(cell)) {
    const holds: string[] = [];
    if (cell.cell.water > 0) holds.push(`${cell.cell.water} water`);
    if (cell.cell.lava > 0) holds.push(`${cell.cell.lava} lava`);
    if (cell.cell.gas > 0) holds.push(`${cell.cell.gas} gas`);
    return holds.length === 0
      ? 'open space (a cavern)'
      : `open space: ${holds.join(', ')} (a pocket)`;
  }
  const block = blockDefByCode(cell.cell.block);
  const shown: string[] = [];
  if (cell.traces) shown.push('mineral traces');
  if (cell.tells.dampStone) shown.push('damp');
  if (cell.tells.pittedRock) shown.push('pitted');
  if (cell.tells.warmGlow) shown.push('warm glow');
  if (cell.tells.hairlineGlow) shown.push('hairline glow');
  const tells = shown.map((name) => `, ${name}`).join('');
  const gives = block.yields.filter((stack) => stack.item !== 'stone');
  const yields =
    gives.length === 0
      ? ''
      : ` (gives ${gives.map((stack) => `${stack.count} ${itemDef(stack.item).name}`).join(', ')})`;
  return `${block.name}${tells}${yields}`;
}

/**
 * The known cells under a square's top, one line each, from the highest
 * down: "depth 4: Iron ore (gives 1 Raw iron ore)". A cell's depth is its
 * layer: the square is that deep once the cell is its top. Empty where
 * nothing under the top is known.
 */
export function belowLines(square: KnownSquare): string[] {
  return square.below.map((cell) => `depth ${cell.z}: ${belowCellText(cell)}`);
}
