// The command line of the play interface: reading the arguments, loading and
// saving the play log, and the one-shot modes. `runCli` does everything
// except the interactive prompt (that is in ../play.ts), and returns the text
// to print instead of printing it, so the tests can call it directly.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../../src/data';
import { ENGINE_VERSION, hashState, isRunActive } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { choiceName } from '../../src/app/text/describe';
import { helpText } from './help';
import {
  END_SHIFT,
  listedChoices,
  logFromText,
  logToText,
  newSession,
  replayLog,
} from '../../src/app/text/log';
import type { LogEntry, PlayLog, Session } from '../../src/app/text/log';
import { cutChoice, mineChoice, parseSquareChoice } from '../../src/app/text/squares';
import { takeTurn } from '../../src/app/text/turn';
import { buildView, renderView } from '../../src/app/text/view';

/** What the command line asked for. `null` means "not given". */
export interface CliOptions {
  help: boolean;
  interactive: boolean;
  seed: number | null;
  logPath: string | null;
  replayPath: string | null;
  /** The choices of `--do`, split at the commas. */
  choices: string[];
  loadoutId: string;
}

export interface CliResult {
  output: string;
  /** 0 for success; 1 if something was refused or went wrong. */
  exitCode: number;
}

const USAGE_HINT = 'Run "npm run play -- --help" for usage and the rules.';

/** Read the arguments. Throws an `Error` with a message for the user on a bad one. */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    interactive: false,
    seed: null,
    logPath: null,
    replayPath: null,
    choices: [],
    loadoutId: DEFAULT_LOADOUT_ID,
  };

  // The value that follows the option at position `i`.
  function valueAfter(i: number): string {
    const value = args[i + 1];
    if (value === undefined) {
      throw new Error(`${args[i] ?? ''} needs a value`);
    }
    return value;
  }
  function wholeNumber(i: number): number {
    const text = valueAfter(i);
    if (!/^\d+$/.test(text)) {
      throw new Error(`${args[i] ?? ''} must be a whole number, but is ${text}`);
    }
    return Number(text);
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--seed') {
      options.seed = wholeNumber(i);
      i += 1;
    } else if (arg === '--log') {
      options.logPath = valueAfter(i);
      i += 1;
    } else if (arg === '--replay') {
      options.replayPath = valueAfter(i);
      i += 1;
    } else if (arg === '--do') {
      options.choices = splitChoices(valueAfter(i));
      i += 1;
    } else if (arg === '--loadout') {
      options.loadoutId = valueAfter(i);
      i += 1;
    } else {
      throw new Error(`unknown argument ${arg ?? ''}`);
    }
  }
  return options;
}

/**
 * Split a chain of choices at its commas:
 * "mine 3,4, cut 5,6,end" -> ["mine 3,4", "cut 5,6", "end"].
 *
 * A square is written with a comma too ("mine 3,4"), so a comma that stands
 * between the two numbers of a mine or a cut is not a break. A semicolon is
 * always a break, for anyone who would rather not rely on that.
 */
export function splitChoices(text: string): string[] {
  // The pattern matches, from left to right, either a whole square choice
  // ("mine 3 , 4") or a run of characters with no comma or semicolon in it.
  // The `g` flag makes `match` return every match, not just the first.
  const pieces = text.toLowerCase().match(/ *(?:mine|cut)[ -]*\d+ *, *\d+|[^,;]+/g) ?? [];
  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== '');
}

/** What a typed choice stands for: the entry to take, or why it is refused. */
export interface ResolvedChoice {
  entry: LogEntry | null;
  /** Why the choice is refused; `null` when `entry` is set. */
  refusal: string | null;
}

/**
 * The entry a typed choice stands for, or the reason it is refused.
 *
 * - "mine 3,4" and "cut 3,4" name a square. A refused one says why (a tree,
 *   the level rule and which neighbours are too high, too little AP, ...):
 *   see squares.ts.
 * - 1, 2, ... are the lines of the action list in order, and 0 ends the
 *   shift.
 * - A name ("craft-fuel", "close-mine", "end") is the line of the list that has
 *   that name now. If there is none, the choice is refused: a name never
 *   stands for some other action.
 */
