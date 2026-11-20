// One turn of play, shared by the text play tool (tools/play/cli.ts) and the
// web preview screen (src/app/preview.ts): take one choice and say in one
// line what it was and what came of it.

import { describeChoice, describeEvents } from './describe';
import { step } from './log';
import type { LogEntry, Session } from './log';

/**
 * Take `entry` (a listed choice, or a square action from squares.ts) and
 * return the line the play tool prints for it: "> what was chosen. What
 * happened.". Throws, changing nothing, if the entry is not legal (see
 * `step`).
 */
export function takeTurn(session: Session, entry: LogEntry): string {
  // The choice is described before it is taken: afterwards the state has
  // moved on.
  const text = describeChoice(session.state, entry);
  const events = step(session, entry);
  return `> ${text}. ${describeEvents(session.state, events).join(' ')}`.trimEnd();
}

/**
 * The same turn as `takeTurn`, as several lines, for a screen that can lay
 * them out: the first is "> what was chosen. What happened."; each line of a
 * list that came of it (a scan's "under x3 y4: ..." lines, which
 * `describeEvents` marks by starting them with two spaces) follows as a line
 * of its own, and anything said after the list as a last line.
 */
export function takeTurnLines(session: Session, entry: LogEntry): string[] {
  const text = describeChoice(session.state, entry);
  const events = step(session, entry);
  const told = describeEvents(session.state, events);
  const firstListLine = told.findIndex((line) => line.startsWith('  '));
  if (firstListLine === -1) {
    return [`> ${text}. ${told.join(' ')}`.trimEnd()];
  }
  const listed = told.filter((line) => line.startsWith('  ')).map((line) => line.trim());
  const before = told.slice(0, firstListLine);
  // What is not part of the list and comes after it started.
  const afterList = told.slice(firstListLine).filter((line) => !line.startsWith('  '));
  const lines = [`> ${text}. ${before.join(' ')}`.trimEnd(), ...listed];
  if (afterList.length > 0) {
    lines.push(afterList.join(' '));
  }
  return lines;
}
