// The play interface for the new game (Lab 2 becomes the game, plan B2): the
// view (what the player may know), the choices, the play log, and the
// one-shot modes. `runFrontierCli` does everything but the interactive
// prompt (tools/playFrontier.ts), and returns the text to print, so the
// tests can call it directly.
//
// A play log is JSON: { engineVersion, seed, steps }, where each step is one
// of the steps of tools/frontierRun.ts ("tap 3,4", "place 5,6", "upgrade 2",
// "demolish 1", "endShift", "rest 1", "close"). Only steps that did something
// are logged; an undone step is taken out of the log. Replaying the steps on
// the seed gives the same run, on the engine version the log names.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { BLOCKS, ITEMS, blockDefByCode } from '../../src/data';
import type { BlockId, ItemId, ItemStack } from '../../src/data';
import {
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_RECIPES,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
} from '../../src/data/frontier';
import {
  ENGINE_VERSION,
  actLogged,
  animalAt,
  campAt,
  campRing,
  canAfford,
  createFrontier,
  depthAt,
  frontierTap,
  hashFrontier,
  levelNeededFor,
  lanternRefusal,
  makeRefusal,
  newlyCovered,
  previewTap,
  placeRefusal,
  shiftUndoCount,
  sightMap,
  smelterRefusal,
  startLog,
  topBlockAt,
  undoLastAction,
  upgradeCostFrom,
  upkeepDue,
} from '../../src/engine';
import type { FrontierAction, FrontierState, ShiftLog, ShiftReport } from '../../src/engine';
import { APPLE_TREE, GRASS, NO_FEATURE, TREE } from '../../src/engine/frontier/state';
import { actionOf, replayFrontier } from '../frontierRun';
import type { FrontierStep } from '../frontierRun';
import { frontierHelpText } from './frontierHelp';

/** A play log, as saved to a file. */
export interface FrontierLog {
  engineVersion: string;
  seed: number;
  steps: FrontierStep[];
}

/** A run being played: the log, the state, and the shift's undo log. */
export interface FrontierSession {
  log: FrontierLog;
  state: FrontierState;
  shiftLog: ShiftLog;
  /** Where in `log.steps` the current shift's steps begin. */
  shiftStart: number;
}

// ----- Sessions and logs -----

/** A new run on `seed`. */
export function newFrontierSession(seed: number): FrontierSession {
  const state = createFrontier(seed);
  return {
    log: { engineVersion: ENGINE_VERSION, seed, steps: [] },
    state,
    shiftLog: startLog(state),
    shiftStart: 0,
  };
}

/** A run that has played `log`. Throws if a step is refused (the rules changed). */
export function sessionFromLog(log: FrontierLog): FrontierSession {
  let session = newFrontierSession(log.seed);
  for (const step of log.steps) {
    const result = act(session, step);
    if (result.refused !== null) {
      throw new Error(`the logged step "${step}" is refused now: ${result.refused}`);
    }
    session = result.session;
  }
  return session;
}

/** A log as text, for its file. */
export function logText(log: FrontierLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}

/** A log read from text. Throws with a message for the user if it is not one. */
export function logFrom(text: string): FrontierLog {
  // `as`: each field is checked just below.
  const parsed = JSON.parse(text) as Partial<FrontierLog>;
  if (
    typeof parsed.seed !== 'number' ||
    !Array.isArray(parsed.steps) ||
    typeof parsed.engineVersion !== 'string'
  ) {
    throw new Error('not a play log of the new game');
  }
  return { engineVersion: parsed.engineVersion, seed: parsed.seed, steps: parsed.steps };
}

/** Save `log` to `path`, all at once (a new file, then renamed over the old one). */
export function saveFrontierLog(path: string, log: FrontierLog): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, logText(log));
  renameSync(`${path}.tmp`, path);
}

// ----- Acting -----

/** What one step did. */
export interface StepResult {
  session: FrontierSession;
  /** Why it was refused, for the player; `null` if it was done. */
  refused: string | null;
  /** What happened, in a line or two, for the player. */
  lines: string[];
}

