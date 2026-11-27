// Public surface of the rules engine. See docs/repo-plan.md section 3.1.
//
// The renderer, the app and the tools use the five functions below and the
// types re-exported at the bottom, and nothing else from this folder.
//
// This file is also the dispatcher: it owns what is common to every action
// (copying the state, checking legality, spending AP, then reveal) and hands
// the rest to one module per rule.

import { CONTRACT_IDS, CREW, SHIFT, SURFACE, WORLD, findLoadout } from '../data';
import { actionKey } from './actionTypes';
import type { Action } from './actionTypes';
import { legalCampActions, applyCampAction } from './actions/camp';
import {
  applyCampToolAction,
  isLegalCampToolAction,
  legalCampToolActions,
} from './actions/campTools';
import { legalCloseMineActions, applyCloseMine } from './actions/closeMine';
import { legalCraftActions, applyCraft } from './actions/craft';
import { legalCutTreeActions, applyCutTree } from './actions/cutTree';
import { legalMineActions, applyMine, mineCheck } from './actions/mine';
import { legalPlaceExplosiveActions, applyPlaceExplosive } from './actions/placeExplosive';
import { legalPlaceSupportActions, applyPlaceSupport, supportCheck } from './actions/placeSupport';
import type { GameEvent } from './events';
import { generateCube } from './generation/cube';
import { generateSpaces } from './generation/spaces';
import { isSquare } from './heightmap';
import { updateReveal } from './reveal';
import { isValidSeed } from './rng';
import { forecastShift, runCubePhase, runUpkeep } from './shift';
import type { ShiftForecast } from './shift';
import { addItem, blankState, cloneState, isRunActive } from './state';
import { generateSurface } from './surface/generation';
import { regrowTrees } from './surface/regrowth';
import { hasTree } from './surface/state';
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
 * 0.5.0: no coal at the surface, a minimum of coal in layer 1 (owner,
 *        2026-11-22, question 140; decision note 0052). First PR of the
 *        batch after the 2026-11-22 playtest.
 * 0.6.0: Lab 2 becomes the game (docs/plans/lab2-becomes-the-game.md). Set
 *        by PR A1, the new world beside the old; covers the batch A1 to B1.
 * 0.7.0: mining a stump's square clears the stump at once (owner, playtest
 *        of 8842e83). First engine PR of the batch after that playtest. It
 *        also covers the changes after the playtest of PR #146 (#147: 100
 *        taps a shift, stumps wait under camps), which should have bumped
 *        and did not.
 * 0.8.0: smelting and crafting, PR 1: the smelter and ingots
 *        (docs/plans/smelting-and-crafting.md). First engine PR of the batch
 *        after the owner's answers of 2026-11-23 (questions 159 to 164).
 *        PR 3 (the iron pickaxe and the copper lantern) and PR 4 (the iron
 *        drill and camp level 4) are in the same batch.
 * 0.9.0: progression in five phases, PR 1: a run lasts 100 shifts, and the
 *        market and coins (docs/plans/progression-phases.md). First engine
 *        PR of the batch after the owner's answers of 2026-11-23; the
 *        plan's later PRs share it until the next playtest.
 * 0.10.0: after the progression playtest build: the market opens only after
 *        a market day's night and closes to start the day; saplings come
 *        only from the market (decision note 0063).
 * 0.11.0: after the market-scene build: as many contracts held at once as
 *        the best camp's level.
 * 0.12.0: after the 0.11.0 build: clay contracts in volume (tiers 1 and 2).
 * 0.13.0: hazards (docs/plans/hazards.md, decision note 0064): rain first;
 *        the plan's later PRs share it until the build with all of them.
 * 0.14.0: after the hazards build: contracts are filled at the market at
 *        once when the store holds what they ask for, and held ones can be
 *        delivered there.
 * 0.15.0: after the 0.14.0 build: relics and keystones in every world
 *        (question 197).
 * 0.16.0: after the 0.15.0 build: tier 2's coal contract asks for 40 coal,
 *        not 80 (question 197).
 * 0.17.0: after the 0.16.0 build: about three times the coal in every world.
 * 0.23.0: after the 0.22.0 build: surface contracts from the first market day,
 *        and lumber at a saw house.
 * 0.22.0: after the 0.21.0 build: a long press digs the 3 x 3 for anyone, a tap a square
 *        without miners; no crew health or rest (unpaid upkeep costs taps); state version 25.
 * 0.21.0: after the 0.20.0 build: a mushroom needs its tree standing.
 * 0.20.0: after the 0.19.0 build: grains and vegetables from seeds; state version 23.
 * 0.19.0: after the 0.18.0 build: no mushrooms under apple trees.
 * 0.18.0: after the 0.17.0 build: the axe (3 wood a tree) and the saw house
 *        (1 more wood from each tree in its reach); state version 20.
 */
