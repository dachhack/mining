// Tests for the tap map of the phone preview (issue #66): the tile model it
// draws from (src/app/map/tiles.ts), which choices a tap stands for
// (targets.ts), the warnings that stop a tap acting at once
// (text/describe.ts `choiceWarning`), and the camera (camera.ts).
// No DOM: the canvas code draws only from the tiles tested here.
import { describe, expect, it } from 'vitest';

import { AVATAR, BLOCKS, STRUCTURES, TELLS, WORLD } from '../../src/data';
import {
  applyAction,
  cellIndex,
  cellPosition,
  createRun,
  endShift,
  isRevealed,
  legalActions,
} from '../../src/engine';
import type { Action, GameState } from '../../src/engine';
import {
  VIEW_CELLS,
  cellAt,
  centredOn,
  clampCamera,
  isInView,
  panned,
} from '../../src/app/map/camera';
import { actionsForCell } from '../../src/app/map/targets';
import { buildLayer, layerContext } from '../../src/app/map/tiles';
import { choiceName, choiceWarning } from '../../src/app/text/describe';

/** Take the choice with this play-tool name. */
function takeNamed(state: GameState, name: string): GameState {
  if (name === 'end') {
    return endShift(state).state;
  }
  const action = legalActions(state).find((a) => choiceName(state, a) === name);
  if (action === undefined) {
    throw new Error(`expected "${name}" to be on the list`);
  }
  return applyAction(state, action).state;
}

function takeAll(state: GameState, names: string[]): GameState {
  return names.reduce((current, name) => takeNamed(current, name), state);
}

/** Seed 7, from the surface: the states the tests look at. */
function seed7(): GameState {
  return createRun(7, 'none', 'standard');
}

/** A few states with plenty of unseen cells, on the surface and underground. */
function sampleStates(): { name: string; state: GameState }[] {
  const dug = takeAll(seed7(), ['mine-down', 'mine-down', 'end', 'mine-w', 'mine-w-down']);
  const torch = takeAll(seed7(), ['mine-down']);
  torch.structures[cellIndex(torch.size, torch.avatar.pos)] = STRUCTURES.torch.code;
  torch.looseItems = [{ pos: { ...torch.avatar.pos }, item: 'coal', count: 2 }];
  const dark = takeAll(seed7(), ['mine-down', 'mine-down']);
  dark.lampOil = 0;
  return [
    { name: 'start', state: seed7() },
    { name: 'dug in', state: dug },
    { name: 'torch and items', state: torch },
    { name: 'lamp out', state: dark },
  ];
}

/**
 * Change every unseen cell: open or solid, and when open, a ladder and loose
 * coal in it. Ore is left alone: mineral traces on seen rock depend on
 * nearby ore by design (decision note 0012), and that is the engine's rule.
 */
function changeUnseen(state: GameState, toOpen: boolean): GameState {
  const copy: GameState = structuredClone(state);
  const oreCodes = TELLS.mineralTraces.sourceBlocks.map(
    (id) => BLOCKS[id as keyof typeof BLOCKS].code,
  );
  const loose = [];
  for (let index = 0; index < copy.blocks.length; index += 1) {
    const pos = cellPosition(copy.size, index);
    if (isRevealed(copy, pos) || oreCodes.includes(copy.blocks[index] as number)) {
      continue;
    }
    copy.blocks[index] = toOpen ? BLOCKS.air.code : BLOCKS.crystal.code;
    if (toOpen) {
      copy.structures[index] = STRUCTURES.ladder.code;
      loose.push({ pos, item: 'coal', count: 2 });
    }
  }
  copy.looseItems = [...copy.looseItems, ...loose];
  return copy;
}

/** Every layer of the cube, the surface included, as one window covering the whole layer. */
function allTiles(state: GameState) {
  const context = layerContext(state);
  const layers = [];
  for (let z = WORLD.surfaceZ; z < state.size.z; z += 1) {
    layers.push(buildLayer(state, z, { x0: 0, y0: 0, size: state.size.x }, context));
  }
  return layers;
}

/**
 * The tap choices of every cell near the miner, as JSON. Every action acts
 * on a cell touching the miner's (or the one under it), so cells further
 * away have none, and `actionsForCell` calls `legalActions`, which is slow
 * to run for all 32,768 cells.
 */
