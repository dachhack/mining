// The tap map of the phone preview (issues #66 and #78): drag to pan,
// "Centre on me", tap a cell to move, mine or cut at once, and a second tap
// on the same cell for a risky one. There is no menu.
// Seed 7 starts on the surface at x16 y16 over dirt; under it, on layer 0,
// there is dirt to the west (see `npm run play -- --seed 7 --do mine-down`).
// The map starts on the top view (layer 0, with the surface's trees on it).
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { SAVE_KEY } from '../../src/app/previewSession';
import { heavyRun } from './support/heavyRun';

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
 * The colour drawn near the bottom-left corner of cell (x, y): inside the
 * cell, but away from the patterns drawn in its middle.
 */
async function cellColour(canvas: Locator, x: number, y: number) {
  const cam = await camera(canvas);
  return canvas.evaluate(
    (el, at) => {
      const c = el as HTMLCanvasElement;
      const scale = c.width / c.getBoundingClientRect().width;
      const px = Math.round((at.x - at.camX + 0.12) * at.cellPx * scale);
      const py = Math.round((at.y - at.camY + 0.88) * at.cellPx * scale);
      const d = c.getContext('2d')?.getImageData(px, py, 1, 1).data;
      return { r: d?.[0] ?? 0, g: d?.[1] ?? 0, b: d?.[2] ?? 0 };
    },
    { x, y, camX: cam.x, camY: cam.y, cellPx: cam.cellPx },
  );
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
  // The map starts on the top view, with the miner on the surface (issue #78).
  await expect(page.getByTestId('layer-label')).toHaveText('Top layer · you are on the surface');
  // There is no separate surface layer above it.
  await expect(page.getByRole('button', { name: 'Look one layer up' })).toBeDisabled();

  const { cellPx } = await camera(canvas);
  await drag(page, canvas, 3 * cellPx, 2 * cellPx);
  const moved = await camera(canvas);
  // Dragging the map right and down shows more of the west and north.
  expect(moved.x).toBeCloseTo(5, 1);
  expect(moved.y).toBeCloseTo(6, 1);
  // A drag is never a tap: nothing was done.
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');

  await page.getByRole('button', { name: 'Centre on me' }).click();
  expect(await camera(canvas)).toMatchObject({ x: 8, y: 8 });
});

test('there is no pop-up menu on the map (issue #78)', async ({ page }) => {
  const canvas = page.getByTestId('map-canvas');
  // Taps on the miner, a neighbour and an empty cell: none opens a menu.
  await tapCell(page, canvas, 17, 16);
  await tapCell(page, canvas, 10, 10);
  await tapCell(page, canvas, 17, 16);
  await expect(page.getByTestId('chooser')).toHaveCount(0);
  await expect(page.locator('.chooser')).toHaveCount(0);
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
  // Two cells away there is nothing to do.
  await tapCell(page, canvas, 18, 19);
  await expect(page.getByTestId('map-hint')).toHaveText('Nothing to do there');
});

test('a tap on a tree beside the miner cuts it, and the block under it shows', async ({ page }) => {
  // Seed 7: trees stand at x15-17 y14, two cells north of the start.
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  const legend = page.getByTestId('map-legend');
  await expect(legend).toContainText('tree');
  await expect(legend).not.toContainText('stump');
  const before = await cellColour(canvas, 16, 14);
  expect(before.g).toBeGreaterThan(before.r);
  await tapCell(page, canvas, 16, 15);
  await expect(gauges).toContainText('x16 y15, the surface');
  await tapCell(page, canvas, 16, 14);
  await expect(page.getByTestId('outcome')).toContainText('> Cut the tree north');
  await expect(gauges).toContainText('4 Timber');
  // The stump is drawn, and the block under it now shows: the cell's colour
  // goes from the tree's dark green to the dirt's brown.
  await expect(legend).toContainText('stump');
  const after = await cellColour(canvas, 16, 14);
  expect(after.r).toBeGreaterThan(after.g);
});

test('tapping the miner digs down at once; the result line says what happened', async ({
  page,
}) => {
  // Coordinator's decision on PR #74: one tap digs, as in Minecraft. The
  // miner moves down into the dug cell (issue #80: it never falls).
  const canvas = page.getByTestId('map-canvas');
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine below you: Dirt');
  await expect(page.getByTestId('outcome')).not.toContainText('fall');
  await expect(page.getByTestId('gauges')).toContainText('AP 4/5');
  await expect(page.getByTestId('gauges')).toContainText('Health 10/10');
  await expect(page.getByTestId('gauges')).toContainText('x16 y16, layer 0');
  await expect(page.getByTestId('layer-label')).toHaveText('Top layer · you are here');
});

