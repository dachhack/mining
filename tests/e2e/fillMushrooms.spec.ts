// Filling a dug square with dirt, mushrooms on the map, and the recipe book
// leaving out what a second of adds nothing (owner, after the 0.17.0 build).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { createFrontier, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';
import { cloneState, setBlock } from '../../src/engine/state';
import { BLOCKS } from '../../src/data';

test.use({ viewport: { width: 390, height: 844 } });

const RUN_KEY = 'mining-game.run';

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

test('the 🔨 tool’s 🟫 Dirt fills a dug square with dirt, for a tap and nothing else', async ({
  page,
}) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const at = { x: camp.x + 3, y: camp.y };
  // Dig the square 1 deep by hand: take its top block off.
  const cube = cloneState(start.cube);
  setBlock(cube, { x: at.x, y: at.y, z: 0 }, BLOCKS.air.code);
  const i = at.x + cube.size.x * at.y;
  const state: FrontierState = {
    ...start,
    cube,
    features: start.features.map((f, k) => (k === i ? 0 : f)),
    animals: start.animals.filter((a) => a.x !== at.x || a.y !== at.y),
  };
  const canvas = await openGame(page, state);
  await page.getByTestId('lab2-place-tool').click();
  await page.getByTestId('lab2-place-sawHouse').click();
  await page.getByTestId('lab2-build-dirt').click();
  await expect(page.getByTestId('lab2-build-line')).toContainText('fill it 1 level');
  // Ground never dug: nothing to fill.
  await tapSquare(page, canvas, camp.x + 3, camp.y + 3);
  await expect(page.getByTestId('lab-hint')).toContainText('never dug');
  await tapSquare(page, canvas, at.x, at.y);
  await expect(page.getByTestId('lab-hint')).toContainText('Filled with dirt');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );
});

test('a mushroom shows on the map, and a tap picks it', async ({ page }) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const width = start.cube.size.x;
  // A tree square in the camp's ring, with no animal on it.
  let at: { x: number; y: number } | null = null;
  for (let dy = -6; dy <= 6 && at === null; dy += 1) {
    for (let dx = -6; dx <= 6 && at === null; dx += 1) {
      const x = camp.x + dx;
      const y = camp.y + dy;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
      const animal = start.animals.some((a) => a.x === x && a.y === y);
      if (start.features[x + width * y] === 2 && !animal) at = { x, y };
    }
  }
  if (at === null) throw new Error('a tree near the camp');
  const i = at.x + width * at.y;
  const state: FrontierState = { ...start, mushrooms: start.mushrooms.map((_, k) => k === i) };
  const canvas = await openGame(page, state);
  await expect(canvas).toHaveAttribute('data-mushrooms', `${at.x},${at.y}`);
  await tapSquare(page, canvas, at.x, at.y);
  await expect(canvas).toHaveAttribute('data-mushrooms', '');
  await expect(page.getByTestId('lab-res-mushroom')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('lab-hint')).toContainText('mushroom');
});

test('the recipe book leaves out a tool you already have', async ({ page }) => {
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 2, smelter: true })),
    inventory: new Map([['axe', 1]]),
  };
  await openGame(page, state);
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-iron-pickaxe')).toBeVisible();
  await expect(page.getByTestId('lab2-recipe-axe')).toHaveCount(0);
});
