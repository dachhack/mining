// UI lab 2 (issues #118 and #121): fog around camps, placing and upgrading
// camps, and the surface (grass, trees, animals, clay), at phone size
// (390 x 844).
//
// What each tap should do is worked out here with the same lab code the
// build runs (campWorld.ts): the engine and the surface are deterministic,
// so the page and this file play the same world. The world moves on only
// at End shift (plan A4): animals stand still while a test taps, and a test
// moves them by ending the shift. Each shift has 10 taps, so long runs of
// taps end the shift when they run out, on the page as in the model.
// Seed 110 opens with its first camp near the middle of the screen, its
// whole ring and a little fog in view.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { LAB_NEW_CAMP_COST, LAB_SURFACE } from '../../src/data/labCamps';
import {
  PREPARED_LAB2_KEY,
  endShift,
  restCrew,
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
import type { CampStep, CampWorld } from '../../src/app/lab/campWorld';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { GRASS, TREE } from '../../src/app/lab/surface';
import { planLevel2, tapsUntil, usefulTaps } from './campPlan';
import { emptyHistory, noteAction, undoCount, undoLast } from '../../src/app/lab/undoHistory';
import { labRecipes } from '../../src/app/lab/recipes';
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

/** True if the middle of square (x, y) is on the map, at least a square in from its edges. */
async function inView(canvas: Locator, square: Square): Promise<boolean> {
  const box = await canvas.boundingBox();
  if (box === null) {
    return false;
  }
  const point = await pointOf(canvas, square);
  const margin = (await camera(canvas)).cellPx;
  // The Undo button floats over the map's corner: a square under it is
  // covered, as it would be for a player, who drags the map a little.
  const page = canvas.page();
  const undo = await page.getByTestId('lab2-undo').boundingBox();
  const underUndo =
    undo !== null &&
    point.x >= undo.x - margin / 2 &&
    point.x <= undo.x + undo.width + margin / 2 &&
    point.y >= undo.y - margin / 2 &&
    point.y <= undo.y + undo.height + margin / 2;
  return (
    !underUndo &&
    point.x >= box.x + margin &&
    point.x <= box.x + box.width - margin &&
    point.y >= box.y + margin &&
    point.y <= box.y + box.height - margin
  );
}

/**
 * Bring square (x, y) into view, as a player would. A camp's light reaches
 * past the edges of the map at its normal zoom (radius 9: 19 squares across,
 * 14 on screen), so when the square is not well inside the map, drag the map
 * with one finger towards the middle, through the browser's own touch input
 * (the Chrome DevTools Protocol), as touch.spec.ts does. A drag is not a tap.
 */
async function showSquare(page: Page, canvas: Locator, square: Square): Promise<void> {
  for (let drag = 0; drag < 4 && !(await inView(canvas, square)); drag += 1) {
    const box = await canvas.boundingBox();
    if (box === null) {
      return;
    }
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const point = await pointOf(canvas, square);
    // The map moves with the finger, so moving it by (middle - point) brings
    // the square to the middle. One drag stays inside the map; a long way
    // takes several.
    const most = { x: box.width * 0.4, y: box.height * 0.4 };
    const move = {
      x: Math.max(-most.x, Math.min(most.x, middle.x - point.x)),
      y: Math.max(-most.y, Math.min(most.y, middle.y - point.y)),
    };
    const client = await page.context().newCDPSession(page);
    const at = (t: number) => ({
      x: middle.x + move.x * (t - 0.5),
      y: middle.y + move.y * (t - 0.5),
      id: 0,
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] });
    for (let step = 1; step <= 6; step += 1) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [at(step / 6)],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.detach();
  }
  expect(await inView(canvas, square), `square ${square.x},${square.y} in view`).toBe(true);
}

/** Tap square (x, y), as a finger would, first dragging the map to bring it into view if need be. */
async function tapSquare(page: Page, canvas: Locator, square: Square): Promise<void> {
  await showSquare(page, canvas, square);
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

/**
 * Play one step on the page and in the model `world`, and return the model
 * after it: a tap (checked against the model's answer) or End shift.
 */
async function playStep(
  page: Page,
  canvas: Locator,
  world: CampWorld,
  step: CampStep,
): Promise<CampWorld> {
  if (step.kind === 'endShift') {
    const next = endShift(world).world;
    await page.getByTestId('lab2-end-shift').click();
    await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
      'data-shift',
      String(next.turn.shift),
    );
    return next;
  }
  if (step.kind !== 'tap') {
    throw new Error(`playStep plays taps and End shift only, not ${step.kind}`);
  }
  const tap = campTap(world, step.x, step.y);
  await tapSquare(page, canvas, step);
  await expect(canvas).toHaveAttribute('data-last-tap', `${tap.kind} ${step.x},${step.y}`);
  return tap.world;
}

/** Play every step of a plan on the page and in the model; return the model after them. */
async function playSteps(
  page: Page,
  canvas: Locator,
  world: CampWorld,
  steps: CampStep[],
): Promise<CampWorld> {
  let w = world;
  for (const step of steps) {
    w = await playStep(page, canvas, w, step);
  }
  return w;
}

/**
 * Tap `square` until it is mined, ending the shift whenever its taps run
 * out, on the page and in the model. Returns the model after it.
 */
