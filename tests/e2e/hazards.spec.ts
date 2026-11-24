// Hazards (docs/plans/hazards.md): what the screen shows of them. A run is
// saved with the hazard in it and opened as the game opens any run.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
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

test('a fire on the map is put out with a tap (hazards PR 3)', async ({ page }) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const at = { x: camp.x + 3, y: camp.y };
  const width = start.cube.size.x;
  const fires = start.hazards.fires.map((_, i) => i === at.x + width * at.y);
  const state: FrontierState = { ...start, hazards: { ...start.hazards, fires } };
  const canvas = await openGame(page, state);
  await expect(canvas).toHaveAttribute('data-fires', `${at.x},${at.y}`);
  await tapSquare(page, canvas, at.x, at.y);
  await expect(canvas).toHaveAttribute('data-fires', '');
  await expect(page.getByTestId('lab-hint')).toContainText('Fire put out');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 1),
  );
});

test('a dragon needs a sword; with one, a tap drives it off (hazards PR 4)', async ({ page }) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const at = { x: camp.x + 3, y: camp.y };
  const dragons = [{ id: 1, x: at.x, y: at.y }];
  const state: FrontierState = {
    ...start,
    hazards: { ...start.hazards, dragons, nextDragonId: 2 },
  };
  const canvas = await openGame(page, state);
  await expect(canvas).toHaveAttribute('data-dragons', `${at.x},${at.y}`);
  await tapSquare(page, canvas, at.x, at.y);
  await expect(page.getByTestId('lab-hint')).toContainText('A dragon');
  await expect(canvas).toHaveAttribute('data-dragons', `${at.x},${at.y}`);

  const armed = await openGame(page, { ...state, inventory: new Map([['sword', 1]]) });
  await tapSquare(page, armed, at.x, at.y);
  await expect(armed).toHaveAttribute('data-dragons', '');
  await expect(page.getByTestId('lab-hint')).toContainText('drove the dragon off');
});

test('a level-2 camp builds its defenses from its panel (hazards PR 5)', async ({ page }) => {
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 2 })),
    inventory: new Map([['wood', 30]]),
  };
  const camp = state.camps[0] ?? { x: 0, y: 0 };
  const canvas = await openGame(page, state);
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await expect(page.getByTestId('lab2-camp-defense')).toContainText('No defenses · 0/3');
  await page.getByTestId('lab2-build-defense').click();
  await expect(page.getByTestId('lab2-camp-defense')).toContainText('Palisade · 1/3');
  await expect(page.getByTestId('lab-res-wood')).toHaveAttribute('data-count', '15');
  // The next level needs stone, which the store does not hold.
  await expect(page.getByTestId('lab2-build-defense')).toBeDisabled();
});
