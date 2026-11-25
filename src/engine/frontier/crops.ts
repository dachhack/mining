// Grains and vegetables (owner, after the 0.19.0 build: "Let's add seeds to
// the market for a few grains and vegetables. You can plant these in soil
// and they grow and you can harvest.").
//
// - A seed (FRONTIER_CROPS) is planted from the store as a sapling is
//   (farming.ts): on lit surface dirt never dug, with nothing growing on it
//   and no stump, sapling, mushroom, building, camp or animal, for 1 tap.
// - Each End shift counts its `growShifts` down (`growCrops`); at 0 it is
//   ripe.
// - A tap on a ripe crop harvests it: `yield` of its `crop` into the store,
//   and the square is bare dirt again (surface.ts). A tap on one still
//   growing does nothing and costs nothing (tap.ts: 'growing'), so a stray
//   tap never digs a crop up.
// - A camp placed over it clears it; a gas blast passes it by.
//
// The numbers are in src/data/frontier.ts.

import { FRONTIER_CROPS } from '../../data/frontier';
import type { FrontierCropDef } from '../../data/frontier';
import type { FrontierState } from './state';

/** The crop planted from `seed`, or `null` if `seed` is not a seed. */
export function cropOfSeed(seed: string): FrontierCropDef | null {
  return FRONTIER_CROPS.find((c) => c.seed === seed) ?? null;
}

/** True if `item` is a seed (FRONTIER_CROPS). */
export function isSeed(item: string): boolean {
  return cropOfSeed(item) !== null;
}

/** The crop growing on square index `i`, or `null`. */
export function cropAt(state: FrontierState, i: number): FrontierCropDef | null {
  const k = state.crops[i] ?? 0;
  return k > 0 ? (FRONTIER_CROPS[k - 1] ?? null) : null;
}

/** True if a ripe crop stands on square index `i`. */
export function isRipe(state: FrontierState, i: number): boolean {
  return (state.crops[i] ?? 0) > 0 && state.cropIn[i] === 0;
}

/** `state` with a crop from `seed` planted on square index `i` (no checks: farming.ts checks). */
export function withCrop(state: FrontierState, i: number, seed: string): FrontierState {
  const k = FRONTIER_CROPS.findIndex((c) => c.seed === seed);
  const def = FRONTIER_CROPS[k];
  if (def === undefined) return state;
  const crops = [...state.crops];
  const cropIn = [...state.cropIn];
  crops[i] = k + 1;
  cropIn[i] = def.growShifts;
  return { ...state, crops, cropIn };
}

/** `state` with the crop on square index `i` gone (harvested or cleared). */
export function withoutCrop(state: FrontierState, i: number): FrontierState {
  if ((state.crops[i] ?? 0) === 0) return state;
  const crops = [...state.crops];
  const cropIn = [...state.cropIn];
  crops[i] = 0;
  cropIn[i] = -1;
  return { ...state, crops, cropIn };
}

/** The crops after a night: each one still growing is a shift nearer ripe. How many ripened. */
export function growCrops(state: FrontierState): { state: FrontierState; ripened: number } {
  if (!state.cropIn.some((n) => n > 0)) return { state, ripened: 0 };
  let ripened = 0;
  const cropIn = state.cropIn.map((n) => {
    if (n <= 0) return n;
    if (n === 1) ripened += 1;
    return n - 1;
  });
  return { state: { ...state, cropIn }, ripened };
}
