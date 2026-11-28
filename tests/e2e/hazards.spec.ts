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
  const dragons = [{ id: 1, x: at.x, y: at.y, dx: 1, dy: 0, restTaps: 3 }];
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

test('a dragon attacks after a tap, and the hint says so (owner, after the 0.25.0 build)', async ({
  page,
}) => {
  // "They fly to trees, grass, or animals and set them on fire or eat them on every 1-3 taps."
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  // About to attack: 1 tap of rest left.
  const dragons = [{ id: 1, x: camp.x + 4, y: camp.y + 4, dx: 1, dy: 0, restTaps: 1 }];
  const state: FrontierState = {
    ...start,
    hazards: { ...start.hazards, dragons, nextDragonId: 2 },
    inventory: new Map([['grass', 9]]),
  };
  await openGame(page, state);
  // Making hay is a tap like any other.
  await page.getByTestId('lab2-book').click();
  await page.getByTestId('lab2-recipe-make-hay').click();
  await page.getByTestId('lab2-book-close').click();
  await expect(page.getByTestId('lab-hint')).toContainText('🐉 A dragon');
});

test('making in the recipe book: the row says how many you have, and shows what was just made', async ({
  page,
}) => {
  // Owner, after the 0.28.0 build: "it is not obvious when it is made and it
  // would be good to see how many you have in the item make chip".
  const start = createFrontier(110);
  const state: FrontierState = {
    ...start,
    inventory: new Map([
      ['grass', 9],
      ['hay', 4],
    ]),
  };
  await openGame(page, state);
  await page.getByTestId('lab2-book').click();
  const have = page.getByTestId('lab2-recipe-have-hay');
  await expect(have).toHaveText('Have 4');
  await expect(have).toHaveAttribute('data-count', '4');
  await page.getByTestId('lab2-recipe-make-hay').click();
  // The row's count goes up, says by how much, and the row is marked as just made.
  await expect(have).toHaveText('Have 5 (+1)');
  await expect(have).toHaveAttribute('data-count', '5');
  await expect(page.getByTestId('lab2-recipe-hay')).toHaveAttribute('data-made', 'true');
  await expect(page.getByTestId('lab2-book-note')).toHaveText('✓ Made 1 hay. You have 5.');
  // Again: the mark is on the row made last, the count is right.
  await page.getByTestId('lab2-recipe-make-hay').click();
  await expect(have).toHaveText('Have 6 (+1)');
  // A row not just made says only what is held.
  await page.getByTestId('lab2-book-close').click();
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-have-hay')).toHaveText('Have 6');
  await expect(page.getByTestId('lab2-recipe-hay')).toHaveAttribute('data-made', 'false');
});

test('a dragon off the screen is pointed at from the map edge (owner, after the 0.26.0 build)', async ({
  page,
}) => {
  // "The dragon showed up but I couldn't see it."
  const start = createFrontier(110);
  const dragons = [{ id: 1, x: 0, y: 0, dx: 1, dy: 0, restTaps: 3 }];
  const state: FrontierState = {
    ...start,
    hazards: { ...start.hazards, dragons, nextDragonId: 2 },
  };
  const canvas = await openGame(page, state);
  await expect(canvas).toHaveAttribute('data-dragons', '0,0');
  await expect(canvas).toHaveAttribute('data-dragon-pointers', '1');
  // On the screen, it is drawn where it is, fog or not: no pointer.
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const near = [{ id: 1, x: camp.x + 5, y: camp.y + 5, dx: 1, dy: 0, restTaps: 3 }];
  const shown = await openGame(page, {
    ...start,
    hazards: { ...start.hazards, dragons: near, nextDragonId: 2 },
  });
  await expect(shown).toHaveAttribute('data-dragon-pointers', '0');
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
  await expect(canvas).toHaveAttribute('data-defenses', '1:0');
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await expect(page.getByTestId('lab2-camp-defense')).toContainText('No defenses · 0/4');
  await page.getByTestId('lab2-build-defense').click();
  await expect(page.getByTestId('lab2-camp-defense')).toContainText('Palisade · 1/4');
  // The camp's marker shows it: a palisade round it and a shield with 1.
  await expect(canvas).toHaveAttribute('data-defenses', '1:1');
  await expect(page.getByTestId('lab-res-wood')).toHaveAttribute('data-count', '15');
  // The next level needs stone, which the store does not hold.
  await expect(page.getByTestId('lab2-build-defense')).toBeDisabled();
});

test('a rainy night shows rain falling, and its news one line at a time (hazards PR 1)', async ({
  page,
}) => {
  // Owner, on the hazards build: "We need a rain scene for when it rains."
  // Find a seed and shift whose night rains: End shift from shift 1 until one does.
  const state: FrontierState = {
    ...createFrontier(110),
    inventory: new Map([
      ['wood', 50],
      ['apple', 50],
    ]),
  };
  await openGame(page, state);
  const night = page.getByTestId('lab2-night');
  let rained = false;
  for (let k = 0; k < 30 && !rained; k += 1) {
    await page.getByTestId('lab2-end-shift').click();
    await expect(night).toBeVisible();
    rained = (await night.getAttribute('data-rain')) === 'true';
    if (rained) {
      await expect(page.getByTestId('lab2-night-rain')).toBeVisible();
      await expect(night).toContainText('Rain 🌧');
    } else {
      await expect(page.getByTestId('lab2-night-rain')).toHaveCount(0);
    }
    // Each sentence of the news is a line of its own.
    expect(await page.getByTestId('lab2-night-summary').locator('p').count()).toBeGreaterThan(0);
    await night.click();
    await expect(night).toHaveCount(0);
    // A market day's market opens after the night: close it to go on.
    const close = page.getByTestId('lab2-market-close');
    if ((await close.count()) > 0 && (await close.isVisible())) await close.click();
  }
  expect(rained).toBe(true);
});

test('setting a pump and putting a fire out redraw the ground, so the map shows them', async ({
  page,
}) => {
  // Owner, on the hazards build: "Can't see pump when you set it down." The
  // ground is drawn once and kept; a change to the hazards alone must draw
  // it again.
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const width = start.cube.size.x;
  // Two bare squares in the camp's ring: nothing growing and no animal, so
  // a tap meets the water or the fire first.
  const bare: { x: number; y: number }[] = [];
  for (let d = 2; d <= 5 && bare.length < 2; d += 1) {
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
      if ((start.features[i] ?? 0) === 0 && !animal && bare.length < 2) bare.push({ x, y });
    }
  }
  const [wet, hot] = bare;
  if (wet === undefined || hot === undefined) throw new Error('two bare squares near the camp');
  const state: FrontierState = {
    ...start,
    inventory: new Map([['pump', 1]]),
    hazards: {
      ...start.hazards,
      flooded: start.hazards.flooded.map((_, i) => i === wet.x + width * wet.y),
      fires: start.hazards.fires.map((_, i) => i === hot.x + width * hot.y),
    },
  };
  const canvas = await openGame(page, state);
  const draws = async (): Promise<number> => Number(await canvas.getAttribute('data-ground-draws'));
  const before = await draws();
  await tapSquare(page, canvas, wet.x, wet.y);
  await expect(canvas).toHaveAttribute('data-pumps', `${wet.x},${wet.y}`);
  await expect.poll(draws).toBeGreaterThan(before);
  const afterPump = await draws();
  await tapSquare(page, canvas, hot.x, hot.y);
  await expect(canvas).toHaveAttribute('data-fires', '');
  await expect.poll(draws).toBeGreaterThan(afterPump);
});
