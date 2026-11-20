// Pit walls slump on the phone preview (issue #94), at phone size: a mine
// that would make squares unstable needs a second tap, cracked squares show
// on the map and in the notes, and the support tool places a support.
//
// Seed 7 (see `npm run play -- --seed 7`): the squares round x15 y17 are dirt
// on open ground, and x17 y17 is stone.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

/** Tap the square (x, y) of the map, as a finger would. */
async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  const cellPx = Number(data['cellPx']);
  await page.touchscreen.tap(
    box.x + (x - Number(data['camX']) + 0.5) * cellPx,
    box.y + (y - Number(data['camY']) + 0.5) * cellPx,
  );
}

test('a risky mine needs a second tap; cracks show; the support tool places a support', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.clear();
  });
  await page.reload();
  await page.getByRole('button', { name: 'New run' }).click();
  await page.getByLabel('Seed').fill('7');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText('Seed 7');

  const canvas = page.getByTestId('map-canvas');
  const outcome = page.getByTestId('outcome');
  const supportTool = page.getByTestId('tool-support');
  await expect(supportTool).toHaveText('Place support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // Shift 1: a plus of five dirt squares, one level down. Nothing is risky yet.
  for (const [x, y] of [
    [15, 17],
    [14, 17],
    [16, 17],
    [15, 16],
    [15, 18],
  ] as const) {
    await tapSquare(page, canvas, x, y);
    await expect(outcome).toContainText(`Mine x${x} y${y}`);
  }
  await page.getByTestId('end-shift').click();
  await expect(page.getByTestId('gauges')).toContainText('Shift 2');

  // Shift 2: the middle a second level down would make five squares
  // unstable. The first tap only warns and marks them.
  await tapSquare(page, canvas, 15, 17);
  await expect(outcome).toContainText('Mining x15 y17 would make x14 y16');
  await expect(outcome).toContainText('Tap the square again');
  await expect(canvas).toHaveAttribute('data-selected', '15,17');
  await expect(canvas).toHaveAttribute('data-unstable', '14,16 16,16 14,18 16,18 15,19');
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  // The second tap on the same square takes it.
  await tapSquare(page, canvas, 15, 17);
  await expect(outcome).toContainText('Mined Dirt');
  await expect(canvas).toHaveAttribute('data-unstable', '');

  // Stone for a support, and the support itself.
  await tapSquare(page, canvas, 17, 17);
  await expect(outcome).toContainText('Got 1 Stone');
  await page.getByText('Other actions').click();
  await page.locator('[data-choice="craft-support"]').click();
  await expect(supportTool).toHaveText('Place support (1)');
  await page.getByTestId('end-shift').click();

  // Shift 3: the five squares have cracked.
  await expect(page.getByTestId('map-notes')).toContainText('On x14 y16: a crack, countdown 2');
  await expect(page.getByTestId('forecast')).toContainText('x14 y16 is cracked');
  await expect(page.getByTestId('map-legend')).toContainText('crack');

  // The support tool: on, a tap places the support instead of mining.
  await supportTool.click();
  await expect(supportTool).toHaveAttribute('aria-pressed', 'true');
  await tapSquare(page, canvas, 14, 16);
  await expect(outcome).toContainText('Placed a support.');
  await expect(page.getByTestId('map-notes')).toContainText(
    'On x14 y16: a crack, countdown 2, a support',
  );
  // The last support is placed: a tap mines again.
  await expect(supportTool).toHaveText('Place support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // With no support left the tool says so and changes nothing.
  await supportTool.click();
  await tapSquare(page, canvas, 16, 16);
  await expect(outcome).toContainText('You have no support to place');
  await page.screenshot({
    path: process.env['SLUMP_SHOT'] ?? 'test-results/slump.png',
    fullPage: true,
  });
});
