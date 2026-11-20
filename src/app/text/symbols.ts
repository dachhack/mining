// The characters the map is drawn with. A square of the map is two
// characters: what is on top of it, then how deep it is (see view.ts).
//
// They are in a file of their own because two files need them: view.ts draws
// the map, and describe.ts names the characters in the line that says mineral
// traces were noticed.

import { BLOCKS } from '../../data';
import type { BlockId } from '../../data';

// First character of a square, for everything that is not a known block.
/** A block the map has no character for (a block added to the data without one). */
export const SYMBOL_UNKNOWN = '?';
/** A tree. The second character then says what is known of the ground under it. */
export const SYMBOL_TREE = 'Y';
/** A square with no block left: the bedrock floor of the cube. */
export const SYMBOL_FLOOR = 'X';
/** Water stands on the square (design doc 6.3). A note under the map names the block under it. */
export const SYMBOL_WATER = '~';
/** Lava stands on the square (design doc 6.4): it cannot be mined. */
export const SYMBOL_LAVA = '!';
/** A square with gas standing on it (design doc 6.5). */
export const SYMBOL_GAS = '*';
/** A camp square (design doc 8). The camp hides the block it stands on, which cannot be mined. */
export const SYMBOL_CAMP = 'A';
/** Traced rock of a kind that has no character of its own in `TRACED_SYMBOLS`. */
export const SYMBOL_TRACES = '%';

// Second character of a square at ground level (depth 0), where there is no
// depth to show.
/** Open ground at depth 0: meadow, dirt path or stone outcrop. */
export const MARK_GROUND = ' ';
/** A stump at depth 0: a tree grows back on it. */
export const MARK_STUMP = ',';
/** Under a tree: the ground has never been seen. Blank, like ground level: nothing more is known. */
export const MARK_UNSEEN = ' ';

/**
 * The second character of a dug square: its depth as one character. 1 to 9
 * are the digits; 10 and deeper go on through the alphabet (a = 10, b = 11,
 * ... w = 32), so that every square stays two characters wide.
 */
export function depthMark(depth: number): string {
  // `toString(36)` writes a number with the digits 0-9 and then a-z.
  return depth.toString(36);
}

// One character for each block that can be stored in the cube: the same
// characters as tools/ascii.ts and the test helper.
const BLOCK_SYMBOLS: Partial<Record<BlockId, string>> = {
  dirt: 'd',
  stone: '#',
  hardRock: 'H',
  coalSeam: 'c',
  timberRoot: 't',
  ironOre: 'i',
  copperOre: 'u',
  crystal: 'x',
  unstableOre: 'U',
  relic: 'r',
  keystone: 'k',
  // Left by a roof that fell in (and, later, by slumps): cheap, gives nothing.
  rubble: ':',
  sealed: '=',
};

// Rock the player has seen mineral traces on (decision note 0012) has a
// character of its own for each kind of rock, so the map shows both facts:
// which rock it is (and so what it costs to mine) and that it carries traces
// (issue #47, playtest finding m1-r2 10). The rule of thumb for a reader: a
// letter is drawn in its other case (d -> D, H -> h), and stone's # becomes %.
const TRACED_SYMBOLS: Partial<Record<BlockId, string>> = {
  dirt: 'D',
  stone: '%',
  hardRock: 'h',
};

/** Block code (the number stored in the cube) -> map character. */
const SYMBOL_BY_CODE = new Map<number, string>();
for (const [blockId, symbol] of Object.entries(BLOCK_SYMBOLS)) {
  // `Object.entries` gives the keys back as plain strings; `as BlockId` tells
  // the compiler they are the block ids written just above.
  SYMBOL_BY_CODE.set(BLOCKS[blockId as BlockId].code, symbol);
}

/** Block code -> the character for that rock when it carries traces. */
const TRACED_SYMBOL_BY_CODE = new Map<number, string>();
for (const [blockId, symbol] of Object.entries(TRACED_SYMBOLS)) {
  TRACED_SYMBOL_BY_CODE.set(BLOCKS[blockId as BlockId].code, symbol);
}

/**
 * The map character of a solid block. Every solid block the cube can store
 * has one; `?` is only there for a block added to the data without one.
 */
export function blockSymbol(code: number): string {
  return SYMBOL_BY_CODE.get(code) ?? SYMBOL_UNKNOWN;
}

/**
 * The map character of a block the player has seen mineral traces on, or
 * `null` if that kind of rock has none of its own (the map then falls back
 * to `SYMBOL_TRACES` and the legend says only "rock").
 */
export function tracedSymbol(code: number): string | null {
  return TRACED_SYMBOL_BY_CODE.get(code) ?? null;
}

/** "D, % or h": the traced-rock characters, for sentences that point at the map. */
export function tracedSymbolsText(): string {
  const symbols = Object.values(TRACED_SYMBOLS);
  if (symbols.length <= 1) {
    return symbols.join('');
  }
  return `${symbols.slice(0, -1).join(', ')} or ${symbols[symbols.length - 1] ?? ''}`;
}
