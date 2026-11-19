// Turning a GameState into a JSON-safe value and back.
//
// `JSON.stringify(serialise(state))` is the save format, and it is also what
// `hashState` hashes. So `serialise` must give the same output for two states
// that mean the same thing: inventory entries are sorted and zero counts are
// dropped, loose items are merged (one entry per cell and item) and sorted, and
// the armed charges and the camps are sorted (with each stash like the
// inventory).

import type { CubeSize, Vec3 } from '../data';
import {
  STATE_VERSION,
  canonicalArmed,
  canonicalCamps,
  canonicalLooseItems,
  cellCount,
  compareStrings,
  inGrid,
  isSurface,
} from './state';
import type { ArmedCharge, Camp, GameState, LooseItems, RunStatus } from './state';

/**
 * A GameState with nothing in it that JSON cannot hold. The nine cube arrays
 * and the two surface arrays are run-length encoded: `[value, runLength, value, runLength, ...]`. A cube
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
  water: number[];
  lava: number[];
  lavaSource: number[];
  gas: number[];
  cracks: number[];
  structures: number[];
  tracesSeen: number[];
  /** One entry per surface cell (issue #70), run-length encoded like the cube arrays. */
  surface: number[];
  stumpAge: number[];
  avatar: { pos: Vec3; health: number; air: number; resting: boolean };
  ap: number;
  fuel: number;
  lampOil: number;
  shift: number;
  inventory: Record<string, number>;
  looseItems: LooseItems[];
  armed: ArmedCharge[];
  camps: Camp[];
  status: RunStatus;
}

/** A copy of an item-count dict with its keys sorted and zero counts dropped. */
function sortedCounts(counts: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const item of Object.keys(counts).sort(compareStrings)) {
    const count = counts[item] ?? 0;
    if (count !== 0) {
      sorted[item] = count;
    }
  }
  return sorted;
}

/** Camps in canonical order, each stash sorted with zero counts dropped. */
function serialiseCamps(camps: Camp[]): Camp[] {
  return canonicalCamps(camps).map((camp) => ({
    pos: camp.pos,
    foundedShift: camp.foundedShift,
    stash: sortedCounts(camp.stash),
  }));
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
  const inventory = sortedCounts(state.inventory);

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
    water: runLengthEncode(state.water),
    lava: runLengthEncode(state.lava),
    lavaSource: runLengthEncode(state.lavaSource),
    gas: runLengthEncode(state.gas),
    cracks: runLengthEncode(state.cracks),
    structures: runLengthEncode(state.structures),
    tracesSeen: runLengthEncode(state.tracesSeen),
    surface: runLengthEncode(state.surface),
    stumpAge: runLengthEncode(state.stumpAge),
    avatar: {
      pos: { x: state.avatar.pos.x, y: state.avatar.pos.y, z: state.avatar.pos.z },
      health: state.avatar.health,
      air: state.avatar.air,
      resting: state.avatar.resting,
    },
    ap: state.ap,
    fuel: state.fuel,
    lampOil: state.lampOil,
    shift: state.shift,
    inventory,
    looseItems,
    armed: canonicalArmed(state.armed),
    camps: serialiseCamps(state.camps),
    status:
      state.status.kind === 'active'
        ? { kind: 'active' }
        : { kind: 'ended', outcome: state.status.outcome, cause: state.status.cause },
  };
}

/**
 * Rebuild a GameState from the output of `serialise` (for example after
 * `JSON.parse`). Throws if the value is from another state version, its cube
 * arrays do not match its size, the avatar, an armed charge or a camp is
 * outside the cube, or the run status is not one this build knows. It does not check
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
  for (const charge of saved.armed) {
    // `as string` for the same reason as the run status above.
    const kind = charge.kind as string;
    if (!inGrid(size, charge.pos) || (kind !== 'unstableOre' && kind !== 'explosive')) {
      throw new Error(
        `Saved state is damaged: bad armed charge "${kind}" at (${charge.pos.x}, ${charge.pos.y}, ${charge.pos.z})`,
      );
    }
  }
  for (const camp of saved.camps) {
    if (!inGrid(size, camp.pos)) {
      throw new Error(
        `Saved state is damaged: a camp is at (${camp.pos.x}, ${camp.pos.y}, ${camp.pos.z}), outside the cube`,
      );
    }
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
    water: runLengthDecode(saved.water, cells, 'water'),
    lava: runLengthDecode(saved.lava, cells, 'lava'),
    lavaSource: runLengthDecode(saved.lavaSource, cells, 'lavaSource'),
    gas: runLengthDecode(saved.gas, cells, 'gas'),
    cracks: runLengthDecode(saved.cracks, cells, 'cracks'),
    structures: runLengthDecode(saved.structures, cells, 'structures'),
    tracesSeen: runLengthDecode(saved.tracesSeen, cells, 'tracesSeen'),
    surface: runLengthDecode(saved.surface, size.x * size.y, 'surface'),
    stumpAge: runLengthDecode(saved.stumpAge, size.x * size.y, 'stumpAge'),
    avatar: {
      pos: avatarPos,
      health: saved.avatar.health,
      air: saved.avatar.air,
      resting: saved.avatar.resting,
    },
    ap: saved.ap,
    fuel: saved.fuel,
    lampOil: saved.lampOil,
    shift: saved.shift,
    inventory: { ...saved.inventory },
    looseItems: canonicalLooseItems(saved.looseItems),
    armed: canonicalArmed(saved.armed),
    camps: serialiseCamps(saved.camps),
    status:
      saved.status.kind === 'active'
        ? { kind: 'active' }
        : { kind: 'ended', outcome: saved.status.outcome, cause: saved.status.cause },
  };
}
