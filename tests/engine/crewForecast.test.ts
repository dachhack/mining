// The forecast of damage to the crew (issue #112; design doc 5.2):
// `previewCubePhase(state).crew` against what `endShift` then deals.
//
// - Fixed scenarios, one for each kind of hazard.
// - The "at least" and "may" cases: a pocket the player has not seen.
// - A fuzz over small hand-built cubes with hidden pockets under the tops.
// - Hidden cells change nothing in the forecast.

import { describe, expect, it } from 'vitest';
import { BLOCKS, CREW, STRUCTURES } from '../../src/data';
import type { Vec3 } from '../../src/data';
import { endShift, previewCubePhase } from '../../src/engine';
import type { CrewForecast, DamageCause, GameEvent, GameState } from '../../src/engine';
import { markWorked } from '../../src/engine/crew';
import { depthAt } from '../../src/engine/heightmap';
import { createRng, nextInt } from '../../src/engine/rng';
import type { RngState } from '../../src/engine/rng';
import { setGasOn, setLavaOn, setWaterOn } from '../../src/engine/standing';
import {
  armCharge,
  cloneState,
  isRevealed,
  setBlock,
  setCrackTimer,
  setGas,
  setLava,
  setRevealed,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { buildState, terrainLayers } from './helpers';
import type { BuildStateOptions } from './helpers';

/** A shift on which lava does not flow (odd), and one on which it does (even). */
const NO_LAVA_SHIFT = 3;
const LAVA_SHIFT = 4;

/** A pit from a grid of depths (one digit per square); stone unless `materials` says otherwise. */
function pit(
  depths: string[],
  options: Omit<BuildStateOptions, 'layers'> = {},
  materials?: string[],
  layerCount?: number,
): GameState {
  return buildState({
    layers: terrainLayers(depths, materials, layerCount),
    shift: NO_LAVA_SHIFT,
    ...options,
  });
}

/** Put a placed, armed explosive on the square (x, y), as the action does. */
function placeExplosive(state: GameState, x: number, y: number): void {
  const top = { x, y, z: depthAt(state, x, y) };
  setStructure(state, top, STRUCTURES.explosive.code);
  armCharge(state, top, 'explosive');
}

/** Crack the top block of (x, y) so that it falls when this shift ends (if it is unstable). */
function crackDue(state: GameState, x: number, y: number): void {
  setCrackTimer(state, { x, y, z: depthAt(state, x, y) }, 0);
}

/** A hidden pocket cell: open space under a top, holding what is given. */
function hidePocket(
  state: GameState,
  pos: Vec3,
  holds: { water?: number; lava?: number; gas?: number },
): void {
  setBlock(state, pos, BLOCKS.air.code);
  setWater(state, pos, holds.water ?? 0);
  setLava(state, pos, holds.lava ?? 0);
  setGas(state, pos, holds.gas ?? 0);
}

interface Dealt {
  cause: DamageCause;
  amount: number;
}

/** The `damageTaken` events of `events`, in order. */
function damageIn(events: GameEvent[]): Dealt[] {
  const dealt: Dealt[] = [];
  for (const event of events) {
    if (event.type === 'damageTaken') {
      dealt.push({ cause: event.cause, amount: event.amount });
    }
  }
  return dealt;
}

/**
 * What ending the shift deals to a crew that cannot run out of health: every
 * kind's full amount, in the order step (e) applies them. (With real health,
 * an entry never takes more than is left and the ones after a loss are not
 * applied; `dealtWithHealth` below does that sum.)
 */
function fullDamage(state: GameState): Dealt[] {
  const sturdy = cloneState(state);
  sturdy.crew.health = 1000;
  return damageIn(endShift(sturdy).events);
}

/** `entries` as step (e) would apply them to a crew with `health`. */
function dealtWithHealth(entries: Dealt[], health: number): Dealt[] {
  const dealt: Dealt[] = [];
  let left = health;
  for (const entry of entries) {
    if (left <= 0) {
      break;
    }
    const amount = Math.min(entry.amount, left);
    dealt.push({ cause: entry.cause, amount });
    left -= amount;
  }
  return dealt;
}

/** The forecast's entries as plain cause and amount. */
function forecastEntries(crew: CrewForecast): Dealt[] {
  return crew.damage.map((entry) => ({ cause: entry.cause, amount: entry.amount }));
}

/**
 * Check one state: the forecast against what `endShift` does. Returns the
 * forecast and the full damage, for the counts in the fuzz.
 *
 * - `exact` forecast: the same entries, in the same order; and with the
 *   crew's real health, the same `damageTaken` events, final health and loss.
 * - an `exact` entry in a forecast that is not exact overall: that kind's
 *   amount is still right.
 * - an `atLeast` entry: that kind deals this or more.
 * - `runLost` 'yes': the run is lost to crew damage.
 * - the totals add up.
 */
function checkForecast(state: GameState, label: string): { crew: CrewForecast; full: Dealt[] } {
  const crew = previewCubePhase(state).crew;
  const full = fullDamage(state);
  const result = endShift(state);

  let total = 0;
  let totalAtLeast = 0;
  for (const entry of crew.damage) {
    total += entry.amount;
    if (entry.certainty !== 'may') {
      totalAtLeast += entry.amount;
    }
    const real = full.find((dealt) => dealt.cause === entry.cause)?.amount ?? 0;
    if (entry.certainty === 'exact') {
      expect(real, `${label}: ${entry.cause} is exact`).toBe(entry.amount);
    } else if (entry.certainty === 'atLeast') {
      expect(real, `${label}: ${entry.cause} is at least`).toBeGreaterThanOrEqual(entry.amount);
    }
    // Every square named is a worked square, and the amount is the largest on any of them.
    expect(entry.squares.length, `${label}: ${entry.cause} squares`).toBeGreaterThan(0);
    expect(Math.max(...entry.squares.map((square) => square.amount))).toBe(entry.amount);
    for (const square of entry.squares) {
      expect(state.worked[square.x + state.size.x * square.y]).toBe(1);
    }
  }
  expect(crew.total, `${label}: total`).toBe(total);
  expect(crew.totalAtLeast, `${label}: totalAtLeast`).toBe(totalAtLeast);
  expect(crew.health).toBe(state.crew.health);
  expect(crew.healthAfter).toBe(Math.max(0, state.crew.health - total));

  const lostToDamage =
    result.state.status.kind === 'ended' &&
    result.state.status.cause !== 'outOfFuel' &&
    result.state.status.cause !== 'mineClosed';
  if (crew.exact) {
    expect(forecastEntries(crew), `${label}: exact forecast`).toEqual(full);
    expect(damageIn(result.events), `${label}: damage dealt`).toEqual(
      dealtWithHealth(full, state.crew.health),
    );
    expect(lostToDamage, `${label}: run lost`).toBe(crew.runLost === 'yes');
    expect(crew.runLost).not.toBe('may');
    if (lostToDamage) {
      expect(result.state.crew.health).toBe(0);
      expect(result.state.status.kind === 'ended' && result.state.status.cause).toBe(
        crew.lossCause,
      );
    }
  }
  if (crew.runLost === 'yes') {
    expect(lostToDamage, `${label}: run lost for certain`).toBe(true);
  } else if (crew.runLost === 'no') {
    expect(crew.lossCause).toBeNull();
  }
  return { crew, full };
}

describe('the forecast of crew damage: one scenario for each kind of hazard (issue #112)', () => {
  it('nothing reaches a worked square: no damage, exact, the run goes on', () => {
    const state = pit(['111', '111'], { worked: [{ x: 0, y: 0 }] });
    setWaterOn(state, 2, 1, 1);
    const { crew } = checkForecast(state, 'calm');
    expect(crew).toEqual({
      damage: [],
      total: 0,
      totalAtLeast: 0,
      exact: true,
      health: CREW.startHealth,
      healthAfter: CREW.startHealth,
      runLost: 'no',
      lossCause: null,
    });
  });

  it('a slump onto a worked square: 3, on the square it lands on', () => {
    // x0 is 2 levels above x1: steep. Its cracked block falls onto x2... the
    // foot of its slide path, which the crew worked.
    const state = pit(['024'], { worked: [{ x: 2, y: 0 }] }, undefined, 8);
    crackDue(state, 1, 0);
    // The cell under the block that falls is known (as after a scan), so
    // nothing hidden is uncovered and the forecast is exact.
    setRevealed(state, { x: 1, y: 0, z: 3 }, true);
    const { crew } = checkForecast(state, 'slump');
    expect(crew.exact).toBe(true);
    expect(crew.damage).toEqual([
      {
        cause: 'slump',
        amount: CREW.damage.slump,
        certainty: 'exact',
        squares: [{ x: 2, y: 0, amount: CREW.damage.slump }],
      },
    ]);
  });

  it('a slump from a worked square: 3', () => {
    const state = pit(['024'], { worked: [{ x: 1, y: 0 }] }, undefined, 8);
    crackDue(state, 1, 0);
    const { crew } = checkForecast(state, 'slump from');
    expect(forecastEntries(crew)).toEqual([{ cause: 'slump', amount: CREW.damage.slump }]);
    // The slump itself is certain even though it uncovers a hidden block.
    expect(crew.damage[0]?.certainty).toBe('exact');
    expect(crew.exact).toBe(false);
  });

  it('water that enters a worked square: 1', () => {
    const state = pit(['12'], { worked: [{ x: 1, y: 0 }] });
    setWaterOn(state, 0, 0, 1);
    const { crew } = checkForecast(state, 'water');
    expect(crew.damage).toEqual([
      {
        cause: 'water',
        amount: CREW.damage.water,
        certainty: 'exact',
        squares: [{ x: 1, y: 0, amount: CREW.damage.water }],
      },
    ]);
  });

  it('lava on a worked square 5, beside another 1: one kind, 5, both squares named', () => {
    const state = pit(['222'], {
      worked: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    setLavaOn(state, 0, 0, 1, false);
    const { crew } = checkForecast(state, 'lava');
    expect(crew.damage).toEqual([
      {
        cause: 'lava',
        amount: CREW.damage.lavaOn,
        certainty: 'exact',
        squares: [
          { x: 0, y: 0, amount: CREW.damage.lavaOn },
          { x: 1, y: 0, amount: CREW.damage.lavaBeside },
        ],
      },
    ]);
  });

  it('lava that flows onto a worked square on a lava shift: 5', () => {
    const state = pit(['12'], { worked: [{ x: 1, y: 0 }], shift: LAVA_SHIFT });
    setLavaOn(state, 0, 0, 1, false);
    const { crew } = checkForecast(state, 'lava flows');
    expect(forecastEntries(crew)).toEqual([{ cause: 'lava', amount: CREW.damage.lavaOn }]);
  });

  it('gas on a worked square: 1; a vent in reach clears it first: nothing', () => {
    const state = pit(['2222222'], { worked: [{ x: 0, y: 0 }] });
    setGasOn(state, 0, 0, 1);
    const { crew } = checkForecast(state, 'gas');
    expect(crew.damage).toEqual([
      {
        cause: 'gas',
        amount: CREW.damage.gas,
        certainty: 'exact',
        squares: [{ x: 0, y: 0, amount: CREW.damage.gas }],
      },
    ]);

    const vented = cloneState(state);
    setStructure(vented, { x: 1, y: 0, z: 2 }, STRUCTURES.vent.code);
    expect(checkForecast(vented, 'vented').crew.damage).toEqual([]);
  });

  it('a gas explosion beside a worked square: 3', () => {
    // Lava on x0 lights the gas on x1; the crew worked x2, beside the gas.
    const state = pit(['222'], { worked: [{ x: 2, y: 0 }] });
    setLavaOn(state, 0, 0, 1, false);
    setGasOn(state, 1, 0, 1);
    const { crew } = checkForecast(state, 'gas explosion');
    expect(crew.damage).toEqual([
      {
        cause: 'gasExplosion',
        amount: CREW.damage.gasExplosion,
        certainty: 'exact',
        squares: [{ x: 2, y: 0, amount: CREW.damage.gasExplosion }],
      },
    ]);
  });

  it('with no worked square nothing can hurt the crew, whatever is uncovered: exact', () => {
    const state = pit(['024']);
    crackDue(state, 1, 0);
    placeExplosive(state, 0, 0);
    const { crew } = checkForecast(state, 'nobody there');
    expect(crew.damage).toEqual([]);
    expect(crew.exact).toBe(true);
  });

  it('the blast of a charge that includes a worked square: 6', () => {
    const state = pit(['11111'], { worked: [{ x: 1, y: 0 }] });
    placeExplosive(state, 2, 0);
    const { crew } = checkForecast(state, 'charge');
    expect(forecastEntries(crew)).toEqual([{ cause: 'explosion', amount: CREW.damage.explosion }]);
    // The blast is certain; what it uncovers is not, so more may come.
    expect(crew.damage[0]?.certainty).toBe('exact');
    expect(crew.damage[0]?.squares).toEqual([{ x: 1, y: 0, amount: CREW.damage.explosion }]);
    expect(crew.exact).toBe(false);
  });

  it('armed unstable ore whose blast includes a worked square: 6', () => {
    const state = pit(['111'], { worked: [{ x: 0, y: 0 }] }, ['#U#']);
    armCharge(state, { x: 1, y: 0, z: 1 }, 'unstableOre');
    const { crew } = checkForecast(state, 'ore');
    expect(forecastEntries(crew)).toEqual([{ cause: 'explosion', amount: CREW.damage.explosion }]);
  });
});

describe('the forecast of crew damage: totals and the lost run (issue #112)', () => {
  /**
   * The scene of the review of PR #111, small: a slump onto a worked square
   * (3), water into one (1) and lava on one (5). With 8 health the run is lost.
   */
  function lostScene(health: number): GameState {
    const state = pit(
      ['024', '222', '122'],
      {
        health,
        worked: [
          { x: 2, y: 0 },
          { x: 0, y: 1 },
          { x: 2, y: 2 },
        ],
      },
      undefined,
      8,
    );
    crackDue(state, 1, 0);
    setRevealed(state, { x: 1, y: 0, z: 3 }, true); // known rock under the block that falls
    setWaterOn(state, 0, 2, 1); // flows north onto x0 y1
    setLavaOn(state, 2, 2, 1, false);
    return state;
  }

  it('kinds add up, in the order the cube phase meets them', () => {
    const { crew } = checkForecast(lostScene(10), 'three kinds');
    expect(forecastEntries(crew)).toEqual([
      { cause: 'slump', amount: 3 },
      { cause: 'water', amount: 1 },
      { cause: 'lava', amount: 5 },
    ]);
    expect(crew.total).toBe(9);
    expect(crew.healthAfter).toBe(1);
    expect(crew.runLost).toBe('no');
  });

  it('health 8: the forecast says the run is lost, and to what', () => {
    const state = lostScene(8);
    const { crew } = checkForecast(state, 'lost');
    expect(crew.exact).toBe(true);
    expect(crew.runLost).toBe('yes');
    expect(crew.lossCause).toBe('burned');
    expect(crew.healthAfter).toBe(0);
    const after = endShift(state).state;
    expect(after.status).toMatchObject({ kind: 'ended', outcome: 'lost', cause: 'burned' });
  });

  it('health 3: the slump alone is enough, and names the loss', () => {
    const { crew } = checkForecast(lostScene(3), 'buried');
    expect(crew.runLost).toBe('yes');
    expect(crew.lossCause).toBe('buried');
  });
});

describe('the forecast of crew damage: "at least" and "may" (issue #112)', () => {
  it('a slump uncovers a hidden block: what flows afterwards is "may"', () => {
    // The block on x1 falls onto x2. Water on x0 y1 will flow onto the worked
    // square x1 y1... unless something comes out from under the fallen block.
    const base = pit(['024', '122'], { worked: [{ x: 1, y: 1 }], health: 1 }, undefined, 8);
    crackDue(base, 1, 0);
    setWaterOn(base, 0, 1, 1);
    const { crew } = checkForecast(base, 'may');
    expect(crew.exact).toBe(false);
    expect(crew.damage).toEqual([
      {
        cause: 'water',
        amount: CREW.damage.water,
        certainty: 'may',
        squares: [{ x: 1, y: 1, amount: CREW.damage.water }],
      },
    ]);
    expect(crew.totalAtLeast).toBe(0);
    // Enough to lose the run as far as can be seen, but not certain.
    expect(crew.runLost).toBe('may');
    expect(crew.lossCause).toBe('drowned');
  });

  it('a hidden lava pocket under a slumping block: the real damage differs, the forecast does not', () => {
    const base = pit(['024', '122'], { worked: [{ x: 1, y: 1 }] }, undefined, 8);
    crackDue(base, 1, 0);
    const withPocket = cloneState(base);
    hidePocket(withPocket, { x: 1, y: 0, z: 3 }, { lava: 1 });
    // Nothing the player sees differs, so the forecast is the same...
    expect(isRevealed(withPocket, { x: 1, y: 0, z: 3 })).toBe(false);
    expect(previewCubePhase(withPocket)).toEqual(previewCubePhase(base));
    expect(previewCubePhase(base).crew.damage).toEqual([]);
    expect(previewCubePhase(base).crew.exact).toBe(false);
    // ...and the pocket's lava, out on x1 y0, burns the crew working beside it.
    expect(fullDamage(base)).toEqual([]);
    expect(fullDamage(withPocket)).toEqual([{ cause: 'lava', amount: CREW.damage.lavaBeside }]);
    checkForecast(withPocket, 'hidden lava');
  });

  it('a blast uncovers a hidden block: gas kinds are "at least", the rest exact', () => {
    // A charge on x2; gas on the worked square x5, out of the blast's reach.
    const base = pit(['111111'], { worked: [{ x: 5, y: 0 }] }, undefined, 6);
    placeExplosive(base, 2, 0);
    setGasOn(base, 5, 0, 1);
    const { crew } = checkForecast(base, 'at least');
    expect(crew.exact).toBe(false);
    expect(crew.damage).toEqual([
      {
        cause: 'gas',
        amount: CREW.damage.gas,
        certainty: 'atLeast',
        squares: [{ x: 5, y: 0, amount: CREW.damage.gas }],
      },
    ]);
    expect(crew.totalAtLeast).toBe(CREW.damage.gas);
  });

  it('a hidden gas pocket under a blast: more than the forecast, never less', () => {
    // The crew worked x4, beside the blast square x3. Under x3 is a gas
    // pocket: the blast opens it and the gas burns at once.
    const base = pit(['111111'], { worked: [{ x: 4, y: 0 }] }, undefined, 6);
    placeExplosive(base, 2, 0);
    const withPocket = cloneState(base);
    hidePocket(withPocket, { x: 3, y: 0, z: 2 }, { gas: 4 });
    expect(previewCubePhase(withPocket)).toEqual(previewCubePhase(base));
    expect(previewCubePhase(base).crew.damage).toEqual([]);
    expect(fullDamage(withPocket)).toEqual([
      { cause: 'gasExplosion', amount: CREW.damage.gasExplosion },
    ]);
    checkForecast(withPocket, 'hidden gas');
  });

  it('a relic in a blast: chance decides, so the forecast is not exact', () => {
    const state = pit(['111', '111'], { worked: [{ x: 2, y: 1 }] }, ['#r#', '###']);
    placeExplosive(state, 0, 0);
    // Known rock under the two blocks the blast surely destroys... the relic
    // alone makes the forecast inexact.
    setRevealed(state, { x: 0, y: 0, z: 2 }, true);
    setRevealed(state, { x: 0, y: 1, z: 2 }, true);
    expect(previewCubePhase(state).crew.exact).toBe(false);

    const noRelic = pit(['11', '11'], { worked: [{ x: 1, y: 1 }] });
    placeExplosive(noRelic, 0, 0);
    setRevealed(noRelic, { x: 0, y: 0, z: 2 }, true);
    setRevealed(noRelic, { x: 1, y: 0, z: 2 }, true);
    setRevealed(noRelic, { x: 0, y: 1, z: 2 }, true);
    expect(previewCubePhase(noRelic).crew.exact).toBe(true);
  });

  it('a scanned pocket that will be opened is not exact either: part of it may be hidden', () => {
    const state = pit(['024'], { worked: [{ x: 2, y: 0 }] }, undefined, 8);
    crackDue(state, 1, 0);
    hidePocket(state, { x: 1, y: 0, z: 3 }, { water: 1 });
    setRevealed(state, { x: 1, y: 0, z: 3 }, true);
    const { crew } = checkForecast(state, 'scanned pocket');
    expect(crew.exact).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The fuzz
// ---------------------------------------------------------------------------

const FUZZ_SIZE = 5;
const FUZZ_LAYERS = 7;
const TOP_MATERIALS = ['#', '#', '#', 'd', 'R', 'H', 'r', 'U'];

/** True one time in `n`. */
function oneIn(rng: RngState, n: number): boolean {
  return nextInt(rng, n) === 0;
}

/**
 * A small random cube in the middle of a shift: a pit of any shape (steep
 * steps included, as a hazard leaves them), pockets of water, lava and gas
 * hidden under the tops, water, lava and gas standing in the pit, cracks that
 * are due, charges, armed ore, vents, pumps, supports, a few scanned cells,
 * and squares the crew worked.
 */
function randomScene(seed: number): GameState {
  const rng = createRng(seed);
  // Half the scenes have no crack that is due, and half no charge, so that
  // calm scenes (an exact forecast) come up as often as wild ones.
  const withCracks = oneIn(rng, 2);
  const withCharges = oneIn(rng, 2);
  const depths: string[] = [];
  const materials: string[] = [];
  for (let y = 0; y < FUZZ_SIZE; y += 1) {
    let depthRow = '';
    let materialRow = '';
    for (let x = 0; x < FUZZ_SIZE; x += 1) {
      depthRow += String(nextInt(rng, 5));
      materialRow += TOP_MATERIALS[nextInt(rng, TOP_MATERIALS.length)] ?? '#';
    }
    depths.push(depthRow);
    materials.push(materialRow);
  }
  const state = buildState({
    layers: terrainLayers(depths, materials, FUZZ_LAYERS),
    shift: NO_LAVA_SHIFT + nextInt(rng, 2),
    health: 1 + nextInt(rng, CREW.startHealth),
  });

  for (let y = 0; y < FUZZ_SIZE; y += 1) {
    for (let x = 0; x < FUZZ_SIZE; x += 1) {
      const depth = depthAt(state, x, y);
      const top = { x, y, z: depth };
      // Under the top: hidden pockets, and now and then a scanned cell.
      for (let z = depth + 1; z < FUZZ_LAYERS - 1; z += 1) {
        const pos = { x, y, z };
        if (oneIn(rng, 4)) {
          const kind = nextInt(rng, 4);
          hidePocket(state, pos, {
            water: kind === 0 ? 1 : 0,
            lava: kind === 1 ? 1 : 0,
            gas: kind === 2 ? 4 : 0,
          });
        }
        if (oneIn(rng, 5)) {
          setRevealed(state, pos, true);
        }
      }
      if (oneIn(rng, 4)) {
        markWorked(state, x, y);
      }
      if (withCracks && oneIn(rng, 3)) {
        setCrackTimer(state, top, 0);
      }
      if (depth > 0) {
        if (oneIn(rng, 6)) setWaterOn(state, x, y, 1 + nextInt(rng, 3));
        if (oneIn(rng, 8)) setLavaOn(state, x, y, 1 + nextInt(rng, 2), oneIn(rng, 3));
        if (oneIn(rng, 6)) setGasOn(state, x, y, 1 + nextInt(rng, 6));
      }
      const placed = nextInt(rng, 16);
      if (placed === 0 && withCharges) {
        placeExplosive(state, x, y);
      } else if (placed === 1 && depth > 0) {
        setStructure(state, top, STRUCTURES.vent.code);
      } else if (placed === 2 && depth > 0) {
        setStructure(state, top, STRUCTURES.pump.code);
      } else if (placed === 3) {
        setStructure(state, top, STRUCTURES.support.code);
      }
      if (withCharges && materials[y]?.charAt(x) === 'U' && oneIn(rng, 2)) {
        armCharge(state, top, 'unstableOre');
      }
    }
  }
  return state;
}

describe('the forecast of crew damage: fuzz over hand-built cubes (issue #112)', () => {
  it('agrees with endShift wherever it claims to, over 600 random scenes', () => {
    let exactScenes = 0;
    let exactWithDamage = 0;
    let atLeastEntries = 0;
    let mayEntries = 0;
    let surprised = 0; // scenes where hidden things changed the damage
    let lostForCertain = 0;
    for (let seed = 1; seed <= 600; seed += 1) {
      const state = randomScene(seed);
      const { crew, full } = checkForecast(state, `seed ${seed}`);
      if (crew.exact) {
        exactScenes += 1;
        if (crew.total > 0) exactWithDamage += 1;
      } else if (JSON.stringify(forecastEntries(crew)) !== JSON.stringify(full)) {
        surprised += 1;
      }
      for (const entry of crew.damage) {
        if (entry.certainty === 'atLeast') atLeastEntries += 1;
        if (entry.certainty === 'may') mayEntries += 1;
      }
      if (crew.runLost === 'yes') lostForCertain += 1;
    }
    // The fuzz has teeth: every case is met many times.
    expect(exactScenes).toBeGreaterThan(30);
    expect(exactWithDamage).toBeGreaterThan(10);
    expect(atLeastEntries).toBeGreaterThan(10);
    expect(mayEntries).toBeGreaterThan(30);
    expect(surprised).toBeGreaterThan(10);
    expect(lostForCertain).toBeGreaterThan(10);
  });

  it('hidden cells change nothing in the forecast: every pocket filled in, the same forecast', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const state = randomScene(seed);
      // Turn every unrevealed cell under a top into plain stone.
      const filled = cloneState(state);
      for (let y = 0; y < FUZZ_SIZE; y += 1) {
        for (let x = 0; x < FUZZ_SIZE; x += 1) {
          for (let z = depthAt(state, x, y) + 1; z < FUZZ_LAYERS; z += 1) {
            const pos = { x, y, z };
            if (!isRevealed(state, pos)) {
              setBlock(filled, pos, BLOCKS.stone.code);
              setWater(filled, pos, 0);
              setLava(filled, pos, 0);
              setGas(filled, pos, 0);
            }
          }
        }
      }
      expect(previewCubePhase(filled), `seed ${seed}`).toEqual(previewCubePhase(state));
    }
  });
});
