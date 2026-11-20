// Public surface of the rules engine. See docs/repo-plan.md section 3.1.
//
// The renderer, the app and the tools use the five functions below and the
// types re-exported at the bottom, and nothing else from this folder.
//
// This file is also the dispatcher: it owns what is common to every action
// (copying the state, checking legality, spending AP, then gravity and
// reveal) and hands the rest to one module per rule. The modules of the M2
// actions (supports, explosives, camp tools, camps, giving up) are stubs until
// their tasks fill them in; each stub's doc comment is its contract
// (decision note 0015).

import { AVATAR, CONTRACT_IDS, HAZARDS, SHIFT, WORLD, findLoadout } from '../data';
import { actionKey } from './actionTypes';
import type { Action } from './actionTypes';
import { legalCampActions, applyCampAction } from './actions/camp';
import { legalCampToolActions, applyCampToolAction } from './actions/campTools';
import { legalCraftActions, applyCraft } from './actions/craft';
import { legalCutTreeActions, applyCutTree } from './actions/cutTree';
import { legalGiveUpActions, applyGiveUp } from './actions/giveUp';
import { legalDropActions, legalPickUpActions, applyDrop, applyPickUp } from './actions/items';
import { legalLeaveActions, applyLeave } from './actions/leave';
import { legalMineActions, applyMine, isDigDown } from './actions/mine';
import { avatarFallDistance } from './footing';
import { legalMoveActions, applyMove } from './actions/move';
import { legalPlaceExplosiveActions, applyPlaceExplosive } from './actions/placeExplosive';
import { legalPlaceLadderActions, applyPlaceLadder } from './actions/placeLadder';
import { legalPlaceSupportActions, applyPlaceSupport } from './actions/placeSupport';
import { legalPlaceTorchActions, applyPlaceTorch } from './actions/placeTorch';
import type { FallKind, GameEvent } from './events';
import { generateCube } from './generation/cube';
import { settle } from './gravity';
import { updateReveal } from './reveal';
import { isValidSeed } from './rng';
import { forecastShift, runCubePhase, runUpkeep } from './shift';
import type { ShiftForecast } from './shift';
import { addItem, blankState, cloneState, isRunActive } from './state';
import { ensureCoalInSight, generateSurface } from './surface/generation';
import { regrowTrees } from './surface/regrowth';
import { updateMineralTraces } from './tells';
import type { GameState } from './state';

/**
 * Changes whenever the rules or the shape of the state change, so that a play
 * log can say which engine it was played on. It is bumped once for each batch
 * of such changes between two playtest rounds (CLAUDE.md).
 * 0.2.0: no fuel refill (issue #32).
 * 0.3.0: milestone M2, hazards and camps (0014 item 35; set by issue #50).
 */
export const ENGINE_VERSION = '0.3.0';

/** What `applyAction` and `endShift` return: the new state and what happened. */
export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Start a new run.
 *
 * `seed` is a whole number from 0 to 2**32 - 1. The same seed, contract and
 * loadout always give the same starting state. `contractId` must be `'none'`
 * until contracts arrive in M4. Throws on a bad seed or an unknown id.
 */
export function createRun(seed: number, contractId: string, loadoutId: string): GameState {
  if (!isValidSeed(seed)) {
    throw new Error(`Seed must be a whole number from 0 to 4294967295, but is ${seed}`);
  }
  if (!CONTRACT_IDS.includes(contractId)) {
    throw new Error(`Unknown contract id: ${contractId}`);
  }
  const loadout = findLoadout(loadoutId);
  if (loadout === undefined) {
    throw new Error(`Unknown loadout id: ${loadoutId}`);
  }

  const state = blankState(WORLD.size, seed);
  state.contractId = contractId;
  state.loadoutId = loadoutId;
  state.blocks = generateCube(state.size, state.rng);
  // The forest on the surface (issue #70), drawn from the same generator.
  generateSurface(state);

  state.avatar.pos = { ...WORLD.startPosition };
  state.avatar.health = AVATAR.startHealth;
  state.avatar.air = HAZARDS.air.max;
  state.shift = SHIFT.firstShiftNumber;
  state.ap = SHIFT.apPerShift;
  state.fuel = loadout.fuel;
  state.lampOil = loadout.lampOil;
  for (const stack of loadout.items) {
    addItem(state, stack.item, stack.count);
  }
  // Coal in sight at the start (owner's decision on PR #72): needs the miner
  // on its start cell with its lamp, so it comes after the surface.
  ensureCoalInSight(state);

  // Reveal what can be seen from the start. Nobody is watching yet, so the
  // events are dropped.
  updateReveal(state, []);
  updateMineralTraces(state, []);
  return state;
}

