// UI lab 2 (issues #118 and #121): fog around camps, placing and upgrading
// camps, and the surface (grass, trees, animals, clay), at phone size
// (390 x 844).
//
// What each tap should do is worked out here with the same lab code the
// build runs (campWorld.ts): the engine and the surface are deterministic,
// so the page and this file play the same world. The page's clock is
// installed and paused (Playwright's `page.clock`), so the animals stand
// still while a test taps, and a test moves them by running the clock.
// Seed 110 opens with its first camp near the middle of the screen, its
// whole ring and a little fog in view.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { LAB_NEW_CAMP_COST, LAB_SURFACE } from '../../src/data/labCamps';
import {
  PREPARED_LAB2_KEY,
  advanceWorld,
  upgradeCostFrom,
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
import { GRASS, TREE } from '../../src/app/lab/surface';
import { planLevel2, tapsUntil } from './campPlan';
import type { Square } from './campPlan';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 110;

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

/**
 * Stop the page's clock before it opens, so the lab clock reads 0 and the
 * animals stand still until a test runs the clock on (`page.clock.runFor`).
 */
async function pauseClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-11-21T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-21T12:00:01Z'));
}

/** Open Lab 2 on `SEED`, with its clock paused, and wait for its map. */
async function openLab2(page: Page): Promise<Locator> {
  await pauseClock(page);
  await page.goto(`/#lab2/${SEED}`);
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  return page.getByTestId('lab-map');
}

/**
 * Tap `square` until it is mined: the first taps take whatever grows on it
 * (grass, a tree, apples), as the page must. Each tap is checked against
 * the same tap in `world`, which is returned as it is afterwards.
 */
async function digOnce(
  page: Page,
  canvas: Locator,
  world: CampWorld,
  square: Square,
): Promise<CampWorld> {
  let w = world;
  for (let i = 0; i < 6; i += 1) {
    const tap = campTap(w, square.x, square.y);
    w = tap.world;
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute('data-last-tap', `${tap.kind} ${square.x},${square.y}`);
    if (tap.kind === 'mined') {
      return w;
    }
    expect(tap.kind).toBe('harvested');
  }
  throw new Error(`square ${square.x},${square.y} was never mined`);
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

test('the key fits the tray: no entry is cut by its fixed height', async ({ page }) => {
  // Review of PR #122: with the surface's kinds added, a third row of the key
  // was cut in half by the tray. Seed 110 opens with seven kinds in sight.
  await openLab2(page);
  const key = page.getByTestId('lab2-tray').locator('.lab-key');
  await expect(key.locator('.lab-key-entry')).toHaveCount(7);
  const fit = await key.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const entries = Array.from(el.children).map((child) => child.getBoundingClientRect());
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      // Every entry lies fully inside the key, top to bottom.
      inside: entries.every((e) => e.top >= box.top - 0.5 && e.bottom <= box.bottom + 0.5),
    };
  });
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight);
  expect(fit.inside).toBe(true);
});

