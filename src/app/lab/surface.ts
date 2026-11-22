// UI lab 2 (issue #121): the surface ("zero level"): grass, trees, apple
// trees and roaming animals.
//
// The rules and the world itself are the engine's now (src/engine/frontier,
// plans A1 to A4): it generates the surface, takes what a tap takes, and
// moves the animals and regrows the apples at the end of each shift. Lab 2
// keeps the surface in this shape for its screen and its Undo.

import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../engine';
import type { ItemStack } from '../../data';
import type { Feature, FrontierAnimal, GameState, HarvestKind } from '../../engine';

export { APPLE_TREE, GRASS, NO_FEATURE, TREE };
export type { Feature };

/** A roaming animal on square (x, y). */
export type Animal = FrontierAnimal;

export interface Surface {
  /** The feature on each square, row by row (index x + width * y). */
  features: Feature[];
  /** Apples left on each square's apple tree (0 for other squares). */
  apples: number[];
  /** For an apple tree picked bare, the shifts until its apples come back; -1 for every other square. */
  regrowIn: number[];
  animals: Animal[];
  /** The id the next animal gets. */
  nextAnimalId: number;
  /** The engine's seeded random generator's state (it moves the animals). */
  rng: number;
}

/** What a tap took from the surface: the surface after it, what it gave, and what it was. */
export interface Harvest {
  surface: Surface;
  gain: ItemStack;
  /** 'grass', 'felled' (a tree or an empty apple tree), 'apple' or 'caught'. */
  kind: HarvestKind;
}

/** The index of cell (x, y, z) of the cube, as the cube's own arrays count them. */
export function cellIndex(state: GameState, x: number, y: number, z: number): number {
  return x + state.size.x * (y + state.size.y * z);
}

/** The animal on square (x, y), or `null`. */
export function animalAt(surface: Surface, x: number, y: number): Animal | null {
  return surface.animals.find((a) => a.x === x && a.y === y) ?? null;
}
