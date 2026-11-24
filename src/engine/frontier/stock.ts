// What the whole world still holds (owner, on the hazards build: "Let's
// inventory the entire board so that the contracts offered are not
// unfillable").
//
// `worldStock` counts, item by item:
// - every block still in the ground, under every square, at and below its
//   top block, by what mining it yields (blockDefByCode(...).yields; the
//   pickaxe's doubling is not counted);
// - what the store holds;
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
import { FRONTIER_RECIPES } from '../../data/frontier';
import { depthAt } from '../heightmap';
import { blockAt } from '../state';
import type { GameState } from '../state';
import type { FrontierState } from './state';

/** What the ground still holds, by item: kept for each cube. */
const groundCache = new WeakMap<GameState, Map<string, number>>();

/** Every item still in the ground of `cube`, at and below each square's top block. */
export function groundStock(cube: GameState): Map<string, number> {
  const cached = groundCache.get(cube);
  if (cached !== undefined) return cached;
  const stock = new Map<string, number>();
  for (let y = 0; y < cube.size.y; y += 1) {
    for (let x = 0; x < cube.size.x; x += 1) {
      for (let z = depthAt(cube, x, y); z < cube.size.z; z += 1) {
        for (const stack of blockDefByCode(blockAt(cube, { x, y, z })).yields) {
          stock.set(stack.item, (stock.get(stack.item) ?? 0) + stack.count);
        }
      }
    }
  }
  groundCache.set(cube, stock);
  return stock;
}

/**
 * What the world holds, by item: the ground, the store, and the ingots its
 * ore and coal could be smelted into (see the top of this file).
 */
export function worldStock(state: FrontierState): Map<string, number> {
  const stock = new Map(groundStock(state.cube));
  for (const [item, count] of state.inventory) {
    stock.set(item, (stock.get(item) ?? 0) + count);
  }
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
