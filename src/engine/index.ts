// Public surface of the rules engine. See docs/repo-plan.md section 3.1.
//
// The renderer, the app and the tools use the five functions below and the
// types re-exported at the bottom, and nothing else from this folder.
//
// This file is also the dispatcher: it owns what is common to every action
// (copying the state, checking legality, spending AP, then gravity and
// reveal) and hands the rest to one module per rule. Those modules are stubs
// until M1 tasks 2 to 5 fill them in; each stub's doc comment is its contract.

import { AVATAR, CONTRACT_IDS, SHIFT, WORLD, findLoadout } from '../data';
import { actionKey } from './actionTypes';
import type { Action } from './actionTypes';
import { legalCraftActions, applyCraft } from './actions/craft';
import { legalDropActions, legalPickUpActions, applyDrop, applyPickUp } from './actions/items';
import { legalLeaveActions, applyLeave } from './actions/leave';
import { legalMineActions, applyMine } from './actions/mine';
import { legalMoveActions, applyMove } from './actions/move';
import { legalPlaceLadderActions, applyPlaceLadder } from './actions/placeLadder';
import { legalPlaceTorchActions, applyPlaceTorch } from './actions/placeTorch';
import type { FallKind, GameEvent } from './events';
import { generateCube } from './generation/cube';
import { settle } from './gravity';
import { updateReveal } from './reveal';
import { isValidSeed } from './rng';
import { forecastShift, runCubePhase, runUpkeep } from './shift';
import type { ShiftForecast } from './shift';
import { addItem, blankState, cloneState, isRunActive } from './state';
import type { GameState } from './state';

export const ENGINE_VERSION = '0.1.0';

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

  state.avatar.pos = { ...WORLD.startPosition };
  state.avatar.health = AVATAR.startHealth;
  state.shift = SHIFT.firstShiftNumber;
  state.ap = SHIFT.apPerShift;
  state.fuel = loadout.fuel;
  state.lampOil = loadout.lampOil;
  for (const stack of loadout.items) {
    addItem(state, stack.item, stack.count);
  }

  // Reveal what can be seen from the start. Nobody is watching yet, so the
  // events are dropped.
  updateReveal(state, []);
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
    ...legalMineActions(state),
    ...legalPlaceLadderActions(state),
    ...legalPlaceTorchActions(state),
    ...legalCraftActions(state),
    ...legalPickUpActions(state),
    ...legalDropActions(state),
    ...legalLeaveActions(state),
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
  }

  // After any action: things fall, then light shows what is newly visible.
  // A fall straight after a move is one the player chose from the move list
  // (a drop of 1 or 2 blocks, shown there). A fall after anything else, in
  // practice after mining the block underfoot, is uncontrolled and costs
  // health from the first block (design doc 5.2, decision note 0010).
  const fallKind: FallKind = action.type === 'move' ? 'chosenDrop' : 'uncontrolled';
  settle(next, events, fallKind);
  updateReveal(next, events);
  return { state: next, events };
}

/**
 * End the player phase: run the cube phase, then upkeep (design doc 4).
 * Returns the new state and the events; `state` itself is not changed.
 * Throws if the run has already ended.
 */
export function endShift(state: GameState): StepResult {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to end');
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];

  runCubePhase(next, events);
  // Nothing the cube phase does to the avatar's footing is the player's move.
  settle(next, events, 'uncontrolled');
  if (isRunActive(next)) {
    runUpkeep(next, events);
  }
  // The light radius can change at upkeep (lamp oil running out).
  updateReveal(next, events);
  return { state: next, events };
}

/**
 * What ending the shift now would do, for the end-shift preview: the cube
 * phase's effect on the hazards the player knows about (none until M2) and
 * upkeep's effect on fuel, lamp oil and banked AP. Does not change `state`.
 * Throws if the run has already ended, as `endShift` does.
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
  CraftAction,
  DropAction,
  LeaveAction,
  MineAction,
  MoveAction,
  PickUpAction,
  PlaceLadderAction,
  PlaceTorchAction,
} from './actionTypes';
export type {
  DamageCause,
  FallKind,
  GameEvent,
  GaugeChangeReason,
  RunEndCause,
  RunOutcome,
} from './events';
export { fallDamage, isFatalFall } from './gravity';
export { hashState } from './hash';
export { canCarry, carriedWeight, carryCapacity } from './inventory';
export { deserialise, serialise } from './serialise';
export type { SerialisedState } from './serialise';
export type { HazardForecast, ShiftForecast, UpkeepForecast } from './shift';
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
  structureAt,
} from './state';
export type { Avatar, GameState, LooseItems, RunStatus } from './state';
// The seeded generator, for tools and tests that need random numbers of their
// own (a simulator policy, say). They make their own state with `createRng`;
// `state.rng` belongs to the rules.
export { createRng, nextInt } from './rng';
export type { RngState } from './rng';
