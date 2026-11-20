// Public surface of the rules engine. See docs/repo-plan.md section 3.1.
//
// The renderer, the app and the tools use the five functions below and the
// types re-exported at the bottom, and nothing else from this folder.
//
// This file is also the dispatcher: it owns what is common to every action
// (copying the state, checking legality, spending AP, then reveal) and hands the rest to one module per rule. The modules of the M2
// actions (supports, explosives, camp tools, camps, giving up) are stubs until
// their tasks fill them in; each stub's doc comment is its contract
// (decision note 0015).

import { AVATAR, CONTRACT_IDS, HAZARDS, SHIFT, WORLD, findLoadout } from '../data';
import { actionKey } from './actionTypes';
import type { Action } from './actionTypes';
import { legalCampActions, applyCampAction } from './actions/camp';
import { legalCampToolActions, applyCampToolAction } from './actions/campTools';
import { legalCloseMineActions, applyCloseMine } from './actions/closeMine';
import { legalCraftActions, applyCraft } from './actions/craft';
import { legalCutTreeActions, applyCutTree } from './actions/cutTree';
import { legalGiveUpActions, applyGiveUp } from './actions/giveUp';
import { legalMineActions, applyMine } from './actions/mine';
import { legalPlaceExplosiveActions, applyPlaceExplosive } from './actions/placeExplosive';
import { legalPlaceSupportActions, applyPlaceSupport } from './actions/placeSupport';
import type { GameEvent } from './events';
import { generateCube } from './generation/cube';
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
 * 0.4.0: the top-down model of design doc v0.2 (decision note 0025; set by
 *        issue #86, mine by square). Covers the whole batch T2 to T15.
 */
export const ENGINE_VERSION = '0.4.0';

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

  state.avatar.health = AVATAR.startHealth;
  state.avatar.air = HAZARDS.air.max;
  state.shift = SHIFT.firstShiftNumber;
  state.ap = SHIFT.apPerShift;
  state.fuel = loadout.fuel;
  for (const stack of loadout.items) {
    addItem(state, stack.item, stack.count);
  }
  // Coal in sight at the start (design doc 3.2): reads the surface, so it
  // comes after it.
  ensureCoalInSight(state);

  // Reveal every top block that no tree hides. Nobody is watching yet, so
  // the events are dropped.
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
    ...legalCutTreeActions(state),
    ...legalMineActions(state),
    ...legalPlaceSupportActions(state),
    ...legalPlaceExplosiveActions(state),
    ...legalCampToolActions(state),
    ...legalCraftActions(state),
    ...legalCampActions(state),
    ...legalCloseMineActions(state),
    ...legalGiveUpActions(state),
  ];
  // An action the player cannot afford is not legal (0005 item 12). The rule
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
    case 'mine':
      applyMine(next, action, events);
      break;
    case 'craft':
      applyCraft(next, action, events);
      break;
    case 'closeMine':
      applyCloseMine(next, action, events);
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
    case 'seal':
    case 'scan':
      applyCampToolAction(next, action, events);
      break;
    case 'foundCamp':
    case 'rest':
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

  // After any action the new top block is revealed, with any mineral traces
  // on it.
  updateReveal(next, events);
  updateMineralTraces(next, events);
  return { state: next, events };
}

/**
 * End the player phase: run the cube phase, then upkeep (design doc 4; 0014
 * items 1 and 2). Returns the new state and the events; `state` itself is not
 * changed. Throws if the run has already ended.
 *
 * The order: the cube phase's steps (a) to (e) (shift.ts); if the run is
 * still going, trees grow back on stumps (surface/regrowth.ts) and then
 * upkeep; reveal. The forecast for the next shift is not stored: `previewCubePhase`
 * works it out from the new state when asked.
 */
export function endShift(state: GameState): StepResult {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; there is no shift to end');
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];

  runCubePhase(next, events);
  if (isRunActive(next)) {
    // Trees grow back on stumps left alone long enough (issue #70; decision
    // note 0020): after the cube phase, before upkeep.
    regrowTrees(next, events);
    runUpkeep(next, events);
  }
  // The cube phase can change the tops (once its hazards are built).
  updateReveal(next, events);
  updateMineralTraces(next, events);
  return { state: next, events };
}

/**
 * What ending the shift now would do, for the end-shift preview (0014 item
 * 4): the countdowns and flows the player can work out from what it sees
 * (both empty until M2-6), and upkeep's effect on fuel. Does not
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
  CloseMineAction,
  CraftAction,
  CutTreeAction,
  DecommissionCampAction,
  FoundCampAction,
  GiveUpAction,
  MineAction,
  PlaceExplosiveAction,
  PlacePumpAction,
  PlaceSupportAction,
  PlaceVentAction,
  RestAction,
  ScanAction,
  SealAction,
} from './actionTypes';
export { campAirLineIntact } from './airLine';
export { campCells, campsAt } from './camps';
export type {
  AirChangeReason,
  DamageCause,
  DestructionCause,
  FluidKind,
  GameEvent,
  GaugeChangeReason,
  RemovalReason,
  RunEndCause,
  RunOutcome,
} from './events';
export { hashState } from './hash';
export { deserialise, serialise } from './serialise';
export type { SerialisedState } from './serialise';
// What the player sees of a cell (0014 item 3). Tools and the renderer read a
// cell's water, lava, gas, cracks and structures through
// `knownCell`, which answers `null` for a cell the player has not seen.
export { knownCell, knownSquare } from './known';
export type { KnownCell, KnownSquare } from './known';
// The mine action's own check, with the reason for a refusal: what a tap on
// a square the rules forbid shows the player (design doc 4.2).
export { mineCheck } from './actions/mine';
export type { MineCheck, MineRefusalReason } from './actions/mine';
export type { CountdownForecast } from './forecast';
export type { ShiftForecast, UpkeepForecast } from './shift';
export {
  blockAt,
  blockDefAt,
  cellIndex,
  cellPosition,
  countItem,
  inGrid,
  isOpen,
  isRevealed,
  isRunActive,
  isSolid,
  isSurface,
  stockpileEntries,
  structureAt,
} from './state';
export type { ArmedCharge, ArmedKind, Avatar, Camp, GameState, RunStatus } from './state';
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
// square's depth, its top block, and the level rule. `topBlockAt` reads the
// true cube, under a tree too: a view must use `knownSquare` instead.
export { depthAt, isSquare, mayMine, topBlockAt, SQUARE_STEPS } from './heightmap';
export type {
  HigherNeighbour,
  Square,
  MayMineResult,
  MineRefusal,
  SquareDirection,
  SquareStep,
} from './heightmap';
export type { RngState } from './rng';
