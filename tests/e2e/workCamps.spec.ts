// Work camps (owner, after the 0.20.0 build): built 2 x 2 from the 🔨 tray,
// their panel opened with a tap, and a worker hired there.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_WORK_CAMPS } from '../../src/data/frontier';
import { buildRefusal, createFrontier, saveFrontier } from '../../src/engine';
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

test('a farm camp is built 2 x 2 from 🔨, and a tap on it opens its panel to hire a farmer', async ({
  page,
}) => {
  const start = createFrontier(110);
  // The surface cleared (no grass, trees or animals), as a player clears it first.
  const state: FrontierState = {
    ...start,
    features: start.features.map(() => 0),
    apples: start.apples.map(() => 0),
    animals: [],
    inventory: new Map([
      ['wood', 40],
      ['clay', 20],
      ['coin', 200],
    ]),
  };
  const camp = state.camps[0] ?? { x: 0, y: 0 };
  // The nearest top-left square near the camp where a farm camp can go.
  let at: { x: number; y: number } | null = null;
  for (let d = 2; d <= 8 && at === null; d += 1) {
    for (let dy = -d; dy <= d && at === null; dy += 1) {
      for (let dx = -d; dx <= d && at === null; dx += 1) {
        const x = camp.x + dx;
        const y = camp.y + dy;
        if (buildRefusal(state, 'farmCamp', x, y) === null) at = { x, y };
      }
    }
  }
  if (at === null) throw new Error('a 2 x 2 for a farm camp near the camp');
  const canvas = await openGame(page, state);
  await page.getByTestId('lab2-build-tool').click();
  await page.getByTestId('lab2-build-farmCamp').click();
  await expect(page.getByTestId('lab2-build-line')).toContainText('2 × 2');
  await tapSquare(page, canvas, at.x, at.y);
  await expect(canvas).toHaveAttribute('data-buildings', `farmCamp@${at.x},${at.y}`);
  // A tap on another square of it opens its panel.
  await tapSquare(page, canvas, at.x + 1, at.y + 1);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'workCamp');
  await expect(page.getByTestId('lab2-work-line')).toContainText('0/3 farmers');
  await page.getByTestId('lab2-hire-worker').click();
  await expect(page.getByTestId('lab2-work-line')).toContainText('1/3 farmers');
  await expect(page.getByTestId('lab2-work-line')).toContainText('reach 3');
  await expect(page.getByTestId('lab-coins')).toHaveAttribute(
    'data-count',
    String(200 - FRONTIER_WORK_CAMPS.farmCamp.hire),
  );
});
