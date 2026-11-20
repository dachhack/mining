// The player's view of a run: everything the play interface prints.
//
// `buildView` is the ONE place that reads the game state on the player's
// behalf. It returns a `PlayerView`, which holds only what the player could
// know, and `renderView` turns that into text without ever seeing the state.
// So nothing can be printed that `buildView` did not decide to show.
//
// The rule `buildView` follows (design doc v0.2 section 3.4): the player
// looks down on the cube and sees each square's depth, what stands on it and
// its top block, and nothing below a top. Each square is read through the
// engine's `knownSquare` and through nothing else: no `blockAt`, no
// `topBlockAt`. Under a tree that was never cut, `knownSquare` answers "not
// known" for the ground.
//
// Mineral traces (decision note 0012) are the one thing shown that depends on
// blocks the player has not seen: rock near ore is drawn with its own
// "traced" character (`D`, `%`, `h`: see symbols.ts). That is the hint the
// rule intends, and the engine decides it.

import {
  AVATAR,
  NO_STRUCTURE,
  SHIFT,
  STRUCTURES,
  SURFACE,
  WORLD,
  blockDefByCode,
  itemDef,
} from '../../data';
import {
  isRunActive,
  knownSquare,
  legalActions,
  previewCubePhase,
  shiftsUntilRegrowth,
  stockpileEntries,
} from '../../engine';
import type { GameState, KnownSquare } from '../../engine';
import { choiceName, depthName, describeChoice, runEndText } from './describe';
import { END_SHIFT, listedChoices } from './log';
import type { LogEntry } from './log';
import { tooLittleApNote } from './missing';
import { squareText } from './squares';
import {
  MARK_GROUND,
  MARK_STUMP,
  MARK_UNSEEN,
  SYMBOL_FLOOR,
  SYMBOL_TRACES,
  SYMBOL_TREE,
  blockSymbol,
  depthMark,
  tracedSymbol,
} from './symbols';

/** What the view needs besides the state. It changes the picture only, never the game. */
export interface ViewOptions {
  /** The greatest depth mined to in this run (the session tracks it). */
  deepestDepth: number;
}

/** One line of the action list. */
export interface ChoiceView {
  /** What the player types: 1, 2, ... for a listed action, 0 for "end shift". */
  number: number;
  /**
   * What the player may type instead of the number: "craft-fuel", "close-mine",
   * "end". Unlike the number it means the same at every step (see
   * `choiceName` in describe.ts).
   */
  name: string;
  /** AP cost, or `null` for "end shift", which has none. */
  ap: number | null;
  text: string;
  /** What goes into the play log if this is chosen. */
  entry: LogEntry;
}

/**
 * The mines and cuts on offer. They are not lines of the list (there can be
 * some 1,700): the player names a square, "mine 3,4" or "cut 3,4".
 */
