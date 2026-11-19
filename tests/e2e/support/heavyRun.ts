// A run built for the e2e test of a risky tap (review of PR #79): seed 7,
// played by a simple rule until the pack is too full to carry one more
// stone, with a stone block left beside the miner. Mining it would leave the
// stone lying there ("too heavy to carry"), so a tap on it needs a second
// tap. The run is built here, from the engine itself, so it stays right as
// the rules change; the test saves its play log and the page resumes it.

import { AVATAR, BLOCKS, SHIFT } from '../../../src/data';
import { canCarry, carriedWeight, cellIndex, isRunActive, legalActions } from '../../../src/engine';
import type { Action, GameState } from '../../../src/engine';
import { startRun } from '../../../src/app/previewSession';
import { logToText } from '../../../src/app/text/log';
import { takeTurn } from '../../../src/app/text/turn';
import { choiceWarning } from '../../../src/app/text/describe';

export interface HeavyRun {
  /** The play log, as the preview saves it. */
  logText: string;
  /** The stone block beside the miner that is now too heavy to carry. */
  stone: { x: number; y: number; z: number };
  /** The miner's position. */
  miner: { x: number; y: number; z: number };
}

/** True if `action` mines a stone block. */
function minesStone(state: GameState, action: Action): boolean {
  if (action.type !== 'mine') {
    return false;
  }
  return state.blocks[cellIndex(state.size, action.target)] === BLOCKS.stone.code;
}

export function heavyRun(seed = 7): HeavyRun {
  const session = startRun(seed);
  for (let steps = 0; steps < 400 && isRunActive(session.state); steps += 1) {
    const state = session.state;
    const actions = legalActions(state);
    const stone = actions.find((a) => minesStone(state, a));
    // Done: a stone beside the miner, and no room to carry it.
    if (stone !== undefined && stone.type === 'mine' && !canCarry(state, 'stone', 1)) {
      const t = stone.target;
      return {
        logText: logToText(session.log),
        stone: { ...t },
        miner: { ...state.avatar.pos },
      };
    }
    // Mine a stone beside the miner if it fits; else dig down; else end the shift.
    const here = state.avatar.pos;
    const sideStone = actions.find(
      (a) => minesStone(state, a) && a.type === 'mine' && a.target.z === here.z,
    );
    const digDown = actions.find(
      (a) =>
        a.type === 'mine' &&
        a.target.x === here.x &&
        a.target.y === here.y &&
        a.target.z === here.z + 1 &&
        choiceWarning(state, a) === null,
    );
    const anyDig = actions.find(
      (a) => a.type === 'mine' && a.target.x === here.x && a.target.y === here.y,
    );
    const next = sideStone ?? digDown ?? anyDig;
    if (next === undefined || next.ap > state.ap) {
      takeTurn(session, { type: 'endShift' });
      continue;
    }
    takeTurn(session, next);
  }
  throw new Error(
    `no heavy run on seed ${seed}: carrying ${carriedWeight(session.state)} of ${AVATAR.carryCapacity}, AP per shift ${SHIFT.apPerShift}`,
  );
}
