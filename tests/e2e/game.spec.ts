// The game (Lab 2 becomes the game, plan B1): the app opens on it, it is
// saved every shift, and it carries on when the app opens again (question
// 152). The old game and the labs are under Other versions until removed.
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { FRONTIER_SHIFT } from '../../src/data/frontier';
import { STORY_PAGES } from '../../src/app/lab/story';
import { ROTATING_TIPS } from '../../src/app/lab/tutorial';
import { campTap, newCampWorld, sightMap } from '../../src/app/lab/campWorld';
import { createFrontier, saveFrontier } from '../../src/engine';

/** Skip the night that follows End shift or Rest (a tap on it), and see it go. */
async function skipNight(page: Page): Promise<void> {
  const night = page.getByTestId('lab2-night');
  await expect(night).toBeVisible();
  await night.click();
  await expect(night).toHaveCount(0);
}

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
  // A brand-new run opens with the story (below): skip it.
  await page.getByTestId('lab2-story-skip').click();
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
  await skipNight(page);
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
  // The map has no Close mine button now (owner, UI rework); a run saved
  // closed (by an older build) still opens closed.
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    'mining-game.run',
    saveFrontier({ ...createFrontier(SEED), status: 'closed' }),
  ] as const);
  await page.reload();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'closed');
  await expect(page.getByTestId('lab2-over')).toContainText('Mine closed');
  // New run needs one tap once the run is over.
  await page.getByTestId('new-run').click();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-status', 'active');
});

test('a new run opens with the story of the Old Hold: taps turn its pages, Skip ends it', async ({
  page,
}) => {
  // Owner, after the 0.26.0 build: "Let's go with old hold. On your grandpa's
  // death bed he relates the story of lost treasures and beseeches you to
  // reclaim the lost glory of the family."
  await page.goto('/');
  const story = page.getByTestId('lab2-story');
  await expect(story).toBeVisible();
  await expect(story).toHaveAttribute('data-page', '1');
  await expect(page.getByTestId('lab2-story-text')).toContainText('grandfather');
  // A tap turns the page; the last tap starts the run.
  for (let k = 2; k <= STORY_PAGES.length; k += 1) {
    await story.click({ position: { x: 20, y: 20 } });
    await expect(story).toHaveAttribute('data-page', String(k));
  }
  await expect(page.getByTestId('lab2-story-text')).toContainText('Reclaim your family’s heritage');
  await story.click({ position: { x: 20, y: 20 } });
  await expect(story).toHaveCount(0);
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-shift', '1');
  // Carrying a run on tells no story.
  await page.reload();
  await expect(page.getByTestId('lab2-hud')).toHaveAttribute('data-shift', '1');
  await expect(story).toHaveCount(0);
  // New run (two taps: it throws the run away) tells it again; Skip ends it.
  await page.getByTestId('new-run').click();
  await page.getByTestId('new-run').click();
  await expect(story).toBeVisible();
  await page.getByTestId('lab2-story-skip').click();
  await expect(story).toHaveCount(0);
});

test('the first run is guided: the tutorial card moves on as each step is done, and Skip ends it', async ({
  page,
}) => {
  // Owner, after the 0.26.0 build: "we need a short tutorial mode"; asked:
  // a guided first run.
  await page.goto('/');
  const card = page.getByTestId('lab2-tutorial');
  // It starts when the story ends.
  await expect(card).toBeHidden();
  await page.getByTestId('lab2-story-skip').click();
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-step', 'gather');
  await expect(page.getByTestId('lab2-tutorial-text')).toContainText('Tap grass or a tree');
  // Gather something: the card moves on to digging.
  const seed = Number((await page.getByTestId('lab-seed').innerText()).replace(/\D+/g, ''));
  const world = newCampWorld(seed);
  const camp = world.camps[0] ?? { x: 0, y: 0 };
  const sights = sightMap(world);
  const width = world.lab.state.size.x;
  // The nearest lit square (not under the HUD or the buttons: within 3 of the
  // camp) whose tap gathers wood or grass.
  let plant: { x: number; y: number } | null = null;
  for (let d = 2; d <= 3 && plant === null; d += 1) {
    for (let dy = -d; dy <= d && plant === null; dy += 1) {
      for (let dx = -d; dx <= d && plant === null; dx += 1) {
        const x = camp.x + dx;
        const y = camp.y + dy;
        if (sights[x + width * y] !== 'shown') continue;
        const tapped = campTap(world, x, y);
        const got = (item: string): number => tapped.world.lab.counts.get(item) ?? 0;
        if (tapped.kind === 'harvested' && got('wood') + got('grass') > 0) plant = { x, y };
      }
    }
  }
  if (plant === null) throw new Error('a plant near the camp');
  const canvas = page.getByTestId('lab-map');
  await tapSquare(page, canvas, plant.x, plant.y);
  await expect(card).toHaveAttribute('data-step', 'dig');
  // The step is kept: a reload carries on from it.
  await page.reload();
  await expect(card).toHaveAttribute('data-step', 'dig');
  // Skip ends it; Replay (in the contracts card) starts it again.
  await page.getByTestId('lab2-tutorial-button').click();
  await expect(card).toBeHidden();
  await page.getByTestId('lab2-goals').click();
  await page.getByTestId('lab2-tutorial-replay').click();
  await expect(card).toBeVisible();
  // From the first step: the reload went back to the start of the shift (a
  // run is saved at End shift), so nothing is gathered yet.
  await expect(card).toHaveAttribute('data-step', 'gather');
});