export interface SquareChoicesView {
  /** How many squares can be mined now, with the AP left. */
  mines: number;
  /** How many trees can be cut now, with the AP left. */
  cuts: number;
  /** What cutting a tree costs, in AP. */
  cutAp: number;
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

/** The map: every square of the surface, seen from above. */
export interface MapView {
  /** How many squares the map is wide (x) and high (y). */
  width: number;
  height: number;
  /**
   * One string per row (y), two characters per square (x): what is on top,
   * then the depth (see `squareCell`).
   */
  rows: string[];
}

/** Everything one step prints. Plain data: no state, nothing hidden. */
export interface PlayerView {
  /** `null` while the run is going. */
  ended: EndedView | null;
  hud: string[];
  map: MapView;
  legend: string[];
  /** Things the map cannot show with two characters per square. */
  notes: string[];
  hazards: string[];
  /**
   * What is missing for want of AP, one line each (see missing.ts). Empty
   * when nothing is.
   */
  notOffered: string[];
  /** What ending the shift now would do; `null` once the run is over. */
  forecast: string | null;
  /** The mines and cuts on offer; `null` once the run is over. */
  squares: SquareChoicesView | null;
  /** The listed choices: crafting, leaving, ending the shift. */
  choices: ChoiceView[];
}

/** The two characters of one square, and what its first character means (for the legend). */
interface SquareCellView {
  text: string;
  symbol: string;
  meaning: string;
}

/** "Stone (2 AP)": a block's name and what it costs to mine. */
function blockMeaning(code: number): string {
  const block = blockDefByCode(code);
  return block.mineCost === null ? block.name : `${block.name} (${block.mineCost} AP)`;
}

/**
 * The two map characters of a square, from what `knownSquare` says of it.
 *
 * - First character: `Y` for a tree; `X` for a square with no block left;
 *   otherwise the top block's character (its "traced" character if the map
 *   shows mineral traces on it).
 * - Second character: for a dug square, its depth (`depthMark`). At ground
 *   level there is no depth to show, so it is a space for open ground and
 *   `,` for a stump. Under a tree it is what is known of the ground: a space
 *   if it was never seen, or the block's character if the tree grew back
 *   over ground the player had seen.
 */
function squareCell(square: KnownSquare, bottomDepth: number): SquareCellView {
  if (square.tree) {
    const under = square.top === null ? MARK_UNSEEN : blockSymbol(square.top.block);
    return {
      text: SYMBOL_TREE + under,
      symbol: SYMBOL_TREE,
      meaning:
        `tree: cut it for timber (${SURFACE.cutTree.ap} AP). The ground under it is hidden; ` +
        'a character straight after the Y is the block you saw there before the tree grew back',
    };
  }
  if (square.depth >= bottomDepth || square.top === null) {
    return {
      text: SYMBOL_FLOOR + depthMark(square.depth),
      symbol: SYMBOL_FLOOR,
      meaning: 'no block left: the bedrock floor of the cube (cannot be mined)',
    };
  }
  let mark = depthMark(square.depth);
  if (square.depth === 0) {
    mark = square.surfaceKind === SURFACE.kinds.stump.code ? MARK_STUMP : MARK_GROUND;
  }
  const code = square.top.block;
  if (square.traces) {
    // Traced rock has a character of its own for each kind of rock, so the
    // map shows the rock, and so its cost, as well as the traces (issue #47).
    const traced = tracedSymbol(code);
    if (traced === null) {
      // A kind of rock added to the data's traces list without a character.
      return {
        text: SYMBOL_TRACES + mark,
        symbol: SYMBOL_TRACES,
        meaning: 'rock with mineral traces',
      };
    }
    return {
      text: traced + mark,
      symbol: traced,
      meaning: `${blockMeaning(code)} with mineral traces`,
    };
  }
  const symbol = blockSymbol(code);
  return { text: symbol + mark, symbol, meaning: blockMeaning(code) };
}

/** The name of the structure with this code, or `null` for none. */
function structureName(code: number): string | null {
  if (code === NO_STRUCTURE) {
    return null;
  }
  for (const def of Object.values(STRUCTURES)) {
    if (def.code === code) {
      return def.name.toLowerCase();
    }
  }
  return 'structure';
}

/**
 * What stands or lies on a square's top that two characters cannot show
 * (water, lava, gas, a crack, a structure), or `null` if there is nothing.
 * None of these is made by the game yet (the hazards are not built); the
 * line is here so that nothing on a top can go unseen when they are.
 */
function onTopNote(square: KnownSquare): string | null {
  const top = square.top;
  if (top === null || square.tree) {
    return null;
  }
  const things: string[] = [];
  if (top.water > 0) things.push(`water ${top.water}`);
  if (top.lava > 0) things.push(`lava ${top.lava}`);
  if (top.gas > 0) things.push(`gas ${top.gas}`);
  if (top.crackTimer !== null) things.push(`cracked (falls in ${top.crackTimer + 1})`);
  const structure = structureName(top.structure);
  if (structure !== null) things.push(`a ${structure}`);
  if (things.length === 0) {
    return null;
  }
  return `On ${squareText(square.x, square.y)}: ${things.join(', ')}`;
}

function hudLines(state: GameState, options: ViewOptions): string[] {
  const gauges = [
    `Shift ${state.shift}`,
    `AP ${state.ap}/${SHIFT.apPerShift}`,
    `Fuel ${state.fuel}`,
    `Health ${state.avatar.health}/${AVATAR.startHealth}`,
  ].join(' | ');

  const deepest = `Deepest square so far: ${depthName(options.deepestDepth)}`;

  // The stockpile has no limit (design doc 4.1), so there is no "x of y".
  const held = stockpileEntries(state);
  const stockpile =
    held.length === 0
      ? 'Stockpile: nothing'
      : 'Stockpile: ' + held.map((s) => `${s.count} ${itemDef(s.item).name}`).join(', ');
  return [gauges, deepest, stockpile];
}

/**
 * Build the player's view of `state`. Reads only what the player could know;
 * see the note at the top of this file.
 */
export function buildView(state: GameState, options: ViewOptions): PlayerView {
  // The map, the legend of the characters it actually uses, and the notes.
  const rows: string[] = [];
  const legend = new Map<string, string>();
  const notes: string[] = [];
  const stumps: string[] = [];
  let anyDug = false;
  let anyStump = false;
  let mines = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      const cell = squareCell(square, state.size.z);
      row += cell.text;
      legend.set(cell.symbol, cell.meaning);
      if (square.depth > 0) {
        anyDug = true;
      }
      const note = onTopNote(square);
      if (note !== null) {
        notes.push(note);
      }
      // A stump: say when its tree grows back, which the map cannot show.
      const shifts = shiftsUntilRegrowth(state, { x, y, z: WORLD.surfaceZ });
      if (shifts !== null) {
        anyStump = true;
        stumps.push(`${squareText(x, y)} in ${shifts}`);
      }
    }
    rows.push(row.trimEnd());
  }
  if (stumps.length > 0) {
    notes.push(
      `Stumps, and the shifts until a tree grows back (1 is the end of this shift): ${stumps.join('; ')}`,
    );
  }

  const legendLines: string[] = [];
  for (const symbol of [...legend.keys()].sort()) {
    legendLines.push(`${symbol} ${legend.get(symbol) ?? ''}`);
  }
  // The second character of a square.
  if (anyStump) {
    legendLines.push(`second character "${MARK_STUMP}": a stump (ground level)`);
  }
  legendLines.push(
    anyDug
      ? 'second character: depth (blank = ground level, 1-9, then a = 10, b = 11, ...)'
      : 'second character: depth (blank = ground level; nothing is dug yet)',
  );

  const map: MapView = { width: state.size.x, height: state.size.y, rows };

  if (!isRunActive(state)) {
    // `status.kind` is 'ended' here; the check lets TypeScript see the fields.
    const status = state.status;
    const ended: EndedView = {
      headline: status.kind === 'ended' ? runEndText(status.cause) : '',
      shiftsPlayed: state.shift - SHIFT.firstShiftNumber + 1,
      deepest: depthName(options.deepestDepth),
      health: state.avatar.health,
      fuel: state.fuel,
    };
    return {
      ended,
      hud: hudLines(state, options),
      map,
      legend: legendLines,
      notes,
      hazards: [],
      notOffered: [],
      forecast: null,
      squares: null,
      choices: [],
    };
  }

  // The forecast comes from the engine's own preview, so it cannot disagree
  // with what ending the shift then does.
  const preview = previewCubePhase(state);
  // Countdowns only (0014 item 4, part 1); both parts of the forecast are
  // empty until the hazards are built, and task T14 words them.
  const hazards = preview.countdowns.map((countdown) => {
    const c = countdown.pos;
    return `${countdown.kind} in ${countdown.inShifts} shift(s) at ${squareText(c.x, c.y)}`;
  });
  const upkeep = preview.upkeep;
  let forecast: string;
  if (upkeep.runEnds !== null) {
    forecast = `THE RUN ENDS: ${runEndText(upkeep.runEnds)}. No fuel is left, and unspent AP does not become fuel.`;
  } else {
    // Unspent AP is lost at the end of a shift (issue #32); say so only when
    // there is some, so a player does not end a shift early by oversight.
    const unspent = state.ap > 0 ? `${state.ap} unspent AP will be lost, ` : '';
    forecast = `${unspent}fuel ${state.fuel} -> ${upkeep.fuelAfter} (-${upkeep.fuelConsumed} shift).`;
    if (preview.regrowth.length > 0) {
      const cells = preview.regrowth.map((cell) => squareText(cell.x, cell.y)).join(', ');
      forecast += ` A tree grows back on the stump at ${cells}.`;
    }
    if (upkeep.fuelAfter <= 0) {
      // The run does not end at this end of shift, but it will at the next
      // one unless fuel is crafted first (decision note 0005 item 21;
      // issue #47 item 4).
      forecast +=
        ' FUEL WILL BE 0: the next shift is your last unless you craft fuel during it' +
        ' (ending a shift with no fuel ends the run).';
    }
  }

  // The mines and cuts on offer are counted from the engine's own list.
  let cuts = 0;
  for (const action of legalActions(state)) {
    if (action.type === 'mine') {
      mines += 1;
    } else if (action.type === 'cutTree') {
      cuts += 1;
    }
  }

  // The list: the engine's other legal actions in the engine's order,
  // numbered from 1, then "end shift" as number 0 (so its number never
  // changes). Each also has a name, which means the same at every step.
  const choices: ChoiceView[] = [];
  listedChoices(state).forEach((entry, index) => {
    const isEndShift = entry.type === END_SHIFT.type;
    choices.push({
      number: isEndShift ? 0 : index + 1,
      ap: entry.type === 'endShift' ? null : entry.ap,
      name: choiceName(entry),
      text: describeChoice(state, entry),
      entry,
    });
  });
  // A guard for the developer: a name must stand for one choice only.
  const names = new Set(choices.map((choice) => choice.name));
  if (names.size !== choices.length) {
    throw new Error('play: two choices on the list have the same name');
  }

  const notOffered: string[] = [];
  const apNote = tooLittleApNote(state);
  if (apNote !== null) {
    notOffered.push(apNote);
  }

  return {
    ended: null,
    hud: hudLines(state, options),
    map,
    legend: legendLines,
    notes,
    hazards,
    notOffered,
    forecast,
    squares: { mines, cuts, cutAp: SURFACE.cutTree.ap },
    choices,
  };
}