/**
 * Every action the player may take now, in an order that depends only on the
 * state. Empty once the run has ended. Does not change `state`.
 *
 * It may also be empty while the run is still going (for example with no AP
 * left); the player can always end the shift.
 */
export function legalActions(state: GameState): Action[] {
  if (!isRunActive(state)) {
    return [];
  }
  const all: Action[] = [
    ...legalMoveActions(state),
    ...legalCutTreeActions(state),
    ...legalMineActions(state),
    ...legalPlaceLadderActions(state),
    ...legalPlaceTorchActions(state),
    ...legalPlaceSupportActions(state),
    ...legalPlaceExplosiveActions(state),
    ...legalCampToolActions(state),
    ...legalCraftActions(state),
    ...legalPickUpActions(state),
    ...legalDropActions(state),
    ...legalCampActions(state),
    ...legalLeaveActions(state),
    ...legalGiveUpActions(state),
  ];
  // An action the avatar cannot afford is not legal (0005 item 12). The rule
  // modules list actions without looking at AP; this is the one place it is
  // checked.
  return all.filter((action) => action.ap <= state.ap);
}

/**
 * Take one action. Returns the new state and the events; `state` itself is
 * not changed. Throws if the action is not one of `legalActions(state)`.
 */
export function applyAction(state: GameState, action: Action): StepResult {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; no action can be taken');
  }
  const wanted = actionKey(action);
  const isLegal = legalActions(state).some((legal) => actionKey(legal) === wanted);
  if (!isLegal) {
    throw new Error(`Not a legal action: ${wanted}`);
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];
  next.ap -= action.ap;

  // TypeScript knows, inside each `case`, which kind of action this is.
  switch (action.type) {
    case 'move':
      applyMove(next, action, events);
      break;
    case 'mine':
      applyMine(next, action, events);
      break;
    case 'placeLadder':
      applyPlaceLadder(next, action, events);
      break;
    case 'placeTorch':
      applyPlaceTorch(next, action, events);
      break;
    case 'craft':
      applyCraft(next, action, events);
      break;
    case 'pickUp':
      applyPickUp(next, action, events);
      break;
    case 'drop':
      applyDrop(next, action, events);
      break;
    case 'leave':
      applyLeave(next, action, events);
      break;
    case 'placeSupport':
      applyPlaceSupport(next, action, events);
      break;
    case 'placeExplosive':
      applyPlaceExplosive(next, action, events);
      break;
    // Several `case` lines with one body: any of these types goes to the
    // same module, which looks at `action.type` itself.
    case 'placePump':
    case 'placeVent':
    case 'placeSafetyLamp':
    case 'seal':
    case 'scan':
      applyCampToolAction(next, action, events);
      break;
    case 'foundCamp':
    case 'rest':
    case 'stashPut':
    case 'stashTake':
    case 'decommissionCamp':
      applyCampAction(next, action, events);
      break;
    case 'giveUp':
      applyGiveUp(next, action, events);
      break;
    case 'cutTree':
      applyCutTree(next, action, events);
      break;
  }

  // After any action: things fall, then light shows what is newly visible,
  // and any mineral traces on the blocks it falls on.
  // A fall straight after a move is one the player chose from the move list
  // (a drop of 1 or 2 blocks, shown there). A fall after anything else is
  // uncontrolled and costs health from the first block (design doc 5.2,
  // decision note 0010), except the safe one-block drop of digging down.
  let fallKind: FallKind = action.type === 'move' ? 'chosenDrop' : 'uncontrolled';
  // Digging out the block the avatar stands on (owner, issue #75): a drop of
  // `AVATAR.safeDigDownBlocks` onto footing is safe, as in Minecraft; a longer
  // fall is uncontrolled, counted from where the avatar stood. The fall is
  // measured on the true cube, as `settle` does; what the player was told
  // beforehand depends on known cells only (describe.ts).
  if (action.type === 'mine' && isDigDown(state, action)) {
    const distance = avatarFallDistance(next, next.avatar.pos);
    fallKind = distance <= AVATAR.safeDigDownBlocks ? 'chosenDrop' : 'uncontrolled';
  }
  settle(next, events, fallKind);
  updateReveal(next, events);
  updateMineralTraces(next, events);
  return { state: next, events };
}

/**
 * End the player phase: run the cube phase, then upkeep (design doc 4; 0014
 * items 1 and 2). Returns the new state and the events; `state` itself is not
 * changed. Throws if the run has already ended.
 *
 * The order: the cube phase's steps (a) to (e) (shift.ts); `settle` once (the
 * avatar and loose items fall if the phase took their floor); if the avatar
 * is still alive, trees grow back on stumps (surface/regrowth.ts) and then
 * upkeep; reveal. The forecast for the next shift is not
 * stored: `previewCubePhase` works it out from the new state when asked.
 */
