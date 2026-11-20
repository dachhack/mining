// Rules that must hold after every step of every run, whatever the player
// does (issue #108, acceptance). `makeRuleChecker` gives a checker to hang on
// `playRun`'s `onStep`; it collects a sentence for every broken rule.
//
// What it checks:
// - THE LEVEL RULE for the player's mines (design doc 4.2): after a mine, the
//   square went down exactly 1 level and is no more than 1 level lower than
//   each of its face neighbours.
// - NOTHING ABOVE GROUND LEVEL (design doc 3.1): after every cube phase, a
//   square at ground level holds no water, lava or gas, and no square holds
//   more water or more lava than it has open levels to hold it in.
// - CONSERVATION (decision notes 0033 and 0035): water, lava and gas appear
//   and disappear only as the events say. In: a breached pocket
//   (`spaceCollapsed`) and a lava source (`lavaPoured`). Out: `fluidRemoved`
//   and `gasRemoved`. The totals on the map are counted after every cube
//   phase and compared with the count before plus the events since.
// - THE GAUGES: AP between 0 and a full shift's, and an action takes exactly
//   its AP; fuel never below 0; crew health between 0 and full; a run whose
//   crew health is 0 has ended; the shift number goes up by 1 per shift.
//
// It reads the state only through the engine's public surface.

import { CREW, SHIFT } from '../src/data';
import { SQUARE_STEPS, depthAt, isRunActive, isSquare, knownSquare } from '../src/engine';
import type { GameEvent, GameState, StepResult } from '../src/engine';
import { decisionKey } from './policies';
import type { Decision } from './policies';

/** Units standing on the whole map. */
interface Totals {
  water: number;
  lava: number;
  gas: number;
}

export interface RuleChecker {
  /** Hand this to `playRun` as `onStep`. */
  onStep: (before: GameState, decision: Decision, result: StepResult) => void;
  /** One sentence for each broken rule found so far. Empty if none. */
  problems: string[];
}

/**
 * Count what stands on the map, and note any square that holds something
 * above ground level. `knownSquare` shows everything that stands on a square
 * (design doc 3.4), so this reads nothing hidden.
 */
function countStanding(state: GameState, where: string, problems: string[]): Totals {
  const totals: Totals = { water: 0, lava: 0, gas: 0 };
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const square = knownSquare(state, x, y);
      const contents = square.contents;
      totals.water += contents.water;
      totals.lava += contents.lava;
      totals.gas += contents.gas;
      if (square.depth < 0 || square.depth > state.size.z) {
        problems.push(`${where}: square ${x},${y} is at depth ${square.depth}`);
      }
      if (contents.water > square.depth) {
        problems.push(
          `${where}: ${contents.water} water on square ${x},${y} at depth ${square.depth} stands above ground level`,
        );
      }
      if (contents.lava > square.depth) {
        problems.push(
          `${where}: ${contents.lava} lava on square ${x},${y} at depth ${square.depth} stands above ground level`,
        );
      }
      if (square.depth === 0 && contents.gas > 0) {
        problems.push(`${where}: ${contents.gas} gas on square ${x},${y} at ground level`);
      }
    }
  }
  return totals;
}

/** What the events of one step say came onto the map (+) and left it (-). */
function changeSaidByEvents(events: GameEvent[]): Totals {
  const change: Totals = { water: 0, lava: 0, gas: 0 };
  for (const event of events) {
    if (event.type === 'spaceCollapsed') {
      change.water += event.water;
      change.lava += event.lava;
      change.gas += event.gas;
    } else if (event.type === 'lavaPoured') {
      change.lava += event.units;
    } else if (event.type === 'fluidRemoved') {
      change[event.fluid] -= event.units;
    } else if (event.type === 'gasRemoved') {
      change.gas -= event.units;
    }
  }
  return change;
}

/**
 * A checker for one run. `label` goes in front of every problem it reports
 * (the policy and the seed, say).
 */
export function makeRuleChecker(label: string): RuleChecker {
  const problems: string[] = [];
  // What stood on the map at the last count, plus what the events since then
  // say changed. `null` until the first step, when the start is counted.
  let expected: Totals | null = null;
  let steps = 0;

  function onStep(before: GameState, decision: Decision, result: StepResult): void {
    steps += 1;
    const after = result.state;
    const where = `${label}, step ${steps} (${decisionKey(decision)}, shift ${before.shift})`;

    if (expected === null) {
      expected = countStanding(before, `${label}, at the start`, problems);
    }
    const change = changeSaidByEvents(result.events);
    expected.water += change.water;
    expected.lava += change.lava;
    expected.gas += change.gas;

    // The gauges.
    if (after.ap < 0 || after.ap > SHIFT.apPerShift) {
      problems.push(`${where}: AP is ${after.ap}`);
    }
    if (after.fuel < 0) {
      problems.push(`${where}: fuel is ${after.fuel}`);
    }
    if (after.crew.health < 0 || after.crew.health > CREW.startHealth) {
      problems.push(`${where}: crew health is ${after.crew.health}`);
    }
    if (after.crew.health === 0 && isRunActive(after)) {
      problems.push(`${where}: crew health is 0 but the run goes on`);
    }
    const saidEnded = result.events.some((event) => event.type === 'runEnded');
    if (saidEnded === isRunActive(after)) {
      problems.push(`${where}: the runEnded event and the run's status disagree`);
    }

    if (decision === 'endShift') {
      if (isRunActive(after) && after.shift !== before.shift + 1) {
        problems.push(`${where}: the shift went from ${before.shift} to ${after.shift}`);
      }
      // The cube phase has run: count what stands on the map now.
      const counted = countStanding(after, where, problems);
      for (const kind of ['water', 'lava', 'gas'] as const) {
        if (counted[kind] !== expected[kind]) {
          problems.push(
            `${where}: ${counted[kind]} units of ${kind} stand on the map, but the events since the last count say ${expected[kind]}`,
          );
        }
      }
      expected = counted;
      return;
    }

    // An action takes exactly its AP.
    if (after.ap !== before.ap - decision.ap) {
      problems.push(`${where}: AP went from ${before.ap} to ${after.ap}`);
    }
    // The level rule, for a mine.
    if (decision.type === 'mine') {
      const depthBefore = depthAt(before, decision.x, decision.y);
      const depthAfter = depthAt(after, decision.x, decision.y);
      if (depthAfter !== depthBefore + 1) {
        problems.push(`${where}: the mined square went from depth ${depthBefore} to ${depthAfter}`);
      }
      for (const step of SQUARE_STEPS) {
        const nx = decision.x + step.dx;
        const ny = decision.y + step.dy;
        if (!isSquare(after, nx, ny)) {
          continue; // the bedrock side of the cube: not a square (design doc 3.1)
        }
        const neighbour = depthAt(after, nx, ny);
        if (depthAfter > neighbour + 1) {
          problems.push(
            `${where}: the level rule is broken: the mined square is at depth ${depthAfter}, its neighbour ${nx},${ny} at ${neighbour}`,
          );
        }
      }
    }
  }

  return { onStep, problems };
}
