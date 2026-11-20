// Fingers on the map (issue #88 item 4; issue #110): one finger drags the
// map, two fingers pinch it, and neither is a tap. The touches are sent
// through the browser's own touch input (the Chrome DevTools Protocol), so
// the page gets the pointer events a phone would give it.
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { mapCamera, squareCentre } from './mapHelpers';

test.use({ viewport: { width: 390, height: 844 } });

interface Finger {
  x: number;
  y: number;
  id: number;
}

/** Send one touch event with these fingers down (none for the end of a gesture). */
async function touch(
  client: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  fingers: Finger[],
): Promise<void> {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: fingers.map((finger) => ({ x: finger.x, y: finger.y, id: finger.id })),
  });
}

async function startRun(page: Page, seed: number): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(seed));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${seed}`);
}

test('one finger drags the map, and the drag is not a tap', async ({ page }) => {
  await startRun(page, 110);
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  const before = await mapCamera(canvas);
  const start = await squareCentre(canvas, before.x + 8, before.y + 8);
  const client = await page.context().newCDPSession(page);

  // Drag three squares to the left and two up, in steps, as a finger moves.
  await touch(client, 'touchStart', [{ ...start, id: 0 }]);
  for (let step = 1; step <= 6; step += 1) {
    await touch(client, 'touchMove', [
      {
        x: start.x - (step / 6) * 3 * before.cellPx,
        y: start.y - (step / 6) * 2 * before.cellPx,
        id: 0,
      },
    ]);
  }
  await touch(client, 'touchEnd', []);

  // The map followed the finger: the camera moved three right and two down.
  const after = await mapCamera(canvas);
  expect(after.x).toBeCloseTo(before.x + 3, 1);
  expect(after.y).toBeCloseTo(before.y + 2, 1);
  expect(after.cells).toBe(before.cells);
  // Nothing was mined or cut, and nothing is said of a tap.
  await expect(gauges).toContainText('AP 5/5');
  await expect(page.getByTestId('outcome')).toBeHidden();
});

test('two fingers pinch the map: apart zooms in, together zooms out, and neither is a tap', async ({
  page,
}) => {
  await startRun(page, 110);
  const canvas = page.getByTestId('map-canvas');
  const gauges = page.getByTestId('gauges');
  const before = await mapCamera(canvas);
  expect(before.cells).toBe(14);
  // The square under the middle of the pinch should stay under it.
  const middle = await squareCentre(canvas, before.x + 7, before.y + 7);
  const client = await page.context().newCDPSession(page);

  /** Pinch about `middle`: the fingers start `from` pixels apart and end `to` apart. */
  async function pinch(from: number, to: number): Promise<void> {
    const fingers = (apart: number): Finger[] => [
      { x: middle.x - apart / 2, y: middle.y, id: 0 },
      { x: middle.x + apart / 2, y: middle.y, id: 1 },
    ];
    await touch(client, 'touchStart', fingers(from));
    for (let step = 1; step <= 6; step += 1) {
      await touch(client, 'touchMove', fingers(from + ((to - from) * step) / 6));
    }
    await touch(client, 'touchEnd', []);
  }

  // Fingers 1.5 times as far apart: two thirds as many squares across.
  await pinch(100, 150);
  const zoomedIn = await mapCamera(canvas);
  expect(zoomedIn.cells).toBeCloseTo(14 / 1.5, 1);
  expect(zoomedIn.cellPx).toBeGreaterThan(before.cellPx);
  // The middle square is still in the middle.
  expect(zoomedIn.x + zoomedIn.cells / 2).toBeCloseTo(before.x + 7.5, 0);
  await expect(page.getByTestId('map-label')).toContainText('9 of 32 squares across');

  // Fingers together again, and further: out to the whole map and no further.
  await pinch(240, 40);
  const zoomedOut = await mapCamera(canvas);
  expect(zoomedOut.cells).toBe(32);
  await expect(page.getByTestId('map-label')).toContainText('The whole map');

  // No pinch was a tap.
  await expect(gauges).toContainText('AP 5/5');
  await expect(page.getByTestId('outcome')).toBeHidden();
  // The zoom is remembered on this device.
  const saved = await page.evaluate(() => window.localStorage.getItem('mining-game.preview.zoom'));
  expect(Number(saved)).toBe(32);
});
