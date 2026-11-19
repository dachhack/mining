// The tap map of the phone preview (issue #66): a 16 x 16 window of one
// layer drawn as coloured tiles on a canvas, dragged to pan, tapped to act.
//
// It draws only from `buildLayer` (tiles.ts), which holds what the player
// knows and nothing else, and it changes the game only by handing one of the
// legal actions to `onChoose` (the screen then calls `takeTurn`). It never
// edits the state.

import { BLOCKS, SHIFT, WORLD } from '../../data';
import type { BlockId } from '../../data';
import type { Action, GameState } from '../../engine';
import {
  choiceName,
  choiceWarning,
  describeChoice,
  layerName,
  tapActsAtOnce,
} from '../text/describe';
import {
  VIEW_CELLS,
  cellAt,
  centredOn,
  clampCells,
  followMiner,
  isInView,
  panned,
  zoomedAbout,
} from './camera';
import type { Camera } from './camera';
import {
  BLOCK_LOOKS,
  MARK_COLOURS,
  PREVIEW_MAP,
  SURFACE_HAZE,
  SURFACE_LOOKS,
  UNKNOWN_LOOK,
  UNLIT_BRIGHTNESS,
} from './palette';
import type { Pattern, SurfaceMark } from './palette';
import { actionsForCell } from './targets';
import { buildLayer, layerContext } from './tiles';
import type { LayerContext, Tile } from './tiles';

/** What the screen gets back from `createTapMap`. */
export interface TapMap {
  /** The map's whole element, to put on the page. */
  element: HTMLElement;
  /**
   * Show `state`. `fresh` is true for a new or resumed run: the map then
   * goes to the miner's layer and centres on the miner.
   */
  show(state: GameState, fresh: boolean): void;
}

// ---------------------------------------------------------------------------
// Drawing one tile
// ---------------------------------------------------------------------------

