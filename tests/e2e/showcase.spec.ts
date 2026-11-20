// A path through the phone screen that a short played run cannot reach
// (issue #110 item 11): a standing camp, a camp-made tool, and the vent
// button. It starts from the prepared state of showcase.ts, which holds a
// camp, a vent in the stockpile and gas in a basin at x16-20, y11-13.
import { expect, test } from '@playwright/test';
import { openShowcase, tapSquare } from './mapHelpers';

test.use({ viewport: { width: 390, height: 844 } });

test('with a camp standing: the vent tool places a vent, the crew rests, the vent clears gas', async ({
  page,
}) => {
  await openShowcase(page);
  const canvas = page.getByTestId('map-canvas');
  const outcome = page.getByTestId('outcome');
  const gauges = page.getByTestId('gauges');
  const ventTool = page.getByTestId('tool-vent');

  // The camp: its note is worded for the phone, and its choices are listed.
  await expect(page.getByTestId('map-notes')).toContainText('Camp at x12 y12 (depth 1)');
  await expect(page.getByTestId('map-notes')).toContainText('under "Other actions"');
  await page.locator('.actions-heading').click();
  const rest = page.locator('[data-choice="rest 12,12"]');
  await expect(rest).toContainText('Rest at the camp at x12 y12');
  // The small print is the cost, not the play tool's typed name.
  await expect(rest.locator('.choice-meta')).toHaveText('5 AP');
  await expect(page.locator('[data-choice="craft-sealant"]')).toBeVisible();

  // A tap on a camp square is refused in the phone's words: the button, not
  // the play tool's "decommission 12,12" (review of PR #111).
  await canvas.scrollIntoViewIfNeeded();
  await tapSquare(page, canvas, 12, 12);
  await expect(outcome).toContainText(
    'decommission the camp first ("Decommission" under "Other actions")',
  );
  await expect(outcome).not.toContainText('decommission 12,12');
  await expect(gauges).toContainText('AP 5/5');

  // The vent tool: the first tap marks the range, the second places the vent.
  await expect(ventTool).toHaveText('Vent (1)');
  await ventTool.click();
  await expect(ventTool).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText(
    'which squares a vent there would clear',
  );
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('A vent here clears all the gas on the 13 marked squares');
  await expect(canvas).toHaveAttribute('data-selected', '17,12');
  await expect(canvas).toHaveAttribute('data-range', /17,10/);
  await expect(canvas).toHaveAttribute('data-structures', /^(?!.*17,12:vent)/);
  await tapSquare(page, canvas, 17, 12);
  await expect(outcome).toContainText('Placed a vent.');
  await expect(canvas).toHaveAttribute('data-structures', /17,12:vent/);
  await expect(gauges).toContainText('AP 4/5');
  // The last vent is placed: the button goes, and a tap mines again.
  await expect(ventTool).toBeHidden();
  // Both vents will clear what stands near them: every gassy square is marked.
  await expect(canvas).toHaveAttribute('data-vented', /17,11.*18,11.*17,12.*18,12/);
  await expect(page.getByTestId('forecast')).toContainText('The vents will clear gas');
  // The placed vent's square is worked this shift, and the map marks it.
  await expect(canvas).toHaveAttribute('data-worked', /17,12/);

  // The crew rests at the camp, and the shift ends.
  await rest.click();
  await expect(outcome).toContainText('The crew rests at the camp at x12 y12');
  await expect(gauges).toContainText('AP 0/5');
  await page.getByTestId('end-shift').click();
  await expect(gauges).toContainText('Shift 3');
  await expect(outcome).toContainText('The vents cleared gas');
  // One unit spread onto x19 y11, three steps from both vents, before they
  // cleared the rest: a vent reaches 2 steps.
  await expect(canvas).toHaveAttribute('data-gas', '19,11:1');
});