function allTaps(state: GameState): string[] {
  const taps: string[] = [];
  const here = state.avatar.pos;
  for (let z = Math.max(WORLD.surfaceZ, here.z - 1); z <= here.z + 2; z += 1) {
    for (let y = here.y - 2; y <= here.y + 2; y += 1) {
      for (let x = here.x - 2; x <= here.x + 2; x += 1) {
        const actions = actionsForCell(state, z, x, y);
        if (actions.length > 0) {
          taps.push(`${x},${y},${z}: ${actions.map((a) => JSON.stringify(a)).join(' | ')}`);
        }
      }
    }
  }
  return taps;
}

describe('the tap map shows only what the player knows (issue #66)', () => {
  for (const { name, state } of sampleStates()) {
    it(`draws the same map whatever the unseen cells hold: ${name}`, () => {
      const asIs = allTiles(state);
      const open = changeUnseen(state, true);
      const solid = changeUnseen(state, false);
      // The change is real: thousands of cells differ.
      let changed = 0;
      for (let i = 0; i < state.blocks.length; i += 1) {
        if (open.blocks[i] !== state.blocks[i] || solid.blocks[i] !== state.blocks[i]) {
          changed += 1;
        }
      }
      expect(changed).toBeGreaterThan(1000);
      expect(allTiles(open)).toEqual(asIs);
      expect(allTiles(solid)).toEqual(asIs);
      // And a tap stands for the same choices.
      expect(allTaps(open)).toEqual(allTaps(state));
      expect(allTaps(solid)).toEqual(allTaps(state));
    }, 30_000);
  }

  it('an unseen cell is never lit, never coloured, and holds nothing', () => {
    for (const { state } of sampleStates()) {
      for (const layer of allTiles(state)) {
        for (const tile of layer.flat()) {
          if (tile.kind === 'unknown') {
            expect(tile).toMatchObject({
              block: null,
              lit: false,
              traced: false,
              structure: null,
              items: false,
            });
          }
        }
      }
    }
  });

  it('marks the miner, and on the surface draws it on the block it stands on', () => {
    const start = seed7();
    const here = start.avatar.pos;
    expect(here.z).toBe(WORLD.surfaceZ);
    const layer0 = buildLayer(start, 0, { x0: here.x, y0: here.y, size: 1 });
    expect(layer0[0]?.[0]).toMatchObject({ kind: 'block', block: 'dirt', miner: true });
    const below = takeAll(start, ['mine-down']);
    const tile = buildLayer(below, below.avatar.pos.z, {
      x0: below.avatar.pos.x,
      y0: below.avatar.pos.y,
      size: 1,
    })[0]?.[0];
    expect(tile).toMatchObject({ kind: 'open', miner: true, lit: true });
  });

  it('draws a seen cell out of the light darker, and the lamp lights the cells round the miner', () => {
    // Two blocks down, then the shift ends: the miner is on layer 1.
    const state = takeAll(seed7(), ['mine-down', 'mine-down', 'end']);
    const here = state.avatar.pos;
    const atMiner = buildLayer(state, here.z, { x0: here.x, y0: here.y, size: 1 })[0]?.[0];
    expect(atMiner?.lit).toBe(true);
    const dark: GameState = structuredClone(state);
    dark.lampOil = 0;
    const unlit = buildLayer(dark, here.z, { x0: here.x, y0: here.y, size: 1 })[0]?.[0];
    expect(unlit).toMatchObject({ kind: 'open', lit: false });
    // The top layer is in daylight whatever the lamp does.
    for (const tile of buildLayer(dark, 0, { x0: 0, y0: 0, size: dark.size.x }).flat()) {
      if (tile.kind !== 'unknown') {
        expect(tile.lit).toBe(true);
      }
    }
    expect(AVATAR.lightRadiusWithOil).toBeGreaterThan(0);
  });

  it('shows torches and loose items as marks', () => {
    const state = sampleStates()[2]?.state as GameState;
    const here = state.avatar.pos;
    const tile = buildLayer(state, here.z, { x0: here.x, y0: here.y, size: 1 })[0]?.[0];
    expect(tile).toMatchObject({ structure: 'torch', items: true, miner: true });
  });
});

/** The play-tool names of the choices a tap stands for. */
function tapNames(state: GameState, z: number, x: number, y: number): string[] {
  return actionsForCell(state, z, x, y).map((a: Action) => choiceName(state, a));
}