/** Why the engine refused an action, in words for the player. */
function refusalText(refusal: string | null): string {
  const texts: Record<string, string> = {
    over: 'The run is over.',
    noTaps: 'No taps left this shift: end the shift ("end").',
    fog: 'That square is in the fog.',
    greyed: 'That square is out of range now: no camp lights it.',
    camp: 'A camp stands there; it is never mined.',
    tooHard: 'Too hard for the camps over it.',
    outside: 'That square is off the map.',
    neighbourHigher:
      'Too steep: a neighbour is more than 1 level higher. Mine the higher blocks first.',
    bottom: 'Nothing left to mine there.',
    place: 'A camp cannot go there now (see "look").',
    upgrade: 'That camp cannot be upgraded now.',
    demolish: 'That camp cannot be demolished: other camps must cover its 3 x 3 first.',
  };
  return texts[refusal ?? ''] ?? `Refused: ${refusal ?? 'unknown'}.`;
}

/** What a tap does to a square, as a verb: "cut the grass on", "mine"... */
const TAP_VERBS: Record<string, string> = {
  grass: 'cut the grass on',
  felled: 'fell the tree on',
  apple: 'pick an apple from',
  caught: 'catch the animal on',
  mined: 'mine',
};

/** What a tap did, in the past: "cut the grass", "mined"... */
const TAP_DONE: Record<string, string> = {
  grass: 'cut the grass',
  felled: 'felled the tree',
  apple: 'picked an apple',
  caught: 'caught the animal',
  mined: 'mined',
};

/** "2 wood, 1 apple". */
function stacksText(stacks: ItemStack[]): string {
  return stacks.map((s) => `${s.count} ${itemName(s.item)}`).join(', ');
}

/** The display name of an item, in lower case. */
function itemName(item: string): string {
  return (item in ITEMS ? ITEMS[item as ItemId].name : item).toLowerCase();
}

/** What End shift (or rest) did, in one line. */
function shiftLine(report: ShiftReport, state: FrontierState): string {
  const paid = report.paid.length === 0 ? 'nothing paid' : `paid ${stacksText(report.paid)}`;
  const hunger =
    report.healthLost > 0
      ? `; no ${report.unpaid.map((s) => s.item).join(' or ')}: -${report.healthLost} health`
      : '';
  const more = [
    report.regrown > 0 ? `${report.regrown} apple tree(s) regrew` : '',
    report.treesRegrown > 0 ? `${report.treesRegrown} felled tree(s) grew back` : '',
    report.newAnimals > 0 ? 'an animal walked in' : '',
  ].filter((t) => t !== '');
  const end = state.status === 'lost' ? ' The crew is lost: the run is over.' : '';
  return `Shift ${report.shift} over: ${paid}${hunger}.${more.length > 0 ? ` ${more.join('; ')}.` : ''}${end}`;
}

/** Take one step: a choice the player typed, as a step of the log ("tap 3,4"), or "undo". */
export function act(session: FrontierSession, step: FrontierStep): StepResult {
  if (step === 'undo') {
    return undo(session);
  }
  const action: FrontierAction = actionOf(step);
  const before = session.state;
  const { outcome, log } = actLogged(before, session.shiftLog, action);
  if (!outcome.done) {
    const tap = outcome.tap;
    let why = refusalText(tap?.kind === 'refused' ? tap.refusal : (outcome.refusal ?? null));
    if (tap?.kind === 'tooHard') {
      why =
        tap.needs === null
          ? 'No camp level can mine that block.'
          : `Too hard: it needs a level ${tap.needs} camp over it.`;
    }
    return { session, refused: why, lines: [] };
  }
  const steps = [...session.log.steps, step];
  const newShift = action.kind === 'endShift' || action.kind === 'rest' || action.kind === 'close';
  const next: FrontierSession = {
    log: { ...session.log, steps },
    state: outcome.state,
    shiftLog: log,
    shiftStart: newShift ? steps.length : session.shiftStart,
  };
  const lines: string[] = [];
  if (outcome.tap !== null) {
    const gain = outcome.tap.gain.length > 0 ? `+${stacksText(outcome.tap.gain)}` : 'nothing';
    const what = TAP_DONE[outcome.tap.harvest ?? 'mined'] ?? 'done';
    lines.push(`${step}: ${what}, ${gain}.`);
  } else if (outcome.report !== null) {
    lines.push(
      `${action.kind === 'rest' ? 'Rested. ' : ''}${shiftLine(outcome.report, outcome.state)}`,
    );
  } else if (action.kind === 'close') {
    lines.push('The mine is closed: the run is over.');
  } else {
    lines.push(`${step}: done.`);
  }
  return { session: next, refused: null, lines };
}

