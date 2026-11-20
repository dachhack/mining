// Events: the list of things that happened during one `applyAction` or
// `endShift` call, in the order they happened.
//
// The renderer animates from this list and never has to compare two states to
// work out what changed. Events carry no information the state does not; they
// are a record, not a second source of truth.
//
// All the events M1 and M2 need are defined here, so that the tasks filling
// in the rule modules do not have to edit this shared file. The M2 events
// (from `blockCracked` down) were added by the M2 skeleton (issue #50;
// decision note 0015); nothing emits one until its task is built.

import type { Vec3 } from '../data';

/** How a run ended, as in the outcome table of design doc 9.4. */
export type RunOutcome = 'fullSuccess' | 'partial' | 'salvage' | 'death';

/**
 * Why a run ended: the avatar left from the surface (salvage), or one of the
 * deaths of design doc 5.3 (0014 item 22).
 */
export type RunEndCause =
  'left' | 'outOfFuel' | 'crushed' | 'drowned' | 'suffocated' | 'burned' | 'entombed';

/**
 * Why the avatar took damage: a falling block, lava (in its cell or beside
 * it), or an explosion (design doc 5.1; 0014 items 8, 15, 16). The miner
 * never falls (issue #80), so a fall is not a cause.
 */
export type DamageCause = 'rockfall' | 'lava' | 'explosion';

/** The two fluids. They flow by the same rules (0014 items 12 and 16). */
export type FluidKind = 'water' | 'lava';

/**
 * What destroyed a structure, a camp, or loose items:
 * - `rockfall`: a falling block passed through the cell or came to rest in it;
 * - `water`, `lava`: the fluid entered the cell;
 * - `explosion`: the cell exploded, or was beside one that did;
 * - `noHold`: a support with nothing left to stand against (0014 item 6);
 * - `sealed`: sealant turned the cell to rock (0014 item 12).
 */
export type DestructionCause = 'rockfall' | 'water' | 'lava' | 'explosion' | 'noHold' | 'sealed';

/** Why water, lava or gas left the cube without moving to another cell. */
export type RemovalReason =
  'pumped' | 'vented' | 'burnt' | 'reachedSurface' | 'buried' | 'sealed' | 'turnedToStone';

/** Why the air gauge changed. */
export type AirChangeReason = 'noAir' | 'refilled' | 'rested';

/** Why the fuel gauge changed. */
export type GaugeChangeReason = 'upkeep' | 'crafted';

