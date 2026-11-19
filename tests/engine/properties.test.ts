// Property tests (docs/repo-plan.md section 5.4): for a set of fixed seeds, a
// policy that picks random legal actions plays a few hundred decisions, and
// after every one of them the state must still make sense.
//
// The seeds are fixed so that CI is reproducible. The policies pick with the
// engine's seeded generator (tools/policies.ts), so a failure names a seed
// and a step that can be replayed.

import { describe, expect, it } from 'vitest';
import {
  AVATAR,
  BLOCKS,
  CONTRACT_IDS,
  DEFAULT_LOADOUT_ID,
  ITEMS,
  SHIFT,
  STRUCTURES,
  TELLS,
  WORLD,
} from '../../src/data';
import {
  applyAction,
  carriedWeight,
  cellPosition,
  carryCapacity,
  createRun,
  endShift,
  inGrid,
  inventoryEntries,
  isOpen,
  isRevealed,
  isRunActive,
  isSolid,
  isSurface,
  isUnderTree,
  legalActions,
  previewCubePhase,
  serialise,
  structureAt,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import type { Vec3 } from '../../src/data';
import { cloneState, setBlock, setStructure } from '../../src/engine/state';
import { decisionKey, makePolicy } from '../../tools/policies';
import { playRun } from '../../tools/simRun';
import { buildView, renderView } from '../../src/app/text/view';
import { buildLayer } from '../../src/app/map/tiles';
import { choiceWarning, describeChoice } from '../../src/app/text/describe';

const CONTRACT = CONTRACT_IDS[0] as string;

/** The whole state as one string; two states are the same exactly when these are. */
function snapshot(state: GameState): string {
  return JSON.stringify(serialise(state));
}

function isWholeNumber(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Everything that must be true of a state the engine produced. Returns a list
 * of what is wrong, empty if nothing is.
 */
function invariantProblems(state: GameState): string[] {
  const problems: string[] = [];
  const pos = state.avatar.pos;
  const below = { x: pos.x, y: pos.y, z: pos.z + 1 };

  // Gauges and counters.
  if (!isWholeNumber(state.ap) || state.ap < 0 || state.ap > SHIFT.apPerShift) {
    problems.push(`AP is ${state.ap}, outside 0..${SHIFT.apPerShift}`);
  }
  if (!isWholeNumber(state.fuel) || state.fuel < 0) {
    problems.push(`fuel is ${state.fuel}`);
  }
  if (!isWholeNumber(state.lampOil) || state.lampOil < 0) {
    problems.push(`lamp oil is ${state.lampOil}`);
  }
  if (!isWholeNumber(state.shift) || state.shift < SHIFT.firstShiftNumber) {
    problems.push(`shift is ${state.shift}`);
  }
  const health = state.avatar.health;
  if (!isWholeNumber(health) || health < 0 || health > AVATAR.startHealth) {
    problems.push(`health is ${health}, outside 0..${AVATAR.startHealth}`);
  }
  if (isRunActive(state) && health === 0) {
    problems.push('the run is still going with 0 health');
  }

  // Inventory.
  for (const entry of inventoryEntries(state)) {
    if (!isWholeNumber(entry.count) || entry.count < 0) {
      problems.push(`inventory holds ${entry.count} ${entry.item}`);
    }
    if (!Object.hasOwn(ITEMS, entry.item)) {
      problems.push(`inventory holds an unknown item: ${entry.item}`);
    }
  }
  if (carriedWeight(state) > carryCapacity()) {
    problems.push(`carried weight ${carriedWeight(state)} is over the limit ${carryCapacity()}`);
  }

  // The avatar: inside the world, in an open cell, held up by rock or a ladder.
  if (!inGrid(state.size, pos) && !isSurface(state.size, pos)) {
    problems.push(`the avatar is outside the world at (${pos.x}, ${pos.y}, ${pos.z})`);
  }
  if (!isOpen(state, pos)) {
    problems.push(`the avatar is inside a block at (${pos.x}, ${pos.y}, ${pos.z})`);
  }
  const onLadder = structureAt(state, pos) === STRUCTURES.ladder.code;
  if (!isSolid(state, below) && !onLadder) {
    problems.push(`the avatar has no footing at (${pos.x}, ${pos.y}, ${pos.z})`);
  }

  // Loose items: a positive count, in an open cell, resting on a solid block.
  for (const pile of state.looseItems) {
    const at = `(${pile.pos.x}, ${pile.pos.y}, ${pile.pos.z})`;
    if (!isWholeNumber(pile.count) || pile.count <= 0) {
      problems.push(`a loose pile of ${pile.count} ${pile.item} at ${at}`);
    }
    if (!isOpen(state, pile.pos)) {
      problems.push(`loose ${pile.item} inside a block at ${at}`);
    }
    if (!isSolid(state, { x: pile.pos.x, y: pile.pos.y, z: pile.pos.z + 1 })) {
      problems.push(`loose ${pile.item} at ${at} is not resting on a solid block`);
    }
  }

  // Legal actions: none costs more AP than there is, and none once the run is over.
  const legal = legalActions(state);
  for (const action of legal) {
    if (action.ap > state.ap) {
      problems.push(`a legal action costs ${action.ap} AP with ${state.ap} left`);
    }
  }
  if (!isRunActive(state) && legal.length > 0) {
    problems.push('the run has ended but there are legal actions');
  }
  return problems;
}

/**
 * Play up to `maxDecisions` decisions of one run with a random policy,
 * checking after each.
 */
function playAndCheck(seed: number, policyName: string, maxDecisions: number): void {
  const policy = makePolicy(policyName, seed);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  expect(invariantProblems(state), `seed ${seed}, new run`).toEqual([]);
  // The state as a string, taken before each call and compared after it.
  let before = snapshot(state);

  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = policy.decide(state);
    const label = `seed ${seed}, ${policyName}, decision ${step} (${decisionKey(decision)})`;

    // The engine must not throw on a legal action or on ending the shift.
    // (If it does, the test fails with the engine's own error.)
    const result = decision === 'endShift' ? endShift(state) : applyAction(state, decision);

    // The state that was passed in is untouched.
    expect(snapshot(state) === before, `${label}: the input state was changed`).toBe(true);

    state = result.state;
    before = snapshot(state);
    expect(invariantProblems(state), label).toEqual([]);

    // No soft-lock: the run has ended, or the shift can be ended (and the
    // preview that goes with it works). Neither changes the state; the next
    // turn of the loop, or the line after it, checks that.
    if (isRunActive(state)) {
      expect(() => endShift(state), `${label}: endShift`).not.toThrow();
      expect(() => previewCubePhase(state), `${label}: previewCubePhase`).not.toThrow();
    }
  }
  expect(snapshot(state) === before, `seed ${seed}: the last state was changed`).toBe(true);
}

describe('property tests: random legal play', () => {
  // The seeds and lengths of the runs below.
  const WANDER_SEEDS = [1, 2, 3, 4, 5, 6];
  const WANDER_DECISIONS = 350;
  // Seed 110 was added with the forest (issue #70): seed 107, whose run was
  // the one still going after 150 decisions, now runs out of fuel at 147.
  // Seed 123 took the place of seed 108 with issue #75: since then none of
  // the others is still going after 150 decisions, and 123 is.
  const RANDOM_SEEDS = [101, 102, 103, 104, 105, 106, 107, 123, 110];
  const RANDOM_DECISIONS = 150;

  // `wander` never leaves, so these runs go deep and long: most end out of
  // fuel between 170 and 240 decisions in.
  it.each(WANDER_SEEDS)(
    `wander policy, seed %i: the state stays valid for ${WANDER_DECISIONS} decisions`,
    (seed) => {
      playAndCheck(seed, 'wander', WANDER_DECISIONS);
    },
  );

  // `random` may also leave, which covers the run ending by choice.
  it.each(RANDOM_SEEDS)(
    `random policy, seed %i: the state stays valid for ${RANDOM_DECISIONS} decisions`,
    (seed) => {
      playAndCheck(seed, 'random', RANDOM_DECISIONS);
    },
  );

  it('those runs end in more than one way', () => {
    // A check on the tests themselves: if every run ended the same way, part
    // of the engine would not be exercised. It plays the same runs again
    // (same seeds, policies and lengths, so the same decisions) without the
    // per-step checks, which is quick. So it depends on no other test having
    // run, and is never skipped.
    const endings = new Set<string>();
    const plays: [number[], string, number][] = [
      [WANDER_SEEDS, 'wander', WANDER_DECISIONS],
      [RANDOM_SEEDS, 'random', RANDOM_DECISIONS],
    ];
    for (const [seeds, policyName, maxDecisions] of plays) {
      for (const seed of seeds) {
        const { finalState } = playRun({
          seed,
          contractId: CONTRACT,
          loadoutId: DEFAULT_LOADOUT_ID,
          policy: makePolicy(policyName, seed),
          maxShifts: Infinity,
          maxDecisions,
        });
        endings.add(finalState.status.kind === 'ended' ? finalState.status.cause : 'active');
      }
    }
    expect([...endings]).toEqual(expect.arrayContaining(['left', 'outOfFuel', 'active']));
  });
});

// ---------------------------------------------------------------------------
// The action list shows only what the player can see (issues #15 and #33)
// ---------------------------------------------------------------------------
//
// Since issue #33 the lamp decides how much the avatar knows: lit, it knows
// the 17 cells in reach and looks over edges; out, only the six cells it
// touches. The check below must hold in both, and across the moment the lamp
// goes out, so it is run with the lamp lit, out, and running out.

// How far around the avatar to look for cells that matter. No rule looks
// further than this. Sideways and up, reach is 1 cell. Down, the furthest
// cell any rule reads is the floor that ends the longest drop a move may
// choose, taken from a ladder: 1 cell climbed, `maxChosenDropBlocks` fallen,
// and the floor below that. The window goes 2 cells beyond it, and follows
// the data value if that is ever raised.
const NEAR_SIDEWAYS = 3;
const NEAR_ABOVE = 2;
const NEAR_BELOW = AVATAR.maxChosenDropBlocks + 4;

/**
 * The unrevealed cells near the avatar whose content changes `legalActions`.
 * Each one in turn is changed in a copy of the state, in two ways, and the
 * copy's action list is compared with the original's:
 * - the block is swapped (open becomes stone, solid becomes air);
 * - the cell is made open with a ladder in it (footing depends on ladders
 *   as well as on rock, so a ladder nobody has seen must not matter either).
 * If the list changed, the player could learn what an unseen cell holds by
 * reading the list, so the result must be empty.
 *
 * This is the check the review of issue #15 used, kept small enough for CI
 * by trying only unrevealed cells close to the avatar.
 */
function unseenCellsThatChangeTheActionList(state: GameState): Vec3[] {
  const before = JSON.stringify(legalActions(state));
  const here = state.avatar.pos;
  const found: Vec3[] = [];
  for (let z = here.z - NEAR_ABOVE; z <= here.z + NEAR_BELOW; z += 1) {
    for (let y = here.y - NEAR_SIDEWAYS; y <= here.y + NEAR_SIDEWAYS; y += 1) {
      for (let x = here.x - NEAR_SIDEWAYS; x <= here.x + NEAR_SIDEWAYS; x += 1) {
        const pos = { x, y, z };
        if (!inGrid(state.size, pos) || isRevealed(state, pos)) {
          continue;
        }
        const swapped = cloneState(state);
        setBlock(swapped, pos, isOpen(state, pos) ? BLOCKS.stone.code : BLOCKS.air.code);
        const withLadder = cloneState(state);
        setBlock(withLadder, pos, BLOCKS.air.code);
        setStructure(withLadder, pos, STRUCTURES.ladder.code);
        if (
          JSON.stringify(legalActions(swapped)) !== before ||
          JSON.stringify(legalActions(withLadder)) !== before
        ) {
          found.push(pos);
        }
      }
    }
  }
  return found;
}

/**
 * Play one run with the wander policy and make the check above after every
 * `every`-th decision.
 *
 * `startingLampOil` is the oil the run starts with, or `null` for the
 * loadout's own amount. With 0 the lamp is out from the first shift on, so
 * the avatar works by touch nearly all the way. With 1 it goes out at the
 * first burn, a few shifts in, with the avatar already underground.
 */
function playAndCheckUnseenCells(
  seed: number,
  startingLampOil: number | null,
  maxDecisions: number,
  every: number,
): { checks: number; checksWithLampOut: number } {
  const policy = makePolicy('wander', seed);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  if (startingLampOil !== null) {
    // Not reachable through the public surface: set the oil by hand, as a
    // scenario test would, then end a shift so that the engine has run with it.
    state = cloneState(state);
    state.lampOil = startingLampOil;
    state = endShift(state).state;
  }
  let checks = 0;
  let checksWithLampOut = 0;
  for (let step = 1; step <= maxDecisions && isRunActive(state); step += 1) {
    const decision = policy.decide(state);
    state = decision === 'endShift' ? endShift(state).state : applyAction(state, decision).state;
    if (step % every === 0 && isRunActive(state)) {
      const label = `seed ${seed}, decision ${step} (${decisionKey(decision)}), lamp oil ${state.lampOil}`;
      expect(unseenCellsThatChangeTheActionList(state), label).toEqual([]);
      checks += 1;
      checksWithLampOut += state.lampOil === 0 ? 1 : 0;
    }
  }
  return { checks, checksWithLampOut };
}

// Each of these runs tries two changes to every unseen cell near the avatar,
// hundreds of times, which takes a few seconds: more than the default limit
// of 5 on a slow machine.
const UNSEEN_CELLS_TIMEOUT_MS = 30000;

describe('property tests: unrevealed cells do not change the action list (issues #15, #33)', () => {
  // The seeds are ones whose wander run lasts long enough to make the number
  // of checks asked for below. Without a fuel refill (issue #32) a wander run
  // ends out of fuel after about 120 to 250 decisions. (Issue #41 halved the
  // starting lamp oil, which shortened the runs of seeds 16 and 20 to just
  // under the number needed, so seeds 19 and 37 took their place. Seed 5
  // took the place of seed 11 with issue #75, whose run it shortened to 128
  // decisions.)
  it.each([5, 19, 37])(
    'with the lamp lit at the start, seed %i',
    (seed) => {
      const { checks } = playAndCheckUnseenCells(seed, null, 300, 4);
      expect(checks).toBeGreaterThan(40);
    },
    UNSEEN_CELLS_TIMEOUT_MS,
  );

  // Seed 23 took the place of seed 27 with the forest (issue #70), which
  // shortened seed 27's run in the dark to 57 checks; seed 38 took the place
  // of seed 23 when the top layer stopped being known from the start (73).
  // Seeds 19 and 44 took the places of seeds 38 and 47 with issue #75, which
  // shortened their runs in the dark to 75 and 67 checks.
  it.each([19, 34, 44])(
    'with the lamp out from the start, seed %i',
    (seed) => {
      const { checks, checksWithLampOut } = playAndCheckUnseenCells(seed, 0, 300, 2);
      // Most checks are in the dark; the wander policy may craft a little oil.
      expect(checks).toBeGreaterThan(80);
      expect(checksWithLampOut).toBeGreaterThan(checks / 2);
    },
    UNSEEN_CELLS_TIMEOUT_MS,
  );

  it.each([31, 32, 33])(
    'with the lamp running out during the run, seed %i',
    (seed) => {
      // Checked after every decision while the lamp is lit and for a good while
      // after it goes out, so the decisions on both sides of that moment are
      // covered. Both lights must have been seen.
      const { checks, checksWithLampOut } = playAndCheckUnseenCells(seed, 1, 120, 1);
      expect(checksWithLampOut).toBeGreaterThan(20);
      expect(checks - checksWithLampOut).toBeGreaterThan(5);
    },
    UNSEEN_CELLS_TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------------
// The ground under a tree (issue #70 item 7)
// ---------------------------------------------------------------------------
//
// "The ground under a tree is unrevealed until the tree is cut; nothing
// offered, shown, forecast, or costed may depend on it." So after each
// decision of a run, every unrevealed layer-0 block under a tree is changed,
// all at once, in two ways (to coal; to open space), and the action list,
// the forecast, the text view and the tap map's tiles of the surface and
// layer 0 must come out the same as before.

/** Everything the player is offered and shown, as one string. */
function whatThePlayerGets(state: GameState): string {
  const view = renderView(buildView(state, { radius: null, layers: 1, deepestZ: 0 }));
  const window = { x0: 0, y0: 0, size: state.size.x };
  const tiles = [WORLD.surfaceZ, 0].map((z) => buildLayer(state, z, window));
  return JSON.stringify({
    actions: legalActions(state),
    forecast: isRunActive(state) ? previewCubePhase(state) : null,
    view,
    tiles,
  });
}

/** A copy of `state` with every unseen block under a tree set to `blockCode`. */
function withGroundUnderTrees(state: GameState, blockCode: number): GameState {
  const copy = cloneState(state);
  for (let y = 0; y < state.size.y; y += 1) {
    for (let x = 0; x < state.size.x; x += 1) {
      const ground = { x, y, z: 0 };
      if (isUnderTree(state, ground) && !isRevealed(state, ground)) {
        setBlock(copy, ground, blockCode);
      }
    }
  }
  return copy;
}

/** Play a run, checking after every `every`-th decision. Returns the number of checks. */
function playAndCheckGroundUnderTrees(
  seed: number,
  policyName: string,
  maxDecisions: number,
  every: number,
): number {
  const policy = makePolicy(policyName, seed);
  let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
  let checks = 0;
  for (let step = 0; step <= maxDecisions && isRunActive(state); step += 1) {
    if (step % every === 0) {
      const before = whatThePlayerGets(state);
      for (const code of [BLOCKS.coalSeam.code, BLOCKS.air.code]) {
        const label = `seed ${seed}, ${policyName}, decision ${step}, ground set to ${code}`;
        expect(whatThePlayerGets(withGroundUnderTrees(state, code)) === before, label).toBe(true);
      }
      checks += 1;
    }
    const decision = policy.decide(state);
    state = decision === 'endShift' ? endShift(state).state : applyAction(state, decision).state;
  }
  return checks;
}

describe('property tests: the ground under a tree changes nothing the player gets (issue #70)', () => {
  // Seeds whose wander or random run cuts trees on the surface (182 cuts eight
  // and sees three grow back: tests/golden), and two that dig near the start.
  // (Random seed 123 took the place of 110 with issue #75: seed 110's random
  // run now leaves the cube after 6 decisions.)
  // (The coal policy now finds coal in sight within a few steps and leaves.)
  it.each([
    [182, 'wander'],
    [46, 'wander'],
    [3, 'wander'],
    [123, 'random'],
  ])(
    'seed %i, %s policy',
    (seed, policyName) => {
      const checks = playAndCheckGroundUnderTrees(seed, policyName, 120, 3);
      expect(checks).toBeGreaterThan(10);
    },
    UNSEEN_CELLS_TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------------
// Only exposed faces are known (issue #75 item 5)
// ---------------------------------------------------------------------------
//
// The pick no longer shows the cells it could reach, the cell overhead or
// what lies over an edge. So along a dig, every cell the player has not seen
// is changed, all at once (to open space; to stone), and what the player is
// offered and shown (the action list with its descriptions and the warnings
// the tap map asks about, the forecast,
// the text view and the tap map of the miner's layer and the layers next to
// it) must come out the same. Ore is left alone: mineral traces on seen rock
// tell of nearby ore by design (decision note 0012).

/** A copy of `state` with every unseen cell that is not ore set to `blockCode`. */
function withUnseenCells(state: GameState, blockCode: number): GameState {
  const copy = cloneState(state);
  const oreCodes = TELLS.mineralTraces.sourceBlocks.map(
    (id) => BLOCKS[id as keyof typeof BLOCKS].code,
  );
  for (let index = 0; index < state.blocks.length; index += 1) {
    const pos = cellPosition(state.size, index);
    if (!isRevealed(state, pos) && !oreCodes.includes(state.blocks[index] as number)) {
      setBlock(copy, pos, blockCode);
    }
  }
  return copy;
}

/** What the player gets, with the tap map of the miner's layer and those above and below. */
function whatThePlayerGetsNearTheMiner(state: GameState): string {
  const z = state.avatar.pos.z;
  const window = { x0: 0, y0: 0, size: state.size.x };
  const layers = [z - 1, z, z + 1].filter(
    (layer) => layer >= WORLD.surfaceZ && layer < state.size.z,
  );
  return JSON.stringify({
    actions: legalActions(state).map((action) => [
      action,
      describeChoice(state, action),
      choiceWarning(state, action),
    ]),
    forecast: isRunActive(state) ? previewCubePhase(state) : null,
    view: renderView(buildView(state, { radius: 4, layers: 1, deepestZ: z })),
    tiles: layers.map((layer) => buildLayer(state, layer, window)),
  });
}

describe('property tests: unseen cells change nothing the player gets (issue #75)', () => {
  it.each([
    [8, 'staircase'],
    [11, 'staircase'],
    [9, 'wander'],
  ])(
    'seed %i, %s policy',
    (seed, policyName) => {
      const policy = makePolicy(policyName, seed);
      let state = createRun(seed, CONTRACT, DEFAULT_LOADOUT_ID);
      let checks = 0;
      let digsDown = 0;
      for (let step = 0; step <= 90 && isRunActive(state); step += 1) {
        if (step % 3 === 0) {
          const before = whatThePlayerGetsNearTheMiner(state);
          for (const code of [BLOCKS.air.code, BLOCKS.stone.code]) {
            const label = `seed ${seed}, ${policyName}, decision ${step}, unseen cells set to ${code}`;
            expect(
              whatThePlayerGetsNearTheMiner(withUnseenCells(state, code)) === before,
              label,
            ).toBe(true);
          }
          checks += 1;
        }
        const decision = policy.decide(state);
        if (decision !== 'endShift' && decision.type === 'mine') {
          const here = state.avatar.pos;
          if (decision.target.x === here.x && decision.target.y === here.y) {
            digsDown += 1;
          }
        }
        state =
          decision === 'endShift' ? endShift(state).state : applyAction(state, decision).state;
      }
      expect(checks).toBeGreaterThan(10);
      // The runs do dig down, so the dig-down text is among what is checked.
      expect(digsDown).toBeGreaterThan(1);
    },
    UNSEEN_CELLS_TIMEOUT_MS,
  );
});
