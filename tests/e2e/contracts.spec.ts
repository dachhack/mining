// Progression PR 5 (docs/plans/progression-phases.md, sections 1 and 5): a
// contract is taken from the board while the market is open, or filled
// there at once when the store holds what it asks for, or delivered from
// the goals card (🎯) during the day, which shows the phase and its goal. The run is saved and opened as the game opens any saved run.
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

/** Seed 110 on shift 30 (a market day), its camp at level 3 (tier 1 open), the market open. */
function marketDay(): FrontierState {
  const start = createFrontier(110);
  return {
    ...start,
    shift: 30,
    marketOpen: true,
    camps: start.camps.map((c) => ({ ...c, level: 3 })),
  };
}

test('take a contract at the market when the store is short of what it asks for', async ({
  page,
}) => {
  const base = marketDay();
  const offer = contractBoard(base)[0];
  if (offer === undefined) throw new Error('no contract on the board');
  await openGame(page, base);
  await expect(page.getByTestId('lab2-book-card')).toBeVisible();
  // Nothing to fill it with: Take, not Fill.
  await expect(page.getByTestId(`lab2-contract-fill-${offer.id}`)).toHaveCount(0);
  await page.getByTestId(`lab2-contract-take-${offer.id}`).click();
  await expect(page.getByTestId('lab2-book-note')).toContainText(`Taken: ${offer.name}`);
  // It is held now, and listed at the market as one of yours.
  await expect(page.getByTestId(`lab2-contract-marketHeld-${offer.id}`)).toBeVisible();
});

test('fill a contract at the market at once when the store holds what it asks for', async ({
  page,
}) => {
  // Owner, on the hazards build: "Should be able to immediately fill
  // contracts if you have the materials."
  const base = marketDay();
  const offer = contractBoard(base)[0];
  if (offer === undefined) throw new Error('no contract on the board');
  const state: FrontierState = {
    ...base,
    inventory: new Map(offer.asks.map((a) => [a.item, a.count] as [string, number])),
  };
  await openGame(page, state);
  await expect(page.getByTestId(`lab2-contract-take-${offer.id}`)).toHaveCount(0);
  await page.getByTestId(`lab2-contract-fill-${offer.id}`).click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    `Filled: ${offer.name}, for ${offer.pays} coins.`,
  );
  await expect(page.getByTestId('lab-coins')).toHaveAttribute('data-count', String(offer.pays));
  await page.getByTestId('lab2-market-close').click();
  // A tier-1 contract done: phase 4. Filling it at the market cost no tap.
  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId('lab2-goal')).toHaveText(FRONTIER_PHASES[3]?.next ?? '');
  // The contract stage, and what opens the next one (owner, after the 0.25.0 build).
  await expect(page.getByTestId('lab2-contract-stage')).toContainText('Contract stage');
  await expect(page.getByTestId('lab2-contract-stage')).toContainText('(you have 1)');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps),
  );
});

test('deliver a contract held from the goals card during the day, for its coins', async ({
  page,
}) => {
  const base = marketDay();
  const offer = contractBoard(base)[0];
  if (offer === undefined) throw new Error('no contract on the board');
  const state: FrontierState = {
    ...base,
    marketOpen: false,
    contracts: [{ id: offer.id, takenOn: 30 }],
    inventory: new Map(offer.asks.map((a) => [a.item, a.count] as [string, number])),
  };
  await openGame(page, state);
  await expect(page.getByTestId('lab2-goals')).toHaveAttribute('data-deliverable', 'true');
  // Lit gold, as the old tray button was (owner, after the 0.22.0 build).
  await expect(page.getByTestId('lab2-goals')).toHaveCSS('background-image', /linear-gradient/);
  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId('lab2-goal')).toHaveText(FRONTIER_PHASES[2]?.next ?? '');
  // As many contracts as the best camp's level (3) may be held.
  await expect(page.getByTestId('lab2-book-card')).toContainText('Your contracts · 1 of 3');
  await page.getByTestId(`lab2-contract-deliver-${offer.id}`).click();
  await expect(page.getByTestId('lab2-book-note')).toHaveText(
    `Delivered: ${offer.name}, for ${offer.pays} coins.`,
  );
  await expect(page.getByTestId('lab-coins')).toHaveAttribute('data-count', String(offer.pays));
  await expect(page.getByTestId('lab2-goal')).toHaveText(FRONTIER_PHASES[3]?.next ?? '');
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute(
    'data-taps',
    String(FRONTIER_SHIFT.taps), // delivering is free (owner, after the 0.20.0 build)
  );
});

test('a contract held can be delivered with no taps left (owner: "I can\'t deliver these?")', async ({
  page,
}) => {
  const base = marketDay();
  const offer = contractBoard(base)[0];
  if (offer === undefined) throw new Error('no contract on the board');
  const state: FrontierState = {
    ...base,
    marketOpen: false,
    tapsLeft: 0,
    contracts: [{ id: offer.id, takenOn: 30 }],
    inventory: new Map(offer.asks.map((a) => [a.item, a.count] as [string, number])),
  };
  await openGame(page, state);
  await page.getByTestId('lab2-goals').click();
  await expect(page.getByTestId(`lab2-contract-deliver-${offer.id}`)).toBeEnabled();
  await page.getByTestId(`lab2-contract-deliver-${offer.id}`).click();
  await expect(page.getByTestId('lab-coins')).toHaveAttribute('data-count', String(offer.pays));
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-taps', '0');
});
