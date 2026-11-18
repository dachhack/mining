// Light and reveal. STUB: filled in by M1 task 4.

import type { GameEvent } from './events';
import type { GameState } from './state';

/**
 * Work out which cells are lit and reveal the blocks the light shows. The
 * dispatcher in index.ts calls this when a run is created, after every action
 * and at the end of every shift.
 *
 * Contract:
 * - Changes `state.revealed` in place and appends a `blockRevealed` event for
 *   each cell that was not revealed before.
 * - Lit cells: the surface, plus open cells reachable from the avatar within
 *   its light radius, plus open cells reachable from each torch within the
 *   torch radius (0005 item 13; radii in `AVATAR`, and the avatar's depends on
 *   whether `state.lampOil` is above 0).
 * - A block is revealed when one of its faces touches a lit open cell
 *   (0005 item 14). The cells within the avatar's reach are always revealed
 *   (0005 item 10).
 * - Once revealed, a cell stays revealed. Which cells are lit is not stored.
 *
 * Stub behaviour: does nothing.
 */
export function updateReveal(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}