describe('what a tap on the map does (issue #66)', () => {
  it('on the surface: the own cell offers mining underfoot; a neighbour, a walk and a mine', () => {
    const state = seed7();
    const { x, y } = state.avatar.pos;
    expect(tapNames(state, 0, x, y)).toEqual(['mine-down']);
    expect(tapNames(state, 0, x + 1, y)).toEqual(['e', 'mine-e-down']);
    // Two cells away: nothing.
    expect(tapNames(state, 0, x + 2, y)).toEqual([]);
  });

  it('underground: a neighbouring block is mined, an open neighbour is walked into', () => {
    // Seed 7 after mining down: the miner is at x16 y16 on layer 0, with dirt
    // to the west and stone to the east (see `npm run play -- --seed 7 --do mine-down`).
    let state = takeAll(seed7(), ['mine-down']);
    const { x, y, z } = state.avatar.pos;
    expect(tapNames(state, z, x - 1, y)).toEqual(['mine-w']);
    // East is stone; stepping up east onto the surface is on the surface layer, not here.
    expect(tapNames(state, z, x + 1, y)).toEqual(['mine-e']);
    expect(tapNames(state, WORLD.surfaceZ, x + 1, y)).toEqual(['e']);
    // The own cell: mining underfoot. The diagonal-down mines are on the layer below.
    expect(tapNames(state, z, x, y)).toEqual(['mine-down']);
    expect(tapNames(state, z + 1, x - 1, y)).toEqual(['mine-w-down']);
    state = takeNamed(state, 'mine-w');
    expect(tapNames(state, z, x - 1, y)).toEqual(['w']);
  });

  it('crafting, dropping and ending the shift are on no cell', () => {
    const state = seed7();
    const onCells = new Set<string>();
    for (let z = WORLD.surfaceZ; z <= 1; z += 1) {
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          for (const name of tapNames(state, z, x, y)) {
            onCells.add(name);
          }
        }
      }
    }
    for (const name of onCells) {
      expect(name).toMatch(/^(n|e|s|w|mine-.*|take-.*|up|down)$/);
    }
  });
});

describe('warnings that stop a tap acting at once (issue #66)', () => {
  it('mining underfoot warns of the fall; mining beside does not', () => {
    const state = takeAll(seed7(), ['mine-down']);
    const named = (name: string) => {
      const action = legalActions(state).find((a) => choiceName(state, a) === name);
      if (action === undefined) throw new Error(name);
      return action;
    };
    expect(choiceWarning(state, named('mine-down'))).toContain('you will fall');
    expect(choiceWarning(state, named('mine-w'))).toBeNull();
    expect(choiceWarning(state, named('n'))).toBeNull();
  });

  it('a move with a drop warns of the drop', () => {
    const state = seed7();
    const move = { type: 'move' as const, to: { x: 1, y: 1, z: 0 }, drop: 2, ap: 1 };
    expect(choiceWarning(state, move)).toBe('you will drop 2 blocks to layer 2');
  });
});

describe('the map camera (issue #66)', () => {
  const size = { x: 32, y: 32 };

  it('centres on a cell, kept inside the cube', () => {
    expect(VIEW_CELLS).toBe(16);
    expect(centredOn(16, 16, size)).toEqual({ x: 8, y: 8 });
    expect(centredOn(0, 0, size)).toEqual({ x: 0, y: 0 });
    expect(centredOn(31, 31, size)).toEqual({ x: 16, y: 16 });
    expect(clampCamera({ x: -3, y: 40 }, size)).toEqual({ x: 0, y: 16 });
  });

  it('a drag moves the window the other way, by whole and part cells', () => {
    // Dragging the map 40 px right with 20 px cells shows 2 cells more to the west.
    expect(panned({ x: 8, y: 8 }, 40, -10, 20, size)).toEqual({ x: 6, y: 8.5 });
    expect(panned({ x: 1, y: 8 }, 100, 0, 20, size)).toEqual({ x: 0, y: 8 });
  });

  it('finds the cell under a point, and says whether a cell is in view', () => {
    expect(cellAt({ x: 8, y: 8 }, 25, 5, 20)).toEqual({ x: 9, y: 8 });
    expect(cellAt({ x: 8.5, y: 8 }, 5, 5, 20)).toEqual({ x: 8, y: 8 });
    expect(isInView({ x: 8, y: 8 }, 8, 23)).toBe(true);
    expect(isInView({ x: 8, y: 8 }, 24, 8)).toBe(false);
    expect(isInView({ x: 8.5, y: 8 }, 8, 8)).toBe(false);
  });
});
