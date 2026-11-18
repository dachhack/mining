// The player's view of a run: everything the play interface prints.
//
// `buildView` is the ONE place that reads the game state on the player's
// behalf. It returns a `PlayerView`, which holds only what the avatar could
// know, and `renderView` turns that into text without ever seeing the state.
// So nothing can be printed that `buildView` did not decide to show.
//
// The rule `buildView` follows: a cell's contents (block, open space, ladder,
// torch, loose items) are read only after `isRevealed` has said yes. Note that
// open cells are hidden like blocks: an unrevealed cell prints as `?` whether
// it is rock or a void (owner question 37).

import {
  AVATAR,
  BLOCKS,
  NO_STRUCTURE,
  SHIFT,
  STRUCTURES,
  WORLD,
  blockDefByCode,
  itemDef,
} from '../../src/data';
import type { BlockId, Vec3 } from '../../src/data';
import {
  blockAt,
  carriedWeight,
  carryCapacity,
  inGrid,
  inventoryEntries,
  isRevealed,
  isRunActive,
  isSurface,
  legalActions,
  looseItemsAt,
  previewCubePhase,
  structureAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { describeChoice, layerName, runEndText, stackListText } from './describe';
import { END_SHIFT, menuChoices } from './log';
import type { LogEntry } from './log';

/** How much of the map to draw. These change the picture only, never the game. */
export interface ViewOptions {
  /** How many cells the map reaches sideways from the avatar. */
  radius: number;
  /** How many layers above and below the avatar's own are drawn. */
  layers: number;
  /** The deepest `z` the avatar has stood on in this run (the session tracks it). */
  deepestZ: number;
}

export const DEFAULT_RADIUS = 4;
export const DEFAULT_LAYERS = 1;

// Map characters for everything that is not a block.
const SYMBOL_AVATAR = '@';
const SYMBOL_UNKNOWN = '?';
const SYMBOL_OPEN = '.';
const SYMBOL_EDGE = 'X';
const SYMBOL_ITEMS = '*';
const SYMBOL_LADDER = '=';
const SYMBOL_TORCH = '!';
const SYMBOL_SUPPORT = 'T';

// One character for each block that can be stored in the cube: the same
// characters as tools/ascii.ts and the test helper.
const BLOCK_SYMBOLS: Partial<Record<BlockId, string>> = {
  dirt: 'd',
  stone: '#',
  hardRock: 'H',
  coalSeam: 'c',
  timberRoot: 't',
  ironOre: 'i',
  copperOre: 'u',
  crystal: 'x',
  unstableOre: 'U',
  relic: 'r',
  keystone: 'k',
};

/** Block code (the number stored in the cube) -> map character. */
const SYMBOL_BY_CODE = new Map<number, string>();
for (const [blockId, symbol] of Object.entries(BLOCK_SYMBOLS)) {
  // `Object.entries` gives the keys back as plain strings; `as BlockId` tells
  // the compiler they are the block ids written just above.
  SYMBOL_BY_CODE.set(BLOCKS[blockId as BlockId].code, symbol);
}

/** One drawn layer: its `z`, a label such as "layer 3", and one string per row. */
export interface LayerView {
  z: number;
  label: string;
  /** "above", "yours" or "below". */
  relation: string;
  rows: string[];
}

/** One line of the action list. */
export interface ChoiceView {
  /** What the player types: 1, 2, ... for an action, 0 for "end shift". */
  number: number;
  /** AP cost, or `null` for "end shift", which has none. */
  ap: number | null;
  text: string;
  /** What goes into the play log if this is chosen. */
  entry: LogEntry;
}

/** The summary printed once the run is over. */
export interface EndedView {
  /** How the run ended, in words. */
  headline: string;
  shiftsPlayed: number;
  deepest: string;
  health: number;
  fuel: number;
}

/** Everything one step prints. Plain data: no state, nothing hidden. */
export interface PlayerView {
  /** `null` while the run is going. */
  ended: EndedView | null;
  hud: string[];
  /** The first and last x and y drawn, after trimming unseen edges. */
  window: { x0: number; x1: number; y0: number; y1: number };
  layers: LayerView[];
  legend: string[];
  /** Things the map cannot show with one character per cell. */
  notes: string[];
  hazards: string[];
  /** What ending the shift now would do; `null` once the run is over. */
  forecast: string | null;
  choices: ChoiceView[];
}

/** What one cell holds, as far as the player knows. */
interface CellView {
  symbol: string;
  meaning: string;
}

/**
 * The map character for the cell `pos`, and what it means (for the legend).
 * This is the only function that looks inside a cell, and it looks only
 * after checking that the cell is revealed.
 */
function cellView(state: GameState, pos: Vec3): CellView {
  const here = state.avatar.pos;
  if (pos.x === here.x && pos.y === here.y && pos.z === here.z) {
    return { symbol: SYMBOL_AVATAR, meaning: 'you' };
  }
  if (!inGrid(state.size, pos) && !isSurface(state.size, pos)) {
    return { symbol: SYMBOL_EDGE, meaning: 'edge of the cube (cannot be entered or mined)' };
  }
  if (!isRevealed(state, pos)) {
    return { symbol: SYMBOL_UNKNOWN, meaning: 'not seen yet (rock or open, unknown)' };
  }
  const code = blockAt(state, pos);
  const block = blockDefByCode(code);
  if (block.solid) {
    // Every solid block the cube can store has a character; `?? '?'` is only
    // there for a block added to the data without one.
    return { symbol: SYMBOL_BY_CODE.get(code) ?? SYMBOL_UNKNOWN, meaning: block.name };
  }
  if (looseItemsAt(state, pos).length > 0) {
    return { symbol: SYMBOL_ITEMS, meaning: 'loose items (listed below the map)' };
  }
  const structure = structureAt(state, pos);
  if (structure === STRUCTURES.ladder.code) {
    return { symbol: SYMBOL_LADDER, meaning: 'ladder' };
  }
  if (structure === STRUCTURES.torch.code) {
    return { symbol: SYMBOL_TORCH, meaning: 'torch' };
  }
  if (structure === STRUCTURES.support.code) {
    return { symbol: SYMBOL_SUPPORT, meaning: 'support' };
  }
  return { symbol: SYMBOL_OPEN, meaning: 'open space' };
}

/** The name of the structure in a revealed cell, or `null` if there is none. */
function structureName(state: GameState, pos: Vec3): string | null {
  const code = structureAt(state, pos);
  if (code === NO_STRUCTURE) {
    return null;
  }
  for (const def of Object.values(STRUCTURES)) {
    if (def.code === code) {
      return def.name.toLowerCase();
    }
  }
  return null;
}

function hudLines(state: GameState, options: ViewOptions): string[] {
  const pos = state.avatar.pos;
  const lamp = state.lampOil > 0 ? '' : ' (lamp is out: you see only one step around you)';
  const gauges = [
    `Shift ${state.shift}`,
    `AP ${state.ap}/${SHIFT.apPerShift}`,
    `Fuel ${state.fuel}`,
    `Lamp oil ${state.lampOil}${lamp}`,
    `Health ${state.avatar.health}/${AVATAR.startHealth}`,
    `Carry ${carriedWeight(state)}/${carryCapacity()}`,
  ].join(' | ');

  const onLadder = structureAt(state, pos) === STRUCTURES.ladder.code ? ', on a ladder' : '';
  const place = `You (@): x${pos.x} y${pos.y}, ${layerName(pos.z)}${onLadder} | Deepest so far: ${layerName(options.deepestZ)}`;

  const carried = inventoryEntries(state);
  const inventory =
    carried.length === 0
      ? 'Carrying: nothing'
      : 'Carrying (weight): ' +
        carried
          .map((s) => `${s.count} ${itemDef(s.item).name} (${itemDef(s.item).weight * s.count})`)
          .join(', ');
  return [gauges, place, inventory];
}

/**
 * Build the player's view of `state`. Reads only what the avatar could know;
 * see the note at the top of this file.
 */
export function buildView(state: GameState, options: ViewOptions): PlayerView {
  const here = state.avatar.pos;
  const window = {
    x0: here.x - options.radius,
    x1: here.x + options.radius,
    y0: here.y - options.radius,
    y1: here.y + options.radius,
  };

  // The map, and the legend of the characters it actually uses.
  const layers: LayerView[] = [];
  const legend = new Map<string, string>();
  const notes: string[] = [];
  for (let z = here.z - options.layers; z <= here.z + options.layers; z += 1) {
    // There is nothing to draw above the surface or below the bottom layer.
    if (z < WORLD.surfaceZ || z >= state.size.z) {
      continue;
    }
    const rows: string[] = [];
    for (let y = window.y0; y <= window.y1; y += 1) {
      let row = '';
      for (let x = window.x0; x <= window.x1; x += 1) {
        const pos = { x, y, z };
        const cell = cellView(state, pos);
        row += cell.symbol;
        legend.set(cell.symbol, cell.meaning);
        if (cell.symbol === SYMBOL_ITEMS) {
          const under = structureName(state, pos);
          const extra = under === null ? '' : ` (in a cell with a ${under})`;
          notes.push(
            `Loose at x${x} y${y}, ${layerName(z)}: ${stackListText(looseItemsAt(state, pos))}${extra}`,
          );
        }
      }
      rows.push(row);
    }
    const relation = z < here.z ? 'above' : z > here.z ? 'below' : 'yours';
    layers.push({ z, label: z === WORLD.surfaceZ ? 'surface' : `layer ${z}`, relation, rows });
  }

  // Trim the map to what has something in it: rows and columns at the edge of
  // the window that are unseen in every drawn layer are left out. Underground
  // that is most of the window, and an agent reads hundreds of these. Nothing
  // is lost: every cell left out would have printed as `?`.
  let firstColumn = options.radius;
  let lastColumn = options.radius;
  let firstRow = options.radius;
  let lastRow = options.radius;
  for (const layer of layers) {
    layer.rows.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        if (row.charAt(column) !== SYMBOL_UNKNOWN) {
          firstColumn = Math.min(firstColumn, column);
          lastColumn = Math.max(lastColumn, column);
          firstRow = Math.min(firstRow, rowIndex);
          lastRow = Math.max(lastRow, rowIndex);
        }
      }
    });
  }
  for (const layer of layers) {
    layer.rows = layer.rows
      .slice(firstRow, lastRow + 1)
      .map((row) => row.slice(firstColumn, lastColumn + 1));
  }
  // The avatar's cell is never unseen, so the trimmed window is never empty.
  window.x1 = window.x0 + lastColumn;
  window.x0 += firstColumn;
  window.y1 = window.y0 + lastRow;
  window.y0 += firstRow;

  // The avatar's own cell shows `@`, so say in words what else is in it.
  const ownItems = looseItemsAt(state, here);
  if (ownItems.length > 0) {
    notes.unshift(`Loose in your cell: ${stackListText(ownItems)}`);
  }
  const ownStructure = structureName(state, here);
  if (ownStructure !== null && ownStructure !== 'ladder') {
    notes.unshift(`In your cell: a ${ownStructure}`);
  }

  const legendOrder = [SYMBOL_AVATAR, SYMBOL_UNKNOWN, SYMBOL_OPEN, SYMBOL_EDGE];
  const legendLines: string[] = [];
  for (const symbol of [...legendOrder, ...[...legend.keys()].sort()]) {
    const meaning = legend.get(symbol);
    if (meaning !== undefined) {
      legendLines.push(`${symbol} ${meaning}`);
      legend.delete(symbol);
    }
  }

  if (!isRunActive(state)) {
    // `status.kind` is 'ended' here; the check lets TypeScript see the fields.
    const status = state.status;
    const ended: EndedView = {
      headline: status.kind === 'ended' ? runEndText(status.cause) : '',
      shiftsPlayed: state.shift - SHIFT.firstShiftNumber + 1,
      deepest: layerName(options.deepestZ),
      health: state.avatar.health,
      fuel: state.fuel,
    };
    return {
      ended,
      hud: hudLines(state, options),
      window,
      layers,
      legend: legendLines,
      notes,
      hazards: [],
      forecast: null,
      choices: [],
    };
  }

  // The forecast comes from the engine's own preview, so it cannot disagree
  // with what ending the shift then does.
  const preview = previewCubePhase(state);
  const hazards = preview.hazards.map((hazard) => {
    const where = hazard.cells.map((c) => `x${c.x} y${c.y} ${layerName(c.z)}`).join('; ');
    return `${hazard.kind} in ${hazard.inShifts} shift(s) at ${where}`;
  });
  const upkeep = preview.upkeep;
  let forecast: string;
  if (upkeep.runEnds !== null) {
    forecast = `THE RUN ENDS: ${runEndText(upkeep.runEnds)}. No fuel is left, and unspent AP does not become fuel.`;
  } else {
    // Unspent AP is lost at the end of a shift (issue #32); say so only when
    // there is some, so a player does not end a shift early by oversight.
    const unspent = state.ap > 0 ? `${state.ap} unspent AP will be lost, ` : '';
    forecast =
      `${unspent}fuel ${state.fuel} -> ${upkeep.fuelAfter} (-${upkeep.fuelConsumed} shift)` +
      `, lamp oil ${state.lampOil} -> ${upkeep.lampOilAfter}.`;
  }

  // The menu: the engine's legal actions in the engine's order, numbered from
  // 1, then "end shift" as number 0 (so its number never changes).
  const choices: ChoiceView[] = [];
  const actions = legalActions(state);
  menuChoices(state).forEach((entry, index) => {
    const isEndShift = entry.type === END_SHIFT.type;
    choices.push({
      number: isEndShift ? 0 : index + 1,
      ap: entry.type === 'endShift' ? null : entry.ap,
      text: describeChoice(state, entry) + (isEndShift ? ' (or type: end)' : ''),
      entry,
    });
  });
  // A guard for the developer: the menu must be the legal actions plus one.
  if (choices.length !== actions.length + 1) {
    throw new Error('play: the menu does not match legalActions');
  }

  return {
    ended: null,
    hud: hudLines(state, options),
    window,
    layers,
    legend: legendLines,
    notes,
    hazards,
    forecast,
    choices,
  };
}

