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
  CAMPS,
  CAMP_TOOLS,
  CREW,
  NO_STRUCTURE,
  SHIFT,
  STRUCTURES,
  SURFACE,
  WORLD,
  blockDefByCode,
  itemDef,
} from '../../data';
import { belowLines, belowMarksOf } from '../below';
import {
  campAtSquare,
  campUpkeepIsDue,
  countItem,
  isRunActive,
  knownSquare,
  legalActions,
  mineDiscountAt,
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
  describeForecastGas,
  describeForecastSlumps,
  runEndText,
  tellNames,
} from './describe';
import { END_SHIFT, listedChoices } from './log';
import type { LogEntry } from './log';
import { tooLittleApNote } from './missing';
import {
  EXPLOSIVE_AP,
  FLOODED_EXTRA_AP,
  PUMP_AP,
  VENT_AP,
  VENT_REACH,
  PUMP_REACH,
  PUMP_UNITS,
  SCAN_AP,
  SCAN_DEPTH,
  SCAN_WIDTH,
  SEAL_AP,
  SUPPORT_AP,
  blastText,
  patchText,
  squareText,
} from './squares';
import {
  MARK_GROUND,
  MARK_STUMP,
  MARK_UNSEEN,
  SYMBOL_CAMP,
  SYMBOL_FLOOR,
  SYMBOL_GAS,
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
  /** How many explosives are in the stockpile. */
  explosivesHeld: number;
  /** How many squares an explosive can be placed on now, with the AP left. */
  explosives: number;
  /** What placing an explosive costs, in AP. */
  explosiveAp: number;
  /** How many camp kits are in the stockpile. */
  campKitsHeld: number;
  /** How many centre squares a camp can be founded round now. */
  campSites: number;
  /** The camp-made tools in the stockpile (design doc 7.2). */
  pumpsHeld: number;
  ventsHeld: number;
  sealantHeld: number;
  scanChargesHeld: number;
  /** True if the stockpile holds a drill. */
  hasDrill: boolean;
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

/**
 * How the note about what is known under the tops begins. Each view adds its
 * own hint to that note for how to list a square's known blocks: the play
 * tool's is "look X,Y" (`renderMap`), the phone's is Inspect or a hold.
 */
export const KNOWN_BELOW_NOTE = 'Known under the tops (scanned, or buried after you saw it):';

/** The play tool's hint for the note above. */
const LOOK_HINT = '"look X,Y" lists what you know under a square.';

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
 *   `A` for a camp square (`isCamp`); `!` for a square with lava on it,
 *   `~` for one with water on it and `*` for one with gas on it (the notes
 *   under the map name the block under it); otherwise the top block's character (its "traced" character
 *   if the map shows mineral traces on it).
 * - Second character: for a dug square, its depth (`depthMark`). At ground
 *   level there is no depth to show, so it is a space for open ground and
 *   `,` for a stump. Under a tree it is what is known of the ground: a space
 *   if it was never seen, or the block's character if the tree grew back
 *   over ground the player had seen.
 */
