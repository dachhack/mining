// Helpers the map's e2e tests share: where a square is on the page, a tap on
// it, and opening the page on the prepared state of showcase.ts.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { showcaseText } from './showcase';

/** Open the page on the prepared state (see `PREPARED_KEY` in src/app/previewSession.ts). */
export async function openShowcase(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((text) => {
    window.localStorage.clear();
    window.localStorage.setItem('mining-game.preview.prepared', text);
  }, showcaseText());
  await page.reload();
  await expect(page.getByTestId('note')).toContainText('A prepared state');
}

/** What the map's canvas says of its camera (see the `data-` attributes set in mapView.ts). */
export interface MapCamera {
  /** The square at the top-left corner of the map. */
  x: number;
  y: number;
  /** How many squares the map shows across. */
  cells: number;
  /** The size of a square in pixels. */
  cellPx: number;
  /** Where the squares start on the canvas: after the rulers. */
  originPx: number;
}

export async function mapCamera(canvas: Locator): Promise<MapCamera> {
  const data = await canvas.evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return {
    x: Number(data['camX']),
    y: Number(data['camY']),
    cells: Number(data['cells']),
    cellPx: Number(data['cellPx']),
    originPx: Number(data['originPx']),
  };
}

/** Where the middle of the square (x, y) of the map is on the page. */
export async function squareCentre(
  canvas: Locator,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const cam = await mapCamera(canvas);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('the map is not on screen');
  }
  return {
    x: box.x + cam.originPx + (x - cam.x + 0.5) * cam.cellPx,
    y: box.y + cam.originPx + (y - cam.y + 0.5) * cam.cellPx,
  };
}

/** Tap the square (x, y) of the map, as a finger would. */
export async function tapSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  const at = await squareCentre(canvas, x, y);
  await page.touchscreen.tap(at.x, at.y);
}
