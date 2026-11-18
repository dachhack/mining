// Gravity: footing, falling, fall damage, and loose items dropping
// (design doc 5.2; decision note 0005 items 5, 7, 9 and 17).

import { AVATAR, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import type { GameEvent } from './events';
import { addLooseItems, endRun, isOpen, isSolid, removeLooseItems, structureAt } from './state';
import type { GameState } from './state';

/** The cell directly below `pos`. Depth grows with z, so "down" is z + 1. */
export function cellBelow(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y, z: pos.z + 1 };
}

/** True if the cell `pos` holds a ladder. */
export function hasLadder(state: GameState, pos: Vec3): boolean {
  return structureAt(state, pos) === STRUCTURES.ladder.code;
}

/**
 * True if an avatar in the cell `pos` would be held up (0005 item 5): by a
 * solid block below it, or by a ladder in the cell itself. The surface has no
 * footing of its own: there the avatar stands on the `z = 0` blocks.
 */
export function hasFooting(state: GameState, pos: Vec3): boolean {
  return isSolid(state, cellBelow(pos)) || hasLadder(state, pos);
}

/**
 * How many blocks an avatar in the cell `pos` would fall before it has
 * footing; 0 if it has footing where it is. A ladder on the way down catches
 * the avatar, because a ladder in its own cell is footing.
 *
 * The loop always ends: everything below the bottom of the cube is bedrock.
 */
export function avatarFallDistance(state: GameState, pos: Vec3): number {
  let current = pos;
  let distance = 0;
  while (!hasFooting(state, current)) {
    current = cellBelow(current);
    distance += 1;
  }
  return distance;
}

/**
 * How many blocks a loose item in the cell `pos` would fall: straight down
 * until the cell below it is solid (0005 item 17). Ladders do not hold items.
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
 * The health a fall of `distance` blocks takes from an avatar with `health`
 * (design doc 5.2, numbers in `AVATAR`): nothing for a short fall, a fixed
 * amount for each block beyond the free ones, and all of it for a fatal fall.
 * Never more than the avatar has.
 */
function fallDamage(distance: number, health: number): number {
  if (distance >= AVATAR.fatalFallBlocks) {
    return health;
  }
  if (distance <= AVATAR.freeFallBlocks) {
    return 0;
  }
  const damage = (distance - AVATAR.freeFallBlocks) * AVATAR.fallDamagePerBlock;
  return Math.min(damage, health);
}

/** Let the avatar fall if it has no footing, and apply the damage. */
function settleAvatar(state: GameState, events: GameEvent[]): void {
  const from = state.avatar.pos;
  const distance = avatarFallDistance(state, from);
  if (distance === 0) {
    return;
  }
  const to = { x: from.x, y: from.y, z: from.z + distance };
  state.avatar.pos = to;
  events.push({ type: 'fell', from: { ...from }, to: { ...to }, distance });

  const damage = fallDamage(distance, state.avatar.health);
  if (damage > 0) {
    state.avatar.health -= damage;
    events.push({
      type: 'damageTaken',
      amount: damage,
      cause: 'fall',
      health: state.avatar.health,
    });
  }
  if (distance >= AVATAR.fatalFallBlocks || state.avatar.health <= 0) {
    endRun(state, 'death', 'fell', events);
  }
}

/** Let every loose item with nothing solid under it fall. */
function settleLooseItems(state: GameState, events: GameEvent[]): void {
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

/**
 * Let everything that has nothing under it fall. The dispatcher in index.ts
 * calls this after every action and after the cube phase.
 *
 * Contract:
 * - Changes `state` in place and appends to `events`.
 * - The avatar: if it has no footing (0005 item 5: a solid block below it, or
 *   a ladder in its own cell), it falls until it has. Emits `fell`, and for a
 *   fall long enough to hurt (design doc 5.2, numbers in `AVATAR`) emits
 *   `damageTaken`. A fatal fall, or health reaching 0, ends the run with
 *   `endRun(state, 'death', 'fell', events)`. A fatal fall takes all the
 *   health that is left, so a dead avatar has 0 health.
 * - Loose items: each falls straight down until it rests on a solid block
 *   (0005 item 17). Emits `itemFell`. A pile joins a pile of the same item
 *   already lying where it lands.
 * - The avatar falls first, then the loose items, top layer first.
 * - Calling it on a state where nothing can fall changes nothing and emits
 *   nothing.
 * - No block falls in M1 (0005 item 9).
 */
export function settle(state: GameState, events: GameEvent[]): void {
  settleAvatar(state, events);
  settleLooseItems(state, events);
}