function squareCell(square: KnownSquare, bottomDepth: number, isCamp: boolean): SquareCellView {
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
  if (isCamp) {
    return {
      text: SYMBOL_CAMP + mark,
      symbol: SYMBOL_CAMP,
      meaning: 'camp square (cannot be mined while the camp stands)',
    };
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
  // Gas too: it hurts the crew where it works, and it burns.
  if (square.contents.gas > 0) {
    return {
      text: SYMBOL_GAS + mark,
      symbol: SYMBOL_GAS,
      meaning:
        `gas stands on the square: it takes ${CREW.damage.gas} health if the crew works there, ` +
        'and explodes if lava or a blast reaches it (the notes say how much gas, and which block is under it)',
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
  // The map draws the water, lava or gas in place of the block, so name the block.
  if (square.contents.water > 0 || square.contents.lava > 0 || square.contents.gas > 0) {
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
  if (top.armed === 'explosive') {
    things.push('an explosive: it goes off when this shift ends');
  } else if (structure !== null) {
    things.push(`a ${structure}`);
  }
  if (top.armed === 'unstableOre') {
    things.push('ARMED unstable ore: it goes off when this shift ends');
  }
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

/** "x2-5": a run of squares in one row, or "x3" for a single square. */
function runText(from: number, to: number): string {
  return from === to ? `x${from}` : `x${from}-${to}`;
}

/**
 * The notes about camps (design doc 8): one line for each camp, one line
 * that lists the squares where mining is cheaper, and one if the crew is
 * resting. Camps, depths and the crew's rest are all seen by the player.
 */
function campNotes(state: GameState): string[] {
  const notes: string[] = [];
  for (const camp of state.camps) {
    const due = campUpkeepIsDue(state, camp)
      ? `it burns ${CAMPS.upkeepFuel} fuel when this shift ends`
      : `it burns ${CAMPS.upkeepFuel} fuel every ${CAMPS.upkeepEveryShifts} shifts`;
    notes.push(
      `Camp at ${squareText(camp.pos.x, camp.pos.y)} (${depthName(camp.pos.z)}), on ` +
        `${patchText(camp.pos.x, camp.pos.y)}: ${due}. ` +
        `"rest ${camp.pos.x},${camp.pos.y}" or "decommission ${camp.pos.x},${camp.pos.y}".`,
    );
  }
  if (state.camps.length === 0) {
    return notes;
  }

  // Where mining is cheaper, row by row, as runs of x: "y2 x1-5".
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    const runs: string[] = [];
    let runStart: number | null = null;
    for (let x = 0; x <= state.size.x; x += 1) {
      // One step past the end of the row closes a run that reaches the edge.
      const cheaper =
        x < state.size.x && campAtSquare(state, x, y) === null && mineDiscountAt(state, x, y) > 0;
      if (cheaper && runStart === null) {
        runStart = x;
      } else if (!cheaper && runStart !== null) {
        runs.push(runText(runStart, x - 1));
        runStart = null;
      }
    }
    if (runs.length > 0) {
      rows.push(`y${y} ${runs.join(' ')}`);
    }
  }
  if (rows.length > 0) {
    notes.push(
      `Mining costs ${CAMPS.mineDiscountAp} AP less (never below ${CAMPS.mineMinAp}) near a camp: ` +
        `within ${CAMPS.mineDiscountSteps} steps of a camp square and no more than ` +
        `${CAMPS.mineDiscountMaxDeeper} levels below the camp. Those squares now, by row: ${rows.join('; ')}`,
    );
  }
  const restingAt = state.crew.restingAt;
  if (restingAt !== null) {
    notes.push(
      `The crew is resting at the camp at ${squareText(restingAt.x, restingAt.y)}: its squares ` +
        'count as worked this shift, and crew health is back to full when the shift ends if the camp still stands.',
    );
  }
  return notes;
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
  // Pumps, and what is known under the tops (design doc 7.2).
  const pumps: string[] = [];
  const vents: string[] = [];
  const underOre: string[] = [];
  const underPocket: string[] = [];
  const underCavern: string[] = [];
  let anyBelow = false;
  let anyDug = false;
  let anyStump = false;
  let mines = 0;
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      const cell = squareCell(square, state.size.z, campAtSquare(state, x, y) !== null);
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
      if (square.top !== null && square.top.structure === STRUCTURES.pump.code) {
        pumps.push(squareText(x, y));
      }
      if (square.top !== null && square.top.structure === STRUCTURES.vent.code) {
        vents.push(squareText(x, y));
      }
      const marks = belowMarksOf(square);
      if (marks.any) anyBelow = true;
      if (marks.ore) underOre.push(squareText(x, y));
      if (marks.pocket) underPocket.push(squareText(x, y));
      if (marks.cavern) underCavern.push(squareText(x, y));
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
        'warm glow: lava within 2; hairline glow: unstable ore, which is armed by mining beside it): ' +
        tells.join('; '),
    );
  }
  if (stumps.length > 0) {
    notes.push(
      `Stumps, and the shifts until a tree grows back (1 is the end of this shift): ${stumps.join('; ')}`,
    );
  }
  if (vents.length > 0) {
    notes.push(
      `Vents on ${vents.join(', ')}: when a shift ends each clears all the gas on the squares ` +
        `within ${VENT_REACH} steps of it, after the gas has spread and before it can burn or poison.`,
    );
  }
  if (pumps.length > 0) {
    notes.push(
      `Pumps on ${pumps.join(', ')}: each takes up to ${PUMP_UNITS} water a shift from the squares ` +
        `within ${PUMP_REACH} steps of it (the nearest first), before the water flows.`,
    );
  }
  if (anyBelow) {
    // The marks: what a scan (or a buried top) has shown under the tops.
    const marked: string[] = [];
    if (underOre.length > 0) marked.push(`ore under ${underOre.join(', ')}`);
    if (underPocket.length > 0) marked.push(`a pocket under ${underPocket.join(', ')}`);
    if (underCavern.length > 0) marked.push(`a cavern under ${underCavern.join(', ')}`);
    notes.push(
      `${KNOWN_BELOW_NOTE} ` + `${marked.length === 0 ? 'plain rock only' : marked.join('; ')}.`,
    );
  }
  notes.push(...campNotes(state));

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
  // 6.1), with when it falls and where to; then every placed explosive and
  // every armed unstable ore block, with the squares of its blast (6.6).
  const hazards = preview.countdowns.map((countdown) => {
    const where = squareText(countdown.pos.x, countdown.pos.y);
    if (countdown.kind === 'explosive') {
      return (
        `the explosive on ${where} goes off at the end of this shift: ` +
        `its blast covers ${blastText(state, countdown.pos.x, countdown.pos.y)}`
      );
    }
    if (countdown.kind === 'unstableOre') {
      return (
        `the unstable ore on ${where} is ARMED and goes off at the end of this shift ` +
        `(mine it first and it does not): its blast covers ` +
        blastText(state, countdown.pos.x, countdown.pos.y)
      );
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
    const shiftFuel = upkeep.fuelConsumed - upkeep.campFuelConsumed;
    const campFuel = upkeep.campFuelConsumed > 0 ? `, -${upkeep.campFuelConsumed} camp upkeep` : '';
    forecast = `${unspent}fuel ${state.fuel} -> ${upkeep.fuelAfter} (-${shiftFuel} shift${campFuel}).`;
    if (state.crew.restingAt !== null && state.crew.health < CREW.startHealth) {
      forecast += ` The crew rests: health ${state.crew.health} -> ${CREW.startHealth}, if nothing hurts it or reaches the camp first.`;
    }
    // What step (a) of the cube phase will do: slumps, then new cracks.
    for (const sentence of describeForecastSlumps(preview.slumps)) {
      forecast += ` ${sentence}`;
    }
    // What step (b) will do: water and lava flow (design doc 6.3 and 6.4).
    for (const sentence of describeForecastFlows(preview.flows)) {
      forecast += ` ${sentence}`;
    }
    // What step (c) will do: gas spreads, charges and armed ore go off, gas
    // burns (design doc 6.5 and 6.6).
    for (const sentence of describeForecastGas(state, preview.gas)) {
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
  let explosives = 0;
  let campSites = 0;
  for (const action of legalActions(state)) {
    if (action.type === 'mine') {
      mines += 1;
    } else if (action.type === 'cutTree') {
      cuts += 1;
    } else if (action.type === 'placeSupport') {
      supports += 1;
    } else if (action.type === 'placeExplosive') {
      explosives += 1;
    } else if (action.type === 'foundCamp') {
      campSites += 1;
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
      explosivesHeld: countItem(state, STRUCTURES.explosive.placedFromItem),
      explosives,
      explosiveAp: EXPLOSIVE_AP,
      campKitsHeld: countItem(state, CAMPS.kitItem),
      campSites,
      pumpsHeld: countItem(state, STRUCTURES.pump.placedFromItem),
      ventsHeld: countItem(state, STRUCTURES.vent.placedFromItem),
      sealantHeld: countItem(state, CAMP_TOOLS.sealantItem),
      scanChargesHeld: countItem(state, CAMP_TOOLS.scanChargeItem),
      hasDrill: countItem(state, CAMP_TOOLS.drillItem) > 0,
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
  // The play tool lists a square's known blocks with "look X,Y".
  const notes = view.notes.map((note) =>
    note.startsWith(KNOWN_BELOW_NOTE) ? `${note} ${LOOK_HINT}` : note,
  );
  const after = [`Legend: ${view.legend.join(' | ')}`, ...notes];
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
 * The lines that say how to mine, cut, place a support or an explosive and
 * found a camp:
 * the squares are named, not listed. Empty once the run is over.
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
  const explosivesHeld =
    squares.explosivesHeld === 0
      ? 'You have none: a camp makes them.'
      : `You have ${squares.explosivesHeld}.`;
  const siteCount =
    squares.campSites === 1 ? '1 centre square' : `${squares.campSites} centre squares`;
  const kits =
    squares.campKitsHeld === 0
      ? 'You have no camp kit.'
      : `You have ${squares.campKitsHeld} camp kit${squares.campKitsHeld === 1 ? '' : 's'}; ${siteCount} can take a camp now.`;
  // The camp-made tools are shown once the player holds one, so that a new
  // run's list stays short.
  const tools: string[] = [];
  if (squares.pumpsHeld > 0) {
    tools.push(
      `    pump X,Y     [${PUMP_AP}] Place a pump on square x X, y Y: each shift it takes up to ` +
        `${PUMP_UNITS} water from the squares within ${PUMP_REACH} steps. You have ${squares.pumpsHeld}.`,
    );
  }
  if (squares.ventsHeld > 0) {
    tools.push(
      `    vent X,Y     [${VENT_AP}] Place a vent on square x X, y Y: when a shift ends it clears all ` +
        `the gas on the squares within ${VENT_REACH} steps. You have ${squares.ventsHeld}.`,
    );
  }
  if (squares.sealantHeld > 0) {
    tools.push(
      `    seal X,Y     [${SEAL_AP}] Put a block of sealed rock on square x X, y Y (not at ground level): ` +
        `it comes up 1 level, and the water, lava and gas on it are destroyed. You have ${squares.sealantHeld} sealant.`,
    );
  }
  if (squares.scanChargesHeld > 0) {
    tools.push(
      `    scan X,Y     [${SCAN_AP}] Show the ${SCAN_DEPTH} blocks under each top block of the ` +
        `${SCAN_WIDTH} x ${SCAN_WIDTH} squares round x X, y Y. You have ${squares.scanChargesHeld} ` +
        `scanner charge${squares.scanChargesHeld === 1 ? '' : 's'}.`,
    );
  }
  const drill = squares.hasDrill ? ' You have a drill: Hard rock costs 2.' : '';
  return [
    `    mine X,Y     [AP by block: see the legend] Mine the top block of square x X, y Y. ` +
      `${mineCount} can be mined now.${drill}`,
    `    cut X,Y      [${squares.cutAp}] Cut the tree on square x X, y Y. ${cutCount} can be cut now.`,
    `    support X,Y  [${squares.supportAp}] Place a support on square x X, y Y: ` +
      `it holds that square against slumping. ${held}`,
    `    explosive X,Y [${squares.explosiveAp}] Place an explosive on square x X, y Y: when the shift ends ` +
      `it destroys the top block of that square and of the squares beside it. ${explosivesHeld}`,
    `    camp X,Y     [all AP left] Found a camp on the flat 3 x 3 patch whose centre is square x X, y Y ` +
      `(no tree, water, lava, gas or structure on it). ${kits}`,
    ...tools,
    '    look X,Y     [-] List what you know of square x X, y Y: its top, and any blocks known under it.',
  ];
}

/**
 * "look X,Y": everything the player knows of one square, as lines. This is
 * the play tool's "hold a square" (design doc 7.2): the top, what stands on
 * it, and the blocks known under it, which a scan reveals. Read through
 * `knownSquare` only.
 */
export function lookLines(state: GameState, x: number, y: number): string[] {
  const square = knownSquare(state, x, y);
  const where = squareText(x, y);
  let top: string;
  if (square.tree) {
    top =
      square.top === null
        ? 'a tree; the ground under it is not known'
        : `a tree, over ${blockMeaning(square.top.block)} (seen before the tree grew back)`;
  } else if (square.top === null) {
    top = 'no block left: the bedrock floor';
  } else {
    top = blockMeaning(square.top.block);
  }
  const lines = [`${where} (${depthName(square.depth)}): ${top}.`];
  const crackRunning =
    square.top !== null && square.top.crackTimer !== null && slumpCheck(state, x, y).unstable;
  const onTop = onTopNote(square, crackRunning);
  if (onTop !== null) {
    lines.push(`  ${onTop}.`);
  }
  const shown = [...(square.traces ? ['mineral traces'] : []), ...tellNames(square)];
  if (shown.length > 0) {
    lines.push(`  The top block shows: ${shown.join(', ')}.`);
  }
  const below = belowLines(square);
  if (below.length === 0) {
    lines.push('  Nothing is known under the top block: only a scan shows what is below.');
  } else {
    lines.push('  Known under the top block:');
    for (const line of below) {
      lines.push(`    ${line}`);
    }
  }
  return lines;
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
