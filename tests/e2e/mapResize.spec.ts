// The map is never stretched (owner, on the hazards build: "I clicked on a
// block outside of the circle and the screen stretched out"). The canvas
// takes its pixel size when it is drawn; when its box changes size without
// a draw (the tray or the hint growing or shrinking, the phone turning), it
// must be drawn again, or the browser stretches the old picture to the new
// box.
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

/** The canvas's on-screen shape against its pixels' shape: 1 when nothing is stretched. */
async function stretch(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const box = c.getBoundingClientRect();
    return box.width / box.height / (c.width / c.height);
  });
}

test('the map is drawn again when its box changes size, so it is never stretched', async ({
  page,
}) => {
  await page.goto('/');
  const canvas = page.getByTestId('lab-map');
  await expect(canvas).toHaveAttribute('data-camps', '1');
  expect(Math.abs((await stretch(canvas)) - 1)).toBeLessThan(0.02);
  // The tray grows, with no tap and no window resize: the map's box gets
  // shorter, as when a panel's rows change after the last draw.
  const before = await canvas.evaluate((el) => el.getBoundingClientRect().height);
  await page.getByTestId('lab2-tray').evaluate((el) => {
    const block = document.createElement('div');
    block.style.height = '150px';
    el.append(block);
  });
  await expect
    .poll(async () => canvas.evaluate((el) => el.getBoundingClientRect().height))
    .not.toBe(before);
  await expect.poll(async () => Math.abs((await stretch(canvas)) - 1)).toBeLessThan(0.02);
});
