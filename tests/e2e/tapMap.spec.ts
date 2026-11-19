// The tap map of the phone preview (issue #66): drag to pan, "Centre on me",
// tap a cell to move or mine, and the chooser for a tap that stands for more
// than one choice or for a choice with a warning.
// Seed 7 starts on the surface at x16 y16 over dirt; under it, on layer 0,
// there is dirt to the west (see `npm run play -- --seed 7 --do mine-down`).
// The map starts on the miner's own layer, the surface.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function startRun(page: Page, seed: number): Promise<void> {
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

/** Where the map's camera is: the cell at its top-left corner, and the cell size in pixels. */
async function camera(canvas: Locator): Promise<{ x: number; y: number; cellPx: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return { x: Number(data['camX']), y: Number(data['camY']), cellPx: Number(data['cellPx']) };
}

/** The page position of the middle of cell (x, y) on the map. */
async function cellPoint(canvas: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  const cam = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  return {
    x: box.x + (x - cam.x + 0.5) * cam.cellPx,
    y: box.y + (y - cam.y + 0.5) * cam.cellPx,
  };
}

/** Tap cell (x, y) of the map, as a finger would. */
async function tapCell(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const point = await cellPoint(canvas, x, y);
  await page.touchscreen.tap(point.x, point.y);
}

/** Drag the map by (dx, dy) pixels with the mouse, in small steps. */
async function drag(page: Page, canvas: Locator, dx: number, dy: number): Promise<void> {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
}

/**
 * Drop one timber in the miner's cell (from the full list), so a tap on the
 * miner stands for two choices, picking it up and digging down, and opens
 * the chooser. Since PR #74 a lone dig down is taken on one tap.
 */
async function dropTimberHere(page: Page): Promise<void> {
  await page.getByText(/^All actions/).click();
  await page.getByRole('button', { name: /^Drop/ }).filter({ hasText: 'Timber' }).first().click();
  await page.getByText(/^All actions/).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await startRun(page, 7);
});

test('the map is centred on the miner, a drag pans it, "Centre on me" brings it back', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  // x16 y16 on a 32 x 32 cube: the 16 x 16 window starts at x8 y8.
  expect(await camera(canvas)).toMatchObject({ x: 8, y: 8 });
  await expect(page.getByTestId('layer-label')).toHaveText('Surface · you are here');

  const { cellPx } = await camera(canvas);
  await drag(page, canvas, 3 * cellPx, 2 * cellPx);
  const moved = await camera(canvas);
  // Dragging the map right and down shows more of the west and north.
  expect(moved.x).toBeCloseTo(5, 1);
  expect(moved.y).toBeCloseTo(6, 1);
  // A drag is never a tap: nothing was done.
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  await expect(page.getByTestId('chooser')).toBeHidden();

  await page.getByRole('button', { name: 'Centre on me' }).click();
  expect(await camera(canvas)).toMatchObject({ x: 8, y: 8 });
});

test('on the surface a tap on a neighbour walks there at once', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  await tapCell(page, canvas, 17, 16);
  await expect(gauges).toContainText('x17 y16, the surface');
  await expect(gauges).toContainText('AP 4/5');
  await tapCell(page, canvas, 18, 16);
  await expect(gauges).toContainText('x18 y16, the surface');
  await tapCell(page, canvas, 18, 17);
  await expect(gauges).toContainText('x18 y17, the surface');
  await expect(gauges).toContainText('AP 2/5');
  await expect(page.getByTestId('chooser')).toBeHidden();
  // On the layer-0 view the block under a neighbour is out of the pick's
  // reach (issue #75: face neighbours only); the block underfoot is dug down.
  await page.getByRole('button', { name: 'Look one layer down' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · 1 below you');
  await tapCell(page, canvas, 18, 16);
  await expect(page.getByTestId('map-hint')).toHaveText('Nothing to do there');
  await tapCell(page, canvas, 18, 17);
  await expect(page.getByTestId('outcome')).toContainText('> Mine below you');
});

test('tapping the miner digs down at once; the result line says what happened', async ({
  page,
}) => {
  // Coordinator's decision on PR #74: one tap digs, as in Minecraft. The
  // result line then says in the past tense what happened, with no forecast
  // of a fall (review of PR #74).
  const canvas = page.getByTestId('map-canvas');
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('chooser')).toBeHidden();
  await expect(page.getByTestId('outcome')).not.toContainText('will fall');
  await expect(page.getByTestId('outcome')).toContainText('You dropped 1 block.');
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');
  // There was rock under it: a safe one-block drop.
  await expect(page.getByTestId('gauges')).toContainText('Health 10/10');
  await expect(page.getByTestId('gauges')).toContainText('x16 y16, layer 0');
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · you are here');
});

