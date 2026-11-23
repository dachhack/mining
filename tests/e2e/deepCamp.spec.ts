// Progression PR 6 (docs/plans/progression-phases.md, section 2.4): holding a
// camp kit, the camp tool switches to a deep camp, which is placed for the
// kit, wood and stone, and whose panel says it is never upgraded.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createFrontier, placeRefusal, saveFrontier } from '../../src/engine';
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
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    inventory: new Map([
      ['campKit', 1],
      ['wood', 20],
      ['stone', 20],
    ]),
  };
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  let spot: { x: number; y: number } | null = null;
  for (let d = 4; d < 9 && spot === null; d += 1) {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      if (spot === null && placeRefusal(state, camp.x + dx, camp.y + dy, true) === null) {
        spot = { x: camp.x + dx, y: camp.y + dy };
      }
    }
  }
  if (spot === null) throw new Error('no place for a deep camp near the first camp');
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
