// The play interface for the new game (Lab 2 becomes the game, plan B2): the
// view (what the player may know), the choices, the play log, and the
// one-shot modes. `runFrontierCli` does everything but the interactive
// prompt (tools/playFrontier.ts), and returns the text to print, so the
// tests can call it directly.
//
// A play log is JSON: { engineVersion, seed, steps }, where each step is one
// of the steps of tools/frontierRun.ts ("tap 3,4", "place 5,6", "upgrade 2",
// "demolish 1", "endShift", "rest 1", "sell wood 3", "close"). Only steps that did something
// are logged; an undone step is taken out of the log. Replaying the steps on
// the seed gives the same run, on the engine version the log names.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { BLOCKS, ITEMS, blockDefByCode } from '../../src/data';
import type { BlockId, ItemId, ItemStack } from '../../src/data';
import {
  FRONTIER_DEEP_CAMP,
  FRONTIER_DEFENSE,
  FRONTIER_PUMP,
  FRONTIER_DRILL,
  FRONTIER_MARKET,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_PEN,
  FRONTIER_RECIPES,
  FRONTIER_PHASES,
  FRONTIER_RUN,
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
  coinsHeld,
  createFrontier,
  depthAt,
  frontierTap,
  hashFrontier,
  marketIsOpen,
  levelNeededFor,
  toolNeededFor,
  lanternRefusal,
  defenseRefusal,
  makeRefusal,
  marketEvery,
  contractBoard,
  contractLimit,
  deliverRefusal,
  heldContracts,
  runPhase,
  takeRefusal,
  penRefusal,
  newlyCovered,
  nextMarketShift,
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
    flooded: 'That square is flooded: buy a pump at the market and tap the water to set it.',
    max: 'That camp has every level of defenses already.',
    level: 'Defenses go only at a camp of level 2 or more.',
    needsSword:
      'A dragon is there: only a sword drives it off ("make sword" at a smelter, or buy one at the market from a level-3 camp).',
    outside: 'That square is off the map.',
    neighbourHigher:
      'Too steep: a neighbour is more than 1 level higher. Mine the higher blocks first.',
    bottom: 'Nothing left to mine there.',
    place: 'A camp cannot go there now (see "look").',
    upgrade: 'That camp cannot be upgraded now.',
    demolish: 'That camp cannot be demolished: other camps must cover its 3 x 3 first.',
    market: 'The market is open: trade, then "leave" to start the day.',
    notYet:
      'The market does not sell that yet: tools from a level-3 camp, a camp kit, wood and apples after a tier-1 contract.',
    placeDeep: `A deep camp cannot go there now (see "look"): it needs the kit, wood and stone, and lit, level ground at depth ${FRONTIER_DEEP_CAMP.minDepth} or more.`,
    holding:
      "You hold as many contracts as your best camp's level allows: deliver or drop one first.",
    none: 'You hold no such contract.',
    hasPen: 'That camp has a pen already.',
    campLevel: "That camp's level is too low for it.",
    noPen: 'That camp has no pen: build one first ("pen N").',
    full: 'That pen is full.',
    empty: 'That pen holds no animals.',
    closed: 'The market is not open: it opens only after the night before a market day.',
    unknown: 'The market does not trade that item that way.',
    lots: 'Trade a whole number of lots, 1 or more.',
    cost: 'You do not hold enough for that.',
  };
  return texts[refusal ?? ''] ?? `Refused: ${refusal ?? 'unknown'}.`;
}