test('no gravity (issue #80): tapping yourself over an open cell moves down; the layer above moves up', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  // Dig down twice: the miner is in layer 1, with the shaft open above it.
  await tapCell(page, canvas, 16, 16);
  await expect(gauges).toContainText('x16 y16, layer 0');
  await tapCell(page, canvas, 16, 16);
  await expect(gauges).toContainText('x16 y16, layer 1');
  // Look one layer up, and tap the miner's column there: it moves up.
  await page.getByRole('button', { name: 'Look one layer up' }).click();
  await expect(page.getByTestId('layer-label')).toHaveText('Top layer · 1 above you');
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Move up to layer 0.');
  await expect(gauges).toContainText('x16 y16, layer 0');
  // Now the cell below is open: a tap on yourself moves down into it, and
  // never up out of the hole.
  await tapCell(page, canvas, 16, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Move down to layer 1.');
  await expect(gauges).toContainText('x16 y16, layer 1');
  await expect(gauges).toContainText('Health 10/10');
  await expect(canvas).toHaveAttribute('data-pending', '');
});

/** Save a play log as the preview's saved run, reload, and wait for the resume. */
async function resumeRun(page: Page, logText: string): Promise<void> {
  await page.evaluate(
    ([key, text]) => {
      window.localStorage.setItem(key, text);
    },
    [SAVE_KEY, logText] as const,
  );
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('Resumed your saved run: seed 7.');
}

test('a yield too heavy to carry needs a second tap on the same cell; a tap elsewhere cancels it', async ({
  page,
}) => {
  // The one risky tap left since issue #80. A run whose pack is too full to
  // carry one more stone, with a stone block beside the miner (built from
  // the engine: tests/e2e/support/heavyRun.ts).
  const run = heavyRun();
  await resumeRun(page, run.logText);
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  const before = await gauges.innerText();

  await tapCell(page, canvas, run.stone.x, run.stone.y);
  await expect(page.getByTestId('map-hint')).toHaveText(
    'Tap again to mine: too heavy to carry: it will be left lying there',
  );
  await expect(canvas).toHaveAttribute('data-pending', `${run.stone.x},${run.stone.y}`);
  expect(await gauges.innerText()).toBe(before);
  // A tap anywhere else only clears the mark.
  await tapCell(page, canvas, run.stone.x + 3, run.stone.y + 3);
  await expect(canvas).toHaveAttribute('data-pending', '');
  await expect(page.getByTestId('map-hint')).toBeHidden();
  expect(await gauges.innerText()).toBe(before);
  // Two taps on the same cell: done.
  await tapCell(page, canvas, run.stone.x, run.stone.y);
  await expect(canvas).toHaveAttribute('data-pending', `${run.stone.x},${run.stone.y}`);
  await tapCell(page, canvas, run.stone.x, run.stone.y);
  await expect(page.getByTestId('outcome')).toContainText(': Stone');
  await expect(canvas).toHaveAttribute('data-pending', '');
});

test('in the hole: a tap on a neighbouring block mines it, and the open cell is walked into', async ({
  page,
}) => {
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  // One tap digs down (coordinator's decision on PR #74).
  await tapCell(page, canvas, 16, 16);
  await expect(gauges).toContainText('AP 4/5');

  // West is dirt: one tap mines it.
  await tapCell(page, canvas, 15, 16);
  await expect(page.getByTestId('outcome')).toContainText('> Mine west: Dirt');
  await expect(gauges).toContainText('AP 3/5');

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

test('the layer buttons go down from the top view, where only the block underfoot can be mined', async ({
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
  await expect(page.getByTestId('layer-label')).toHaveText('Top layer · you are here');
  await expect(page.getByRole('button', { name: 'Look one layer up' })).toBeDisabled();
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
  await page.getByText(/^All actions/).click();
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
  // Nothing was done: no action, no hint.
  await expect(gauges).toContainText('AP 5/5');
  await expect(gauges).toContainText('x16 y16, the surface');
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
  // Nothing was done, nothing panned, and no hint.
  await expect(gauges).toContainText('x16 y16, the surface');
  await expect(gauges).toContainText('AP 5/5');
  expect(await camera(canvas)).toEqual(before);
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
