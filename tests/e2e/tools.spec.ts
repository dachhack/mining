// The camp-made tools on the phone preview (issue #104), at phone size: the
// seal tool appears once sealant is crafted and seals a square with a tap;
// the look tool, and holding a square, list what is known under a top; the
// map marks a square with known blocks below.
//
// Seed 1 (see `npm run play -- --seed 1`). The squares the test taps are not
// written here by hand: squares.ts finds, on the seed's cube, a clear flat
// patch for the camp, a stone square beside it and a square near it with
// coal in layer 1. (The top layer holds no coal, question 140: the coal is
// dug for.)
// (A pump needs ingots and a scanner charge needs crystal, which no short
// run reaches: those two tools are tested in tests/app/tapMapTools.test.ts.)
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { findCampSpotWithCoal, key, openingView, startOf } from './squares';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 1;
const START = startOf(SEED);
/** A clear patch for the camp, stone beside it, coal to dig for, and a spare dirt square. */
const SPOT = findCampSpotWithCoal(START, openingView(START));
const CAMP = SPOT.centre;
const STONE = SPOT.stoneBeside;
const SPARE = SPOT.spare;

/** Where the middle of the square (x, y) of the map is on the page. */
async function squareCentre(canvas: Locator, x: number, y: number) {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cellPx = Number(data['cellPx']);
  // The squares start after the rulers along the top and the left of the map.
  const originPx = Number(data['originPx']);
  return {
    x: box.x + originPx + (x - Number(data['camX']) + 0.5) * cellPx,
    y: box.y + originPx + (y - Number(data['camY']) + 0.5) * cellPx,
  };
}

/** Tap the square (x, y) of the map, as a finger would. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const at = await squareCentre(canvas, x, y);
  await page.touchscreen.tap(at.x, at.y);
}

test('sealant is crafted and used from the tool bar; look and hold list a square', async ({
  page,
}) => {
  await page.goto('/#game');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill(String(SEED));
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText(`Seed ${SEED}`);

  const canvas = page.getByTestId('map-canvas');
  const outcome = page.getByTestId('outcome');
  const gauges = page.getByTestId('gauges');
  const sealTool = page.getByTestId('tool-seal');
  const lookTool = page.getByTestId('tool-look');

  // No sealant, pump or scanner charge yet: those tools are not shown. Look is.
  await expect(sealTool).toBeHidden();
  await expect(page.getByTestId('tool-pump')).toBeHidden();
  await expect(page.getByTestId('tool-scan')).toBeHidden();
  await expect(lookTool).toHaveText('Inspect');

  // Shift 1: found a camp. Shift 2: dig round the coal square and take its
  // top. Shift 3: mine the coal under it, and the stone square beside the camp.
  await page.getByTestId('tool-camp').click();
  await tapSquare(page, canvas, CAMP.x, CAMP.y);
  await expect(outcome).toContainText(
    `The camp stands on x${CAMP.x - 1}-${CAMP.x + 1}, y${CAMP.y - 1}-${CAMP.y + 1}`,
  );
  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 2');
  // Each of these mines costs 1 AP near the camp: the whole shift.
  let apLeft = 5;
  for (const square of [...SPOT.around, SPOT.coal]) {
    await tapSquare(page, canvas, square.x, square.y);
    apLeft -= 1;
    await expect(gauges).toContainText(`AP ${apLeft}/5`);
  }
  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 3');
  await tapSquare(page, canvas, SPOT.coal.x, SPOT.coal.y);
  if (SPOT.coalRisky) {
    // The pit round it is only 1 deep, so the map warns first; nothing in
    // this test ends the shift again, so nothing cracks.
    await expect(outcome).toContainText('Tap the square again to mine it all the same');
    await tapSquare(page, canvas, SPOT.coal.x, SPOT.coal.y);
  }
  await expect(outcome).toContainText('Got 1 Coal');
  await tapSquare(page, canvas, STONE.x, STONE.y);
  await expect(outcome).toContainText('Got 1 Stone');

  // Craft sealant at the camp: the seal tool appears.
  await page.locator('.actions-heading').click();
  await page.locator('[data-choice="craft-sealant"]').click();
  await expect(outcome).toContainText('Got 1 Sealant');
  await expect(sealTool).toHaveText('Seal (1)');

  // A square at ground level is refused, and nothing is used up.
  await sealTool.click();
  await expect(sealTool).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText('sealed rock');
  await tapSquare(page, canvas, SPARE.x, SPARE.y);
  await expect(outcome).toContainText(`x${SPARE.x} y${SPARE.y} is at ground level`);
  await expect(canvas).toHaveAttribute('data-selected', key(SPARE));
  await expect(sealTool).toHaveText('Seal (1)');

  // The dug square is sealed with one tap; the tool goes with the last sealant.
  await tapSquare(page, canvas, STONE.x, STONE.y);
  await expect(outcome).toContainText(
    `Sealed x${STONE.x} y${STONE.y}: its top block is now sealed rock`,
  );
  await expect(gauges).toContainText('AP 1/5');
  await expect(sealTool).toBeHidden();
  await expect(page.getByTestId('map-legend')).toContainText('Sealed rock');
  // The block the sealant buried was seen, so it is known under the new top.
  await expect(canvas).toHaveAttribute('data-below', `${key(STONE)}:-`);
  await expect(page.getByTestId('map-legend')).toContainText('plain rock known below');
  // The note under the map words the hint for the phone, not for the play tool.
  await expect(page.getByTestId('map-notes')).toContainText(
    'Hold a square, or tap it with Inspect',
  );
  await expect(page.getByTestId('map-notes')).not.toContainText('look X,Y');

  // The look tool lists it, and takes nothing.
  await lookTool.click();
  await tapSquare(page, canvas, STONE.x, STONE.y);
  await expect(outcome).toContainText(`x${STONE.x} y${STONE.y}, ground level: Sealed rock`);
  await expect(outcome).toContainText('Known under the top block:');
  await expect(outcome).toContainText(`depth 1: ${SPOT.underStone}`);
  await expect(gauges).toContainText('AP 1/5');
  await lookTool.click();
  await expect(lookTool).toHaveAttribute('aria-pressed', 'false');

  // Holding a square does the same with the mining tool on, and does not mine it.
  const at = await squareCentre(canvas, SPARE.x, SPARE.y);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(outcome).toContainText(`x${SPARE.x} y${SPARE.y}, ground level`);
  await expect(outcome).toContainText('Nothing is known under the top block');
  await expect(gauges).toContainText('AP 1/5');
  await page.screenshot({
    path: process.env['TOOLS_SHOT'] ?? 'test-results/tools.png',
    fullPage: true,
  });
});
