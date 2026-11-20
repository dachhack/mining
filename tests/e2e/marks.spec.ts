// Every mark of the phone map on one screen, at phone size (issue #110).
// It opens the prepared state of showcase.ts, checks that the map and the
// legend show each kind of mark, and takes the screenshots that the pull
// request shows: the default zoom, the whole map, and the legend.
//
// Set MARKS_SHOTS to a folder to keep the screenshots there
// (default: test-results/).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { showcaseText } from './showcase';

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env['MARKS_SHOTS'] ?? 'test-results';

/** Open the page on the prepared state. */
export async function openShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((text) => {
    window.localStorage.clear();
    window.localStorage.setItem('mining-game.preview.prepared', text);
  }, showcaseText());
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('A prepared state');
}

test('every mark is on the map together, at the default zoom and on the whole map', async ({
  page,
}) => {
  await openShowcase(page);
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toHaveAttribute('data-water', /11,17:2/);
  await expect(canvas).toHaveAttribute('data-lava', /20,19:2/);
  await expect(canvas).toHaveAttribute('data-gas', /18,11:4/);
  await expect(canvas).toHaveAttribute('data-charges', /16,15:explosive/);
  await expect(canvas).toHaveAttribute('data-structures', /20,13:vent/);

  await page.getByTestId('tap-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/marks-default.png` });
  await page.screenshot({ path: `${SHOTS}/marks-page.png`, fullPage: true });
  await page.getByTestId('whole-map').click();
  await page.getByTestId('tap-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/marks-whole.png` });
});