/** Why a sapling cannot be planted, in words for the player. */
function plantText(refusal: string | null): string {
  const texts: Record<string, string> = {
    unknown: 'Only a sapling or an apple sapling can be planted.',
    cost: 'You hold none of those.',
    notShown: 'That square is not lit by a camp.',
    camp: 'A camp stands there.',
    animal: 'An animal stands there.',
    ground: 'Saplings grow only on dirt at the surface, never on ground that was mined.',
    occupied: 'Something grows there already, or a sapling is planted.',
    noTaps: 'No taps left this shift: end the shift ("end").',
    over: 'The run is over.',
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

/** "iron drill" or "steel drill": a tool's name for the player. */
function toolName(item: string): string {
  return item === FRONTIER_DRILL.item ? 'iron drill' : itemName(item);
}

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
    report.born > 0 ? `${report.born} animal(s) born in pens` : '',
    report.grassRegrown > 0 ? `grass grew back on ${report.grassRegrown} square(s)` : '',
    report.rained ? `it rained: ${report.rainFilled} low square(s) filled` : '',
    report.burned > 0
      ? `fire burned out ${report.burned} square(s)${report.campUpgradesBurned > 0 ? ` (camps lost ${report.campUpgradesBurned} upgrade(s))` : ''}${report.fireSpread > 0 ? ` and spread to ${report.fireSpread} more` : ''}`
      : '',
    report.raid === null
      ? ''
      : report.raid.turnedAway
        ? `marauders (strength ${report.raid.strength}) were turned away from camp ${report.raid.campId}`
        : `marauders (strength ${report.raid.strength}) raided camp ${report.raid.campId} (defenses ${report.raid.defense}): stole ${stacksText(report.raid.stolen) || 'nothing'}, ${report.raid.upgradesLost} upgrade(s) torn down`,
    report.dragonCame ? 'a dragon flew in' : '',
    report.dragonAte > 0 ? `a dragon ate ${report.dragonAte} animal(s)` : '',
    report.dragonApples > 0 ? `a dragon ate ${report.dragonApples} apple(s)` : '',
    report.dragonFires > 0 ? 'a dragon set a fire' : '',
    report.drained > 0
      ? `pumps drained ${report.drained} flooded square(s)${report.pumpsBack > 0 ? `, ${report.pumpsBack} pump(s) back in the store` : ''}`
      : '',
  ].filter((t) => t !== '');
  const end =
    state.status === 'lost'
      ? ' The crew is lost: the run is over.'
      : state.status === 'finished'
        ? ` That was the last shift: the run is over. Score: ${coinsHeld(state)} coins.`
        : report.marketOpens
          ? ' Market day: the market is open this shift.'
          : '';
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
    if (action.kind === 'plant') why = plantText(outcome.refusal);
    if (tap?.kind === 'tooHard') {
      why =
        tap.needs !== null
          ? `Too hard: it needs a level ${tap.needs} camp over it.`
          : tap.needsTool !== null
            ? `Too hard: it needs a ${toolName(tap.needsTool)} in your store (buy one at the market).`
            : 'Nothing can mine that block.';
    }
    return { session, refused: why, lines: [] };
  }
  const steps = [...session.log.steps, step];
  // Closing the market starts a new undo log too (undo.ts).
  const newShift =
    action.kind === 'endShift' ||
    action.kind === 'rest' ||
    action.kind === 'close' ||
    action.kind === 'closeMarket';
  const next: FrontierSession = {
    log: { ...session.log, steps },
    state: outcome.state,
    shiftLog: log,
    shiftStart: newShift ? steps.length : session.shiftStart,
  };
  const lines: string[] = [];
  if (outcome.tap !== null && outcome.tap.kind === 'dragon') {
    lines.push(`${step}: you drove the dragon off with your sword.`);
  } else if (outcome.tap !== null && outcome.tap.kind === 'fire') {
    const left = outcome.state.hazards.fires.filter((f) => f).length;
    lines.push(`${step}: fire put out; ${left} still burning.`);
  } else if (outcome.tap !== null && outcome.tap.kind === 'pump') {
    lines.push(
      outcome.tap.pump === 'set'
        ? `${step}: pump set; it drains ${FRONTIER_PUMP.drainPerShift} flooded squares a night, then comes back to your store.`
        : `${step}: pump picked up.`,
    );
  } else if (outcome.tap !== null) {
    const gain = outcome.tap.gain.length > 0 ? `+${stacksText(outcome.tap.gain)}` : 'nothing';
    const what = TAP_DONE[outcome.tap.harvest ?? 'mined'] ?? 'done';
    const water =
      outcome.tap.flooded.length > 0
        ? ` You hit water: ${outcome.tap.flooded.length} square(s) flooded.`
        : '';
    const gas =
      outcome.tap.gas === 'exploded'
        ? ` Gas exploded: ${outcome.tap.blown.length} block(s) blown away, ${outcome.tap.fires.length} fire(s) started (tap each to put it out).`
        : outcome.tap.gas === 'vented'
          ? ' A gas pocket vented harmlessly.'
          : '';
    lines.push(`${step}: ${what}, ${gain}.${water}${gas}`);
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
 * "rest 1" (or "rest" with one camp), "sell wood 3", "buy animal 1",
 * "plant 3,4 sapling", "take t1-coal", "deliver t1-coal", "drop t1-coal", "deep 3,4",
 * "close", "undo", or the number of a listed choice.
 */
export function stepOf(typed: string, listed: FrontierStep[]): FrontierStep | null {
  const text = typed.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^\d+$/.test(text)) {
    return listed[Number(text) - 1] ?? null;
  }
  const square = /^(tap|t|place|p|deep) (\d+)[ ,]+(\d+)$/.exec(text);
  if (square !== null) {
    const verbs: Record<string, string> = { t: 'tap', p: 'place', deep: 'placeDeep' };
    const verb = verbs[square[1] ?? ''] ?? square[1] ?? '';
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
  const pen = /^(pen|buildpen|penin|penout) (\d+)$/.exec(text);
  if (pen !== null) {
    const verbs: Record<string, string> = {
      pen: 'buildPen',
      buildpen: 'buildPen',
      penin: 'penIn',
      penout: 'penOut',
    };
    return `${verbs[pen[1] ?? ''] ?? ''} ${pen[2] ?? ''}`;
  }
  const defend = /^(defend|defense|defence|builddefense) (\d+)$/.exec(text);
  if (defend !== null) {
    return `buildDefense ${defend[2] ?? ''}`;
  }
  const lantern = /^(lantern|hang|hang lantern|hanglantern) (\d+)$/.exec(text);
  if (lantern !== null) {
    return `hangLantern ${lantern[2] ?? ''}`;
  }
  const plantStep = /^plant (\d+)[ ,]+(\d+) ([a-z]+)$/.exec(text);
  if (plantStep !== null) {
    // "sapling" or "applesapling" (the typed text is lower case).
    const item = ['sapling', 'appleSapling'].find((id) => id.toLowerCase() === plantStep[3]);
    return item === undefined ? null : `plant ${plantStep[1] ?? ''},${plantStep[2] ?? ''} ${item}`;
  }
  const tradeStep = /^(sell|buy) ([a-z]+) (\d+)$/.exec(text);
  if (tradeStep !== null) {
    // Item ids are camelCase ("rawIronOre"); the typed text is lower case.
    const lots = tradeStep[1] === 'sell' ? FRONTIER_MARKET.sellPrices : FRONTIER_MARKET.buyPrices;
    const lot = lots.find((l) => l.item.toLowerCase() === tradeStep[2]);
    return lot === undefined ? null : `${tradeStep[1] ?? ''} ${lot.item} ${tradeStep[3] ?? ''}`;
  }
  const take = /^take ([a-z0-9-]+)$/.exec(text);
  if (take !== null) {
    return `takeContract ${take[1] ?? ''}`;
  }
  const contractVerb = /^(deliver|drop) ([a-z0-9-]+)$/.exec(text);
  if (contractVerb !== null) {
    return `${contractVerb[1] === 'drop' ? 'dropContract' : 'deliver'} ${contractVerb[2] ?? ''}`;
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
    leave: 'closeMarket',
    'close market': 'closeMarket',
    'leave market': 'closeMarket',
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
  // While the market is open, only its choices: the board, and leaving.
  if (state.marketOpen) {
    for (const offer of contractBoard(state)) {
      if (takeRefusal(state, offer.id) === null) steps.push(`takeContract ${offer.id}`);
    }
    return [...steps, 'closeMarket', 'close'];
  }
  if (state.tapsLeft > 0) {
    for (const camp of state.camps) {
      if (act(session, `upgrade ${camp.id}`).refused === null) steps.push(`upgrade ${camp.id}`);
      if (act(session, `demolish ${camp.id}`).refused === null) steps.push(`demolish ${camp.id}`);
      if (smelterRefusal(state, camp.id) === null) steps.push(`buildSmelter ${camp.id}`);
      if (lanternRefusal(state, camp.id) === null) steps.push(`hangLantern ${camp.id}`);
      if (defenseRefusal(state, camp.id) === null) steps.push(`buildDefense ${camp.id}`);
      for (const kind of ['buildPen', 'penIn', 'penOut'] as const) {
        if (penRefusal(state, kind, camp.id) === null) steps.push(`${kind} ${camp.id}`);
      }
    }
    for (const recipe of FRONTIER_RECIPES) {
      if (makeRefusal(state, recipe.id) === null) steps.push(`make ${recipe.id}`);
    }
    for (const offer of contractBoard(state)) {
      if (takeRefusal(state, offer.id) === null) steps.push(`takeContract ${offer.id}`);
    }
    for (const c of state.contracts) {
      if (deliverRefusal(state, c.id) === null) steps.push(`deliver ${c.id}`);
      steps.push(`dropContract ${c.id}`);
    }
    if (canAfford(state.inventory, FRONTIER_DEEP_CAMP.cost)) {
      // The deepest places for a deep camp, deepest first (ties row by row).
      const deeps: { step: FrontierStep; depth: number }[] = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          if (placeRefusal(state, x, y, true) === null) {
            deeps.push({ step: `placeDeep ${x},${y}`, depth: depthAt(state.cube, x, y) });
          }
        }
      }
      deeps.sort((a, b) => b.depth - a.depth);
      steps.push(...deeps.slice(0, LISTED_PLACES).map((p) => p.step));
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
  const flooded = state.hazards.flooded[i] === true;
  if (state.hazards.dragons.some((d) => d.x === x && d.y === y)) first = 'D';
  else if (state.hazards.fires[i] === true) first = '*';
  else if (animalAt(state, x, y) !== null) first = 'm';
  else if (flooded) first = state.hazards.pumps.some((p) => p.x === x && p.y === y) ? 'P' : '~';
  else if (camp !== null) first = camp.x === x && camp.y === y ? String(camp.id % 10) : '+';
  else if (state.features[i] === GRASS) first = '"';
  else if (state.features[i] === TREE) first = 'T';
  else if (state.features[i] === APPLE_TREE) first = (state.apples[i] ?? 0) > 0 ? 'A' : 'a';
  else if (state.planted[i] === true) first = 's';
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
        : state.status === 'finished'
          ? ' · RUN OVER: the last shift is done'
          : ' · RUN OVER: mine closed';
  lines.push(
    `Seed ${state.seed} · Shift ${state.shift}/${FRONTIER_RUN.shifts} · Coins ${coinsHeld(state)} · Taps ${state.tapsLeft}/${FRONTIER_SHIFT.taps} · Health ${state.health}/${FRONTIER_SHIFT.startHealth} · Dug ${state.mined}${status}`,
  );
  const held = [...state.inventory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  lines.push(
    `Held: ${held.length === 0 ? 'nothing' : held.map(([item, n]) => `${n} ${itemName(item)}`).join(', ')}`,
  );
  lines.push(
    `Upkeep at the end of this shift: ${stacksText(upkeepDue(state.shift, state.camps.length)) || 'nothing'}`,
  );
  lines.push(`New camp costs ${stacksText(FRONTIER_NEW_CAMP_COST)}.`);
  lines.push(...goalLines(state));
  lines.push(...marketLines(state));
  for (const camp of state.camps) {
    const cost = upgradeCostFrom(camp.level);
    const up = cost === null ? 'top level' : `upgrade costs ${stacksText(cost)}`;
    const smelter = camp.smelter
      ? '; a smelter'
      : camp.level >= FRONTIER_SMELTER.minLevel
        ? `; a smelter costs ${stacksText(FRONTIER_SMELTER.cost)}`
        : '';
    const lantern = camp.lantern ? '; a lantern' : '';
    const defense =
      camp.defense > 0 ? `; defenses ${camp.defense}/${FRONTIER_DEFENSE.length}` : '; no defenses';
    const pen = camp.pen
      ? `; a pen of ${camp.penned}/${FRONTIER_PEN.capacity}${camp.breedIn > 0 ? `, an animal born in ${camp.breedIn} shift(s) for ${FRONTIER_PEN.hayPerBirth} hay` : ''}`
      : '';
    lines.push(
      `${camp.deep ? 'Deep camp' : 'Camp'} ${camp.id} at ${camp.x},${camp.y}: level ${camp.level}, ring ${campRing(camp)}; ${camp.deep ? 'never upgraded' : up}${smelter}${lantern}${pen}${defense}.`,
    );
  }
  lines.push('', ...mapLines(state), '');
  lines.push(
    'Map: two characters a square: what is on it, then its depth. ?? fog, -- out of range now.',
    '  m animal  " grass  T tree  A apple tree (a: no apples)  s sapling  N camp N\'s middle  + camp ground',
    '  . dirt  # stone  k clay  o coal  H hard rock  i iron  u copper  x crystal  R rubble  _ nothing left',
    '  ~ flooded  P pump on the water  * fire  D dragon',
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

/** "5 grass for 1 coin" for each lot. */
function lotsText(lots: { item: string; count: number; coins: number }[]): string {
  return lots.map((l) => `${l.count} ${l.item} for ${l.coins}`).join(', ');
}

/** The phase, its goal, the contract held, and contracts done. */
function goalLines(state: FrontierState): string[] {
  const phase = runPhase(state);
  const goal = FRONTIER_PHASES[phase - 1] ?? { title: '', next: '' };
  const lines = [`Phase ${phase} of 5: ${goal.title}. Next: ${goal.next}`];
  const held = heldContracts(state);
  lines.push(`Contracts held: ${held.length} of ${contractLimit(state)} (your best camp's level).`);
  for (const c of held) {
    const ready = deliverRefusal(state, c.id) === null ? ` READY: "deliver ${c.id}".` : '';
    lines.push(
      `  Contract ${c.id}: ${c.name} (tier ${c.tier}): ${stacksText(c.asks)} for ${c.pays} coins.${ready} "drop ${c.id}" gives it up.`,
    );
  }
  const done = state.contractsDone;
  if (done.some((n) => n > 0)) {
    lines.push(
      `Contracts done: tier 1 ${done[0] ?? 0}, tier 2 ${done[1] ?? 0}, tier 3 ${done[2] ?? 0}.`,
    );
  }
  return lines;
}

/** The market: open today, with its prices, or when it opens next. */
function marketLines(state: FrontierState): string[] {
  if (state.status !== 'active') return [];
  if (!marketIsOpen(state)) {
    return [
      `Market: opens after the night before shift ${nextMarketShift(state)} (every ${marketEvery(state)} shifts with your best camp).`,
    ];
  }
  return [
    'Market: OPEN, before the day. "sell ITEM N" or "buy ITEM N" trades N lots, "take ID" a contract; no taps. "leave" starts the day.',
    `  Sell (coins a lot): ${lotsText(FRONTIER_MARKET.sellPrices)}.`,
    `  Buy (coins a lot): ${lotsText(FRONTIER_MARKET.buyPrices)}.`,
    ...contractBoard(state).map(
      (c) =>
        `  Contract "take ${c.id}" (tier ${c.tier}, ${c.name}): ${stacksText(c.asks)} for ${c.pays} coins.`,
    ),
  ];
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
    const tool = toolNeededFor(code);
    const how =
      needs !== null
        ? `a level ${needs} camp mines it`
        : tool !== null
          ? `any camp mines it with a ${toolName(tool)}`
          : 'nothing mines it';
    parts.push(`top block ${blockDefByCode(code).name} (${how})`);
  }
  const i = x + size.x * y;
  const feature = state.features[i];
  if (feature === GRASS) parts.push('grass on it');
  if (feature === TREE) parts.push('a tree on it');
  if (feature === APPLE_TREE) parts.push(`an apple tree with ${state.apples[i] ?? 0} apple(s)`);
  const stump = state.stumps[i] ?? NO_FEATURE;
  if (stump !== NO_FEATURE) {
    const tree = stump === APPLE_TREE ? 'an apple tree' : 'a tree';
    const what = state.planted[i] === true ? 'a sapling' : 'a stump';
    parts.push(`${what}: ${tree} grows in ${state.regrowIn[i] ?? 0} shift(s)`);
  }
  if ((state.grassIn[i] ?? -1) >= 0) {
    parts.push(
      `cut grass: it grows back in ${state.grassIn[i] ?? 0} shift(s) if grass grows beside it`,
    );
  }
  if (animalAt(state, x, y) !== null) parts.push('an animal on it');
  if (state.hazards.dragons.some((d) => d.x === x && d.y === y))
    parts.push('a dragon on it (a tap with a sword drives it off)');
  if (state.hazards.fires[i] === true) parts.push('on fire (a tap puts it out)');
  if (state.hazards.flooded[i] === true) {
    const pumped = state.hazards.pumps.some((p) => p.x === x && p.y === y);
    parts.push(pumped ? 'flooded, with a pump draining it' : 'flooded');
  }
  const camp = campAt(state.camps, x, y);
  if (camp !== null) parts.push(`camp ${camp.id}'s ground`);
  const tap = frontierTap(state, x, y);
  const would =
    tap.kind === 'dragon'
      ? 'a tap would drive the dragon off'
      : tap.kind === 'fire'
        ? 'a tap would put the fire out'
        : tap.kind === 'pump'
          ? `a tap would ${tap.pump === 'set' ? 'set a pump' : 'pick up the pump'}`
          : tap.kind === 'mined' || tap.kind === 'harvested'
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
