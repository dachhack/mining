// Mining a square's top block (design doc v0.2 section 4.2; decision notes
// 0025 and 0026; issue #86).
//
// There is no miner. The player names a square (x, y), and the block removed
// is that square's top block. Three things can stop it:
// - a tree stands on the square (cut it first);
// - the square has no block left (it shows the bedrock floor);
// - the level rule: a face neighbour is higher than the square.
//
// Mining the roof of an underground space collapses it (breach.ts, task T9).
//
// Water and lava (design doc 4.2; owner question 91; task T10): a square
// that water stands on costs 1 AP more, and a square with lava on it cannot
// be mined at all.
//
// A support (or any other structure) on the square is stored with its top
// block, so mining the block takes it away and it is lost (owner question 82;
// issue #94).
//
// Unstable ore (design doc 6.6; task T11): mining the block beside known,
// unbraced unstable ore on its own layer arms it (`oreArmedByMine` in
// explosions.ts); it goes off when the shift ends.
//
// Camps (design doc 8; issue #100): a camp's 9 squares cannot be mined while
// it stands, and a mine near a camp costs 1 AP less (camps.ts).

import { BLOCKS, HAZARDS, SURFACE } from '../../data';
import type { MineAction } from '../actionTypes';
import { collapseSpaceUnder, contentsOn } from '../breach';
import { campAtSquare, discountedMineCost } from '../camps';
import { markWorked } from '../crew';
import { destroyStructure } from '../destroy';
import type { GameEvent } from '../events';
import { oreArmedByMine } from '../explosions';
import { depthAt, mayMine } from '../heightmap';
import type { HigherNeighbour } from '../heightmap';
import { addItem, armCharge, blockAt, blockDefAt, setBlock } from '../state';
import type { GameState } from '../state';
import { hasStump, hasTree, setStumpAge, setSurfaceKind, surfaceCellAbove } from '../surface/state';

/** Why a square cannot be mined now. */
export type MineRefusalReason =
  /** A tree stands on the square: cut it first. */
  | 'tree'
  /** The square has no block left: it shows the bedrock floor. */
  | 'bottom'
  /** The level rule: at least one face neighbour is higher than the square. */
  | 'neighbourHigher'
  /** Lava stands on the square (design doc 4.2). */
  | 'lava'
  /** A camp stands on the square: decommission it first (design doc 8). */
  | 'camp';

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
  /**
   * What the mine costs in AP, with the camp discount already taken off and,
   * on a square that water stands on, `HAZARDS.water.floodedMineExtraAp`
   * added after it (owner question 107); `null` when it is not allowed.
   */
  ap: number | null;
  /**
   * How many AP the camp discount took off (design doc 8): 0 away from any
   * camp, and 0 when the block already costs the least a mine may cost.
   * `null` when the mine is not allowed.
   */
  campDiscount: number | null;
}

/**
 * May the player mine the square (x, y), and if not, why not? Does not look
 * at the AP left: `legalActions` in index.ts removes what costs too much.
 *
 * Everything read here is something the player sees: the tree, the depths of
 * the square and its neighbours, the camps, the top block (which is known
 * whenever no tree hides it), and the water and lava standing on the square.
 * Nothing below a top block is read.
 *
 * When more than one thing stops the mine, the reason given is the first of:
 * a tree, a camp, no block left, lava, the level rule.
 *
 * Throws if (x, y) is not a square. Does not change `state`.
 */
