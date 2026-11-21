// UI lab 1 (issue #116): the map's camera, for a map that is taller than it
// is wide (it fills the phone screen under the counter).
//
// Like map/camera.ts, but that camera is for a square window. Here `cells`
// is how many squares the window shows across; how many it shows down
// (`rows`) follows from the window's shape. Plain numbers only, so the tests
// can check it without a browser.

import { PREVIEW_MAP } from '../map/palette';

export interface LabCamera {
  /** The square (fractions allowed) at the window's top-left corner. */
  x: number;
  y: number;
  /** How many squares the window shows across: the zoom. */
  cells: number;
}

/** The window's size on screen, in pixels. */
export interface ViewSize {
  width: number;
  height: number;
}

/** The map's size, in squares. */
export interface GroundSize {
  x: number;
  y: number;
}

/** How many squares the window shows down. */
export function rowsOf(camera: LabCamera, view: ViewSize): number {
  return view.width > 0 ? (camera.cells * view.height) / view.width : camera.cells;
}

/** Keep one coordinate inside the map; if the window is bigger than the map, centre the map in it. */
function clampAxis(value: number, mapSquares: number, windowSquares: number): number {
  if (windowSquares >= mapSquares) {
    return (mapSquares - windowSquares) / 2;
  }
  return Math.min(Math.max(value, 0), mapSquares - windowSquares);
}

/** `camera` with its zoom inside the range and the window over the map. */
export function clampLabCamera(camera: LabCamera, ground: GroundSize, view: ViewSize): LabCamera {
  const most = ground.x;
  const fewest = Math.min(PREVIEW_MAP.minCells, most);
  const cells = Math.min(Math.max(camera.cells, fewest), most);
  const zoomed = { x: camera.x, y: camera.y, cells };
  return {
    x: clampAxis(camera.x, ground.x, cells),
    y: clampAxis(camera.y, ground.y, rowsOf(zoomed, view)),
    cells,
  };
}

/** The camera at zoom `cells`, centred on the middle of the map. */
export function centredLabCamera(cells: number, ground: GroundSize, view: ViewSize): LabCamera {
  const sized = clampLabCamera({ x: 0, y: 0, cells }, ground, view);
  const rows = rowsOf(sized, view);
  return clampLabCamera(
    { x: (ground.x - sized.cells) / 2, y: (ground.y - rows) / 2, cells: sized.cells },
    ground,
    view,
  );
}

/** The camera after a drag of (dx, dy) pixels: dragging right moves the map right. */
export function pannedLab(
  camera: LabCamera,
  dx: number,
  dy: number,
  ground: GroundSize,
  view: ViewSize,
): LabCamera {
  const cellPx = view.width / camera.cells;
  return clampLabCamera(
    { x: camera.x - dx / cellPx, y: camera.y - dy / cellPx, cells: camera.cells },
    ground,
    view,
  );
}

/**
 * The camera zoomed to `cells` across, keeping the point that was under
 * pixel `from` now under pixel `to` (for a pinch, `to` is where the fingers'
 * midpoint has moved to, so a pinch pans as well).
 */
export function zoomedLab(
  camera: LabCamera,
  cells: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ground: GroundSize,
  view: ViewSize,
): LabCamera {
  const oldCellPx = view.width / camera.cells;
  const worldX = camera.x + from.x / oldCellPx;
  const worldY = camera.y + from.y / oldCellPx;
  // Clamp the zoom first, so the point stays put even at the end of the range.
  const zoom = clampLabCamera({ x: 0, y: 0, cells }, ground, view).cells;
  const newCellPx = view.width / zoom;
  return clampLabCamera(
    { x: worldX - to.x / newCellPx, y: worldY - to.y / newCellPx, cells: zoom },
    ground,
    view,
  );
}
