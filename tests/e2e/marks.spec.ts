// Every mark of the phone map on one screen, at phone size (issue #110).
// It opens the prepared state of showcase.ts, checks that the map and the
// legend show each kind of mark, and takes the screenshots that the pull
// request shows: the default zoom, the whole map, and the legend.
//
// Set MARKS_SHOTS to a folder to keep the screenshots there
// (default: test-results/).
import { expect, test } from '@playwright/test';
import { openShowcase } from './mapHelpers';

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env['MARKS_SHOTS'] ?? 'test-results';

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
  // Every tell has a mark: damp stone, pitted rock, warm glow, hairline glow.
  await expect(canvas).toHaveAttribute('data-tells', /14,14:d/);
  await expect(canvas).toHaveAttribute('data-tells', /11,15:p/);
  await expect(canvas).toHaveAttribute('data-tells', /20,15:h/);
  await expect(canvas).toHaveAttribute('data-tells', /17,21:w/);
  // The squares the crew worked, and the cracks with their countdowns.
  await expect(canvas).toHaveAttribute('data-worked', '15,14 15,15 16,15');
  await expect(canvas).toHaveAttribute('data-cracks', '22,11:2 22,12:1 22,13:2:stopped');

  // The legend explains each of them.
  const legend = page.getByTestId('map-legend');
  for (const words of [
    'damp stone (blue drips): water under or beside',
    'pitted rock (a row of black pits): gas under or beside',
    'warm glow (orange heat lines): lava within 2',
    'hairline glow (pale ring): unstable ore',
    'white corners: the crew worked here this shift',
    'mining costs 1 AP less, never below 1',
    'mining there costs 1 AP more',
    'blue drop: water flows here',
    'orange flame: lava flows here',
    'gas (bubbles)',
    'grey crack: countdown stopped',
  ]) {
    await expect(legend).toContainText(words);
  }

  // The forecast: one line for each thing, the most dangerous first. ("MAY":
  // the crack on x22 y12 falls first and uncovers a block nobody has seen.)
  const lines = page.getByTestId('forecast').locator('li');
  await expect(lines.first()).toContainText('THE CREW MAY LOSE 6 health: the blast on');
  await expect(page.getByTestId('forecast')).toContainText('THE EXPLOSIVE on x16 y15 GOES OFF');
  await expect(lines.last()).toContainText('fuel 18 -> 17');
  await expect(page.getByTestId('hazards')).toContainText('gas stands on 5 squares');

  await page.getByTestId('tap-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/marks-default.png` });
  await page.screenshot({ path: `${SHOTS}/marks-page.png`, fullPage: true });
  await page.getByTestId('whole-map').click();
  await page.getByTestId('tap-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/marks-whole.png` });
});
