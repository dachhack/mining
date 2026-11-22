// The start screen and UI lab 1 (issue #116), at phone size (390 x 844).
//
// The lab opens on seed 110 through its address (#lab1/110). What a tap
// should give is worked out here with the same lab code the build runs
// (`labTap`): the engine is deterministic, so the cube is the same.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { BLOCKS, blockDefByCode } from '../../src/data';
import { topBlockAt } from '../../src/engine';
import { labTap, newLabWorld } from '../../src/app/lab/labWorld';
import type { LabWorld } from '../../src/app/lab/labWorld';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 110;

/** The square at the map's top-left corner and the size of a square, from the canvas's data- attributes. */
async function camera(canvas: Locator): Promise<{ x: number; y: number; cellPx: number }> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return { x: Number(data['camX']), y: Number(data['camY']), cellPx: Number(data['cellPx']) };
}

/** Tap square (x, y), as a finger would. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const cam = await camera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  await page.touchscreen.tap(
    box.x + (x - cam.x + 0.5) * cam.cellPx,
    box.y + (y - cam.y + 0.5) * cam.cellPx,
  );
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

/** The counts the counter should show for a lab world. */
function expectedCounts(world: LabWorld): Record<string, number> {
  const shown: Record<string, number> = { dug: world.mined };
  for (const [item, count] of world.counts) {
    shown[item] = count;
  }
  return shown;
}

/** Open the lab on `SEED` and return its map, with the square near the middle of the screen. */
async function openLab(page: Page): Promise<{ canvas: Locator; cx: number; cy: number }> {
  await page.goto(`/#lab1/${SEED}`);
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  const canvas = page.getByTestId('lab-map');
  const cam = await camera(canvas);
  return { canvas, cx: Math.floor(cam.x) + 5, cy: Math.floor(cam.y) + 5 };
}

test('the start screen leads to the game and to lab 1, and back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('launcher')).toBeVisible();

  await page.getByTestId('launch-lab1').click();
  await expect(page.getByTestId('lab')).toBeVisible();
  await expect(page.getByTestId('lab-hint')).toContainText('Tap a block to mine it');
  await page.getByRole('button', { name: 'Back to the start screen' }).click();
  await expect(page.getByTestId('launcher')).toBeVisible();

  await page.getByTestId('launch-game').click();
  await expect(page.getByTestId('status')).toContainText('Engine v');
  await page.getByTestId('back-to-start').click();
  await expect(page.getByTestId('launcher')).toBeVisible();
});

test('tapping squares mines them and the counter rises; a refused tap changes nothing', async ({
  page,
}) => {
  const { canvas, cx, cy } = await openLab(page);
  // Dig a 3 x 3 pit, then its middle once more (all four neighbours are now level with it).
  const taps: [number, number][] = [];
  for (let y = cy - 1; y <= cy + 1; y += 1) {
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      taps.push([x, y]);
    }
  }
  taps.push([cx, cy]);

  let world = newLabWorld(SEED);
  for (const [x, y] of taps) {
    const tap = labTap(world, x, y);
    expect(tap.result.mined, `square ${x},${y} should be mineable`).toBe(true);
    world = tap.world;
    await tapSquare(page, canvas, x, y);
    await expect(canvas).toHaveAttribute('data-last-tap', `mined ${x},${y}`);
  }
  await expect.poll(() => counts(page)).toEqual(expectedCounts(world));
  expect((await counts(page))['dug']).toBe(taps.length);

  // The middle is now 2 down and its neighbours 1 down: the level rule refuses it.
  const before = await counts(page);
  await tapSquare(page, canvas, cx, cy);
  await expect(canvas).toHaveAttribute('data-last-tap', `refused ${cx},${cy}`);
  await expect(page.getByTestId('lab-hint')).toContainText('Too steep');
  expect(await counts(page)).toEqual(before);
  // And the next legal tap still works: the refusal changed nothing.
  await tapSquare(page, canvas, cx + 2, cy);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${cx + 2},${cy}`);
});

test('shadows fall on the edges that face a higher square', async ({ page }) => {
  const { canvas, cx, cy } = await openLab(page);
  // Two squares side by side, A then B to its east, each 1 down on level ground.
  // A is shaded on its west edge (higher ground) but not its east (B is level),
  // and B the other way round.
  const a = { x: cx, y: cy };
  const b = { x: cx + 1, y: cy };
  await tapSquare(page, canvas, a.x, a.y);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${a.x},${a.y}`);
  await tapSquare(page, canvas, b.x, b.y);
  await expect(canvas).toHaveAttribute('data-last-tap', `mined ${b.x},${b.y}`);
  // Let the flash of the mine fade.
  await page.waitForTimeout(1200);

  /** The mean brightness of a strip of square (x, y), read from the canvas's pixels. */
  async function strip(x: number, y: number, side: 'west' | 'east'): Promise<number> {
    return canvas.evaluate(
      (el, args) => {
        const c = el as HTMLCanvasElement;
        const scale = c.width / c.clientWidth;
        const cell = Number(c.dataset['cellPx']) * scale;
        const left = (args.x - Number(c.dataset['camX'])) * scale * Number(c.dataset['cellPx']);
        const top = (args.y - Number(c.dataset['camY'])) * scale * Number(c.dataset['cellPx']);
        // A strip 12 % of the square wide, just inside the edge, away from the corners.
        const width = Math.round(cell * 0.12);
        const sx = Math.round(args.side === 'west' ? left + cell * 0.06 : left + cell * 0.82);
        const sy = Math.round(top + cell * 0.25);
        const ctx = c.getContext('2d');
        if (ctx === null) {
          return -1;
        }
        const data = ctx.getImageData(sx, sy, width, Math.round(cell * 0.5)).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
        }
        return sum / (data.length / 4) / 3;
      },
      { x, y, side },
    );
  }

  const aWest = await strip(a.x, a.y, 'west');
  const aEast = await strip(a.x, a.y, 'east');
  const bWest = await strip(b.x, b.y, 'west');
  const bEast = await strip(b.x, b.y, 'east');
  // The shaded edge is clearly darker than the open one, in both squares.
  expect(aWest).toBeLessThan(aEast * 0.85);
  expect(bEast).toBeLessThan(bWest * 0.85);
});

