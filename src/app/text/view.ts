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
// rule intends, and the engine decides it. The hazard tells (damp stone,
// pitted rock, warm glow, hairline glow; design doc 3.7) are the same kind of
// hint; they are listed under the map, square by square, until task T14
// gives them marks.

import {
  CREW,
  NO_STRUCTURE,
  SHIFT,
  STRUCTURES,
  SURFACE,
  WORLD,
  blockDefByCode,
  itemDef,
} from '../../data';
import {
  countItem,
  isRunActive,
  knownSquare,
  legalActions,
  previewCubePhase,
  shiftsUntilRegrowth,
  slumpCheck,
  stockpileEntries,
} from '../../engine';
import type { GameState, KnownSquare } from '../../engine';
import {
  choiceName,
  contentsNames,
  crackFallsText,
  depthName,
  describeChoice,
  describeForecastFlows,
  describeForecastSlumps,
  runEndText,
  tellNames,
} from './describe';
import { END_SHIFT, listedChoices } from './log';
import type { LogEntry } from './log';
import { tooLittleApNote } from './missing';
import { FLOODED_EXTRA_AP, SUPPORT_AP, squareText } from './squares';
import {
  MARK_GROUND,
  MARK_STUMP,
  MARK_UNSEEN,
  SYMBOL_FLOOR,
  SYMBOL_LAVA,
  SYMBOL_TRACES,
  SYMBOL_TREE,
  SYMBOL_WATER,
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
 * The mines, cuts and supports on offer. They are not lines of the list
 * (there can be some 1,700): the player names a square, "mine 3,4", "cut 3,4"
 * or "support 3,4".
 */
export interface SquareChoicesView {
  /** How many squares can be mined now, with the AP left. */
  mines: number;
  /** How many trees can be cut now, with the AP left. */
  cuts: number;
  /** What cutting a tree costs, in AP. */
  cutAp: number;
  /** How many supports are in the stockpile. */
  supportsHeld: number;
  /** How many squares a support can be placed on now, with the AP left. */
  supports: number;
  /** What placing a support costs, in AP. */
  supportAp: number;
}

/** The summary printed once the run is over. */
export interface EndedView {
  /** How the run ended, in words. */
  headline: string;
  shiftsPlayed: number;
  deepest: string;
  /** Crew health at the end. */
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
 *   `!` for a square with lava on it and `~` for one with water on it (the
 *   notes under the map name the block under it); otherwise the top block's
 *   character (its "traced" character if the map shows mineral traces on it).
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
  // Lava and water are drawn over the block: where they are matters most.
  if (square.contents.lava > 0) {
    return {
      text: SYMBOL_LAVA + mark,
      symbol: SYMBOL_LAVA,
      meaning: 'lava stands on the square: it cannot be mined (the notes say how much)',
    };
  }
  if (square.contents.water > 0) {
    return {
      text: SYMBOL_WATER + mark,
      symbol: SYMBOL_WATER,
      meaning:
        `water stands on the square: mining it costs ${FLOODED_EXTRA_AP} AP more ` +
        '(the notes say how much water, and which block is under it)',
    };
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
 * Water, lava and gas come from a pocket the player broke into (design doc
 * 6.2); cracks and supports from pit walls that slump (6.1; issue #94).
 */
function onTopNote(square: KnownSquare, crackRunning: boolean): string | null {
  const top = square.top;
  if (top === null || square.tree) {
    return null;
  }
  const things: string[] = contentsNames(square);
  // The map draws the water or lava in place of the block, so name the block.
  if (square.contents.water > 0 || square.contents.lava > 0) {
    things.push(`over ${blockMeaning(top.block)}`);
  }
  // The countdown: 1 means "falls when this shift ends". A stopped one is
  // said to be stopped; the Hazards line says where the block would land.
  if (top.crackTimer !== null) {
    things.push(
      crackRunning
        ? `a crack, countdown ${top.crackTimer + 1}`
        : `a crack, stopped at ${top.crackTimer + 1}`,
    );
  }
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
    `Crew health ${state.crew.health}/${CREW.startHealth}`,
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
  // Squares whose top block shows a hazard tell: "x3 y4 damp".
  const tells: string[] = [];
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
      // Whether a crack's countdown is running: the square is unstable.
      // `slumpCheck` reads only what the player sees.
      const crackRunning =
        square.top !== null && square.top.crackTimer !== null && slumpCheck(state, x, y).unstable;
      const note = onTopNote(square, crackRunning);
      if (note !== null) {
        notes.push(note);
      }
      const tellsHere = tellNames(square);
      if (tellsHere.length > 0) {
        tells.push(`${squareText(x, y)} ${tellsHere.join(', ')}`);
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
  if (tells.length > 0) {
    notes.push(
      'Tells on top blocks (damp: water under or beside; pitted: gas under or beside; ' +
        `warm glow: lava within 2; hairline glow: unstable ore): ${tells.join('; ')}`,
    );
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
      health: state.crew.health,
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
  // The countdowns the player can read: every cracked square (design doc
  // 6.1), with when it falls and where to. T14 words the other kinds.
  const hazards = preview.countdowns.map((countdown) => {
    const where = squareText(countdown.pos.x, countdown.pos.y);
    if (countdown.kind !== 'slump') {
      return `${countdown.kind} in ${countdown.inShifts} shift(s) at ${where}`;
    }
    if (!countdown.running || countdown.to === null) {
      return (
        `${where} is cracked, countdown stopped at ${countdown.inShifts}: ` +
        'the square is stable or held now, and it goes on if that changes'
      );
    }
    return (
      `${where} is cracked: ${crackFallsText(countdown.inShifts)}, ` +
      `onto ${squareText(countdown.to.x, countdown.to.y)}`
    );
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
    // What step (a) of the cube phase will do: slumps, then new cracks.
    for (const sentence of describeForecastSlumps(preview.slumps)) {
      forecast += ` ${sentence}`;
    }
    // What step (b) will do: water and lava flow (design doc 6.3 and 6.4).
    for (const sentence of describeForecastFlows(preview.flows)) {
      forecast += ` ${sentence}`;
    }
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

  // The mines, cuts and supports on offer are counted from the engine's own list.
  let cuts = 0;
  let supports = 0;
  for (const action of legalActions(state)) {
    if (action.type === 'mine') {
      mines += 1;
    } else if (action.type === 'cutTree') {
      cuts += 1;
    } else if (action.type === 'placeSupport') {
      supports += 1;
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
    squares: {
      mines,
      cuts,
      cutAp: SURFACE.cutTree.ap,
      supportsHeld: countItem(state, STRUCTURES.support.placedFromItem),
      supports,
      supportAp: SUPPORT_AP,
    },
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
    `Shifts played: ${e.shiftsPlayed} | Deepest square: ${e.deepest} | Crew health ${e.health} | Fuel ${e.fuel}`,
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
 * The three lines that say how to mine, cut and place a support: the squares
 * are named, not listed. Empty once the run is over.
 */
export function squareChoiceLines(view: PlayerView): string[] {
  const squares = view.squares;
  if (squares === null) {
    return [];
  }
  const mineCount = squares.mines === 1 ? '1 square' : `${squares.mines} squares`;
  const cutCount = squares.cuts === 1 ? '1 tree' : `${squares.cuts} trees`;
  const held =
    squares.supportsHeld === 0
      ? 'You have none: craft-support makes one.'
      : `You have ${squares.supportsHeld}.`;
  return [
    `    mine X,Y     [AP by block: see the legend] Mine the top block of square x X, y Y. ` +
      `${mineCount} can be mined now.`,
    `    cut X,Y      [${squares.cutAp}] Cut the tree on square x X, y Y. ${cutCount} can be cut now.`,
    `    support X,Y  [${squares.supportAp}] Place a support on square x X, y Y: ` +
      `it holds that square against slumping. ${held}`,
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