/** Undo the newest undoable step of the shift (plan A5). */
function undo(session: FrontierSession): StepResult {
  const result = undoLastAction(session.shiftLog);
  if (result === null) {
    return { session, refused: 'Nothing to undo in this shift.', lines: [] };
  }
  if ('refused' in result) {
    return { session, refused: 'That cannot be undone now.', lines: [] };
  }
  // The shift's steps in the log and the engine's shift log match one to
  // one (both hold only the steps that did something), so the undone step is
  // the newest one the shift log marks undoable.
  let index = -1;
  session.shiftLog.actions.forEach((entry, i) => {
    if (entry.undoable) index = i;
  });
  const steps = [...session.log.steps];
  const [undone] = steps.splice(session.shiftStart + index, 1);
  return {
    session: {
      ...session,
      log: { ...session.log, steps },
      state: result.state,
      shiftLog: result.log,
    },
    refused: null,
    lines: [`Undone: ${undone ?? ''}. The tap is back.`],
  };
}

// ----- Choices -----

/**
 * The step a typed choice stands for, or `null` if it is not one. Accepts
 * "tap 3,4" (or "t 3 4"), "place 3,4", "upgrade 2", "demolish 1", "end",
 * "rest 1" (or "rest" with one camp), "close", "undo", or the number of a listed choice.
 */
export function stepOf(typed: string, listed: FrontierStep[]): FrontierStep | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^\d+$/.test(text)) {
    return listed[Number(text) - 1] ?? null;
  }
  const square = /^(tap|t|place|p) (\d+)[ ,]+(\d+)$/.exec(text);
  if (square !== null) {
    const verb = square[1] === 't' ? 'tap' : square[1] === 'p' ? 'place' : (square[1] ?? '');
    return `${verb} ${square[2] ?? ''},${square[3] ?? ''}`;
  }
  const camp = /^(upgrade|demolish|rest) (\d+)$/.exec(text);
  if (camp !== null) {
    return `${camp[1] ?? ''} ${camp[2] ?? ''}`;
  }
  const smelter = /^(smelter|buildsmelter|build smelter) (\d+)$/.exec(text);
  if (smelter !== null) {
    return `buildSmelter ${smelter[2] ?? ''}`;
  }
  const lantern = /^(lantern|hang|hang lantern|hanglantern) (\d+)$/.exec(text);
  if (lantern !== null) {
    return `hangLantern ${lantern[2] ?? ''}`;
  }
  const make = /^make ([a-z-]+)$/.exec(text);
  if (make !== null) {
    return `make ${make[1] ?? ''}`;
  }
  const words: Record<string, FrontierStep> = {
    end: 'endShift',
    'end shift': 'endShift',
    endshift: 'endShift',
    close: 'close',
    'close mine': 'close',
    undo: 'undo',
  };
  if (text === 'rest') {
    // Rest is at a camp: "rest" alone names one only when there is one choice.
    const rests = listed.filter((s) => s.startsWith('rest '));
    return rests.length === 1 ? (rests[0] ?? null) : null;
  }
  return words[text] ?? null;
}

/** How many places for a new camp the view lists, best first. */
const LISTED_PLACES = 5;

/**
 * The choices listed under the view, numbered: every upgrade, demolish,
 * smelter, lantern and recipe that would work, the places for a new camp that light the most new ground
 * (if one can be paid for), then undo, end shift, rest at each camp, and close. Taps are
 * not listed one by one (there are hundreds): the view counts them, and
 * "tap X,Y" takes any of them.
 */
export function listedSteps(session: FrontierSession): FrontierStep[] {
  const state = session.state;
  if (state.status !== 'active') return [];
  const steps: FrontierStep[] = [];
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  if (state.tapsLeft > 0) {
    for (const camp of state.camps) {
      if (act(session, `upgrade ${camp.id}`).refused === null) steps.push(`upgrade ${camp.id}`);
      if (act(session, `demolish ${camp.id}`).refused === null) steps.push(`demolish ${camp.id}`);
      if (smelterRefusal(state, camp.id) === null) steps.push(`buildSmelter ${camp.id}`);
      if (lanternRefusal(state, camp.id) === null) steps.push(`hangLantern ${camp.id}`);
    }
    for (const recipe of FRONTIER_RECIPES) {
      if (makeRefusal(state, recipe.id) === null) steps.push(`make ${recipe.id}`);
    }
    if (canAfford(state.inventory, FRONTIER_NEW_CAMP_COST)) {
      // The places that light the most new ground, best first (ties row by row).
      const places: { step: FrontierStep; fresh: number }[] = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          if (placeRefusal(state, x, y) === null) {
            places.push({ step: `place ${x},${y}`, fresh: newlyCovered(state, x, y).length });
          }
        }
      }
      places.sort((a, b) => b.fresh - a.fresh);
      steps.push(...places.slice(0, LISTED_PLACES).map((p) => p.step));
    }
  }
  if (shiftUndoCount(session.shiftLog) > 0) steps.push('undo');
  steps.push('endShift', ...state.camps.map((c): FrontierStep => `rest ${c.id}`), 'close');
  return steps;
}

