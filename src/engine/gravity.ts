// Gravity: footing, falling, fall damage, and loose items dropping
// (design doc 5.2; decision notes 0005 items 5, 7, 9 and 17, and 0010).

import { AVATAR } from '../data';
import type { Vec3 } from '../data';
import type { FallKind, GameEvent } from './events';
import { avatarFallDistance, cellBelow } from './footing';
import { addLooseItems, endRun, isOpen, isRunActive, removeLooseItems } from './state';
import type { GameState } from './state';

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
 * The health a fall of `distance` blocks costs, before the cap of "never more
 * than the avatar has" (design doc 5.2 and decision note 0010; the numbers
 * are in `AVATAR`). It is exported so that the play tool can tell the player
 * the cost of mining the block underfoot with the same arithmetic.
 *
 * - Each block beyond the first `freeFallBlocks` costs `fallDamagePerBlock`,
 *   whatever the kind of fall.
 * - The first `freeFallBlocks` blocks are free in a chosen drop, and cost
 *   `uncontrolledFallDamagePerBlock` each in an uncontrolled fall.
 *
 * With today's numbers: a chosen drop of 1 or 2 costs 0; an uncontrolled
 * fall of 1, 2, 3, 4, 5 blocks costs 1, 2, 4, 6, 8.
 *
 * A fall of `fatalFallBlocks` or more kills whatever this returns; see
 * `isFatalFall`.
 */
export function fallDamage(kind: FallKind, distance: number): number {
  const earlyBlocks = Math.min(distance, AVATAR.freeFallBlocks);
  const laterBlocks = distance - earlyBlocks;
  const earlyCost = kind === 'uncontrolled' ? AVATAR.uncontrolledFallDamagePerBlock : 0;
  return earlyBlocks * earlyCost + laterBlocks * AVATAR.fallDamagePerBlock;
}

/** True if a fall of `distance` blocks kills whatever the avatar's health. */
export function isFatalFall(distance: number): boolean {
  return distance >= AVATAR.fatalFallBlocks;
}

/** Let the avatar fall if it has no footing, and apply the damage. */
function settleAvatar(state: GameState, events: GameEvent[], fallKind: FallKind): void {
  // An avatar whose run has ended stays where it is. This matters when the
  // cube phase kills it and takes its floor in the same shift: it was
  // crushed (say), and no `fell` follows the `runEnded` (0014 item 2).
  if (!isRunActive(state)) {
    return;
  }
  const from = state.avatar.pos;
  const distance = avatarFallDistance(state, from);
  if (distance === 0) {
    return;
  }
  const to = { x: from.x, y: from.y, z: from.z + distance };
  state.avatar.pos = to;
  events.push({ type: 'fell', from: { ...from }, to: { ...to }, distance, kind: fallKind });

  // A fatal fall takes all the health that is left; no other fall can take
  // more than that.
  const health = state.avatar.health;
  const damage = isFatalFall(distance) ? health : Math.min(fallDamage(fallKind, distance), health);
  if (damage > 0) {
    state.avatar.health -= damage;
    events.push({
      type: 'damageTaken',
      amount: damage,
      cause: 'fall',
      health: state.avatar.health,
    });
  }
  if (isFatalFall(distance) || state.avatar.health <= 0) {
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
 * `fallKind` is the dispatcher telling gravity why the avatar would be
 * falling, which gravity cannot see from the state alone: `'chosenDrop'`
 * after a move (the player walked off a ledge or climbed off the bottom of a
 * ladder), `'uncontrolled'` after anything else (decision note 0010). It only
 * matters when the avatar does fall.
 *
 * Contract:
 * - Changes `state` in place and appends to `events`.
 * - The avatar: nothing happens to it if the run has already ended. Otherwise,
 *   if it has no footing (0005 item 5: a solid block below it, or
 *   a ladder in its own cell), it falls until it has. Emits `fell`, and for a
 *   fall that hurts (`fallDamage` above: design doc 5.2, numbers in `AVATAR`)
 *   emits `damageTaken`. A fatal fall, or health reaching 0, ends the run with
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
export function settle(state: GameState, events: GameEvent[], fallKind: FallKind): void {
  settleAvatar(state, events, fallKind);
  settleLooseItems(state, events);
}
