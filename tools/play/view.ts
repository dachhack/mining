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
//
// Mineral traces (decision note 0012) are the one thing shown that depends on
// cells the player has not seen: rock the player has seen in light near ore
// is drawn with its own "traced" character (`D`, `%`, `h`: see symbols.ts).
// That is the hint the rule intends. The engine's `visibleMineralTraces`
// decides it, and only ever names revealed blocks.

import {
  AVATAR,
  NO_STRUCTURE,
  SHIFT,
  STRUCTURES,
  WORLD,
  blockDefByCode,
  itemDef,
} from '../../src/data';
import type { Vec3 } from '../../src/data';
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
  visibleMineralTraces,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import {
  choiceName,
  choiceGroupText,
  describeChoice,
  layerName,
  runEndText,
  stackListText,
} from './describe';
import { END_SHIFT, menuChoices } from './log';
import type { LogEntry } from './log';
import { missingMoveNotes, tooLittleApNote } from './missing';
import {
  SYMBOL_AVATAR,
  SYMBOL_EDGE,
  SYMBOL_ITEMS,
  SYMBOL_LADDER,
  SYMBOL_OPEN,
  SYMBOL_SUPPORT,
  SYMBOL_TORCH,
  SYMBOL_TRACES,
  SYMBOL_UNKNOWN,
  blockSymbol,
  tracedSymbol,
} from './symbols';

/** How much of the map to draw. These change the picture only, never the game. */
export interface ViewOptions {
  /**
   * How many cells the map reaches sideways from the avatar. `null` means
   * "not asked for": then the map is the whole cube while the avatar stands
   * on the surface (so that the whole top layer, which the player knows from
   * the start, is on it: issue #30), and `DEFAULT_RADIUS` underground.
   * On the surface with `null`, the surface itself is not drawn: see
   * `surfaceMode` in `buildView` (issue #46 item 2).
   */
  radius: number | null;
  /** How many layers above and below the avatar's own are drawn. */
  layers: number;
  /** The deepest `z` the avatar has stood on in this run (the session tracks it). */
  deepestZ: number;
}

export const DEFAULT_RADIUS = 4;
export const DEFAULT_LAYERS = 1;

/** One drawn layer: its `z`, a label such as "layer 3", and one string per row. */
export interface LayerView {
  z: number;
  label: string;
  /** "above", "yours" or "below"; "under you" for layer 0 drawn alone on the surface. */
  relation: string;
  rows: string[];
}

