// Golden runs: each tests/golden/*.json is a recorded run (seed, decisions,
// expected final hash). Replaying it must give that hash. A changed hash
// means the rules changed; see README.md in this folder.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCKS, CREW, STRUCTURES, WORLD } from '../../src/data';
import {
  depthAt,
  hasStump,
  hasTree,
  applyAction,
  actionKey,
  endShift,
  hashState,
  knownSquare,
  legalActions,
  mayMine,
  mineCheck,
  slumpCheck,
  structureOnSquare,
  topBlockAt,
  unstableSquares,
  visibleMineralTraces,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { replayDecisions, statusText } from '../../tools/simRun';
import type { GoldenRun } from '../../tools/simRun';

const GOLDEN_DIR = import.meta.dirname;
const files = readdirSync(GOLDEN_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

/** The golden run in the file `name`. */
function loadGolden(name: string): GoldenRun {
  // `as GoldenRun`: we trust the files in our own repository to have this shape.
  return JSON.parse(readFileSync(path.join(GOLDEN_DIR, name), 'utf8')) as GoldenRun;
}

/** Replay the golden run in the file `name` and return its final state. */
function replayFile(name: string): GameState {
  const golden = loadGolden(name);
  return replayDecisions(
    golden.seed,
    golden.contractId,
    golden.loadoutId,
    golden.decisions,
    golden.extraItems,
  );
}

/** The square a recorded "mine x,y ap n" or "cutTree x,y ap n" decision names. */
function squareOf(decision: string): { x: number; y: number } {
  const [x, y] = (decision.split(' ')[1] ?? '').split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

/** Take one recorded decision from `state` and return the state it leads to. */
function replayFrom(state: GameState, decision: string): GameState {
  if (decision === 'endShift') {
    return endShift(state).state;
  }
  const action = legalActions(state).find((legal) => actionKey(legal) === decision);
  if (action === undefined) {
    throw new Error(`The recorded decision "${decision}" is not legal here`);
  }
  return applyAction(state, action).state;
}

// Every test here replays whole runs, some of several hundred decisions. They
// take a second or two on an idle machine and can pass vitest's default limit
// of 5 seconds on a busy one, so the whole group gets the limit of a whole-run
// test. (`{ timeout }` as the second argument applies to every test inside.)
describe('golden runs', { timeout: 30000 }, () => {
  it('there are at least five', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  // `it.each` makes one test per file, named after it.
  it.each(files)('%s replays to its recorded hash', (name) => {
    const golden = loadGolden(name);
    const state = replayFile(name);
    expect(statusText(state)).toBe(golden.expectedStatus);
    expect(hashState(state)).toBe(golden.expectedHash);
  });

  // A hash only pins a rule if the run exercises it. The tests below fail if
  // a new recording no longer covers what its file is there for.

  it('pit-seed-2.json digs a terraced pit, cuts trees, crafts fuel and closes the mine', () => {
    const golden = loadGolden('pit-seed-2.json');
    expect(golden.decisions.some((decision) => decision.startsWith('cutTree'))).toBe(true);
    expect(golden.decisions.some((decision) => decision.startsWith('craft fuel'))).toBe(true);
    expect(golden.decisions[golden.decisions.length - 1]).toBe('closeMine ap 0');

    const state = replayFile('pit-seed-2.json');
    let deepest = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const depth = depthAt(state, x, y);
        deepest = Math.max(deepest, depth);
        // The level rule, seen afterwards: no square is more than 1 level
        // below a neighbour. `mayMine` lists the neighbours that are higher.
        for (const higher of mayMine(state, x, y).higherNeighbours) {
          expect(depth - higher.depth).toBe(1);
        }
      }
    }
    // Level benches keep the walls from slumping, so the pit is wide and
    // not as deep as a plain cone would be (issue #94).
    expect(deepest).toBeGreaterThanOrEqual(3);
  });

  // Pit walls slump (design doc 6.1; issue #94). The pit policy never makes a
  // square unstable knowingly, so its pit ends with nothing waiting to fall.
  it('pit-seed-2.json leaves a pit with no unstable square', () => {
    expect(unstableSquares(replayFile('pit-seed-2.json'))).toEqual([]);
  });

  // On this seed a square turns out unstable that the policy cannot mine
  // down, so it crafts a support and places it. The hash pins the place
  // action, the stored support, and a crack whose countdown the support stops.
  it('pit-seed-7-support.json crafts a support and places it on a cracked square', () => {
    const golden = loadGolden('pit-seed-7-support.json');
    expect(golden.decisions.some((decision) => decision.startsWith('craft support'))).toBe(true);
    const places = golden.decisions.filter((decision) => decision.startsWith('placeSupport'));
    expect(places.length).toBeGreaterThan(0);
    // Replay up to and including the first placement: the support stands on
    // the square it names and holds it. (Later in the run the pit reaches
    // that square and mines it, and the support goes with the block.)
    const placedAt = golden.decisions.indexOf(places[0] ?? '');
    const state = replayDecisions(
      golden.seed,
      golden.contractId,
      golden.loadoutId,
      golden.decisions.slice(0, placedAt + 1),
    );
    const square = squareOf(places[0] ?? '');
    expect(structureOnSquare(state, square.x, square.y)).toBe(STRUCTURES.support.code);
    expect(slumpCheck(state, square.x, square.y).heldBy).toBe('support');
  });

  // The greedy policy digs the steepest pit the level rule allows. Its walls
  // crack, count down and slump, and the crew is buried. The hash pins the
  // countdowns, the slumps and their order, the rubble, and the crew damage.
  it('greedy-seed-11-buried.json has walls that slump, and the crew is buried', () => {
    const golden = loadGolden('greedy-seed-11-buried.json');
    expect(golden.expectedStatus).toBe('ended: lost, buried');
    const state = replayFile('greedy-seed-11-buried.json');
    expect(state.crew.health).toBe(0);
    // Slumped blocks lie in the pit as rubble.
    let rubbleTops = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        if (topBlockAt(state, x, y) === BLOCKS.rubble.code) {
          rubbleTops += 1;
        }
      }
    }
    expect(rubbleTops).toBeGreaterThan(0);
  });

  // Camps (design doc 8; issue #100). The camp policy founds a camp with the
  // starting kit and rests there when the crew is hurt. The hash pins the
  // founding, the camp in the state, the cheaper mines, the upkeep and the rest.
  it('camp-seed-12-rest.json founds a camp, mines more cheaply near it, and rests', () => {
    const golden = loadGolden('camp-seed-12-rest.json');
    const founded = golden.decisions.filter((decision) => decision.startsWith('foundCamp'));
    expect(founded).toHaveLength(1);
    expect(
      golden.decisions.filter((decision) => decision.startsWith('rest')).length,
    ).toBeGreaterThan(1);
    expect(golden.decisions[golden.decisions.length - 1]).toBe('closeMine ap 0');

    const state = replayFile('camp-seed-12-rest.json');
    const centre = squareOf(founded[0] ?? '');
    expect(state.camps.map((camp) => ({ x: camp.pos.x, y: camp.pos.y }))).toEqual([centre]);
    expect(state.stockpile['campKit']).toBe(0);

    // Replay up to the founding, and look at the mines recorded after it:
    // some square near the camp was mined for less than its block costs.
    const foundedAt = golden.decisions.indexOf(founded[0] ?? '');
    let current = replayDecisions(
      golden.seed,
      golden.contractId,
      golden.loadoutId,
      golden.decisions.slice(0, foundedAt + 1),
    );
    let cheaperMines = 0;
    for (const decision of golden.decisions.slice(foundedAt + 1)) {
      if (decision.startsWith('mine')) {
        const square = squareOf(decision);
        if ((mineCheck(current, square.x, square.y).campDiscount ?? 0) > 0) {
          cheaperMines += 1;
        }
      }
      current = replayFrom(current, decision);
    }
    expect(cheaperMines).toBeGreaterThan(0);
    // This test replays the run a second time, one decision at a time, which
    // is slow on the CI machine: give it the limit of a whole-run test.
  }, 30000);

  // On this seed the greedy pit reaches the camp: a slump destroys it. The
  // hash pins `destroyCampsAt` from the slump step, and a crew that then has
  // nowhere to rest.
  it('camp-seed-25-destroyed.json rests at its camp, then loses it to a slump', () => {
    const golden = loadGolden('camp-seed-25-destroyed.json');
    expect(golden.decisions.some((decision) => decision.startsWith('foundCamp'))).toBe(true);
    expect(golden.decisions.some((decision) => decision.startsWith('rest'))).toBe(true);
    // It never takes the camp down itself, yet no camp is left at the end.
    expect(golden.decisions.some((decision) => decision.startsWith('decommissionCamp'))).toBe(
      false,
    );
    expect(golden.expectedStatus).toBe('ended: lost, buried');
    const state = replayFile('camp-seed-25-destroyed.json');
    expect(state.camps).toEqual([]);
    expect(state.stockpile['campKit']).toBe(0);
  });

  // Breaking into an underground space (design doc 6.2; issue #88 item 2):
  // this run's pit takes the roof off caverns. The hash pins the collapse to
  // rubble; rubble comes from nothing else in a pit-policy run today.
  it('pit-seed-24-caverns.json breaks into a cavern, and the level rule still holds', () => {
    const state = replayFile('pit-seed-24-caverns.json');
    expect(state.blocks.includes(BLOCKS.rubble.code)).toBe(true);
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        const depth = depthAt(state, x, y);
        for (const higher of mayMine(state, x, y).higherNeighbours) {
          expect(depth - higher.depth).toBe(1);
        }
      }
    }
  });

  // The surface forest (issue #70; design doc 3.2): this run cuts trees. A
  // stump left alone grows a tree again; a stump whose square is mined never
  // does. The hash pins cutting, stumps, regrowth and "no regrowth once mined".
  it('random-seed-6-forest.json cuts trees; some grow back, and none on a mined square', () => {
    const golden = loadGolden('random-seed-6-forest.json');
    const cuts = golden.decisions.filter((decision) => decision.startsWith('cutTree'));
    expect(cuts.length).toBeGreaterThan(0);
    const state = replayFile('random-seed-6-forest.json');
    let stumps = 0;
    let regrown = 0;
    let minedAfterCut = 0;
    for (const decision of cuts) {
      const square = squareOf(decision);
      const cell = { x: square.x, y: square.y, z: WORLD.surfaceZ };
      if (depthAt(state, square.x, square.y) > 0) {
        minedAfterCut += 1;
        expect(hasTree(state, cell)).toBe(false);
        expect(hasStump(state, cell)).toBe(false);
      } else if (hasStump(state, cell)) {
        stumps += 1;
      } else if (hasTree(state, cell)) {
        regrown += 1;
      }
    }
    expect(stumps).toBeGreaterThan(0);
    expect(regrown).toBeGreaterThan(0);
    expect(minedAfterCut).toBeGreaterThan(0);
  });

  it('random-seed-27-cut-short.json stops with the run still going', () => {
    expect(loadGolden('random-seed-27-cut-short.json').expectedStatus).toBe('active');
  });

  /** The action types in a golden run's decisions ("mine 3,4 ap 2" is a 'mine'). */
  function typesIn(golden: GoldenRun): Set<string> {
    return new Set(golden.decisions.map((decision) => decision.split(' ')[0] as string));
  }

  // The terracing policy (issue #108): a planned pit in a corner, held by
  // supports. The hash pins supports that are placed in time, on a pit dug
  // to its plan.
  it('terrace-seed-1.json finishes a pit 6 deep in a corner, with supports and no slump', () => {
    const golden = loadGolden('terrace-seed-1.json');
    expect(golden.expectedStatus).toBe('ended: salvage, mineClosed');
    expect(typesIn(golden)).toContain('placeSupport');
    const state = replayFile('terrace-seed-1.json');
    // One of the four corner squares is 6 down.
    const lastX = state.size.x - 1;
    const lastY = state.size.y - 1;
    const corners = [
      { x: 0, y: 0 },
      { x: lastX, y: 0 },
      { x: 0, y: lastY },
      { x: lastX, y: lastY },
    ];
    const corner = corners.find((square) => depthAt(state, square.x, square.y) === 6);
    expect(corner).toBeDefined();
    // The walls stood: nothing slumped, so there is no rubble in the pit and
    // the crew is unhurt.
    expect(state.blocks.includes(BLOCKS.rubble.code)).toBe(false);
    expect(state.crew.health).toBe(CREW.startHealth);
    let supports = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        if (structureOnSquare(state, x, y) === STRUCTURES.support.code) {
          supports += 1;
        }
      }
    }
    expect(supports).toBeGreaterThan(5);
  });

  // Water on a generated cube (design doc 6.2, 6.3): since the bands came
  // shallower and pockets more numerous (owner, issue #108), a careful pit
  // meets them. The hash pins the breach, the flow from shift to shift, and
  // the crew's damage from water entering a worked square.
  it('terrace-8-seed-4-flood.json breaks into a water pocket, is hurt by the water, and finishes', () => {
    const golden = loadGolden('terrace-8-seed-4-flood.json');
    expect(golden.expectedStatus).toBe('ended: salvage, mineClosed');
    const state = replayFile('terrace-8-seed-4-flood.json');
    let deepest = 0;
    let water = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        deepest = Math.max(deepest, depthAt(state, x, y));
        water += knownSquare(state, x, y).contents.water;
      }
    }
    expect(deepest).toBe(8);
    // Water still stands in the pit at the end, and it cost the crew health.
    expect(water).toBeGreaterThan(0);
    expect(state.crew.health).toBeLessThan(CREW.startHealth);
    expect(visibleMineralTraces(state).length).toBeGreaterThan(0);
  });

  // Gas on a generated cube (design doc 6.5): the first golden run that ends
  // with the crew lost to something other than a slump.
  it('terrace-8-seed-10-poisoned.json digs on in gas until the crew is poisoned', () => {
    const golden = loadGolden('terrace-8-seed-10-poisoned.json');
    expect(golden.expectedStatus).toBe('ended: lost, poisoned');
    const state = replayFile('terrace-8-seed-10-poisoned.json');
    expect(state.crew.health).toBe(0);
    let gas = 0;
    for (let y = 0; y < state.size.y; y += 1) {
      for (let x = 0; x < state.size.x; x += 1) {
        gas += knownSquare(state, x, y).contents.gas;
      }
    }
    expect(gas).toBeGreaterThan(0);
  });

  // The camp-made tools on a generated cube (issue #108). No run with the
  // standard loadout gets the iron, copper and crystal for them, so this run
  // starts with the sim-only tool kit (tools/simKit.ts). The hash pins a
  // charge's blast, the crew's 6 damage from it, pumps, vents, sealant and
  // scans as the dispatcher runs them.
  it('random-kit-seed-24-blast.json uses every camp-made tool and is hurt by its own blast', () => {
    const golden = loadGolden('random-kit-seed-24-blast.json');
    expect(golden.extraItems).toBeDefined();
    const types = typesIn(golden);
    for (const type of ['placeExplosive', 'placePump', 'placeVent', 'seal', 'scan']) {
      expect(types, type).toContain(type);
    }
    const state = replayFile('random-kit-seed-24-blast.json');
    expect(state.crew.health).toBeLessThan(CREW.startHealth);
    // Every charge went off in the shift it was placed: none is still armed.
    expect(state.armed).toEqual([]);
  });
});
