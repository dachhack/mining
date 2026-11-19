// The tap map of the phone preview (issue #66): a 16 x 16 window of one
// layer drawn as coloured tiles on a canvas, dragged to pan, tapped to act.
//
// It draws only from `buildLayer` (tiles.ts), which holds what the player
// knows and nothing else, and it changes the game only by handing one of the
// legal actions to `onChoose` (the screen then calls `takeTurn`). It never
// edits the state.

import { BLOCKS, WORLD } from '../../data';
import type { BlockId } from '../../data';
import type { Action, GameState } from '../../engine';
import { choiceName, choiceWarning, describeChoice, layerName } from '../text/describe';
import { VIEW_CELLS, cellAt, centredOn, isInView, panned } from './camera';
import type { Camera } from './camera';
import { BLOCK_LOOKS, MARK_COLOURS, PREVIEW_MAP, UNKNOWN_LOOK, UNLIT_BRIGHTNESS } from './palette';
import type { Pattern } from './palette';
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
  if (tile.structure === 'ladder') {
    // Two rails and three rungs.
    ctx.strokeStyle = MARK_COLOURS.ladder;
    ctx.lineWidth = Math.max(1.5, c / 10);
    ctx.beginPath();
    ctx.moveTo(x + 0.3 * c, y + 0.1 * c);
    ctx.lineTo(x + 0.3 * c, y + 0.9 * c);
    ctx.moveTo(x + 0.7 * c, y + 0.1 * c);
    ctx.lineTo(x + 0.7 * c, y + 0.9 * c);
    for (const fy of [0.3, 0.5, 0.7]) {
      ctx.moveTo(x + 0.3 * c, y + fy * c);
      ctx.lineTo(x + 0.7 * c, y + fy * c);
    }
    ctx.stroke();
  } else if (tile.structure === 'torch') {
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
    const r = c * 0.17;
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
  if (tile.miner) {
    // The miner: a red-orange disc with a white ring and a white centre.
    ctx.fillStyle = MARK_COLOURS.miner;
    ctx.strokeStyle = MARK_COLOURS.minerOutline;
    ctx.lineWidth = Math.max(2, c / 9);
    ctx.beginPath();
    ctx.arc(x + mid, y + mid, c * 0.33, 0, Math.PI * 2);
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
): void {
  if (tile.kind === 'unknown') {
    drawUnknown(ctx, x, y, c);
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
  ctx.strokeStyle = MARK_COLOURS.grid;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
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
    if (tile.kind !== 'unknown' && !tile.lit) unlit = true;
    if (tile.traced) marks.add('traced');
    if (tile.structure !== null) marks.add(tile.structure);
    if (tile.items) marks.add('items');
    if (tile.miner) marks.add('miner');
  }
  if (marks.has('miner')) {
    entries.push(legendEntry(sampleTile({ kind: 'open', block: null, miner: true }), 'you'));
  }
  if (open) {
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
    ['ladder', { structure: 'ladder' }, 'ladder'],
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
  bar.append(upButton, layerLabel, downButton, centreButton);

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
  let camera: Camera = { x: 0, y: 0 };
  // The layer the miner was on when last shown, to follow it when it changes.
  let lastMinerLayer: number | null = null;
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  // Light and traces for `state`, worked out on the first draw after `show`.
  let context: LayerContext | null = null;

  /** The layer the map shows for the miner: on the surface, the top layer under it. */
  function minersMapLayer(s: GameState): number {
    return s.avatar.pos.z === WORLD.surfaceZ ? WORLD.surfaceZ + 1 : s.avatar.pos.z;
  }

  function cellPixels(): number {
    return frame.clientWidth / VIEW_CELLS;
  }

  function layerText(s: GameState): string {
    const here = s.avatar.pos.z;
    const name = viewZ === WORLD.surfaceZ ? 'Surface' : `Layer ${viewZ}`;
    if (viewZ === here) {
      return `${name} · you are here`;
    }
    if (here === WORLD.surfaceZ && viewZ === WORLD.surfaceZ + 1) {
      return `${name} · you stand on it`;
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
    const sidePx = Math.round(c * VIEW_CELLS);
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
    // Light and traces are worked out once per state, not on every frame of a drag.
    if (context === null) {
      context = layerContext(s);
    }
    const rows = buildLayer(s, viewZ, { x0, y0, size: VIEW_CELLS + 1 }, context);
    const drawn: Tile[] = [];
    for (const row of rows) {
      for (const tile of row) {
        if (tile.x >= s.size.x || tile.y >= s.size.y) {
          continue;
        }
        drawTile(ctx, tile, (tile.x - camera.x) * c, (tile.y - camera.y) * c, c);
        if (isInView(camera, tile.x, tile.y) || tile.miner) {
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
      showHint('Nothing to do there');
      return;
    }
    if (actions.length === 1 && choiceWarning(state, only) === null) {
      onChoose(only);
      return;
    }
    openChooser(state, actions, cell.x, cell.y);
  }

  // ----- Touch and mouse: a drag pans, a tap acts -----
  // Pointer events cover both touch and mouse. A press that moves more than
  // `dragThresholdPx` is a drag from then on, and its release is not a tap.
  let press: { id: number; x: number; y: number; camera: Camera; dragging: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camera: { ...camera },
      dragging: false,
    };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (press === null || event.pointerId !== press.id || state === null) {
      return;
    }
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      press.dragging = true;
      closeChooser();
    }
    if (press.dragging) {
      camera = panned(press.camera, dx, dy, cellPixels(), state.size);
      draw();
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (press === null || event.pointerId !== press.id) {
      return;
    }
    const wasDrag = press.dragging;
    press = null;
    if (!wasDrag) {
      const rect = canvas.getBoundingClientRect();
      tap(event.clientX - rect.left, event.clientY - rect.top);
    }
  });
  canvas.addEventListener('pointercancel', () => {
    press = null;
  });

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
      camera = centredOn(state.avatar.pos.x, state.avatar.pos.y, state.size);
      viewZ = minersMapLayer(state);
      closeChooser();
      draw();
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
      camera = centredOn(here.x, here.y, next.size);
    } else if (!isInView(camera, here.x, here.y)) {
      // The last move took the miner out of view: bring it back to the middle.
      camera = centredOn(here.x, here.y, next.size);
    }
    lastMinerLayer = layer;
    draw();
  }

  return { element, show };
}
