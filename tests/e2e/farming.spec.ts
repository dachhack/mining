// Progression PR 3 (docs/plans/progression-phases.md, section 6.2): the
// planting tool. Holding a sapling shows 🌱 in the tray; in its mode a tap on
// bare, lit dirt plants one, a refused square says why, and Undo takes a
// planting back. The run is saved and opened as the game opens any run.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { createFrontier, plantRefusal, saveFrontier } from '../../src/engine';
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

test('plant a sapling on bare dirt, be told why not on a camp, and undo it', async ({ page }) => {
  const state: FrontierState = { ...createFrontier(110), inventory: new Map([['sapling', 2]]) };
  const camp = state.camps[0] ?? { x: 0, y: 0 };
  // The bare dirt square nearest the first camp where a sapling can go.
  let spot: { x: number; y: number } | null = null;
  for (let d = 2; d < 8 && spot === null; d += 1) {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      if (spot === null && plantRefusal(state, camp.x + dx, camp.y + dy, 'sapling') === null) {
        spot = { x: camp.x + dx, y: camp.y + dy };
      }
    }
  }
  if (spot === null) throw new Error('no square to plant near the first camp');
  const canvas = await openGame(page, state);

  await page.getByTestId('lab2-plant-tool').click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'planting');
  await expect(page.getByTestId('lab2-plant-sapling')).toContainText('×2');
  // Only what is held is offered (owner, after the 0.19.0 build: seven kinds
  // would not fit a phone; the row scrolls when several are held).
  await expect(page.getByTestId('lab2-plant-appleSapling')).toHaveCount(0);

  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab-hint')).toHaveText('Not on a camp’s ground.');

  await tapSquare(page, canvas, spot.x, spot.y);
  await expect(page.getByTestId('lab-hint')).toContainText('Planted. 1 left.');
  await expect(canvas).toHaveAttribute('data-stumps', `${spot.x},${spot.y}`);
  await expect(page.getByTestId('lab2-plant-sapling')).toContainText('×1');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );

  await page.getByTestId('lab2-plant-cancel').click();
  await page.getByTestId('lab2-undo').click();
  await expect(canvas).toHaveAttribute('data-stumps', '');
  await expect(page.getByTestId('lab-res-sapling')).toHaveAttribute('data-count', '2');
});

test('build a pen at a camp, put animals in and take one out, and undo', async ({ page }) => {
  // A level-2 camp: a pen needs one (FRONTIER_PEN.minLevel).
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 2 })),
    inventory: new Map([
      ['wood', 30],
      ['animal', 3],
    ]),
  };
  const camp = state.camps[0] ?? { x: 0, y: 0 };
  const canvas = await openGame(page, state);
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await page.getByTestId('lab2-build-pen').click();
  await expect(page.getByTestId('lab2-camp-pen')).toContainText('🐑 0/4');
  await expect(page.getByTestId('lab2-pen-out')).toBeDisabled();
  await page.getByTestId('lab2-pen-in').click();
  await page.getByTestId('lab2-pen-in').click();
  await expect(page.getByTestId('lab2-camp-pen')).toContainText('🐑 2/4 · lamb in 4');
  await expect(page.getByTestId('lab-res-animal')).toHaveAttribute('data-count', '1');
  await page.getByTestId('lab2-pen-out').click();
  await expect(page.getByTestId('lab2-camp-pen')).toContainText('🐑 1/4 · 2 breed');
  await page.getByTestId('lab2-undo').click();
  await tapSquare(page, canvas, camp.x, camp.y); // Undo closes the panel
  await expect(page.getByTestId('lab2-camp-pen')).toContainText('🐑 2/4');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 3),
  );
});
