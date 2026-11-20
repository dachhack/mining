// Helpers for scenario tests: build a small hand-made state, and apply an
// action without spelling out every field.
//
// Example: a 3 x 3 x 2 cube of stone with a one-square pit in the middle,
// 1 level deep.
//
//   const state = buildState({
//     layers: [
//       ['###', '#.#', '###'],   // z = 0 (top layer); each string is a row, y = 0 first
//       ['###', '###', '###'],   // z = 1
//     ],
//   });

import {
  AVATAR,
  BLOCKS,
  DEFAULT_LOADOUT_ID,
  HAZARDS,
  SHIFT,
  STRUCTURES,
  SURFACE,
  blockDefByCode,
} from '../../src/data';
import type { BlockId, StructureId, Vec3 } from '../../src/data';
import { applyAction, legalActions } from '../../src/engine';
import type {
  Action,
  ArmedCharge,
  Camp,
  GameState,
  LooseItems,
  RunStatus,
  StepResult,
} from '../../src/engine';
import {
  blankState,
  canonicalArmed,
  canonicalCamps,
  canonicalLooseItems,
  cellIndex,
  setCrackTimer,
  setGas,
  setLava,
  setStructure,
  setWater,
} from '../../src/engine/state';
import { updateReveal } from '../../src/engine/reveal';
import { updateMineralTraces } from '../../src/engine/tells';

/** The character that stands for each block in a layer string. */
export const BLOCK_CHARS: Record<string, BlockId> = {
  '.': 'air',
  d: 'dirt',
  '#': 'stone',
  H: 'hardRock',
  c: 'coalSeam',
  t: 'timberRoot',
  i: 'ironOre',
  u: 'copperOre',
  x: 'crystal',
  U: 'unstableOre',
  r: 'relic',
  k: 'keystone',
  R: 'rubble',
  S: 'sealed',
};

/** The character that stands for each kind of surface cell in `surface` rows. */
export const SURFACE_CHARS: Record<string, keyof typeof SURFACE.kinds> = {
  '.': 'meadow',
  T: 'tree',
  s: 'stump',
  p: 'path',
  o: 'outcrop',
};

// A field marked `?` may be left out; it then reads as `undefined`, and
// `options.x ?? default` supplies the default.
export interface BuildStateOptions {
  /**
   * The cube, top layer first. Each layer is a list of rows (y = 0 first) and
   * each row is a string with one character per cell (x = 0 first); see
   * `BLOCK_CHARS`. Every layer must have the same number of rows, and every
   * row the same length.
   */
  layers: string[][];
  /** Default: full health from the data. */
  health?: number;
  /** Default: full air from the data. */
  air?: number;
  /** Default: a full shift's AP from the data. */
  ap?: number;
  /** Default: 10, enough that tests which do not care never run out. */
  fuel?: number;
  shift?: number;
  /** Item id -> count. Default: nothing carried. */
  inventory?: Record<string, number>;
  looseItems?: LooseItems[];
  /** Cells with a support in them. */
  supports?: Vec3[];
  /** Any other structure, by its id in src/data/structures.ts. */
  structures?: { pos: Vec3; structure: StructureId }[];
  /** Cells holding one unit of water. */
  water?: Vec3[];
  /** Cells holding one unit of lava that is not a source. */
  lava?: Vec3[];
  /** Cells holding lava that is a source (0014 item 16). */
  lavaSources?: Vec3[];
  /** Cells holding gas, with how many units. */
  gas?: { pos: Vec3; units: number }[];
  /** Cracked blocks, with their stored timer (0014 item 7). */
  cracks?: { pos: Vec3; timer: number }[];
  /** Armed unstable ore and placed explosives. Does not place the explosive's structure. */
  armed?: ArmedCharge[];
  /** Active camps. */
  camps?: Camp[];
  /**
   * The surface (issue #70), one string per row (y = 0 first), one character
   * per cell: see `SURFACE_CHARS`. Default: meadow everywhere, the open
   * ground of a blank state.
   */
  surface?: string[];
  /** How far each stump's regrowth count has gone. Default: 0. */
  stumpAges?: { pos: Vec3; age: number }[];
  /** Mark every cell as revealed. Default: false. */
  revealAll?: boolean;
  /**
   * Reveal every square's top block that no tree hides, and note the mineral
   * traces on them, as the engine does after every step (`updateReveal`,
   * `updateMineralTraces`). Default: true, so that a hand-built state is one
   * the engine could have produced. Pass false for a state with nothing
   * revealed.
   */
  revealTops?: boolean;
  seed?: number;
  status?: RunStatus;
}

