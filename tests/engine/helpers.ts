// Helpers for scenario tests: build a small hand-made state, and apply an
// action without spelling out every field.
//
// Example: a 3 x 3 x 2 cube of stone with a one-cell pit in the middle of the
// top layer, the avatar standing in the pit.
//
//   const state = buildState({
//     layers: [
//       ['###', '#.#', '###'],   // z = 0 (top layer); each string is a row, y = 0 first
//       ['###', '###', '###'],   // z = 1
//     ],
//     avatar: { x: 1, y: 1, z: 0 },
//   });

import {
  AVATAR,
  BLOCKS,
  DEFAULT_LOADOUT_ID,
  SHIFT,
  STRUCTURES,
  WORLD,
  blockDefByCode,
} from '../../src/data';
import type { BlockId, StructureId, Vec3 } from '../../src/data';
import { applyAction, legalActions } from '../../src/engine';
import type { Action, GameState, LooseItems, RunStatus, StepResult } from '../../src/engine';
import { blankState, cellIndex, setStructure } from '../../src/engine/state';

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
  /** Where the avatar is. Default: the surface cell above (0, 0). */
  avatar?: Vec3;
  /** Default: full health from the data. */
  health?: number;
  /** Default: a full shift's AP from the data. */
  ap?: number;
  /** Default: 10, enough that tests which do not care never run out. */
  fuel?: number;
  /** Default: 10. */
  lampOil?: number;
  bankedAp?: number;
  shift?: number;
  /** Item id -> count. Default: nothing carried. */
  inventory?: Record<string, number>;
  looseItems?: LooseItems[];
  /** Cells with a ladder in them. */
  ladders?: Vec3[];
  /** Cells with a torch in them. */
  torches?: Vec3[];
  /** Mark every cell as revealed. Default: false (nothing revealed). */
  revealAll?: boolean;
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
  placeStructures(state, options.ladders ?? [], 'ladder');
  placeStructures(state, options.torches ?? [], 'torch');

  state.avatar.pos = { ...(options.avatar ?? { x: 0, y: 0, z: WORLD.surfaceZ }) };
  state.avatar.health = options.health ?? AVATAR.startHealth;
  state.ap = options.ap ?? SHIFT.apPerShift;
  state.fuel = options.fuel ?? 10;
  state.lampOil = options.lampOil ?? 10;
  state.bankedAp = options.bankedAp ?? 0;
  state.shift = options.shift ?? SHIFT.firstShiftNumber;
  state.inventory = { ...(options.inventory ?? {}) };
  state.looseItems = (options.looseItems ?? []).map((loose) => ({
    pos: { ...loose.pos },
    item: loose.item,
    count: loose.count,
  }));
  if (options.status !== undefined) {
    state.status = { ...options.status };
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
 * `findActions(state, { type: 'move' })` is every legal move, and
 * `findActions(state, { type: 'mine', target: { x: 1, y: 1, z: 1 } })` is the
 * action that mines that block, if it is legal.
 */
export function findActions(state: GameState, wanted: object): Action[] {
  return legalActions(state).filter((action) => matches(action, wanted));
}

/**
 * Apply the one legal action that matches `wanted`, so a test can say what it
 * means without repeating the AP cost:
 *
 *   const { state: after, events } = act(state, { type: 'move', to: { x: 2, y: 1, z: 0 } });
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