/** One line of the action list. */
export interface ChoiceView {
  /** What the player types: 1, 2, ... for an action, 0 for "end shift". */
  number: number;
  /**
   * What the player may type instead of the number: "e", "mine-down",
   * "drop-all-stone", "end". Unlike the number it means the same at every
   * step (see `choiceName` in describe.ts).
   */
  name: string;
  /** AP cost, or `null` for "end shift", which has none. */
  ap: number | null;
  text: string;
  /**
   * For a choice that may share a line with others: what they have in common
   * ("Mine Stone, gives 1 Stone" for mine actions that differ only in
   * direction; "Drop Ladder (one, or all 6)" for the two drops of an item).
   * `renderView` prints choices with the same `group` and AP cost as one
   * line. `null` for a choice printed on its own.
   */
  group: string | null;
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
  /**
   * The `--radius` that would show every cell the player has seen in the
   * drawn layers, when the player has seen cells BELOW THE TOP LAYER that
   * are off the map. `null` otherwise. The top layer does not count: the
   * player knows all of it from the start, so near the top the hint was on
   * almost every view (issue #46 item 5).
   */
  radiusForAllSeen: number | null;
  /** True if every cell the player has seen in the drawn layers is on the map. */
  allSeenOnMap: boolean;
  layers: LayerView[];
  legend: string[];
  /** Things the map cannot show with one character per cell. */
  notes: string[];
  hazards: string[];
  /**
   * Things the player might look for that are not on the list, and why: one
   * line each (see missing.ts). Moves first, then what costs more AP than is
   * left. Worked out from revealed cells only.
   */
  notOffered: string[];
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
 *
 * `surfaceMode` is true when the avatar stands on the surface and layer 0 is
 * drawn alone: the avatar is then drawn on the block it stands on.
 */
function cellView(
  state: GameState,
  pos: Vec3,
  traced: Set<string>,
  surfaceMode: boolean,
): CellView {
  const here = state.avatar.pos;
  if (pos.x === here.x && pos.y === here.y && pos.z === here.z) {
    return { symbol: SYMBOL_AVATAR, meaning: 'you' };
  }
  if (surfaceMode && pos.x === here.x && pos.y === here.y && pos.z === here.z + 1) {
    return {
      symbol: SYMBOL_AVATAR,
      meaning:
        'you, on the surface: drawn on the block of layer 0 you stand on ' +
        '(the mine-down line names that block)',
    };
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
    if (traced.has(positionKey(pos))) {
      // One character per cell, so traced rock has a character of its own for
      // each kind of rock (symbols.ts): the map shows the rock, and so its
      // cost, as well as the traces (issue #47 item 3).
      const symbol = tracedSymbol(code);
      if (symbol === null) {
        // A kind of rock added to the data's traces list without a character.
        return { symbol: SYMBOL_TRACES, meaning: 'rock with mineral traces' };
      }
      return { symbol, meaning: `${block.name} with mineral traces` };
    }
    return { symbol: blockSymbol(code), meaning: block.name };
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

function positionKey(pos: Vec3): string {
  return `${pos.x},${pos.y},${pos.z}`;
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
  // The lamp-out banner says what the lamp no longer shows. It does not say
  // what may not be done: blocks seen earlier can still be mined, diagonals
  // too (issue #47 item 1). On the surface daylight shows the top layer
  // whatever the lamp does, so there the banner is only "lamp is out".
  // Both read the player's own state only: the oil gauge and where it stands.
  let lamp = '';
  if (state.lampOil <= 0) {
    lamp =
      pos.z === WORLD.surfaceZ
        ? ' (lamp is out)'
        : ' (LAMP IS OUT: your lamp shows nothing. By touch you learn only the six cells ' +
          'touching yours; blocks you saw earlier, or that a torch or daylight shows, ' +
          'can still be mined)';
  }
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
  // On the surface, with no --radius, layer 0 is drawn alone and the avatar
  // is drawn on the block it stands on (issue #46 item 2). The surface is
  // open air everywhere, so drawing it beside layer 0 doubled the width of
  // the map and made the block under "@" hard to find.
  const surfaceMode = options.radius === null && here.z === WORLD.surfaceZ;
  let window: { x0: number; x1: number; y0: number; y1: number };
  if (surfaceMode) {
    // On the surface, with no --radius: the whole cube and one cell round it,
    // so the whole top layer is drawn and its edge shows as the edge.
    window = { x0: -1, x1: state.size.x, y0: -1, y1: state.size.y };
  } else {
    const radius = options.radius ?? DEFAULT_RADIUS;
    window = {
      x0: here.x - radius,
      x1: here.x + radius,
      y0: here.y - radius,
      y1: here.y + radius,
    };
  }

  // The map, and the legend of the characters it actually uses.
  const layers: LayerView[] = [];
  const legend = new Map<string, string>();
  const notes: string[] = [];
  // The blocks the player has seen mineral traces on, as "x,y,z" strings.
  // The engine lists only revealed blocks.
  const traced = new Set<string>(visibleMineralTraces(state).map(positionKey));
  for (let z = here.z - options.layers; z <= here.z + options.layers; z += 1) {
    // There is nothing to draw above the surface or below the bottom layer.
    if (z < WORLD.surfaceZ || z >= state.size.z) {
      continue;
    }
    if (surfaceMode && z === WORLD.surfaceZ) {
      // Not drawn. The one thing a surface cell can hold is loose items, so
      // those are still listed. (Surface cells are always known.)
      for (let y = window.y0; y <= window.y1; y += 1) {
        for (let x = window.x0; x <= window.x1; x += 1) {
          const pos = { x, y, z };
          const isOwnCell = x === here.x && y === here.y;
          if (isOwnCell || !isSurface(state.size, pos)) {
            continue; // the avatar's own cell has its own line further down
          }
          const loose = looseItemsAt(state, pos);
          if (loose.length > 0) {
            notes.push(`Loose at x${x} y${y}, ${layerName(z)}: ${stackListText(loose)}`);
          }
        }
      }
      continue;
    }
    const rows: string[] = [];
    for (let y = window.y0; y <= window.y1; y += 1) {
      let row = '';
      for (let x = window.x0; x <= window.x1; x += 1) {
        const pos = { x, y, z };
        const cell = cellView(state, pos, traced, surfaceMode);
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
    let relation = z < here.z ? 'above' : z > here.z ? 'below' : 'yours';
    if (surfaceMode && z === here.z + 1) {
      relation = 'under you';
    }
    layers.push({ z, label: z === WORLD.surfaceZ ? 'surface' : `layer ${z}`, relation, rows });
  }

  // Has the player seen cells of the drawn layers that lie outside the map?
  // Only the "revealed" flag of each cell is read here, not what the cell
  // holds. `furthestSeen` is how far the furthest such cell is; `seenBelowTop`
  // says whether any of them is below the top layer (see `radiusForAllSeen`).
  let furthestSeen = 0;
  let seenBelowTop = false;
  for (const layer of layers) {
    if (layer.z === WORLD.surfaceZ) {
      continue; // the surface is open air everywhere: nothing to miss
    }
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const outside = x < window.x0 || x > window.x1 || y < window.y0 || y > window.y1;
        if (outside && isRevealed(state, { x, y, z: layer.z })) {
          furthestSeen = Math.max(furthestSeen, Math.abs(x - here.x), Math.abs(y - here.y));
          if (layer.z > 0) {
            seenBelowTop = true;
          }
        }
      }
    }
  }
  const allSeenOnMap = furthestSeen === 0;
  const radiusForAllSeen = seenBelowTop ? furthestSeen : null;

  // Trim the map to what has something in it: rows and columns at the edge of
  // the window that are unseen in every drawn layer are left out. Underground
  // that is most of the window, and an agent reads hundreds of these. Nothing
  // is lost: every cell left out would have printed as `?`.
  // Start from the avatar's own column and row (as indexes into the rows).
  let firstColumn = here.x - window.x0;
  let lastColumn = firstColumn;
  let firstRow = here.y - window.y0;
  let lastRow = firstRow;
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
      radiusForAllSeen,
      allSeenOnMap,
      layers,
      legend: legendLines,
      notes,
      hazards: [],
      notOffered: [],
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
    if (upkeep.fuelAfter <= 0) {
      // The run does not end at this end of shift, but it will at the next
      // one unless fuel is crafted first (decision note 0005 item 21;
      // issue #47 item 4).
      forecast +=
        ' FUEL WILL BE 0: the next shift is your last unless you craft fuel during it' +
        ' (ending a shift with no fuel ends the run).';
    }
  }

  // The menu: the engine's legal actions in the engine's order, numbered from
  // 1, then "end shift" as number 0 (so its number never changes). Each also
  // has a name, which unlike the number means the same at every step.
  const choices: ChoiceView[] = [];
  const actions = legalActions(state);
  menuChoices(state).forEach((entry, index) => {
    const isEndShift = entry.type === END_SHIFT.type;
    choices.push({
      number: isEndShift ? 0 : index + 1,
      ap: entry.type === 'endShift' ? null : entry.ap,
      name: choiceName(state, entry),
      text: describeChoice(state, entry),
      group: choiceGroupText(state, entry),
      entry,
    });
  });
  // A guard for the developer: a name must stand for one choice only.
  const names = new Set(choices.map((choice) => choice.name));
  if (names.size !== choices.length) {
    throw new Error('play: two choices on the menu have the same name');
  }
  // A guard for the developer: the menu must be the legal actions plus one.
  if (choices.length !== actions.length + 1) {
    throw new Error('play: the menu does not match legalActions');
  }

  // What is not on the list and why: moves first, then what costs too much AP.
  const notOffered = missingMoveNotes(state);
  const apNote = tooLittleApNote(state);
  if (apNote !== null) {
    notOffered.push(apNote);
  }

  return {
    ended: null,
    hud: hudLines(state, options),
    window,
    radiusForAllSeen,
    allSeenOnMap,
    layers,
    legend: legendLines,
    notes,
    hazards,
    notOffered,
    forecast,
    choices,
  };
}

/** The line that opens the action list. */
export const ACTIONS_HEADING =
  'Actions: type the number or the name (names mean the same at every step). [AP cost]';

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
  // What the map leaves out. Nothing is said when only the top layer goes on
  // beyond the map: the player knows all of it from the start, and saying so
  // on every view near the top was noise (issue #46 item 5).
  let beyond = '';
  if (view.radiusForAllSeen !== null) {
    beyond = `; you have seen more of these layers than is drawn: --radius ${view.radiusForAllSeen} shows it all`;
  } else if (view.allSeenOnMap) {
    beyond = '; everything you have seen of these layers is on the map';
  }
  lines.push(
    `Map: x ${view.window.x0}..${view.window.x1} left to right (east is right), ` +
      `y ${view.window.y0}..${view.window.y1} top to bottom (north is up)${beyond}`,
  );
  // Each layer gets a column as wide as its map or its labels, whichever is
  // wider, so the labels stay over their maps on a narrow map (issue #20).
  const columnWidths = view.layers.map((layer) =>
    Math.max(width, layer.label.length, layer.relation.length + 2),
  );
  /** Put one piece of text per layer side by side, each padded to its column. */
  function sideBySide(texts: string[]): string {
    return texts
      .map((text, index) => pad(text, columnWidths[index] ?? 0))
      .join(gap)
      .trimEnd();
  }
  lines.push(margin + sideBySide(view.layers.map((layer) => layer.label)));
  lines.push(margin + sideBySide(view.layers.map((layer) => `(${layer.relation})`)));
  for (let row = 0; row < height; row += 1) {
    const y = String(view.window.y0 + row).padStart(3, ' ');
    lines.push(`y${y} ` + sideBySide(view.layers.map((layer) => layer.rows[row] ?? '')));
  }
  lines.push(`Legend: ${view.legend.join(' | ')}`);
  lines.push(...view.notes);

  if (view.ended !== null) {
    return lines.join('\n');
  }

  lines.push(`Hazards: ${view.hazards.length === 0 ? 'none known' : view.hazards.join(' | ')}`);
  lines.push(`If you end the shift now: ${view.forecast ?? ''}`);
  for (const note of view.notOffered) {
    lines.push(`Not on the list: ${note}`);
  }
  lines.push(ACTIONS_HEADING);
  // Every choice is printed once, with its number and its name. Choices with
  // the same `group` and cost share one line, printed where the first of
  // them stands in the list; a choice alone in its group has its own line.
  const nameWidth = Math.max(...view.choices.map((choice) => choice.name.length));
  const printedGroups = new Set<string>();
  for (const choice of view.choices) {
    const cost = choice.ap === null ? '-' : String(choice.ap);
    // The choices that share this one's line: itself only, unless it is in a group.
    const sharing =
      choice.group === null
        ? [choice]
        : view.choices.filter((other) => other.group === choice.group && other.ap === choice.ap);
    if (sharing.length === 1) {
      const number = String(choice.number).padStart(2, ' ');
      lines.push(`${number}. ${pad(choice.name, nameWidth)} [${cost}] ${choice.text}`);
      continue;
    }
    const groupKey = `${cost} ${choice.group ?? ''}`;
    if (printedGroups.has(groupKey)) {
      continue;
    }
    printedGroups.add(groupKey);
    const members = sharing.map((other) => `${other.number}. ${other.name}`);
    lines.push(`    ${pad('', nameWidth)} [${cost}] ${choice.group ?? ''}: ${members.join('  ')}`);
  }
  return lines.join('\n');
}