test('a tap standing for two choices opens the chooser; a tap elsewhere cancels it', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  await dropTimberHere(page);
  const chooser = page.getByTestId('chooser');
  await tapCell(page, canvas, 16, 16);
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText('Mine below you');
  // The warning is shown in the chooser too.
  await expect(chooser).toContainText('you drop at least 1 block');
  // Tapping elsewhere on the map cancels. (The chooser covers the top half
  // of the map, above the miner, so the tap is in the bottom half.)
  await tapCell(page, canvas, 10, 22);
  await expect(chooser).toBeHidden();
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');

  await tapCell(page, canvas, 16, 16);
  await chooser.getByRole('button', { name: /Mine below you/ }).click();
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');
  await expect(page.getByTestId('gauges')).toContainText('x16 y16, layer 0');
});

test('tapping a neighbouring block mines it, and tapping the open cell moves there', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  // One tap digs down (coordinator's decision on PR #74).
  await tapCell(page, canvas, 16, 16);
  await expect(gauges).toContainText('AP 4/5');

  // West is dirt: one tap mines it (one choice, no warning).
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine west: Dirt');
  await expect(gauges).toContainText('AP 3/5');
  await expect(page.getByTestId('chooser')).toBeHidden();

  // Now west is open: one tap walks there.
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Move west.');
  await expect(gauges).toContainText('x15 y16, layer 0');
  await expect(gauges).toContainText('AP 2/5');

  // A cell with nothing to do says so and does nothing.
  await tapCell(page, canvas, 10, 10);
  await expect(page.getByTestId('map-hint')).toHaveText('Nothing to do there');
  await expect(gauges).toContainText('AP 2/5');

  // Mine and walk west once more (x14 is dirt), spending the last AP; then
  // the dirt at x13 cannot be mined, and the hint says why.
  await tapCell(page, canvas, 14, 16);
  await expect(gauges).toContainText('AP 1/5');
  await tapCell(page, canvas, 14, 16);
  await expect(gauges).toContainText('AP 0/5');
  await tapCell(page, canvas, 13, 16);
  await expect(page.getByTestId('map-hint')).toHaveText('Not enough AP (you have 0)');
});

