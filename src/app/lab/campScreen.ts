// UI lab 2 (issue #118): fog of war around camps, with camps you place and
// upgrade.
//
// Built on Lab 1: the same blocks, shadows, tap-to-mine, level rule and
// counter, drawn with the same code (labDraw.ts, labDom.ts, labGestures.ts).
// Lab 2 adds:
//
// - fog: only squares inside a camp's ring are lit and can be mined; squares
//   lit once but out of range now are greyed; the rest is dark;
// - camps: a 3 x 3 base with a tent on it; tap one to see its level, ring and what
//   it mines, and to upgrade it;
// - a camp tool (or a long press on a lit square) to place a new camp,
//   showing its cost and the ring it would light before you confirm.
//
// The rules are in campWorld.ts; this file only draws and reacts to taps.
// It never edits a world: it replaces it with the one campWorld returns.
//
// The map never moves: the panel under it (the "tray") has a fixed height,
// and opening the camp tool or a camp's panel only swaps what is inside it.

import { BLOCKS, blockDefByCode, ITEMS } from '../../data';
import type { ItemId, ItemStack } from '../../data';
import { FRONTIER_SHIFT } from '../../data/frontier';
import { LAB_ITEMS, LAB_NEW_CAMP_COST } from '../../data/labCamps';
import type { HigherNeighbour, SquareDirection } from '../../engine';
import { SQUARE_STEPS, loadFrontier, saveFrontier } from '../../engine';
import { randomSeed } from '../previewSession';
import { CAMP_LOOK, CAMP_MARKS } from './campLook';
import {
  campWorldOf,
  closeMine,
  toFrontier,
  endShift,
  restCrew,
  turnRefusal,
  campAt,
  campRadius,
  campTap,
  canAfford,
  addedNamesAt,
  minesText,
  newCampWorld,
  newlyCovered,
  demolishCamp,
  demolishRefusal,
  footprintOf,
  placeCamp,
  PREPARED_LAB2_KEY,
  placeRefusal,
  replayCampSteps,
  sightMap,
  upgradeCamp,
  upgradeCostFrom,
} from './campWorld';
import type {
  Camp,
  CampStep,
  CampTurn,
  CampWorld,
  PlaceRefusal,
  ShiftReport,
  Sight,
} from './campWorld';
import { centredLabCamera, clampLabCamera, rowsOf } from './labCamera';
import type { LabCamera, ViewSize } from './labCamera';
import { blockIcon, button, element, labCounter, labKey, labTopBar, showKey } from './labDom';
import {
  cueLoop,
  drawBlockSquare,
  drawFloatingLabel,
  drawMinedCue,
  drawRefusedCue,
  prepareCanvas,
  squareBox,
} from './labDraw';
import type { SquareBox } from './labDraw';
import { attachLabGestures } from './labGestures';
import { LAB_LOOK } from './labLook';
import { topBlocksOf } from './labWorld';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from './surface';
import type { Animal } from './surface';
import {
  clayTexture,
  drawAnimal,
  drawAppleTree,
  drawForest,
  drawStump,
  drawGrass,
  featureSwatch,
  labItemIcon,
} from './surfaceArt';
import { resourceEntries } from './resources';
import { PINS_KEY, labRecipes, parsePins, recipeById } from './recipes';
import type { Recipe } from './recipes';
import { emptyHistory, noteAction, undoCount, undoLast } from './undoHistory';
import type { UndoHistory } from './undoHistory';
import { shadowEdges } from './shadows';
import { showNight } from './night';
import type { Night } from './night';

const HINT = 'Tap to gather and dig · tap a camp to upgrade it';
const STEEP_HINT = 'Too steep: mine the higher blocks around it first.';
const BOTTOM_HINT = 'Nothing left to mine here: this is the bottom.';
/** What the line under the map says after a tap that took something from the surface. */
const HARVEST_HINTS = {
  grass: 'Grass cut. The ground under it can be dug now.',
  felled: 'Tree felled. The ground under it can be dug now.',
  apple: 'An apple picked. Empty trees regrow their apples after a while.',
  caught: 'Animal caught!',
};
const GREYED_HINT = 'Out of range now: put a camp nearby to mine here.';
const PLACE_HINT = 'Tap the middle of a flat, lit 3 × 3 patch for the new camp.';
const PLACE_CHOSEN_HINT = 'Tap Place camp to build here, or tap another spot.';
const NOT_LEVEL_TEXT = 'Ground not level: a camp needs a flat 3 × 3.';
const DEMOLISH_FIRST = 'Build another camp that covers this one first.';
const NO_TAPS_HINT = 'No taps left this shift: tap End shift to carry on.';
const OVER_HINT = 'This run is over. Tap New world to start another.';
const CLOSE_CONFIRM_MS = 3000;
/** Where the game keeps its run (plan B1). */
export const RUN_KEY = 'mining-game.run';

/** What End shift did, in one short line for the hint. */
function shiftText(report: ShiftReport, turn: CampTurn, rested: boolean): string {
  const paid = report.paid.map((s) => `${s.count} ${itemName(s.item).toLowerCase()}`).join(', ');
  const lacking = report.unpaid.map((s) => s.item).join(' or ');
  const start = rested ? `Rested. Shift ${report.shift} over` : `Shift ${report.shift} over`;
  if (turn.status === 'lost') {
    return `${start}: no ${lacking}. The crew is lost.`;
  }
  if (report.healthLost > 0) {
    const part = paid === '' ? '' : `paid ${paid}; `;
    // The crew rests only at a camp (question 156), so say where.
    return `${start}: ${part}no ${lacking}, −${report.healthLost} health. Tap a camp to rest.`;
  }
  return `${start}: ${paid === '' ? 'nothing due' : `paid ${paid}`}.`;
}

/** What the place-camp tool says about a target the rules refuse. */
function placeRefusalText(refusal: PlaceRefusal): string {
  if (refusal === 'noTaps') return NO_TAPS_HINT;
  if (refusal === 'over') return OVER_HINT;
  if (refusal === 'notShown') return 'The 3 × 3 must be lit, inside a camp’s ring.';
  if (refusal === 'occupied') return 'It overlaps another camp.';
  if (refusal === 'notLevel') return NOT_LEVEL_TEXT;
  return 'Not enough to build it yet: mine more first.';
}

/** Something drawn over the map for a short while. */
interface Effect {
  kind: 'mined' | 'refused' | 'tooHard' | 'ring';
  x: number;
  y: number;
  start: number;
  /** 'mined': "+1 Stone"; 'tooHard': "Needs Lv 2". */
  label: string;
  /** 'refused': the neighbours that are too high. */
  higher: HigherNeighbour[];
  /** 'ring': the ring spreads from this radius to `toRadius`, in squares. */
  fromRadius: number;
  toRadius: number;
}

/** What the tray under the map shows. */
type Mode =
  | { kind: 'idle' }
  | { kind: 'placing'; target: { x: number; y: number } | null }
  | { kind: 'camp'; id: number }
  // The recipe book is open in the tray.
  | { kind: 'book' };

/** How long each kind of effect lasts, in milliseconds. */
function effectMs(kind: Effect['kind']): number {
  if (kind === 'mined') return LAB_LOOK.gainMs;
  if (kind === 'refused') return LAB_LOOK.refusedMs;
  if (kind === 'tooHard') return CAMP_LOOK.tooHardMs;
  return CAMP_LOOK.ringMs;
}

/** The display name of an item. */
function itemName(item: string): string {
  const lab = LAB_ITEMS[item];
  if (lab !== undefined) {
    return lab; // the lab's own items: wood, grass, apples, animals, clay
  }
  return item in ITEMS ? ITEMS[item as ItemId].name : item;
}

/** The "+2 Wood" label for what a tap gave. */
function gainText(gains: ItemStack[]): string {
  return gains.map((g) => `+${g.count} ${itemName(g.item)}`).join('  ');
}

/** The prepared world in localStorage, or `null` if there is none or it cannot be read. */
function loadPrepared(): CampWorld | null {
  try {
    const text = window.localStorage.getItem(PREPARED_LAB2_KEY);
    if (text === null) {
      return null;
    }
    // `as`: the shape is checked just below, field by field.
    const parsed = JSON.parse(text) as { seed?: unknown; steps?: unknown };
    if (typeof parsed.seed !== 'number' || !Array.isArray(parsed.steps)) {
      return null;
    }
    return replayCampSteps(parsed.seed, parsed.steps as CampStep[]);
  } catch {
    return null;
  }
}