/** The line that opens the action list. */
export const ACTIONS_HEADING =
  'Actions: name a square, or type the number or the name of a line. [AP cost]';

/** Pad `text` on the right with spaces to `width` characters. */
function pad(text: string, width: number): string {
  return text.padEnd(width, ' ');
}

/** The "RUN ENDED" lines once the run is over; none while it is going. */
export function renderEndedLines(view: PlayerView): string[] {
  if (view.ended === null) {
    return [];
  }
  const e = view.ended;
  return [
    `=== RUN ENDED: ${e.headline} ===`,
    `Shifts played: ${e.shiftsPlayed} | Deepest square: ${e.deepest} | Health ${e.health} | Fuel ${e.fuel}`,
  ];
}

/** The map part of the view, in three pieces (see `renderMap`). */
export interface MapText {
  /** The "Map:" line. */
  header: string;
  /** The x rulers and one row per y: the part that must keep its layout. */
  grid: string[];
  /** The legend line and the notes. */
  after: string[];
}

/**
 * The map part of the view: its "Map:" header, the grid with its rulers, the
 * legend and the notes.
 *
 * Each square is two characters wide, so the x ruler is two lines: the tens
 * of each x over its ones, both over the square's first character. Each row
 * starts with its y.
 */
export function renderMap(view: PlayerView): MapText {
  const map = view.map;
  const header =
    `Map: the whole surface from above. x 0..${map.width - 1} left to right (east is right), ` +
    `y 0..${map.height - 1} top to bottom (north is up). Each square is two characters: ` +
    'what is on top, then its depth.';
  const margin = '     ';
  let tens = '';
  let ones = '';
  for (let x = 0; x < map.width; x += 1) {
    // `Math.floor(x / 10)` is the tens digit; a blank under 10 keeps it quiet.
    tens += (x >= 10 ? String(Math.floor(x / 10)) : ' ') + ' ';
    ones += String(x % 10) + ' ';
  }
  const grid: string[] = [(margin + tens).trimEnd(), (margin + ones).trimEnd()];
  map.rows.forEach((row, y) => {
    grid.push(`y${String(y).padStart(3, ' ')} ${row}`);
  });
  const after = [`Legend: ${view.legend.join(' | ')}`, ...view.notes];
  return { header, grid, after };
}

