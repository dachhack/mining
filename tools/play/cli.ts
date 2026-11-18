// The command line of the play interface: reading the arguments, loading and
// saving the play log, and the one-shot modes. `runCli` does everything
// except the interactive prompt (that is in ../play.ts), and returns the text
// to print instead of printing it, so the tests can call it directly.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { CONTRACT_IDS, DEFAULT_LOADOUT_ID, GAME_DATA, validateData } from '../../src/data';
import { ENGINE_VERSION, hashState, isRunActive, legalActions } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { describeChoice, describeEvents } from './describe';
import { helpText } from './help';
import { END_SHIFT, logFromText, logToText, newSession, replayLog, step } from './log';
import type { LogEntry, PlayLog, Session } from './log';
import { DEFAULT_LAYERS, DEFAULT_RADIUS, buildView, renderView } from './view';

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
  radius: number;
  layers: number;
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
    radius: DEFAULT_RADIUS,
    layers: DEFAULT_LAYERS,
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
    } else if (arg === '--radius') {
      options.radius = wholeNumber(i);
      i += 1;
    } else if (arg === '--layers') {
      options.layers = wholeNumber(i);
      i += 1;
    } else {
      throw new Error(`unknown argument ${arg ?? ''}`);
    }
  }
  return options;
}

/** "3, 1,end" -> ["3", "1", "end"]. */
export function splitChoices(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '');
}

/**
 * The menu entry a typed choice stands for, or `null` if it is not on the
 * list: "end" or 0 ends the shift, and 1, 2, ... are the engine's legal
 * actions in order, exactly as the view numbers them.
 */
export function resolveChoice(state: GameState, choice: string): LogEntry | null {
  if (!isRunActive(state)) {
    return null;
  }
  if (choice === 'end' || choice === '0') {
    return END_SHIFT;
  }
  if (!/^\d+$/.test(choice)) {
    return null;
  }
  // An index past the end of the list gives `undefined`, hence the `??`.
  return legalActions(state)[Number(choice) - 1] ?? null;
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
 * Take the choices in order, stopping at the first that is not on the list.
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
    const entry = resolveChoice(session.state, choice);
    if (entry === null) {
      const count = legalActions(session.state).length;
      return {
        lines,
        taken,
        refused:
          `Refused ${position}: it is not on the action list ` +
          `(1 to ${count}, or 0 / end to end the shift). Nothing was done from it on.`,
      };
    }
    const text = describeChoice(session.state, entry);
    const events = step(session, entry);
    lines.push(`> ${text}. ${describeEvents(session.state, events).join(' ')}`.trimEnd());
    taken += 1;
  }
  return { lines, taken, refused: null };
}

/** The current view of a session, as text. */
export function sessionView(session: Session, options: CliOptions): string {
  const view = buildView(session.state, {
    radius: options.radius,
    layers: options.layers,
    deepestZ: session.deepestZ,
  });
  return renderView(view);
}

/**
 * Save the log. It is written to a second file which then replaces the
 * first, so a crash part-way cannot leave half a log behind.
 */
export function saveLog(path: string, log: PlayLog): void {
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
    lines.push(sessionView(opened.session, options));
    return { output: lines.join('\n'), exitCode: result.refused === null ? 0 : 1 };
  } catch (error) {
    return { output: `play: ${messageOf(error)}\n${USAGE_HINT}`, exitCode: 1 };
  }
}
