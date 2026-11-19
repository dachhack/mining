// The tap map's camera (issue #66): which 16 x 16 window of a layer is on
// screen. Plain numbers only, so the tests can check it without a browser.
//
// `x` and `y` are the cell at the window's top-left corner. They may be
// fractions while the player drags, so that the map follows the finger
// smoothly; they are always kept inside the cube.

import { PREVIEW_MAP } from './palette';

export interface Camera {
  x: number;
  y: number;
}

/** How many cells the window shows across and down. */
export const VIEW_CELLS = PREVIEW_MAP.viewCells;

/** Keep a camera coordinate inside a cube side of `sideCells` cells. */
function clampAxis(value: number, sideCells: number): number {
  const max = Math.max(0, sideCells - VIEW_CELLS);
  return Math.min(Math.max(value, 0), max);
}

/** `camera` moved back inside the cube if it has left it. */
export function clampCamera(camera: Camera, size: { x: number; y: number }): Camera {
  return { x: clampAxis(camera.x, size.x), y: clampAxis(camera.y, size.y) };
}

/** The camera with the cell (x, y) as near the middle of the window as the cube allows. */
export function centredOn(x: number, y: number, size: { x: number; y: number }): Camera {
  const half = Math.floor(VIEW_CELLS / 2);
  return clampCamera({ x: x - half, y: y - half }, size);
}

/** True if the whole of cell (x, y) is inside the window. */
export function isInView(camera: Camera, x: number, y: number): boolean {
  return (
    x >= camera.x &&
    x + 1 <= camera.x + VIEW_CELLS &&
    y >= camera.y &&
    y + 1 <= camera.y + VIEW_CELLS
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
  size: { x: number; y: number },
): Camera {
  return clampCamera(
    { x: camera.x - dxPixels / cellPixels, y: camera.y - dyPixels / cellPixels },
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
