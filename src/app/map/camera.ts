// The tap map's camera (issues #66, #69 and #86): which square window of the
// top-down map is on screen, and how many cells it shows across. Plain numbers only, so
// the tests can check it without a browser.
//
// `x` and `y` are the cell at the window's top-left corner, and `cells` is
// how many cells the window shows across (and down: it is square). All
// three may be fractions while the player drags or pinches, so that the map
// follows the fingers smoothly. They are always kept inside the cube, and
// `cells` inside the zoom range.

import { PREVIEW_MAP } from './palette';

export interface Camera {
  x: number;
  y: number;
  /** How many cells the window shows across and down: the zoom level. */
  cells: number;
}

/** How many cells the window shows across at the default zoom. */
export const VIEW_CELLS = PREVIEW_MAP.viewCells;

/** The size of the map, in squares. */
export interface LayerSize {
  x: number;
  y: number;
}

/** The fewest cells across (most zoomed in) and the most (the whole map, at most). */
export function zoomRange(size: LayerSize): { min: number; max: number } {
  const max = Math.min(PREVIEW_MAP.maxCells, Math.max(size.x, size.y));
  return { min: Math.min(PREVIEW_MAP.minCells, max), max };
}

/** `cells` kept inside the zoom range. */
export function clampCells(cells: number, size: LayerSize): number {
  const range = zoomRange(size);
  return Math.min(Math.max(cells, range.min), range.max);
}

/** Keep a camera coordinate inside a cube side of `sideCells` cells. */
function clampAxis(value: number, sideCells: number, cells: number): number {
  const max = Math.max(0, sideCells - cells);
  return Math.min(Math.max(value, 0), max);
}

/** `camera` moved back inside the cube, and its zoom inside the range, if they have left them. */
export function clampCamera(camera: Camera, size: LayerSize): Camera {
  const cells = clampCells(camera.cells, size);
  return {
    x: clampAxis(camera.x, size.x, cells),
    y: clampAxis(camera.y, size.y, cells),
    cells,
  };
}

/**
 * The camera with the cell (x, y) as near the middle of the window as the
 * cube allows, at zoom `cells` (the default zoom if not given).
 */
export function centredOn(
  x: number,
  y: number,
  size: LayerSize,
  cells: number = VIEW_CELLS,
): Camera {
  const zoom = clampCells(cells, size);
  const half = Math.floor(zoom / 2);
  return clampCamera({ x: x - half, y: y - half, cells: zoom }, size);
}

/** True if the whole of cell (x, y) is inside the window. */
export function isInView(camera: Camera, x: number, y: number): boolean {
  return (
    x >= camera.x &&
    x + 1 <= camera.x + camera.cells &&
    y >= camera.y &&
    y + 1 <= camera.y + camera.cells
  );
}

/**
 * The camera after a drag of (dxPixels, dyPixels) on a map whose cells are
 * `cellPixels` wide. Dragging right moves the map right, so the camera (the
 * window onto the cube) moves left.
 */
export function panned(
  camera: Camera,
  dxPixels: number,
  dyPixels: number,
  cellPixels: number,
  size: LayerSize,
): Camera {
  return clampCamera(
    {
      x: camera.x - dxPixels / cellPixels,
      y: camera.y - dyPixels / cellPixels,
      cells: camera.cells,
    },
    size,
  );
}

/**
 * The camera zoomed to `cells` across, keeping the point that was under
 * (fromPx, fromPy) now under (toPx, toPy). Points are in pixels from the
 * map's top-left corner, and `mapPixels` is the map's width. For a plain
 * zoom about one point, `to` is the same as `from`; for a pinch, `to` is
 * where the fingers' midpoint has moved to, so a pinch pans as well.
 */
export function zoomedAbout(
  camera: Camera,
  cells: number,
  fromPx: number,
  fromPy: number,
  toPx: number,
  toPy: number,
  mapPixels: number,
  size: LayerSize,
): Camera {
  const zoom = clampCells(cells, size);
  // The cube position (in cells, fractions included) under the starting point.
  const worldX = camera.x + (fromPx / mapPixels) * camera.cells;
  const worldY = camera.y + (fromPy / mapPixels) * camera.cells;
  // Put that position under the end point at the new zoom.
  return clampCamera(
    {
      x: worldX - (toPx / mapPixels) * zoom,
      y: worldY - (toPy / mapPixels) * zoom,
      cells: zoom,
    },
    size,
  );
}

/** The cell under the point (px, py), measured in pixels from the map's top-left corner. */
export function cellAt(
  camera: Camera,
  px: number,
  py: number,
  cellPixels: number,
): { x: number; y: number } {
  return { x: Math.floor(camera.x + px / cellPixels), y: Math.floor(camera.y + py / cellPixels) };
}

/** The camera showing the whole map, or as much of it as the zoom range allows. */
export function wholeMap(size: LayerSize): Camera {
  return clampCamera({ x: 0, y: 0, cells: Math.max(size.x, size.y) }, size);
}

/** The camera at zoom `cells`, centred on the middle of the map. */
export function centredOnMiddle(size: LayerSize, cells: number = VIEW_CELLS): Camera {
  const zoom = clampCells(cells, size);
  return clampCamera({ x: (size.x - zoom) / 2, y: (size.y - zoom) / 2, cells: zoom }, size);
}