async function digUntilMined(
  page: Page,
  canvas: Locator,
  world: CampWorld,
  square: Square,
): Promise<CampWorld> {
  let w = world;
  for (let i = 0; i < 8; i += 1) {
    if (w.turn.tapsLeft === 0) {
      w = await playStep(page, canvas, w, { kind: 'endShift' });
    }
    const mined = campTap(w, square.x, square.y).kind === 'mined';
    w = await playStep(page, canvas, w, { kind: 'tap', ...square });
    if (mined) return w;
  }
  throw new Error(`square ${square.x},${square.y} was never mined`);
}

/** A fog square on screen: straight east of the first camp, just past its ring. */
function fogSquare(world: CampWorld): Square {
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  return { x: camp.x + campRadius(1) + 1, y: camp.y };
}

test('Other versions leads to lab 2, which opens in fog round one camp', async ({ page }) => {
  await page.goto('/#versions');
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
  // was cut in half by the tray. Seed 110 opens with five kinds in sight
  // (dirt, stone, grass, tree, apple tree: no coal at the surface and no
  // timber-root, since the owner's playtests of the PR #126 and #128
  // builds), filling both of the key's rows.
  await openLab2(page);
  const key = page.getByTestId('lab2-tray').locator('.lab-key');
  await expect(key.locator('.lab-key-entry')).toHaveCount(5);
  await expect(key).not.toContainText('Timber');
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

  // End shifts until an animal stands on lit ground (they move only then), then tap it.
  let animal: Square | null = null;
  for (let shift = 0; animal === null; shift += 1) {
    expect(shift).toBeLessThan(12);
    world = await playStep(page, canvas, world, { kind: 'endShift' });
    const lit = sightMap(world);
    animal = world.surface.animals.find((a) => lit[a.x + width * a.y] === 'shown') ?? null;
  }
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
  // That is about one radius out (owner, question 138: camps no longer have
  // to touch to spread the light): 8 squares, off the screen at the opening
  // zoom, so the map is dragged to it first (tapSquare).
  const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
  expect(target.x - camp.x).toBeGreaterThanOrEqual(8);
  // Two taps kept in hand: one to dig a square, one to place the camp.
  const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y), 2);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  // The new camp lights a wide band of new ground, not a sliver.
  expect(newlyCovered(plan.world, target.x, target.y).length).toBeGreaterThan(100);

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

  // Cutting, felling and digging: each tap either takes something or mines,
  // with End shift whenever a shift's taps run out.
  let played = await playSteps(page, canvas, start, plan.steps);
  await expect.poll(() => counts(page)).toEqual(expectedCounts(played));

  // Dig one bare square near the camp: a patch over it is uneven, and refused with its own cue.
  const width = start.lab.state.size.x;
  const bare = sightMap(played)
    .map((sight, i) => ({ sight, x: i % width, y: Math.floor(i / width) }))
    .filter((sq) => sq.sight === 'shown' && campTap(played, sq.x, sq.y).kind === 'mined')
    .filter((sq) => !footprintOf(target.x, target.y).some((f) => f.x === sq.x && f.y === sq.y))
    // A patch centred there must not overlap the camp's own 3 x 3.
    .filter((sq) => Math.max(Math.abs(sq.x - camp.x), Math.abs(sq.y - camp.y)) >= 3)
    .sort(
      (a, b) =>
        Math.abs(a.x - camp.x) +
        Math.abs(a.y - camp.y) -
        (Math.abs(b.x - camp.x) + Math.abs(b.y - camp.y)),
    )[0];
  expect(bare).toBeDefined();
  if (bare === undefined) return;
  played = await playStep(page, canvas, played, { kind: 'tap', x: bare.x, y: bare.y });
  const uneven = placeRefusal(played, bare.x, bare.y) === 'notLevel' ? bare : undefined;
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
  const fresh = newlyCovered(played, target.x, target.y).length;
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
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(played) + fresh));
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
  await page.waitForTimeout(1000); // let the ring finish spreading
  expect(await brightness(canvas, beyond)).toBeGreaterThan(40);
  // The camp's cost was paid.
  const paid = await counts(page);
  for (const stack of LAB_NEW_CAMP_COST) {
    expect(paid[stack.item] ?? 0).toBe((played.lab.counts.get(stack.item) ?? 0) - stack.count);
  }

  // Dig for clay: the taps nearest the camp until one gives clay.
  let world = placeCamp(played, target.x, target.y);
  const clayBefore = world.lab.counts.get('clay') ?? 0;
  const forClay = tapsUntil(world, [{ item: 'clay', count: clayBefore + 1 }], camp, [], 1);
  expect(forClay).not.toBeNull();
  if (forClay === null) return;
  world = await playSteps(page, canvas, world, forClay.steps);
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

  // ...and dig where it stood: all nine squares, then the middle once more
  // (ending the shift when its taps run out).
  world = demolishCamp(world, 1);
  const digs = [...footprintOf(camp.x, camp.y), { x: camp.x, y: camp.y }];
  for (const square of digs) {
    world = await digUntilMined(page, canvas, world, square);
  }
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
});

