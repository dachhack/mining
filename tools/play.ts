// Text play interface: play a run in a terminal, seeing only what the avatar
// could know. This is what playtest agents use (docs/agent-plan.md 3.1).
//
//   npm run play -- --help
//
// The work is in tools/play/: view.ts (what the player may see), describe.ts
// (wording), log.ts (the play log), cli.ts (arguments and the one-shot
// modes), help.ts (usage and rules). This file only prints, and runs the
// interactive prompt.

import { createInterface } from 'node:readline';

import { isRunActive } from '../src/engine';
import {
  openSession,
  parseArgs,
  runCli,
  saveLog,
  sessionView,
  splitChoices,
  takeChoices,
} from './play/cli';
import type { CliOptions } from './play/cli';

/** The interactive mode: print the view, read a choice, repeat. */
async function interactive(options: CliOptions): Promise<void> {
  const opened = openSession(options);
  const session = opened.session;
  if (options.logPath !== null && opened.isNew) {
    saveLog(options.logPath, session.log);
  }
  console.log([...opened.notes, sessionView(session, options)].join('\n'));

  const prompt = 'Choice (a number or a name from the list, or "q" to stop)> ';
  // `for await` reads the lines of standard input one at a time as they
  // arrive, and ends when the input is closed (Ctrl-D, or the end of a pipe).
  const lines = createInterface({ input: process.stdin });
  if (isRunActive(session.state)) {
    process.stdout.write(prompt);
  }
  for await (const line of lines) {
    if (!isRunActive(session.state)) {
      break;
    }
    const typed = line.trim().toLowerCase();
    if (typed === 'q' || typed === 'quit') {
      break;
    }
    const result = takeChoices(session, splitChoices(typed));
    if (options.logPath !== null && result.taken > 0) {
      saveLog(options.logPath, session.log);
    }
    const output = [...result.lines];
    if (result.refused !== null) {
      output.push(result.refused);
    }
    output.push(sessionView(session, options));
    console.log(output.join('\n'));
    if (!isRunActive(session.state)) {
      break;
    }
    process.stdout.write(prompt);
  }
  lines.close();
  if (options.logPath !== null) {
    console.log(`The run is saved in ${options.logPath}.`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let options: CliOptions | null = null;
  try {
    options = parseArgs(args);
  } catch {
    // `runCli` below reports the bad argument.
  }
  if (options !== null && options.interactive && !options.help && options.replayPath === null) {
    try {
      await interactive(options);
    } catch (error) {
      console.error(`play: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }
  // A refused choice still prints the view, so everything goes to standard
  // output, where the player is reading; only the exit code says it failed.
  const result = runCli(args);
  console.log(result.output);
  process.exitCode = result.exitCode;
}

void main();
