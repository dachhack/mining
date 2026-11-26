// Miners (owner, after the 0.20.0 build): with 2 or more, a long press digs
// every diggable square of the 3 x 3 round it; and a tap on a planted
// sapling pulls it up without digging.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_MINERS } from '../../src/data/frontier';
import { createFrontier, digAreaPlan, plant, previewTap, saveFrontier } from '../../src/engine';
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

async function pointOf(canvas: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the map is not on screen');
  const c = Number(data['cellPx']);
  return {
    x: box.x + (x - Number(data['camX']) + 0.5) * c,
    y: box.y + (y - Number(data['camY']) + 0.5) * c,
  };
}

test('with 2 miners, a long press digs the 3 x 3 round the square, for 4 taps', async ({
  page,
}) => {
  const start: FrontierState = {
    ...createFrontier(110),
    inventory: new Map([[FRONTIER_MINERS.item, 2]]),
  };
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  // The lit square near the camp whose 3 x 3 has the most to dig.
  let best: { x: number; y: number; n: number } | null = null;
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      const x = camp.x + dx;
      const y = camp.y + dy;
      if (previewTap(start, x, y).kind !== 'mined') continue;
      const n = digAreaPlan(start, x, y).dug.length;
      if (best === null || n > best.n) best = { x, y, n };
    }
  }
  if (best === null || best.n < 4) throw new Error('a 3 x 3 with 4 or more squares to dig');
  const canvas = await openGame(page, start);
  const taps = Number(await page.getByTestId('lab2-hud').getAttribute('data-taps'));
  const at = await pointOf(canvas, best.x, best.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByTestId('lab-dug')).toHaveAttribute('data-count', String(best.n));
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-taps', String(taps - 4));
  await expect(page.getByTestId('lab-hint')).toContainText(`dug ${best.n} squares for 4 taps`);
  // Not the camp tool.
  await expect(page.getByTestId('lab2-tray')).not.toHaveAttribute('data-mode', 'placing');
});

test('a tap on a planted sapling pulls it up, back into the store, and digs nothing', async ({
  page,
}) => {
  const fresh = createFrontier(110);
  const camp = fresh.camps[0] ?? { x: 0, y: 0 };
  const width = fresh.cube.size.x;
  let at: { x: number; y: number } | null = null;
  const withSapling = { ...fresh, inventory: new Map([['mapleSapling', 1]]) };
  for (let d = 2; d <= 6 && at === null; d += 1) {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      const x = camp.x + dx;
      const y = camp.y + dy;
      if (at === null && plant(withSapling, x, y, 'mapleSapling') !== withSapling) at = { x, y };
    }
  }
  if (at === null) throw new Error('a square to plant near the camp');
  const state = plant(withSapling, at.x, at.y, 'mapleSapling');
  const canvas = await openGame(page, state);
  await expect(canvas).toHaveAttribute('data-stumps', `${at.x},${at.y}`);
  const p = await pointOf(canvas, at.x, at.y);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.getByTestId('lab-hint')).toContainText('Sapling pulled up');
  await expect(canvas).toHaveAttribute('data-stumps', '');
  await expect(page.getByTestId('lab-res-mapleSapling')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('lab-dug')).toHaveAttribute('data-count', '0');
  expect(width).toBeGreaterThan(0);
});
