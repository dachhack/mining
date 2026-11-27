// What the whole world still holds (owner, on the hazards build: "Let's
// inventory the entire board so that the contracts offered are not
// unfillable").
//
// `worldStock` counts, item by item:
// - every block still in the ground, under every square, at and below its
//   top block, by what mining it yields (blockDefByCode(...).yields; the
//   pickaxe's doubling is not counted);
// - what the store holds;
// - the mushrooms standing and coming (mushrooms.ts);
// - as much as anyone could ask of what grows back, or is bought and made
//   (FRONTIER_BOARD.renewable: wood, hay, animals, apples, syrup, lumber,
//   crops; owner, after the 0.22.0 build): Infinity;
// - the ingots that ore and coal could be smelted into (FRONTIER_RECIPES:
//   'smelt-iron' and 'smelt-copper'), on top of any held: each smelting
//   recipe counted alone, as if the coal went to it only.
// The contract board (contracts.ts) offers only contracts whose every ask
// is within this stock, so every contract offered can be filled from what
// the world holds. Nothing is bought at the market in the count.
//
// The count reads every cell of the cube, so it is kept for each cube (a
// cube is never changed once made: every change makes a new one).

import type { ItemStack } from '../../data';
import { blockDefByCode } from '../../data';
import { FRONTIER_BOARD, FRONTIER_RECIPES } from '../../data/frontier';
import { depthAt } from '../heightmap';
import { blockAt } from '../state';
import type { GameState } from '../state';
import type { FrontierState } from './state';

/** What the ground still holds, by item: kept for each cube and each depth limit. */
const groundCache = new WeakMap<GameState, Map<number, Map<string, number>>>();

/**
 * Every item still in the ground of `cube`, at and below each square's top
 * block, down to layer `maxDepth` (all the way down if not given).
 */
export function groundStock(cube: GameState, maxDepth = Infinity): Map<string, number> {
  const byLimit = groundCache.get(cube) ?? new Map<number, Map<string, number>>();
  groundCache.set(cube, byLimit);
  const cached = byLimit.get(maxDepth);
  if (cached !== undefined) return cached;
  const stock = new Map<string, number>();
  const bottom = Math.min(cube.size.z, maxDepth + 1);
  for (let y = 0; y < cube.size.y; y += 1) {
    for (let x = 0; x < cube.size.x; x += 1) {
      for (let z = depthAt(cube, x, y); z < bottom; z += 1) {
        for (const stack of blockDefByCode(blockAt(cube, { x, y, z })).yields) {
          stock.set(stack.item, (stock.get(stack.item) ?? 0) + stack.count);
        }
      }
    }
  }
  byLimit.set(maxDepth, stock);
  return stock;
}

/**
 * What the world holds, by item: the ground (down to layer `maxDepth`, all
 * of it if not given), the store, and the ingots its ore and coal could be
 * smelted into (see the top of this file).
 */
export function worldStock(state: FrontierState, maxDepth = Infinity): Map<string, number> {
  const stock = new Map(groundStock(state.cube, maxDepth));
  for (const [item, count] of state.inventory) {
    stock.set(item, (stock.get(item) ?? 0) + count);
  }
  // Mushrooms standing, and those coming (mushrooms.ts).
  const mushrooms =
    state.mushrooms.filter((m) => m).length + state.mushroomIn.filter((n) => n >= 0).length;
  if (mushrooms > 0) stock.set('mushroom', (stock.get('mushroom') ?? 0) + mushrooms);
  // What grows back, or is bought and made, is always to be had.
  for (const item of FRONTIER_BOARD.renewable) stock.set(item, Infinity);
  // Ingots from smelting: as many times as the scarcest input allows.
  for (const recipe of FRONTIER_RECIPES) {
    if (!recipe.id.startsWith('smelt-')) continue;
    const times = Math.min(
      ...recipe.inputs.map((input) => Math.floor((stock.get(input.item) ?? 0) / input.count)),
    );
    const out = recipe.output;
    stock.set(out.item, (stock.get(out.item) ?? 0) + times * out.count);
  }
  return stock;
}

/** True if the world holds everything `asks` asks for (each item on its own). */
export function worldCanFill(stock: Map<string, number>, asks: ItemStack[]): boolean {
  return asks.every((ask) => (stock.get(ask.item) ?? 0) >= ask.count);
}