/** Draw `pattern` in `ink` over the square at (x, y) with side `c`. */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  x: number,
  y: number,
  c: number,
  ink: string,
): void {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, c / 12);
  const mid = c / 2;
  const dot = Math.max(1, c / 10);
  switch (pattern) {
    case 'plain':
      break;
    case 'speckle':
      for (const [fx, fy] of [
        [0.25, 0.3],
        [0.7, 0.2],
        [0.5, 0.6],
        [0.2, 0.75],
        [0.8, 0.75],
      ] as const) {
        ctx.fillRect(x + fx * c, y + fy * c, dot, dot);
      }
      break;
    case 'dots':
      for (const [fx, fy] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.7, 0.7],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + fx * c, y + fy * c, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'hatch':
      // Diagonal lines, clipped to the tile.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, c, c);
      ctx.clip();
      ctx.beginPath();
      for (const f of [0.33, 0.66, 1.0, 1.33]) {
        ctx.moveTo(x + f * c, y);
        ctx.lineTo(x + (f - 1) * c, y + c);
      }
      ctx.stroke();
      ctx.restore();
      break;
    case 'stripes':
      ctx.beginPath();
      for (const f of [0.3, 0.5, 0.7]) {
        ctx.moveTo(x + f * c, y + 0.15 * c);
        ctx.lineTo(x + f * c, y + 0.85 * c);
      }
      ctx.stroke();
      break;
    case 'bars':
      ctx.beginPath();
      for (const f of [0.3, 0.5, 0.7]) {
        ctx.moveTo(x + 0.15 * c, y + f * c);
        ctx.lineTo(x + 0.85 * c, y + f * c);
      }
      ctx.stroke();
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.lineTo(x + 0.2 * c, y + mid);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ring':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, c * 0.27, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'plus':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.moveTo(x + 0.2 * c, y + mid);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.stroke();
      break;
    case 'cross':
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.moveTo(x + 0.25 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.75 * c, y + 0.75 * c);
      ctx.moveTo(x + 0.75 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.25 * c, y + 0.75 * c);
      ctx.stroke();
      break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? c * 0.32 : c * 0.13;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const px = x + mid + Math.cos(a) * r;
        const py = y + mid + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'tree':
      // A fir: a triangle on a short trunk.
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.12 * c);
      ctx.lineTo(x + 0.8 * c, y + 0.7 * c);
      ctx.lineTo(x + 0.2 * c, y + 0.7 * c);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 0.44 * c, y + 0.7 * c, 0.12 * c, 0.18 * c);
      break;
    case 'stump':
      // A cut trunk seen from above: a ring with a dot.
      ctx.lineWidth = Math.max(1.5, c / 8);
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, c * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + mid, y + mid, dot, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'grass':
      // Three tufts: little V shapes.
      ctx.beginPath();
      for (const [fx, fy] of [
        [0.25, 0.4],
        [0.65, 0.3],
        [0.45, 0.75],
      ] as const) {
        ctx.moveTo(x + (fx - 0.08) * c, y + (fy - 0.1) * c);
        ctx.lineTo(x + fx * c, y + fy * c);
        ctx.lineTo(x + (fx + 0.08) * c, y + (fy - 0.1) * c);
      }
      ctx.stroke();
      break;
    case 'track':
      // Two ruts, dashed, along the tile.
      ctx.save();
      ctx.setLineDash([c / 8, c / 10]);
      ctx.beginPath();
      for (const f of [0.35, 0.65]) {
        ctx.moveTo(x + f * c, y + 0.1 * c);
        ctx.lineTo(x + f * c, y + 0.9 * c);
      }
      ctx.stroke();
      ctx.restore();
      break;
    case 'peak':
      // A rock: an outlined peak.
      ctx.lineWidth = Math.max(1.5, c / 9);
      ctx.beginPath();
      ctx.moveTo(x + 0.15 * c, y + 0.8 * c);
      ctx.lineTo(x + 0.45 * c, y + 0.25 * c);
      ctx.lineTo(x + 0.6 * c, y + 0.5 * c);
      ctx.lineTo(x + 0.7 * c, y + 0.4 * c);
      ctx.lineTo(x + 0.85 * c, y + 0.8 * c);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'grid':
      ctx.strokeRect(x + 0.2 * c, y + 0.2 * c, 0.6 * c, 0.6 * c);
      ctx.beginPath();
      ctx.moveTo(x + mid, y + 0.2 * c);
      ctx.lineTo(x + mid, y + 0.8 * c);
      ctx.moveTo(x + 0.2 * c, y + mid);
      ctx.lineTo(x + 0.8 * c, y + mid);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** An unseen cell: dark with diagonal lines, the same whatever is really there. */
function drawUnknown(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
  ctx.fillStyle = UNKNOWN_LOOK.colour;
  ctx.fillRect(x, y, c, c);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, c, c);
  ctx.clip();
  ctx.strokeStyle = UNKNOWN_LOOK.ink;
  ctx.lineWidth = Math.max(1, c / 14);
  ctx.beginPath();
  for (const f of [0.25, 0.75, 1.25, 1.75]) {
    ctx.moveTo(x + f * c, y);
    ctx.lineTo(x + (f - 1) * c, y + c);
  }
  ctx.stroke();
  ctx.restore();
}

