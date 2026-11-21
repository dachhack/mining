// UI lab 1 (issue #116): the camera of the tall lab map.
import { describe, expect, it } from 'vitest';
import {
  centredLabCamera,
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

  it('keeps the window over the map', () => {
    const camera = pannedLab({ x: 0, y: 0, cells: 10 }, 10000, -10000, GROUND, TALL);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(12); // 32 rows - 20 shown
  });

  it('centres the map when the window shows more rows than it has', () => {
    const camera = clampLabCamera({ x: 5, y: 5, cells: 32 }, GROUND, TALL);
    expect(camera).toEqual({ x: 0, y: -16, cells: 32 });
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
