// UI lab 1 (issue #116): the resource counter's entries, in a fixed order,
// each with the block whose texture is its icon. Pure: no DOM.
//
// Everything comes from src/data: which items blocks yield (`BLOCKS`), and
// their names (`ITEMS`). Nothing is written here by hand.

import { BLOCKS, ITEMS } from '../../data';
import type { BlockId, ItemId } from '../../data';

export interface ResourceEntry {
  item: string;
  name: string;
  count: number;
  /** The code of the first block (in the data's order) that yields this item: its icon. */
  iconBlock: number;
}

/** item id -> the code of the first block that yields it, in the order of `BLOCKS`. */
function iconBlocks(): Map<string, number> {
  const icons = new Map<string, number>();
  for (const id of Object.keys(BLOCKS) as BlockId[]) {
    for (const stack of BLOCKS[id].yields) {
      if (!icons.has(stack.item)) {
        icons.set(stack.item, BLOCKS[id].code);
      }
    }
  }
  return icons;
}

const ICONS = iconBlocks();

/** The display name of an item, or its id if the data has no such item. */
function itemName(item: string): string {
  // `item in ITEMS` checks the key exists; then `as ItemId` lets TypeScript index with it.
  return item in ITEMS ? ITEMS[item as ItemId].name : item;
}

/**
 * The counter's entries for `counts`: one per item collected, in the order
 * the blocks that yield them appear in the data (stone, coal, timber, ...).
 */
export function resourceEntries(counts: Map<string, number>): ResourceEntry[] {
  const entries: ResourceEntry[] = [];
  for (const [item, iconBlock] of ICONS) {
    const count = counts.get(item) ?? 0;
    if (count > 0) {
      entries.push({ item, name: itemName(item), count, iconBlock });
    }
  }
  return entries;
}