test('wood, clay, stone and an animal pay for level 2, and the ring grows', async ({ page }) => {
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
  const level2 = upgradeCostFrom(1) ?? [];
  expect(order.slice(0, 1 + level2.length)).toEqual([
    'lab-dug',
    ...level2.map((stack) => `lab-res-${stack.item}`),
  ]);
  // Wood is timber (owner): Lab 2 never shows timber.
  expect(order).not.toContain('lab-res-timber');

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

  // Level 2: a wider ring, and the wood, clay, stone and animal paid.
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
  // The fog square is on screen at the opening zoom: diagonally up and out
  // from the camp, just past its ring (radius 9), not straight out, which is
  // off screen. Up to the left: the HUD there lets taps through, while Close
  // mine covers the top-right corner, and End shift, Rest and Undo the bottom.
  const fog = { x: camp.x - 6, y: camp.y - 8 };
  expect(sightMap(world)[fog.x + world.lab.state.size.x * fog.y]).toBe('fog');
  expect(await inView(canvas, fog)).toBe(true);
  await tapFixed(fog);
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
  await expect(canvas).toHaveAttribute('data-target', `${square.x},${square.y}`);
  // Nothing mined yet, so the line says what the camp still needs.
  await expect(page.getByTestId('lab2-place-line')).toContainText(missingLine(world));
  expect((await counts(page))['dug']).toBe(0);
});

/** "Need 5 more wood and 5 more grass": what `world`'s counts lack of a new camp's cost. */
function missingLine(world: CampWorld): string {
  const short = LAB_NEW_CAMP_COST.map((stack) => ({
    item: stack.item,
    lack: stack.count - (world.lab.counts.get(stack.item) ?? 0),
  }))
    .filter((s) => s.lack > 0)
    .map((s) => `${s.lack} more ${s.item}`);
  const last = short.pop() ?? '';
  return `Need ${short.length > 0 ? `${short.join(', ')} and ${last}` : last}`;
}

/** Expect `inner` to lie wholly inside `outer`'s box. */
async function expectInside(
  inner: Locator,
  outer: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const box = await inner.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.x).toBeGreaterThanOrEqual(outer.x - 0.5);
  expect(box.y).toBeGreaterThanOrEqual(outer.y - 0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + 0.5);
}

/**
 * The shared top bar is one tidy row (owner, question 137): the back button,
 * the title box and "New world" side by side, each whole inside the bar, no
 * wrapping, and the title "Lab 2" never cut off.
 */
async function expectTidyTopBar(
  page: Page,
  screen: { width: number; height: number },
): Promise<void> {
  const bar = page.locator('.lab-top');
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.height).toBeLessThanOrEqual(70); // 62 at normal text, at most 68 with the capped sizes
  await expectInside(bar, { x: 0, y: 0, width: screen.width, height: screen.height });
  const parts = [bar.locator('.lab-back'), bar.locator('.lab-title-box'), bar.locator('.lab-new')];
  let right = box.x;
  for (const part of parts) {
    await expectInside(part, box);
    const partBox = await part.boundingBox();
    if (partBox === null) return;
    // Left to right, without overlapping.
    expect(partBox.x).toBeGreaterThanOrEqual(right - 0.5);
    right = partBox.x + partBox.width;
  }
  // The button's label and the title fit their boxes: neither is cut.
  const cut = await bar.evaluate((el) => {
    const title = el.querySelector('.lab-title');
    const button = el.querySelector('.lab-new');
    return {
      title: title === null ? 1 : title.scrollWidth - title.clientWidth,
      button: button === null ? 1 : button.scrollWidth - button.clientWidth,
      bar: el.scrollWidth - el.clientWidth,
    };
  });
  expect(cut).toEqual({ title: 0, button: 0, bar: 0 });
}

// The owner's bug report: "Place camp doesn't show" on their phone. On a
// narrow screen, or with a larger text size, the button must still be whole
// and inside the tray, and when it is off the line says why.
const PHONES = [
  { width: 320, height: 640, rootFont: '' },
  { width: 360, height: 740, rootFont: '' },
  { width: 390, height: 844, rootFont: '' },
  { width: 320, height: 640, rootFont: '20px' },
];
for (const phone of PHONES) {
  const label = `${phone.width} x ${phone.height}${phone.rootFont === '' ? '' : `, text ${phone.rootFont}`}`;
  test(`Place camp is whole and inside the tray at ${label}, with and without a spot`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    const canvas = await openLab2(page);
    if (phone.rootFont !== '') {
      await page.addStyleTag({ content: `html { font-size: ${phone.rootFont}; }` });
    }
    const start = newCampWorld(SEED);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
    expect(placeRefusal(start, target.x, target.y)).toBe('cost');

    const confirm = page.getByTestId('lab2-place-confirm');
    const check = async (): Promise<void> => {
      await expect(confirm).toBeVisible();
      await expect(confirm).toHaveText('Place camp');
      const tray = await page.getByTestId('lab2-tray').boundingBox();
      expect(tray).not.toBeNull();
      if (tray === null) return;
      await expectInside(confirm, tray);
      await expectInside(confirm, { x: 0, y: 0, width: phone.width, height: phone.height });
      await expectInside(page.getByTestId('lab2-place-cancel'), tray);
    };

    await expectTidyTopBar(page, phone);

    // No spot yet: the button is off, and the line says to choose one.
    await page.getByTestId('lab2-camp-tool').click();
    await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveAttribute('title', 'Choose a spot first');
    await expect(page.getByTestId('lab2-place-line')).toContainText('Tap the middle');
    await check();

    // A level spot the camp cannot be paid for yet: the line names what is missing.
    await tapSquare(page, canvas, target);
    await expect(confirm).toBeDisabled();
    await expect(page.getByTestId('lab2-place-line')).toContainText(missingLine(start));
    await expect(confirm).toHaveAttribute('title', missingLine(start));
    await check();
    if (phone.rootFont === '') {
      await page.screenshot({
        path: `test-results/lab2-place-${phone.width}.png`,
      });
    }
  });
}

