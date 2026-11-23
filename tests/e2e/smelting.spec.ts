// Smelting and crafting, PR 1 (docs/plans/smelting-and-crafting.md): build a
// smelter from a level-2 camp's panel (owner, question 161), then smelt raw
// ore into ingots from the recipe book (question 162), and undo it.
//
// The run is saved and opened as the game opens any saved run: the first
// camp at level 2, holding enough stone and clay for a smelter, and raw
// iron and coal for one batch. (Reaching level 3 and mining ore on the page
// would take hundreds of taps; the engine's tests cover how the items are
// got.)
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT, FRONTIER_SMELTER } from '../../src/data/frontier';
import { createFrontier, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
const RUN_KEY = 'mining-game.run';

/** Seed 110 with its first camp at level 2, holding `inventory`. */
function levelTwoWorld(inventory: Record<string, number>): FrontierState {
  const start = createFrontier(110);
  return {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 2 })),
    inventory: new Map(Object.entries(inventory)),
  };
}

async function openGame(page: Page, state: FrontierState): Promise<Locator> {
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-camps', '1');
  return canvas;
}

/** Tap square (x, y) of the map as it is on screen now. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the map is not on screen');
  const c = Number(data['cellPx']);
  await page.touchscreen.tap(
    box.x + (x - Number(data['camX']) + 0.5) * c,
    box.y + (y - Number(data['camY']) + 0.5) * c,
  );
}

const count = async (page: Page, item: string): Promise<number> => {
  const chip = page.getByTestId(`lab-res-${item}`);
  return (await chip.count()) === 0 ? 0 : Number(await chip.getAttribute('data-count'));
};

test('a smelter from a level-2 camp, then smelting iron in the recipe book, then undo', async ({
  page,
}) => {
  const state = levelTwoWorld({ stone: 25, clay: 12, rawIronOre: 3, coal: 2 });
  const canvas = await openGame(page, state);
  const hud = page.getByTestId('lab2-hud');
  const camp = state.camps[0] ?? { x: 0, y: 0 };

  // Without a smelter, the book says why smelting is off.
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-make-smelt-iron')).toBeDisabled();
  await expect(page.getByTestId('lab2-recipe-why-smelt-iron')).toContainText('Needs a smelter');
  await page.getByTestId('lab2-book-close').click();

  // The camp's panel: Build smelter, with its cost.
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 2');
  const build = page.getByTestId('lab2-build-smelter');
  await expect(build).toBeEnabled();
  await build.click();
  await expect(page.getByTestId('lab2-camp-smelter')).toBeVisible();
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 1));
  const stoneCost = FRONTIER_SMELTER.cost.find((s) => s.item === 'stone')?.count ?? 0;
  await expect.poll(() => count(page, 'stone')).toBe(25 - stoneCost);

  // The book: smelt iron (2 raw iron + 1 coal -> 2 iron ingots), 1 tap.
  await page.getByTestId('lab2-camp-close').click();
  await page.getByTestId('lab2-book').click();
  const make = page.getByTestId('lab2-recipe-make-smelt-iron');
  await expect(make).toBeEnabled();
  await expect(page.getByTestId('lab2-recipe-make-smelt-copper')).toBeDisabled(); // no copper ore
  await make.click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText('Made 2 iron ingots.');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 2));
  await expect(make).toBeDisabled(); // 1 raw iron left: not enough for another batch
  await page.getByTestId('lab2-book-close').click();
  await expect.poll(() => count(page, 'ironIngot')).toBe(2);
  await expect.poll(() => count(page, 'rawIronOre')).toBe(1);

  // Undo takes the smelting back: the ore, the coal and the tap.
  await page.getByTestId('lab2-undo').click();
  await expect.poll(() => count(page, 'ironIngot')).toBe(0);
  await expect.poll(() => count(page, 'rawIronOre')).toBe(3);
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 1));
});
