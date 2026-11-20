// The forecast of crew damage on the phone (issue #112): the lines with
// amounts, the red frames on the map, and the confirm step before an End
// shift that would lose the run.
//
// The scene is the one of the review of PR #111: the showcase state with the
// crew's worked squares where a slump, water, lava and gas will reach them.
// On main, ending that shift took crew health from 8 to 0 with no warning.
//
// Set MARKS_SHOTS to a folder to keep the screenshots there
// (default: test-results/).
import { expect, test } from '@playwright/test';
import { serialise } from '../../src/engine';
import { clearWorked, markWorked } from '../../src/engine/crew';
import { openPrepared, openShowcase } from './mapHelpers';
import { showcaseState } from './showcase';

test.use({ viewport: { width: 390, height: 844 } });

const SHOTS = process.env['MARKS_SHOTS'] ?? 'test-results';

/** The showcase state with the worked squares of the review's scene. */
function lostSceneText(): string {
  const state = showcaseState();
  clearWorked(state);
  markWorked(state, 20, 12); // a slump lands here
  markWorked(state, 13, 17); // water flows here
  markWorked(state, 20, 20); // lava flows here
  markWorked(state, 19, 11); // gas
  markWorked(state, 18, 11); // gas
  return JSON.stringify(serialise(state));
}

test('a shift that would lose the run: amounts, red frames, and a second tap to end it', async ({
  page,
}) => {
  await openPrepared(page, lostSceneText());
  const forecast = page.getByTestId('forecast');
  const lines = forecast.locator('li');
  const button = page.getByTestId('end-shift');
  const warning = page.getByTestId('end-shift-warning');

  // The forecast opens with the lost run, then one line for each hazard, the
  // largest amount first, then the total.
  await expect(lines.nth(0)).toContainText('THE RUN');
  await expect(lines.nth(0)).toContainText(
    'THE RUN MAY BE LOST if you end the shift now: the crew has 8 health; it will lose 3 and may lose 7 more.',
  );
  await expect(forecast).toContainText('5 health: lava on x20 y20');
  await expect(forecast).toContainText('3 health: the slump at x20 y12');
  await expect(forecast).toContainText('1 health: water flowing onto x13 y17');
  await expect(forecast).toContainText(
    'Crew health 8 -> 5 for certain, 0 if all that may happen does',
  );

  // The map frames the worked squares where the crew will be hurt.
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toHaveAttribute('data-crew-hurt', /20,12/);
  await expect(canvas).toHaveAttribute('data-crew-hurt', /13,17/);
  await expect(canvas).toHaveAttribute('data-crew-hurt', /20,20/);
  // The slump is certain (a whole frame); the rest only may happen (dashed).
  await expect(canvas).toHaveAttribute('data-crew-hurt-may', /13,17/);
  await expect(canvas).toHaveAttribute('data-crew-hurt-may', /20,20/);
  await expect(canvas).not.toHaveAttribute('data-crew-hurt-may', /20,12/);
  const legend = page.getByTestId('map-legend');
  await expect(legend).toContainText('red frame: the crew worked here and will be hurt');
  await expect(legend).toContainText('dashed red frame: the crew worked here and may be hurt');

  // The button says so before any tap, and the first tap only asks.
  await expect(button).toContainText('End shift (');
  await expect(warning).toBeHidden();
  await page.getByTestId('tap-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/crew-forecast-map.png` });
  await page.screenshot({ path: `${SHOTS}/crew-forecast-page.png`, fullPage: true });

  await button.click();
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('if you end the shift now');
  await expect(button).toHaveText('Tap again to end the shift anyway');
  await expect(page.getByTestId('gauges')).toContainText('Crew health 8');
  await expect(page.getByTestId('ended')).toBeHidden();
  await button.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/crew-forecast-confirm.png` });
  // Nothing on the page is wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Doing something else withdraws the question.
  await page.getByTestId('tool-look').click();
  await expect(warning).toBeHidden();
  await expect(button).toContainText('End shift (');

  // Two taps end the shift, and the run is lost as the forecast said.
  await button.click();
  await button.click();
  await expect(page.getByTestId('ended')).toContainText('the run is lost');
  await expect(button).toBeHidden();
});

test('a shift that hurts the crew but does not lose the run ends at one tap', async ({ page }) => {
  // The showcase: the crew worked in the blast of the charge (6 of 8 health).
  await openShowcase(page);
  const button = page.getByTestId('end-shift');
  await expect(button).toHaveText('End shift');
  await expect(page.getByTestId('forecast')).toContainText(
    'Crew health 8 -> 8 for certain, 2 if all that may happen does',
  );
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-crew-hurt', /15,15/);
  await button.click();
  await expect(page.getByTestId('end-shift-warning')).toBeHidden();
  await expect(page.getByTestId('gauges')).toContainText('Crew health 2');
});