// More from the owner: they had the wood and grass, and still no Place camp,
// in portrait and on its side. Android's system text size (WebView text
// zoom) makes the text bigger, as a larger root font does here; on its side
// the phone is too short for the map above the tray. With a camp that can be
// paid for and a good spot chosen, Place camp must be on screen, whole, and
// work, at every text size, either way up.
const SCREENS = [
  { width: 390, height: 844, rootFont: '100%' },
  { width: 390, height: 844, rootFont: '130%' },
  { width: 390, height: 844, rootFont: '150%' },
  { width: 390, height: 844, rootFont: '200%' },
  { width: 320, height: 640, rootFont: '150%' },
  { width: 320, height: 640, rootFont: '200%' },
  { width: 915, height: 412, rootFont: '100%' },
  { width: 915, height: 412, rootFont: '200%' },
  { width: 844, height: 390, rootFont: '130%' },
  { width: 740, height: 360, rootFont: '150%' },
];
for (const screen of SCREENS) {
  test(`a paid-for camp on a good spot: Place camp is on screen and works at ${screen.width} x ${screen.height}, text ${screen.rootFont}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: screen.width, height: screen.height });
    const start = newCampWorld(SEED);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
    const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y), 1);
    expect(plan).not.toBeNull();
    if (plan === null) return;
    expect(placeRefusal(plan.world, target.x, target.y)).toBeNull();

    // Open lab 2 on the played world: the cost is paid for from the start.
    await pauseClock(page);
    await page.goto('/#game');
    await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
      PREPARED_LAB2_KEY,
      JSON.stringify({ seed: SEED, steps: plan.steps }),
    ] as const);
    await page.goto('/#lab2');
    await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED} · prepared`);
    await page.addStyleTag({ content: `html { font-size: ${screen.rootFont}; }` });
    const canvas = page.getByTestId('lab-map');

    await page.getByTestId('lab2-camp-tool').click();
    await tapSquare(page, canvas, target);
    await expect(canvas).toHaveAttribute('data-target', `${target.x},${target.y}`);
    await expect(page.getByTestId('lab2-place-line')).toContainText('level ground');

    const confirm = page.getByTestId('lab2-place-confirm');
    await expect(confirm).toBeEnabled();
    await expect(confirm).toHaveText('Place camp');
    await expectTidyTopBar(page, screen);
    const tray = await page.getByTestId('lab2-tray').boundingBox();
    expect(tray).not.toBeNull();
    if (tray === null) return;
    await expectInside(page.getByTestId('lab2-tray'), {
      x: 0,
      y: 0,
      width: screen.width,
      height: screen.height,
    });
    await expectInside(confirm, tray);
    // Nothing in the tray is cut off at the bottom.
    const cut = await page
      .getByTestId('lab2-tray')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(cut).toBeLessThanOrEqual(0);

    // A real tap on it places the camp.
    const box = await confirm.boundingBox();
    if (box === null) return;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(canvas).toHaveAttribute('data-camps', '2');
  });
}

