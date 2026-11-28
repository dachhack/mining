// Smelting and crafting (docs/plans/smelting-and-crafting.md). PR 1: build a
// smelter from a level-2 camp's panel (owner, question 161), then smelt raw
// ore into ingots from the recipe book (question 162), and undo it. PR 3:
// make an iron pickaxe and mine with it, and make a copper lantern and hang
// it at a camp (question 163).
//
// The run is saved and opened as the game opens any saved run: the first
// camp at level 2, holding enough stone and clay for a smelter, and raw
// iron and coal for one batch. (Reaching level 3 and mining ore on the page
// would take hundreds of taps; the engine's tests cover how the items are
// got.)
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  FRONTIER_LANTERN,
  FRONTIER_PICKAXE,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
} from '../../src/data/frontier';
import { campRadius, createFrontier, previewTap, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the game keeps its run (`RUN_KEY` in src/app/lab/campScreen.ts). */
const RUN_KEY = 'mining-game.run';

/** Seed 110 with its first camp at level 2 (with a smelter if `smelter`), holding `inventory`. */
function levelTwoWorld(inventory: Record<string, number>, smelter = false): FrontierState {
  const start = createFrontier(110);
  return {
    ...start,
    camps: start.camps.map((c) => ({ ...c, level: 2, smelter })),
    inventory: new Map(Object.entries(inventory)),
  };
}

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

const count = async (page: Page, item: string): Promise<number> => {
  const chip = page.getByTestId(`lab-res-${item}`);
  return (await chip.count()) === 0 ? 0 : Number(await chip.getAttribute('data-count'));
};

test('a smelter from a level-2 camp is loaded with ore and coal, smelts overnight, and a load can be undone', async ({
  page,
}) => {
  // Owner, after the 0.27.0 build: "you can load up to 20 ore and 10 coal
  // into a smelter and each smelter produces 10 ingots per turn."
  const state = levelTwoWorld({ stone: 25, clay: 12, rawIronOre: 6, coal: 4, wood: 9, apple: 9 });
  const canvas = await openGame(page, state);
  const hud = page.getByTestId('lab2-hud');
  const camp = state.camps[0] ?? { x: 0, y: 0 };

  // The recipe book has no smelting any more.
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-make-smelt-iron')).toHaveCount(0);
  await page.getByTestId('lab2-book-close').click();

  // The camp's panel: Build smelter, with its cost.
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-camp-title')).toContainText('Level 2');
  const build = page.getByTestId('lab2-build-smelter');
  await expect(build).toBeEnabled();
  await build.click();
  const smelter = page.getByTestId('lab2-camp-smelter');
  await expect(smelter).toBeVisible();
  await expect(smelter).toHaveAttribute('data-level', '1');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 1));
  const stoneCost = FRONTIER_SMELTER.cost.find((s) => s.item === 'stone')?.count ?? 0;
  await expect.poll(() => count(page, 'stone')).toBe(25 - stoneCost);

  // Load iron: all 6 ore and all 4 coal go in, for 1 tap. No copper to load.
  const load = page.getByTestId('lab2-smelter-load-rawIronOre');
  await expect(load).toBeEnabled();
  await load.click();
  await expect(smelter).toHaveAttribute('data-iron', '6');
  await expect(smelter).toHaveAttribute('data-coal', '4');
  await expect(smelter).toContainText('ore 6/20');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 2));
  await expect.poll(() => count(page, 'rawIronOre')).toBe(0);
  await expect(page.getByTestId('lab2-smelter-load-rawCopperOre')).toBeDisabled();
  // The level-2 kit is not held: the upgrade is off.
  await expect(page.getByTestId('lab2-smelter-upgrade')).toBeDisabled();

  // Undo takes the load back: the ore, the coal and the tap.
  await page.getByTestId('lab2-undo').click();
  await expect.poll(() => count(page, 'rawIronOre')).toBe(6);
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 1));
  // (Undo closes the panel: open it again.)
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(smelter).toHaveAttribute('data-iron', '0');

  // Load again and end the shift: 6 iron ingots in the morning, 3 coal burnt.
  await page.getByTestId('lab2-smelter-load-rawIronOre').click();
  await page.getByTestId('lab2-camp-close').click();
  await page.getByTestId('lab2-end-shift').click();
  const night = page.getByTestId('lab2-night');
  await expect(night).toBeVisible();
  await expect(page.getByTestId('lab2-night-summary')).toContainText('The smelters 🔥 made 6');
  await night.click();
  await expect.poll(() => count(page, 'ironIngot')).toBe(6);
});

