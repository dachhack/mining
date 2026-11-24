// UI lab 1 (issue #116): the camera of the tall lab map.
import { describe, expect, it } from 'vitest';
import {
  centredLabCamera,
  LAB_EDGE_MARGIN_PX,
  clampLabCamera,
  pannedLab,
  rowsOf,
  zoomedLab,
} from '../../src/app/lab/labCamera';
import { PREVIEW_MAP } from '../../src/app/map/palette';

const GROUND = { x: 32, y: 32 };
/** A map window twice as tall as it is wide. */
const TALL = { width: 300, height: 600 };

describe('the lab camera', () => {
  it('shows twice as many rows as columns in a window twice as tall', () => {
    expect(rowsOf({ x: 0, y: 0, cells: 10 }, TALL)).toBe(20);
  });

  it('opens centred on the middle of the map', () => {
    const camera = centredLabCamera(10, GROUND, TALL);
    expect(camera).toEqual({ x: 11, y: 6, cells: 10 });
  });

  it('keeps the window over the map, but for a margin past each edge', () => {
    const camera = pannedLab({ x: 0, y: 0, cells: 10 }, 10000, -10000, GROUND, TALL);
    // The margin, in squares at this zoom: 64 px with 30 px squares.
    const margin = (LAB_EDGE_MARGIN_PX * 10) / TALL.width;
    expect(camera.x).toBeCloseTo(-margin);
    expect(camera.y).toBeCloseTo(12 + margin); // 32 rows - 20 shown, then the margin
    // Enough to drag a corner square clear of the buttons over the map's corners (8 px in, 40 px tall).
    expect(LAB_EDGE_MARGIN_PX).toBeGreaterThanOrEqual(8 + 40);
  });

  it('allows the same margin, on screen, at every zoom', () => {
    for (const cells of [8, 16, 32]) {
      const camera = pannedLab({ x: 0, y: 0, cells }, 100000, 0, GROUND, TALL);
      const cellPx = TALL.width / cells;
      expect(-camera.x * cellPx).toBeCloseTo(LAB_EDGE_MARGIN_PX);
    }
  });

  it('centres the map down when the window shows more rows than it has, and keeps the side margin', () => {
    const camera = clampLabCamera({ x: 5, y: 5, cells: 32 }, GROUND, TALL);
    expect(camera.y).toBe(-16);
    expect(camera.x).toBe(5); // within the margin: 64 px is about 6.8 squares at this zoom
    expect(clampLabCamera({ x: 50, y: 5, cells: 32 }, GROUND, TALL).x).toBeCloseTo(
      (LAB_EDGE_MARGIN_PX * 32) / TALL.width,
    );
  });

  it('keeps the zoom inside its range', () => {
    expect(clampLabCamera({ x: 0, y: 0, cells: 1 }, GROUND, TALL).cells).toBe(PREVIEW_MAP.minCells);
    expect(clampLabCamera({ x: 0, y: 0, cells: 99 }, GROUND, TALL).cells).toBe(32);
  });

  it('a zoom keeps the point under the fingers in place', () => {
    const before = { x: 10, y: 6, cells: 12 };
    const point = { x: 150, y: 300 };
    const after = zoomedLab(before, 8, point, point, GROUND, TALL);
    const square = (cam: typeof before) => ({
      x: cam.x + point.x / (TALL.width / cam.cells),
      y: cam.y + point.y / (TALL.width / cam.cells),
    });
    expect(square(after).x).toBeCloseTo(square(before).x);
    expect(square(after).y).toBeCloseTo(square(before).y);
  });
});