// ----- The view -----

/** The character for each block's top, at ground level and below. */
const BLOCK_SYMBOLS: Partial<Record<BlockId, string>> = {
  dirt: '.',
  stone: '#',
  clay: 'k',
  coalSeam: 'o',
  hardRock: 'H',
  ironOre: 'i',
  copperOre: 'u',
  crystal: 'x',
  unstableOre: 'U',
  relic: 'r',
  keystone: 'K',
  rubble: 'R',
  sealed: 'S',
  bedrock: 'B',
};

/** A square's depth as one character: 0-9, then a, b, c... */
function depthChar(depth: number): string {
  return depth < 10 ? String(depth) : String.fromCharCode(87 + depth); // 10 -> 'a'
}

/** The two characters of square (x, y): what is on it, and its depth. */
function squareChars(state: FrontierState, sight: string, x: number, y: number): string {
  if (sight === 'fog') return '??';
  if (sight === 'greyed') return '--';
  const depth = depthAt(state.cube, x, y);
  const i = x + state.cube.size.x * y;
  const camp = campAt(state.camps, x, y);
  let first: string;
  if (animalAt(state, x, y) !== null) first = 'm';
  else if (camp !== null) first = camp.x === x && camp.y === y ? String(camp.id % 10) : '+';
  else if (state.features[i] === GRASS) first = '"';
  else if (state.features[i] === TREE) first = 'T';
  else if (state.features[i] === APPLE_TREE) first = (state.apples[i] ?? 0) > 0 ? 'A' : 'a';
  else if (depth >= state.cube.size.z) first = '_';
  else {
    const code = topBlockAt(state.cube, x, y);
    const id = Object.keys(BLOCKS).find((b) => BLOCKS[b as BlockId].code === code) as
      BlockId | undefined;
    first = (id === undefined ? undefined : BLOCK_SYMBOLS[id]) ?? '?';
  }
  return first + depthChar(depth);
}

/** The map of every square ever lit, with x and y numbers round it. */
function mapLines(state: FrontierState): string[] {
  const sights = sightMap(state);
  const width = state.cube.size.x;
  const height = state.cube.size.y;
  // Only the rows and columns with something seen.
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  sights.forEach((sight, i) => {
    if (sight === 'fog') return;
    const x = i % width;
    const y = Math.floor(i / width);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  });
  const lines: string[] = [];
  let tens = '    ';
  let units = '    ';
  for (let x = x0; x <= x1; x += 1) {
    tens += `${Math.floor(x / 10)} `;
    units += `${x % 10} `;
  }
  lines.push(tens, units);
  for (let y = y0; y <= y1; y += 1) {
    let row = `${String(y).padStart(2)}  `;
    for (let x = x0; x <= x1; x += 1) {
      row += squareChars(state, sights[x + width * y] ?? 'fog', x, y);
    }
    lines.push(row);
  }
  return lines;
}

