// Progression PR 6 (docs/plans/progression-phases.md, section 2.4): holding a
// camp kit, the camp tool switches to a deep camp, which is placed on deep
// ground for the kit, wood and stone, and whose panel says it is never
// upgraded.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { BLOCKS } from '../../src/data';
import { FRONTIER_DEEP_CAMP } from '../../src/data/frontier';
import { createFrontier, footprintOf, placeRefusal, saveFrontier } from '../../src/engine';
import { cellIndex } from '../../src/engine/state';
import type { FrontierState } from '../../src/engine';

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

test('switch the camp tool to a deep camp, place it, and open its panel', async ({ page }) => {
  // Seed 110, with a 3 x 3 patch east of the first camp dug to the deep
  // camp's least depth (FRONTIER_DEEP_CAMP.minDepth): digging it there on the
  // page would take hundreds of taps.
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const kit = new Map([
    ['campKit', 1],
    ['wood', 20],
    ['stone', 20],
  ]);
  let state: FrontierState | null = null;
  let spot: { x: number; y: number } | null = null;
  for (let d = 4; d < 8 && spot === null; d += 1) {
    const at = { x: camp.x + d, y: camp.y };
    const blocks = start.cube.blocks.slice();
    for (const sq of footprintOf(at.x, at.y)) {
      for (let z = 0; z < FRONTIER_DEEP_CAMP.minDepth; z += 1) {
        blocks[cellIndex(start.cube.size, { ...sq, z })] = BLOCKS.air.code;
      }
    }
    const dug: FrontierState = { ...start, cube: { ...start.cube, blocks }, inventory: kit };
    if (placeRefusal(dug, at.x, at.y, true) === null) {
      state = dug;
      spot = at;
    }
  }
  if (state === null || spot === null)
    throw new Error('no place for a deep camp near the first camp');
  const canvas = await openGame(page, state);

  await page.getByTestId('lab2-camp-tool').click();
  await page.getByTestId('lab2-place-deep').click();
  await expect(page.getByTestId('lab2-place-deep')).toHaveAttribute('aria-pressed', 'true');
  await tapSquare(page, canvas, spot.x, spot.y);
  await expect(page.getByTestId('lab2-place-confirm')).toHaveText('Place deep');
  await page.getByTestId('lab2-place-confirm').click();
  await expect(canvas).toHaveAttribute('data-camps', '2');
  await expect(page.getByTestId('lab-hint')).toContainText('Deep camp placed');
  await tapSquare(page, canvas, spot.x, spot.y);
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Deep camp 2');
  await expect(page.getByTestId('lab2-camp-next')).toHaveText('A deep camp is never upgraded.');
});

test('the recipe book lists the deep camp as a camp of its own; its pin opens the camp tool switched to it', async ({
  page,
}) => {
  await openGame(page, { ...createFrontier(110), inventory: new Map([['campKit', 1]]) });
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-deep-camp')).toContainText('Deep camp');
  await expect(page.getByTestId('lab2-recipe-deep-camp-campKit')).toContainText('1/1');
  await expect(page.getByTestId('lab2-recipe-does-deep-camp')).toContainText('never upgraded');
  await page.getByTestId('lab2-recipe-pin-deep-camp').click();
  await page.getByTestId('lab2-book-close').click();
  await page.getByTestId('lab2-pin-deep-camp').getByRole('button').first().click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await expect(page.getByTestId('lab2-place-deep')).toHaveAttribute('aria-pressed', 'true');
});
