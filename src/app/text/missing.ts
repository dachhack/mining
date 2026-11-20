// What is missing for want of AP (issue #47).
//
// A choice that costs more AP than is left is not on the list and is not
// counted among the squares that can be mined, and without a line saying so
// it looks exactly like one a rule forbids. (A named square says its own
// reason: see squares.ts.)

import { SHIFT } from '../../data';
import { legalActions } from '../../engine';
import type { GameState } from '../../engine';
import { choiceLabel, choiceName } from './describe';
import type { Audience } from './describe';
import { isNamedBySquareOnly } from './log';

/**
 * One line saying what costs more AP than the player has left, or `null` if
 * there is nothing of the kind.
 *
 * How it is worked out: the engine's `legalActions` is asked for the same
 * state with a full shift's AP. The engine leaves an action out for too
 * little AP and for nothing else that depends on AP, so what that list holds
 * that costs more than the AP left is exactly what the player could do with
 * more AP. Nothing here reads the cube: the list is the engine's, and the
 * engine's list never depends on a block the player has not seen
 * (tests/engine/properties.test.ts).
 *
 * Mines and cuts are counted, not named (there can be hundreds); the listed
 * choices are named, with their cost: "3 mines and 120 cuts cost more than
 * the 1 AP you have left; so does: [2] some-choice." On the phone a listed
 * choice is named by its button: "Craft Support (2 AP)".
 */
export function tooLittleApNote(state: GameState, audience: Audience = 'playTool'): string | null {
  const fullShift = Math.max(SHIFT.apPerShift, state.ap);
  // `{ ...state, ap }` is a copy of the state with one field changed (like
  // Python's `dataclasses.replace`). The cube arrays are shared, not copied;
  // `legalActions` does not change the state it is given.
  const withFullAp = legalActions({ ...state, ap: fullShift });
  // Founding a camp and resting cost "the rest of the shift", whatever that
  // is, so with more AP they would only cost more: they are never missing for
  // want of AP while there is any AP at all (and with none, the line below
  // covers them).
  const tooDear = withFullAp.filter(
    (action) => action.ap > state.ap && action.type !== 'foundCamp' && action.type !== 'rest',
  );
  if (tooDear.length === 0) {
    return null;
  }
  if (state.ap <= 0) {
    // Everything that costs AP is missing: a list of it all would say no more.
    return 'everything that costs AP: you have 0 AP left.';
  }
  const mines = tooDear.filter((action) => action.type === 'mine').length;
  const cuts = tooDear.filter((action) => action.type === 'cutTree').length;
  const listed = tooDear
    .filter((action) => !isNamedBySquareOnly(action))
    // The play tool names the command to type; the phone the button's words.
    .map((action) =>
      audience === 'phone'
        ? `${choiceLabel(action)} (${action.ap} AP)`
        : `[${action.ap}] ${choiceName(action)}`,
    );

  const parts: string[] = [];
  if (mines > 0) {
    parts.push(`${mines} ${mines === 1 ? 'mine' : 'mines'}`);
  }
  if (cuts > 0) {
    parts.push(`${cuts} ${cuts === 1 ? 'cut' : 'cuts'}`);
  }
  if (parts.length === 0) {
    return `more than the ${state.ap} AP you have left: ${listed.join(', ')}.`;
  }
  const verb = mines + cuts === 1 ? 'costs' : 'cost';
  let text = `${parts.join(' and ')} ${verb} more than the ${state.ap} AP you have left`;
  if (listed.length > 0) {
    text += `; so ${listed.length === 1 ? 'does' : 'do'}: ${listed.join(', ')}`;
  }
  return `${text}.`;
}