/** Pad `text` on the right with spaces to `width` characters. */
function pad(text: string, width: number): string {
  return text.padEnd(width, ' ');
}

/** Turn a view into the text one step prints. Sees the view only, never the state. */
export function renderView(view: PlayerView): string {
  const lines: string[] = [];

  if (view.ended !== null) {
    const e = view.ended;
    lines.push(`=== RUN ENDED: ${e.headline} ===`);
    lines.push(
      `Shifts played: ${e.shiftsPlayed} | Deepest: ${e.deepest} | Health ${e.health} | Fuel ${e.fuel}`,
    );
  }
  lines.push(...view.hud);

  // The map: the layers side by side, one text row per y.
  const width = view.window.x1 - view.window.x0 + 1;
  const height = view.window.y1 - view.window.y0 + 1;
  const gap = '  ';
  const margin = '     ';
  lines.push(
    `Map: x ${view.window.x0}..${view.window.x1} left to right (east is right), ` +
      `y ${view.window.y0}..${view.window.y1} top to bottom (north is up); nearby cells off the map are unseen`,
  );
  const labels = view.layers.map((layer) => pad(layer.label, width)).join(gap);
  const relations = view.layers.map((layer) => pad(`(${layer.relation})`, width)).join(gap);
  lines.push((margin + labels).trimEnd());
  lines.push((margin + relations).trimEnd());
  for (let row = 0; row < height; row += 1) {
    const y = String(view.window.y0 + row).padStart(3, ' ');
    lines.push(`y${y} ` + view.layers.map((layer) => layer.rows[row] ?? '').join(gap));
  }
  lines.push(`Legend: ${view.legend.join(' | ')}`);
  lines.push(...view.notes);

  if (view.ended !== null) {
    return lines.join('\n');
  }

  lines.push(`Hazards: ${view.hazards.length === 0 ? 'none known' : view.hazards.join(' | ')}`);
  lines.push(`If you end the shift now: ${view.forecast ?? ''}`);
  lines.push('Actions [AP cost]:');
  for (const choice of view.choices) {
    const number = String(choice.number).padStart(2, ' ');
    const cost = choice.ap === null ? '-' : String(choice.ap);
    lines.push(`${number}. [${cost}] ${choice.text}`);
  }
  return lines.join('\n');
}