export function resolveChoice(state: GameState, choice: string): ResolvedChoice {
  if (!isRunActive(state)) {
    return { entry: null, refusal: 'The run has ended.' };
  }
  const square = parseSquareChoice(choice);
  if (square !== null) {
    return square.kind === 'mine'
      ? mineChoice(state, square.x, square.y)
      : cutChoice(state, square.x, square.y);
  }
  const listed = listedChoices(state);
  // "End shift" is the last entry of `listed`; the numbered lines are the rest.
  const numbered = listed.filter((entry) => entry.type !== END_SHIFT.type);
  let found: LogEntry | undefined;
  if (choice === '0') {
    found = END_SHIFT;
  } else if (/^\d+$/.test(choice)) {
    // An index past the end of the list gives `undefined`.
    found = numbered[Number(choice) - 1];
  } else {
    // `find` gives `undefined` when nothing matches.
    found = listed.find((entry) => choiceName(entry) === choice);
  }
  if (found !== undefined) {
    return { entry: found, refusal: null };
  }
  return {
    entry: null,
    refusal:
      'It is not a choice as things stand now. Type "mine X,Y" or "cut X,Y" for a square, ' +
      `a number from 1 to ${numbered.length} or a name from the list, or 0 / end to end the shift.`,
  };
}

/** What `takeChoices` did. */
export interface ChoicesResult {
  /** One line for each choice taken: what it was and what happened. */
  lines: string[];
  /** How many choices were taken. */
  taken: number;
  /** Why it stopped early, or `null` if every choice was taken. */
  refused: string | null;
}

/**
 * Take the choices in order, stopping at the first that is refused.
 * Choices before it stay taken (and in the log); it and the rest are not.
 */
export function takeChoices(session: Session, choices: string[]): ChoicesResult {
  const lines: string[] = [];
  let taken = 0;
  for (const choice of choices) {
    const position = `choice ${taken + 1} of ${choices.length} ("${choice}")`;
    if (!isRunActive(session.state)) {
      return { lines, taken, refused: `Refused ${position}: the run has ended.` };
    }
    const resolved = resolveChoice(session.state, choice);
    if (resolved.entry === null) {
      return {
        lines,
        taken,
        refused: `Refused ${position}: ${resolved.refusal ?? ''} Nothing was done from it on.`,
      };
    }
    lines.push(takeTurn(session, resolved.entry));
    taken += 1;
  }
  return { lines, taken, refused: null };
}

/** The current view of a session, as text. */
export function sessionView(session: Session): string {
  return renderView(buildView(session.state, { deepestDepth: session.deepestDepth }));
}

/**
 * Save the log, creating its folder if need be. It is written to a second file which then replaces the
 * first, so a crash part-way cannot leave half a log behind.
 */
export function saveLog(path: string, log: PlayLog): void {
  // The playtest brief saves logs in a round folder that may not exist yet.
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, logToText(log));
  renameSync(temporary, path);
}

