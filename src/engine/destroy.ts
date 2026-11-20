// Destroying things at the moment of an event (design doc 4; 0014 item 2).
//
// Structures and camps are destroyed at the moment of the event that
// destroys them, so a structure destroyed early in the cube phase is not
// there for a later step. So a hazard never queues a destruction for later: it
// calls one of the two functions here, there and then.
//
// WHAT a hazard destroys is that hazard's rule (a falling block spares a
// support; gas alone spares a camp). These functions only do it, the same way
// for everyone: the state changes, the lists stay consistent, and one event
// says what happened.

import { NO_STRUCTURE, STRUCTURES } from '../data';
import type { Vec3 } from '../data';
import { campsAt } from './camps';
import type { DestructionCause, GameEvent } from './events';
import { disarmCharge, removeCamp, setStructure, structureAt } from './state';
import type { GameState } from './state';

/**
 * Destroy the structure in the cell `pos`, if there is one. Returns the code
 * of what was destroyed, or `NO_STRUCTURE` if the cell held none (then
 * nothing changes and no event is emitted).
 *
 * A destroyed explosive is also taken off `state.armed`, so it does not go
 * off. Nothing is given back to the stockpile.
 */
export function destroyStructure(
  state: GameState,
  pos: Vec3,
  cause: DestructionCause,
  events: GameEvent[],
): number {
  const structure = structureAt(state, pos);
  if (structure === NO_STRUCTURE) {
    return NO_STRUCTURE;
  }
  setStructure(state, pos, NO_STRUCTURE);
  if (structure === STRUCTURES.explosive.code) {
    disarmCharge(state, pos);
  }
  events.push({ type: 'structureDestroyed', pos: { ...pos }, structure, cause });
  return structure;
}

/**
 * Destroy every active camp that the cell `pos` belongs to (0014 item 30):
 * the camp leaves `state.camps`. Emits `campDestroyed`
 * for each. Returns how many camps were destroyed.
 *
 * Call it for each cell the event touches: the cell water or lava enters,
 * each exploding cell and the cells beside it, each cell a falling block
 * passes through or rests in. It is cheap when there is no camp there.
 */
export function destroyCampsAt(
  state: GameState,
  pos: Vec3,
  cause: DestructionCause,
  events: GameEvent[],
): number {
  const camps = campsAt(state, pos);
  for (const camp of camps) {
    removeCamp(state, camp);
    events.push({ type: 'campDestroyed', pos: { ...camp.pos }, cause });
  }
  return camps.length;
}
