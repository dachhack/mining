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
  clampCells,
  followMiner,
  isInView,
  panned,
  zoomRange,
  zoomedAbout,
} from '../../src/app/map/camera';
import { actionsForCell, tapAction, tapIsRisky } from '../../src/app/map/targets';
import { buildLayer, layerContext } from '../../src/app/map/tiles';
import { choiceName, choiceWarning, tapActsAtOnce } from '../../src/app/text/describe';
import { updateReveal } from '../../src/engine/reveal';
import { buildState } from '../engine/helpers';

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
  const dug = takeAll(seed7(), ['mine-down', 'mine-down', 'end', 'mine-w', 'w', 'mine-down']);
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
 * Change every unseen cell: open or solid, and when open, a support and loose
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
      copy.structures[index] = STRUCTURES.support.code;
      loose.push({ pos, item: 'coal', count: 2 });
    }
  }
  copy.looseItems = [...copy.looseItems, ...loose];
  return copy;
}

/**
 * Every map layer, as one window covering the whole layer. Layer 0 is the
 * top view, which also carries the surface (trees, stumps, paths: issue #78).
 */
function allTiles(state: GameState) {
  const context = layerContext(state);
  const layers = [];
  for (let z = 0; z < state.size.z; z += 1) {
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
  for (let z = Math.max(0, here.z - 1); z <= here.z + 2; z += 1) {
    for (let y = here.y - 2; y <= here.y + 2; y += 1) {
      for (let x = here.x - 2; x <= here.x + 2; x += 1) {
        const actions = actionsForCell(state, z, x, y);
        if (actions.length > 0) {
          const chosen = JSON.stringify(tapAction(state, z, x, y));
          taps.push(
            `${x},${y},${z}: ${actions.map((a) => JSON.stringify(a)).join(' | ')} -> ${chosen}`,
          );
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

  it('marks the miner on the top view while it is on the surface, and its column on other layers', () => {
    // Issue #78: no separate surface layer; layer 0 is the top view, and the
    // miner standing on the surface is drawn on it, over the meadow.
    const start = seed7();
    const here = start.avatar.pos;
    expect(here.z).toBe(WORLD.surfaceZ);
    const top = buildLayer(start, 0, { x0: here.x, y0: here.y, size: 1 });
    expect(top[0]?.[0]).toMatchObject({
      kind: 'block',
      block: 'dirt',
      surface: 'meadow',
      miner: true,
      minerColumn: false,
    });
    const layer1 = buildLayer(start, 1, { x0: here.x, y0: here.y, size: 1 });
    expect(layer1[0]?.[0]).toMatchObject({ miner: false, minerColumn: true, surface: null });
    const below = takeAll(start, ['mine-down']);
    const tile = buildLayer(below, below.avatar.pos.z, {
      x0: below.avatar.pos.x,
      y0: below.avatar.pos.y,
      size: 1,
    })[0]?.[0];
    // Now on layer 0 itself, in the hole it dug, under the meadow.
    expect(tile).toMatchObject({ kind: 'open', miner: true, lit: true, surface: 'meadow' });
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

describe('what a tap on the map does (issues #66 and #78)', () => {
  it('on the top view, from the surface: a neighbour is a walk, the own cell digs down', () => {
    const state = seed7();
    const { x, y } = state.avatar.pos;
    expect(tapNames(state, 0, x + 1, y)).toEqual(['e']);
    expect(tapNames(state, 0, x, y - 1)).toEqual(['n']);
    expect(tapNames(state, 0, x, y)).toEqual(['mine-down']);
    // Two cells away: nothing.
    expect(tapNames(state, 0, x + 2, y)).toEqual([]);
    // A surface walk carries no warning, so one tap walks.
    const east = tapAction(state, 0, x + 1, y);
    expect(east?.type).toBe('move');
    expect(east !== null && tapActsAtOnce(state, east)).toBe(true);
    // The layer below has nothing in reach from the surface but the block underfoot.
    expect(tapNames(state, 1, x + 1, y)).toEqual([]);
  });

  it('in a hole in the top layer: a tap on a neighbouring block mines it', () => {
    // Seed 7 after digging down: the miner is at x16 y16 in layer 0, dirt to
    // the west, stone to the east. (Before issue #80 east also offered a step
    // up onto the surface over that stone.)
    let state = takeAll(seed7(), ['mine-down']);
    const { x, y } = state.avatar.pos;
    // No step up east any more (issue #80): only the mine.
    expect(tapNames(state, 0, x + 1, y)).toEqual(['mine-e']);
    expect(tapAction(state, 0, x + 1, y)?.type).toBe('mine');
    expect(tapNames(state, 0, x - 1, y)).toContain('mine-w');
    expect(tapAction(state, 0, x - 1, y)?.type).toBe('mine');
    // The own cell digs down, from this layer or the one below.
    expect(tapAction(state, 0, x, y)).toMatchObject({ type: 'mine', target: { x, y, z: 1 } });
    expect(tapNames(state, 1, x, y)).toEqual(['mine-down']);
    expect(tapNames(state, 1, x - 1, y)).toEqual([]);
    // Once west is mined out, a tap there walks into it.
    state = takeNamed(state, 'mine-w');
    expect(tapAction(state, 0, x - 1, y)).toMatchObject({
      type: 'move',
      to: { x: x - 1, y, z: 0 },
    });
  });

  it('crafting, dropping and ending the shift are on no cell', () => {
    const state = seed7();
    const onCells = new Set<string>();
    for (let z = 0; z <= 1; z += 1) {
      for (let y = 0; y < state.size.y; y += 1) {
        for (let x = 0; x < state.size.x; x += 1) {
          for (const name of tapNames(state, z, x, y)) {
            onCells.add(name);
          }
        }
      }
    }
    for (const name of onCells) {
      expect(name).toMatch(/^(n|e|s|w|mine-.*|take-.*|cut-.*|up|down)$/);
    }
  });
});

describe('warnings that stop a tap acting at once (issue #66)', () => {
  it('no move and no dig down carries a warning: the miner never falls (issue #80)', () => {
    // Underground, with the cell under the block underfoot unseen: before
    // issue #80 the dig down warned of a fall there.
    const state = takeAll(seed7(), ['mine-down']);
    const names = legalActions(state).map((action) => choiceName(state, action));
    expect(names).toContain('mine-down');
    for (const action of legalActions(state)) {
      if (action.type === 'move' || action.type === 'mine') {
        expect(choiceWarning(state, action), choiceName(state, action)).toBeNull();
        expect(tapActsAtOnce(state, action)).toBe(true);
      }
    }
  });
});

describe('the map camera (issue #66)', () => {
  const size = { x: 32, y: 32 };

  it('centres on a cell, kept inside the cube', () => {
    expect(VIEW_CELLS).toBe(16);
    expect(centredOn(16, 16, size)).toEqual({ x: 8, y: 8, cells: 16 });
    expect(centredOn(0, 0, size)).toEqual({ x: 0, y: 0, cells: 16 });
    expect(centredOn(31, 31, size)).toEqual({ x: 16, y: 16, cells: 16 });
    expect(clampCamera({ x: -3, y: 40, cells: 16 }, size)).toEqual({ x: 0, y: 16, cells: 16 });
  });

  it('a drag moves the window the other way, by whole and part cells', () => {
    // Dragging the map 40 px right with 20 px cells shows 2 cells more to the west.
    expect(panned({ x: 8, y: 8, cells: 16 }, 40, -10, 20, size)).toEqual({
      x: 6,
      y: 8.5,
      cells: 16,
    });
    expect(panned({ x: 1, y: 8, cells: 16 }, 100, 0, 20, size)).toEqual({ x: 0, y: 8, cells: 16 });
  });

  it('finds the cell under a point, and says whether a cell is in view', () => {
    expect(cellAt({ x: 8, y: 8, cells: 16 }, 25, 5, 20)).toEqual({ x: 9, y: 8 });
    expect(cellAt({ x: 8.5, y: 8, cells: 16 }, 5, 5, 20)).toEqual({ x: 8, y: 8 });
    expect(isInView({ x: 8, y: 8, cells: 16 }, 8, 23)).toBe(true);
    expect(isInView({ x: 8, y: 8, cells: 16 }, 24, 8)).toBe(false);
    expect(isInView({ x: 8.5, y: 8, cells: 16 }, 8, 8)).toBe(false);
  });
});

describe('the map follows the miner (review of PR #67)', () => {
  const size = { x: 32, y: 32 };

  it('recentres when a neighbour of the miner is off screen, so the next tap can reach it', () => {
    // The miner at x8 in the left-hand column of a window starting at x8: the
    // cell to its west (x7) is in the cube but not drawn.
    expect(followMiner({ x: 8, y: 8, cells: 16 }, 8, 16, size)).toEqual({ x: 0, y: 8, cells: 16 });
    // The same on the right, top and bottom edges.
    expect(followMiner({ x: 8, y: 8, cells: 16 }, 23, 16, size)).toEqual({
      x: 15,
      y: 8,
      cells: 16,
    });
    expect(followMiner({ x: 8, y: 8, cells: 16 }, 16, 8, size)).toEqual({ x: 8, y: 0, cells: 16 });
    expect(followMiner({ x: 8, y: 8, cells: 16 }, 16, 23, size)).toEqual({
      x: 8,
      y: 15,
      cells: 16,
    });
  });

  it('leaves the camera alone while every neighbour is on screen, or at the edge of the cube', () => {
    expect(followMiner({ x: 8, y: 8, cells: 16 }, 9, 22, size)).toEqual({ x: 8, y: 8, cells: 16 });
    // At the cube's own edge there is no neighbour to reach beyond it.
    expect(followMiner({ x: 0, y: 0, cells: 16 }, 0, 0, size)).toEqual({ x: 0, y: 0, cells: 16 });
    expect(followMiner({ x: 16, y: 16, cells: 16 }, 31, 31, size)).toEqual({
      x: 16,
      y: 16,
      cells: 16,
    });
  });

  it('tap play never strands the miner: walking west from the middle keeps the next cell on screen', () => {
    let camera = centredOn(16, 16, size);
    for (let x = 16; x > 0; x -= 1) {
      camera = followMiner(camera, x, 16, size);
      expect(isInView(camera, x - 1, 16)).toBe(true);
    }
  });
});

describe('zoom (issue #69)', () => {
  const size = { x: 32, y: 32 };

  it('ranges from 8 cells across to the whole 32 x 32 layer, 16 by default', () => {
    expect(zoomRange(size)).toEqual({ min: 8, max: 32 });
    expect(clampCells(4, size)).toBe(8);
    expect(clampCells(50, size)).toBe(32);
    expect(centredOn(16, 16, size).cells).toBe(16);
    // The whole layer: the window starts at the corner whatever the centre.
    expect(centredOn(5, 27, size, 32)).toEqual({ x: 0, y: 0, cells: 32 });
    expect(centredOn(16, 16, size, 8)).toEqual({ x: 12, y: 12, cells: 8 });
  });

  it('zooming about a point keeps the cell under that point where it was', () => {
    // A 320 px map at 16 cells across: 20 px cells. The point (100, 60) is
    // over cube position x 8 + 5 = 13, y 8 + 3 = 11.
    const camera = { x: 8, y: 8, cells: 16 };
    const zoomedIn = zoomedAbout(camera, 8, 100, 60, 100, 60, 320, size);
    expect(zoomedIn.cells).toBe(8);
    // At 8 across the cells are 40 px, so the point is 2.5 and 1.5 cells in.
    expect(zoomedIn.x).toBeCloseTo(13 - 2.5);
    expect(zoomedIn.y).toBeCloseTo(11 - 1.5);
    expect(cellAt(zoomedIn, 100, 60, 40)).toEqual(cellAt(camera, 100, 60, 20));
    // Zooming out past the whole layer stops there, at the corner.
    expect(zoomedAbout(camera, 64, 100, 60, 100, 60, 320, size)).toEqual({
      x: 0,
      y: 0,
      cells: 32,
    });
  });

  it('a pinch whose midpoint moves also pans', () => {
    const camera = { x: 8, y: 8, cells: 16 };
    // Same zoom, midpoint moved 40 px right (2 cells at 20 px): like a drag.
    expect(zoomedAbout(camera, 16, 100, 100, 140, 100, 320, size)).toEqual(
      panned(camera, 40, 0, 20, size),
    );
  });

  it('the follow rule holds at the smallest and the largest zoom', () => {
    for (const cells of [8, 32]) {
      let camera = centredOn(16, 16, size, cells);
      // Walk west to the edge, then south to the bottom, one step at a time.
      const path: { x: number; y: number }[] = [];
      for (let x = 16; x >= 0; x -= 1) path.push({ x, y: 16 });
      for (let y = 17; y < 32; y += 1) path.push({ x: 0, y });
      for (const step of path) {
        camera = followMiner(camera, step.x, step.y, size);
        expect(camera.cells).toBe(cells);
        for (const near of [
          { x: step.x - 1, y: step.y },
          { x: step.x + 1, y: step.y },
          { x: step.x, y: step.y - 1 },
          { x: step.x, y: step.y + 1 },
        ]) {
          const inCube = near.x >= 0 && near.y >= 0 && near.x < 32 && near.y < 32;
          if (inCube) {
            expect(isInView(camera, near.x, near.y)).toBe(true);
          }
        }
      }
    }
    // At the whole layer the camera never needs to move.
    const whole = centredOn(16, 16, size, 32);
    expect(followMiner(whole, 0, 31, size)).toBe(whole);
  });
});

describe('the too-heavy warning (review of PR #67)', () => {
  it('a mine whose yield does not fit the carry limit warns, so it needs a second tap', () => {
    // Seed 7 after mining down: stone to the east gives 1 Stone (weight 2).
    const state: GameState = structuredClone(takeAll(seed7(), ['mine-down']));
    state.inventory = { ...state.inventory, coal: AVATAR.carryCapacity - 3 };
    const mineEast = legalActions(state).find((a) => choiceName(state, a) === 'mine-e');
    expect(mineEast).toBeDefined();
    if (mineEast !== undefined) {
      expect(choiceWarning(state, mineEast)).toBe(
        'too heavy to carry: it will be left lying there',
      );
      expect(tapActsAtOnce(state, mineEast)).toBe(false);
    }
  });
});

describe('the forest on the tap map (issue #70)', () => {
  /** A 3 x 3 cube, the miner on the surface in the middle, a tree east of it. */
  function forest(): GameState {
    const state = buildState({
      layers: [
        ['ddd', 'ddd', 'ddd'],
        ['ddd', 'ddd', 'ddd'],
      ],
      surface: ['p.o', '..T', '...'],
      avatar: { x: 1, y: 1, z: -1 },
    });
    updateReveal(state, []);
    return state;
  }

  it('draws each kind of surface cell on the top view, and a tree hides the block under it', () => {
    const tiles = buildLayer(forest(), 0, { x0: 0, y0: 0, size: 3 });
    expect(tiles[0]?.map((tile) => tile.surface)).toEqual(['path', 'meadow', 'outcrop']);
    const tree = tiles[1]?.[2];
    expect(tree?.surface).toBe('tree');
    // The block under the tree is unseen.
    expect(tree?.kind).toBe('unknown');
    // Open ground shows the block under it, with the surface kind over it.
    expect(tiles[1]?.[0]).toMatchObject({ kind: 'block', block: 'dirt', surface: 'meadow' });
    // The miner on the surface is drawn on the top view.
    expect(tiles[1]?.[1]?.miner).toBe(true);
    // Deeper layers carry no surface.
    const below = buildLayer(forest(), 1, { x0: 0, y0: 0, size: 3 });
    expect(below.flat().every((tile) => tile.surface === null)).toBe(true);
  });

  it('a window that reaches past the edge of the cube (zoomed out) draws no surface there', () => {
    // A zoomed-out camera (PR #71) can ask for one column and row past the
    // edge; there is no surface cell there to read.
    const tiles = buildLayer(forest(), 0, { x0: 0, y0: 0, size: 4 });
    expect(tiles[0]?.[3]?.surface).toBeNull();
    expect(tiles[3]?.[0]?.surface).toBeNull();
    expect(tiles[1]?.[2]?.surface).toBe('tree');
  });

  it('a tap on a tree beside the miner cuts it at once, and the block under it then shows', () => {
    const state = forest();
    expect(tapNames(state, 0, 2, 1)).toEqual(['cut-e']);
    const cut = tapAction(state, 0, 2, 1);
    expect(cut?.type).toBe('cutTree');
    expect(cut !== null && tapActsAtOnce(state, cut)).toBe(true);
    // After the cut: a stump, with the block under it shown on the top view.
    const after = applyAction(state, cut as Action).state;
    const tile = buildLayer(after, 0, { x0: 0, y0: 0, size: 3 })[1]?.[2];
    expect(tile).toMatchObject({ surface: 'stump', kind: 'block', block: 'dirt' });
    expect(tapNames(after, 0, 2, 1)).toEqual(['e']);
  });

  it('a cut whose timber is too heavy to carry needs a second tap', () => {
    const state = forest();
    state.inventory = { stone: 20 };
    const cut = tapAction(state, 0, 2, 1);
    expect(cut !== null && choiceWarning(state, cut)).toContain('too heavy');
    expect(cut !== null && tapActsAtOnce(state, cut)).toBe(false);
  });
});

describe('which taps need a second tap (review of PR #79; issue #80)', () => {
  it('no move is ever risky: the miner never falls', () => {
    // Seed 7 after digging down and mining west: the miner can move west,
    // up onto the surface, and nowhere it could fall.
    const state = takeAll(seed7(), ['mine-down', 'mine-w']);
    const moves = legalActions(state).filter((a) => a.type === 'move');
    expect(moves.length).toBeGreaterThan(1);
    for (const move of moves) {
      expect(tapIsRisky(state, move)).toBe(false);
    }
  });

  it('a yield too heavy to carry is two taps; a plain mine and a dig down are one', () => {
    const heavy: GameState = structuredClone(takeAll(seed7(), ['mine-down']));
    heavy.inventory = { ...heavy.inventory, coal: AVATAR.carryCapacity - 3 };
    const mineEast = legalActions(heavy).find((a) => choiceName(heavy, a) === 'mine-e');
    expect(mineEast !== undefined && tapIsRisky(heavy, mineEast)).toBe(true);
    const light = takeAll(seed7(), ['mine-down']);
    const mineWest = legalActions(light).find((a) => choiceName(light, a) === 'mine-w');
    const dig = legalActions(light).find((a) => choiceName(light, a) === 'mine-down');
    expect(mineWest !== undefined && tapIsRisky(light, mineWest)).toBe(false);
    expect(dig !== undefined && tapIsRisky(light, dig)).toBe(false);
  });
});

describe("a tap on the miner's own cell goes down, never up (issue #80)", () => {
  it('digs the block underfoot when it is solid', () => {
    const state = takeAll(seed7(), ['mine-down']);
    const { x, y } = state.avatar.pos;
    // The own cell on the top view offers the move up to the surface too.
    expect(tapNames(state, 0, x, y)).toContain('up');
    expect(tapAction(state, 0, x, y)).toMatchObject({ type: 'mine', target: { x, y, z: 1 } });
  });

  it('moves down into the cell below when it is open, and does nothing when nothing is below', () => {
    // A shaft dug two deep, then the miner goes back up one: below it is open.
    const state = takeAll(seed7(), ['mine-down', 'mine-down', 'up']);
    const { x, y, z } = state.avatar.pos;
    expect(z).toBe(0);
    expect(tapAction(state, 0, x, y)).toMatchObject({ type: 'move', to: { x, y, z: 1 } });
    // On the layer below, the same column is the move down too.
    expect(tapAction(state, 1, x, y)).toMatchObject({ type: 'move', to: { x, y, z: 1 } });
  });

  it("on the layer above, the miner's column is the move up", () => {
    const state = takeAll(seed7(), ['mine-down', 'mine-down']);
    const { x, y, z } = state.avatar.pos;
    expect(z).toBe(1);
    expect(tapAction(state, 0, x, y)).toMatchObject({ type: 'move', to: { x, y, z: 0 } });
  });
});
