// The camp-made tools on the phone preview (issue #104), at phone size: the
// seal tool appears once sealant is crafted and seals a square with a tap;
// the look tool, and holding a square, list what is known under a top; the
// map marks a square with known blocks below.
//
// Seed 1 (see `npm run play -- --seed 1`): the patch round x17 y12 is clear,
// flat ground. x16 y10 is stone and x14 y14 is coal, both near that patch.
// (A pump needs ingots and a scanner charge needs crystal, which no short
// run reaches: those two tools are tested in tests/app/tapMapTools.test.ts.)
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

/** Where the middle of the square (x, y) of the map is on the page. */
async function squareCentre(canvas: Locator, x: number, y: number) {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cellPx = Number(data['cellPx']);
  return {
    x: box.x + (x - Number(data['camX']) + 0.5) * cellPx,
    y: box.y + (y - Number(data['camY']) + 0.5) * cellPx,
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
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill('1');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText('Seed 1');

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

  // Shift 1: found a camp. Shift 2: mine stone and coal near it.
  await page.getByTestId('tool-camp').click();
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('The camp stands on x16-18, y11-13');
  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 2');
  await tapSquare(page, canvas, 16, 10);
  await expect(outcome).toContainText('Got 1 Stone');
  await tapSquare(page, canvas, 14, 14);
  await expect(outcome).toContainText('Got 1 Coal');

  // Craft sealant at the camp: the seal tool appears.
  await page.getByText('Other actions').click();
  await page.locator('[data-choice="craft-sealant"]').click();
  await expect(outcome).toContainText('Got 1 Sealant');
  await expect(sealTool).toHaveText('Seal (1)');

  // A square at ground level is refused, and nothing is used up.
  await sealTool.click();
  await expect(sealTool).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText('sealed rock');
  await tapSquare(page, canvas, 15, 10);
  await expect(outcome).toContainText('x15 y10 is at ground level');
  await expect(canvas).toHaveAttribute('data-selected', '15,10');
  await expect(sealTool).toHaveText('Seal (1)');

  // The dug square is sealed with one tap; the tool goes with the last sealant.
  await tapSquare(page, canvas, 16, 10);
  await expect(outcome).toContainText('Sealed x16 y10: its top block is now sealed rock');
  await expect(gauges).toContainText('AP 1/5');
  await expect(sealTool).toBeHidden();
  await expect(page.getByTestId('map-legend')).toContainText('Sealed rock');
  // The block the sealant buried was seen, so it is known under the new top.
  await expect(canvas).toHaveAttribute('data-below', '16,10:-');
  await expect(page.getByTestId('map-legend')).toContainText('plain rock known below');

  // The look tool lists it, and takes nothing.
  await lookTool.click();
  await tapSquare(page, canvas, 16, 10);
  await expect(outcome).toContainText('x16 y10, ground level: Sealed rock');
  await expect(outcome).toContainText('Known under the top block:');
  await expect(outcome).toContainText('depth 1: Dirt');
  await expect(gauges).toContainText('AP 1/5');
  await lookTool.click();
  await expect(lookTool).toHaveAttribute('aria-pressed', 'false');

  // Holding a square does the same with the mining tool on, and does not mine it.
  const at = await squareCentre(canvas, 15, 10);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(outcome).toContainText('x15 y10, ground level');
  await expect(outcome).toContainText('Nothing is known under the top block');
  await expect(gauges).toContainText('AP 1/5');
  await page.screenshot({
    path: process.env['TOOLS_SHOT'] ?? 'test-results/tools.png',
    fullPage: true,
  });
});
