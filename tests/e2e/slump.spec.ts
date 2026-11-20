// Pit walls slump on the phone preview (issue #94), at phone size: a mine
// that would make squares unstable needs a second tap, cracked squares show
// on the map and in the notes, and the support tool places a support.
//
// Seed 1 (see `npm run play -- --seed 1`): x15 y12 and the four squares
// beside it are dirt on open ground, with stone under the middle one.
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
  // The squares start after the rulers along the top and the left of the map.
  const originPx = Number(data['originPx']);
  await page.touchscreen.tap(
    box.x + originPx + (x - Number(data['camX']) + 0.5) * cellPx,
    box.y + originPx + (y - Number(data['camY']) + 0.5) * cellPx,
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
  await page.getByLabel('Seed').fill('1');
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.getByTestId('seed')).toHaveText('Seed 1');

  const canvas = page.getByTestId('map-canvas');
  const outcome = page.getByTestId('outcome');
  const supportTool = page.getByTestId('tool-support');
  await expect(supportTool).toHaveText('Support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // Shift 1: a plus of five dirt squares, one level down. Nothing is risky yet.
  for (const [x, y] of [
    [15, 12],
    [14, 12],
    [16, 12],
    [15, 11],
    [15, 13],
  ] as const) {
    await tapSquare(page, canvas, x, y);
    await expect(outcome).toContainText(`Mine x${x} y${y}`);
  }
  await page.getByTestId('end-shift').click();
  await expect(page.getByTestId('gauges')).toContainText('Shift 2');

  // Shift 2: the middle a second level down would make six squares
  // unstable. The first tap only warns and marks them.
  await tapSquare(page, canvas, 15, 12);
  await expect(outcome).toContainText('Mining x15 y12 would make x15 y10');
  await expect(outcome).toContainText('Tap the square again');
  await expect(canvas).toHaveAttribute('data-selected', '15,12');
  await expect(canvas).toHaveAttribute('data-unstable', '15,10 16,11 13,12 17,12 14,13 15,14');
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  // The second tap on the same square takes it. The block is stone, which is
  // what a support needs besides timber.
  await tapSquare(page, canvas, 15, 12);
  await expect(outcome).toContainText('Got 1 Stone');
  await expect(canvas).toHaveAttribute('data-unstable', '');
  await page.locator('.actions-heading').click();
  await page.locator('[data-choice="craft-support"]').click();
  await expect(supportTool).toHaveText('Support (1)');
  await page.getByTestId('end-shift').click();

  // Shift 3: the six squares have cracked.
  // The map draws the crack and its countdown (the phone has no note for it).
  await expect(canvas).toHaveAttribute('data-cracks', /(^| )13,12:2( |$)/);
  await expect(page.getByTestId('hazards')).toContainText(
    'x13 y12 is cracked: due at the end of the next shift',
  );
  await expect(page.getByTestId('map-legend')).toContainText('crack');

  // The support tool: on, a tap places the support instead of mining.
  await supportTool.click();
  await expect(supportTool).toHaveAttribute('aria-pressed', 'true');
  await tapSquare(page, canvas, 13, 12);
  await expect(outcome).toContainText('Placed a support.');
  await expect(canvas).toHaveAttribute('data-cracks', /(^| )13,12:2:stopped( |$)/);
  await expect(canvas).toHaveAttribute('data-structures', /13,12:support/);
  // The last support is placed: a tap mines again.
  await expect(supportTool).toHaveText('Support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // With no support left the tool says so and changes nothing.
  await supportTool.click();
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('You have no support to place');
  await page.screenshot({
    path: process.env['SLUMP_SHOT'] ?? 'test-results/slump.png',
    fullPage: true,
  });
});
