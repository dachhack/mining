// Grains and vegetables (owner, after the 0.19.0 build): sown from the 🌱
// tool, left be while they grow, harvested with a tap once ripe.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_CROPS } from '../../src/data/frontier';
import { createFrontier, saveFrontier } from '../../src/engine';
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

/** A bare square of dirt near the camp: nothing growing, no stump, no animal. */
function bareSquare(state: FrontierState): { x: number; y: number } {
  const camp = state.camps[0] ?? { x: 0, y: 0 };
  const width = state.cube.size.x;
  for (let d = 2; d <= 6; d += 1) {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      const x = camp.x + dx;
      const y = camp.y + dy;
      const i = x + width * y;
      const animal = state.animals.some((a) => a.x === x && a.y === y);
      if ((state.features[i] ?? 0) === 0 && (state.stumps[i] ?? 0) === 0 && !animal)
        return { x, y };
    }
  }
  throw new Error('a bare square near the camp');
}

test('a seed is sown from 🌱, left be while it grows, and harvested once ripe', async ({
  page,
}) => {
  const start = createFrontier(110);
  const at = bareSquare(start);
  const carrot = FRONTIER_CROPS.find((c) => c.crop === 'carrot');
  if (carrot === undefined) throw new Error('carrots in the data');
  const canvas = await openGame(page, { ...start, inventory: new Map([['carrotSeed', 2]]) });
  await page.getByTestId('lab2-place-tool').click();
  await page.getByTestId('lab2-plant-tool').click();
  await expect(page.getByTestId('lab2-plant-carrotSeed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab2-plant-line')).toContainText(`ripe in ${carrot.growShifts}`);
  // Only what is held is offered.
  await expect(page.getByTestId('lab2-plant-sapling')).toHaveCount(0);
  await tapSquare(page, canvas, at.x, at.y);
  await expect(canvas).toHaveAttribute('data-crops', `${at.x},${at.y}:carrot`);
  await page.getByTestId('lab2-plant-cancel').click();
  // Growing: a tap says so and digs nothing.
  await tapSquare(page, canvas, at.x, at.y);
  await expect(page.getByTestId('lab-hint')).toContainText('Still growing');
  await expect(canvas).toHaveAttribute('data-crops', `${at.x},${at.y}:carrot`);

  // A run saved with the crop ripe: a tap harvests it.
  const width = start.cube.size.x;
  const i = at.x + width * at.y;
  const k = FRONTIER_CROPS.indexOf(carrot) + 1;
  const ripe: FrontierState = {
    ...start,
    crops: start.crops.map((c, j) => (j === i ? k : c)),
    cropIn: start.cropIn.map((c, j) => (j === i ? 0 : c)),
  };
  const field = await openGame(page, ripe);
  await expect(field).toHaveAttribute('data-crops', `${at.x},${at.y}:carrot:ripe`);
  await tapSquare(page, field, at.x, at.y);
  await expect(field).toHaveAttribute('data-crops', '');
  await expect(page.getByTestId('lab-res-carrot')).toHaveAttribute(
    'data-count',
    String(carrot.yield),
  );
});