test('a later thing gets a one-time tip: a dragon', async ({ page }) => {
  const start = createFrontier(110);
  const camp = start.camps[0] ?? { x: 0, y: 0 };
  const dragons = [{ id: 1, x: camp.x + 3, y: camp.y, dx: 1, dy: 0, restTaps: 3 }];
  await page.goto('/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    'mining-game.run',
    saveFrontier({ ...start, hazards: { ...start.hazards, dragons, nextDragonId: 2 } }),
  ] as const);
  await page.reload();
  const card = page.getByTestId('lab2-tutorial');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-kind', 'tip');
  await expect(page.getByTestId('lab2-tutorial-text')).toContainText('A dragon!');
  await page.getByTestId('lab2-tutorial-button').click();
  await expect(card).toBeHidden();
  // Once ever.
  await page.reload();
  await expect(page.getByTestId('lab-map')).toHaveAttribute('data-camps', '1');
  await expect(card).toBeHidden();
});

test('the tutorial card minimizes into a ? above End shift; after the tutorial the ? turns through tips', async ({
  page,
}) => {
  // Owner, after the 0.27.0 build: "Need to be able to minimize the tutorial
  // card into a ? above the end shift button. It becomes just a tip rotation
  // after the tutorial."
  await page.goto('/');
  await page.getByTestId('lab2-story-skip').click();
  const card = page.getByTestId('lab2-tutorial');
  const help = page.getByTestId('lab2-help');
  await expect(card).toBeVisible();
  await expect(help).toBeHidden();
  // Minimize: the card goes, the ? shows, just above End shift.
  await page.getByTestId('lab2-tutorial-min').click();
  await expect(card).toBeHidden();
  await expect(help).toBeVisible();
  const q = await help.boundingBox();
  const end = await page.getByTestId('lab2-end-shift').boundingBox();
  if (q === null || end === null) throw new Error('the ? and End shift are on screen');
  expect(q.y + q.height).toBeLessThanOrEqual(end.y);
  expect(end.y - (q.y + q.height)).toBeLessThan(24);
  expect(Math.abs(q.x - end.x)).toBeLessThan(12);
  // It stays minimized over a reload; the ? brings the step back.
  await page.reload();
  await expect(help).toBeVisible();
  await expect(card).toBeHidden();
  await help.click();
  await expect(card).toHaveAttribute('data-step', 'gather');
  await expect(help).toBeHidden();
  // Skip: the tutorial is over, and the ? is what is left.
  await page.getByTestId('lab2-tutorial-button').click();
  await expect(card).toBeHidden();
  await expect(help).toBeVisible();
  // Now the ? turns through the tips, round and round.
  await help.click();
  await expect(card).toHaveAttribute('data-kind', 'rotate');
  const text = page.getByTestId('lab2-tutorial-text');
  await expect(text).toHaveText(ROTATING_TIPS[0] ?? '');
  await page.getByTestId('lab2-tutorial-button').click();
  await expect(text).toHaveText(ROTATING_TIPS[1] ?? '');
  // Minimize closes it; the next time it opens on the tip it was on.
  await page.getByTestId('lab2-tutorial-min').click();
  await expect(card).toBeHidden();
  await help.click();
  await expect(text).toHaveText(ROTATING_TIPS[1] ?? '');
});
