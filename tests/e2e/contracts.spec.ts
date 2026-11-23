// Progression PR 5 (docs/plans/progression-phases.md, sections 1 and 5): the
// market's card shows the phase and its goal, the contract board on a
// market day, and the contract held, which is taken, then delivered for
// its coins. The run is saved and opened as the game opens any saved run.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { FRONTIER_PHASES, FRONTIER_SHIFT } from '../../src/data/frontier';
import { contractBoard, createFrontier, saveFrontier } from '../../src/engine';
import type { FrontierState } from '../../src/engine';

test.use({ viewport: { width: 390, height: 844 } });

const RUN_KEY = 'mining-game.run';

async function openGame(page: Page, state: FrontierState): Promise<void> {
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    RUN_KEY,
    saveFrontier(state),
  ] as const);
  await page.reload();
  await expect(page.getByTestId('lab-map')).toHaveAttribute('data-camps', '1');
}

test('take a contract from the board on a market day, and deliver it for its coins', async ({
  page,
}) => {
  // Seed 110 on shift 30 (a market day), its camp at level 3: tier 1 is open.
  const start = createFrontier(110);
  const base: FrontierState = {
    ...start,
    shift: 30,
    camps: start.camps.map((c) => ({ ...c, level: 3 })),
  };
  const offer = contractBoard(base)[0];
  if (offer === undefined) throw new Error('no contract on the board');
  const state: FrontierState = {
    ...base,
    inventory: new Map(offer.asks.map((a) => [a.item, a.count] as [string, number])),
  };
  await openGame(page, state);

  await page.getByTestId('lab2-market').click();
  await expect(page.getByTestId('lab2-goal')).toHaveText(FRONTIER_PHASES[2]?.next ?? '');
  await page.getByTestId(`lab2-contract-take-${offer.id}`).click();
  await expect(page.getByTestId('lab2-book-note')).toContainText(`Taken: ${offer.name}`);
  await expect(page.getByTestId('lab2-market')).toHaveAttribute('data-deliverable', 'true');
  await page.getByTestId(`lab2-contract-deliver-${offer.id}`).click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    `Delivered: ${offer.name}, for ${offer.pays} coins.`,
  );
  await expect(page.getByTestId('lab-coins')).toHaveAttribute('data-count', String(offer.pays));
  // A tier-1 contract done: phase 4.
  await expect(page.getByTestId('lab2-goal')).toHaveText(FRONTIER_PHASES[3]?.next ?? '');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps - 2),
  );
});
