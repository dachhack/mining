// The saw house (owner, after the 0.17.0 build): built from the 🪚 tool on
// one bare square, drawn on the map; and the axe's line in the market info.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SAW_HOUSE, FRONTIER_SHIFT } from '../../src/data/frontier';
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

test('the 🪚 tool builds a saw house on a bare square, and the map shows it', async ({ page }) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const width = start.cube.size.x;
  // A bare square in the camp's ring: nothing growing, no stump, no animal.
  let at: { x: number; y: number } | null = null;
  for (let d = 2; d <= 6 && at === null; d += 1) {
    for (const [dx, dy] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      const x = camp.x + dx;
      const y = camp.y + dy;
      const i = x + width * y;
      const animal = start.animals.some((a) => a.x === x && a.y === y);
      if (at === null && (start.features[i] ?? 0) === 0 && (start.stumps[i] ?? 0) === 0 && !animal)
        at = { x, y };
    }
  }
  if (at === null) throw new Error('a bare square near the camp');
  const cost = new Map(FRONTIER_SAW_HOUSE.cost.map((c) => [c.item as string, c.count + 5]));
  const canvas = await openGame(page, { ...start, inventory: cost });
  await expect(canvas).toHaveAttribute('data-saw-houses', '');
  await page.getByTestId('lab2-saw-tool').click();
  await expect(page.getByTestId('lab2-saw-line')).toContainText('wood a tree within');
  // The camp's own ground says no, and builds nothing.
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab-hint')).toContainText('camp');
  await tapSquare(page, canvas, at.x, at.y);
  await expect(canvas).toHaveAttribute('data-saw-houses', `${at.x},${at.y}`);
  await expect(page.getByTestId('lab-hint')).toContainText('Saw house built');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );
  for (const c of FRONTIER_SAW_HOUSE.cost) {
    await expect(page.getByTestId(`lab-res-${c.item}`)).toHaveAttribute('data-count', '5');
  }
  // A tap on it afterwards mines nothing, and says what it is.
  await tapSquare(page, canvas, at.x, at.y);
  await expect(page.getByTestId('lab-hint')).toContainText('A saw house');
});