test('the map never moves while the counter fills up', async ({ page }) => {
  // Review of PR #117: when the counter wrapped onto a second line the map
  // moved down, so a tap aimed at one square mined the one above it.
  const { canvas } = await openLab(page);
  const cam = await camera(canvas);
  const world = newLabWorld(SEED);

  // On screen, one untouched square for each kind of item a top block yields
  // (stone, timber, ...), found with the engine. The top layer holds no coal
  // (question 140), so a square is also taken if a second tap on it (the
  // block below) yields an item not found yet: that is how coal is reached.
  const firstOfItem = new Map<string, { x: number; y: number; taps: number }>();
  for (let y = Math.ceil(cam.y); y < Math.floor(cam.y) + 10; y += 1) {
    for (let x = Math.ceil(cam.x); x < Math.floor(cam.x) + 10; x += 1) {
      const block = blockDefByCode(topBlockAt(world.state, x, y));
      const item = block.yields[0]?.item;
      const first = labTap(world, x, y);
      if (item !== undefined && !firstOfItem.has(item) && first.result.mined) {
        firstOfItem.set(item, { x, y, taps: 1 });
      }
    }
  }
  for (let y = Math.ceil(cam.y); y < Math.floor(cam.y) + 10 && firstOfItem.size < 3; y += 1) {
    for (let x = Math.ceil(cam.x); x < Math.floor(cam.x) + 10 && firstOfItem.size < 3; x += 1) {
      const used = [...firstOfItem.values()].some(
        (sq) => Math.abs(sq.x - x) + Math.abs(sq.y - y) <= 1,
      );
      const first = labTap(world, x, y);
      if (used || !first.result.mined) continue;
      const second = labTap(first.world, x, y);
      const item = second.result.yields[0]?.item;
      if (second.result.mined && item !== undefined && !firstOfItem.has(item)) {
        firstOfItem.set(item, { x, y, taps: 2 });
      }
    }
  }
  // With "Dug", at least four chips: the number that used to wrap at 390 px.
  expect(firstOfItem.size).toBeGreaterThanOrEqual(3);
  expect(BLOCKS.dirt.yields).toEqual([]);

  const before = await canvas.boundingBox();
  const counterBefore = await page.getByTestId('lab-counter').boundingBox();
  if (before === null) {
    throw new Error('the map is not on screen');
  }
  // Every tap uses the map position read once, before the first tap, as a
  // player's finger does: if the map had moved, the tap would land on
  // another square and `data-last-tap` would name it.
  for (const [item, square] of firstOfItem) {
    for (let tap = 0; tap < square.taps; tap += 1) {
      await page.touchscreen.tap(
        before.x + (square.x - cam.x + 0.5) * cam.cellPx,
        before.y + (square.y - cam.y + 0.5) * cam.cellPx,
      );
      await expect(canvas).toHaveAttribute('data-last-tap', `mined ${square.x},${square.y}`);
      expect(await canvas.boundingBox()).toEqual(before);
    }
    await expect(page.getByTestId(`lab-res-${item}`)).toBeVisible();
    expect(await canvas.boundingBox()).toEqual(before);
  }
  expect(await page.getByTestId('lab-counter').boundingBox()).toEqual(counterBefore);

  // A refused tap writes a longer hint; that must not move the map either.
  const [first] = firstOfItem.values();
  if (first !== undefined) {
    await tapSquare(page, canvas, first.x, first.y);
    await expect(canvas).toHaveAttribute('data-last-tap', `refused ${first.x},${first.y}`);
  }
  await page.waitForTimeout(400); // let the shake finish
  expect(await canvas.boundingBox()).toEqual(before);
});