// The owner's phone, after PR #123: Place camp still under the gesture bar.
// Android 15 and later draws the app edge to edge, under the status bar and
// the gesture bar, and Capacitor tells the page how tall they are by setting
// --safe-area-inset-* on <html> (its SystemBars plugin; env() has them too).
// Playwright's Chromium has no system bars, so these insets were 0 in every
// earlier test, and the page fit; on the phone it was taller than the screen
// by both bars. Here the page gets the insets as the phone gives them.
const PHONES_WITH_BARS = [
  { width: 390, height: 844, top: 32, bottom: 24, left: 0, right: 0 },
  { width: 390, height: 780, top: 32, bottom: 48, left: 0, right: 0 },
  { width: 360, height: 700, top: 28, bottom: 48, left: 0, right: 0 },
  { width: 915, height: 412, top: 0, bottom: 24, left: 32, right: 0 },
];
for (const phone of PHONES_WITH_BARS) {
  test(`with system bars (${phone.top} px top, ${phone.bottom} px bottom) at ${phone.width} x ${phone.height}: Place camp is above the gesture bar and works`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    const start = newCampWorld(SEED);
    const camp = start.camps[0] ?? { x: 0, y: 0 };
    const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
    const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y), 1);
    expect(plan).not.toBeNull();
    if (plan === null) return;

    await pauseClock(page);
    await page.goto('/#game');
    await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
      PREPARED_LAB2_KEY,
      JSON.stringify({ seed: SEED, steps: plan.steps }),
    ] as const);
    await page.goto('/#lab2');
    await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED} · prepared`);
    // What Capacitor's SystemBars plugin does on the phone.
    await page.evaluate((insets) => {
      const style = document.documentElement.style;
      style.setProperty('--safe-area-inset-top', `${insets.top}px`);
      style.setProperty('--safe-area-inset-right', `${insets.right}px`);
      style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`);
      style.setProperty('--safe-area-inset-left', `${insets.left}px`);
      window.dispatchEvent(new Event('resize'));
    }, phone);
    const canvas = page.getByTestId('lab-map');

    // The page fits the screen: nothing below it to scroll to (it cannot scroll).
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      innerHeight,
    );
    // The part of the screen the bars leave free.
    const free = {
      x: phone.left,
      y: phone.top,
      width: phone.width - phone.left - phone.right,
      height: innerHeight - phone.top - phone.bottom,
    };
    await expectInside(page.locator('.lab-top'), free);
    // The tray at rest, with the key's two rows at its bottom: in the owner's
    // screenshot from the PR #123 build, the key ran under the gesture bar.
    await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'idle');
    await expectInside(page.getByTestId('lab2-tray'), free);
    const key = page.locator('.lab2-tray .lab-key');
    await expect(key).toBeVisible();
    await expectInside(key, free);
    for (const entry of await key.locator('.lab-key-entry').all()) {
      const box = await entry.boundingBox();
      // Entries scrolled sideways out of view are not checked; every row is.
      if (box !== null && box.x + box.width <= phone.width - phone.right) {
        await expectInside(entry, free);
      }
    }

    await page.getByTestId('lab2-camp-tool').click();
    await expect(page.getByTestId('lab-hint')).toHaveText(
      'Tap the middle of a flat, lit 3 × 3 patch for the new camp.',
    );
    await tapSquare(page, canvas, target);
    await expect(canvas).toHaveAttribute('data-target', `${target.x},${target.y}`);
    // The hint says what to do next, not "Tap to gather and dig".
    await expect(page.getByTestId('lab-hint')).toHaveText(
      'Tap Place camp to build here, or tap another spot.',
    );

    const confirm = page.getByTestId('lab2-place-confirm');
    await expect(confirm).toBeEnabled();
    await expectInside(page.getByTestId('lab2-tray'), free);
    await expectInside(confirm, free);

    const box = await confirm.boundingBox();
    if (box === null) return;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(canvas).toHaveAttribute('data-camps', '2');
  });
}

// Undo (owner, after the PR #126 playtest: "Undo button"; question 141:
// "animal and apple harvest cannot be undone"; the animals, apples and clock
// are left alone).
test('undo takes back the player’s taps one by one, steps past harvests, and is off at the start', async ({
  page,
}) => {
  const canvas = await openLab2(page);
  const undo = page.getByTestId('lab2-undo');
  await expect(undo).toBeDisabled();

  // Six useful taps (each cuts, fells, picks, catches or mines). The model
  // keeps the same history the page does: catches and apple picks are not
  // in it. The page's clock is paused, so the model and the page agree.
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  let world = start;
  let history = emptyHistory(start);
  for (const square of plan.taps.slice(0, 6)) {
    const tap = campTap(world, square.x, square.y);
    const harvestKind = tap.kind === 'harvested' ? tap.harvest?.kind : null;
    const undoable = tap.kind === 'mined' || harvestKind === 'grass' || harvestKind === 'felled';
    history = noteAction(history, { kind: 'tap', ...square }, undoable);
    world = tap.world;
    await tapSquare(page, canvas, square);
    await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
  }
  const undoable = undoCount(history);
  expect(undoable).toBeGreaterThan(2);
  await expect(undo).toHaveAttribute('data-count', String(undoable));

  // Undo, one by one: each time the counts, the lit squares and the blocks
  // match the model.
  for (let left = undoable - 1; left >= 0; left -= 1) {
    const result = undoLast(history, world);
    if (result === null || 'refused' in result) throw new Error('the model could not undo');
    world = result.world;
    history = result.history;
    await undo.click();
    await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
    await expect(canvas).toHaveAttribute('data-shown', String(shownOf(world)));
    await expect(undo).toHaveAttribute('data-count', String(left));
  }
  await expect(undo).toBeDisabled();
  await expect(page.getByTestId('lab-hint')).toContainText('Nothing more to undo');
  // Back to the start, except what was harvested (it stays harvested).
  for (const [item, count] of world.lab.counts) {
    expect(item === 'apple' || item === 'animal', `${item} ${count}`).toBe(true);
  }

  // New world: nothing to undo.
  await tapSquare(page, canvas, plan.taps[0] ?? { x: 0, y: 0 });
  await page.getByRole('button', { name: 'New world' }).click();
  await expect(undo).toBeDisabled();
});

test('End shift: the HUD counts taps down, End shift refills them, moves the animals, and empties Undo', async ({
  page,
}) => {
  const canvas = await openLab2(page);
  const hud = page.getByTestId('lab2-hud');
  const start = newCampWorld(SEED);
  await expect(hud).toHaveAttribute('data-shift', '1');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps));
  await expect(hud).toHaveAttribute('data-health', String(FRONTIER_SHIFT.startHealth));
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const lit = { x: camp.x - 2, y: camp.y }; // just outside the camp's 3 x 3
  const dug = await digOnce(page, canvas, start, lit);
  await expect(hud).toHaveAttribute('data-taps', String(dug.turn.tapsLeft));
  await expect(page.getByTestId('lab2-undo')).toBeEnabled();

  // End shift: a new shift with a full set of taps, the animals have moved
  // (as the model says), Undo is off, and the hint says what upkeep took.
  const next = endShift(dug).world;
  await page.getByTestId('lab2-end-shift').click();
  await expect(hud).toHaveAttribute('data-shift', '2');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps));
  await expect(hud).toHaveAttribute('data-health', String(next.turn.health));
  await expect(canvas).toHaveAttribute(
    'data-animals',
    next.surface.animals.map((a) => `${a.x},${a.y}`).join(' '),
  );
  await expect(page.getByTestId('lab2-undo')).toBeDisabled();
  await expect(page.getByTestId('lab-hint')).toContainText('Shift 1 over');
  await expect.poll(() => counts(page)).toEqual(expectedCounts(next));
});

