// A fully revealed map stays quick (owner, after the playtest of 8842e83:
// "The game starts to slow down when the full map is revealed").
//
// Every square lit, zoomed out to the whole map. The ground (blocks,
// plants, fog, the lit edge) is drawn into an offscreen canvas and copied
// each frame; a tap draws it again only around the square that changed, and
// the frames of the tap's cue draw none of it. These tests count those
// draws (the canvas's data-ground-draws and data-ground-drawn), so the
// slowdown cannot come back unnoticed, and check that drawing a part gives
// exactly what drawing it all does.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createFrontier, frontierAct, previewTap, saveFrontier } from '../../src/engine';
import { seenWith } from '../../src/engine/frontier/camps';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
const RUN_KEY = 'mining-game.run';

/** Seed 110 with five level-3 camps that light the whole 32 x 32 map. */
function revealedWorld(): FrontierState {
  const start = createFrontier(110);
  const size = start.cube.size;
  const first = start.camps[0] ?? {
    id: 1,
    x: 16,
    y: 16,
    level: 1,
    smelter: false,
    lantern: false,
    pen: false,
    penned: 0,
    breedIn: 0,
    deep: false,
    defense: 0,
  };
  const camps = [
    { ...first, level: 3 },
    {
      id: 2,
      x: 6,
      y: 6,
      level: 3,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    },
    {
      id: 3,
      x: 25,
      y: 6,
      level: 3,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    },
    {
      id: 4,
      x: 6,
      y: 25,
      level: 3,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    },
    {
      id: 5,
      x: 25,
      y: 25,
      level: 3,
      smelter: false,
      lantern: false,
      pen: false,
      penned: 0,
      breedIn: 0,
      deep: false,
      defense: 0,
    },
  ];
  const seen = seenWith(new Array<boolean>(size.x * size.y).fill(true), camps, size.x, size.y);
  return { ...start, camps, nextCampId: 6, seen };
}

/** Open the game on `state`, zoomed out to the whole map. */
async function openRevealed(page: Page, state: FrontierState): Promise<Locator> {
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-shown', String(32 * 32));
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the map is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i += 1) await page.mouse.wheel(0, 400);
  await expect(canvas).toHaveAttribute('data-cells', '32');
  return canvas;
}

/** A square where a tap takes or mines something, as near the middle of the map as can be. */
function usefulSquare(state: FrontierState): { x: number; y: number } {
  for (let d = 0; d < 16; d += 1) {
    for (let dy = -d; dy <= d; dy += 1) {
      for (let dx = -d; dx <= d; dx += 1) {
        const x = 16 + dx;
        const y = 16 + dy;
        const kind = previewTap(state, x, y).kind;
        if (kind === 'mined' || kind === 'harvested') return { x, y };
      }
    }
  }
  throw new Error('no useful square');
}

/** Tap square (x, y) of the map as it is on screen now. */
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

const groundDraws = async (canvas: Locator): Promise<number> =>
  Number(await canvas.getAttribute('data-ground-draws'));

test('a fully revealed map: a tap draws the ground once, around the square only, and its cue frames none', async ({
  page,
}) => {
  const state = revealedWorld();
  const canvas = await openRevealed(page, state);
  const square = usefulSquare(state);
  const before = await groundDraws(canvas);
  await tapSquare(page, canvas, square.x, square.y);
  await expect(canvas).toHaveAttribute('data-last-tap', new RegExp(`${square.x},${square.y}$`));
  await expect.poll(() => groundDraws(canvas)).toBe(before + 1);
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'part');
  // The cue after the tap runs for a while: its frames copy the ground and draw nothing else of it.
  await page.waitForTimeout(1500);
  expect(await groundDraws(canvas)).toBe(before + 1);
});

test('a fully revealed map: drawing the ground around a tap gives the same picture as drawing it all', async ({
  page,
}) => {
  const state = revealedWorld();
  const canvas = await openRevealed(page, state);
  // The whole ground drawn again after a size change and back, as it will
  // be below, so both pictures have been through the same resizes (the
  // canvas's last pixel column can round differently after one).
  await page.setViewportSize({ width: 391, height: 844 });
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'all');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'all');
  // Three taps, each drawing a part of the ground.
  let world = state;
  for (let k = 0; k < 3; k += 1) {
    const square = usefulSquare(world);
    const before = await groundDraws(canvas);
    await tapSquare(page, canvas, square.x, square.y);
    await expect.poll(() => groundDraws(canvas)).toBe(before + 1);
    await expect(canvas).toHaveAttribute('data-ground-drawn', 'part');
    // The same tap in the model, so the next one is chosen from the world as it is now.
    world = frontierAct(world, { kind: 'tap', x: square.x, y: square.y }).state;
  }
  await page.waitForTimeout(1500); // the cues end
  // Keep the canvas's pixels in the page, to compare them there.
  const keep = (): Promise<void> =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('no 2D context');
      const store = window as unknown as { kept?: ImageData[] };
      store.kept = [...(store.kept ?? []), ctx.getImageData(0, 0, c.width, c.height)];
    });
  await keep(); // the ground drawn in parts
  // A new canvas size draws the whole ground again; back to the old size, again.
  await page.setViewportSize({ width: 391, height: 844 });
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'all');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'all');
  await page.waitForTimeout(300);
  await keep(); // the ground drawn all at once
  // The same picture. Chromium's rasteriser rounds some pixels of a clipped
  // draw a little differently (at most 4 levels in 255 when this was
  // written): allowed. A square drawn wrong or missed would change a
  // thousand pixels or more, by far more.
  const diff = await page.evaluate(() => {
    const kept = (window as unknown as { kept: ImageData[] }).kept;
    const a = kept[0]?.data ?? new Uint8ClampedArray();
    const b = kept[1]?.data ?? new Uint8ClampedArray();
    let off = 0; // pixels more than 2 levels off
    let most = 0;
    for (let i = 0; i < a.length; i += 4) {
      let worst = 0;
      for (let k = 0; k < 3; k += 1)
        worst = Math.max(worst, Math.abs((a[i + k] ?? 0) - (b[i + k] ?? 0)));
      if (worst > 2) off += 1;
      most = Math.max(most, worst);
    }
    return { off, most, total: a.length / 4, same: a.length === b.length };
  });
  expect(diff.same).toBe(true);
  expect(diff.most).toBeLessThanOrEqual(8);
  expect(diff.off).toBeLessThan(diff.total / 1000);
});

test('a fully revealed map: a short pan draws no ground until it stops, then draws it once', async ({
  page,
}) => {
  const state = revealedWorld();
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-shown', String(32 * 32));
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the map is not on screen');
  const before = await groundDraws(canvas);
  const camX = await canvas.getAttribute('data-cam-x');
  // A drag of 100 px, in steps: the ground is shifted, not drawn again.
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(x - i * 10, y);
  expect(await canvas.getAttribute('data-cam-x')).not.toBe(camX);
  expect(await groundDraws(canvas)).toBe(before);
  await page.mouse.up();
  // Once it has stopped, the ground is drawn once for where it stopped.
  await expect.poll(() => groundDraws(canvas)).toBe(before + 1);
  await expect(canvas).toHaveAttribute('data-ground-drawn', 'all');
  await page.waitForTimeout(500);
  expect(await groundDraws(canvas)).toBe(before + 1);
});
