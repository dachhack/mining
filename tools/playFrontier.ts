// The text play interface of the new game (plan B2): play a run in a
// terminal, seeing only what the player could know. Playtest agents use it
// (docs/agents/playtester.md).
//
//   npm run play -- --help
//
// The view, the choices, the play log and the one-shot modes are in
// tools/play/frontierCli.ts; this file runs the interactive prompt.

import { createInterface } from 'node:readline';

import {
  frontierView,
  openFrontierSession,
  parseFrontierArgs,
  runFrontierCli,
  saveFrontierLog,
  takeFrontierChoices,
} from './play/frontierCli';

async function interactive(args: string[]): Promise<void> {
  const options = parseFrontierArgs(args);
  const opened = openFrontierSession(options);
  let session = opened.session;
  if (options.logPath !== null) saveFrontierLog(options.logPath, session.log);
  console.log([...opened.notes, frontierView(session)].join('\n'));
  const prompt = 'Choice (a number, "tap X,Y", "end", "look X,Y", or "q" to stop)> ';
  // `for await` reads standard input a line at a time, until it is closed.
  const lines = createInterface({ input: process.stdin });
  process.stdout.write(prompt);
  for await (const line of lines) {
    const typed = line.trim();
    if (typed === 'q' || typed === 'quit') break;
    const result = takeFrontierChoices(session, typed.split(';'));
    session = result.session;
    if (options.logPath !== null && result.taken > 0) saveFrontierLog(options.logPath, session.log);
    const out = [...result.lines];
    if (result.refused !== null) out.push(result.refused);
    out.push(frontierView(session));
    console.log(out.join('\n'));
    if (session.state.status !== 'active') break;
    process.stdout.write(prompt);
  }
  lines.close();
  if (options.logPath !== null) console.log(`The run is saved in ${options.logPath}.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let wantsPrompt = false;
  try {
    const options = parseFrontierArgs(args);
    wantsPrompt = options.interactive && !options.help && options.replayPath === null;
  } catch {
    // runFrontierCli reports the bad argument.
  }
  if (wantsPrompt) {
    await interactive(args);
    return;
  }
  const result = runFrontierCli(args);
  console.log(result.output);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  console.error(`play: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