test('out of taps: a tap does nothing and says so, and End shift stands out', async ({ page }) => {
  // A world prepared with all but one of the shift's taps spent (a shift is
  // FRONTIER_SHIFT.taps), then the last tap on the page, then one more.
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const spent = usefulTaps(start, FRONTIER_SHIFT.taps - 1, camp);
  expect(spent).not.toBeNull();
  if (spent === null) return;
  await pauseClock(page);
  await page.goto('/#game');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    PREPARED_LAB2_KEY,
    JSON.stringify({ seed: SEED, steps: spent.steps }),
  ] as const);
  await page.goto('/#lab2');
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED} · prepared`);
  const canvas = page.getByTestId('lab-map');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-taps', '1');
  const last = usefulTaps(spent.world, 1, camp);
  const lastStep = last?.steps[0];
  expect(lastStep?.kind).toBe('tap');
  if (last === null || lastStep === undefined || lastStep.kind !== 'tap') return;
  const world = await playSteps(page, canvas, spent.world, [lastStep]);
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-taps', '0');
  await expect(page.getByTestId('lab2-end-shift')).toHaveClass(/lab2-end-shift-now/);
  const extra = { x: camp.x - 2, y: camp.y };
  await tapSquare(page, canvas, extra);
  await expect(canvas).toHaveAttribute('data-last-tap', `noTaps ${extra.x},${extra.y}`);
  await expect(page.getByTestId('lab-hint')).toContainText('No taps left this shift');
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
});

test('Close mine asks once, then ends the run: nothing more can be done', async ({ page }) => {
  const canvas = await openLab2(page);
  const close = page.getByTestId('lab2-close-mine');
  await close.click();
  await expect(close).toHaveText('Tap to confirm');
  await expect(page.getByTestId('lab2-over')).toBeHidden();
  await close.click();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'closed');
  await expect(page.getByTestId('lab2-over')).toBeVisible();
  await expect(page.getByTestId('lab2-over')).toContainText('Mine closed');
  await expect(page.getByTestId('lab2-end-shift')).toBeDisabled();
  const camp = newCampWorld(SEED).camps[0] ?? { x: 0, y: 0 };
  const lit = { x: camp.x - 2, y: camp.y };
  await tapSquare(page, canvas, lit);
  await expect(canvas).toHaveAttribute('data-last-tap', `over ${lit.x},${lit.y}`);
  // New world starts a fresh run.
  await page.getByRole('button', { name: 'New world' }).click();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'active');
  await expect(page.getByTestId('lab2-over')).toBeHidden();
});

test('Rest is in a camp’s panel: the crew rests there, then the shift ends', async ({ page }) => {
  // Owner, question 156: "Only at a camp". The End shift bar has no Rest.
  const canvas = await openLab2(page);
  const hud = page.getByTestId('lab2-hud');
  await expect(page.locator('.lab2-shift-buttons').getByTestId('lab2-rest')).toHaveCount(0);
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { id: 1, x: 0, y: 0, level: 1 };
  // A shift with nothing held: upkeep goes unpaid and the crew is hurt.
  const hungry = endShift(start).world;
  await page.getByTestId('lab2-end-shift').click();
  await expect(hud).toHaveAttribute('data-health', String(hungry.turn.health));
  expect(hungry.turn.health).toBeLessThan(FRONTIER_SHIFT.startHealth);
  // Tap the camp, then Rest here.
  await tapSquare(page, canvas, camp);
  await expect(page.getByTestId('lab2-camp-title')).toContainText(`Camp ${camp.id}`);
  const rested = restCrew(hungry, camp.id);
  await page.getByTestId('lab2-rest').click();
  await expect(hud).toHaveAttribute('data-shift', String(rested.world.turn.shift));
  await expect(hud).toHaveAttribute('data-health', String(rested.world.turn.health));
  await expect(page.getByTestId('lab-hint')).toContainText('Rested.');
});

test('undo takes back a placed camp: the camp, its cost and its light', async ({ page }) => {
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const target = { x: camp.x + campRadius(1) - 1, y: camp.y };
  const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp, footprintOf(target.x, target.y), 1);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  await pauseClock(page);
  await page.goto('/#game');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    PREPARED_LAB2_KEY,
    JSON.stringify({ seed: SEED, steps: plan.steps }),
  ] as const);
  await page.goto('/#lab2');
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED} · prepared`);
  const canvas = page.getByTestId('lab-map');
  const undo = page.getByTestId('lab2-undo');
  // The prepared steps are the world's start: nothing to undo yet.
  await expect(undo).toBeDisabled();

  await page.getByTestId('lab2-camp-tool').click();
  await tapSquare(page, canvas, target);
  await page.getByTestId('lab2-place-confirm').click();
  await expect(canvas).toHaveAttribute('data-camps', '2');
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect(canvas).toHaveAttribute('data-camps', '1');
  await expect(canvas).toHaveAttribute('data-shown', String(shownOf(plan.world)));
  await expect.poll(() => counts(page)).toEqual(expectedCounts(plan.world));
  await expect(page.getByTestId('lab-hint')).toHaveText(
    'Undone: placing the camp. Nothing more to undo.',
  );
  await expect(undo).toBeDisabled();
});

