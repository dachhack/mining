// Animal pens (docs/plans/progression-phases.md, section 6.3; PR 4).
//
// - A pen is built at a camp of FRONTIER_PEN.minLevel or more, from its
//   panel, for FRONTIER_PEN.cost and
//   1 tap. One per camp; it is lost with the camp, and its animals go to
//   the store (camps.ts).
// - An animal is put in from the store, or taken out to it, 1 tap each.
//   Upkeep eats only the store's animals, so a penned animal is safe.
// - Breeding, at End shift (`breedPens`, called from shift.ts): a pen with
//   at least 2 animals and room for one more counts down
//   FRONTIER_PEN.breedEveryShifts shifts; then it gains an animal and the
//   store gives up FRONTIER_PEN.hayPerBirth hay. Without that hay it waits,
//   and tries again each End shift. A pen that may not breed holds no count.
//
// Each action costs 1 tap; shift.ts charges it. The numbers are in
// src/data/frontier.ts.

import { FRONTIER_PEN } from '../../data/frontier';
import { canAfford, pay } from './camps';
import { gained } from './surface';
import type { FrontierCamp, FrontierState } from './state';

/**
 * Why a pen action cannot be done at camp `id`, or `null` if it can:
 * - 'missing': there is no such camp;
 * - 'campLevel': building, at a camp below FRONTIER_PEN.minLevel;
 * - 'hasPen': building, and the camp has a pen already;
 * - 'noPen': putting in or taking out, and the camp has no pen;
 * - 'cost': building without the cost, or putting in with no animal in the store;
 * - 'full': putting in, and the pen holds FRONTIER_PEN.capacity animals;
 * - 'empty': taking out, and the pen holds none.
 */
export type PenRefusal = 'missing' | 'campLevel' | 'hasPen' | 'noPen' | 'cost' | 'full' | 'empty';

/** What can be done with a pen. */
export type PenAction = 'buildPen' | 'penIn' | 'penOut';

export function penRefusal(state: FrontierState, action: PenAction, id: number): PenRefusal | null {
  const camp = state.camps.find((c) => c.id === id);
  if (camp === undefined) return 'missing';
  if (action === 'buildPen') {
    if (camp.level < FRONTIER_PEN.minLevel) return 'campLevel';
    if (camp.pen) return 'hasPen';
    return canAfford(state.inventory, FRONTIER_PEN.cost) ? null : 'cost';
  }
  if (!camp.pen) return 'noPen';
  if (action === 'penIn') {
    if (camp.penned >= FRONTIER_PEN.capacity) return 'full';
    return (state.inventory.get('animal') ?? 0) > 0 ? null : 'cost';
  }
  return camp.penned > 0 ? null : 'empty';
}

/** True if a pen holding `penned` animals may breed: at least 2, and room for one more. */
function mayBreed(penned: number): boolean {
  return penned >= 2 && penned < FRONTIER_PEN.capacity;
}

/** The camp with its pen holding `penned` animals, its breeding count started or cleared to match. */
function withPenned(camp: FrontierCamp, penned: number): FrontierCamp {
  const breedIn = !mayBreed(penned)
    ? 0
    : camp.breedIn > 0
      ? camp.breedIn
      : FRONTIER_PEN.breedEveryShifts;
  return { ...camp, penned, breedIn };
}

/** Do a pen action at camp `id`. If `penRefusal` says no, the very same state comes back. */
export function penAct(state: FrontierState, action: PenAction, id: number): FrontierState {
  if (penRefusal(state, action, id) !== null) {
    return state;
  }
  const animal = { item: 'animal' as const, count: 1 };
  if (action === 'buildPen') {
    return {
      ...state,
      camps: state.camps.map((c) => (c.id === id ? { ...c, pen: true, penned: 0, breedIn: 0 } : c)),
      inventory: pay(state.inventory, FRONTIER_PEN.cost),
    };
  }
  const change = action === 'penIn' ? 1 : -1;
  return {
    ...state,
    camps: state.camps.map((c) => (c.id === id ? withPenned(c, c.penned + change) : c)),
    inventory:
      action === 'penIn' ? pay(state.inventory, [animal]) : gained(state.inventory, animal),
  };
}

/**
 * Breeding at End shift: each pen that may breed counts down a shift; one
 * whose count runs out gains an animal if the store holds the hay, and
 * starts again (or stops, once full). Pens are taken in camp order, so
 * when hay is short the lowest-numbered camp's pen eats first. Returns the
 * camps, the store after the hay eaten, and how many animals were born.
 */
export function breedPens(
  camps: FrontierCamp[],
  inventory: Map<string, number>,
): { camps: FrontierCamp[]; inventory: Map<string, number>; born: number } {
  let store = inventory;
  let born = 0;
  const hay = [{ item: 'hay' as const, count: FRONTIER_PEN.hayPerBirth }];
  const next = camps.map((camp) => {
    if (!camp.pen || !mayBreed(camp.penned)) return camp;
    const left = camp.breedIn - 1;
    if (left > 0) return { ...camp, breedIn: left };
    if (!canAfford(store, hay)) return { ...camp, breedIn: 1 }; // waits for hay: tries again next shift
    store = pay(store, hay);
    born += 1;
    // The count starts again only if it may still breed (withPenned).
    return withPenned({ ...camp, breedIn: 0 }, camp.penned + 1);
  });
  return { camps: next, inventory: store, born };
}