function clearPrepared(): void {
  try {
    window.localStorage.removeItem(PREPARED_LAB2_KEY);
  } catch {
    // No storage: nothing to remove.
  }
}

/** The saved run of the game (plan B1), or `null` if there is none or it cannot be read. */
function loadRun(): CampWorld | null {
  try {
    const state = loadFrontier(window.localStorage.getItem(RUN_KEY));
    return state === null ? null : campWorldOf(state);
  } catch {
    return null; // no storage
  }
}

/**
 * Save the run (question 152: saved every shift). It is saved at the start
 * of each shift, so reopening the app carries on from there; taps since are
 * not kept, as Undo could take them back anyway.
 */
function saveRun(world: CampWorld): void {
  try {
    window.localStorage.setItem(RUN_KEY, saveFrontier(toFrontier(world)));
  } catch {
    // No storage, or it is full: the run goes on, unsaved.
  }
}

/** The pinned recipes saved last time, or the first pins (recipes.ts). */
function loadPins(): string[] {
  try {
    return parsePins(window.localStorage.getItem(PINS_KEY));
  } catch {
    return parsePins(null); // no storage: the first pins
  }
}

/** Save the pinned recipes, so they come back next time (owner, question 143). */
function savePins(pins: string[]): void {
  try {
    window.localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // No storage, or it is full: the pins still work until Lab 2 closes.
  }
}

