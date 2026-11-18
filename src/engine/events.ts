// Events: the list of things that happened during one `applyAction` or
// `endShift` call, in the order they happened.
//
// The renderer animates from this list and never has to compare two states to
// work out what changed. Events carry no information the state does not; they
// are a record, not a second source of truth.
//
// All the events M1 needs are defined here, so that the tasks filling in the
// rule modules do not have to edit this shared file.

import type { Vec3 } from '../data';

/** How a run ended, as in the outcome table of design doc 9.4. */
export type RunOutcome = 'fullSuccess' | 'partial' | 'salvage' | 'death';

/**
 * Why a run ended. M1 has three: the avatar left from the surface (salvage),
 * died of a fall, or ran out of fuel at upkeep. M2 adds the other deaths of
 * design doc 5.3.
 */
export type RunEndCause = 'left' | 'fell' | 'outOfFuel';

/** Why the avatar took damage. Only falls hurt in M1 (0005 item 8). */
export type DamageCause = 'fall';

/** Why a gauge (fuel or lamp oil) changed. */
export type GaugeChangeReason = 'upkeep' | 'bankedApRefund' | 'crafted';

export type GameEvent =
  /** The avatar moved under its own power from one cell to another. */
  | { type: 'moved'; from: Vec3; to: Vec3 }
  /** The avatar fell `distance` blocks. */
  | { type: 'fell'; from: Vec3; to: Vec3; distance: number }
  /** The avatar lost `amount` health and now has `health`. */
  | { type: 'damageTaken'; amount: number; cause: DamageCause; health: number }
  /** The block at `pos` was mined out. `block` is the code of what was there. */
  | { type: 'blockMined'; pos: Vec3; block: number }
  /** The block at `pos` became known to the player. `block` is its code. */
  | { type: 'blockRevealed'; pos: Vec3; block: number }
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
  /**
   * At upkeep, `amount` unspent AP went into the banked counter (0005 item
   * 20). `bankedAp` is the counter after any refund it paid for; the refund
   * itself is a `fuelChanged` with reason `bankedApRefund`.
   */
  | { type: 'apBanked'; amount: number; bankedAp: number }
  /** Shift number `shift` ended and `nextShift` began. */
  | { type: 'shiftEnded'; shift: number; nextShift: number }
  /** Fuel changed by `delta` (negative when used) and is now `fuel`. */
  | { type: 'fuelChanged'; delta: number; fuel: number; reason: GaugeChangeReason }
  /** Lamp oil changed by `delta` and is now `lampOil`. */
  | { type: 'lampOilChanged'; delta: number; lampOil: number; reason: GaugeChangeReason }
  /** The run is over. */
  | { type: 'runEnded'; outcome: RunOutcome; cause: RunEndCause };