/** The "Hazards:" line. */
export function hazardsLine(view: PlayerView): string {
  return `Hazards: ${view.hazards.length === 0 ? 'none known' : view.hazards.join(' | ')}`;
}

/** The "If you end the shift now:" line. */
export function forecastLine(view: PlayerView): string {
  return `If you end the shift now: ${view.forecast ?? ''}`;
}

/**
 * The two lines that say how to mine and cut: the squares are named, not
 * listed. Empty once the run is over.
 */
export function squareChoiceLines(view: PlayerView): string[] {
  const squares = view.squares;
  if (squares === null) {
    return [];
  }
  const mineCount = squares.mines === 1 ? '1 square' : `${squares.mines} squares`;
  const cutCount = squares.cuts === 1 ? '1 tree' : `${squares.cuts} trees`;
  return [
    `    mine X,Y  [AP by block: see the legend] Mine the top block of square x X, y Y. ` +
      `${mineCount} can be mined now.`,
    `    cut X,Y   [${squares.cutAp}] Cut the tree on square x X, y Y. ${cutCount} can be cut now.`,
  ];
}

/** Turn a view into the text one step prints. Sees the view only, never the state. */
export function renderView(view: PlayerView): string {
  const lines: string[] = [];
  lines.push(...renderEndedLines(view));
  lines.push(...view.hud);
  const map = renderMap(view);
  lines.push(map.header, ...map.grid, ...map.after);

  if (view.ended !== null) {
    return lines.join('\n');
  }

  lines.push(hazardsLine(view));
  lines.push(forecastLine(view));
  for (const note of view.notOffered) {
    lines.push(`Not possible now: ${note}`);
  }
  lines.push(ACTIONS_HEADING);
  lines.push(...squareChoiceLines(view));
  const nameWidth = Math.max(...view.choices.map((choice) => choice.name.length));
  for (const choice of view.choices) {
    const cost = choice.ap === null ? '-' : String(choice.ap);
    const number = String(choice.number).padStart(2, ' ');
    lines.push(`${number}. ${pad(choice.name, nameWidth)} [${cost}] ${choice.text}`);
  }
  return lines.join('\n');
}
