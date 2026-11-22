// The game (Lab 2 becomes the game, plan B1): the app opens on it, it is
// saved every shift, and it carries on when the app opens again (question
// 152). The old game and the labs are under Other versions until removed.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { campTap, newCampWorld, sightMap } from '../../src/app/lab/campWorld';

test.use({ viewport: { width: 390, height: 844 } });

const SEED = 110;

/** Tap square (x, y) of the map (on screen at the opening zoom). */
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

/** A lit square near the first camp where a tap takes or mines something. */
function usefulSquare(): { x: number; y: number } {
  const world = newCampWorld(SEED);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const width = world.lab.state.size.x;
  const sights = sightMap(world);
  for (let d = 2; d < 6; d += 1) {
    for (const [x, y] of [
      [camp.x - d, camp.y],
      [camp.x + d, camp.y],
      [camp.x, camp.y + d],
    ] as const) {
      const kind = campTap(world, x, y).kind;
      if (sights[x + width * y] === 'shown' && (kind === 'mined' || kind === 'harvested')) {
        return { x, y };
      }
    }
  }
  throw new Error('nothing useful near the camp');
}

test('the app opens on the game; the old game and the labs are under Other versions', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('lab2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mining Game' })).toBeVisible();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-shift', '1');
  await page.getByRole('button', { name: 'Other versions' }).click();
  await expect(page.getByTestId('launcher')).toBeVisible();
  await expect(page.getByTestId('launch-game')).toBeVisible();
  await expect(page.getByTestId('launch-lab1')).toBeVisible();
  await page.getByTestId('launch-play').click();
  await expect(page.getByRole('heading', { name: 'Mining Game' })).toBeVisible();
});

test('a run is saved every shift and carries on when the app opens again', async ({ page }) => {
  await page.goto(`/#play/${SEED}`);
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  const canvas = page.getByTestId('lab-map');
  const hud = page.getByTestId('lab2-hud');
  const square = usefulSquare();
  await tapSquare(page, canvas, square.x, square.y);
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps - 1));
  await page.getByTestId('lab2-end-shift').click();
  await expect(hud).toHaveAttribute('data-shift', '2');
  const animals = await canvas.getAttribute('data-animals');
  const dug = await page.getByTestId('lab-dug').getAttribute('data-count');

  // Open the app again (no seed in the address): the same run, at shift 2.
  await page.goto('/');
  await page.reload();
  await expect(page.getByTestId('lab-seed')).toHaveText(`Seed ${SEED}`);
  await expect(hud).toHaveAttribute('data-shift', '2');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps));
  await expect(canvas).toHaveAttribute('data-animals', animals ?? '');
  await expect(page.getByTestId('lab-dug')).toHaveAttribute('data-count', dug ?? '');

  // A tap in this shift is not saved until the shift ends: reopened, the shift starts again.
  const again = usefulSquare();
  await tapSquare(page, canvas, again.x, again.y);
  await page.reload();
  await expect(hud).toHaveAttribute('data-shift', '2');
  await expect(hud).toHaveAttribute('data-taps', String(FRONTIER_SHIFT.taps));

  // New run takes two taps, and starts again at shift 1.
  await page.getByTestId('new-run').click();
  await expect(page.getByTestId('new-run')).toHaveText('Sure?');
  await expect(hud).toHaveAttribute('data-shift', '2');
  await page.getByTestId('new-run').click();
  await expect(hud).toHaveAttribute('data-shift', '1');
  await page.reload();
  await expect(hud).toHaveAttribute('data-shift', '1');
});

test('a closed mine stays closed when the app opens again', async ({ page }) => {
  await page.goto(`/#play/${SEED}`);
  await page.getByTestId('lab2-close-mine').click();
  await page.getByTestId('lab2-close-mine').click();
  await expect(page.getByTestId('lab2-over')).toBeVisible();
  await page.goto('/');
  await page.reload();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'closed');
  await expect(page.getByTestId('lab2-over')).toContainText('Mine closed');
  // New run needs one tap once the run is over.
  await page.getByTestId('new-run').click();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'active');
});