export const ENGINE_VERSION = '0.23.0';

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
  // Caverns and pockets under the surface (design doc 3.6), from the same
  // generator.
  generateSpaces(state);
  // The forest on the surface (issue #70), drawn from the same generator.
  generateSurface(state);

  state.crew.health = CREW.startHealth;
  state.shift = SHIFT.firstShiftNumber;
  state.ap = SHIFT.apPerShift;
  state.fuel = loadout.fuel;
  for (const stack of loadout.items) {
    addItem(state, stack.item, stack.count);
  }
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
  ];
  // An action the player cannot afford is not legal (0005 item 12). The rule
  // modules list actions without looking at AP; this is the one place it is
  // checked.
  return all.filter((action) => action.ap <= state.ap);
}

/**
 * True if `action` is one of `legalActions(state)`, worked out without
 * building that list (issue #88 item 6: the list has a few thousand entries,
 * and building it for every action made the simulator slow).
 *
 * The actions that name a square are checked by asking their own rule about
 * that one square: `mineCheck`, `supportCheck`, and so on. The few kinds
 * with a short list of their own (craft, close the mine, the camp actions,
 * the explosive) are looked up in that list. A test checks that this agrees
 * with `legalActions` (campTools.test.ts and properties.test.ts).
 */
export function isLegalAction(state: GameState, action: Action): boolean {
  if (!isRunActive(state)) {
    return false;
  }
  // An action the player cannot afford is not legal (0005 item 12).
  if (action.ap > state.ap) {
    return false;
  }
  const wanted = actionKey(action);
  // `some`: true if any entry of the list passes the test.
  function listed(list: Action[]): boolean {
    return list.some((legal) => actionKey(legal) === wanted);
  }
  switch (action.type) {
    case 'mine':
      // A refused mine has `ap: null`, which equals no number.
      return (
        isSquare(state, action.x, action.y) && mineCheck(state, action.x, action.y).ap === action.ap
      );
    case 'cutTree':
      return (
        isSquare(state, action.x, action.y) &&
        hasTree(state, { x: action.x, y: action.y, z: WORLD.surfaceZ }) &&
        action.ap === SURFACE.cutTree.ap
      );
    case 'placeSupport':
      return (
        isSquare(state, action.x, action.y) &&
        supportCheck(state, action.x, action.y).ap === action.ap
      );
    case 'placePump':
    case 'placeVent':
    case 'seal':
    case 'scan':
      return isLegalCampToolAction(state, action);
    case 'placeExplosive':
      return listed(legalPlaceExplosiveActions(state));
    case 'craft':
      return listed(legalCraftActions(state));
    case 'foundCamp':
    case 'rest':
    case 'decommissionCamp':
      return listed(legalCampActions(state));
    case 'closeMine':
      return listed(legalCloseMineActions(state));
  }
}

/**
 * Take one action. Returns the new state and the events; `state` itself is
 * not changed. Throws if the action is not one of `legalActions(state)`.
 */