/** Read a log file. Throws an `Error` with a message for the user. */
export function loadLog(path: string): PlayLog {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`cannot read the log ${path}. Start a run with --seed N --log ${path}`);
  }
  try {
    return logFromText(text);
  } catch (error) {
    throw new Error(`cannot use the log ${path}: ${messageOf(error)}`, { cause: error });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A session, and the lines to print before its first view. */
export interface OpenedSession {
  session: Session;
  isNew: boolean;
  notes: string[];
}

/**
 * Start a new run (`--seed`) or carry on the one in the log (`--log` alone).
 * Throws an `Error` with a message for the user.
 */
export function openSession(options: CliOptions): OpenedSession {
  const contractId = CONTRACT_IDS[0];
  if (contractId === undefined) {
    throw new Error('the data lists no contract');
  }
  if (options.seed !== null) {
    if (options.logPath !== null && existsSync(options.logPath)) {
      throw new Error(
        `${options.logPath} already exists. To carry on that run, leave out --seed; ` +
          'to start afresh, choose another file name or delete it.',
      );
    }
    const session = newSession(options.seed, contractId, options.loadoutId);
    return { session, isNew: true, notes: [`New run: seed ${options.seed}.`] };
  }
  if (options.logPath === null) {
    throw new Error('give --seed N to start a run, or --log FILE to carry one on');
  }
  const log = loadLog(options.logPath);
  const notes: string[] = [];
  if (log.engineVersion !== ENGINE_VERSION) {
    notes.push(
      `Note: this log was written by engine ${log.engineVersion}; this is engine ${ENGINE_VERSION}.`,
    );
  }
  let session: Session;
  try {
    session = replayLog(log);
  } catch (error) {
    throw new Error(`cannot use the log ${options.logPath}: ${messageOf(error)}`, { cause: error });
  }
  return { session, isNew: false, notes };
}

/** `--replay FILE`: replay a log and report where it ends. */
function replayReport(path: string): CliResult {
  const log = loadLog(path);
  const session = replayLog(log);
  const hash = hashState(session.state);
  const status = session.state.status;
  const lines = [
    `Replayed ${log.actions.length} choices from ${path} ` +
      `(seed ${log.seed}, contract ${log.contractId}, loadout ${log.loadoutId}, ` +
      `log engine ${log.engineVersion}, this engine ${ENGINE_VERSION}).`,
    `Final state hash: ${hash}`,
    status.kind === 'ended'
      ? `Outcome: ${status.outcome} (${status.cause})`
      : 'Outcome: none yet (the run is still going)',
  ];
  // If the log recorded how the run ended, the replay must end the same way.
  let exitCode = 0;
  if (log.outcome !== null) {
    if (log.outcome.stateHash === hash) {
      lines.push('This matches the outcome recorded in the log.');
    } else {
      lines.push(`MISMATCH: the log recorded final state hash ${log.outcome.stateHash}.`);
      if (log.engineVersion !== ENGINE_VERSION) {
        // The usual cause, so say it plainly rather than leave it to the
        // version numbers in the first line.
        lines.push(
          `This is expected: the log was played on engine ${log.engineVersion} and this is engine ` +
            `${ENGINE_VERSION}. A play log replays to its recorded hash only on the engine version it names.`,
        );
      }
      exitCode = 1;
    }
  }
  return { output: lines.join('\n'), exitCode };
}

/**
 * Run one command and return what to print. Handles every mode except the
 * interactive prompt.
 */
export function runCli(args: string[]): CliResult {
  try {
    const options = parseArgs(args);
    if (options.help) {
      return { output: helpText(), exitCode: 0 };
    }
    // Every tool checks the data tables before using them (0005 item 24).
    const problems = validateData(GAME_DATA);
    if (problems.length > 0) {
      throw new Error(`the data in src/data is not valid:\n  ${problems.join('\n  ')}`);
    }
    if (options.replayPath !== null) {
      return replayReport(options.replayPath);
    }

    const opened = openSession(options);
    const result = takeChoices(opened.session, options.choices);
    // Save only when there is something new to save, so that looking at the
    // view, or a refused choice, never rewrites the file.
    if (options.logPath !== null && (opened.isNew || result.taken > 0)) {
      saveLog(options.logPath, opened.session.log);
    }
    const lines = [...opened.notes, ...result.lines];
    if (opened.isNew && options.logPath === null) {
      lines.unshift('Nothing is saved without a log: add --log FILE to be able to play on.');
    }
    if (result.refused !== null) {
      lines.push(result.refused);
    }
    lines.push(sessionView(opened.session));
    return { output: lines.join('\n'), exitCode: result.refused === null ? 0 : 1 };
  } catch (error) {
    return { output: `play: ${messageOf(error)}\n${USAGE_HINT}`, exitCode: 1 };
  }
}
