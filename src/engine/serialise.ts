// Turning a GameState into a JSON-safe value and back.
//
// `JSON.stringify(serialise(state))` is the save format, and it is also what
// `hashState` hashes. So `serialise` must give the same output for two states
// that mean the same thing: inventory entries are sorted and zero counts are
// dropped, and loose items are merged (one entry per cell and item) and sorted.

import type { CubeSize, Vec3 } from '../data';
import {
  STATE_VERSION,
  canonicalLooseItems,
  cellCount,
  compareStrings,
  inGrid,
  isSurface,
} from './state';
import type { GameState, LooseItems, RunStatus } from './state';

/**
 * A GameState with nothing in it that JSON cannot hold. The six cube arrays
 * are run-length encoded: `[value, runLength, value, runLength, ...]`. A cube
 * that is all stone becomes just `[2, 32768]`.
 */
export interface SerialisedState {
  version: number;
  seed: number;
  contractId: string;
  loadoutId: string;
  rng: { s: number };
  size: CubeSize;
  blocks: number[];
  revealed: number[];
  fluid: number[];
  gas: number[];
  structures: number[];
  tracesSeen: number[];
  avatar: { pos: Vec3; health: number };
  ap: number;
  fuel: number;
  lampOil: number;
  shift: number;
  inventory: Record<string, number>;
  looseItems: LooseItems[];
  status: RunStatus;
}

function runLengthEncode(cells: Uint8Array): number[] {
  const encoded: number[] = [];
  let index = 0;
  while (index < cells.length) {
    const value = cells[index] as number;
    let runLength = 1;
    while (index + runLength < cells.length && cells[index + runLength] === value) {
      runLength += 1;
    }
    encoded.push(value, runLength);
    index += runLength;
  }
  return encoded;
}

function runLengthDecode(encoded: number[], expectedLength: number, name: string): Uint8Array {
  const cells = new Uint8Array(expectedLength);
  let index = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) {
    const value = encoded[i] as number;
    const runLength = encoded[i + 1] as number;
    if (!Number.isInteger(runLength) || runLength < 1 || index + runLength > expectedLength) {
      throw new Error(`Saved state is damaged: bad run length in "${name}"`);
    }
    cells.fill(value, index, index + runLength);
    index += runLength;
  }
  if (encoded.length % 2 !== 0 || index !== expectedLength) {
    throw new Error(
      `Saved state is damaged: "${name}" has ${index} cells, expected ${expectedLength}`,
    );
  }
  return cells;
}

/** A JSON-safe copy of `state`. Does not change `state`. */
export function serialise(state: GameState): SerialisedState {
  const inventory: Record<string, number> = {};
  for (const item of Object.keys(state.inventory).sort(compareStrings)) {
    const count = state.inventory[item] ?? 0;
    if (count !== 0) {
      inventory[item] = count;
    }
  }

  // Already canonical if the state was only changed through the helpers in
  // state.ts; done again here so that the hash never depends on it.
  const looseItems = canonicalLooseItems(state.looseItems);

  return {
    version: state.version,
    seed: state.seed,
    contractId: state.contractId,
    loadoutId: state.loadoutId,
    rng: { s: state.rng.s },
    size: { x: state.size.x, y: state.size.y, z: state.size.z },
    blocks: runLengthEncode(state.blocks),
    revealed: runLengthEncode(state.revealed),
    fluid: runLengthEncode(state.fluid),
    gas: runLengthEncode(state.gas),
    structures: runLengthEncode(state.structures),
    tracesSeen: runLengthEncode(state.tracesSeen),
    avatar: {
      pos: { x: state.avatar.pos.x, y: state.avatar.pos.y, z: state.avatar.pos.z },
      health: state.avatar.health,
    },
    ap: state.ap,
    fuel: state.fuel,
    lampOil: state.lampOil,
    shift: state.shift,
    inventory,
    looseItems,
    status:
      state.status.kind === 'active'
        ? { kind: 'active' }
        : { kind: 'ended', outcome: state.status.outcome, cause: state.status.cause },
  };
}

/**
 * Rebuild a GameState from the output of `serialise` (for example after
 * `JSON.parse`). Throws if the value is from another state version, its cube
 * arrays do not match its size, the avatar is outside the cube and its
 * surface, or the run status is not one this build knows. It does not check
 * every field: a save edited by hand can still be wrong in other ways.
 */
export function deserialise(saved: SerialisedState): GameState {
  if (saved.version !== STATE_VERSION) {
    throw new Error(
      `Saved state has version ${saved.version}; this build reads version ${STATE_VERSION}`,
    );
  }
  const size: CubeSize = { x: saved.size.x, y: saved.size.y, z: saved.size.z };
  const cells = cellCount(size);
  const avatarPos = { x: saved.avatar.pos.x, y: saved.avatar.pos.y, z: saved.avatar.pos.z };
  if (!inGrid(size, avatarPos) && !isSurface(size, avatarPos)) {
    throw new Error(
      `Saved state is damaged: the avatar is at (${avatarPos.x}, ${avatarPos.y}, ${avatarPos.z}), outside the cube`,
    );
  }
  // `as string` because a damaged save may hold a kind the type does not allow.
  const statusKind = saved.status.kind as string;
  if (statusKind !== 'active' && statusKind !== 'ended') {
    throw new Error(`Saved state is damaged: unknown run status "${statusKind}"`);
  }
  return {
    version: saved.version,
    seed: saved.seed,
    contractId: saved.contractId,
    loadoutId: saved.loadoutId,
    rng: { s: saved.rng.s },
    size,
    blocks: runLengthDecode(saved.blocks, cells, 'blocks'),
    revealed: runLengthDecode(saved.revealed, cells, 'revealed'),
    fluid: runLengthDecode(saved.fluid, cells, 'fluid'),
    gas: runLengthDecode(saved.gas, cells, 'gas'),
    structures: runLengthDecode(saved.structures, cells, 'structures'),
    tracesSeen: runLengthDecode(saved.tracesSeen, cells, 'tracesSeen'),
    avatar: { pos: avatarPos, health: saved.avatar.health },
    ap: saved.ap,
    fuel: saved.fuel,
    lampOil: saved.lampOil,
    shift: saved.shift,
    inventory: { ...saved.inventory },
    looseItems: canonicalLooseItems(saved.looseItems),
    status:
      saved.status.kind === 'active'
        ? { kind: 'active' }
        : { kind: 'ended', outcome: saved.status.outcome, cause: saved.status.cause },
  };
}