/** Build a state from a hand-drawn cube. Throws on a malformed drawing. */
export function buildState(options: BuildStateOptions): GameState {
  const layers = options.layers;
  const firstLayer = layers[0];
  const firstRow = firstLayer?.[0];
  if (firstLayer === undefined || firstRow === undefined || firstRow.length === 0) {
    throw new Error('buildState needs at least one layer with one non-empty row');
  }
  const size = { x: firstRow.length, y: firstLayer.length, z: layers.length };

  const state = blankState(size, options.seed ?? 1);
  state.contractId = 'none';
  state.loadoutId = DEFAULT_LOADOUT_ID;

  layers.forEach((layer, z) => {
    if (layer.length !== size.y) {
      throw new Error(`Layer z=${z} has ${layer.length} rows, expected ${size.y}`);
    }
    layer.forEach((row, y) => {
      if (row.length !== size.x) {
        throw new Error(`Layer z=${z}, row y=${y} has ${row.length} cells, expected ${size.x}`);
      }
      for (let x = 0; x < size.x; x += 1) {
        const char = row.charAt(x);
        const blockId = BLOCK_CHARS[char];
        if (blockId === undefined) {
          throw new Error(`Unknown block character "${char}" at (${x}, ${y}, ${z})`);
        }
        state.blocks[cellIndex(size, { x, y, z })] = BLOCKS[blockId].code;
      }
    });
  });

  if (options.revealAll === true) {
    state.revealed.fill(1);
  }
  placeStructures(state, options.supports ?? [], 'support');
  for (const entry of options.structures ?? []) {
    placeStructures(state, [entry.pos], entry.structure);
  }
  for (const pos of options.water ?? []) {
    setWater(state, pos, HAZARDS.water.unitsPerCell);
  }
  for (const pos of options.lava ?? []) {
    setLava(state, pos, HAZARDS.lava.unitsPerCell);
  }
  for (const pos of options.lavaSources ?? []) {
    setLava(state, pos, HAZARDS.lava.unitsPerCell, true);
  }
  for (const entry of options.gas ?? []) {
    setGas(state, entry.pos, entry.units);
  }
  for (const entry of options.cracks ?? []) {
    setCrackTimer(state, entry.pos, entry.timer);
  }
  (options.surface ?? []).forEach((row, y) => {
    if (row.length !== size.x) {
      throw new Error(`Surface row y=${y} has ${row.length} cells, expected ${size.x}`);
    }
    for (let x = 0; x < size.x; x += 1) {
      const kind = SURFACE_CHARS[row.charAt(x)];
      if (kind === undefined) {
        throw new Error(`Unknown surface character "${row.charAt(x)}" at (${x}, ${y})`);
      }
      state.surface[x + size.x * y] = SURFACE.kinds[kind].code;
    }
  });
  for (const entry of options.stumpAges ?? []) {
    state.stumpAge[entry.pos.x + size.x * entry.pos.y] = entry.age;
  }
  // Sorted, as the engine keeps the lists.
  state.armed = canonicalArmed(options.armed ?? []);
  state.camps = canonicalCamps(options.camps ?? []);

  state.avatar.health = options.health ?? AVATAR.startHealth;
  state.avatar.air = options.air ?? HAZARDS.air.max;
  state.ap = options.ap ?? SHIFT.apPerShift;
  state.fuel = options.fuel ?? 10;
  state.shift = options.shift ?? SHIFT.firstShiftNumber;
  state.inventory = { ...(options.inventory ?? {}) };
  // Merged and sorted, as the engine keeps the list.
  state.looseItems = canonicalLooseItems(options.looseItems ?? []);
  if (options.status !== undefined) {
    state.status = { ...options.status };
  }
  if (options.revealTops !== false) {
    updateReveal(state, []);
    updateMineralTraces(state, []);
  }
  return state;
}

function placeStructures(state: GameState, cells: Vec3[], structureId: StructureId): void {
  for (const pos of cells) {
    setStructure(state, pos, STRUCTURES[structureId].code);
  }
}

/**
 * Draw one layer of the cube as rows of `BLOCK_CHARS` characters, the reverse
 * of what `buildState` reads. Useful in assertions and when debugging:
 *
 *   expect(layerText(state, 0)).toEqual(['###', '#.#', '###']);
 */
export function layerText(state: GameState, z: number): string[] {
  const charByCode = new Map<number, string>();
  for (const [char, blockId] of Object.entries(BLOCK_CHARS)) {
    charByCode.set(BLOCKS[blockId].code, char);
  }
  const rows: string[] = [];
  for (let y = 0; y < state.size.y; y += 1) {
    let row = '';
    for (let x = 0; x < state.size.x; x += 1) {
      const code = state.blocks[cellIndex(state.size, { x, y, z })] as number;
      row += charByCode.get(code) ?? `<${blockDefByCode(code).name}>`;
    }
    rows.push(row);
  }
  return rows;
}

/** True if every field named in `wanted` has the same value in `action`. */
function matches(action: Action, wanted: object): boolean {
  // Comparing through JSON keeps this simple: positions are small objects.
  const actionFields = action as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(wanted)) {
    if (JSON.stringify(actionFields[field]) !== JSON.stringify(value)) {
      return false;
    }
  }
  return true;
}

/**
 * The legal actions that match a partial description. For example
 * `findActions(state, { type: 'mine' })` is every legal mine, and
 * `findActions(state, { type: 'mine', x: 1, y: 1 })` is the action that
 * mines the square (1, 1), if it is legal.
 */
export function findActions(state: GameState, wanted: object): Action[] {
  return legalActions(state).filter((action) => matches(action, wanted));
}

/**
 * Apply the one legal action that matches `wanted`, so a test can say what it
 * means without repeating the AP cost:
 *
 *   const { state: after, events } = act(state, { type: 'mine', x: 2, y: 1 });
 *
 * Throws if no legal action matches, or more than one does.
 */
export function act(state: GameState, wanted: object): StepResult {
  const found = findActions(state, wanted);
  if (found.length !== 1) {
    throw new Error(
      `Expected exactly one legal action matching ${JSON.stringify(wanted)}, found ${found.length}`,
    );
  }
  return applyAction(state, found[0] as Action);
}
