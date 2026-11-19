// The characters the map is drawn with. One character per cell.
//
// They are in a file of their own because two files need them: view.ts draws
// the map, and describe.ts names the characters in the line that says mineral
// traces were noticed.

import { BLOCKS } from '../../data';
import type { BlockId } from '../../data';

// Map characters for everything that is not a block.
export const SYMBOL_AVATAR = '@';
export const SYMBOL_UNKNOWN = '?';
export const SYMBOL_OPEN = '.';
export const SYMBOL_EDGE = 'X';
export const SYMBOL_ITEMS = '*';
export const SYMBOL_TORCH = '!';
export const SYMBOL_SUPPORT = 'T';
// The surface forest (issue #70): one character for each kind of surface cell.
export const SYMBOL_TREE = 'Y';
export const SYMBOL_STUMP = ',';
export const SYMBOL_PATH = ':';
export const SYMBOL_MEADOW = '"';
export const SYMBOL_OUTCROP = '^';
/** Traced rock of a kind that has no character of its own in `TRACED_SYMBOLS`. */
export const SYMBOL_TRACES = '%';

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
