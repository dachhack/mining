// The top-down map of the phone preview (issue #86), at phone size
// (390 x 844): tap a square to mine it, a refused tap shows the reason and
// marks the neighbours that are too high, tap a tree to cut it; drag to pan,
// and the two zoom buttons.
//
// Seed 110 (see `npm run play -- --seed 110`): the map opens on the coal in
// sight that is nearest its middle, x16 y12 (issue #110), so it shows the
// squares x9..x22, y5..y18. x10..x14 of row y11 are dirt on open ground,
// x15 y11 is stone, and a tree stands on x19 y10.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function startRun(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

/** Where the map's camera is: the square at its top-left corner, and the square size in pixels. */
async function camera(
  canvas: Locator,
): Promise<{ x: number; y: number; cellPx: number; originPx: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return {
    x: Number(data['camX']),
    y: Number(data['camY']),
    cellPx: Number(data['cellPx']),
    // The squares start after the rulers along the top and the left of the map.
    originPx: Number(data['originPx']),
  };
}

/** Tap the square (x, y) of the map, as a finger would. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const cam = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  await page.touchscreen.tap(
    box.x + cam.originPx + (x - cam.x + 0.5) * cam.cellPx,
    box.y + cam.originPx + (y - cam.y + 0.5) * cam.cellPx,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Each test starts with no saved run and no saved zoom.
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await startRun(page, 110);
});

test('the map opens on the nearest coal in sight, with squares big enough to tap', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const cam = await camera(canvas);
  expect(cam.cellPx).toBeGreaterThanOrEqual(24);
  await expect(canvas).toHaveAttribute('data-cells', '14');
  // Centred on x16 y12: 7 squares to its left and above it.
  expect(cam.x).toBe(9);
  expect(cam.y).toBe(5);
  await expect(page.getByTestId('map-label')).toContainText('14 of 32 squares across');
  // The legend names what is on screen; nothing is said of layers or a miner.
  await expect(page.getByTestId('map-legend')).toContainText('Dirt');
  await expect(page.getByTestId('map-legend')).toContainText('tree');
  await expect(page.getByRole('button', { name: /Go up|Go down|Look/ })).toHaveCount(0);
});

test('a tap mines the square: AP drops, the square is 1 deep, the yield arrives', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  await expect(gauges).toContainText('AP 5/5');

  await tapSquare(page, canvas, 14, 11); // dirt: 1 AP, gives nothing
  await expect(gauges).toContainText('AP 4/5');
  await expect(page.getByTestId('outcome')).toContainText('Mined Dirt');
  await expect(page.getByTestId('outcome')).toContainText('(depth 1)');
  await expect(gauges).toContainText('Deepest square so far: depth 1');
  await expect(page.getByTestId('map-legend')).toContainText('deeper is darker');

  await tapSquare(page, canvas, 15, 11); // stone: 2 AP, gives 1 stone
  await expect(gauges).toContainText('AP 2/5');
  await expect(gauges).toContainText('1 Stone');
  // Nothing is marked after a tap that was taken.
  await expect(canvas).toHaveAttribute('data-selected', '');
});

test('a tap the level rule refuses says why and marks the higher neighbours', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  await tapSquare(page, canvas, 14, 11);
  await expect(gauges).toContainText('AP 4/5');

  // The same square again: all four neighbours are higher.
  await tapSquare(page, canvas, 14, 11);
  const outcome = page.getByTestId('outcome');
  await expect(outcome).toContainText('x14 y11, depth 1');
  await expect(outcome).toContainText('The level rule');
  await expect(outcome).toContainText('x15 y11 (east, depth 0)');
  await expect(canvas).toHaveAttribute('data-selected', '14,11');
  await expect(canvas).toHaveAttribute('data-too-high', '14,10 15,11 14,12 13,11');
  // Nothing was done.
  await expect(gauges).toContainText('AP 4/5');

  // The next tap clears the marks (here: a mine of one of those neighbours).
  await tapSquare(page, canvas, 13, 11);
  await expect(gauges).toContainText('AP 3/5');
  await expect(canvas).toHaveAttribute('data-selected', '');
  await expect(canvas).toHaveAttribute('data-too-high', '');
});

test('a tap on a tree cuts it: timber goes up and the ground shows', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  await expect(gauges).toContainText('Stockpile: 1 Camp kit, 2 Timber');
  await expect(page.getByTestId('map-legend')).not.toContainText('stump');

  await tapSquare(page, canvas, 19, 10);
  await expect(gauges).toContainText('AP 3/5');
  await expect(gauges).toContainText('Stockpile: 1 Camp kit, 4 Timber');
  await expect(page.getByTestId('outcome')).toContainText('cut down the tree');
  await expect(page.getByTestId('outcome')).toContainText('The top block there is now');
  await expect(page.getByTestId('map-legend')).toContainText('stump');
});

test('a tap with too little AP says so, and End shift brings the AP back', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  // Five dirt squares in a row: 5 AP.
  for (const x of [10, 11, 12, 13, 14]) {
    await tapSquare(page, canvas, x, 11);
  }
  await expect(gauges).toContainText('AP 0/5');
  await tapSquare(page, canvas, 15, 11);
  await expect(page.getByTestId('outcome')).toContainText('costs 2 AP and you have 0 left');
  await expect(canvas).toHaveAttribute('data-selected', '15,11');
  await expect(canvas).toHaveAttribute('data-too-high', '');

  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 2 | AP 5/5 | Fuel 71');
  await expect(canvas).toHaveAttribute('data-selected', '');
});

test('a drag pans the map and is not a tap; the zoom buttons show the whole map and come back', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const before = await camera(canvas);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 3 * before.cellPx, startY - 2 * before.cellPx, { steps: 8 });
  await page.mouse.up();
  const after = await camera(canvas);
  expect(after.x).toBeCloseTo(before.x + 3, 1);
  expect(after.y).toBeCloseTo(before.y + 2, 1);
  // The drag did nothing to the game.
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');

  await page.getByTestId('whole-map').click();
  await expect(canvas).toHaveAttribute('data-cells', '32');
  await expect(page.getByTestId('map-label')).toContainText('The whole map');
  // Zoomed right out a tap still lands on the right square.
  await tapSquare(page, canvas, 14, 11);
  await expect(page.getByTestId('outcome')).toContainText('Mine x14 y11');

  await page.getByTestId('zoom-in').click();
  await expect(canvas).toHaveAttribute('data-cells', '14');
});