test('an upgrade’s four costs can all be reached: the cost row scrolls sideways at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
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
  await tapSquare(page, page.getByTestId('lab-map'), plan.camp);
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  const row = page.getByTestId('lab2-tray').locator('.lab2-cost');
  const last = (upgradeCostFrom(1) ?? []).at(-1);
  expect(last).toBeDefined();
  if (last === undefined) return;
  // Scrolled to its end, the last chip is wholly inside the row.
  await row.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const rowBox = await row.boundingBox();
  const chip = await page.getByTestId(`lab2-cost-${last.item}`).boundingBox();
  expect(rowBox).not.toBeNull();
  expect(chip).not.toBeNull();
  if (rowBox === null || chip === null) return;
  // (Within a pixel: the browser rounds the scroll position.)
  expect(chip.x).toBeGreaterThanOrEqual(rowBox.x - 1);
  expect(chip.x + chip.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
  // The Upgrade button is whole and on screen beside it.
  await expect(page.getByTestId('lab2-upgrade')).toBeInViewport({ ratio: 1 });
});

// The recipe book (owner, after the PR #128 playtest: "We need a recipe book
// on that line ... select which item or upgrade you are gathering resources
// for. It then adds that item's icon and needed materials to that row ...
// The row is scrollable horizontally.").
test('the recipe book: pin two recipes, watch them fill as you gather, unpin one; the map never moves', async ({
  page,
}) => {
  const canvas = await openLab2(page);
  const before = await canvas.boundingBox();
  const trayBefore = await page.getByTestId('lab2-tray').boundingBox();
  const unmoved = async (): Promise<void> => {
    expect(await canvas.boundingBox()).toEqual(before);
    expect(await page.getByTestId('lab2-tray').boundingBox()).toEqual(trayBefore);
  };
  // At first a new camp is pinned, as the row showed before the book.
  await expect(page.getByTestId('lab2-pin-new-camp')).toBeVisible();

  // Open the book: a card over the whole screen (owner, after the playtest of
  // PR #146), with every recipe and its costs from the lab's data.
  await page.getByTestId('lab2-book').click();
  const card = page.getByTestId('lab2-book-card');
  await expect(card).toBeVisible();
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  expect(await card.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
  await unmoved();
  for (const recipe of labRecipes()) {
    await expect(page.getByTestId(`lab2-recipe-${recipe.id}`)).toBeAttached();
    for (const stack of recipe.cost) {
      await expect(page.getByTestId(`lab2-recipe-${recipe.id}-${stack.item}`)).toContainText(
        `0/${stack.count}`,
      );
    }
  }
  // Pin both upgrades.
  for (const id of ['upgrade-2', 'upgrade-3']) {
    await page.getByTestId(`lab2-recipe-pin-${id}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`lab2-recipe-pin-${id}`).click();
    await expect(page.getByTestId(`lab2-recipe-pin-${id}`)).toHaveText('Pinned ✓');
    await unmoved();
  }
  await page.getByTestId('lab2-book-close').click();
  await expect(card).toBeHidden();
  await expect(page.getByTestId('lab2-pins').locator('.lab2-pin')).toHaveCount(3);
  await unmoved();

  // The phone's back button closes the book too, without leaving the screen.
  const url = page.url();
  await page.getByTestId('lab2-book').click();
  await expect(card).toBeVisible();
  await page.goBack();
  await expect(card).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('lab2-pins').locator('.lab2-pin')).toHaveCount(3);
  await unmoved();

  // Gather: the pinned cards' have/need fill in from the counts.
  const start = newCampWorld(SEED);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const plan = tapsUntil(start, LAB_NEW_CAMP_COST, camp);
  expect(plan).not.toBeNull();
  if (plan === null) return;
  let world = start;
  for (const square of plan.taps.slice(0, 8)) {
    world = campTap(world, square.x, square.y).world;
    await tapSquare(page, canvas, square);
  }
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
  for (const id of ['new-camp', 'upgrade-2', 'upgrade-3']) {
    const recipe = labRecipes().find((r) => r.id === id);
    for (const stack of recipe?.cost ?? []) {
      const have = Math.min(world.lab.counts.get(stack.item) ?? 0, stack.count);
      await expect(page.getByTestId(`lab2-pin-${id}-${stack.item}`)).toContainText(
        `${have}/${stack.count}`,
      );
    }
  }
  expect(world.lab.counts.get('wood') ?? 0).toBeGreaterThan(0);

  // Unpin level 3: its card goes; the others stay.
  await page.getByTestId('lab2-pins').evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.getByTestId('lab2-unpin-upgrade-3').click();
  await expect(page.getByTestId('lab2-pin-upgrade-3')).toHaveCount(0);
  await expect(page.getByTestId('lab2-pins').locator('.lab2-pin')).toHaveCount(2);
  await unmoved();

  // A card goes to where its recipe is built: the camp tool for a new camp,
  // the panel of a level-1 camp for an upgrade to level 2.
  await page.getByTestId('lab2-pin-new-camp').locator('.lab2-pin-go').click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'placing');
  await page.getByTestId('lab2-place-cancel').click();
  await page.getByTestId('lab2-pins').evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.getByTestId('lab2-pin-upgrade-2').locator('.lab2-pin-go').click();
  await expect(page.getByTestId('lab2-tray')).toHaveAttribute('data-mode', 'camp');
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 1');
  await unmoved();
});

test('the pinned row scrolls sideways at 320 px: every card can be reached, the tray keeps its height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openLab2(page);
  const trayBefore = await page.getByTestId('lab2-tray').boundingBox();
  await page.getByTestId('lab2-book').click();
  for (const id of ['upgrade-2', 'upgrade-3']) {
    await page.getByTestId(`lab2-recipe-pin-${id}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`lab2-recipe-pin-${id}`).click();
  }
  await page.getByTestId('lab2-book-close').click();
  const strip = page.getByTestId('lab2-pins');
  await expect(strip.locator('.lab2-pin')).toHaveCount(3);
  // More than fits: the strip scrolls, not the page.
  const sizes = await strip.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  // Scrolled to its end, the last card's × is inside the strip and works.
  await strip.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const stripBox = await strip.boundingBox();
  const last = await page.getByTestId('lab2-unpin-upgrade-3').boundingBox();
  expect(stripBox).not.toBeNull();
  expect(last).not.toBeNull();
  if (stripBox === null || last === null) return;
  expect(last.x + last.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 1);
  expect(last.x).toBeGreaterThanOrEqual(stripBox.x - 1);
  await page.getByTestId('lab2-unpin-upgrade-3').click();
  await expect(strip.locator('.lab2-pin')).toHaveCount(2);
  // The book and the pins never changed the tray's height.
  expect(await page.getByTestId('lab2-tray').boundingBox()).toEqual(trayBefore);
});

for (const phone of [
  { width: 360, height: 700, top: 28, bottom: 48, left: 0, right: 0 },
  { width: 915, height: 412, top: 0, bottom: 24, left: 32, right: 0 },
]) {
  test(`the recipe book card fills the screen inside the system bars at ${phone.width} x ${phone.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await openLab2(page);
    // What Capacitor's SystemBars plugin does on the phone.
    await page.evaluate((insets) => {
      const style = document.documentElement.style;
      style.setProperty('--safe-area-inset-top', `${insets.top}px`);
      style.setProperty('--safe-area-inset-right', `${insets.right}px`);
      style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`);
      style.setProperty('--safe-area-inset-left', `${insets.left}px`);
    }, phone);
    const map = await page.getByTestId('lab-map').boundingBox();
    await page.getByTestId('lab2-book').click();
    const card = page.getByTestId('lab2-book-card');
    await expect(card).toBeVisible();
    expect(await card.boundingBox()).toEqual({
      x: phone.left,
      y: phone.top,
      width: phone.width - phone.left - phone.right,
      height: phone.height - phone.top - phone.bottom,
    });
    // Every recipe's pin and the × can be reached inside the card.
    for (const recipe of labRecipes()) {
      const pin = page.getByTestId(`lab2-recipe-pin-${recipe.id}`);
      await pin.scrollIntoViewIfNeeded();
      await expect(pin).toBeInViewport();
    }
    const close = page.getByTestId('lab2-book-close');
    await expect(close).toBeInViewport();
    await close.click();
    await expect(card).toBeHidden();
    expect(await page.getByTestId('lab-map').boundingBox()).toEqual(map);
  });
}

