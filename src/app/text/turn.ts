// One turn of play, shared by the text play tool (tools/play/cli.ts) and the
// web preview screen (src/app/preview.ts): take one choice and say in one
// line what it was and what came of it.

import { describeChoice, describeEvents } from './describe';
import { step } from './log';
import type { LogEntry, Session } from './log';

/**
 * Take `entry` (it must be on the menu now) and return the line the play
 * tool prints for it: "> what was chosen. What happened.". Throws, changing
 * nothing, if the entry is not legal (see `step`).
 */
export function takeTurn(session: Session, entry: LogEntry): string {
  // The choice is described before it is taken: afterwards the state has moved on.
  const text = describeChoice(session.state, entry);
  const events = step(session, entry);
  return `> ${text}. ${describeEvents(session.state, events).join(' ')}`.trimEnd();
}
