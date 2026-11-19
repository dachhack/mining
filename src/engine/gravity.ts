// Gravity for loose items (0005 item 17). The miner has no gravity (owner,
// issue #80; decision note 0024): it never falls, so nothing here moves it.
// Blocks that fall (cave-ins) are the cube phase's (cube/caveIns.ts).

import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { addLooseItems, isOpen, removeLooseItems } from './state';
import type { GameState } from './state';

/** The cell directly below `pos`. Depth grows with z, so "down" is z + 1. */
function cellBelow(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z + 1 };
}

/**
 * How many blocks a loose item in the cell `pos` would fall: straight down
 * until the cell below it is solid (0005 item 17).
 */
function itemFallDistance(state: GameState, pos: Vec3): number {
  let current = pos;
  let distance = 0;
  while (isOpen(state, cellBelow(current))) {
    current = cellBelow(current);
    distance += 1;
  }
  return distance;
}

/**
 * Let every loose item with nothing solid under it fall. The dispatcher in
 * index.ts calls this after every action and after the cube phase.
 *
 * Contract:
 * - Changes `state` in place and appends to `events`.
 * - Each pile of loose items falls straight down until it rests on a solid
 *   block (0005 item 17), in storage order. Emits `itemFell`. A pile joins a
 *   pile of the same item already lying where it lands.
 * - The avatar never falls, whatever is under it (issue #80).
 * - Calling it on a state where nothing can fall changes nothing and emits
 *   nothing.
 */
export function settle(state: GameState, events: GameEvent[]): void {
  // `[...list]` is a copy of the list. The loop needs one because
  // `removeLooseItems` and `addLooseItems` replace `state.looseItems`.
  for (const pile of [...state.looseItems]) {
    const distance = itemFallDistance(state, pile.pos);
    if (distance === 0) {
      continue;
    }
    const from = { ...pile.pos };
    const to = { x: from.x, y: from.y, z: from.z + distance };
    const item = pile.item;
    const count = pile.count;
    removeLooseItems(state, from, item, count);
    addLooseItems(state, to, item, count);
    events.push({ type: 'itemFell', from, to, item, count });
  }
}