export function endShift(state: GameState): StepResult {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to end');
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];

  runCubePhase(next, events);
  // Nothing the cube phase does to the avatar's footing is the player's move.
  // `settle` ends the run itself if the fall kills ("the death check"). An
  // avatar that step (e) already killed does not fall; loose items still do.
  settle(next, events, 'uncontrolled');
  if (isRunActive(next)) {
    // Trees grow back on stumps left alone long enough (issue #70; decision
    // note 0020): after the cube phase, before upkeep.
    regrowTrees(next, events);
    runUpkeep(next, events);
  }
  // The light radius can change at upkeep (lamp oil running out).
  updateReveal(next, events);
  updateMineralTraces(next, events);
  return { state: next, events };
}

/**
 * What ending the shift now would do, for the end-shift preview (0014 item
 * 4): the countdowns and flows the player can work out from what it sees
 * (both empty until M2-6), and upkeep's effect on fuel and lamp oil. Does not
 * change `state`. Throws if the run has already ended, as `endShift` does.
 */
export function previewCubePhase(state: GameState): ShiftForecast {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to preview');
  }
  return forecastShift(state);
}

// Types and helpers that callers outside the engine need.
export { actionKey, sameAction } from './actionTypes';
export type {
  Action,
  CampAction,
  CampToolAction,
  CraftAction,
  CutTreeAction,
  DecommissionCampAction,
  DropAction,
  FoundCampAction,
  GiveUpAction,
  LeaveAction,
  MineAction,
  MoveAction,
  PickUpAction,
  PlaceExplosiveAction,
  PlaceLadderAction,
  PlacePumpAction,
  PlaceSafetyLampAction,
  PlaceSupportAction,
  PlaceTorchAction,
  PlaceVentAction,
  RestAction,
  ScanAction,
  SealAction,
  StashPutAction,
  StashTakeAction,
} from './actionTypes';
export { campAirLineIntact } from './airLine';
export { campCells, campsAt } from './camps';
export type {
  AirChangeReason,
  DamageCause,
  DestructionCause,
  FallKind,
  FluidKind,
  GameEvent,
  GaugeChangeReason,
  RemovalReason,
  RunEndCause,
  RunOutcome,
} from './events';
export { fallDamage, isFatalFall } from './gravity';
export { hashState } from './hash';
export { canCarry, carriedWeight, carryCapacity } from './inventory';
export { deserialise, serialise } from './serialise';
export type { SerialisedState } from './serialise';
// What the player sees of a cell (0014 item 3). Tools and the renderer read a
// cell's water, lava, gas, cracks, structures and loose items through
// `knownCell`, which answers `null` for a cell the player has not seen.
export { knownCell } from './known';
export type { KnownCell } from './known';
export type { CountdownForecast } from './forecast';
export type { ShiftForecast, UpkeepForecast } from './shift';
export {
  blockAt,
  blockDefAt,
  cellIndex,
  cellPosition,
  countItem,
  inGrid,
  inventoryEntries,
  isOpen,
  isRevealed,
  isRunActive,
  isSolid,
  isSurface,
  looseItemsAt,
  stashEntries,
  structureAt,
} from './state';
export type {
  ArmedCharge,
  ArmedKind,
  Avatar,
  Camp,
  GameState,
  LooseItems,
  RunStatus,
} from './state';
// Tells: the mineral traces the player has seen on rock near ore.
export { showsMineralTraces, visibleMineralTraces } from './tells';
// The seeded generator, for tools and tests that need random numbers of their
// own (a simulator policy, say). They make their own state with `createRng`;
// `state.rng` belongs to the rules.
export { createRng, nextInt } from './rng';
// The surface forest (issue #70): what each surface cell is, for the views
// and tools. The surface is always seen, so these may be read freely.
export {
  hasStump,
  hasTree,
  isUnderTree,
  stumpAgeAt,
  surfaceCellAbove,
  surfaceKindAt,
} from './surface/state';
export { shiftsUntilRegrowth } from './surface/regrowth';
// The cube seen from above (design doc v0.2 section 3.1; issue #84): a
// square's depth, its top block, and the level rule. Nothing in the rules
// uses these yet.
export { depthAt, isSquare, mayMine, topBlockAt, SQUARE_STEPS } from './heightmap';
export type {
  HigherNeighbour,
  MayMineResult,
  MineRefusal,
  SquareDirection,
  SquareStep,
} from './heightmap';
export type { RngState } from './rng';
