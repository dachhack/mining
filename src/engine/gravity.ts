// Gravity. STUB: filled in by M1 task 3.

import type { GameEvent } from './events';
import type { GameState } from './state';

/**
 * Let everything that has nothing under it fall. The dispatcher in index.ts
 * calls this after every action and after the cube phase.
 *
 * Contract:
 * - Changes `state` in place and appends to `events`.
 * - The avatar: if it has no footing (0005 item 5: a solid block below it, or
 *   a ladder in its own cell), it falls until it has. Emits `fell`, and for a
 *   fall long enough to hurt (design doc 5.2, numbers in `AVATAR`) emits
 *   `damageTaken`. A fatal fall, or health reaching 0, ends the run with
 *   `endRun(state, 'death', 'fell', events)`.
 * - Loose items: each falls straight down until it rests on a solid block
 *   (0005 item 17). Emits `itemFell`.
 * - Calling it on a state where nothing can fall changes nothing and emits
 *   nothing.
 * - No block falls in M1 (0005 item 9).
 *
 * Stub behaviour: does nothing.
 */
export function settle(_state: GameState, _events: GameEvent[]): void {
  // Nothing yet.
}
