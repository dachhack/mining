// A measurement used by tells.test.ts, and by hand for the figures in
// decision note 0012: dig a one-cell shaft straight down from the start cell
// with the real engine, and note when the player first sees mineral traces
// and when they first see ore.
//
// Everything is read the way a player would get it: traces from
// `visibleMineralTraces`, ore from revealed cells only.

import { BLOCKS, CONTRACT_IDS, DEFAULT_LOADOUT_ID, STRUCTURES, TELLS, WORLD } from '../../src/data';
import type { Vec3 } from '../../src/data';
import {
  applyAction,
  blockAt,
  cellPosition,
  countItem,
  createRun,
  endShift,
  isRevealed,
  isRunActive,
  isSolid,
  legalActions,
  structureAt,
  visibleMineralTraces,
} from '../../src/engine';
import type { Action, GameState } from '../../src/engine';
import { samePosition } from '../../src/engine/state';

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
 * Start a run on `seed` and dig a one-cell shaft straight down from the start
 * cell until the miner stands in layer `targetLayer`, or cannot go on.
 *
 * Mining the block underfoot with nothing to hold on to is an uncontrolled
 * fall that costs health (decision note 0010), so the miner does what a
 * careful player would. Each layer: put a ladder in its own cell, mine the
 * block underfoot, climb down off the ladder (a drop of 1, which is free).
 * Ladders come from the starting kit, then from crafting its timber. Nothing
 * can be placed on the surface, so the first block is mined standing on it,
 * for a fall of one block. When the step it wants is not affordable, it ends
 * the shift.
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

  /** The legal action the miner wants next, or `undefined` if it is not legal now. */
  function nextAction(): Action | undefined {
    const here = state.avatar.pos;
    const below = { x: here.x, y: here.y, z: here.z + 1 };
    const isHere = (pos: Vec3): boolean => samePosition(pos, here);
    const isBelow = (pos: Vec3): boolean => samePosition(pos, below);
    const legal = legalActions(state);

    const onSurface = here.z === WORLD.surfaceZ;
    const onLadder = !onSurface && structureAt(state, here) === STRUCTURES.ladder.code;
    if (!onSurface && !onLadder) {
      if (countItem(state, 'ladder') === 0) {
        return legal.find((action) => action.type === 'craft' && action.recipe === 'ladder');
      }
      return legal.find((action) => action.type === 'placeLadder' && isHere(action.target));
    }
    if (isSolid(state, below)) {
      return legal.find((action) => action.type === 'mine' && isBelow(action.target));
    }
    return legal.find((action) => action.type === 'move' && isBelow(action.to));
  }

  look();
  // Two ends of shift in a row mean the miner is stuck (out of ladders, say).
  let shiftsEndedInARow = 0;
  // A guard against a loop that never ends, should the rules change.
  for (let step = 0; step < 1000; step += 1) {
    if (!isRunActive(state) || state.avatar.pos.z >= targetLayer || shiftsEndedInARow >= 2) {
      break;
    }
    const action = nextAction();
    if (action === undefined) {
      state = endShift(state).state;
      shiftsEndedInARow += 1;
    } else {
      state = applyAction(state, action).state;
      shiftsEndedInARow = 0;
    }
    look();
  }
  return { reachedLayer: state.avatar.pos.z, tracesFirstSeenAt, oreFirstSeenAt };
}