test('pins are saved: after a reload the same recipes are pinned (owner, question 143)', async ({
  page,
}) => {
  await openLab2(page);
  // First visit: a new camp is pinned.
  await expect(page.getByTestId('lab2-pins').locator('.lab2-pin')).toHaveCount(1);
  await page.getByTestId('lab2-book').click();
  for (const id of ['upgrade-2', 'upgrade-3']) {
    await page.getByTestId(`lab2-recipe-pin-${id}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`lab2-recipe-pin-${id}`).click();
  }
  await page.getByTestId('lab2-book-close').click();
  // And unpin the new camp, so the saved list is not just the first pins.
  await page.getByTestId('lab2-unpin-new-camp').click();
  const pinned = async (): Promise<string[]> =>
    page
      .getByTestId('lab2-pins')
      .locator('.lab2-pin')
      .evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset['testid'] ?? ''));
  await expect.poll(pinned).toEqual(['lab2-pin-upgrade-2', 'lab2-pin-upgrade-3']);

  // Close and open again: the same pins, in the same order.
  await page.reload();
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  await expect.poll(pinned).toEqual(['lab2-pin-upgrade-2', 'lab2-pin-upgrade-3']);
  // New world keeps them too.
  await page.getByRole('button', { name: 'New world' }).click();
  await expect.poll(pinned).toEqual(['lab2-pin-upgrade-2', 'lab2-pin-upgrade-3']);
});
