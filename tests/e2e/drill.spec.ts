// Smelting and crafting, PR 4 (docs/plans/smelting-and-crafting.md): the
// iron drill and camp level 4 (owner, question 163). Each run is saved and
// opened as the game opens any saved run.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_DRILL, FRONTIER_SHIFT } from '../../src/data/frontier';
import { BLOCKS } from '../../src/data';
import { campRadius, createFrontier, depthAt, previewTap, saveFrontier } from '../../src/engine';
import { cellIndex } from '../../src/engine/state';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
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

test('make an iron drill in the book, then upgrade a level-3 camp to level 4', async ({ page }) => {
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 3, smelter: true })),
    inventory: new Map(Object.entries({ ironIngot: 12, copperIngot: 8, wood: 42, stone: 20 })),
  };
  const canvas = await openGame(page, state);
  const camp = state.camps[0] ?? { x: 0, y: 0 };

  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-does-iron-drill')).toContainText('one level harder');
  await page.getByTestId('lab2-recipe-make-iron-drill').click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText('Made 1 drill.');
  await page.getByTestId('lab2-book-close').click();
  await expect.poll(() => count(page, FRONTIER_DRILL.item)).toBe(1);

  // Level 3 -> 4: a wider ring, nothing new to mine.
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-camp-next')).toHaveText(
    `Level 4: ring ${campRadius(4)}, nothing new to mine`,
  );
  // The drill adds nothing to a level-3 camp.
  await expect(page.getByTestId('lab2-camp-line')).not.toContainText('🔩');
  const shownBefore = Number(await canvas.getAttribute('data-shown'));
  await page.getByTestId('lab2-upgrade').click();
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 4');
  await expect(page.getByTestId('lab-hint')).toHaveText('Camp 1 is level 4: a wider ring.');
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(4)} `);
  await expect(page.getByTestId('lab2-camp-next')).toContainText('Top level');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-shown')))
    .toBeGreaterThan(shownBefore);
  await expect.poll(() => count(page, 'ironIngot')).toBe(12 - 4 - 8);
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 2),
  );
});

test('with a drill in the store, a level-1 camp mines hard rock', async ({ page }) => {
  // Seed 110, with the top block of a bare square near the first camp
  // made hard rock (a first camp's ring has none on top: it lies deeper).
  const start = createFrontier(110);
  const camp0 = start.camps[0] ?? { x: 0, y: 0 };
  let square: { x: number; y: number } | null = null;
  for (let dx = 2; dx < campRadius(1) && square === null; dx += 1) {
    if (previewTap(start, camp0.x + dx, camp0.y).kind === 'mined') {
      square = { x: camp0.x + dx, y: camp0.y };
    }
  }
  if (square === null) throw new Error('no bare square east of the first camp');
  const blocks = start.cube.blocks.slice();
  const z = depthAt(start.cube, square.x, square.y);
  blocks[cellIndex(start.cube.size, { ...square, z })] = BLOCKS.hardRock.code;
  const hard: FrontierState = { ...start, cube: { ...start.cube, blocks } };
  expect(previewTap(hard, square.x, square.y).kind).toBe('tooHard');
  const drilled: FrontierState = { ...hard, inventory: new Map([[FRONTIER_DRILL.item, 1]]) };
  expect(previewTap(drilled, square.x, square.y).kind).toBe('mined');
  const found = { state: drilled, ...square };
  const canvas = await openGame(page, found.state);
  const camp = found.state.camps[0] ?? { x: 0, y: 0 };

  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-camp-line')).toContainText('🔩 mines Hard rock');
  await page.getByTestId('lab2-camp-close').click();

  await tapSquare(page, canvas, found.x, found.y);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${found.x},${found.y}`);
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );
});