test('an iron pickaxe doubles a mining tap; a copper lantern hung at a camp widens its ring', async ({
  page,
}) => {
  const state = levelTwoWorld({ ironIngot: 3, wood: 2, copperIngot: 2, coal: 1 }, true);
  const canvas = await openGame(page, state);
  const camp = state.camps[0] ?? { x: 0, y: 0 };

  // The book: make the pickaxe and the lantern, 1 tap each.
  await page.getByTestId('lab2-book').click();
  await expect(page.getByTestId('lab2-recipe-does-iron-pickaxe')).toContainText(
    `${FRONTIER_PICKAXE.yieldTimes}×`,
  );
  await page.getByTestId('lab2-recipe-make-iron-pickaxe').click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText('✓ Made 1 iron pickaxe. You have 1.');
  await page.getByTestId('lab2-recipe-make-copper-lantern').click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    '✓ Made 1 copper lantern. You have 1.',
  );
  await page.getByTestId('lab2-book-close').click();
  await expect.poll(() => count(page, FRONTIER_PICKAXE.item)).toBe(1);
  await expect.poll(() => count(page, FRONTIER_LANTERN.item)).toBe(1);

  // Mine a bare square in the ring: it gives twice what the block yields.
  const withPickaxe: FrontierState = {
    ...state,
    inventory: new Map([[FRONTIER_PICKAXE.item, 1]]),
  };
  let square: { x: number; y: number; item: string; plain: number; doubled: number } | null = null;
  for (let dx = 2; dx < campRadius(2) && square === null; dx += 1) {
    for (const [x, y] of [
      [camp.x + dx, camp.y],
      [camp.x - dx, camp.y],
      [camp.x, camp.y + dx],
      [camp.x, camp.y - dx],
    ] as const) {
      const plain = previewTap(state, x, y);
      const doubled = previewTap(withPickaxe, x, y);
      const stack = plain.gain[0];
      if (plain.kind === 'mined' && stack !== undefined) {
        square = {
          x,
          y,
          item: stack.item,
          plain: stack.count,
          doubled: doubled.gain[0]?.count ?? 0,
        };
        break;
      }
    }
  }
  if (square === null) throw new Error('no bare square to mine near the camp');
  expect(square.doubled).toBe(square.plain * FRONTIER_PICKAXE.yieldTimes);
  const before = await count(page, square.item);
  await tapSquare(page, canvas, square.x, square.y);
  await expect.poll(() => count(page, square.item)).toBe(before + square.doubled);

  // The camp's panel: hang the lantern; the ring grows and more is lit.
  const shownBefore = Number(await canvas.getAttribute('data-shown'));
  await tapSquare(page, canvas, camp.x, camp.y);
  await expect(page.getByTestId('lab2-camp-line')).toContainText(`Ring ${campRadius(2)} `);
  await page.getByTestId('lab2-hang-lantern').click();
  await expect(page.getByTestId('lab2-camp-lantern')).toBeVisible();
  await expect(page.getByTestId('lab2-camp-line')).toContainText(
    `Ring ${campRadius(2) + FRONTIER_LANTERN.ringBonus} `,
  );
  await expect.poll(() => count(page, FRONTIER_LANTERN.item)).toBe(0);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-shown')))
    .toBeGreaterThan(shownBefore);
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 4),
  );
});
