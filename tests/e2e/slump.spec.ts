// Pit walls slump on the phone preview (issue #94), at phone size: a mine
// that would make squares unstable needs a second tap, cracked squares show
// on the map and in the notes, and the support tool places a support.
//
// Seed 1 (see `npm run play -- --seed 1`). The squares the test taps are not
// written here by hand: squares.ts finds, on the seed's cube, a plus of five
// dirt squares on open ground with stone under the middle one, and works out
// which squares a second mine of the middle makes unstable.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { findRiskyPlus, key, openingView, startOf } from './squares';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 1;
const START = startOf(SEED);
/** A plus of five dirt squares with stone under the middle one. */
const PLUS = findRiskyPlus(START, openingView(START));
const MIDDLE = PLUS.middle;
/** The first two squares that digging the middle a second level down makes unstable. */
const CRACKED = PLUS.unstable[0] as { x: number; y: number };
const OTHER = PLUS.unstable[1] as { x: number; y: number };

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
  const supportTool = page.getByTestId('tool-support');
  await expect(supportTool).toHaveText('Support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // Shift 1: a plus of five dirt squares, one level down. Nothing is risky yet.
  for (const square of PLUS.plus) {
    await tapSquare(page, canvas, square.x, square.y);
    await expect(outcome).toContainText(`Mine x${square.x} y${square.y}`);
  }
  await page.getByTestId('end-shift').click();
  await expect(page.getByTestId('gauges')).toContainText('Shift 2');

  // Shift 2: the middle a second level down would make squares unstable.
  // The first tap only warns and marks them.
  await tapSquare(page, canvas, MIDDLE.x, MIDDLE.y);
  await expect(outcome).toContainText(
    `Mining x${MIDDLE.x} y${MIDDLE.y} would make x${CRACKED.x} y${CRACKED.y}`,
  );
  await expect(outcome).toContainText('Tap the square again');
  await expect(canvas).toHaveAttribute('data-selected', key(MIDDLE));
  await expect(canvas).toHaveAttribute('data-unstable', PLUS.unstable.map(key).join(' '));
  await expect(page.getByTestId('gauges')).toContainText('AP 5/5');
  // The second tap on the same square takes it. The block is stone, which is
  // what a support needs besides timber.
  await tapSquare(page, canvas, MIDDLE.x, MIDDLE.y);
  await expect(outcome).toContainText('Got 1 Stone');
  await expect(canvas).toHaveAttribute('data-unstable', '');
  await page.locator('.actions-heading').click();
  await page.locator('[data-choice="craft-support"]').click();
  await expect(supportTool).toHaveText('Support (1)');
  await page.getByTestId('end-shift').click();

  // Shift 3: those squares have cracked.
  // The map draws the crack and its countdown (the phone has no note for it).
  await expect(canvas).toHaveAttribute('data-cracks', new RegExp(`(^| )${key(CRACKED)}:2( |$)`));
  await expect(page.getByTestId('hazards')).toContainText(
    `x${CRACKED.x} y${CRACKED.y} is cracked: due at the end of the next shift`,
  );
  await expect(page.getByTestId('map-legend')).toContainText('crack');

  // The support tool: on, a tap places the support instead of mining.
  await supportTool.click();
  await expect(supportTool).toHaveAttribute('aria-pressed', 'true');
  await tapSquare(page, canvas, CRACKED.x, CRACKED.y);
  await expect(outcome).toContainText('Placed a support.');
  await expect(canvas).toHaveAttribute(
    'data-cracks',
    new RegExp(`(^| )${key(CRACKED)}:2:stopped( |$)`),
  );
  await expect(canvas).toHaveAttribute('data-structures', new RegExp(`${key(CRACKED)}:support`));
  // The last support is placed: a tap mines again.
  await expect(supportTool).toHaveText('Support (0)');
  await expect(supportTool).toHaveAttribute('aria-pressed', 'false');

  // With no support left the tool says so and changes nothing.
  await supportTool.click();
  await tapSquare(page, canvas, OTHER.x, OTHER.y);
  await expect(outcome).toContainText('You have no support to place');
  await page.screenshot({
    path: process.env['SLUMP_SHOT'] ?? 'test-results/slump.png',
    fullPage: true,
  });
});
