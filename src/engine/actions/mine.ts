// Mining a square's top block (design doc v0.2 section 4.2; decision notes
// 0025 and 0026; issue #86).
//
// There is no miner. The player names a square (x, y), and the block removed
// is that square's top block. Three things can stop it:
// - a tree stands on the square (cut it first);
// - the square has no block left (it shows the bedrock floor);
// - the level rule: a face neighbour is higher than the square.
//
// Not here yet, because their hazards are not built: a flooded square costs 1
// AP more and a square under lava cannot be mined (task T10), a camp's
// squares cannot be mined (T12), and mining takes a support away (T8).

import { BLOCKS, SURFACE } from '../../data';
import type { MineAction } from '../actionTypes';
import type { GameEvent } from '../events';
import { depthAt, mayMine } from '../heightmap';
import type { HigherNeighbour } from '../heightmap';
import { addItem, blockAt, blockDefAt, inGrid, isOpen, setBlock } from '../state';
import type { GameState } from '../state';
import { hasStump, hasTree, setStumpAge, setSurfaceKind, surfaceCellAbove } from '../surface/state';

/** Why a square cannot be mined now. */
export type MineRefusalReason =
  /** A tree stands on the square: cut it first. */
  | 'tree'
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The level rule: at least one face neighbour is higher than the square. */
  | 'neighbourHigher';

/** The answer of `mineCheck`. */
export interface MineCheck {
  /** True if the rules let the player mine the square (AP is not looked at). */
  allowed: boolean;
  /** Why not; `null` when `allowed` is true. */
  refusal: MineRefusalReason | null;
  /**
   * The neighbours that are too high, in the order north, east, south, west.
   * Empty unless `refusal` is 'neighbourHigher'. This is what a refused tap
   * shows the player (design doc 4.2: "says which neighbours are too high").
   */
  higherNeighbours: HigherNeighbour[];
  /** What the mine costs in AP; `null` when it is not allowed. */
  ap: number | null;
}

/**
 * May the player mine the square (x, y), and if not, why not? Does not look
 * at the AP left: `legalActions` in index.ts removes what costs too much.
 *
 * Everything read here is something the player sees: the tree, the depths of
 * the square and its neighbours, and the top block (which is known whenever
 * no tree hides it). Nothing below a top block is read.
 *
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function mineCheck(state: GameState, x: number, y: number): MineCheck {
  const depth = depthAt(state, x, y);
  // A tree is asked about first, so that the answer for a square under a tree
  // never depends on the block the tree hides.
  if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
    return { allowed: false, refusal: 'tree', higherNeighbours: [], ap: null };
  }
  const level = mayMine(state, x, y);
  if (!level.allowed) {
    return {
      allowed: false,
      refusal: level.refusal,
      higherNeighbours: level.higherNeighbours,
      ap: null,
    };
  }
  const cost = blockDefAt(state, { x, y, z: depth }).mineCost;
  if (cost === null) {
    // No block with a top face has no mine cost today (only open space and
    // bedrock have none, and neither is ever a top block above the floor).
    throw new Error(`The top block of square (${x}, ${y}) has no mine cost`);
  }
  return { allowed: true, refusal: null, higherNeighbours: [], ap: cost };
}

/**
 * Every `MineAction` the player could take now: one for each square
 * `mineCheck` allows, row by row (y, then x), with `ap` set to the top
 * block's mine cost from `BLOCKS`.
 *
 * - Does not change `state`. Lists actions as if AP were unlimited; the
 *   dispatcher in index.ts removes the ones that cost too much, which is what
 *   makes a block that costs more than the AP left not mineable this shift
 *   (0005 item 12).
 * - The drill (`mineCostWithDrill`) is not built, so the plain cost is used.
 */
export function legalMineActions(state: GameState): MineAction[] {
  const actions: MineAction[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const check = mineCheck(state, x, y);
      if (check.allowed && check.ap !== null) {
        actions.push({ type: 'mine', x, y, ap: check.ap });
      }
    }
  }
  return actions;
}

/**
 * Carry out `action`, which the dispatcher has already checked is in the
 * legal list.
 *
 * - Opens the square's top cell and emits `blockMined`. The square is now 1
 *   level deeper.
 * - Puts the yield into the stockpile (`itemGained`). The stockpile has no
 *   limit (design doc 4.1), so the yield always arrives.
 * - A stump on the square is gone for good: its surface cell becomes meadow,
 *   so no tree ever grows there again (design doc 3.2).
 * - Breaking into an open space (decision note 0026, until task T9): if the
 *   cell under the mined block is open, that cell and the open cells directly
 *   below it fill with rubble, down to the first solid block. So the square
 *   drops exactly 1 level and the level rule still holds. Emits
 *   `roofCollapsed`, which names the square's new top cell and nothing else:
 *   how deep the space was stays hidden.
 * - Changes `state` in place (it is the dispatcher's private copy). Does not
 *   spend the AP or reveal the new top block: the dispatcher does those.
 */
export function applyMine(state: GameState, action: MineAction, events: GameEvent[]): void {
  const x = action.x;
  const y = action.y;
  const target = { x, y, z: depthAt(state, x, y) };
  const minedCode = blockAt(state, target);
  const yields = blockDefAt(state, target).yields;

  setBlock(state, target, BLOCKS.air.code);
  events.push({ type: 'blockMined', pos: { ...target }, block: minedCode });

  for (const stack of yields) {
    addItem(state, stack.item, stack.count);
    events.push({ type: 'itemGained', item: stack.item, count: stack.count });
  }

  const surfaceCell = surfaceCellAbove(target);
  if (hasStump(state, surfaceCell)) {
    setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
    setStumpAge(state, surfaceCell, 0);
  }

  // The roof of an open space. `inGrid` stops at the bottom of the cube:
  // below it `isOpen` answers false anyway (bedrock), but `setBlock` needs a
  // stored cell.
  const below = { x, y, z: target.z + 1 };
  if (inGrid(state.size, below) && isOpen(state, below)) {
    for (let z = below.z; z < state.size.z && isOpen(state, { x, y, z }); z += 1) {
      setBlock(state, { x, y, z }, BLOCKS.rubble.code);
    }
    events.push({ type: 'roofCollapsed', pos: below });
  }
}