test('the layer buttons show the layer below, where only the block underfoot can be mined', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  // One tap digs down (coordinator's decision on PR #74).
  await tapCell(page, canvas, 16, 16);
  await page.getByRole('button', { name: 'Look one layer down' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 1 · 1 below you');
  // The block under the west neighbour is out of reach (issue #75).
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('map-hint')).toHaveText('Nothing to do there');
  await page.getByRole('button', { name: 'Look one layer up' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Layer 0 · you are here');
  // The block underfoot is dug down from the layer below too, in one tap.
  await page.getByRole('button', { name: 'Look one layer down' }).click();
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine below you');
  await expect(page.getByTestId('gauges')).toContainText('layer 1');
});

test('at phone width: no sideways scroll, and every tap target is at least 44 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const canvas = page.getByTestId('map-canvas');
  // With the chooser open, so its buttons are measured too.
  await dropTimberHere(page);
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('chooser')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const heights = await page
    .locator('button:visible, summary')
    .evaluateAll((targets) => targets.map((t) => t.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(5);
  for (const height of heights) {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

// ----- Pinch to zoom (issue #69) -----

/** How many cells the map shows across now. */
async function cellsAcross(canvas: Locator): Promise<number> {
  return Number(await canvas.getAttribute('data-cells'));
}

/**
 * A two-finger pinch on the map, sent as raw touch events through the
 * Chrome DevTools Protocol (Playwright's touchscreen has one finger only).
 * The fingers start `from` pixels either side of the map's middle and end
 * `to` pixels either side: `to` > `from` spreads them (zooms in).
 */
async function pinch(page: Page, canvas: Locator, from: number, to: number): Promise<void> {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const fingers = (spread: number) => [
    { x: cx - spread, y: cy, id: 1 },
    { x: cx + spread, y: cy, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const spread = from + ((to - from) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(spread) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('a two-finger pinch zooms the map, and is never a tap', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  expect(await cellsAcross(canvas)).toBe(16);

  // Spread the fingers to twice the distance: half as many cells across.
  await pinch(page, canvas, 40, 80);
  await expect.poll(() => cellsAcross(canvas)).toBeLessThan(10);
  expect(await cellsAcross(canvas)).toBeGreaterThanOrEqual(8);
  // Nothing was done: no action, no chooser, no hint.
  await expect(gauges).toContainText('AP 5/5');
  await expect(gauges).toContainText('x16 y16, the surface');
  await expect(page.getByTestId('chooser')).toBeHidden();
  await expect(page.getByTestId('map-hint')).toBeHidden();

  // Pinch the fingers together, far: out to the whole 32 x 32 layer.
  await pinch(page, canvas, 120, 20);
  await expect.poll(() => cellsAcross(canvas)).toBe(32);
  expect(await camera(canvas)).toMatchObject({ x: 0, y: 0 });
  await expect(gauges).toContainText('AP 5/5');

  // The zoom is remembered on this device.
  await page.reload();
  await expect.poll(() => cellsAcross(page.getByTestId('map-canvas'))).toBe(32);

  // The reset button goes back to 16 x 16.
  await page.getByRole('button', { name: 'Zoom to 16 by 16' }).click();
  expect(await cellsAcross(page.getByTestId('map-canvas'))).toBe(16);
});

test('the mouse wheel zooms too, and taps still work when zoomed', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Wheel up zooms in.
  await page.mouse.wheel(0, -400);
  await expect.poll(() => cellsAcross(canvas)).toBeLessThan(16);
  // Zoomed in, a tap on the east neighbour still walks there.
  await tapCell(page, canvas, 17, 16);
  await expect(page.getByTestId('gauges')).toContainText('x17 y16, the surface');
  // Wheel down zooms out, no further than the whole layer.
  await page.mouse.wheel(0, 5000);
  await expect.poll(() => cellsAcross(canvas)).toBe(32);
});

/**
 * Raw touch input through one Chrome DevTools Protocol session (a touch
 * sequence must stay on one session). 'touchStart' and 'touchMove' list the
 * fingers that are down; 'touchEnd' lists the fingers that lift (an empty
 * list lifts them all), so one finger can lift before the others.
 */
async function toucher(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number; id: number }[],
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  };
}

test('a pinch that ends one finger at a time is never a tap (review of PR #71)', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  const before = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cy = box.y + box.height / 2;
  const left = { x: box.x + box.width / 2 - 50, y: cy, id: 1 };
  const right = { x: box.x + box.width / 2 + 50, y: cy, id: 2 };
  const touch = await toucher(page);
  await touch('touchStart', [left, right]);
  // Finger 1 lifts first; finger 2 stays down ...
  await touch('touchEnd', [left]);
  // ... then moves onto the miner's east neighbour and lifts there.
  const east = await cellPoint(canvas, 17, 16);
  await touch('touchMove', [{ ...right, x: east.x, y: east.y }]);
  await touch('touchEnd', []);
  // Nothing was done, nothing panned, and no chooser or hint.
  await expect(gauges).toContainText('x16 y16, the surface');
  await expect(gauges).toContainText('AP 5/5');
  expect(await camera(canvas)).toEqual(before);
  await expect(page.getByTestId('chooser')).toBeHidden();
  await expect(page.getByTestId('map-hint')).toBeHidden();
});

test('with three fingers down, lifting one of the first two does not make the map jump', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const one = { x: cx - 60, y: cy, id: 1 };
  const two = { x: cx, y: cy, id: 2 };
  const three = { x: cx + 60, y: cy, id: 3 };
  const touch = await toucher(page);
  await touch('touchStart', [one, two, three]);
  const before = await camera(canvas);
  // Finger 1 lifts: the pinch goes on with fingers 2 and 3, which have not moved.
  await touch('touchEnd', [one]);
  // A tiny move of the remaining pair must move the map only a tiny bit.
  await touch('touchMove', [
    { ...two, x: two.x + 1 },
    { ...three, x: three.x + 1 },
  ]);
  const after = await camera(canvas);
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.2);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.2);
  expect(Math.abs(after.cellPx - before.cellPx)).toBeLessThan(0.5);
  await touch('touchEnd', []);
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
});
