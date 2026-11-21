// UI lab 2 (issue #118): fog around camps, placing and upgrading camps, at
// phone size (390 x 844).
//
// What each tap should do is worked out here with the same lab code the
// build runs (campWorld.ts): the engine is deterministic, so the page and
// this file play the same world. Seed 110 opens with its first camp near
// the middle of the screen, its whole ring and a little fog in view.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { LAB_NEW_CAMP_COST } from '../../src/data/labCamps';
import {
  PREPARED_LAB2_KEY,
  campRadius,
  demolishCamp,
  footprintOf,
  placeCamp,
  placeRefusal,
  campTap,
  newCampWorld,
  newlyCovered,
  sightMap,
} from '../../src/app/lab/campWorld';
import type { CampWorld } from '../../src/app/lab/campWorld';
import { planUpgrade, tapsUntil } from './campPlan';
import type { Square } from './campPlan';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 110;
/**
 * The upgrade test's seed: there, leapfrogging camps and then upgrading
 * them to level 2 (see `planUpgrade`) uncovers ore next to the first camp.
 */
const UPGRADE_SEED = 10;

/** The square at the map's top-left corner and the size of a square, from the canvas's data- attributes. */
async function camera(canvas: Locator): Promise<{ x: number; y: number; cellPx: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return { x: Number(data['camX']), y: Number(data['camY']), cellPx: Number(data['cellPx']) };
}

/** Where the middle of square (x, y) is on the page. */
async function pointOf(canvas: Locator, square: Square): Promise<{ x: number; y: number }> {
  const cam = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  return {
    x: box.x + (square.x - cam.x + 0.5) * cam.cellPx,
    y: box.y + (square.y - cam.y + 0.5) * cam.cellPx,
  };
}

/** Tap square (x, y), as a finger would. */
async function tapSquare(page: Page, canvas: Locator, square: Square): Promise<void> {
  const point = await pointOf(canvas, square);
  await page.touchscreen.tap(point.x, point.y);
}

/** The mean brightness (0 to 255) of the middle of square (x, y), read from the canvas. */
async function brightness(canvas: Locator, square: Square): Promise<number> {
  return canvas.evaluate((el, at) => {
    const c = el as HTMLCanvasElement;
    const scale = c.width / c.clientWidth;
    const cell = Number(c.dataset['cellPx']) * scale;
    const left = (at.x - Number(c.dataset['camX'])) * cell;
    const top = (at.y - Number(c.dataset['camY'])) * cell;
    const ctx = c.getContext('2d');
    if (ctx === null) {
      return -1;
    }
    const data = ctx.getImageData(
      Math.round(left + cell * 0.2),
      Math.round(top + cell * 0.2),
      Math.round(cell * 0.6),
      Math.round(cell * 0.6),
    ).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
    }
    return sum / (data.length / 4) / 3;
  }, square);
}

/** The counts the counter shows: 'dug' and one entry per resource chip. */
async function counts(page: Page): Promise<Record<string, number>> {
  return page.getByTestId('lab-counter').evaluate((el) => {
    const shown: Record<string, number> = {};
    for (const chip of Array.from(el.children)) {
      const id = (chip as HTMLElement).dataset['testid'] ?? '';
      shown[id === 'lab-dug' ? 'dug' : id.replace('lab-res-', '')] = Number(
        (chip as HTMLElement).dataset['count'],
      );
    }
    return shown;
  });
}

/** The counts the counter should show for a world. */
function expectedCounts(world: CampWorld): Record<string, number> {
  const shown: Record<string, number> = { dug: world.lab.mined };
  for (const [item, count] of world.lab.counts) {
    shown[item] = count;
  }
  return shown;
}

/** How many squares of a world are lit. */
function shownOf(world: CampWorld): number {
  return sightMap(world).filter((s) => s === 'shown').length;
}

/** Open Lab 2 on `SEED` and wait for its map. */
async function openLab2(page: Page): Promise<Locator> {
  await page.goto(`/#lab2/${SEED}`);
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  return page.getByTestId('lab-map');
}

/** A fog square on screen: straight east of the first camp, just past its ring. */
function fogSquare(world: CampWorld): Square {
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  return { x: camp.x + campRadius(1) + 1, y: camp.y };
}

test('the start screen leads to lab 2, which opens in fog round one camp', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('launch-lab2').click();
  await expect(page.getByTestId('lab2')).toBeVisible();
  const canvas = page.getByTestId('lab-map');
  const world = newCampWorld(Number((await page.getByTestId('lab-seed').textContent())?.slice(5)));
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(world)));
  await expect(canvas).toHaveAttribute('data-camps', '1');
  await expect(canvas).toHaveAttribute('data-greyed', '0');
  // Lab 1 is still there beside it.
  await page.getByRole('button', { name: 'Back to the start screen' }).click();
  await expect(page.getByTestId('launch-lab1')).toBeVisible();
});