export function mineCheck(state: GameState, x: number, y: number): MineCheck {
  const depth = depthAt(state, x, y);
  // A tree is asked about first, so that the answer for a square under a tree
  // never depends on the block the tree hides.
  if (hasTree(state, surfaceCellAbove({ x, y, z: 0 }))) {
    return { allowed: false, refusal: 'tree', higherNeighbours: [], ap: null, campDiscount: null };
  }
  // A camp's squares cannot be mined while it stands. Camps are always seen.
  if (campAtSquare(state, x, y) !== null) {
    return { allowed: false, refusal: 'camp', higherNeighbours: [], ap: null, campDiscount: null };
  }
  const level = mayMine(state, x, y);
  if (level.refusal === 'bottom') {
    return {
      allowed: false,
      refusal: 'bottom',
      higherNeighbours: [],
      ap: null,
      campDiscount: null,
    };
  }
  // What stands on the square, in the open: the player sees it.
  const contents = contentsOn(state, x, y);
  if (contents.lava > 0) {
    return { allowed: false, refusal: 'lava', higherNeighbours: [], ap: null, campDiscount: null };
  }
  if (!level.allowed) {
    return {
      allowed: false,
      refusal: level.refusal,
      higherNeighbours: level.higherNeighbours,
      ap: null,
      campDiscount: null,
    };
  }
  const cost = blockDefAt(state, { x, y, z: depth }).mineCost;
  if (cost === null) {
    // No block with a top face has no mine cost today (only open space and
    // bedrock have none, and neither is ever a top block above the floor).
    throw new Error(`The top block of square (${x}, ${y}) has no mine cost`);
  }
  // Mining near a camp is cheaper (design doc 4.2 and 8). The camp discount
  // comes first, and its floor of the least a mine may cost; the extra AP for
  // a flooded square is added after it (owner question 107).
  const discounted = discountedMineCost(state, x, y, cost);
  const floodedExtraAp = contents.water > 0 ? HAZARDS.water.floodedMineExtraAp : 0;
  return {
    allowed: true,
    refusal: null,
    higherNeighbours: [],
    ap: discounted + floodedExtraAp,
    campDiscount: cost - discounted,
  };
}

/**
 * Every `MineAction` the player could take now: one for each square
 * `mineCheck` allows, row by row (y, then x), with `ap` set to the top
 * block's mine cost from `BLOCKS`, less the camp discount near a camp, plus
 * 1 on a flooded square.
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
 * - A structure on the square (a support) goes with the block and is lost:
 *   `structureDestroyed`, cause `mined`, before the `blockMined`.
 * - Opens the square's top cell and emits `blockMined`. The square is now 1
 *   level deeper.
 * - The square is a worked square until the end of the shift (design doc
 *   5.2): a hazard that reaches it in the coming cube phase hurts the crew.
 * - Water on the square stays on it: the square is 1 deeper, so the water's
 *   surface is 1 lower.
 * - Puts the yield into the stockpile (`itemGained`). The stockpile has no
 *   limit (design doc 4.1), so the yield always arrives.
 * - A stump on the square is gone for good: its surface cell becomes meadow,
 *   so no tree ever grows there again (design doc 3.2).
 * - Known, unbraced unstable ore beside the mined block, on its own layer, is
 *   armed (`oreArmed`): it goes off in step (c) of the coming cube phase
 *   (design doc 6.6). Mining the ore itself never sets it off: it yields.
 * - Breaking into an underground space (design doc 6.2): if the cell under
 *   the mined block is open, the whole cavern or pocket collapses to rubble
 *   and its contents are put on this square (`collapseSpaceUnder` in
 *   breach.ts). So the square drops exactly 1 level and the level rule still
 *   holds. Emits `spaceCollapsed`.
 * - Changes `state` in place (it is the dispatcher's private copy). Does not
 *   spend the AP or reveal the new top block: the dispatcher does those.
 */
export function applyMine(state: GameState, action: MineAction, events: GameEvent[]): void {
  const x = action.x;
  const y = action.y;
  const target = { x, y, z: depthAt(state, x, y) };
  const minedCode = blockAt(state, target);
  const yields = blockDefAt(state, target).yields;
  // Worked out before anything changes: only ore the player knew when the
  // mine was chosen is armed (design doc 6.6; owner question 58).
  const armedOre = oreArmedByMine(state, x, y);

  destroyStructure(state, target, 'mined', events);
  setBlock(state, target, BLOCKS.air.code);
  events.push({ type: 'blockMined', pos: { ...target }, block: minedCode });
  markWorked(state, x, y);

  for (const stack of yields) {
    addItem(state, stack.item, stack.count);
    events.push({ type: 'itemGained', item: stack.item, count: stack.count });
  }

  const surfaceCell = surfaceCellAbove(target);
  if (hasStump(state, surfaceCell)) {
    setSurfaceKind(state, surfaceCell, SURFACE.kinds.meadow.code);
    setStumpAge(state, surfaceCell, 0);
  }

  // Unstable ore beside the mined block, on its layer, is armed.
  for (const ore of armedOre) {
    armCharge(state, ore, 'unstableOre');
    events.push({ type: 'oreArmed', pos: ore });
  }

  // If the block was the roof of a cavern or pocket, the space collapses.
  collapseSpaceUnder(state, target, events);
}