/** The marks drawn over a tile: traces, structure, loose items, the miner. */
function drawMarks(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number, c: number) {
  const mid = c / 2;
  if (tile.traced) {
    // Three small gold dots along the top edge: mineral traces seen on this rock.
    ctx.fillStyle = MARK_COLOURS.traces;
    for (const fx of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(x + fx * c, y + 0.14 * c, Math.max(1.2, c / 11), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (tile.structure === 'torch') {
    // A flame: an orange disc with a pale core.
    ctx.fillStyle = MARK_COLOURS.torch;
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, c * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MARK_COLOURS.torchCore;
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, c * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.structure === 'support') {
    // A T: a beam on a post.
    ctx.strokeStyle = MARK_COLOURS.support;
    ctx.lineWidth = Math.max(2, c / 7);
    ctx.beginPath();
    ctx.moveTo(x + 0.2 * c, y + 0.25 * c);
    ctx.lineTo(x + 0.8 * c, y + 0.25 * c);
    ctx.moveTo(x + mid, y + 0.25 * c);
    ctx.lineTo(x + mid, y + 0.85 * c);
    ctx.stroke();
  } else if (tile.structure === 'other') {
    ctx.strokeStyle = MARK_COLOURS.otherStructure;
    ctx.lineWidth = Math.max(1.5, c / 10);
    ctx.strokeRect(x + 0.25 * c, y + 0.25 * c, 0.5 * c, 0.5 * c);
  }
  if (tile.items) {
    // A small white diamond with a dark outline, in the bottom-right corner.
    const cx = x + 0.75 * c;
    const cy = y + 0.75 * c;
    // Never smaller than 2.5 px, so it stays visible zoomed right out.
    const r = Math.max(c * 0.17, 2.5);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = MARK_COLOURS.items;
    ctx.fill();
    ctx.strokeStyle = MARK_COLOURS.itemsOutline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (tile.minerColumn) {
    // On another layer: a dashed ring where the miner is, above or below.
    ctx.save();
    ctx.strokeStyle = MARK_COLOURS.miner;
    ctx.lineWidth = Math.max(1.5, c / 12);
    ctx.setLineDash([c / 6, c / 8]);
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, c * 0.33, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (tile.miner) {
    // The miner: a red-orange disc with a white ring and a white centre.
    ctx.fillStyle = MARK_COLOURS.miner;
    ctx.strokeStyle = MARK_COLOURS.minerOutline;
    ctx.lineWidth = Math.max(2, c / 9);
    // At least 4 px across, so the miner is easy to find zoomed right out.
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, Math.max(c * 0.33, 4), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = MARK_COLOURS.minerOutline;
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, c * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw one tile, with its top-left corner at (x, y) and side `c` pixels. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  x: number,
  y: number,
  c: number,
  grid = true,
): void {
  if (tile.kind === 'unknown') {
    drawUnknown(ctx, x, y, c);
  } else if (tile.surface === 'tree') {
    // A tree hides the ground under it (issue #70): drawn solid.
    const look = SURFACE_LOOKS.tree;
    ctx.fillStyle = look.haze;
    ctx.fillRect(x, y, c, c);
    drawPattern(ctx, look.pattern, x, y, c, look.ink);
  } else if (tile.ground !== null || tile.surface !== null) {
    // An open surface cell: the ground under it, seen through a haze of the
    // cell's own kind, with that kind's pattern on top.
    if (tile.ground !== null) {
      const look = BLOCK_LOOKS[tile.ground];
      ctx.fillStyle = look.colour;
      ctx.fillRect(x, y, c, c);
      drawPattern(ctx, look.pattern, x, y, c, look.ink);
    }
    const kind = tile.surface === null ? null : SURFACE_LOOKS[tile.surface];
    ctx.fillStyle = kind === null ? SURFACE_HAZE : kind.haze;
    ctx.fillRect(x, y, c, c);
    if (kind !== null) {
      drawPattern(ctx, kind.pattern, x, y, c, kind.ink);
    }
  } else {
    const look = BLOCK_LOOKS[tile.block ?? 'air'];
    ctx.fillStyle = look.colour;
    ctx.fillRect(x, y, c, c);
    drawPattern(ctx, look.pattern, x, y, c, look.ink);
    if (!tile.lit) {
      // Seen, but not in light now: drawn darker.
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - UNLIT_BRIGHTNESS})`;
      ctx.fillRect(x, y, c, c);
    }
  }
  drawMarks(ctx, tile, x, y, c);
  if (grid) {
    ctx.strokeStyle = MARK_COLOURS.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
  }
}

// ---------------------------------------------------------------------------
// The legend
// ---------------------------------------------------------------------------

/** A blank tile, to draw legend swatches from. */
function sampleTile(overrides: Partial<Tile>): Tile {
  return {
    x: 0,
    y: 0,
    kind: 'block',
    block: 'stone',
    lit: true,
    traced: false,
    structure: null,
    items: false,
    miner: false,
    minerColumn: false,
    ground: null,
    surface: null,
    ...overrides,
  };
}

/** One legend entry: a little drawn tile and its meaning. */
function legendEntry(tile: Tile, label: string): HTMLElement {
  const entry = document.createElement('span');
  entry.className = 'legend-entry';
  const swatch = document.createElement('canvas');
  const px = 18;
  const dpr = window.devicePixelRatio || 1;
  swatch.width = px * dpr;
  swatch.height = px * dpr;
  swatch.className = 'legend-swatch';
  const ctx = swatch.getContext('2d');
  if (ctx !== null) {
    ctx.scale(dpr, dpr);
    drawTile(ctx, tile, 0, 0, px);
  }
  const text = document.createElement('span');
  text.textContent = label;
  entry.append(swatch, text);
  return entry;
}

/** The legend for what is on screen now: only the things actually drawn. */
function legendFor(tiles: Tile[]): HTMLElement[] {
  const entries: HTMLElement[] = [];
  const blocks = new Set<BlockId>();
  let unknown = false;
  let unlit = false;
  let open = false;
  const marks = new Set<string>();
  for (const tile of tiles) {
    if (tile.kind === 'unknown') unknown = true;
    if (tile.kind === 'open') open = true;
    if (tile.kind === 'block' && tile.block !== null) blocks.add(tile.block);
    if (tile.ground !== null) blocks.add(tile.ground);
    if (tile.kind !== 'unknown' && !tile.lit) unlit = true;
    if (tile.traced) marks.add('traced');
    if (tile.structure !== null) marks.add(tile.structure);
    if (tile.items) marks.add('items');
    if (tile.miner) marks.add('miner');
    if (tile.minerColumn) marks.add('minerColumn');
  }
  if (marks.has('miner')) {
    entries.push(legendEntry(sampleTile({ kind: 'open', block: null, miner: true }), 'you'));
  }
  if (marks.has('minerColumn')) {
    entries.push(
      legendEntry(
        sampleTile({ kind: 'open', block: null, minerColumn: true }),
        'above or below you',
      ),
    );
  }
  // The surface kinds (issue #70), in a fixed order.
  const surfaceLabels: [SurfaceMark, string][] = [
    ['tree', 'tree (cut it; hides the ground)'],
    ['stump', 'stump (a tree grows back)'],
    ['path', 'dirt path'],
    ['meadow', 'meadow'],
    ['outcrop', 'stone outcrop'],
  ];
  const surfaceKinds = new Set(tiles.map((tile) => tile.surface));
  for (const [kind, label] of surfaceLabels) {
    if (surfaceKinds.has(kind)) {
      entries.push(legendEntry(sampleTile({ kind: 'open', block: null, surface: kind }), label));
    }
  }
  if (tiles.some((tile) => tile.ground !== null)) {
    entries.push(
      legendEntry(
        sampleTile({ kind: 'open', block: null, ground: 'dirt', surface: 'meadow' }),
        'open ground (pale: the ground under it)',
      ),
    );
  } else if (open) {
    entries.push(legendEntry(sampleTile({ kind: 'open', block: null }), 'open'));
  }
  // In the order of the data's block list, so the legend does not jump about.
  for (const id of Object.keys(BLOCKS) as BlockId[]) {
    if (blocks.has(id)) {
      entries.push(legendEntry(sampleTile({ block: id }), BLOCKS[id].name));
    }
  }
  if (unknown) {
    entries.push(legendEntry(sampleTile({ kind: 'unknown', block: null }), 'not seen yet'));
  }
  if (unlit) {
    entries.push(legendEntry(sampleTile({ lit: false }), 'seen, not in light (darker)'));
  }
  if (marks.has('traced')) {
    entries.push(legendEntry(sampleTile({ traced: true }), 'mineral traces'));
  }
  const markLabels: [string, Partial<Tile>, string][] = [
    ['torch', { structure: 'torch' }, 'torch'],
    ['support', { structure: 'support' }, 'support'],
    ['other', { structure: 'other' }, 'other structure'],
    ['items', { items: true }, 'loose items'],
  ];
  for (const [mark, overrides, label] of markLabels) {
    if (marks.has(mark)) {
      entries.push(legendEntry(sampleTile({ kind: 'open', block: null, ...overrides }), label));
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------

function button(className: string, text: string): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = className;
  made.textContent = text;
  return made;
}

/**
 * What to say when a tap stands for no choice. If the cell would have a
 * choice with a full shift of AP, the trouble is AP, and the hint says so.
 * That is worked out on a copy of the state with the AP topped up: the same
 * legal actions the player would see next shift, so it tells nothing new.
 */
function emptyTapHint(state: GameState, viewZ: number, x: number, y: number): string {
  if (state.ap < SHIFT.apPerShift) {
    // `structuredClone` makes a deep copy, so the real state is not touched.
    const rested: GameState = structuredClone(state);
    rested.ap = SHIFT.apPerShift;
    if (actionsForCell(rested, viewZ, x, y).length > 0) {
      return `Not enough AP (you have ${state.ap})`;
    }
  }
  return 'Nothing to do there';
}

/** The `localStorage` key the zoom level is kept under, per device (issue #69). */
export const ZOOM_KEY = 'mining-game.preview.zoom';

/** The zoom saved on this device (cells across), or `null` if none or storage cannot be read. */
function loadZoom(): number | null {
  try {
    const text = window.localStorage.getItem(ZOOM_KEY);
    const cells = text === null ? NaN : Number(text);
    return Number.isFinite(cells) && cells > 0 ? cells : null;
  } catch {
    return null;
  }
}

/** Remember the zoom on this device. Storage that refuses is ignored: it is only a convenience. */
function saveZoom(cells: number): void {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(Math.round(cells * 100) / 100));
  } catch {
    // Nothing to do.
  }
}

/**
 * Make the tap map. `onChoose` is called with the action the player picked;
 * the screen takes it (and then calls `show` again).
 */
export function createTapMap(onChoose: (action: Action) => void): TapMap {
  const element = document.createElement('section');
  element.className = 'tap-map';
  element.dataset['testid'] = 'tap-map';

  // The row of buttons over the map.
  const bar = document.createElement('div');
  bar.className = 'map-bar';
  const upButton = button('small layer-button', '▲ Up');
  upButton.setAttribute('aria-label', 'Look one layer up');
  const layerLabel = document.createElement('span');
  layerLabel.className = 'layer-label';
  layerLabel.dataset['testid'] = 'layer-label';
  const downButton = button('small layer-button', '▼ Down');
  downButton.setAttribute('aria-label', 'Look one layer down');
  const centreButton = button('small', 'Centre on me');
  // Back to the default zoom (issue #69).
  const zoomButton = button('small', `${VIEW_CELLS}×${VIEW_CELLS}`);
  zoomButton.setAttribute('aria-label', `Zoom to ${VIEW_CELLS} by ${VIEW_CELLS}`);
  bar.append(layerLabel, upButton, downButton, centreButton, zoomButton);

  // The canvas, with the chooser and the hint laid over it.
  const frame = document.createElement('div');
  frame.className = 'map-frame';
  const canvas = document.createElement('canvas');
  canvas.className = 'map-canvas';
  canvas.dataset['testid'] = 'map-canvas';
  const chooser = document.createElement('div');
  chooser.className = 'chooser';
  chooser.dataset['testid'] = 'chooser';
  chooser.hidden = true;
  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.dataset['testid'] = 'map-hint';
  hint.hidden = true;
  frame.append(canvas, chooser, hint);

  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.dataset['testid'] = 'map-legend';

  element.append(bar, frame, legend);

  // ----- What the map is showing -----
  let state: GameState | null = null;
  let viewZ = 0;
  // The zoom starts where the player left it last time on this device.
  let camera: Camera = { x: 0, y: 0, cells: loadZoom() ?? VIEW_CELLS };
  // The layer the miner was on when last shown, to follow it when it changes.
  let lastMinerLayer: number | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  // Light and traces for `state`, worked out on the first draw after `show`.
  let context: LayerContext | null = null;

  /** The layer the miner is on (the surface is a layer of its own on the map). */
  function minersMapLayer(s: GameState): number {
    return s.avatar.pos.z;
  }

  function cellPixels(): number {
    return frame.clientWidth / camera.cells;
  }

  function layerText(s: GameState): string {
    const here = s.avatar.pos.z;
    const name = viewZ === WORLD.surfaceZ ? 'Surface' : `Layer ${viewZ}`;
    if (viewZ === here) {
      return `${name} · you are here`;
    }
    const diff = viewZ - here;
    return `${name} · ${Math.abs(diff)} ${diff > 0 ? 'below' : 'above'} you`;
  }

  function draw(): void {
    if (state === null) {
      return;
    }
    const s = state;
    const c = cellPixels();
    const dpr = window.devicePixelRatio || 1;
    const sidePx = Math.round(frame.clientWidth);
    if (canvas.width !== Math.round(sidePx * dpr)) {
      canvas.width = Math.round(sidePx * dpr);
      canvas.height = Math.round(sidePx * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sidePx, sidePx);

    // One cell more than the window, for the part-cells while dragging.
    const x0 = Math.floor(camera.x);
    const y0 = Math.floor(camera.y);
    const span = Math.ceil(camera.cells) + 1;
    // Grid lines only where the cells are big enough for them not to crowd the marks.
    const grid = c >= PREVIEW_MAP.gridMinCellPx;
    // Light and traces are worked out once per state, not on every frame of a drag.
    if (context === null) {
      context = layerContext(s);
    }
    const rows = buildLayer(s, viewZ, { x0, y0, size: span }, context);
    const drawn: Tile[] = [];
    for (const row of rows) {
      for (const tile of row) {
        if (tile.x >= s.size.x || tile.y >= s.size.y) {
          continue;
        }
        drawTile(ctx, tile, (tile.x - camera.x) * c, (tile.y - camera.y) * c, c, grid);
        if (isInView(camera, tile.x, tile.y)) {
          drawn.push(tile);
        }
      }
    }
    legend.replaceChildren(...legendFor(drawn));

    layerLabel.textContent = layerText(s);
    const onMinersLayer = viewZ === minersMapLayer(s);
    layerLabel.classList.toggle('mine', onMinersLayer);
    frame.classList.toggle('mine', onMinersLayer);
    upButton.disabled = viewZ <= WORLD.surfaceZ;
    downButton.disabled = viewZ >= s.size.z - 1;

    // For the tests: where the camera is and how big a cell is.
    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cellPx'] = String(c);
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['layer'] = String(viewZ);
  }

  function closeChooser(): void {
    chooser.hidden = true;
    chooser.replaceChildren();
  }

  function showHint(text: string): void {
    hint.textContent = text;
    hint.hidden = false;
    if (hintTimer !== null) {
      clearTimeout(hintTimer);
    }
    hintTimer = setTimeout(() => {
      hint.hidden = true;
    }, PREVIEW_MAP.hintMs);
  }

  /** Show the chooser for `actions` next to cell (x, y). */
  function openChooser(s: GameState, actions: Action[], x: number, y: number): void {
    const c = cellPixels();
    const options = actions.map((action) => {
      const option = button('choice chooser-option', '');
      const text = document.createElement('span');
      text.className = 'choice-text';
      text.textContent = describeChoice(s, action);
      const meta = document.createElement('span');
      meta.className = 'choice-meta';
      meta.textContent = `${choiceName(s, action)} · ${action.ap} AP`;
      option.append(text, meta);
      const warning = choiceWarning(s, action);
      // The warning is shown on a line of its own, unless the description
      // already says it word for word (mining underfoot does).
      if (warning !== null && !text.textContent.includes(warning)) {
        const warn = document.createElement('span');
        warn.className = 'choice-warning';
        warn.textContent = `⚠ ${warning}`;
        option.append(warn);
      }
      option.addEventListener('click', () => {
        closeChooser();
        onChoose(action);
      });
      return option;
    });
    const cancel = button('small chooser-cancel', 'Cancel');
    cancel.addEventListener('click', closeChooser);
    const title = document.createElement('p');
    title.className = 'chooser-title';
    title.textContent = `x${x} y${y}, ${layerName(viewZ)}`;
    // The title and Cancel come first, so Cancel is in sight however long the list.
    const head = document.createElement('div');
    head.className = 'chooser-head';
    head.append(title, cancel);
    chooser.replaceChildren(head, ...options);
    chooser.hidden = false;

    // Below the cell if it is in the top half of the map, else above it, and
    // never taller than the room on that side (it scrolls inside if need be).
    const frameWidth = frame.clientWidth;
    const frameHeight = frame.clientHeight;
    const width = Math.min(frameWidth - 8, 320);
    chooser.style.width = `${width}px`;
    const cellLeft = (x - camera.x) * c;
    const cellTop = (y - camera.y) * c;
    const left = Math.min(Math.max(cellLeft + c / 2 - width / 2, 4), frameWidth - width - 4);
    chooser.style.left = `${left}px`;
    if (cellTop < frameHeight / 2) {
      chooser.style.top = `${cellTop + c + 4}px`;
      chooser.style.bottom = '';
      chooser.style.maxHeight = `${frameHeight - cellTop - c - 8}px`;
    } else {
      chooser.style.top = '';
      chooser.style.bottom = `${frameHeight - cellTop + 4}px`;
      chooser.style.maxHeight = `${cellTop - 8}px`;
    }
  }

  /** A tap (not a drag) at (px, py) pixels from the map's top-left corner. */
  function tap(px: number, py: number): void {
    if (state === null) {
      return;
    }
    // While the chooser is open, a tap elsewhere only closes it.
    if (!chooser.hidden) {
      closeChooser();
      return;
    }
    const cell = cellAt(camera, px, py, cellPixels());
    const actions = actionsForCell(state, viewZ, cell.x, cell.y);
    const only = actions[0];
    if (actions.length === 0 || only === undefined) {
      showHint(emptyTapHint(state, viewZ, cell.x, cell.y));
      return;
    }
    // One choice and nothing to confirm: take it at once. Digging down with
    // only the "unseen below" note counts too (`tapActsAtOnce`).
    if (actions.length === 1 && tapActsAtOnce(state, only)) {
      onChoose(only);
      return;
    }
    openChooser(state, actions, cell.x, cell.y);
  }

  // ----- Touch and mouse: a drag pans, a pinch zooms, a tap acts -----
  // Pointer events cover both touch and mouse. Every finger (or the mouse)
  // that is down is kept in `pointers`, by its pointer id. A gesture starts
  // with the first finger down and ends when the last one lifts:
  // - one finger that moves more than `dragThresholdPx` is a drag (it pans);
  // - a second finger turns the gesture into a pinch (it zooms, and pans as
  //   the fingers' midpoint moves);
  // - only a single finger that never moved far counts as a tap. A gesture
  //   that was ever a drag or a pinch never does, even when it ends with one
  //   finger lifting on its own (issue #69).
  const pointers = new Map<number, { x: number; y: number }>();
  interface Gesture {
    kind: 'press' | 'drag' | 'pinch';
    /** The camera when the drag or pinch started. */
    camera: Camera;
    /** Where the first finger went down (page pixels). */
    startX: number;
    startY: number;
    /** For a pinch: the distance between the fingers and their midpoint (map pixels) at its start. */
    pinchDistance: number;
    pinchMidX: number;
    pinchMidY: number;
  }
  let gesture: Gesture | null = null;

  /** The midpoint of the first two fingers, in pixels from the map's corner, and their distance apart. */
  function twoFingers(): { midX: number; midY: number; distance: number } | null {
    const [a, b] = [...pointers.values()];
    if (a === undefined || b === undefined) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      gesture = {
        kind: 'press',
        camera: { ...camera },
        startX: event.clientX,
        startY: event.clientY,
        pinchDistance: 0,
        pinchMidX: 0,
        pinchMidY: 0,
      };
      return;
    }
    // A second finger: from now on this gesture is a pinch.
    const fingers = twoFingers();
    if (gesture !== null && fingers !== null) {
      gesture.kind = 'pinch';
      gesture.camera = { ...camera };
      gesture.pinchDistance = fingers.distance;
      gesture.pinchMidX = fingers.midX;
      gesture.pinchMidY = fingers.midY;
      closeChooser();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || gesture === null || state === null) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.kind === 'pinch') {
      const fingers = twoFingers();
      if (fingers === null) {
        return; // one finger already lifted: the pinch is over, wait for the other
      }
      // Fingers twice as far apart show half as many cells across.
      const cells = (gesture.camera.cells * gesture.pinchDistance) / fingers.distance;
      camera = zoomedAbout(
        gesture.camera,
        cells,
        gesture.pinchMidX,
        gesture.pinchMidY,
        fingers.midX,
        fingers.midY,
        frame.clientWidth,
        state.size,
      );
      draw();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.kind === 'press' && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      gesture.kind = 'drag';
      closeChooser();
    }
    if (gesture.kind === 'drag') {
      camera = panned(gesture.camera, dx, dy, cellPixels(), state.size);
      draw();
    }
  });

  /** A finger lifted, or the browser took it over (pointercancel: never a tap). */
  function liftPointer(event: PointerEvent, cancelled: boolean): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.delete(event.pointerId);
    if (gesture === null) {
      return;
    }
    if (pointers.size >= 2 && gesture.kind === 'pinch') {
      // With three fingers down, lifting one of the first two makes a new
      // pair: start the pinch afresh from where it is now, or the map would
      // jump once (review of PR #71).
      const fingers = twoFingers();
      if (fingers !== null) {
        gesture.camera = { ...camera };
        gesture.pinchDistance = fingers.distance;
        gesture.pinchMidX = fingers.midX;
        gesture.pinchMidY = fingers.midY;
      }
    }
    if (pointers.size > 0) {
      return; // other fingers are still down: the gesture goes on
    }
    const ended = gesture;
    gesture = null;
    if (ended.kind === 'pinch') {
      saveZoom(camera.cells);
    } else if (ended.kind === 'press' && !cancelled) {
      const rect = canvas.getBoundingClientRect();
      tap(event.clientX - rect.left, event.clientY - rect.top);
    }
  }
  canvas.addEventListener('pointerup', (event) => {
    liftPointer(event, false);
  });
  canvas.addEventListener('pointercancel', (event) => {
    liftPointer(event, true);
  });

  // The mouse wheel (and a trackpad pinch, which browsers send as a wheel
  // with the ctrl key held) zooms about the pointer. `passive: false` lets
  // `preventDefault` stop the page from scrolling or zooming instead.
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (state === null) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      // Wheel down (positive deltaY) zooms out: more cells across.
      const cells = camera.cells * Math.exp(event.deltaY * PREVIEW_MAP.wheelZoomRate);
      camera = zoomedAbout(camera, cells, px, py, px, py, frame.clientWidth, state.size);
      closeChooser();
      draw();
      saveZoom(camera.cells);
    },
    { passive: false },
  );

  // ----- The buttons -----
  upButton.addEventListener('click', () => {
    if (state !== null && viewZ > WORLD.surfaceZ) {
      viewZ -= 1;
      closeChooser();
      draw();
    }
  });
  downButton.addEventListener('click', () => {
    if (state !== null && viewZ < state.size.z - 1) {
      viewZ += 1;
      closeChooser();
      draw();
    }
  });
  centreButton.addEventListener('click', () => {
    if (state !== null) {
      // Keeps the zoom; only the position changes.
      camera = centredOn(state.avatar.pos.x, state.avatar.pos.y, state.size, camera.cells);
      viewZ = minersMapLayer(state);
      closeChooser();
      draw();
    }
  });
  zoomButton.addEventListener('click', () => {
    if (state !== null) {
      // Back to the default zoom about the middle of the map, then make sure
      // the miner's neighbours are still on screen.
      const middle = frame.clientWidth / 2;
      camera = zoomedAbout(
        camera,
        VIEW_CELLS,
        middle,
        middle,
        middle,
        middle,
        frame.clientWidth,
        state.size,
      );
      const here = state.avatar.pos;
      if (viewZ === minersMapLayer(state)) {
        camera = followMiner(camera, here.x, here.y, state.size);
      }
      closeChooser();
      draw();
      saveZoom(camera.cells);
    }
  });
  window.addEventListener('resize', () => {
    draw();
  });

  function show(next: GameState, fresh: boolean): void {
    state = next;
    context = null;
    closeChooser();
    const here = next.avatar.pos;
    const layer = minersMapLayer(next);
    if (fresh || lastMinerLayer !== layer) {
      // A new run, or the miner changed layer: follow it.
      viewZ = layer;
    }
    if (fresh) {
      camera = centredOn(here.x, here.y, next.size, clampCells(camera.cells, next.size));
    } else {
      // Recentre if the miner, or a cell it could act on next, is off screen.
      camera = followMiner(camera, here.x, here.y, next.size);
    }
    lastMinerLayer = layer;
    draw();
  }

  return { element, show };
}