export function applyAction(state: GameState, action: Action): StepResult {
  if (!isRunActive(state)) {
    throw new Error('The run has ended; no action can be taken');
  }
  if (!isLegalAction(state, action)) {
    throw new Error(`Not a legal action: ${actionKey(action)}`);
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
 * 4): the cracks and their countdowns, what will slump and crack, where
 * water and lava will flow, where gas will spread and what will explode, and
 * upkeep's effect on fuel. Does not
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
  MineAction,
  PlaceExplosiveAction,
  PlacePumpAction,
  PlaceSupportAction,
  PlaceVentAction,
  RestAction,
  ScanAction,
  SealAction,
} from './actionTypes';
// Camps (design doc 8). Camps are always seen, so a view may read all of
// this: where a camp stands, why a patch is refused, and where mining is
// cheaper.
export {
  campAtSquare,
  campCentredAt,
  campSquares,
  campUpkeepIsDue,
  campsAt,
  foundCampCheck,
  mineDiscountAt,
  stepsFromCamp,
} from './camps';
export type { FoundCampCheck, FoundCampRefusal } from './camps';
export type {
  DamageCause,
  DestructionCause,
  ExplosionKind,
  FluidKind,
  GameEvent,
  GaugeChangeReason,
  RemovalReason,
  RunEndCause,
  RunOutcome,
} from './events';
// The squares the crew worked this shift (design doc 5.2): the player's own
// actions, so a view may show them.
export { isWorked, workedSquares } from './crew';
export { hashState } from './hash';
export { deserialise, serialise } from './serialise';
export type { SerialisedState } from './serialise';
// What the player sees of a cell (0014 item 3). Tools and the renderer read a
// cell's water, lava, gas, cracks and structures through
// `knownCell`, which answers `null` for a cell the player has not seen.
export { knownCell, knownSquare } from './known';
export type { KnownBelow, KnownCell, KnownSquare } from './known';
// What stands on a square in the open (water, lava, gas), and the hazard
// tells a known block shows. Views read both through `knownSquare`.
export type { SquareContents } from './breach';
// True in the cube phase of a shift in which lava flows (design doc 6.4).
export { isLavaStep } from './cube/fluids';
export type { HazardTells } from './tells';
// The mine action's own check, with the reason for a refusal: what a tap on
// a square the rules forbid shows the player (design doc 4.2).
export { mineCheck } from './actions/mine';
export type { MineCheck, MineRefusalReason } from './actions/mine';
// The same for placing a support on a square (design doc 6.1; issue #94).
export { supportCheck } from './actions/placeSupport';
export type { SupportCheck, SupportRefusalReason } from './actions/placeSupport';
// The same for placing an explosive (design doc 6.6; issue #103), with the
// squares its blast would cover, and the unstable ore a mine would arm. All
// three read only what the player sees.
export { explosiveCheck } from './actions/placeExplosive';
export type { ExplosiveCheck, ExplosiveRefusalReason } from './actions/placeExplosive';
export { blastSquares, oreArmedByMine } from './explosions';
// The same for the camp-made tools (design doc 7.2; issue #104): placing a
// pump, sealing a square, scanning; and the squares and cells a scan covers.
// All of it reads only what the player sees.
export {
  pumpCheck,
  scanCells,
  scanCheck,
  scanSquares,
  sealCheck,
  ventCheck,
} from './actions/campTools';
export type {
  PlacedTool,
  ScanCheck,
  ScanRefusalReason,
  SealCheck,
  SealRefusalReason,
  ToolCheck,
  ToolRefusalReason,
} from './actions/campTools';
// The squares within so many steps of a square: a pump's range.
export { squaresWithinSteps } from './cube/fluids';
// Pit walls slump (design doc 6.1): is a square unstable, and which squares
// would a mine make unstable? These read only what the player sees (depths,
// trees, supports, seen top blocks), so a view may call them freely.
export { slumpCheck, unstableAfterMine, unstableAfterSeal, unstableSquares } from './slump';
export type { SlumpCheck, SlumpHold, SlumpReason, UnstableSquare } from './slump';
export type { CountdownForecast } from './forecast';
export type { ShiftForecast, UpkeepForecast } from './shift';
export type {
  CrewDamageForecast,
  CrewDamageSquare,
  CrewForecast,
  DamageCertainty,
  RunLostForecast,
} from './forecast';
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
export type { ArmedCharge, ArmedKind, Camp, Crew, GameState, RunStatus } from './state';
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
// The new game's world (plan A1), beside the old game until phase C.
export { createFrontier, startSquare as frontierStartSquare } from './frontier/generation';
export {
  APPLE_TREE,
  FRONTIER_STATE_VERSION,
  GRASS,
  MAPLE_TREE,
  NO_FEATURE,
  TREE,
  cropOf,
  isTree,
  noHazards,
} from './frontier/state';
// Camps and fog (plan A2).
export {
  CAMP_HALF_SIZE,
  MAX_CAMP_LEVEL,
  blocksMinedAt,
  campAt,
  campRadius,
  campRing,
  canAfford,
  coverLevelAt,
  coverLevels,
  demolishCamp,
  demolishFrontierCamp,
  demolishRefusal,
  footprintOf,
  inCircle,
  inFootprint,
  isLevelPatch,
  foundationDepth,
  layFoundation,
  holdsToolFor,
  levelNeededFor,
  frontierMineCheck,
  toolNeededFor,
  newlyCovered,
  pay,
  placeCamp,
  placeFrontierCamp,
  placeRefusal,
  seenWith,
  sightAt,
  sightMap,
  upgradeCamp,
  upgradeCostFrom,
  upgradeFrontierCamp,
  upgradeRefusal,
} from './frontier/camps';
export type { CampChange, CampGround, PlaceRefusal, Sight } from './frontier/camps';
// The surface and a tap (plan A3).
export { animalAt, gained, harvestAt } from './frontier/surface';
export type { FrontierHarvest, HarvestKind } from './frontier/surface';
export { frontierTap, miningGain, previewTap } from './frontier/tap';
export {
  buildSmelter,
  frontierRecipe,
  hangLantern,
  hasSmelter,
  lanternRefusal,
  makeRecipe,
  makeRefusal,
  smelterRefusal,
} from './frontier/smelting';
export type { LanternRefusal, MakeRefusal, SmelterRefusal } from './frontier/smelting';
export type { FrontierTap, FrontierTapKind } from './frontier/tap';
export { hashFrontier } from './frontier/hash';
// Planting saplings (docs/plans/progression-phases.md, PR 3).
export { isPlantable, isSapling, plant, plantRefusal } from './frontier/farming';
export { cropAt, cropOfSeed, growCrops, isRipe, isSeed } from './frontier/crops';
export {
  BUILDING_COSTS,
  build,
  buildRefusal,
  buildingAt,
  hasBuilding,
  isBuildingKind,
  sawHouseReach,
  sawHouseReaches,
  woodFromTree,
} from './frontier/buildings';
export { fillSquare, fillSquareRefusal } from './frontier/fill';
export { areaCost, minersHeld, tapsPerShift } from './frontier/crew';
export { digArea, digAreaPlan, digAreaRefusal } from './frontier/dig';
export type { DigAreaRefusal } from './frontier/dig';
export { saplingOf, uproot } from './frontier/farming';
export {
  campReach,
  campUpkeep,
  hire,
  hireRefusal,
  inReach,
  nightOfWorkers,
  workCampAt,
} from './frontier/workers';
export type { Hire, HireRefusal, WorkCampKind } from './frontier/workers';
export { besideSawHouse, buildingFootprint, isWorkCamp } from './frontier/buildings';
export type { FillSquareRefusal } from './frontier/fill';
export { mushroomAt, mushroomChance, nightOfMushrooms } from './frontier/mushrooms';
export type { BuildRefusal } from './frontier/buildings';
// Contracts and the phases of a run (PR 5).
export {
  contractBoard,
  contractById,
  deliverContract,
  deliverRefusal,
  dropContract,
  dropRefusal,
  anyDeliverable,
  contractLimit,
  heldContracts,
  openTiers,
  runPhase,
  fillContract,
  fillRefusal,
  takeContract,
  takeRefusal,
} from './frontier/contracts';
export type { ContractRefusal } from './frontier/contracts';
// What the whole world still holds, for the contract board (owner, on the hazards build).
export { groundStock, worldCanFill, worldStock } from './frontier/stock';
// Animal pens (PR 4).
export { breedPens, penAct, penRefusal } from './frontier/pens';
// Marauders and camp defenses (hazards PR 5).
export {
  buildDefense,
  deepestDug,
  defenseRefusal,
  nextDefense,
  nightOfRaids,
  raidStrength,
} from './frontier/raids';
export type { DefenseRefusal, Raid } from './frontier/raids';
export type { PenAction, PenRefusal } from './frontier/pens';
export type { PlantRefusal } from './frontier/farming';
// The run's end and the market (docs/plans/progression-phases.md, PR 1).
export {
  bestCampLevel,
  coinsHeld,
  isMarketDay,
  marketEvery,
  marketIsOpen,
  marketLot,
  mostLots,
  ownsUseful,
  nextMarketShift,
  trade,
  tradeRefusal,
} from './frontier/market';
export type { TradeRefusal, TradeSide } from './frontier/market';
// Shifts (plan A4).
export { endFrontierShift, frontierAct, upkeepDue } from './frontier/shift';
export type { FrontierAction, FrontierOutcome, ShiftReport } from './frontier/shift';
export type { FrontierStatus } from './frontier/state';
// Undo within a shift (plan A5).
export {
  actLogged,
  isUndoable,
  startLog,
  undoCount as shiftUndoCount,
  undoLast as undoLastAction,
} from './frontier/undo';
export type { LoggedAction, ShiftLog } from './frontier/undo';
// Saving a run (plan B1).
export { loadFrontier, saveFrontier } from './frontier/save';
export type {
  Feature,
  FrontierAnimal,
  FrontierCamp,
  FrontierDragon,
  FrontierHazards,
  FrontierBuilding,
  BuildingKind,
  FrontierHeldContract,
  FrontierPump,
  FrontierState,
} from './frontier/state';
// The cube seen from above (design doc v0.2 section 3.1; issue #84): a
// square's depth, its top block, and the level rule. `topBlockAt` reads the
// true cube, under a tree too: a view must use `knownSquare` instead.
export {
  depthAt,
  depthIn,
  depthMapOf,
  fallOf,
  footOf,
  isSquare,
  mayMine,
  slidePath,
  structureOnSquare,
  topBlockAt,
  SQUARE_STEPS,
} from './heightmap';
export type {
  DepthMap,
  HigherNeighbour,
  Square,
  MayMineResult,
  MineRefusal,
  SquareDirection,
  SquareStep,
} from './heightmap';
// UI lab 1 (issue #116): a mine with no turns, beside the real game.
export { labMine } from './lab';
export type { LabMineResult } from './lab';
export type { RngState } from './rng';