test('a tap inside the ring takes or mines; a tap in the fog does nothing', async ({ page }) => {
  const canvas = await openLab2(page);
  let world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const fog = fogSquare(world);
  const lit = { x: camp.x + 2, y: camp.y }; // just outside the camp's 3 x 3

  // The fog square is dark; a lit square is not.
  expect(await brightness(canvas, fog)).toBeLessThan(30);
  expect(await brightness(canvas, lit)).toBeGreaterThan(60);

  world = await digOnce(page, canvas, world, lit);
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

test('grass is cut, a tree felled, and an animal caught as it wanders', async ({ page }) => {
  const canvas = await openLab2(page);
  let world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const width = world.lab.state.size.x;
  const sights = sightMap(world);
  /** The lit square nearest the camp with `feature` on it, and no animal. */
  const nearest = (feature: number): Square => {
    let best: Square | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < sights.length; i += 1) {
      const sq = { x: i % width, y: Math.floor(i / width) };
      const free = !world.surface.animals.some((a) => a.x === sq.x && a.y === sq.y);
      const distance = Math.abs(sq.x - camp.x) + Math.abs(sq.y - camp.y);
      if (
        sights[i] === 'shown' &&
        world.surface.features[i] === feature &&
        free &&
        distance < bestDistance
      ) {
        best = sq;
        bestDistance = distance;
      }
    }
    if (best === null) throw new Error('nothing to harvest in the ring');
    return best;
  };

  const grass = nearest(GRASS);
  const tree = nearest(TREE);
  for (const square of [grass, tree]) {
    const tap = campTap(world, square.x, square.y);
    expect(tap.kind).toBe('harvested');
    world = tap.world;
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute('data-last-tap', `harvested ${square.x},${square.y}`);
  }
  await expect(page.getByTestId('lab-res-grass')).toHaveAttribute(
    'data-count',
    String(LAB_SURFACE.grassPerTuft),
  );
  await expect(page.getByTestId('lab-res-wood')).toHaveAttribute(
    'data-count',
    String(LAB_SURFACE.woodPerTree),
  );

  // Run the clock until an animal stands on lit ground, then tap it.
  let time = 0;
  let animal: Square | null = null;
  while (animal === null) {
    time += 2_000;
    expect(time).toBeLessThan(120_000);
    const later = advanceWorld(world, time);
    const lit = sightMap(later);
    animal = later.surface.animals.find((a) => lit[a.x + width * a.y] === 'shown') ?? null;
  }
  await page.clock.runFor(time);
  await expect(canvas).toHaveAttribute('data-lab-time', String(time));
  world = advanceWorld(world, time);
  const animalsBefore = world.surface.animals.length;
  await expect(canvas).toHaveAttribute(
    'data-animals',
    world.surface.animals.map((a) => `${a.x},${a.y}`).join(' '),
  );
  await tapSquare(page, canvas, animal);
  await expect(canvas).toHaveAttribute('data-last-tap', `harvested ${animal.x},${animal.y}`);
  await expect(page.getByTestId('lab-res-animal')).toHaveAttribute('data-count', '1');
  await expect(page.getByTestId('lab-hint')).toContainText('Animal caught');
  const left = (await canvas.getAttribute('data-animals')) ?? '';
  expect(left.split(' ').filter((t) => t !== '')).toHaveLength(animalsBefore - 1);
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

  // Cutting, felling and digging: each tap either takes something or mines.
  for (const square of plan.taps) {
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute(
      'data-last-tap',
      new RegExp(`^(harvested|mined) ${square.x},${square.y}$`),
    );
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

  // Dig for clay: the taps nearest the camp until one gives clay.
  let world = placeCamp(plan.world, target.x, target.y);
  const clayBefore = world.lab.counts.get('clay') ?? 0;
  const forClay = tapsUntil(world, [{ item: 'clay', count: clayBefore + 1 }], camp);
  expect(forClay).not.toBeNull();
  if (forClay === null) return;
  for (const square of forClay.taps) {
    await tapSquare(page, canvas, square);
    await expect(canvas).toHaveAttribute(
      'data-last-tap',
      new RegExp(`^(harvested|mined) ${square.x},${square.y}$`),
    );
  }
  world = forClay.world;
  await expect(page.getByTestId('lab-res-clay')).toHaveAttribute(
    'data-count',
    String(clayBefore + 1),
  );
  const paidAfterClay = await counts(page);

  // Now the second camp covers the first one's base: demolish the first...
  await tapSquare(page, canvas, camp);
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Camp 1');
  await page.getByTestId('lab2-demolish').click();
  await expect(canvas).toHaveAttribute('data-camps', '1');
  await expect(page.getByTestId('lab-hint')).toContainText('Camp demolished');
  expect(await counts(page)).toEqual(paidAfterClay); // no refund

  // ...and dig where it stood: all nine squares, then the middle once more.
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

test('clay, stone and an animal pay for level 2, and the ring grows', async ({ page }) => {
  const plan = planLevel2(SEED);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  await pauseClock(page);
  await page.goto('/#game');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    PREPARED_LAB2_KEY,
    JSON.stringify({ seed: plan.seed, steps: plan.steps }),
  ] as const);
  await page.goto('/#lab2');
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED} · prepared`);
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(plan.world)));
  await expect.poll(() => counts(page)).toEqual(expectedCounts(plan.world));

  // The counter puts what the upgrade costs first, right after "Dug", so
  // clay, stone and animals never hide off its right edge.
  const order = await page
    .getByTestId('lab-counter')
    .evaluate((el) => Array.from(el.children).map((c) => (c as HTMLElement).dataset['testid']));
  expect(order.slice(0, 4)).toEqual([
    'lab-dug',
    ...(upgradeCostFrom(1) ?? []).map((stack) => `lab-res-${stack.item}`),
  ]);

  // The camp's panel: level 1, ring 5, and the upgrade's cost all green.
  const cost = upgradeCostFrom(1) ?? [];
  await tapSquare(page, canvas, plan.camp);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await expect(page.getByTestId('lab2-camp-title')).toContainText(`Camp ${plan.camp.id} · Level 1`);
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(1)}`);
  for (const stack of cost) {
    await expect(page.getByTestId(`lab2-cost-${stack.item}`)).toContainText(
      `${stack.count}/${stack.count}`,
    );
    await expect(page.getByTestId(`lab2-cost-${stack.item}`)).not.toHaveClass(/lab2-cost-short/);
  }
  await expect(page.getByTestId('lab2-upgrade')).toBeEnabled();
  await page.getByTestId('lab2-upgrade').click();

  // Level 2: a wider ring, and the clay, stone and animal paid.
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 2');
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(2)}`);
  expect(Number(await canvas.getAttribute('data-shown'))).toBeGreaterThan(shownOf(plan.world));
  const after = await counts(page);
  for (const stack of cost) {
    expect(after[stack.item] ?? 0).toBe((plan.world.lab.counts.get(stack.item) ?? 0) - stack.count);
  }
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
  // Whatever grows there is taken first, then the block is mined...
  let w = world;
  for (;;) {
    const tap = campTap(w, lit.x, lit.y);
    w = tap.world;
    await tapFixed(lit);
    await expect(canvas).toHaveAttribute('data-last-tap', `${tap.kind} ${lit.x},${lit.y}`);
    if (tap.kind === 'mined') break;
  }
  await unmoved();
  // ...and a second mine there is too steep.
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
  await page.clock.runFor(800); // the hold is a timer: the clock is paused, so run it
  await page.mouse.up();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await expect(page.getByTestId('lab2-place-line')).toContainText(`At ${square.x}, ${square.y}`);
  expect((await counts(page))['dug']).toBe(0);
});
