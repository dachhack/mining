// UI lab 1 (issue #116): plain blocks, tap to mine, height shadows, no turns.
//
// A UI experiment beside the real game. The map shows each square's top
// block as a painted texture; a square lower than a face neighbour has a
// soft shadow along that edge. A tap mines the square if the level rule
// allows it (labWorld.ts), and the counter above the map adds the yield.
// There are no turns, no AP, no fuel, no hazards and no crew.
//
// The screen only reads the lab world and replaces it with the one `labTap`
// returns; it never edits a world or a game state itself.

import { blockDefByCode } from '../../data';
import { topBlockAt } from '../../engine';
import type { HigherNeighbour } from '../../engine';
import { cellAt } from '../map/camera';
import { PREVIEW_MAP } from '../map/palette';
import { randomSeed } from '../previewSession';
import { centredLabCamera, clampLabCamera, pannedLab, rowsOf, zoomedLab } from './labCamera';
import type { LabCamera, ViewSize } from './labCamera';
import { LAB_LOOK, LAB_MARKS } from './labLook';
import { labTap, newLabWorld } from './labWorld';
import type { LabWorld } from './labWorld';
import { resourceEntries } from './resources';
import { shadowEdges } from './shadows';
import { textureFor } from './textures';

/** What the line under the map says when nothing has happened yet. */
const HINT = 'Tap a block to mine it · drag to move · pinch to zoom';
const REFUSED_HINT = 'Too steep: mine the higher blocks around it first.';
const BOTTOM_HINT = 'Nothing left to mine here: this is the bottom.';

/** Make an element with a class and, optionally, its text (as text, never as markup). */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) {
    made.textContent = text;
  }
  return made;
}

/** A small canvas showing block `code`'s texture: the icon of a counter entry or a key entry. */
function blockIcon(code: number, className: string): HTMLCanvasElement {
  const icon = element('canvas', className);
  const texture = textureFor(code, 0, 0);
  icon.width = LAB_LOOK.texturePx;
  icon.height = LAB_LOOK.texturePx;
  const ctx = icon.getContext('2d');
  if (ctx !== null && texture !== null) {
    ctx.drawImage(texture, 0, 0);
  }
  return icon;
}

/** Something drawn over the map for a short while after a tap. */
interface Effect {
  kind: 'mined' | 'refused';
  x: number;
  y: number;
  /** When it started (`performance.now()` milliseconds). */
  start: number;
  /** For 'mined': the label that floats up ("+1 Coal"), or '' for none. */
  label: string;
  /** For 'refused': the neighbours that are too high. */
  higher: HigherNeighbour[];
}

