// UI lab 1 (issue #116): plain blocks, tap to mine, height shadows, no turns.
//
// A UI experiment beside the real game. The map shows each square's top
// block as a painted texture; a square lower than a face neighbour has a
// soft shadow along that edge. A tap mines the square if the level rule
// allows it (labWorld.ts), and the counter above the map adds the yield.
// There are no turns, no AP, no fuel, no hazards and no crew.
//
// The drawing, the gestures and the page parts are shared with Lab 2
// (labDraw.ts, labGestures.ts, labDom.ts).
//
// The screen only reads the lab world and replaces it with the one `labTap`
// returns; it never edits a world or a game state itself.

import type { HigherNeighbour } from '../../engine';
import { randomSeed } from '../previewSession';
import { centredLabCamera, rowsOf } from './labCamera';
import type { LabCamera, ViewSize } from './labCamera';
import { element, gainLabel, labCounter, labKey, labTopBar, showCounter, showKey } from './labDom';
import {
  cueLoop,
  drawBlockSquare,
  drawMinedCue,
  drawRefusedCue,
  prepareCanvas,
  squareBox,
} from './labDraw';
import { attachLabGestures } from './labGestures';
import { LAB_LOOK } from './labLook';
import { labTap, newLabWorld, topBlocksOf } from './labWorld';
import type { LabWorld } from './labWorld';
import { shadowEdges } from './shadows';

/** What the line under the map says when nothing has happened yet. */
const HINT = 'Tap a block to mine it · drag to move · pinch to zoom';
const REFUSED_HINT = 'Too steep: mine the higher blocks around it first.';
const BOTTOM_HINT = 'Nothing left to mine here: this is the bottom.';

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
  let tops: number[] = topBlocksOf(world.state);
  // Set properly once the page is on screen and the map's size is known (below).
  let camera: LabCamera = { x: 0, y: 0, cells: LAB_LOOK.startCells };
  let effects: Effect[] = [];

  // ----- The page -----
  const page = element('main', 'lab');
  page.dataset['testid'] = 'lab';

  const top = labTopBar('Lab 1', 'Plain blocks', onBack);
  const counter = labCounter();

  const frame = element('div', 'lab-map-frame');
  const canvas = element('canvas', 'lab-map');
  canvas.dataset['testid'] = 'lab-map';
  frame.append(canvas);

  const hint = element('p', 'lab-hint', HINT);
  hint.dataset['testid'] = 'lab-hint';
  hint.setAttribute('aria-live', 'polite');

  const key = labKey();

  page.append(top.bar, counter, frame, hint, key);
  root.replaceChildren(page);

  // ----- Drawing -----
  /** The map's size on screen, in CSS pixels. */
  function view(): ViewSize {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }
  function cellPixels(): number {
    return view().width / camera.cells;
  }

  function draw(now: number = performance.now()): void {
    const prepared = prepareCanvas(canvas);
    if (prepared === null) {
      return;
    }
    const { ctx } = prepared;
    const css = view();
    const c = cellPixels();
    const size = world.state.size;
    const width = world.depths.width;
    const x0 = Math.max(0, Math.floor(camera.x));
    const y0 = Math.max(0, Math.floor(camera.y));
    const x1 = Math.min(size.x - 1, Math.ceil(camera.x + camera.cells));
    const y1 = Math.min(size.y - 1, Math.ceil(camera.y + rowsOf(camera, css)));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const box = squareBox((x - camera.x) * c, (y - camera.y) * c, c);
        const depth = world.depths.depths[x + width * y] ?? 0;
        const code = tops[x + width * y] ?? 0;
        drawBlockSquare(ctx, code, depth, shadowEdges(world.depths, x, y), x, y, box);
      }
    }
    drawEffects(ctx, now, c);

    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['cellPx'] = String(c);
  }

  function toPx(x: number, y: number): { px: number; py: number } {
    const c = cellPixels();
    return { px: (x - camera.x) * c, py: (y - camera.y) * c };
  }

  /** The flashes, outlines and floating labels of recent taps. */
  function drawEffects(ctx: CanvasRenderingContext2D, now: number, c: number): void {
    for (const effect of effects) {
      const { px, py } = toPx(effect.x, effect.y);
      if (effect.kind === 'mined') {
        drawMinedCue(ctx, px, py, c, (now - effect.start) / LAB_LOOK.gainMs, effect.label);
      } else {
        const t = (now - effect.start) / LAB_LOOK.refusedMs;
        drawRefusedCue(ctx, px, py, c, t, effect.higher, toPx);
      }
    }
  }

  /** Keep redrawing while any effect is still running, then stop. */
  const cues = cueLoop((now) => {
    effects = effects.filter(
      (e) => now - e.start < (e.kind === 'mined' ? LAB_LOOK.gainMs : LAB_LOOK.refusedMs),
    );
    draw(now);
    return effects.length > 0;
  });

  function showWorld(): void {
    top.seedText.textContent = `Seed ${world.seed}`;
    showCounter(counter, world);
    showKey(key, tops);
    draw();
  }

  // ----- A tap -----
  function tap(x: number, y: number): void {
    const result = labTap(world, x, y);
    canvas.dataset['lastTap'] = `${result.result.mined ? 'mined' : 'refused'} ${x},${y}`;
    if (result.result.mined) {
      world = result.world;
      tops = topBlocksOf(world.state);
      const label = gainLabel(result.result.yields);
      effects = effects.filter((e) => !(e.x === x && e.y === y));
      effects.push({ kind: 'mined', x, y, start: performance.now(), label, higher: [] });
      hint.textContent = HINT;
      hint.classList.remove('lab-hint-warn');
      showCounter(counter, world);
      showKey(key, tops);
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
    cues.start();
  }

  top.newWorld.addEventListener('click', () => {
    world = newLabWorld(randomSeed(Math.random));
    tops = topBlocksOf(world.state);
    camera = centredLabCamera(LAB_LOOK.startCells, world.state.size, view());
    effects = [];
    hint.textContent = HINT;
    hint.classList.remove('lab-hint-warn');
    showWorld();
  });

  // ----- Touch and mouse: drag pans, pinch zooms, a still tap mines -----
  attachLabGestures(canvas, {
    camera: () => camera,
    setCamera: (next) => {
      camera = next;
      draw();
    },
    ground: () => world.state.size,
    onTap: tap,
  });

  camera = centredLabCamera(LAB_LOOK.startCells, world.state.size, view());
  showWorld();
}