/** Build Lab 2 inside `root`. `seed` opens that world; `null` picks a random one. */
export function mountCampLab(
  root: HTMLElement,
  seed: number | null,
  onBack: () => void,
  asGame = false,
): void {
  // As the game (plan B1), the run is loaded from its save, or a new one
  // started; a seed in the address starts a new run on that seed. As Lab 2
  // (the sandbox), nothing is saved, and a prepared world may be opened.
  const prepared = asGame ? null : loadPrepared();
  /** True while the world on screen is the prepared one (e2e tests only). */
  let isPrepared = prepared !== null;
  const saved = asGame && seed === null ? loadRun() : null;
  let world: CampWorld = prepared ?? saved ?? newCampWorld(seed ?? randomSeed(Math.random));
  if (asGame) {
    saveRun(world);
  }
  let tops: number[] = topBlocksOf(world.lab.state);
  let sights: Sight[] = sightMap(world);
  let camera: LabCamera = { x: 0, y: 0, cells: CAMP_LOOK.startCells };
  let effects: Effect[] = [];
  let mode: Mode = { kind: 'idle' };
  /**
   * The recipes pinned to the tray's top row, by id, in the order they were
   * pinned. They stay pinned through New world and Undo, and are saved, so
   * they come back when Lab 2 opens again (question 143).
   */
  let pins: string[] = loadPins();
  function setPins(next: string[]): void {
    pins = next;
    savePins(pins);
  }
  /** What the player did, to undo it (undoHistory.ts). A new world starts with none. */
  let history: UndoHistory = emptyHistory(world);
  /**
   * Where each animal was before the last End shift, and when (screen time,
   * in milliseconds): it slides across from there (A4: animals move only
   * when a shift ends).
   */
  const lastStep = new Map<number, { x: number; y: number; at: number; facing: number }>();

  // ----- The page -----
  const page = element('main', 'lab lab2');
  page.dataset['testid'] = 'lab2';
  const top = asGame
    ? labTopBar('Mining Game', 'Camps and fog', onBack, 'Other versions')
    : labTopBar('Lab 2', 'Camps and fog', onBack);
  if (asGame) {
    top.newWorld.textContent = 'New run';
    top.newWorld.dataset['testid'] = 'new-run';
  }
  const counter = labCounter();

  const frame = element('div', 'lab-map-frame');
  const canvas = element('canvas', 'lab-map');
  canvas.dataset['testid'] = 'lab-map';
  frame.append(canvas);

  // Undo (owner: "Undo button"): over the map's bottom-right corner, near the
  // thumb, so it takes no room from the tray and never moves the map.
  const undoButton = button('lab2-undo', '↶ Undo');
  undoButton.dataset['testid'] = 'lab2-undo';
  undoButton.setAttribute('aria-label', 'Undo the last action');
  undoButton.addEventListener('click', undo);
  frame.append(undoButton);

  // Shifts (plan A4): the HUD (shift, taps left, health) over the map's
  // top-left corner; End shift over its bottom-left, by the thumb (Rest is
  // in a camp's panel: the crew rests only at a camp, question 156);
  // Close mine over its top-right. Like Undo, they sit over the map, so they
  // take no room from the tray and never move the map.
  const hud = element('div', 'lab2-hud');
  hud.dataset['testid'] = 'lab2-hud';
  hud.setAttribute('aria-live', 'polite');
  const hudShift = element('span', 'lab2-hud-shift');
  const hudTaps = element('span', 'lab2-hud-taps');
  hudTaps.dataset['testid'] = 'lab2-hud-taps';
  const hudHealth = element('span', 'lab2-hud-health');
  hudHealth.dataset['testid'] = 'lab2-hud-health';
  hud.append(hudShift, hudTaps, hudHealth);
  const shiftButtons = element('div', 'lab2-shift-buttons');
  const endShiftButton = button('lab2-end-shift', 'End shift');
  endShiftButton.dataset['testid'] = 'lab2-end-shift';
  endShiftButton.addEventListener('click', () => finishShift(null));
  shiftButtons.append(endShiftButton);
  const closeButton = button('lab2-close-mine', 'Close mine');
  closeButton.dataset['testid'] = 'lab2-close-mine';
  closeButton.addEventListener('click', askCloseMine);
  const overBanner = element('div', 'lab2-over');
  overBanner.dataset['testid'] = 'lab2-over';
  frame.append(hud, shiftButtons, closeButton, overBanner);

  const hint = element('p', 'lab-hint', HINT);
  hint.dataset['testid'] = 'lab-hint';
  hint.setAttribute('aria-live', 'polite');

  // The tray: a fixed height, whatever it shows (see lab.css).
  const tray = element('section', 'lab2-tray');
  tray.dataset['testid'] = 'lab2-tray';

  page.append(top.bar, counter, frame, hint, tray);
  root.replaceChildren(page);

  // ----- Drawing -----
  function view(): ViewSize {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }
  function cellPixels(): number {
    return view().width / camera.cells;
  }
  function toPx(x: number, y: number): { px: number; py: number } {
    const c = cellPixels();
    return { px: (x - camera.x) * c, py: (y - camera.y) * c };
  }
  function sightOf(x: number, y: number): Sight {
    const size = world.lab.state.size;
    if (x < 0 || y < 0 || x >= size.x || y >= size.y) {
      return 'fog';
    }
    return sights[x + size.x * y] ?? 'fog';
  }

  /** The squares a new camp on the tool's target would light: for the preview. */
  let preview: Set<number> = new Set();

  function draw(now: number = performance.now()): void {
    const ready = prepareCanvas(canvas);
    if (ready === null) {
      return;
    }
    const { ctx } = ready;
    const css = view();
    const c = cellPixels();
    const size = world.lab.state.size;
    const x0 = Math.max(0, Math.floor(camera.x));
    const y0 = Math.max(0, Math.floor(camera.y));
    const x1 = Math.min(size.x - 1, Math.ceil(camera.x + camera.cells));
    const y1 = Math.min(size.y - 1, Math.ceil(camera.y + rowsOf(camera, css)));

    // Fog fills everything first, edge to edge (no gaps between fog squares).
    ctx.fillStyle = CAMP_MARKS.fog;
    ctx.fillRect(0, 0, css.width, css.height);
    // A faint, soft mottle, so the fog reads as darkness over ground, not a hole.
    for (let y = y0 - 1; y <= y1 + 1; y += 1) {
      for (let x = x0 - 1; x <= x1 + 1; x += 1) {
        if ((x * 7 + y * 13) % 6 === 0) {
          const { px, py } = toPx(x, y);
          const glow = ctx.createRadialGradient(
            px + c / 2,
            py + c / 2,
            0,
            px + c / 2,
            py + c / 2,
            c * 1.8,
          );
          glow.addColorStop(0, CAMP_MARKS.fogMottle);
          glow.addColorStop(1, 'rgba(255, 240, 220, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(px - c * 1.8, py - c * 1.8, c * 4.6, c * 4.6);
        }
      }
    }

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const sight = sightOf(x, y);
        if (sight === 'fog') {
          continue;
        }
        const { px, py } = toPx(x, y);
        const box = squareBox(px, py, c);
        const i = x + size.x * y;
        const depth = world.lab.depths.depths[i] ?? 0;
        // A gap-coloured backing, so lit and greyed squares keep Lab 1's thin grid.
        ctx.fillStyle = '#0d0b0a';
        ctx.fillRect(px, py, c, c);
        // Clay is a real block now (plan A1): it is drawn with its own texture.
        const clay = tops[i] === BLOCKS.clay.code ? clayTexture(x, y) : null;
        drawBlockSquare(
          ctx,
          tops[i] ?? 0,
          depth,
          shadowEdges(world.lab.depths, x, y),
          x,
          y,
          box,
          clay,
        );
        drawFeature(ctx, i, box, x, y, { px, py, c });
        if (sight === 'greyed') {
          drawGreyed(ctx, px, py, c);
        }
      }
    }

    // The edge of the lit area: a soft shade inside, a glow spilling outside, a thin line on it.
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (sightOf(x, y) === 'shown') {
          drawLitEdges(ctx, x, y, c);
        }
      }
    }

    drawAnimals(ctx, c);
    if (mode.kind === 'placing' && mode.target !== null) {
      drawPlacePreview(ctx, mode.target, c, now);
    }
    for (const camp of world.camps) {
      if (sightOf(camp.x, camp.y) === 'shown') {
        const selected = mode.kind === 'camp' && mode.id === camp.id;
        if (selected) {
          drawRing(ctx, camp.x, camp.y, campRadius(camp.level), c, 1, false);
        }
        drawCampMarker(ctx, camp, c, selected);
      }
    }
    drawEffects(ctx, now, c);

    canvas.dataset['camX'] = String(camera.x);
    canvas.dataset['camY'] = String(camera.y);
    canvas.dataset['cells'] = String(camera.cells);
    canvas.dataset['cellPx'] = String(c);
    canvas.dataset['shown'] = String(sights.filter((s) => s === 'shown').length);
    canvas.dataset['greyed'] = String(sights.filter((s) => s === 'greyed').length);
    canvas.dataset['camps'] = String(world.camps.length);
    canvas.dataset['mode'] = mode.kind;
    // The square a new camp would go on, while placing: '' if none yet.
    canvas.dataset['target'] =
      mode.kind === 'placing' && mode.target !== null ? `${mode.target.x},${mode.target.y}` : '';
    // For the e2e tests: the shift, and where the animals are.
    canvas.dataset['shift'] = String(world.turn.shift);
    canvas.dataset['animals'] = world.surface.animals.map((a) => `${a.x},${a.y}`).join(' ');
  }

  /** True if square (x, y) is on the map, not in fog, and has a tree or an apple tree: part of a forest. */
  function forestAt(x: number, y: number): boolean {
    const size = world.lab.state.size;
    if (x < 0 || y < 0 || x >= size.x || y >= size.y || sightOf(x, y) === 'fog') {
      return false;
    }
    const feature = world.surface.features[x + size.x * y];
    return feature === TREE || feature === APPLE_TREE;
  }

  /**
   * What grows on square `i` (grass, a tree, an apple tree), drawn over its
   * block and hiding it. Trees join the forest squares beside them. A stump
   * is drawn small, over the block.
   */
  function drawFeature(
    ctx: CanvasRenderingContext2D,
    i: number,
    box: SquareBox,
    x: number,
    y: number,
    cell: { px: number; py: number; c: number },
  ): void {
    const feature = world.surface.features[i];
    if (feature === GRASS) {
      drawGrass(ctx, box, x, y);
      return;
    }
    if (feature !== TREE && feature !== APPLE_TREE) {
      if ((world.surface.stumps[i] ?? NO_FEATURE) !== NO_FEATURE) {
        drawStump(ctx, box); // a felled tree that will grow back
      }
      return;
    }
    const joins = {
      n: forestAt(x, y - 1),
      e: forestAt(x + 1, y),
      s: forestAt(x, y + 1),
      w: forestAt(x - 1, y),
    };
    if (feature === TREE) {
      drawForest(ctx, cell, box, x, y, joins);
    } else {
      drawAppleTree(ctx, cell, box, x, y, joins, world.surface.apples[i] ?? 0);
    }
  }

  /**
   * The animals on lit squares (never in fog or on greyed ground). An animal
   * that has just stepped slides across from where it was.
   */
  function drawAnimals(ctx: CanvasRenderingContext2D, c: number): void {
    const now = performance.now();
    for (const animal of world.surface.animals) {
      if (sightOf(animal.x, animal.y) !== 'shown') {
        continue;
      }
      const step = lastStep.get(animal.id);
      let ax = animal.x;
      let ay = animal.y;
      let facing = 0;
      if (step !== undefined) {
        facing = step.facing;
        const t = Math.min(1, Math.max(0, (now - step.at) / CAMP_LOOK.animalSlideMs));
        ax = step.x + (animal.x - step.x) * t;
        ay = step.y + (animal.y - step.y) * t;
      }
      const { px, py } = toPx(ax, ay);
      drawAnimal(ctx, px + c / 2, py + c / 2, c, facing);
    }
  }

  /** Note each animal that moved between `before` and the world now, for `drawAnimals`. */
  function noteSteps(before: Animal[]): void {
    for (const animal of world.surface.animals) {
      const was = before.find((a) => a.id === animal.id);
      if (was !== undefined && (was.x !== animal.x || was.y !== animal.y)) {
        const facing = Math.atan2(animal.y - was.y, animal.x - was.x);
        lastStep.set(animal.id, { x: was.x, y: was.y, at: performance.now(), facing });
      }
    }
  }

  /** A greyed square: its colour drained, and darker. */
  function drawGreyed(ctx: CanvasRenderingContext2D, px: number, py: number, c: number): void {
    ctx.save();
    // "saturation" keeps the picture's brightness but takes the colour of
    // what is drawn on top: grey, so the square loses its colour.
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(px, py, c, c);
    ctx.restore();
    ctx.fillStyle = `rgba(8, 7, 6, ${CAMP_LOOK.greyedDim})`;
    ctx.fillRect(px, py, c, c);
  }

  /** Along each edge of lit square (x, y) that borders a square that is not lit. */
  function drawLitEdges(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
    const { px, py } = toPx(x, y);
    for (const step of SQUARE_STEPS) {
      if (sightOf(x + step.dx, y + step.dy) === 'shown') {
        continue;
      }
      // Inside: a shade fading in from the edge, like dusk at the lantern's reach.
      edgeGradient(
        ctx,
        step.direction,
        px,
        py,
        c,
        CAMP_LOOK.edgeWidth,
        `0, 0, 0`,
        CAMP_LOOK.edgeAlpha,
        false,
      );
      // Outside: the lantern light spilling a little way into the dark.
      edgeGradient(
        ctx,
        step.direction,
        px,
        py,
        c,
        CAMP_LOOK.spillWidth,
        CAMP_MARKS.spill,
        CAMP_LOOK.spillAlpha,
        true,
      );
      // On the edge: a thin warm line, so the reach of the camps reads at a glance.
      const line = Math.max(1.5, c * 0.05);
      ctx.fillStyle = CAMP_MARKS.border;
      if (step.direction === 'north') ctx.fillRect(px, py - line / 2, c, line);
      else if (step.direction === 'south') ctx.fillRect(px, py + c - line / 2, c, line);
      else if (step.direction === 'west') ctx.fillRect(px - line / 2, py, line, c);
      else ctx.fillRect(px + c - line / 2, py, line, c);
    }
  }

  /**
   * A gradient strip along one edge of the square at (px, py): `width` (a
   * part of the square) wide, `alpha` strong at the edge and clear at its
   * far side. `outside` puts it in the neighbouring square instead.
   */
  function edgeGradient(
    ctx: CanvasRenderingContext2D,
    edge: SquareDirection,
    px: number,
    py: number,
    c: number,
    width: number,
    rgb: string,
    alpha: number,
    outside: boolean,
  ): void {
    const w = c * width;
    // The gradient runs from the edge (`from`) to `w` away from it (`to`);
    // inside the square, or in the neighbour's when `outside`.
    const sign = outside ? -1 : 1;
    let from: { x: number; y: number };
    let to: { x: number; y: number };
    let rect: { x: number; y: number; w: number; h: number };
    if (edge === 'north') {
      from = { x: px, y: py };
      to = { x: px, y: py + sign * w };
      rect = { x: px, y: outside ? py - w : py, w: c, h: w };
    } else if (edge === 'south') {
      from = { x: px, y: py + c };
      to = { x: px, y: py + c - sign * w };
      rect = { x: px, y: outside ? py + c : py + c - w, w: c, h: w };
    } else if (edge === 'west') {
      from = { x: px, y: py };
      to = { x: px + sign * w, y: py };
      rect = { x: outside ? px - w : px, y: py, w, h: c };
    } else {
      from = { x: px + c, y: py };
      to = { x: px + c - sign * w, y: py };
      rect = { x: outside ? px + c : px + c - w, y: py, w, h: c };
    }
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  /**
   * A camp: its 3 x 3 base (a warm wash with a gold edge over the nine
   * squares), and on the middle square a dark disc with a gold ring, a tent,
   * and a tag with its level.
   */
  function drawCampMarker(
    ctx: CanvasRenderingContext2D,
    camp: Camp,
    c: number,
    selected: boolean,
  ): void {
    const { px, py } = toPx(camp.x, camp.y);
    const cx = px + c / 2;
    const cy = py + c / 2;
    // The base: the footprint, one square either side of the middle.
    const base = { x: px - c + c * 0.06, y: py - c + c * 0.06, size: c * 3 - c * 0.12 };
    ctx.fillStyle = CAMP_MARKS.baseWash;
    ctx.fillRect(base.x, base.y, base.size, base.size);
    ctx.lineWidth = Math.max(2, c * (selected ? 0.09 : 0.06));
    ctx.strokeStyle = CAMP_MARKS.markerRing;
    ctx.strokeRect(base.x, base.y, base.size, base.size);
    const r = c * CAMP_LOOK.markerRadius;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = c * 0.2;
    ctx.fillStyle = CAMP_MARKS.markerDisc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(2, c * (selected ? 0.1 : 0.07));
    ctx.strokeStyle = CAMP_MARKS.markerRing;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // The tent: a triangle with a door.
    const t = r * 0.62;
    ctx.fillStyle = CAMP_MARKS.tent;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t);
    ctx.lineTo(cx + t, cy + t * 0.7);
    ctx.lineTo(cx - t, cy + t * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CAMP_MARKS.tentDoor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t * 0.05);
    ctx.lineTo(cx + t * 0.32, cy + t * 0.7);
    ctx.lineTo(cx - t * 0.32, cy + t * 0.7);
    ctx.closePath();
    ctx.fill();

    // The level, in a small tag at the bottom right.
    const tagR = Math.max(6, c * 0.17);
    const tx = cx + r * 0.78;
    const ty = cy + r * 0.78;
    ctx.fillStyle = CAMP_MARKS.levelTag;
    ctx.beginPath();
    ctx.arc(tx, ty, tagR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAMP_MARKS.levelText;
    ctx.font = `800 ${Math.round(tagR * 1.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(camp.level), tx, ty + tagR * 0.06);
  }

  /** A circle round square (x, y) at `radius` squares, as the ring a camp lights. */
  function drawRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    c: number,
    alpha: number,
    dashed: boolean,
  ): void {
    const { px, py } = toPx(x, y);
    // `inCircle` covers squares to about radius + 0.5 (see campWorld.ts); the line goes just outside them.
    const r = (radius + 0.5) * c;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = CAMP_MARKS.ring;
    ctx.lineWidth = Math.max(2, c * 0.07);
    if (dashed) {
      ctx.setLineDash([c * 0.3, c * 0.18]);
    }
    ctx.beginPath();
    ctx.arc(px + c / 2, py + c / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** Where the new camp would go: its ring, the squares it would light, and a pulsing square. */
  function drawPlacePreview(
    ctx: CanvasRenderingContext2D,
    target: { x: number; y: number },
    c: number,
    now: number,
  ): void {
    const width = world.lab.state.size.x;
    const height = world.lab.state.size.y;
    const refusal = placeRefusal(world, target.x, target.y);
    const blocked = refusal !== null && refusal !== 'cost';
    // The new ring and the squares it would light, only where a camp can
    // stand: on a refused target they would say the opposite of the red
    // footprint (review of PR #120).
    if (!blocked) {
      ctx.fillStyle = CAMP_MARKS.previewWash;
      for (const i of preview) {
        const { px, py } = toPx(i % width, Math.floor(i / width));
        ctx.fillRect(px, py, c, c);
      }
      drawRing(ctx, target.x, target.y, campRadius(1), c, 1, true);
    }
    const pulse =
      0.6 +
      0.4 * Math.cos(((now % CAMP_LOOK.targetPulseMs) / CAMP_LOOK.targetPulseMs) * Math.PI * 2);
    // The 3 x 3 footprint: gold if a camp can stand there, red if not. On
    // uneven ground, the squares not at the middle square's depth are washed red.
    const middleDepth = world.lab.depths.depths[target.x + width * target.y] ?? 0;
    for (const sq of footprintOf(target.x, target.y)) {
      if (sq.x < 0 || sq.y < 0 || sq.x >= width || sq.y >= height) {
        continue; // off the map: nothing to wash
      }
      const depth = world.lab.depths.depths[sq.x + width * sq.y];
      if (refusal === 'notLevel' && depth !== undefined && depth !== middleDepth) {
        const at = toPx(sq.x, sq.y);
        ctx.fillStyle = CAMP_MARKS.notLevelWash;
        ctx.fillRect(at.px, at.py, c, c);
      }
    }
    const { px, py } = toPx(target.x, target.y);
    ctx.save();
    if (blocked) {
      // A dark band under the red dashes, so the outline reads over clay's
      // reddish ground too (review of PR #122).
      ctx.strokeStyle = CAMP_MARKS.notLevelHalo;
      ctx.lineWidth = Math.max(4, c * 0.17);
      ctx.strokeRect(
        px - c + ctx.lineWidth / 2,
        py - c + ctx.lineWidth / 2,
        c * 3 - ctx.lineWidth,
        c * 3 - ctx.lineWidth,
      );
    }
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = blocked ? CAMP_MARKS.notLevel : CAMP_MARKS.target;
    ctx.lineWidth = Math.max(2, c * 0.09);
    ctx.setLineDash(blocked ? [c * 0.25, c * 0.15] : []);
    ctx.strokeRect(
      px - c + ctx.lineWidth / 2,
      py - c + ctx.lineWidth / 2,
      c * 3 - ctx.lineWidth,
      c * 3 - ctx.lineWidth,
    );
    ctx.restore();
    if (blocked) {
      return; // no tent where no camp can stand
    }
    // A faint tent where the camp would stand.
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawCampMarker(ctx, { id: 0, x: target.x, y: target.y, level: 1 }, c, false);
    ctx.restore();
  }

  function drawEffects(ctx: CanvasRenderingContext2D, now: number, c: number): void {
    for (const effect of effects) {
      const { px, py } = toPx(effect.x, effect.y);
      const t = (now - effect.start) / effectMs(effect.kind);
      if (effect.kind === 'mined') {
        drawMinedCue(ctx, px, py, c, t, effect.label);
      } else if (effect.kind === 'refused') {
        drawRefusedCue(ctx, px, py, c, t, effect.higher, toPx);
      } else if (effect.kind === 'tooHard') {
        drawTooHardCue(ctx, px, py, c, t, effect.label);
      } else {
        // The ring spreading out from a camp as the fog lifts.
        const eased = 1 - (1 - Math.min(1, t)) ** 3;
        const radius = effect.fromRadius + (effect.toRadius - effect.fromRadius) * eased;
        drawRing(ctx, effect.x, effect.y, radius, c, Math.max(0, 1 - t * 0.9), false);
      }
    }
  }

  /** "Needs a level 2 camp": a blue wash with a padlock on the square, and the label floating up. */
  function drawTooHardCue(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    c: number,
    t: number,
    label: string,
  ): void {
    const fade = Math.max(0, 1 - t);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = CAMP_MARKS.tooHardWash;
    ctx.fillRect(px, py, c, c);
    ctx.strokeStyle = CAMP_MARKS.tooHard;
    ctx.lineWidth = Math.max(2, c * 0.08);
    ctx.strokeRect(
      px + ctx.lineWidth / 2,
      py + ctx.lineWidth / 2,
      c - ctx.lineWidth,
      c - ctx.lineWidth,
    );
    // The padlock: a body and a shackle, popping in a little at the start.
    const pop = 1 + 0.25 * Math.max(0, 1 - t * 5);
    const s = c * 0.22 * pop;
    const cx = px + c / 2;
    const cy = py + c / 2 + s * 0.3;
    ctx.fillStyle = CAMP_MARKS.tooHard;
    ctx.fillRect(cx - s, cy - s * 0.2, s * 2, s * 1.5);
    ctx.lineWidth = Math.max(2, s * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.2, s * 0.65, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
    drawFloatingLabel(ctx, px, py - c * 0.2, c, t, label, CAMP_MARKS.tooHard);
  }

  const cues = cueLoop((now) => {
    effects = effects.filter((e) => now - e.start < effectMs(e.kind));
    draw(now);
    // While the camp tool has a target, keep drawing: its square pulses. So
    // too while an animal is still sliding to where End shift moved it.
    const sliding = [...lastStep.values()].some((step) => now - step.at < CAMP_LOOK.animalSlideMs);
    return effects.length > 0 || sliding || (mode.kind === 'placing' && mode.target !== null);
  });

  function addEffect(effect: Omit<Effect, 'start'>): void {
    effects.push({ ...effect, start: performance.now() });
    cues.start();
  }

  // ----- The counter above the map -----

  /**
   * The counter: "Dug", then the lab's own items (wood, grass, apples,
   * animals, clay) with their icons, then the game's items (stone, coal, ...).
   * One row at a fixed height, as in Lab 1, so the map never moves.
   */
  function showCampCounter(): void {
    const counts = world.lab.counts;
    const dug = element('div', 'lab-chip lab-chip-dug');
    dug.dataset['testid'] = 'lab-dug';
    dug.dataset['count'] = String(world.lab.mined);
    dug.append(
      element('span', 'lab-chip-glyph', '⛏'),
      element('span', 'lab-chip-count', String(world.lab.mined)),
      element('span', 'lab-chip-name', 'Dug'),
    );
    const chips: HTMLElement[] = [dug];
    const chip = (item: string, count: number, icon: HTMLCanvasElement): void => {
      const made = element('div', 'lab-chip');
      made.dataset['testid'] = `lab-res-${item}`;
      made.dataset['count'] = String(count);
      made.title = itemName(item);
      made.append(
        icon,
        element('span', 'lab-chip-count', String(count)),
        element('span', 'lab-chip-name', itemName(item)),
      );
      chips.push(made);
    };
    // Every item collected: the lab's own (with their icons), then the game's.
    const all: { item: string; count: number; icon: () => HTMLCanvasElement | null }[] = [];
    for (const item of Object.keys(LAB_ITEMS)) {
      all.push({
        item,
        count: counts.get(item) ?? 0,
        icon: () => labItemIcon(item, 'lab-chip-icon'),
      });
    }
    for (const entry of resourceEntries(counts)) {
      if (entry.item in LAB_ITEMS) {
        continue; // clay is a game item now too (plan A1): shown once, with the lab's icon
      }
      all.push({
        item: entry.item,
        count: entry.count,
        icon: () => blockIcon(entry.iconBlock, 'lab-chip-icon'),
      });
    }
    // What the next steps cost comes first, so it never hides off the right
    // edge (review of PR #122): the lowest camp's next upgrade, then a new
    // camp. (Wood and grass come early, when they are the only chips anyway.)
    // The rest keeps its order after them.
    const lowest = Math.min(...world.camps.map((c) => c.level));
    const wanted: string[] = [];
    for (const stack of [...(upgradeCostFrom(lowest) ?? []), ...LAB_NEW_CAMP_COST]) {
      if (!wanted.includes(stack.item)) wanted.push(stack.item);
    }
    const rank = (item: string): number => {
      const at = wanted.indexOf(item);
      return at === -1 ? wanted.length : at;
    };
    // `sort` keeps equal ranks in their order (it is stable), so the rest stays as it was.
    all.sort((a, b) => rank(a.item) - rank(b.item));
    for (const entry of all) {
      const icon = entry.count > 0 ? entry.icon() : null;
      if (icon !== null) {
        chip(entry.item, entry.count, icon);
      }
    }
    counter.replaceChildren(...chips);
  }

  // ----- The tray under the map -----

  /** A row of cost chips: each item's icon, what you have of it and what it costs. */
  /**
   * One chip for each item of `cost`: its icon and have/need, red while
   * short. Each chip's test id is `${testPrefix}-${item}`.
   */
  function costRow(cost: ItemStack[], testPrefix = 'lab2-cost'): HTMLElement {
    const row = element('div', 'lab2-cost');
    const icons = new Map(
      resourceEntries(new Map(cost.map((s) => [s.item, 1]))).map((e) => [e.item, e.iconBlock]),
    );
    for (const stack of cost) {
      const have = world.lab.counts.get(stack.item) ?? 0;
      const enough = have >= stack.count;
      const chip = element('span', enough ? 'lab2-cost-chip' : 'lab2-cost-chip lab2-cost-short');
      chip.dataset['testid'] = `${testPrefix}-${stack.item}`;
      const icon = icons.get(stack.item);
      const labIcon = labItemIcon(stack.item, 'lab2-cost-icon');
      if (labIcon !== null) {
        chip.append(labIcon);
      } else if (icon !== undefined) {
        chip.append(blockIcon(icon, 'lab2-cost-icon'));
      }
      chip.title = itemName(stack.item);
      chip.append(
        element('span', 'lab2-cost-count', `${Math.min(have, stack.count)}/${stack.count}`),
      );
      // With one item there is room for its name; with more, the icons say which is which.
      if (cost.length === 1) {
        chip.append(element('span', 'lab2-cost-name', itemName(stack.item)));
      }
      row.append(chip);
    }
    return row;
  }

  function showTray(): void {
    tray.dataset['mode'] = mode.kind;
    if (mode.kind === 'idle') {
      showIdleTray();
    } else if (mode.kind === 'book') {
      showBookTray();
    } else if (mode.kind === 'placing') {
      showPlacingTray(mode.target);
    } else {
      const id = mode.id;
      const camp = world.camps.find((c) => c.id === id);
      if (camp === undefined) {
        mode = { kind: 'idle' };
        showIdleTray();
      } else {
        showCampTray(camp);
      }
    }
  }

  function showIdleTray(): void {
    // The top row (owner: "revamp the 'what you are building' row"): the
    // recipe book, the camp tool, then the pinned recipes, side by side in a
    // strip that scrolls sideways. The row's height never changes.
    const head = element('div', 'lab2-tray-head');
    const book = button('lab2-book-button', '📖');
    book.dataset['testid'] = 'lab2-book';
    book.setAttribute('aria-label', 'Recipe book');
    book.title = 'Recipe book';
    book.addEventListener('click', () => setMode({ kind: 'book' }));
    const tool = button('lab2-tool', '');
    tool.dataset['testid'] = 'lab2-camp-tool';
    tool.setAttribute('aria-label', 'New camp: choose where');
    tool.title = 'New camp';
    const affordable = canAfford(world.lab.counts, LAB_NEW_CAMP_COST);
    if (!affordable) {
      tool.classList.add('lab2-tool-short');
    }
    tool.append(element('span', 'lab2-tool-glyph', '⛺'), element('span', 'lab2-tool-plus', '+'));
    tool.addEventListener('click', () => setMode({ kind: 'placing', target: null }));
    const side = pinStrip();
    head.append(book, tool, side);
    const key = labKey();
    // The key lists the kinds you can see: lit and greyed squares, never what is under the fog.
    const seenTops = tops.filter((_, i) => (sights[i] ?? 'fog') !== 'fog');
    // Clay is listed below with its texture as the swatch, not with the blocks' plain icon.
    showKey(
      key,
      seenTops.filter((code) => code !== BLOCKS.clay.code),
    );
    const clayInSight = seenTops.includes(BLOCKS.clay.code);
    // So is the surface: grass, trees and apple trees on lit or greyed ground.
    const seenFeatures = new Set(
      world.surface.features.filter((_, i) => (sights[i] ?? 'fog') !== 'fog'),
    );
    // Clay's swatch is its texture; the features' are drawn with the map's own art.
    const extras: { show: boolean; swatch: () => HTMLCanvasElement | null; name: string }[] = [
      { show: clayInSight, swatch: () => labItemIcon('clay', 'lab-key-icon'), name: 'Clay' },
      {
        show: seenFeatures.has(GRASS),
        swatch: () => featureSwatch('grass', 'lab-key-icon'),
        name: 'Grass',
      },
      {
        show: seenFeatures.has(TREE),
        swatch: () => featureSwatch('tree', 'lab-key-icon'),
        name: 'Tree',
      },
      {
        show: seenFeatures.has(APPLE_TREE),
        swatch: () => featureSwatch('appleTree', 'lab-key-icon'),
        name: 'Apple tree',
      },
    ];
    for (const extra of extras) {
      const icon = extra.show ? extra.swatch() : null;
      if (icon !== null) {
        const entry = element('span', 'lab-key-entry');
        entry.append(icon, element('span', 'lab-key-name', extra.name));
        key.append(entry);
      }
    }
    tray.replaceChildren(head, key);
  }

  /** A recipe's icon: a tent, with the camp level it makes for an upgrade. */
  function recipeIcon(recipe: Recipe): HTMLElement {
    const icon = element('span', 'lab2-recipe-icon', '⛺');
    if (recipe.level > 1) {
      icon.append(element('span', 'lab2-recipe-level', String(recipe.level)));
    }
    icon.title = recipe.name;
    return icon;
  }

  /**
   * The pinned recipes: for each, its icon and what it needs as have/need,
   * and an × to unpin it. A tap on a card goes to where it is built: the
   * camp tool for a new camp, the panel of a camp one level below for an
   * upgrade.
   */
  function pinStrip(): HTMLElement {
    const strip = element('div', 'lab2-pins');
    strip.dataset['testid'] = 'lab2-pins';
    const pinned = pins.map((id) => recipeById(id)).filter((r): r is Recipe => r !== null);
    if (pinned.length === 0) {
      strip.append(element('span', 'lab2-pins-empty', 'Pin a recipe from the book 📖'));
      return strip;
    }
    for (const recipe of pinned) {
      const card = element('div', 'lab2-pin');
      card.dataset['testid'] = `lab2-pin-${recipe.id}`;
      const go = button('lab2-pin-go', '');
      go.setAttribute('aria-label', recipe.name);
      go.append(recipeIcon(recipe), costRow(recipe.cost, `lab2-pin-${recipe.id}`));
      go.addEventListener('click', () => buildFrom(recipe));
      const unpin = button('lab2-pin-remove', '×');
      unpin.dataset['testid'] = `lab2-unpin-${recipe.id}`;
      unpin.setAttribute('aria-label', `Unpin ${recipe.name}`);
      unpin.addEventListener('click', () => {
        setPins(pins.filter((id) => id !== recipe.id));
        showTray();
      });
      card.append(go, unpin);
      strip.append(card);
    }
    return strip;
  }

  /** Go to where `recipe` is built. */
  function buildFrom(recipe: Recipe): void {
    if (recipe.level === 1) {
      setMode({ kind: 'placing', target: null });
      return;
    }
    const camp = world.camps.find((c) => c.level === recipe.level - 1);
    if (camp === undefined) {
      setHint(`No level ${recipe.level - 1} camp to upgrade yet.`, true);
      return;
    }
    setMode({ kind: 'camp', id: camp.id });
  }

  /** The recipe book, in the tray: every recipe, what it costs, and a pin to put it on the row. */
  function showBookTray(): void {
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '📖 Recipe book'));
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close the recipe book');
    close.dataset['testid'] = 'lab2-book-close';
    close.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(close);
    // The list scrolls inside the tray, so the tray, and the map, never grow.
    const list = element('div', 'lab2-book-list');
    list.dataset['testid'] = 'lab2-book-list';
    for (const recipe of labRecipes()) {
      const row = element('div', 'lab2-recipe');
      row.dataset['testid'] = `lab2-recipe-${recipe.id}`;
      const pinned = pins.includes(recipe.id);
      const pin = button(
        pinned ? 'lab2-recipe-pin lab2-recipe-pinned' : 'lab2-recipe-pin',
        pinned ? 'Pinned ✓' : 'Pin',
      );
      pin.dataset['testid'] = `lab2-recipe-pin-${recipe.id}`;
      pin.setAttribute('aria-pressed', String(pinned));
      pin.addEventListener('click', () => {
        setPins(pinned ? pins.filter((id) => id !== recipe.id) : [...pins, recipe.id]);
        const scroll = list.scrollTop;
        showTray();
        // Keep the list where it was, so pinning does not jump it.
        const fresh = tray.querySelector('.lab2-book-list');
        if (fresh !== null) fresh.scrollTop = scroll;
      });
      const text = element('div', 'lab2-recipe-text');
      text.append(
        element('span', 'lab2-recipe-name', recipe.name),
        costRow(recipe.cost, `lab2-recipe-${recipe.id}`),
      );
      row.append(recipeIcon(recipe), text, pin);
      list.append(row);
    }
    tray.replaceChildren(head, list);
  }

  function showPlacingTray(target: { x: number; y: number } | null): void {
    // Cancel is the × in the head, as in a camp's panel, so the row below has
    // room for the cost and "Place camp" even on a narrow phone (owner's bug
    // report: "Place camp doesn't show").
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '⛺ New camp'));
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Cancel');
    cancel.dataset['testid'] = 'lab2-place-cancel';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);

    // The line says why "Place camp" is off, whenever it is.
    const body = element('p', 'lab2-panel-line');
    body.dataset['testid'] = 'lab2-place-line';
    const refusal = target === null ? null : placeRefusal(world, target.x, target.y);
    const missing = missingText(LAB_NEW_CAMP_COST);
    if (target === null) {
      body.textContent = PLACE_HINT;
    } else if (refusal !== null && refusal !== 'cost') {
      body.textContent = placeRefusalText(refusal);
      body.classList.add('lab2-panel-warn');
    } else {
      const fresh = preview.size;
      const lights = `lights ${fresh} new ${fresh === 1 ? 'square' : 'squares'}`;
      if (refusal === 'cost') {
        body.textContent = `${missing} · ${lights}`;
        body.classList.add('lab2-panel-warn');
      } else {
        body.textContent = `At ${target.x}, ${target.y} · level ground · ${lights}`;
      }
    }

    const actions = element('div', 'lab2-actions');
    const confirm = button('lab2-button lab2-button-main', 'Place camp');
    confirm.dataset['testid'] = 'lab2-place-confirm';
    confirm.disabled = target === null || refusal !== null;
    // A disabled button keeps its outline and text, and says why in its tooltip too.
    confirm.title =
      target === null
        ? 'Choose a spot first'
        : refusal === 'cost'
          ? missing
          : confirm.disabled
            ? body.textContent
            : '';
    confirm.addEventListener('click', () => {
      if (target !== null) {
        confirmPlace(target.x, target.y);
      }
    });
    actions.append(costRow(LAB_NEW_CAMP_COST), confirm);
    tray.replaceChildren(head, body, actions);
  }

  /** "Need 2 more wood and 5 more grass", for what the counts lack of `cost`; '' if nothing. */
  function missingText(cost: ItemStack[]): string {
    const short = cost
      .map((stack) => ({ stack, lack: stack.count - (world.lab.counts.get(stack.item) ?? 0) }))
      .filter((s) => s.lack > 0)
      .map((s) => `${s.lack} more ${itemName(s.stack.item).toLowerCase()}`);
    if (short.length === 0) {
      return '';
    }
    const last = short.pop() ?? '';
    return `Need ${short.length > 0 ? `${short.join(', ')} and ${last}` : last}`;
  }

  function showCampTray(camp: Camp): void {
    const head = element('div', 'lab2-panel-head');
    const title = element('span', 'lab2-panel-title', `⛺ Camp ${camp.id} · Level ${camp.level}`);
    title.dataset['testid'] = 'lab2-camp-title';
    head.append(title);
    // Demolish: only once other camps cover all of this one's base. Otherwise
    // the button stays, quieter, and a tap on it says what to do first.
    const demolish = button('lab2-pack', 'Demolish');
    demolish.dataset['testid'] = 'lab2-demolish';
    if (demolishRefusal(world, camp.id) !== null) {
      demolish.classList.add('lab2-pack-short');
    }
    demolish.addEventListener('click', () => confirmDemolish(camp.id));
    // Rest (question 156: "Only at a camp"): the crew rests here, gets its
    // health back, and the shift ends.
    const rest = button('lab2-pack lab2-rest-here', 'Rest');
    rest.dataset['testid'] = 'lab2-rest';
    rest.setAttribute('aria-label', 'Rest here: the crew gets its health back, and the shift ends');
    rest.disabled = world.turn.status !== 'active';
    rest.addEventListener('click', () => finishShift(camp.id));
    head.append(rest, demolish);
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close');
    close.dataset['testid'] = 'lab2-camp-close';
    close.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(close);

    // Now: its ring and what it mines.
    const line = element('p', 'lab2-panel-line');
    line.dataset['testid'] = 'lab2-camp-line';
    line.textContent = `Ring ${campRadius(camp.level)} · mines ${minesText(camp.level)}`;

    // Next: what the upgrade gives, and what it costs.
    const next = element('p', 'lab2-panel-line lab2-panel-next');
    next.dataset['testid'] = 'lab2-camp-next';
    const actions = element('div', 'lab2-actions');
    const cost = upgradeCostFrom(camp.level);
    if (cost === null) {
      next.textContent = `Top level: the widest ring, and every block the lab has.`;
    } else {
      const up = camp.level + 1;
      next.textContent = `Level ${up}: ring ${campRadius(up)}, adds ${addedNamesAt(up).join(', ')}`;
      actions.append(costRow(cost));
      const upgrade = button('lab2-button lab2-button-main', 'Upgrade');
      upgrade.dataset['testid'] = 'lab2-upgrade';
      upgrade.disabled = !canAfford(world.lab.counts, cost) || turnRefusal(world) !== null;
      upgrade.addEventListener('click', () => confirmUpgrade(camp.id));
      actions.append(upgrade);
    }
    tray.replaceChildren(head, line, next, actions);
  }

  // ----- Changing the world -----

  /** Take a new world: work out what is shown again, and refresh the counter and tray. */
  function setWorld(next: CampWorld): void {
    world = next;
    tops = topBlocksOf(world.lab.state);
    sights = sightMap(world);
    showHud();
    showCampCounter();
    showTray();
    draw();
  }

  function setMode(next: Mode): void {
    mode = next;
    preview =
      mode.kind === 'placing' && mode.target !== null
        ? new Set(newlyCovered(world, mode.target.x, mode.target.y))
        : new Set();
    if (mode.kind === 'placing') {
      // While placing, the hint says what to do next: choose a spot, then
      // tap Place camp (the panel says why a spot is refused, if it is).
      setHint(mode.target === null ? PLACE_HINT : PLACE_CHOSEN_HINT, false);
    }
    showTray();
    draw();
    cues.start();
  }

  function setHint(text: string, warn: boolean | 'hard'): void {
    hint.textContent = text;
    hint.classList.toggle('lab-hint-warn', warn === true);
    hint.classList.toggle('lab2-hint-hard', warn === 'hard');
  }

  function confirmPlace(x: number, y: number): void {
    const next = placeCamp(world, x, y);
    if (next === world) {
      return;
    }
    remember({ kind: 'place', x, y });
    mode = { kind: 'idle' };
    preview = new Set();
    setWorld(next);
    setHint('Camp placed: the fog lifts around it.', false);
    addEffect({
      kind: 'ring',
      x,
      y,
      label: '',
      higher: [],
      fromRadius: 0,
      toRadius: campRadius(1),
    });
  }

  function confirmUpgrade(id: number): void {
    const before = world.camps.find((c) => c.id === id);
    const next = upgradeCamp(world, id);
    if (before === undefined || next === world) {
      return;
    }
    remember({ kind: 'upgrade', id });
    setWorld(next);
    setHint(`Camp ${id} is level ${before.level + 1}: a wider ring, harder blocks.`, false);
    addEffect({
      kind: 'ring',
      x: before.x,
      y: before.y,
      label: '',
      higher: [],
      fromRadius: campRadius(before.level),
      toRadius: campRadius(before.level + 1),
    });
  }

  function confirmDemolish(id: number): void {
    const next = demolishCamp(world, id);
    if (next === world) {
      const why = turnRefusal(world);
      setHint(why === 'noTaps' ? NO_TAPS_HINT : why === 'over' ? OVER_HINT : DEMOLISH_FIRST, true);
      return;
    }
    remember({ kind: 'demolish', id });
    mode = { kind: 'idle' };
    setWorld(next);
    setHint('Camp demolished: its ground can be mined now.', false);
  }

  // ----- Shifts (plan A4) -----

  /** The HUD, the shift buttons and the end-of-run banner, from the world's turn. */
  function showHud(): void {
    const turn = world.turn;
    hudShift.textContent = `Shift ${turn.shift}`;
    hudTaps.textContent = `⚡ ${turn.tapsLeft}/${FRONTIER_SHIFT.taps}`;
    hudHealth.textContent = `♥ ${turn.health}/${FRONTIER_SHIFT.startHealth}`;
    hud.dataset['shift'] = String(turn.shift);
    hud.dataset['taps'] = String(turn.tapsLeft);
    hud.dataset['health'] = String(turn.health);
    hud.dataset['status'] = turn.status;
    hudTaps.classList.toggle('lab2-hud-empty', turn.tapsLeft === 0);
    hudHealth.classList.toggle('lab2-hud-low', turn.health <= FRONTIER_SHIFT.startHealth * 0.3);
    const active = turn.status === 'active';
    endShiftButton.disabled = !active;
    closeButton.disabled = !active;
    // Out of taps: End shift is what to press next, so it stands out.
    endShiftButton.classList.toggle('lab2-end-shift-now', active && turn.tapsLeft === 0);
    overBanner.hidden = active;
    overBanner.textContent =
      turn.status === 'lost'
        ? `The crew is lost after ${turn.shift - 1} shifts. Tap New world to start again.`
        : `Mine closed after ${turn.shift} shifts. Tap New world to start again.`;
  }

  /**
   * End the shift, or rest at camp `restAt` (the crew's health back to full,
   * then the shift ends). The animals slide to where they stepped, the Undo history is
   * emptied (it never crosses a shift, question 151), and the hint says what
   * upkeep was paid and what hunger cost.
   */
  function finishShift(restAt: number | null): void {
    const before = world.surface.animals;
    const rest = restAt !== null;
    const result = restAt !== null ? restCrew(world, restAt) : endShift(world);
    if (result.report === null) {
      return;
    }
    history = emptyHistory(result.world);
    showUndo();
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setWorld(result.world);
    if (asGame) {
      saveRun(result.world); // saved every shift (question 152)
    }
    const text = shiftText(result.report, result.world.turn, rest);
    setHint(text, result.report.healthLost > 0 ? true : false);
    // Night (owner, after the playtest of PR #146): the state has moved on
    // already; the night only shows it. The animals slide to where they
    // stepped once it is morning.
    night?.skip();
    night = showNight(root, {
      shift: result.report.shift,
      summary: text,
      page,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onDone: () => {
        night = null;
        noteSteps(before);
        cues.start();
      },
    });
  }

  /** The night being shown between two shifts, or `null`. */
  let night: Night | null = null;

  /** Close mine takes two taps: the first asks, the second (within a few seconds) closes it. */
  let closeAskedAt = -Infinity;
  function askCloseMine(): void {
    const now = performance.now();
    if (now - closeAskedAt > CLOSE_CONFIRM_MS) {
      closeAskedAt = now;
      closeButton.textContent = 'Tap to confirm';
      setHint('Close the mine and end this run? Tap Close mine again to confirm.', true);
      window.setTimeout(() => {
        closeButton.textContent = 'Close mine';
      }, CLOSE_CONFIRM_MS);
      return;
    }
    closeAskedAt = -Infinity;
    closeButton.textContent = 'Close mine';
    const closed = closeMine(world);
    if (asGame) {
      saveRun(closed);
    }
    history = emptyHistory(closed);
    showUndo();
    mode = { kind: 'idle' };
    setWorld(closed);
    setHint(OVER_HINT, false);
  }

  // ----- Undo -----

  /**
   * Note an action that did something, for Undo (undoHistory.ts). A catch
   * or an apple pick is noted as not undoable (question 141).
   */
  function remember(step: CampStep, undoable = true): void {
    history = noteAction(history, step, undoable);
    showUndo();
  }

  /** The Undo button is off when there is nothing to undo. */
  function showUndo(): void {
    const count = undoCount(history);
    undoButton.disabled = count === 0;
    undoButton.dataset['count'] = String(count);
  }

  /** What an action was, for the hint after it is undone. */
  function describeStep(step: CampStep): string {
    if (step.kind === 'tap') return `the tap at ${step.x}, ${step.y}`;
    if (step.kind === 'place') return 'placing the camp';
    if (step.kind === 'upgrade') return `the upgrade of camp ${step.id}`;
    if (step.kind === 'demolish') return `demolishing camp ${step.id}`;
    return 'the end of the shift'; // never in the history: it is emptied when a shift ends
  }

  /**
   * Undo the last undoable action of the shift: the engine plays the shift
   * again without it (plan A5), so the player's own change is taken back
   * exactly and its tap comes back. Caught animals and picked apples stay
   * so (owner, question 141). The camera stays put.
   */
  function undo(): void {
    const result = undoLast(history, world);
    if (result === null) {
      return;
    }
    if ('refused' in result) {
      setHint(result.refused, true);
      return;
    }
    history = result.history;
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setWorld(result.world);
    const left = undoCount(history);
    setHint(
      `Undone: ${describeStep(result.undone)}.${left === 0 ? ' Nothing more to undo.' : ''}`,
      false,
    );
    showUndo();
  }

  // ----- A tap -----
  function tap(x: number, y: number): void {
    if (mode.kind === 'placing') {
      tapWhilePlacing(x, y);
      return;
    }
    const result = campTap(world, x, y);
    canvas.dataset['lastTap'] = `${result.kind} ${x},${y}`;
    if (result.kind === 'fog') {
      return; // Fog: nothing at all happens.
    }
    if (result.kind === 'noTaps' || result.kind === 'over') {
      // A camp can still be opened to look at it; nothing else happens.
      const camp = campAt(world, x, y);
      if (camp !== null) {
        setMode({ kind: 'camp', id: camp.id });
      }
      setHint(result.kind === 'noTaps' ? NO_TAPS_HINT : OVER_HINT, true);
      return;
    }
    if (result.kind === 'camp') {
      const camp = campAt(world, x, y);
      if (camp !== null) {
        setMode({ kind: 'camp', id: camp.id });
        setHint(HINT, false);
      }
      return;
    }
    if (mode.kind === 'camp' || mode.kind === 'book') {
      // A tap elsewhere closes the camp's panel (or the book), and then acts as a tap.
      mode = { kind: 'idle' };
      showTray();
    }
    if (result.kind === 'greyed') {
      setHint(GREYED_HINT, true);
      draw();
      return;
    }
    if (result.kind === 'tooHard') {
      const name = blockDefByCode(tops[x + world.lab.state.size.x * y] ?? 0).name;
      const text =
        result.needs === null
          ? `${name} cannot be mined in this lab.`
          : `${name} needs a level ${result.needs} camp over it.`;
      setHint(text, 'hard');
      effects = effects.filter((e) => e.kind !== 'tooHard');
      addEffect({
        kind: 'tooHard',
        x,
        y,
        label: result.needs === null ? 'Too hard' : `Needs Lv ${result.needs}`,
        higher: [],
        fromRadius: 0,
        toRadius: 0,
      });
      return;
    }
    if (result.kind === 'refused') {
      const refusal = result.tap?.result.refusal;
      setHint(refusal === 'bottom' ? BOTTOM_HINT : STEEP_HINT, true);
      effects = effects.filter((e) => e.kind !== 'refused');
      addEffect({
        kind: 'refused',
        x,
        y,
        label: '',
        higher: result.tap?.result.higherNeighbours ?? [],
        fromRadius: 0,
        toRadius: 0,
      });
      frame.classList.remove('lab-shake');
      void frame.offsetWidth; // forces a layout, so the shake starts again
      frame.classList.add('lab-shake');
      return;
    }
    if (result.kind === 'harvested' && result.harvest !== null) {
      effects = effects.filter((e) => !(e.x === x && e.y === y));
      // Cut grass and felled trees can be undone; a caught animal or a picked
      // apple cannot (owner, question 141): it is noted, so Undo plays it
      // again, but never takes it back.
      const undoable = result.harvest.kind === 'grass' || result.harvest.kind === 'felled';
      remember({ kind: 'tap', x, y }, undoable);
      setWorld(result.world);
      setHint(HARVEST_HINTS[result.harvest.kind], false);
      addEffect({
        kind: 'mined',
        x,
        y,
        label: gainText([result.harvest.gain]),
        higher: [],
        fromRadius: 0,
        toRadius: 0,
      });
      return;
    }
    // Mined.
    effects = effects.filter((e) => !(e.x === x && e.y === y));
    remember({ kind: 'tap', x, y });
    setWorld(result.world);
    setHint(HINT, false);
    addEffect({
      kind: 'mined',
      x,
      y,
      label: gainText(result.tap?.result.yields ?? []),
      higher: [],
      fromRadius: 0,
      toRadius: 0,
    });
  }

  function tapWhilePlacing(x: number, y: number): void {
    canvas.dataset['lastTap'] = `place ${x},${y}`;
    if (sightOf(x, y) !== 'shown') {
      setHint(placeRefusalText('notShown'), true);
      return;
    }
    if (campAt(world, x, y) !== null) {
      setHint('A camp already stands there.', true);
      return;
    }
    // Any other target is chosen, so the preview can show why it fails, if it
    // does. The reason is said once, in the panel (review of PR #120).
    setMode({ kind: 'placing', target: { x, y } });
  }

  /** A long press on a lit square opens the camp tool with that square chosen. */
  function hold(x: number, y: number): void {
    if (sightOf(x, y) !== 'shown' || campAt(world, x, y) !== null) {
      return;
    }
    setMode({ kind: 'placing', target: null });
    tapWhilePlacing(x, y);
  }

  /** As the game, New run takes two taps: it throws the saved run away. */
  let newAskedAt = -Infinity;
  top.newWorld.addEventListener('click', () => {
    if (asGame && world.turn.status === 'active') {
      const now = performance.now();
      if (now - newAskedAt > CLOSE_CONFIRM_MS) {
        newAskedAt = now;
        top.newWorld.textContent = 'Sure?';
        setHint('Start a new run? This one is lost. Tap New run again to confirm.', true);
        window.setTimeout(() => {
          top.newWorld.textContent = 'New run';
        }, CLOSE_CONFIRM_MS);
        return;
      }
    }
    newAskedAt = -Infinity;
    if (asGame) {
      top.newWorld.textContent = 'New run';
    }
    clearPrepared();
    isPrepared = false;
    world = newCampWorld(randomSeed(Math.random));
    if (asGame) {
      saveRun(world);
    }
    history = emptyHistory(world);
    showUndo();
    lastStep.clear();
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setHint(HINT, false);
    showWorld();
  });

  function centreOnFirstCamp(): void {
    const first = world.camps[0];
    const v = view();
    const centred = centredLabCamera(CAMP_LOOK.startCells, world.lab.state.size, v);
    if (first === undefined || v.width === 0) {
      camera = centred;
      return;
    }
    const rows = rowsOf(centred, v);
    camera = clampLabCamera(
      { x: first.x + 0.5 - centred.cells / 2, y: first.y + 0.5 - rows / 2, cells: centred.cells },
      world.lab.state.size,
      v,
    );
  }

  function showWorld(): void {
    top.seedText.textContent = isPrepared
      ? `Seed ${world.lab.seed} · prepared`
      : `Seed ${world.lab.seed}`;
    tops = topBlocksOf(world.lab.state);
    sights = sightMap(world);
    centreOnFirstCamp();
    showHud();
    showCampCounter();
    showTray();
    draw();
  }

  attachLabGestures(canvas, {
    camera: () => camera,
    setCamera: (next) => {
      camera = next;
      draw();
    },
    ground: () => world.lab.state.size,
    onTap: tap,
    onHold: hold,
  });

  showUndo();
  showWorld();
}
