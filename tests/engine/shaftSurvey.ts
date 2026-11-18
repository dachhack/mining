// A measurement used by tells.test.ts, and by hand for the figures in
// decision note 0010: dig a one-cell shaft straight down from the start cell
// with the real engine, and note when the player first sees mineral traces
// and when they first see ore.
//
// Everything is read the way a player would get it: traces from
// `visibleMineralTraces`, ore from revealed cells only.

import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID, TELLS } from '../../src/data';
import {
  applyAction,
  blockAt,
  cellPosition,
  createRun,
  endShift,
  isRevealed,
  isRunActive,
  legalActions,
  visibleMineralTraces,
} from '../../src/engine';
import type { GameState } from '../../src/engine';

export interface ShaftSurvey {
  /** The layer the miner stood in when the dig stopped. */
  reachedLayer: number;
  /** The layer the miner stood in when traces were first seen; `null` if never. -1 is the surface. */
  tracesFirstSeenAt: number | null;
  /** The same for the first revealed ore block (iron, copper or crystal). */
  oreFirstSeenAt: number | null;
}

/** Is any revealed cell an ore block that gives traces? */
function oreIsRevealed(state: GameState): boolean {
  const oreCodes = new Set<number>();
  const table: Record<string, { code: number } | undefined> = BLOCKS;
  for (const blockId of TELLS.mineralTraces.sourceBlocks) {
    const def = table[blockId];
    if (def !== undefined) {
      oreCodes.add(def.code);
    }
  }
  for (let index = 0; index < state.blocks.length; index += 1) {
    const pos = cellPosition(state.size, index);
    if (isRevealed(state, pos) && oreCodes.has(blockAt(state, pos))) {
      return true;
    }
  }
  return false;
}

/**
 * Start a run on `seed` and mine the block underfoot again and again (ending
 * the shift when it is not affordable) until the miner stands in layer
 * `targetLayer`. Nothing else is done: no ladders, no torches, no side cuts.
 */
export function surveyShaft(seed: number, targetLayer: number): ShaftSurvey {
  let state = createRun(seed, CONTRACT_IDS[0] ?? 'none', DEFAULT_LOADOUT_ID);
  let tracesFirstSeenAt: number | null = null;
  let oreFirstSeenAt: number | null = null;

  function look(): void {
    if (tracesFirstSeenAt === null && visibleMineralTraces(state).length > 0) {
      tracesFirstSeenAt = state.avatar.pos.z;
    }
    if (oreFirstSeenAt === null && oreIsRevealed(state)) {
      oreFirstSeenAt = state.avatar.pos.z;
    }
  }

  look();
  // A guard against a loop that never ends, should the rules change.
  for (let step = 0; step < 1000; step += 1) {
    if (!isRunActive(state) || state.avatar.pos.z >= targetLayer) {
      break;
    }
    const here = state.avatar.pos;
    const mineBelow = legalActions(state).find(
      (action) =>
        action.type === 'mine' &&
        action.target.x === here.x &&
        action.target.y === here.y &&
        action.target.z === here.z + 1,
    );
    state = mineBelow === undefined ? endShift(state).state : applyAction(state, mineBelow).state;
    look();
  }
  return { reachedLayer: state.avatar.pos.z, tracesFirstSeenAt, oreFirstSeenAt };
}
