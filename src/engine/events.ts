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
export type RunOutcome = 'fullSuccess' | 'partial' | 'salvage' | 'lost';

/**
 * Why a run ended (design doc v0.2 section 5.3): the player closed the mine
 * (salvage; design doc 9.3), the fuel ran out, or the crew was lost, named by
 * what took its last health: buried (a slump), drowned (water), burned (lava
 * or an explosion), poisoned (gas).
 */
export type RunEndCause = 'mineClosed' | 'outOfFuel' | 'buried' | 'drowned' | 'burned' | 'poisoned';

/**
 * The kinds of hazard that hurt the crew when they reach a worked square
 * (design doc 5.2): a slumping block, water, lava (on the square or beside
 * it), gas, a gas explosion, and the explosion of a charge or of unstable
 * ore. Each kind hurts at most once a shift.
 */
export type DamageCause = 'slump' | 'water' | 'lava' | 'gas' | 'gasExplosion' | 'explosion';

/** The two fluids. They flow by the same rules (0014 items 12 and 16). */
export type FluidKind = 'water' | 'lava';

/**
 * What destroyed a structure or a camp:
 * - `rockfall`: a block slumped from the square or came to rest on it;
 * - `mined`: the block the structure stood on was mined (owner question 82);
 * - `water`, `lava`: the fluid entered the cell;
 * - `explosion`: the cell exploded, or was beside one that did;
 * - `noHold`: a support with nothing left to stand against (0014 item 6);
 * - `sealed`: sealant turned the cell to rock (0014 item 12).
 */
export type DestructionCause =
  'rockfall' | 'mined' | 'water' | 'lava' | 'explosion' | 'noHold' | 'sealed';

/** Why water, lava or gas left the cube without moving to another cell. */
export type RemovalReason =
  'pumped' | 'vented' | 'burnt' | 'reachedSurface' | 'buried' | 'sealed' | 'turnedToStone';

/** Why the fuel gauge changed. */
export type GaugeChangeReason = 'upkeep' | 'crafted';

export type GameEvent =
  /** The crew lost `amount` health to a hazard of kind `cause` and now has `health`. */
  | { type: 'damageTaken'; amount: number; cause: DamageCause; health: number }
  /** The block at `pos` was mined out. `block` is the code of what was there. */
  | { type: 'blockMined'; pos: Vec3; block: number }
  /**
   * The mined block was the roof of an underground space (a cavern or a
   * pocket), which collapsed to rubble at once (design doc 6.2; breach.ts).
   * `pos` is the square's new top block, now rubble. `water`, `lava` and
   * `gas` are the units the space held, which now stand on that square;
   * `lavaSource` is true if the lava keeps pouring. All four are 0 or false
   * for a cavern. It follows the `blockMined` of the same action, or the
   * `blockFell` of a block that slumped off such a roof. Where the
   * rest of the space was is not said: that is below the tops, which the
   * player does not see.
   */
  | {
      type: 'spaceCollapsed';
      pos: Vec3;
      water: number;
      lava: number;
      gas: number;
      lavaSource: boolean;
    }
  /** The block at `pos` became known to the player. `block` is its code. */
  | { type: 'blockRevealed'; pos: Vec3; block: number }
  /**
   * The player saw mineral traces on the block at `pos` for the first time
   * (decision note 0012). Sent once for a block; the traces then stay on the
   * map. It follows the `blockRevealed` events of the same step.
   */
  | { type: 'mineralTracesSeen'; pos: Vec3 }
  /**
   * Items went into the stockpile: a mining yield (it follows the
   * `blockMined` of the same action), the timber of a cut tree (it follows
   * `treeCut`) or a crafted item (it follows `crafted`). The stockpile has no
   * limit, so a yield always arrives (design doc 4.1).
   */
  | { type: 'itemGained'; item: string; count: number }
  /** A structure (its code is `structure`) was placed in the cell `pos`. */
  | { type: 'structurePlaced'; pos: Vec3; structure: number }
  /** The recipe was crafted once. Its inputs were taken from the stockpile. */
  | { type: 'crafted'; recipe: string }
  /** Shift number `shift` ended and `nextShift` began. */
  | { type: 'shiftEnded'; shift: number; nextShift: number }
  /** Fuel changed by `delta` (negative when used) and is now `fuel`. */
  | { type: 'fuelChanged'; delta: number; fuel: number; reason: GaugeChangeReason }
  /** The run is over. */
  | { type: 'runEnded'; outcome: RunOutcome; cause: RunEndCause }

  // --- M2: hazards and camps ---

  /**
   * The top block at `pos` (code `block`) cracked, or its countdown went down
   * (design doc 6.1). `timer` is the stored timer; the number shown is
   * `timer + 1`, and 1 means "falls in the coming cube phase".
   */
  | { type: 'blockCracked'; pos: Vec3; block: number; timer: number }
  /**
   * A cracked block slumped: it slid from `from`, the top of its square, to
   * `to`, the top of the foot of its slide path, which is at least one layer
   * lower (design doc 6.1). `block` is the code of what fell. `rubble` is
   * always true: it lies at `to` as rubble, whatever it was.
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
  /** The open cell `pos` was sealed with sealant and is now solid (0014 item 12). */
  | { type: 'cellSealed'; pos: Vec3 }
  /** The scanner revealed the region centred on `centre` (0014 item 31). */
  | { type: 'scanned'; centre: Vec3 }
  /** Crew health was restored by `amount` (resting at a camp) and is now `health`. */
  | { type: 'healthRestored'; amount: number; health: number }
  /** A camp was founded; `pos` is its `Camp.pos`. */
  | { type: 'campFounded'; pos: Vec3 }
  /** The camp at `pos` was destroyed (0014 item 30). */
  | { type: 'campDestroyed'; pos: Vec3; cause: DestructionCause }
  /** The camp at `pos` was decommissioned (0014 item 28). */
  | { type: 'campDecommissioned'; pos: Vec3 }
  // The surface forest (issue #70; decision note 0020).
  /** The tree in the surface cell `pos` was cut; a stump is left. */
  | { type: 'treeCut'; pos: Vec3 }
  /** A tree grew back on the stump in the surface cell `pos`, at the end of a shift. */
  | { type: 'treeGrew'; pos: Vec3 };