test('a tap inside the ring mines; a tap in the fog does nothing', async ({ page }) => {
  const canvas = await openLab2(page);
  let world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const fog = fogSquare(world);
  const lit = { x: camp.x + 2, y: camp.y }; // just outside the camp's 3 x 3

  // The fog square is dark; a lit square is not.
  expect(await brightness(canvas, fog)).toBeLessThan(30);
  expect(await brightness(canvas, lit)).toBeGreaterThan(60);

  const tap = campTap(world, lit.x, lit.y);
  expect(tap.kind).toBe('mined');
  world = tap.world;
  await tapSquare(page, canvas, lit);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${lit.x},${lit.y}`);
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));

  const hintBefore = await page.getByTestId('lab-hint').textContent();
  const before = await counts(page);
  expect(campTap(world, fog.x, fog.y).kind).toBe('fog');
  await tapSquare(page, canvas, fog);
  await expect(canvas).toHaveAttribute('data-last-tap', `fog ${fog.x},${fog.y}`);
  expect(await counts(page)).toEqual(before);
  await expect(page.getByTestId('lab-hint')).toHaveText(hintBefore ?? '');
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
});

test('a second camp on level ground lifts the fog; then the first is demolished and dug under', async ({
  page,
}) => {
  const canvas = await openLab2(page);
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  // The new camp's 3 x 3 goes just inside the east edge of the first ring,
  // so its ring also covers the first camp's base. Its patch is left undug.
  const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
  const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y));
  expect(plan).not.toBeNull();
  if (plan === null) return;

  // At the start, the first camp cannot be demolished: nothing else covers it.
  await tapSquare(page, canvas, camp);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await page.getByTestId('lab2-demolish').click();
  await expect(page.getByTestId('lab-hint')).toContainText(
    'Build another camp that covers this one first',
  );
  await expect(canvas).toHaveAttribute('data-camps', '1');
  await page.getByTestId('lab2-camp-close').click();

  // Before mining: the tool shows the cost as not yet affordable, and confirming is off.
  await expect(page.getByTestId('lab2-camp-tool')).toHaveClass(/lab2-tool-short/);
  await page.getByTestId('lab2-camp-tool').click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await tapSquare(page, canvas, target);
  for (const stack of LAB_NEW_CAMP_COST) {
    await expect(page.getByTestId(`lab2-cost-${stack.item}`)).toHaveClass(/lab2-cost-short/);
  }
  await expect(page.getByTestId('lab2-place-confirm')).toBeDisabled();
  await page.getByTestId('lab2-place-cancel').click();

  for (const square of plan.taps) {
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute('data-last-tap', `mined ${square.x},${square.y}`);
  }
  await expect.poll(() => counts(page)).toEqual(expectedCounts(plan.world));

  // A patch the mining left uneven is refused, with its own cue.
  const uneven = plan.taps.find((sq) => placeRefusal(plan.world, sq.x, sq.y) === 'notLevel');
  expect(uneven).toBeDefined();
  await page.getByTestId('lab2-camp-tool').click();
  if (uneven !== undefined) {
    await tapSquare(page, canvas, uneven);
    await expect(page.getByTestId('lab2-place-line')).toContainText('Ground not level');
    await expect(page.getByTestId('lab2-place-confirm')).toBeDisabled();
  }

  // The level patch: the square past the first ring is fog now.
  const beyond = { x: camp.x + campRadius(1) + 1, y: camp.y };
  expect(await brightness(canvas, beyond)).toBeLessThan(30);
  const fresh = newlyCovered(plan.world, target.x, target.y).length;
  await tapSquare(page, canvas, target);
  await expect(page.getByTestId('lab2-place-line')).toContainText(
    `level ground · lights ${fresh} new squares`,
  );
  for (const stack of LAB_NEW_CAMP_COST) {
    await expect(page.getByTestId(`lab2-cost-${stack.item}`)).toContainText(
      `${stack.count}/${stack.count}`,
    );
  }
  await expect(page.getByTestId('lab2-place-confirm')).toBeEnabled();
  await page.getByTestId('lab2-place-confirm').click();

  await expect(canvas).toHaveAttribute('data-camps', '2');
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(plan.world) + fresh));
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
  await page.waitForTimeout(1000); // let the ring finish spreading
  expect(await brightness(canvas, beyond)).toBeGreaterThan(40);
  // The camp's cost was paid.
  const paid = await counts(page);
  for (const stack of LAB_NEW_CAMP_COST) {
    expect(paid[stack.item] ?? 0).toBe((plan.world.lab.counts.get(stack.item) ?? 0) - stack.count);
  }

  // Now the second camp covers the first one's base: demolish the first...
  await tapSquare(page, canvas, camp);
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Camp 1');
  await page.getByTestId('lab2-demolish').click();
  await expect(canvas).toHaveAttribute('data-camps', '1');
  await expect(page.getByTestId('lab-hint')).toContainText('Camp demolished');
  expect(await counts(page)).toEqual(paid); // no refund

  // ...and dig where it stood: all nine squares, then the middle once more.
  let world = placeCamp(plan.world, target.x, target.y);
  world = demolishCamp(world, 1);
  const digs = [...footprintOf(camp.x, camp.y), { x: camp.x, y: camp.y }];
  for (const square of digs) {
    const tap = campTap(world, square.x, square.y);
    expect(tap.kind, `${square.x},${square.y}`).toBe('mined');
    world = tap.world;
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute('data-last-tap', `mined ${square.x},${square.y}`);
  }
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
});

test('upgrading a camp widens its ring and lets it mine a harder block', async ({ page }) => {
  const plan = planUpgrade(UPGRADE_SEED);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  await page.goto('/#game');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    PREPARED_LAB2_KEY,
    JSON.stringify({ seed: plan.seed, steps: plan.steps }),
  ] as const);
  await page.goto('/#lab2');
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${UPGRADE_SEED} · prepared`);
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(plan.world)));

  // The ore is too hard for the level-2 camp over it: a cue unlike "too steep".
  await tapSquare(page, canvas, plan.ore);
  await expect(canvas).toHaveAttribute('data-last-tap', `tooHard ${plan.ore.x},${plan.ore.y}`);
  await expect(page.getByTestId('lab-hint')).toContainText('needs a level 3 camp');
  await expect(page.getByTestId('lab-hint')).toHaveClass(/lab2-hint-hard/);

  // Tap the camp: its panel, with its level, ring and the upgrade's cost.
  await tapSquare(page, canvas, plan.camp);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await expect(page.getByTestId('lab2-camp-title')).toContainText(`Camp ${plan.campId} · Level 2`);
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(2)}`);
  await page.getByTestId('lab2-upgrade').click();
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 3');
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(3)}`);
  await expect(page.getByTestId('lab2-camp-line')).toContainText('Iron ore');
  expect(Number(await canvas.getAttribute('data-shown'))).toBeGreaterThan(shownOf(plan.world));

  // Now the ore can be mined.
  await tapSquare(page, canvas, plan.ore);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${plan.ore.x},${plan.ore.y}`);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
});

test('the map never moves while the tool and the panels open and close', async ({ page }) => {
  const canvas = await openLab2(page);
  const world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const before = await canvas.boundingBox();
  const tray = await page.getByTestId('lab2-tray').boundingBox();
  if (before === null) {
    throw new Error('the map is not on screen');
  }
  const unmoved = async (): Promise<void> => {
    expect(await canvas.boundingBox()).toEqual(before);
    expect(await page.getByTestId('lab2-tray').boundingBox()).toEqual(tray);
  };

  // Every tap aims at where the square was before the first step, as a
  // finger would: if the map had moved, the tap would land elsewhere.
  const cam = await camera(canvas);
  const tapFixed = async (square: Square): Promise<void> => {
    await page.touchscreen.tap(
      before.x + (square.x - cam.x + 0.5) * cam.cellPx,
      before.y + (square.y - cam.y + 0.5) * cam.cellPx,
    );
  };

  await tapFixed(camp); // the camp's panel
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await unmoved();
  await page.getByTestId('lab2-camp-close').click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
  await unmoved();

  await page.getByTestId('lab2-camp-tool').click(); // the camp tool
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await unmoved();
  await tapFixed({ x: camp.x + 4, y: camp.y }); // a target: the preview and the confirm bar
  await expect(page.getByTestId('lab2-place-line')).toContainText('lights');
  await unmoved();
  await page.getByTestId('lab2-place-cancel').click();
  await unmoved();

  // A refused tap (fog), a mine, and a too-steep refusal: still no movement.
  await tapFixed(fogSquare(world));
  await expect(canvas).toHaveAttribute('data-last-tap', /^fog /);
  const lit = { x: camp.x - 2, y: camp.y }; // just outside the camp's 3 x 3
  await tapFixed(lit);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${lit.x},${lit.y}`);
  await tapFixed(lit);
  await expect(canvas).toHaveAttribute('data-last-tap', `refused ${lit.x},${lit.y}`);
  await page.waitForTimeout(400); // let the shake finish
  await unmoved();
});

test('holding a lit square opens the camp tool on it, and mines nothing', async ({ page }) => {
  const canvas = await openLab2(page);
  const world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const square = { x: camp.x + 4, y: camp.y }; // the middle of a level, lit 3 x 3
  const at = await pointOf(canvas, square);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await expect(page.getByTestId('lab2-place-line')).toContainText(`At ${square.x}, ${square.y}`);
  expect((await counts(page))['dug']).toBe(0);
});