/** Build the lab inside `root`. `seed` opens that world; `null` picks a random one. */
export function mountLab(root: HTMLElement, seed: number | null, onBack: () => void): void {
  let world: LabWorld = newLabWorld(seed ?? randomSeed(Math.random));
  /** The top block of every square, row by row, worked out again after each mine. */
  let tops: number[] = topBlocksOf(world);
  // Set properly once the page is on screen and the map's size is known (below).
  let camera: LabCamera = { x: 0, y: 0, cells: LAB_LOOK.startCells };
  let effects: Effect[] = [];

  // ----- The page -----
  const page = element('main', 'lab');
  page.dataset['testid'] = 'lab';

  const top = element('header', 'lab-top');
  const back = element('button', 'lab-back', '‹');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to the start screen');
  back.addEventListener('click', onBack);
  const titleBox = element('div', 'lab-title-box');
  titleBox.append(
    element('h1', 'lab-title', 'Lab 1'),
    element('p', 'lab-subtitle', 'Plain blocks'),
  );
  const seedText = element('span', 'lab-seed');
  seedText.dataset['testid'] = 'lab-seed';
  titleBox.append(seedText);
  const newWorld = element('button', 'lab-new', 'New world');
  newWorld.type = 'button';
  top.append(back, titleBox, newWorld);

  const counter = element('section', 'lab-counter');
  counter.dataset['testid'] = 'lab-counter';
  counter.setAttribute('aria-label', 'Resources collected');

  const frame = element('div', 'lab-map-frame');
  const canvas = element('canvas', 'lab-map');
  canvas.dataset['testid'] = 'lab-map';
  frame.append(canvas);

  const hint = element('p', 'lab-hint', HINT);
  hint.dataset['testid'] = 'lab-hint';
  hint.setAttribute('aria-live', 'polite');

  const key = element('section', 'lab-key');
  key.setAttribute('aria-label', 'Blocks on the map');

  page.append(top, counter, frame, hint, key);
  root.replaceChildren(page);

  // ----- Drawing -----
  /** The map's size on screen, in CSS pixels (it is square). */
  function view(): ViewSize {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }
  function cellPixels(): number {
    return view().width / camera.cells;
  }

  function draw(now: number = performance.now()): void {
    const css = view();
    const ratio = window.devicePixelRatio || 1;
    const wantedWidth = Math.round(css.width * ratio);
    const wantedHeight = Math.round(css.height * ratio);
    if (canvas.width !== wantedWidth || canvas.height !== wantedHeight) {
      canvas.width = wantedWidth;
      canvas.height = wantedHeight;
    }
    const ctx = canvas.getContext('2d');
    if (ctx === null || css.width === 0) {
      return;
    }
    // Draw in CSS pixels; the canvas itself has `ratio` times as many, for a sharp picture.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = LAB_MARKS.gap;
    ctx.fillRect(0, 0, css.width, css.height);

    const c = cellPixels();
    const gap = Math.max(1, c * LAB_LOOK.gapFraction);
    const size = world.state.size;
    const x0 = Math.max(0, Math.floor(camera.x));
    const y0 = Math.max(0, Math.floor(camera.y));
    const x1 = Math.min(size.x - 1, Math.ceil(camera.x + camera.cells));
    const y1 = Math.min(size.y - 1, Math.ceil(camera.y + rowsOf(camera, css)));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        drawSquare(ctx, x, y, (x - camera.x) * c, (y - camera.y) * c, c, gap);
      }
    }
    drawEffects(ctx, now, c);

    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['cellPx'] = String(c);
  }

  /** One square: its texture, dimmed by depth, then its shadows and a faint bevel. */
  function drawSquare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    px: number,
    py: number,
    c: number,
    gap: number,
  ): void {
    const width = world.depths.width;
    const depth = world.depths.depths[x + width * y] ?? 0;
    const code = tops[x + width * y] ?? 0;
    const inner = c - gap;
    const left = px + gap / 2;
    const topEdge = py + gap / 2;

    const texture = textureFor(code, x, y);
    if (texture !== null) {
      ctx.drawImage(texture, left, topEdge, inner, inner);
    }

    // Deeper squares are a little darker, so a pit reads as a pit even without its shadows.
    const brightness = Math.max(
      LAB_LOOK.depthMinBrightness,
      LAB_LOOK.depthBrightnessPerLevel ** depth,
    );
    if (brightness < 1) {
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - brightness})`;
      ctx.fillRect(left, topEdge, inner, inner);
    }

    // A faint bevel: light along the top, dark along the bottom, so each block reads as a block.
    const bevel = Math.max(1, inner * 0.05);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(left, topEdge, inner, bevel);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(left, topEdge + inner - bevel, inner, bevel);

    // Shadows: along each edge that faces a higher neighbour.
    for (const edge of shadowEdges(world.depths, x, y)) {
      drawShadow(ctx, edge, left, topEdge, inner);
    }
  }

  /** A soft shadow inside the square, along one edge, fading towards the middle. */
  function drawShadow(
    ctx: CanvasRenderingContext2D,
    edge: 'north' | 'east' | 'south' | 'west',
    left: number,
    topEdge: number,
    inner: number,
  ): void {
    const depth = inner * LAB_LOOK.shadowWidth;
    // Where the gradient starts (on the edge) and ends (inside the square).
    let fromX = left;
    let fromY = topEdge;
    let toX = left;
    let toY = topEdge;
    // The strip of the square the shadow covers: set by each branch below.
    let rect: { x: number; y: number; w: number; h: number };
    if (edge === 'north') {
      toY = topEdge + depth;
      rect = { x: left, y: topEdge, w: inner, h: depth };
    } else if (edge === 'south') {
      fromY = topEdge + inner;
      toY = topEdge + inner - depth;
      rect = { x: left, y: topEdge + inner - depth, w: inner, h: depth };
    } else if (edge === 'west') {
      toX = left + depth;
      rect = { x: left, y: topEdge, w: depth, h: inner };
    } else {
      fromX = left + inner;
      toX = left + inner - depth;
      rect = { x: left + inner - depth, y: topEdge, w: depth, h: inner };
    }
    const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${LAB_LOOK.shadowAlpha})`);
    gradient.addColorStop(0.45, `rgba(0, 0, 0, ${LAB_LOOK.shadowAlpha * 0.35})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    // A thin sharp line right on the edge, so the step reads even when zoomed out.
    const line = Math.max(1, inner * 0.035);
    ctx.fillStyle = `rgba(0, 0, 0, ${LAB_LOOK.shadowLineAlpha})`;
    if (edge === 'north') ctx.fillRect(left, topEdge, inner, line);
    else if (edge === 'south') ctx.fillRect(left, topEdge + inner - line, inner, line);
    else if (edge === 'west') ctx.fillRect(left, topEdge, line, inner);
    else ctx.fillRect(left + inner - line, topEdge, line, inner);
  }

  /** The flashes, outlines and floating labels of recent taps. */
  function drawEffects(ctx: CanvasRenderingContext2D, now: number, c: number): void {
    for (const effect of effects) {
      const px = (effect.x - camera.x) * c;
      const py = (effect.y - camera.y) * c;
      if (effect.kind === 'mined') {
        const t = (now - effect.start) / LAB_LOOK.gainMs; // 0 .. 1
        // A quick flash on the square...
        const flash = Math.max(0, 1 - t * 3);
        if (flash > 0) {
          ctx.globalAlpha = flash;
          ctx.fillStyle = LAB_MARKS.minedFlash;
          ctx.fillRect(px, py, c, c);
          ctx.globalAlpha = 1;
        }
        // ...and the yield floating up from it.
        if (effect.label !== '') {
          ctx.globalAlpha = Math.max(0, 1 - t);
          ctx.font = `600 ${Math.max(12, Math.min(18, c * 0.5))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = LAB_MARKS.gainOutline;
          const ly = py + c * 0.3 - t * c * 1.1;
          ctx.strokeText(effect.label, px + c / 2, ly);
          ctx.fillStyle = LAB_MARKS.gain;
          ctx.fillText(effect.label, px + c / 2, ly);
          ctx.globalAlpha = 1;
        }
      } else {
        const t = (now - effect.start) / LAB_LOOK.refusedMs;
        // Two pulses that start bright and fade out.
        const pulse = Math.sqrt(Math.max(0, 1 - t)) * (0.75 + 0.25 * Math.cos(t * Math.PI * 4));
        ctx.globalAlpha = pulse;
        ctx.lineWidth = Math.max(2, c * 0.08);
        ctx.strokeStyle = LAB_MARKS.tooHigh;
        for (const n of effect.higher) {
          const nx = (n.x - camera.x) * c;
          const ny = (n.y - camera.y) * c;
          ctx.fillStyle = LAB_MARKS.tooHighWash;
          ctx.fillRect(nx, ny, c, c);
          ctx.strokeRect(
            nx + ctx.lineWidth / 2,
            ny + ctx.lineWidth / 2,
            c - ctx.lineWidth,
            c - ctx.lineWidth,
          );
        }
        ctx.strokeStyle = LAB_MARKS.refused;
        ctx.setLineDash([Math.max(3, c * 0.15), Math.max(2, c * 0.1)]);
        ctx.strokeRect(
          px + ctx.lineWidth / 2,
          py + ctx.lineWidth / 2,
          c - ctx.lineWidth,
          c - ctx.lineWidth,
        );
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Keep redrawing while any effect is still running, then stop. */
  let animating = false;
  function animate(): void {
    if (animating) {
      return;
    }
    animating = true;
    const step = (now: number): void => {
      effects = effects.filter(
        (e) => now - e.start < (e.kind === 'mined' ? LAB_LOOK.gainMs : LAB_LOOK.refusedMs),
      );
      draw(now);
      if (effects.length > 0) {
        requestAnimationFrame(step);
      } else {
        animating = false;
      }
    };
    requestAnimationFrame(step);
  }

  // ----- The counter and the key -----
  function showCounter(): void {
    const dug = element('div', 'lab-chip lab-chip-dug');
    dug.dataset['testid'] = 'lab-dug';
    dug.dataset['count'] = String(world.mined);
    dug.append(
      element('span', 'lab-chip-glyph', '⛏'),
      element('span', 'lab-chip-count', String(world.mined)),
      element('span', 'lab-chip-name', 'Dug'),
    );
    const chips: HTMLElement[] = [dug];
    for (const entry of resourceEntries(world.counts)) {
      const chip = element('div', 'lab-chip');
      chip.dataset['testid'] = `lab-res-${entry.item}`;
      chip.dataset['count'] = String(entry.count);
      chip.title = entry.name;
      chip.append(
        blockIcon(entry.iconBlock, 'lab-chip-icon'),
        element('span', 'lab-chip-count', String(entry.count)),
        element('span', 'lab-chip-name', entry.name),
      );
      chips.push(chip);
    }
    counter.replaceChildren(...chips);
  }

  /** The key: every block kind that is the top of some square, in code order, with its name. */
  function showKey(): void {
    const codes = [...new Set(tops)].sort((a, b) => a - b);
    key.replaceChildren(
      ...codes.map((code) => {
        const entry = element('span', 'lab-key-entry');
        entry.append(
          blockIcon(code, 'lab-key-icon'),
          element('span', 'lab-key-name', blockDefByCode(code).name),
        );
        return entry;
      }),
    );
  }

  function showWorld(): void {
    seedText.textContent = `Seed ${world.seed}`;
    showCounter();
    showKey();
    draw();
  }

  // ----- A tap -----
  function tap(x: number, y: number): void {
    const result = labTap(world, x, y);
    canvas.dataset['lastTap'] = `${result.result.mined ? 'mined' : 'refused'} ${x},${y}`;
    if (result.result.mined) {
      world = result.world;
      tops = topBlocksOf(world);
      const label = result.result.yields
        .map((stack) => `+${stack.count} ${resourceName(stack.item)}`)
        .join('  ');
      effects = effects.filter((e) => !(e.x === x && e.y === y));
      effects.push({ kind: 'mined', x, y, start: performance.now(), label, higher: [] });
      hint.textContent = HINT;
      hint.classList.remove('lab-hint-warn');
      showCounter();
      showKey();
    } else {
      effects = effects.filter((e) => e.kind !== 'refused');
      effects.push({
        kind: 'refused',
        x,
        y,
        start: performance.now(),
        label: '',
        higher: result.result.higherNeighbours,
      });
      hint.textContent = result.result.refusal === 'bottom' ? BOTTOM_HINT : REFUSED_HINT;
      hint.classList.add('lab-hint-warn');
      // Restart the shake: removing the class and forcing a layout lets it run again.
      frame.classList.remove('lab-shake');
      void frame.offsetWidth;
      frame.classList.add('lab-shake');
    }
    animate();
  }

  function resourceName(item: string): string {
    return resourceEntries(new Map([[item, 1]]))[0]?.name ?? item;
  }

  newWorld.addEventListener('click', () => {
    world = newLabWorld(randomSeed(Math.random));
    tops = topBlocksOf(world);
    camera = centredLabCamera(LAB_LOOK.startCells, world.state.size, view());
    effects = [];
    hint.textContent = HINT;
    hint.classList.remove('lab-hint-warn');
    showWorld();
  });

  // ----- Touch and mouse: drag pans, pinch zooms, a still tap mines -----
  // The same gestures as the game's map (map/mapView.ts), without the hold.
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: {
    kind: 'press' | 'drag' | 'pinch';
    camera: LabCamera;
    startX: number;
    startY: number;
    pinchDistance: number;
    pinchMidX: number;
    pinchMidY: number;
  } | null = null;

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

  function startPinch(): void {
    const fingers = twoFingers();
    if (gesture !== null && fingers !== null) {
      gesture.kind = 'pinch';
      gesture.camera = { ...camera };
      gesture.pinchDistance = fingers.distance;
      gesture.pinchMidX = fingers.midX;
      gesture.pinchMidY = fingers.midY;
    }
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
    } else {
      startPinch();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || gesture === null) {
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.kind === 'pinch') {
      const fingers = twoFingers();
      if (fingers === null) {
        return;
      }
      const cells = (gesture.camera.cells * gesture.pinchDistance) / fingers.distance;
      camera = zoomedLab(
        gesture.camera,
        cells,
        { x: gesture.pinchMidX, y: gesture.pinchMidY },
        { x: fingers.midX, y: fingers.midY },
        world.state.size,
        view(),
      );
      draw();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (gesture.kind === 'press' && Math.hypot(dx, dy) > PREVIEW_MAP.dragThresholdPx) {
      gesture.kind = 'drag';
    }
    if (gesture.kind === 'drag') {
      camera = pannedLab(gesture.camera, dx, dy, world.state.size, view());
      draw();
    }
  });

  function lift(event: PointerEvent, cancelled: boolean): void {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.delete(event.pointerId);
    if (gesture === null) {
      return;
    }
    if (pointers.size >= 2 && gesture.kind === 'pinch') {
      startPinch(); // a new pair of fingers: start afresh, or the map would jump
    }
    if (pointers.size > 0) {
      return;
    }
    const ended = gesture;
    gesture = null;
    if (ended.kind === 'press' && !cancelled) {
      const rect = canvas.getBoundingClientRect();
      const cell = cellAt(
        camera,
        event.clientX - rect.left,
        event.clientY - rect.top,
        cellPixels(),
      );
      const size = world.state.size;
      if (cell.x >= 0 && cell.y >= 0 && cell.x < size.x && cell.y < size.y) {
        tap(cell.x, cell.y);
      }
    }
  }
  canvas.addEventListener('pointerup', (event) => lift(event, false));
  canvas.addEventListener('pointercancel', (event) => lift(event, true));

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const cells = camera.cells * Math.exp(event.deltaY * PREVIEW_MAP.wheelZoomRate);
      const point = { x: px, y: py };
      camera = zoomedLab(camera, cells, point, point, world.state.size, view());
      draw();
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    camera = clampLabCamera(camera, world.state.size, view());
    draw();
  });

  camera = centredLabCamera(LAB_LOOK.startCells, world.state.size, view());
  showWorld();
}

/** The top block of every square of the world, row by row (y = 0 first). */
function topBlocksOf(world: LabWorld): number[] {
  const codes: number[] = [];
  for (let y = 0; y < world.state.size.y; y += 1) {
    for (let x = 0; x < world.state.size.x; x += 1) {
      codes.push(topBlockAt(world.state, x, y));
    }
  }
  return codes;
}