/** What the player sees: the run's numbers, the map, the camps, and the choices. */
export function frontierView(session: FrontierSession): string {
  const state = session.state;
  const lines: string[] = [];
  const status =
    state.status === 'active'
      ? ''
      : state.status === 'lost'
        ? ' · RUN OVER: the crew is lost'
        : ' · RUN OVER: mine closed';
  lines.push(
    `Seed ${state.seed} · Shift ${state.shift} · Taps ${state.tapsLeft}/${FRONTIER_SHIFT.taps} · Health ${state.health}/${FRONTIER_SHIFT.startHealth} · Dug ${state.mined}${status}`,
  );
  const held = [...state.inventory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  lines.push(
    `Held: ${held.length === 0 ? 'nothing' : held.map(([item, n]) => `${n} ${itemName(item)}`).join(', ')}`,
  );
  lines.push(
    `Upkeep at the end of this shift: ${stacksText(upkeepDue(state.shift, state.camps.length)) || 'nothing'}`,
  );
  lines.push(`New camp costs ${stacksText(FRONTIER_NEW_CAMP_COST)}.`);
  for (const camp of state.camps) {
    const cost = upgradeCostFrom(camp.level);
    const up = cost === null ? 'top level' : `upgrade costs ${stacksText(cost)}`;
    const smelter = camp.smelter
      ? '; a smelter'
      : camp.level >= FRONTIER_SMELTER.minLevel
        ? `; a smelter costs ${stacksText(FRONTIER_SMELTER.cost)}`
        : '';
    const lantern = camp.lantern ? '; a lantern' : '';
    lines.push(
      `Camp ${camp.id} at ${camp.x},${camp.y}: level ${camp.level}, ring ${campRing(camp)}; ${up}${smelter}${lantern}.`,
    );
  }
  lines.push('', ...mapLines(state), '');
  lines.push(
    'Map: two characters a square: what is on it, then its depth. ?? fog, -- out of range now.',
    '  m animal  " grass  T tree  A apple tree (a: no apples)  N camp N\'s middle  + camp ground',
    '  . dirt  # stone  k clay  o coal  H hard rock  i iron  u copper  x crystal  R rubble  _ nothing left',
  );
  const listed = listedSteps(session);
  if (listed.length > 0) {
    lines.push('', 'Choices:');
    if (state.tapsLeft > 0) {
      lines.push(
        `  tap X,Y on any lit square: ${usefulTaps(state)} squares would take or mine something now.`,
      );
    }
    const numbered = (s: FrontierStep, i: number): string => `${i + 1}) ${s}`;
    lines.push(`  ${listed.map(numbered).join('  ')}`);
    lines.push('  Also: "look X,Y" to see what a square is and what a tap would do.');
  }
  return lines.join('\n');
}

/** How many squares a tap would take or mine something on now. */
function usefulTaps(state: FrontierState): number {
  let count = 0;
  for (let y = 0; y < state.cube.size.y; y += 1) {
    for (let x = 0; x < state.cube.size.x; x += 1) {
      const kind = previewTap(state, x, y).kind;
      if (kind === 'mined' || kind === 'harvested') count += 1;
    }
  }
  return count;
}

/** "look X,Y": what square (x, y) is, as far as the player can know, and what a tap would do. */
export function lookText(session: FrontierSession, x: number, y: number): string {
  const state = session.state;
  const size = state.cube.size;
  if (x < 0 || y < 0 || x >= size.x || y >= size.y) return `${x},${y} is off the map.`;
  const sight = sightMap(state)[x + size.x * y] ?? 'fog';
  if (sight === 'fog') return `${x},${y}: fog. Nothing is known of it.`;
  if (sight === 'greyed')
    return `${x},${y}: out of range now (no camp lights it). It cannot be mined.`;
  const depth = depthAt(state.cube, x, y);
  const code = topBlockAt(state.cube, x, y);
  const parts = [`${x},${y}: depth ${depth}`];
  if (depth < size.z) {
    const needs = levelNeededFor(code);
    parts.push(
      `top block ${blockDefByCode(code).name}${needs === null ? ' (no camp can mine it)' : ` (a level ${needs} camp mines it)`}`,
    );
  }
  const i = x + size.x * y;
  const feature = state.features[i];
  if (feature === GRASS) parts.push('grass on it');
  if (feature === TREE) parts.push('a tree on it');
  if (feature === APPLE_TREE) parts.push(`an apple tree with ${state.apples[i] ?? 0} apple(s)`);
  const stump = state.stumps[i] ?? NO_FEATURE;
  if (stump !== NO_FEATURE) {
    const tree = stump === APPLE_TREE ? 'an apple tree' : 'a tree';
    parts.push(`a stump: ${tree} grows back in ${state.regrowIn[i] ?? 0} shift(s)`);
  }
  if (animalAt(state, x, y) !== null) parts.push('an animal on it');
  const camp = campAt(state.camps, x, y);
  if (camp !== null) parts.push(`camp ${camp.id}'s ground`);
  const tap = frontierTap(state, x, y);
  const would =
    tap.kind === 'mined' || tap.kind === 'harvested'
      ? `a tap would ${TAP_VERBS[tap.harvest ?? 'mined'] ?? 'take'} it, for ${stacksText(tap.gain) || 'nothing'}`
      : `a tap would do nothing: ${refusalText(tap.kind === 'refused' ? tap.refusal : tap.kind)}`;
  const place = placeRefusal(state, x, y);
  parts.push(would, place === null ? 'a camp could go here' : `no camp here (${place})`);
  return `${parts.join('; ')}.`;
}

// ----- The command line -----

export interface FrontierCliOptions {
  help: boolean;
  interactive: boolean;
  seed: number | null;
  logPath: string | null;
  replayPath: string | null;
  /** The choices of `--do`, split at the semicolons. */
  choices: string[];
}

/** Read the arguments. Throws an `Error` with a message for the user on a bad one. */
export function parseFrontierArgs(args: string[]): FrontierCliOptions {
  const options: FrontierCliOptions = {
    help: false,
    interactive: false,
    seed: null,
    logPath: null,
    replayPath: null,
    choices: [],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = (): string => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`${arg ?? ''} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--interactive' || arg === '-i') options.interactive = true;
    else if (arg === '--seed') {
      const v = value();
      if (!/^\d+$/.test(v)) throw new Error(`--seed must be a whole number, but is ${v}`);
      options.seed = Number(v);
    } else if (arg === '--log') options.logPath = value();
    else if (arg === '--replay') options.replayPath = value();
    else if (arg === '--do')
      options.choices = value()
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c !== '');
    else throw new Error(`unknown argument ${arg ?? ''}`);
  }
  return options;
}

/** The run to play: from the log file if it exists, else a new one on the seed (or a random seed). */
export function openFrontierSession(options: FrontierCliOptions): {
  session: FrontierSession;
  notes: string[];
} {
  if (options.logPath !== null && existsSync(options.logPath)) {
    const log = logFrom(readFileSync(options.logPath, 'utf8'));
    if (log.engineVersion !== ENGINE_VERSION) {
      throw new Error(
        `the log was played on engine ${log.engineVersion}; this is engine ${ENGINE_VERSION}`,
      );
    }
    if (options.seed !== null && options.seed !== log.seed) {
      throw new Error(`the log is on seed ${log.seed}, not ${options.seed}`);
    }
    return {
      session: sessionFromLog(log),
      notes: [`Carrying on the run in ${options.logPath} (${log.steps.length} steps).`],
    };
  }
  // A random seed is fine here: this is the tool, not the engine.
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  return { session: newFrontierSession(seed), notes: [] };
}

/** Take typed choices in order, stopping at the first that is refused or not understood. */
export function takeFrontierChoices(
  session: FrontierSession,
  choices: string[],
): { session: FrontierSession; lines: string[]; refused: string | null; taken: number } {
  let s = session;
  const lines: string[] = [];
  let taken = 0;
  for (const choice of choices) {
    const look = /^look (\d+)[ ,]+(\d+)$/.exec(choice.trim().toLowerCase());
    if (look !== null) {
      lines.push(lookText(s, Number(look[1]), Number(look[2])));
      continue;
    }
    const step = stepOf(choice, listedSteps(s));
    if (step === null) {
      return { session: s, lines, refused: `"${choice}" is not a choice. ${USAGE_HINT}`, taken };
    }
    const result = act(s, step);
    if (result.refused !== null) {
      return { session: s, lines, refused: `"${choice}": ${result.refused}`, taken };
    }
    s = result.session;
    lines.push(...result.lines);
    taken += 1;
  }
  return { session: s, lines, refused: null, taken };
}

const USAGE_HINT = 'Run "npm run play -- --help" for usage and the rules.';

/** Everything but the interactive prompt: help, replay, and one-shot choices. */
export function runFrontierCli(args: string[]): { output: string; exitCode: number } {
  let options: FrontierCliOptions;
  try {
    options = parseFrontierArgs(args);
  } catch (error) {
    return { output: `play: ${(error as Error).message}\n${USAGE_HINT}`, exitCode: 1 };
  }
  if (options.help) {
    return { output: frontierHelpText(), exitCode: 0 };
  }
  try {
    if (options.replayPath !== null) {
      const log = logFrom(readFileSync(options.replayPath, 'utf8'));
      const state = replayFrontier(log.seed, log.steps);
      const session = sessionFromLog(log);
      return {
        output: `${frontierView(session)}\n\nReplayed ${log.steps.length} steps on seed ${log.seed}. Hash ${hashFrontier(state)}.`,
        exitCode: 0,
      };
    }
    const opened = openFrontierSession(options);
    const result = takeFrontierChoices(opened.session, options.choices);
    if (options.logPath !== null && (result.taken > 0 || !existsSync(options.logPath))) {
      saveFrontierLog(options.logPath, result.session.log);
    }
    const out = [...opened.notes, ...result.lines];
    if (result.refused !== null) out.push(result.refused);
    out.push(frontierView(result.session));
    return { output: out.join('\n'), exitCode: result.refused === null ? 0 : 1 };
  } catch (error) {
    return { output: `play: ${(error as Error).message}`, exitCode: 1 };
  }
}
