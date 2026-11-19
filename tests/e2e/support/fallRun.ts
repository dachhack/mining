// A run built for the e2e test of a risky tap (review of PR #79): seed 7,
// played by named choices (the names of `npm run play`) until the miner
// stands on the surface at x16 y16 over a block with a known gap under it.
// The miner dug a stair down south-west of there and opened the cell under
// that block from the side, then climbed back out. Digging down now is a
// fall the forecast knows will hurt ("you will fall 2 blocks and lose 2
// health"), so a tap on the miner's own cell needs a second tap. The run is
// played through the engine here, so a rule change that breaks the route
// fails loudly (a name not on the list) instead of passing silently.

import { isRunActive } from '../../../src/engine';
import { startRun } from '../../../src/app/previewSession';
import { choiceName } from '../../../src/app/text/describe';
import { logToText, menuChoices } from '../../../src/app/text/log';
import { takeTurn } from '../../../src/app/text/turn';

/** The route, as `npm run play` names the choices (one shift = 5 AP). */
const ROUTE = [
  // Shift 1: south, west, dig down to layer 0, mine east and step into it.
  's',
  'w',
  'mine-down',
  'mine-e',
  'e',
  'end',
  // Shift 2: dig down to layer 1, open the cell north (under x16 y16's
  // block), then step up west twice, back to the surface.
  'mine-down',
  'mine-n',
  'w',
  'w',
  'end',
  // Shift 3: walk round to x16 y16 on the surface.
  'n',
  'e',
  'e',
];

export interface FallRun {
  /** The play log, as the preview saves it. */
  logText: string;
  /** The miner's position: on the surface, over the block whose dig hurts. */
  miner: { x: number; y: number; z: number };
}

export function fallRun(): FallRun {
  const session = startRun(7);
  for (const name of ROUTE) {
    const choice = menuChoices(session.state).find((c) => choiceName(session.state, c) === name);
    if (choice === undefined || !isRunActive(session.state)) {
      throw new Error(`fallRun: "${name}" is not on the list; the route needs updating`);
    }
    takeTurn(session, choice);
  }
  return { logText: logToText(session.log), miner: { ...session.state.avatar.pos } };
}