export type GameEvent =
  /** The avatar lost `amount` health and now has `health`. */
  | { type: 'damageTaken'; amount: number; cause: DamageCause; health: number }
  /** The block at `pos` was mined out. `block` is the code of what was there. */
  | { type: 'blockMined'; pos: Vec3; block: number }
  /**
   * The mined block was the roof of an open space, which fell in: the cell
   * `pos`, the square's new top, is now rubble (decision note 0026). It
   * follows the `blockMined` of the same action. How deep the space was is
   * not said: that is below the top, which the player does not see.
   */
  | { type: 'roofCollapsed'; pos: Vec3 }
  /** The block at `pos` became known to the player. `block` is its code. */
  | { type: 'blockRevealed'; pos: Vec3; block: number }
  /**
   * The player saw mineral traces on the block at `pos` for the first time
   * (decision note 0012). Sent once for a block; the traces then stay on the
   * map. It follows the `blockRevealed` events of the same step.
   */
  | { type: 'mineralTracesSeen'; pos: Vec3 }
  /**
   * Items appeared in the inventory from nowhere on the board: a mining yield
   * (it follows the `blockMined` of the same action) or a crafted item (it
   * follows `crafted`). A pick-up is `itemPickedUp` instead.
   */
  | { type: 'itemGained'; item: string; count: number }
  /** The avatar picked up loose items from the cell `from` into the inventory. */
  | { type: 'itemPickedUp'; from: Vec3; item: string; count: number }
  /** A mining yield did not fit the carry limit and was left loose at `pos` (0005 item 16). */
  | { type: 'itemLeft'; pos: Vec3; item: string; count: number }
  /** The player dropped items from the inventory into the cell `pos`. */
  | { type: 'itemDropped'; pos: Vec3; item: string; count: number }
  /** Loose items fell from one cell to another (0005 item 17). */
  | { type: 'itemFell'; from: Vec3; to: Vec3; item: string; count: number }
  /** A structure (its code is `structure`) was placed in the cell `pos`. */
  | { type: 'structurePlaced'; pos: Vec3; structure: number }
  /** The recipe was crafted once. Its inputs left the inventory. */
  | { type: 'crafted'; recipe: string }
  /** Shift number `shift` ended and `nextShift` began. */
  | { type: 'shiftEnded'; shift: number; nextShift: number }
  /** Fuel changed by `delta` (negative when used) and is now `fuel`. */
  | { type: 'fuelChanged'; delta: number; fuel: number; reason: GaugeChangeReason }
  /** The run is over. */
  | { type: 'runEnded'; outcome: RunOutcome; cause: RunEndCause }

  // --- M2: hazards and camps ---

  /**
   * The block at `pos` (code `block`) cracked, or its stored timer changed
   * (0014 item 7). `timer` is the stored timer; the number shown is `timer + 1`.
   */
  | { type: 'blockCracked'; pos: Vec3; block: number; timer: number }
  /**
   * A cracked block fell from `from` and stopped at `to` (0014 item 8).
   * `block` is the code of what fell. `rubble` is true if it became rubble at
   * `to`, false if it broke up there (on a support, or in the avatar's cell).
   */
  | { type: 'blockFell'; from: Vec3; to: Vec3; block: number; rubble: boolean }
  /**
   * The block at `pos` (code `block`) was destroyed with no yield: unstable
   * ore going off, or rock beside an explosive (0014 items 15 and 17).
   */
  | { type: 'blockDestroyed'; pos: Vec3; block: number }
  /** One unit of water or lava moved from one cell to another. */
  | { type: 'fluidMoved'; fluid: FluidKind; from: Vec3; to: Vec3 }
  /** The water or lava in the cell `pos` is gone. */
  | { type: 'fluidRemoved'; fluid: FluidKind; pos: Vec3; reason: RemovalReason }
  /** Water met lava at `pos`, and the cell is now stone (0014 item 16). */
  | { type: 'stoneFormed'; pos: Vec3 }
  /** `units` of gas moved from one cell to another (0014 item 13). */
  | { type: 'gasMoved'; from: Vec3; to: Vec3; units: number }
  /** `units` of gas in the cell `pos` are gone. */
  | { type: 'gasRemoved'; pos: Vec3; units: number; reason: RemovalReason }
  /** The unstable ore at `pos` was armed by mining beside it (0014 item 17). */
  | { type: 'oreArmed'; pos: Vec3 }
  /** One explosion: all of `cells` went off together (0014 item 15). */
  | { type: 'exploded'; cells: Vec3[] }
  /** The structure (its code is `structure`) in the cell `pos` was destroyed. */
  | { type: 'structureDestroyed'; pos: Vec3; structure: number; cause: DestructionCause }
  /** Loose items lying in the cell `pos` were destroyed. */
  | { type: 'looseItemsDestroyed'; pos: Vec3; item: string; count: number; cause: DestructionCause }
  /** The open cell `pos` was sealed with sealant and is now solid (0014 item 12). */
  | { type: 'cellSealed'; pos: Vec3 }
  /** The scanner revealed the region centred on `centre` (0014 item 31). */
  | { type: 'scanned'; centre: Vec3 }
  /** Air changed by `delta` and is now `air`. */
  | { type: 'airChanged'; delta: number; air: number; reason: AirChangeReason }
  /** Health was restored by `amount` (resting at a camp) and is now `health`. */
  | { type: 'healthRestored'; amount: number; health: number }
  /** A camp was founded; `pos` is its `Camp.pos`. */
  | { type: 'campFounded'; pos: Vec3 }
  /** The camp at `pos` was destroyed, and its stash with it (0014 item 30). */
  | { type: 'campDestroyed'; pos: Vec3; cause: DestructionCause }
  /** The camp at `pos` was decommissioned; its stash now lies loose (0014 item 28). */
  | { type: 'campDecommissioned'; pos: Vec3 }
  /** Items went from the inventory into the stash of the camp at `camp`. */
  | { type: 'itemStashed'; camp: Vec3; item: string; count: number }
  /** Items went from the stash of the camp at `camp` into the inventory. */
  | { type: 'itemUnstashed'; camp: Vec3; item: string; count: number }
  // The surface forest (issue #70; decision note 0020).
  /** The tree in the surface cell `pos` was cut; a stump is left. */
  | { type: 'treeCut'; pos: Vec3 }
  /** A tree grew back on the stump in the surface cell `pos`, at the end of a shift. */
  | { type: 'treeGrew'; pos: Vec3 };
