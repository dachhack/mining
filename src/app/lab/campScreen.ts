// UI lab 2 (issue #118): fog of war around camps, with camps you place and
// upgrade.
//
// Built on Lab 1: the same blocks, shadows, tap-to-mine, level rule and
// counter, drawn with the same code (labDraw.ts, labDom.ts, labGestures.ts).
// Lab 2 adds:
//
// - fog: only squares inside a camp's ring are lit and can be mined; squares
//   lit once but out of range now are greyed; the rest is dark;
// - camps: a 3 x 3 base with a tent on it; tap one to see its level, ring and what
//   it mines, and to upgrade it;
// - a camp tool (or a long press on a lit square) to place a new camp,
//   showing its cost and the ring it would light before you confirm.
//
// The rules are in campWorld.ts; this file only draws and reacts to taps.
// It never edits a world: it replaces it with the one campWorld returns.
//
// The map never moves: the panel under it (the "tray") has a fixed height,
// and opening the camp tool or a camp's panel only swaps what is inside it.

import { BLOCKS, blockDefByCode, ITEMS } from '../../data';
import type { ItemId, ItemStack } from '../../data';
import {
  FRONTIER_AXE,
  FRONTIER_CROPS,
  FRONTIER_MINERS,
  FRONTIER_WORK_CAMPS,
  FRONTIER_SURFACE,
  FRONTIER_DEEP_CAMP,
  FRONTIER_DEFENSE,
  FRONTIER_DEFENSE_MIN_LEVEL,
  FRONTIER_DRAGON,
  FRONTIER_DRILL,
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
  FRONTIER_PEN,
  FRONTIER_PHASES,
  FRONTIER_PICKAXE,
  FRONTIER_PUMP,
  FRONTIER_FEATS,
  FRONTIER_RAID,
  FRONTIER_STAGES,
  FRONTIER_RUN,
  FRONTIER_SAPLINGS,
  FRONTIER_SAW_HOUSE,
  FRONTIER_SMELTER,
  FRONTIER_STEEL_DRILL,
  FRONTIER_CAMP_PLACE,
} from '../../data/frontier';
import type { FrontierContractDef, FrontierLot } from '../../data/frontier';
import { LAB_ITEMS, LAB_NEW_CAMP_COST } from '../../data/labCamps';
import type { HigherNeighbour, SquareDirection } from '../../engine';
import {
  BUILDING_COSTS,
  SQUARE_STEPS,
  isBuildingKind,
  isWorkCamp,
  areaCost,
  buildingFootprint,
  campReach,
  campUpkeep,
  tapsPerShift,
  contractBoard,
  anyDeliverable,
  contractLimit,
  contractStage,
  contractsDelivered,
  gloryOf,
  standingOf,
  heldContracts,
  loadFrontier,
  mostLots,
  ownsUseful,
  runPhase,
  saveFrontier,
} from '../../engine';
import type { BuildingKind, DragonAttack, FrontierBuilding, TradeSide } from '../../engine';
import { randomSeed } from '../previewSession';
import { CAMP_LOOK, CAMP_MARKS } from './campLook';
import {
  campWorldOf,
  takeDragonNews,
  toFrontier,
  endShift,
  turnRefusal,
  campAt,
  campRadius,
  campRing,
  campTap,
  canAfford,
  addedNamesAt,
  minesText,
  newCampWorld,
  newlyCovered,
  buildCampSmelter,
  loadCampSmelter,
  loadSmelterPlan,
  loadSmelterRefusal,
  smelterKitRefusal,
  upgradeCampSmelter,
  hangCampLantern,
  lanternRefusal,
  demolishCamp,
  demolishRefusal,
  footprintOf,
  makeCampRecipe,
  makeRefusal,
  contractCamp,
  contractRefusal,
  penCamp,
  penRefusal,
  foundationDepthOf,
  buildCampDefense,
  defenseRefusal,
  closeCampMarket,
  plantCamp,
  plantRefusal,
  buildCampBuilding,
  buildRefusal,
  digAreaPreview,
  digAreaRefusal,
  digCampArea,
  hireAtCamp,
  hireCampRefusal,
  fillCampSquare,
  fillSquareRefusal,
  nextMarketShift,
  smelterRefusal,
  tradeCamp,
  tradeRefusal,
  placeCamp,
  PREPARED_LAB2_KEY,
  placeRefusal,
  replayCampSteps,
  sightMap,
  upgradeCamp,
  upgradeCostFrom,
} from './campWorld';
import type {
  Camp,
  CampStep,
  CampTurn,
  CampWorld,
  PlaceRefusal,
  ShiftReport,
  Sight,
} from './campWorld';
import { centredLabCamera, clampLabCamera, rowsOf } from './labCamera';
import type { LabCamera, ViewSize } from './labCamera';
import { blockIcon, button, element, labCounter, labKey, labTopBar, showKey } from './labDom';
import {
  cueLoop,
  drawBlockSquare,
  drawFloatingLabel,
  drawMinedCue,
  drawRefusedCue,
  prepareCanvas,
  squareBox,
} from './labDraw';
import type { SquareBox } from './labDraw';
import { attachLabGestures } from './labGestures';
import { LAB_LOOK } from './labLook';
import { topBlocksOf } from './labWorld';
import { APPLE_TREE, GRASS, MAPLE_TREE, NO_FEATURE, TREE, isTree } from './surface';
import type { Animal } from './surface';
import type { FrontierDragon } from '../../engine';
import {
  clayTexture,
  drawAnimal,
  drawAppleTree,
  drawMapleTree,
  drawForest,
  drawSapling,
  drawStump,
  drawGrass,
  featureSwatch,
  labItemIcon,
} from './surfaceArt';
import { resourceEntries } from './resources';
import { PINS_KEY, labRecipes, parsePins, recipeById } from './recipes';
import type { Recipe } from './recipes';
import { emptyHistory, noteAction, undoCount, undoLast } from './undoHistory';
import type { UndoHistory } from './undoHistory';
import { shadowEdges } from './shadows';
import {
  drawCampWall,
  drawDefenseTag,
  drawDragon,
  drawFire,
  drawPump,
  drawWater,
  drawDragonPointer,
} from './hazardArt';
import { itemInfo } from './itemInfo';
import {
  drawMushroom,
  drawSawHouse,
  drawSugarShack,
  drawWorkCamp,
  mushroomLook,
} from './buildingArt';
import { drawCrop } from './cropArt';
import { showNight } from './night';
import { raidText } from './raidText';
import { showStory } from './story';
import {
  ROTATING_TIPS,
  TUTORIAL_STEPS,
  TUTORIAL_TIPS,
  nextTip,
  tipsDue,
  tutorialStep,
} from './tutorial';
import type { TutorialFacts, TutorialTarget } from './tutorial';
import type { Night } from './night';

const HINT = 'Tap to gather and dig · tap a camp to upgrade it';
const STEEP_HINT = 'Too steep: mine the higher blocks around it first.';
const BOTTOM_HINT = 'Nothing left to mine here: this is the bottom.';
/** What the line under the map says after a tap that took something from the surface. */
const HARVEST_HINTS = {
  grass: 'Grass cut. The ground under it can be dug now.',
  felled: 'Tree felled. The ground under it can be dug now.',
  apple: 'An apple picked. Empty trees regrow their apples after a while.',
  sap: 'Sap tapped. Boil it into syrup at a sugar shack.',
  mushroom: 'A mushroom picked. Sell it, or fill a mushroom contract.',
  crop: 'Harvested. The soil is bare again: sow another seed (one may have come with it).',
  caught: 'Animal caught!',
};
const GREYED_HINT = 'Out of range now: put a camp nearby to mine here.';
const PLANT_HINT = `Tap bare dirt: trees in ${FRONTIER_SAPLINGS.saplingGrowShifts} shifts, apple and maple trees in ${FRONTIER_SAPLINGS.appleSaplingGrowShifts}.`;
/** What the 🌱 tool plants, in its order: saplings, then seeds (owner, after the 0.19.0 build). */
const PLANTABLES: { item: string; label: string }[] = [
  { item: 'sapling', label: '🌲 Sapling' },
  { item: 'appleSapling', label: '🍎 Apple' },
  { item: 'mapleSapling', label: '🍁 Maple' },
  { item: 'wheatSeed', label: '🌾 Wheat' },
  { item: 'cornSeed', label: '🌽 Corn' },
  { item: 'carrotSeed', label: '🥕 Carrot' },
  { item: 'potatoSeed', label: '🥔 Potato' },
];
/** What the planting line says for `item`. */
function plantHint(item: string): string {
  const crop = FRONTIER_CROPS.find((c) => c.seed === item);
  if (crop === undefined) return PLANT_HINT;
  return `Tap bare dirt: ripe in ${crop.growShifts} shifts, then tap it for ${crop.yield} ${itemName(crop.crop).toLowerCase()}.`;
}
/** Why a sapling cannot be planted, for the hint (progression PR 3). */
const PLANT_REFUSALS: Record<string, string> = {
  noTaps: 'No taps left this shift: tap End shift to carry on.',
  over: 'This run is over. Tap New world to start another.',
  cost: 'You have none of those left.',
  notShown: 'Plant only inside a camp’s ring.',
  camp: 'Not on a camp’s ground.',
  animal: 'An animal stands there.',
  ground: 'Saplings grow only on surface dirt that was never dug.',
  occupied: 'Something grows or stands there already.',
};
/** How far a saw house reaches: a level-1 camp's ring (owner, after the 0.17.0 build). */
const SAW_REACH = campRadius(FRONTIER_SAW_HOUSE.radiusOfLevel);
const FILL_HINT = 'Tap a dug square to fill it 1 level. Free.';
/** Why a square cannot be filled, for the hint. */
const FILL_REFUSALS: Record<string, string> = {
  noTaps: 'No taps left this shift: tap End shift to carry on.',
  over: 'This run is over. Tap New world to start another.',
  notShown: 'Fill only inside a camp’s ring.',
  surface: 'Nothing to fill: that ground was never dug.',
  camp: 'Not on a camp’s ground.',
  building: 'A building stands there.',
  hazard: 'Not on water, fire or a dragon.',
  neighbourDeeper: 'Too high: fill the deeper squares beside it first.',
};
/** The one-square buildings the 🔨 tool builds, in its order: name, icon, and what it does. */
const BUILDINGS: { kind: BuildingKind; name: string; short: string; icon: string; does: string }[] =
  [
    {
      kind: 'sawHouse',
      name: 'Saw house',
      short: 'Saw',
      icon: '🪚',
      does: `+${FRONTIER_SAW_HOUSE.bonus} wood a tree within ${SAW_REACH}.`,
    },
    {
      kind: 'sugarShack',
      name: 'Sugar shack',
      short: 'Shack',
      icon: '🍁',
      does: 'Boils maple sap into syrup.',
    },
    // Work camps, 2 x 2 (owner, after the 0.20.0 build).
    {
      kind: 'lumberCamp',
      name: 'Lumberjack camp',
      short: 'Lumber',
      icon: '🪓',
      does: 'Next to a saw house. Lumberjacks fell a tree each a night.',
    },
    {
      kind: 'farmCamp',
      name: 'Farm camp',
      short: 'Farm',
      icon: '🚜',
      does: 'Farmers harvest every ripe crop in reach each night.',
    },
    {
      kind: 'hermitCamp',
      name: 'Hermit camp',
      short: 'Hermit',
      icon: '🛖',
      does: 'Gatherers take apples, sap and mushrooms in reach each night.',
    },
  ];
/** The building of kind `kind`'s entry in BUILDINGS. */
function buildingInfo(kind: BuildingKind): {
  name: string;
  short: string;
  icon: string;
  does: string;
} {
  return (
    BUILDINGS.find((b) => b.kind === kind) ?? { name: kind, short: kind, icon: '🏠', does: '' }
  );
}
/** Why a building cannot be built, for the hint. */
const BUILD_REFUSALS: Record<string, string> = {
  noTaps: 'No taps left this shift: tap End shift to carry on.',
  over: 'This run is over. Tap New world to start another.',
  cost: 'Not enough to build it.',
  notShown: 'Build only inside a camp’s ring.',
  camp: 'Not on a camp’s ground.',
  occupied: 'A building stands there already.',
  ground: 'Only on surface ground that was never dug.',
  growing: 'Something grows there: clear it first.',
  animal: 'An animal stands there.',
  hazard: 'Not on water, fire or a dragon.',
  sawHouse: 'A lumberjack camp must touch a saw house.',
};
/** Why a worker or a horse cannot be hired at a work camp, for its button. */
const HIRE_REFUSALS: Record<string, string> = {
  noTaps: 'No taps left this shift.',
  over: 'This run is over.',
  full: 'This camp holds as many as it can.',
  horse: 'The next lumberjack needs a horse first.',
  noHorses: 'No horses here.',
  cost: 'Not enough coins.',
  none: 'No camp here.',
};
const PLACE_HINT = 'Tap the middle of a flat, lit 3 × 3 patch for the new camp.';
const PLACE_CHOSEN_HINT = 'Tap Place camp to build here, or tap another spot.';
const NOT_LEVEL_TEXT = 'Ground not level: a camp needs a flat 3 × 3.';
const DEMOLISH_FIRST = 'Build another camp that covers this one first.';
const NO_TAPS_HINT = 'No taps left this shift: tap End shift to carry on.';
const OVER_HINT = 'This run is over. Tap New world to start another.';
const CLOSE_CONFIRM_MS = 3000;
/** Where the tutorial's step is kept (tutorial.ts): {"step": 2, "dugArea": false}, or nothing before it starts. */
const TUTORIAL_KEY = 'mining-game.tutorial';
/** Where the tip the ? is on is kept (tutorial.ts, ROTATING_TIPS): a number. */
const TIP_AT_KEY = 'mining-game.tipAt';
/** Where the ids of the tips already shown are kept (tutorial.ts). */
const TIPS_KEY = 'mining-game.tips';

/** Where the tutorial stands: its step (TUTORIAL_STEPS.length or more: over), and whether a hold dig has been done. */
interface TutorialState {
  step: number;
  dugArea: boolean;
  /** True while the card is minimized into the ? (owner, after the 0.27.0 build). */
  min?: boolean;
}

/** `key`'s JSON from the phone's storage, or `null` (nothing kept, bad JSON, or no storage). */
function loadJson(key: string): unknown {
  try {
    const text = window.localStorage.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Keep `value` as JSON under `key`; nothing happens without storage. */
function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No storage (private mode): it is just not kept.
  }
}

/** The tutorial as kept, or `null` if it has never started. */
function loadTutorial(): TutorialState | null {
  const kept = loadJson(TUTORIAL_KEY);
  if (typeof kept !== 'object' || kept === null) return null;
  const { step, dugArea, min } = kept as { step?: unknown; dugArea?: unknown; min?: unknown };
  return typeof step === 'number' ? { step, dugArea: dugArea === true, min: min === true } : null;
}

/** The ids of the tips already shown. */
function loadTips(): string[] {
  const kept = loadJson(TIPS_KEY);
  return Array.isArray(kept) ? kept.filter((id): id is string => typeof id === 'string') : [];
}

/** How long an accomplishment's toast stays, in milliseconds. */
const FEAT_TOAST_MS = 4500;
/** Where the best glory of any run is kept (accomplishments). */
const BEST_GLORY_KEY = 'mining-game.bestGlory';

/** The best glory of any run on this phone, or 0. */
function loadBestGlory(): number {
  try {
    const n = Number(window.localStorage.getItem(BEST_GLORY_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Keep `glory` if it beats the best so far. */
function saveBestGlory(glory: number): void {
  try {
    if (glory > loadBestGlory()) window.localStorage.setItem(BEST_GLORY_KEY, String(glory));
  } catch {
    // No storage (private mode): the best is just not kept.
  }
}

/** Where the game keeps its run (plan B1). */
export const RUN_KEY = 'mining-game.run';

/** A dragon's attack in the day (dragons.ts), in one short sentence for the hint. */
function dragonText(attack: DragonAttack): string {
  if (attack.kind === 'camp') {
    const lost = attack.upgradesLost ?? 0;
    return `🐉 A dragon set camp ${attack.campId ?? ''} on fire${lost > 0 ? ' and tore down an upgrade' : ''}! Tap the fire to put it out.`;
  }
  if (attack.kind === 'eat') return `🐉 A dragon ate an animal at ${attack.x}, ${attack.y}.`;
  return `🐉 A dragon set ${attack.x}, ${attack.y} on fire.`;
}

/** What End shift did, in one short line for the hint. */
function shiftText(report: ShiftReport, turn: CampTurn): string {
  const paid = report.paid.map((s) => `${s.count} ${itemName(s.item).toLowerCase()}`).join(', ');
  const lacking = report.unpaid.map((s) => s.item).join(' or ');
  const start = `Shift ${report.shift} of ${FRONTIER_RUN.shifts} over`;
  // The last shift (progression plan section 7): the coins held are the score.
  const born =
    report.born > 0
      ? ` ${report.born === 1 ? 'An animal was' : `${report.born} animals were`} born in a pen.`
      : '';
  // Hazards (docs/plans/hazards.md): what the night brought.
  const rain =
    report.rainFilled > 0
      ? ` Rain 🌧 washed soil into ${report.rainFilled} low ${report.rainFilled === 1 ? 'square' : 'squares'}.`
      : report.rained
        ? ' It rained 🌧.'
        : '';
  const pumped =
    report.drained > 0
      ? ` Pumps drained ${report.drained} flooded ${report.drained === 1 ? 'square' : 'squares'}${report.pumpsBack > 0 ? `; ${report.pumpsBack === 1 ? 'a pump is' : `${report.pumpsBack} pumps are`} back in your store` : ''}.`
      : '';
  const burnt =
    report.burned > 0
      ? ` Fire 🔥 burned out ${report.burned} ${report.burned === 1 ? 'square' : 'squares'}${report.campUpgradesBurned > 0 ? `, and a camp lost ${report.campUpgradesBurned === 1 ? 'an upgrade' : `${report.campUpgradesBurned} upgrades`}` : ''}${report.fireSpread > 0 ? `; it spread to ${report.fireSpread} more: put them out` : ''}.`
      : '';
  const dragon = [
    report.dragonCame ? ' A dragon 🐉 flew in.' : '',
    report.dragonAte > 0
      ? ` A dragon ate ${report.dragonAte === 1 ? 'an animal' : `${report.dragonAte} animals`}.`
      : '',
    report.dragonApples > 0 ? ` A dragon ate ${report.dragonApples} apples.` : '',
    report.dragonFires > 0 ? ' A dragon set a fire 🔥.' : '',
  ].join('');
  const raid = report.raid;
  // Strength against the camp's defense (raidText.ts).
  const raided = raid === null ? '' : raidText(raid);
  // Mushrooms (owner, after the 0.17.0 build) come up some nights after rain.
  const mushrooms =
    report.mushroomsCame > 0
      ? ` ${report.mushroomsCame === 1 ? 'A mushroom 🍄 came' : `${report.mushroomsCame} mushrooms 🍄 came`} up under the trees.`
      : '';
  const ripened =
    report.cropsRipened > 0
      ? ` ${report.cropsRipened === 1 ? 'A crop is' : `${report.cropsRipened} crops are`} ripe 🌾: tap to harvest.`
      : '';
  // The work camps (owner, after the 0.20.0 build).
  const work = [
    report.smelted.length > 0
      ? ` The smelters 🔥 made ${report.smelted.map((s) => `${s.count} ${itemName(s.item).toLowerCase()}`).join(' and ')}.`
      : '',
    report.workerWood > 0 ? ` Lumberjacks 🪓 brought in ${report.workerWood} wood.` : '',
    report.workerCrops > 0
      ? ` Farmers 🚜 harvested ${report.workerCrops} ${report.workerCrops === 1 ? 'crop' : 'crops'}.`
      : '',
    report.workerGathered > 0
      ? ` Gatherers 🛖 took ${report.workerGathered} apples, sap and mushrooms.`
      : '',
    report.workCampsIdle > 0
      ? ` ${report.workCampsIdle === 1 ? 'A work camp' : `${report.workCampsIdle} work camps`} went unfed and did no work.`
      : '',
  ].join('');
  const market = `${born}${rain}${mushrooms}${ripened}${work}${pumped}${burnt}${dragon}${raided}${report.marketOpens ? ' Market day: the market 🏪 is open.' : ''}`;
  if (turn.status === 'finished') {
    return `${start}. That was the last shift: the run is over.`;
  }
  if (report.unpaid.length > 0) {
    // Upkeep not paid costs taps of the next shift (owner, after the 0.22.0 build).
    const part = paid === '' ? '' : `paid ${paid}; `;
    return `${start}: ${part}no ${lacking}, so this shift has ${report.tapsLost} fewer taps.${market}`;
  }
  return `${start}: ${paid === '' ? 'nothing due' : `paid ${paid}`}.${market}`;
}

/** What the place-camp tool says about a target the rules refuse. */
function placeRefusalText(refusal: PlaceRefusal): string {
  if (refusal === 'noTaps') return NO_TAPS_HINT;
  if (refusal === 'over') return OVER_HINT;
  if (refusal === 'notShown') return 'The 3 × 3 must be lit, inside a camp’s ring.';
  if (refusal === 'occupied') return 'It overlaps another camp.';
  if (refusal === 'notLevel') return NOT_LEVEL_TEXT;
  if (refusal === 'flooded') return 'The ground is flooded 💧: a pump must drain it first.';
  if (refusal === 'tooShallow')
    return `A deep camp's foundation levels the patch to its deepest square, which must be at depth ${FRONTIER_DEEP_CAMP.minDepth} or more: dig deeper first.`;
  if (refusal === 'animal')
    return 'An animal stands where the foundation would dig: catch it first.';
  if (refusal === 'tooDeep')
    return `Camps stand only in the top ${FRONTIER_CAMP_PLACE.maxDepth + 1} levels: this ground is dug too deep.`;
  return 'Not enough to build it yet: mine more first.';
}

/** A contract action, as a step (progression PR 5). */
type ContractStep =
  | { kind: 'takeContract'; id: string }
  | { kind: 'fillContract'; id: string }
  | { kind: 'deliver'; id: string }
  | { kind: 'dropContract'; id: string };

/** Something drawn over the map for a short while. */
interface Effect {
  kind: 'mined' | 'refused' | 'tooHard' | 'ring';
  x: number;
  y: number;
  start: number;
  /** 'mined': "+1 Stone"; 'tooHard': "Needs Lv 2". */
  label: string;
  /** 'refused': the neighbours that are too high. */
  higher: HigherNeighbour[];
  /** 'ring': the ring spreads from this radius to `toRadius`, in squares. */
  fromRadius: number;
  toRadius: number;
}

/** What the tray under the map shows. */
type Mode =
  | { kind: 'idle' }
  | { kind: 'placing'; target: { x: number; y: number } | null }
  | { kind: 'camp'; id: number }
  // The recipe book is open in the tray.
  | { kind: 'book' }
  // The market's card is open (progression PR 1): only after a market day's night.
  | { kind: 'market' }
  // The goals card: the phase, its goal, and the contract held.
  | { kind: 'goals' }
  // Planting saplings: each tap on the map plants one `item` (progression PR 3).
  | { kind: 'planting'; item: string }
  // Building saw houses: each tap on the map builds one (owner, after the 0.17.0 build).
  // Building (a saw house or a sugar shack), or filling squares with dirt
  // ('dirt'): each tap on the map builds or fills one (owner, after the 0.17.0 build).
  | { kind: 'building'; what: BuildingKind | 'dirt' }
  // A work camp's panel: its workers, reach and upkeep, and Hire (owner, after the 0.20.0 build).
  | { kind: 'workCamp'; x: number; y: number }
  // What can be placed (owner, UI rework: the Place button): camps, buildings, dirt, plants.
  | { kind: 'placeMenu' };

/** How long each kind of effect lasts, in milliseconds. */
function effectMs(kind: Effect['kind']): number {
  if (kind === 'mined') return LAB_LOOK.gainMs;
  if (kind === 'refused') return LAB_LOOK.refusedMs;
  if (kind === 'tooHard') return CAMP_LOOK.tooHardMs;
  return CAMP_LOOK.ringMs;
}

/** The display name of an item. */
/** What the market asks for a sword (hazards PR 4). */
function swordCoins(): number {
  return FRONTIER_MARKET.buyPrices.find((l) => l.item === FRONTIER_DRAGON.sword)?.coins ?? 0;
}

/** What the market asks for a pump (hazards PR 2). */
function pumpCoins(): number {
  return FRONTIER_MARKET.buyPrices.find((l) => l.item === FRONTIER_PUMP.item)?.coins ?? 0;
}

function itemName(item: string): string {
  const lab = LAB_ITEMS[item];
  if (lab !== undefined) {
    return lab; // the lab's own items: wood, grass, apples, animals, clay
  }
  return item in ITEMS ? ITEMS[item as ItemId].name : item;
}

/** The "+2 Wood" label for what a tap gave. */
function gainText(gains: ItemStack[]): string {
  return gains.map((g) => `+${g.count} ${itemName(g.item)}`).join('  ');
}

/** The prepared world in localStorage, or `null` if there is none or it cannot be read. */
function loadPrepared(): CampWorld | null {
  try {
    const text = window.localStorage.getItem(PREPARED_LAB2_KEY);
    if (text === null) {
      return null;
    }
    // `as`: the shape is checked just below, field by field.
    const parsed = JSON.parse(text) as { seed?: unknown; steps?: unknown };
    if (typeof parsed.seed !== 'number' || !Array.isArray(parsed.steps)) {
      return null;
    }
    return replayCampSteps(parsed.seed, parsed.steps as CampStep[]);
  } catch {
    return null;
  }
}

function clearPrepared(): void {
  try {
    window.localStorage.removeItem(PREPARED_LAB2_KEY);
  } catch {
    // No storage: nothing to remove.
  }
}

/** The saved run of the game (plan B1), or `null` if there is none or it cannot be read. */
function loadRun(): CampWorld | null {
  try {
    const state = loadFrontier(window.localStorage.getItem(RUN_KEY));
    return state === null ? null : campWorldOf(state);
  } catch {
    return null; // no storage
  }
}

/**
 * Save the run (question 152: saved every shift). It is saved at the start
 * of each shift, so reopening the app carries on from there; taps since are
 * not kept, as Undo could take them back anyway.
 */
function saveRun(world: CampWorld): void {
  try {
    window.localStorage.setItem(RUN_KEY, saveFrontier(toFrontier(world)));
  } catch {
    // No storage, or it is full: the run goes on, unsaved.
  }
}

/** The pinned recipes saved last time, or the first pins (recipes.ts). */
function loadPins(): string[] {
  try {
    return parsePins(window.localStorage.getItem(PINS_KEY));
  } catch {
    return parsePins(null); // no storage: the first pins
  }
}

/** Save the pinned recipes, so they come back next time (owner, question 143). */
function savePins(pins: string[]): void {
  try {
    window.localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // No storage, or it is full: the pins still work until Lab 2 closes.
  }
}

/** Build Lab 2 inside `root`. `seed` opens that world; `null` picks a random one. */
export function mountCampLab(
  root: HTMLElement,
  seed: number | null,
  onBack: () => void,
  asGame = false,
): void {
  // As the game (plan B1), the run is loaded from its save, or a new one
  // started; a seed in the address starts a new run on that seed. As Lab 2
  // (the sandbox), nothing is saved, and a prepared world may be opened.
  const prepared = asGame ? null : loadPrepared();
  /** True while the world on screen is the prepared one (e2e tests only). */
  let isPrepared = prepared !== null;
  const saved = asGame && seed === null ? loadRun() : null;
  let world: CampWorld = prepared ?? saved ?? newCampWorld(seed ?? randomSeed(Math.random));
  if (asGame) {
    saveRun(world);
  }
  let tops: number[] = topBlocksOf(world.lab.state);
  let sights: Sight[] = sightMap(world);
  let camera: LabCamera = { x: 0, y: 0, cells: CAMP_LOOK.startCells };
  let effects: Effect[] = [];
  let mode: Mode = { kind: 'idle' };
  /**
   * The recipes pinned to the tray's top row, by id, in the order they were
   * pinned. They stay pinned through New world and Undo, and are saved, so
   * they come back when Lab 2 opens again (question 143).
   */
  let pins: string[] = loadPins();
  function setPins(next: string[]): void {
    pins = next;
    savePins(pins);
  }
  /** True while the placing tool places a deep camp, not a camp (progression PR 6). */
  let placingDeep = false;
  /** What the player did, to undo it (undoHistory.ts). A new world starts with none. */
  let history: UndoHistory = emptyHistory(world);
  /**
   * Where each animal was before the last End shift, and when (screen time,
   * in milliseconds): it slides across from there (A4: animals move only
   * when a shift ends).
   */
  const lastStep = new Map<number, { x: number; y: number; at: number; facing: number }>();
  /** Where each dragon flew from in the last night, and when the morning began (hazards PR 4). */
  /** The market rows whose info chip is open, by "side:item" (kept while the card is drawn again). */
  const openInfo = new Set<string>();
  const lastFlight = new Map<number, { x: number; y: number; at: number; ms: number }>();

  // ----- The page -----
  const page = element('main', 'lab lab2');
  page.dataset['testid'] = 'lab2';
  const top = asGame
    ? labTopBar('Mining Game', 'Camps and fog', onBack, 'Other versions')
    : labTopBar('Lab 2', 'Camps and fog', onBack);
  if (asGame) {
    top.newWorld.textContent = 'New run';
    top.newWorld.dataset['testid'] = 'new-run';
  }
  const counter = labCounter();

  const frame = element('div', 'lab-map-frame');
  const canvas = element('canvas', 'lab-map');
  canvas.dataset['testid'] = 'lab-map';
  frame.append(canvas);

  // Undo (owner: "Undo button"): over the map's bottom-right corner, near the
  // thumb, so it takes no room from the tray and never moves the map.
  const undoButton = button('lab2-undo', '↶ Undo');
  undoButton.dataset['testid'] = 'lab2-undo';
  undoButton.setAttribute('aria-label', 'Undo the last action');
  undoButton.addEventListener('click', undo);
  frame.append(undoButton);

  // Shifts (plan A4): the HUD (shift, taps left) over the map's
  // top-left corner; End shift over its bottom-left, by the thumb. Like Undo, they sit over the map, so they
  // take no room from the tray and never move the map.
  const hud = element('div', 'lab2-hud');
  hud.dataset['testid'] = 'lab2-hud';
  hud.setAttribute('aria-live', 'polite');
  const hudShift = element('span', 'lab2-hud-shift');
  const hudTaps = element('span', 'lab2-hud-taps');
  hudTaps.dataset['testid'] = 'lab2-hud-taps';
  hud.append(hudShift, hudTaps);
  const shiftButtons = element('div', 'lab2-shift-buttons');
  const endShiftButton = button('lab2-end-shift', 'End shift');
  endShiftButton.dataset['testid'] = 'lab2-end-shift';
  endShiftButton.addEventListener('click', () => finishShift());
  shiftButtons.append(endShiftButton);
  // Three small buttons over the map's top-right corner, where Close mine
  // was (owner, UI rework: "Don't need the close mine button. ... Three small
  // buttons where close mine used to be: Contracts, Recipe book/Craft, Place").
  const mapButtons = element('div', 'lab2-map-buttons');
  const goalsButton = button('lab2-map-button', '🎯');
  goalsButton.dataset['testid'] = 'lab2-goals';
  goalsButton.addEventListener('click', () => openGoals());
  const bookButton = button('lab2-map-button', '📖');
  bookButton.dataset['testid'] = 'lab2-book';
  bookButton.setAttribute('aria-label', 'Recipe book: craft');
  bookButton.title = 'Craft';
  bookButton.addEventListener('click', () => openBook());
  const placeButton = button('lab2-map-button', '⊕');
  placeButton.dataset['testid'] = 'lab2-place-tool';
  placeButton.setAttribute('aria-label', 'Place: a camp, a building, dirt or a plant');
  placeButton.title = 'Place';
  placeButton.addEventListener('click', () => setMode({ kind: 'placeMenu' }));
  // Left to right as the owner named them: Place, the recipe book, Contracts.
  mapButtons.append(placeButton, bookButton, goalsButton);
  const overBanner = element('div', 'lab2-over');
  overBanner.dataset['testid'] = 'lab2-over';
  // An accomplishment just earned (the engine's feats.ts): a toast over the
  // map, under the HUD, for a few seconds; a tap sends it away.
  const featToast = element('div', 'lab2-feat-toast');
  featToast.dataset['testid'] = 'lab2-feat-toast';
  featToast.setAttribute('role', 'status');
  featToast.hidden = true;
  featToast.addEventListener('click', () => {
    featToast.hidden = true;
  });
  // The tutorial's card (tutorial.ts): over the map, above End shift and
  // Undo. Taps go through it to the map; only its button takes them.
  const tutorialCard = element('div', 'lab2-tutorial');
  tutorialCard.dataset['testid'] = 'lab2-tutorial';
  tutorialCard.setAttribute('role', 'status');
  tutorialCard.hidden = true;
  const tutorialText = element('p', 'lab2-tutorial-text');
  tutorialText.dataset['testid'] = 'lab2-tutorial-text';
  const tutorialCount = element('span', 'lab2-tutorial-count');
  const tutorialButton = button('lab2-tutorial-button', 'Skip');
  tutorialButton.dataset['testid'] = 'lab2-tutorial-button';
  // Minimize: the card folds into the ? above End shift.
  const tutorialMin = button('lab2-tutorial-min', '–');
  tutorialMin.dataset['testid'] = 'lab2-tutorial-min';
  tutorialMin.setAttribute('aria-label', 'Minimize');
  tutorialMin.title = 'Minimize';
  const tutorialButtons = element('div', 'lab2-tutorial-buttons');
  tutorialButtons.append(tutorialMin, tutorialButton);
  const tutorialFoot = element('div', 'lab2-tutorial-foot');
  tutorialFoot.append(tutorialCount, tutorialButtons);
  tutorialCard.append(tutorialText, tutorialFoot);
  // The ? above End shift: the card minimized, and after the tutorial the tips.
  const helpButton = button('lab2-help', '?');
  helpButton.dataset['testid'] = 'lab2-help';
  helpButton.setAttribute('aria-label', 'Tips');
  helpButton.title = 'Tips';
  helpButton.hidden = true;
  frame.append(hud, shiftButtons, mapButtons, overBanner, featToast, tutorialCard, helpButton);

  const hint = element('p', 'lab-hint', HINT);
  hint.dataset['testid'] = 'lab-hint';
  hint.setAttribute('aria-live', 'polite');

  // The tray: a fixed height, whatever it shows (see lab.css).
  const tray = element('section', 'lab2-tray');
  tray.dataset['testid'] = 'lab2-tray';

  // The recipe book (owner, after the playtest of PR #146: "The recipe book
  // should be a card that pops up over the entire screen"): a card over the
  // whole screen, inside the system bars. The map and tray stay as they were
  // behind it. × closes it, and so does the phone's back button (see
  // `openBook` and `closeBook`).
  const bookCard = element('section', 'lab2-book-card');
  bookCard.dataset['testid'] = 'lab2-book-card';
  bookCard.setAttribute('role', 'dialog');
  bookCard.setAttribute('aria-modal', 'true');
  bookCard.setAttribute('aria-label', 'Recipe book');
  bookCard.hidden = true;
  /** A line at the top of the book saying what was just made; empty until something is. */
  const bookNote = element('p', 'lab2-book-note');
  bookNote.dataset['testid'] = 'lab2-book-note';

  page.append(top.bar, counter, frame, hint, tray, bookCard);
  root.replaceChildren(page);

  // The phone's back button: Android's WebView goes back in the page's
  // history. Opening the book adds a history entry (same address, so the
  // screen does not reload), and going back from it closes the book.
  window.addEventListener('popstate', () => {
    if (mode.kind === 'market') {
      leaveMarket(); // going back closes the market, and the day starts
    } else if (mode.kind === 'book' || mode.kind === 'goals') {
      setMode({ kind: 'idle' });
    }
  });
  window.addEventListener('keydown', (event) => {
    const card = mode.kind === 'book' || mode.kind === 'market' || mode.kind === 'goals';
    if (event.key === 'Escape' && card) closeBook();
  });

  // ----- Drawing -----
  /**
   * The map's size on screen. While a frame is being drawn it is read once
   * and kept (`viewInDraw`): `toPx` asks for it for every square, and each
   * read of the page's layout has a cost.
   */
  let viewInDraw: ViewSize | null = null;
  function view(): ViewSize {
    return viewInDraw ?? { width: canvas.clientWidth, height: canvas.clientHeight };
  }
  function cellPixels(): number {
    return view().width / camera.cells;
  }
  function toPx(x: number, y: number): { px: number; py: number } {
    const c = cellPixels();
    return { px: (x - camera.x) * c, py: (y - camera.y) * c };
  }
  function sightOf(x: number, y: number): Sight {
    const size = world.lab.state.size;
    if (x < 0 || y < 0 || x >= size.x || y >= size.y) {
      return 'fog';
    }
    return sights[x + size.x * y] ?? 'fog';
  }

  /** The squares a new camp on the tool's target would light: for the preview. */
  let preview: Set<number> = new Set();
  /**
   * A held long press (owner, after the 0.22.0 build: "Long press, it
   * highlights squares that will get dug and tells you cost. Release and it
   * digs."): the middle of the 3 x 3 under the finger, and the squares a dig
   * there would dig. `null` when no press is held.
   */
  let held: { x: number; y: number; dug: { x: number; y: number }[] } | null = null;

  // The ground (fog, blocks, plants, greyed squares, the lit edge) is drawn
  // into `ground`, an offscreen canvas, and each frame copies it; only what
  // moves (animals, the place preview, camps, effects) is drawn every frame.
  // On a fully revealed map, redrawing every square each frame made the game
  // slow (owner, after the playtest of 8842e83). So:
  // - a tap draws the ground again only around the squares it changed;
  // - `ground` reaches GROUND_MARGIN css pixels past each side of the view,
  //   drawn for the camera as it was then (`groundCamera`), so a pan only
  //   shifts the copy, until it nears the margin's edge or the pan stops;
  // - a zoom, or a new canvas size, draws it all again.
  const ground = document.createElement('canvas');
  /** How far, in css pixels, the ground reaches past each side of the view. */
  const GROUND_MARGIN = 160;
  /** How long after the camera last moved the ground is drawn again for where it stopped, in ms. */
  const GROUND_SETTLE_MS = 150;
  /** The camera the ground was drawn for. */
  let groundCamera: LabCamera = { ...camera };
  /** The world (and what is seen) the ground was last drawn from. */
  let groundKey: unknown[] = [];
  /** The zoom and canvas size the ground was drawn for: a change draws it all again. */
  let drawnView = '';
  /** How many times the ground has been drawn, and whether last time it was all of it or a part: for the e2e tests. */
  let groundDraws = 0;
  let groundDrawn: 'all' | 'part' = 'all';
  /** The timer that draws the ground again once a pan stops. */
  let settleTimer = 0;

  /**
   * What each square looked like when the ground was last drawn: its top
   * block, depth, plant, apples, stump and sight. A tap changes one or two
   * squares, so only the area around them is drawn again (see `drawGround`).
   */
  let drawnSquares: string[] = [];

  /** A building's look on square `i`, for `squareLook`: its kind and, for a work camp, its workers. */
  function buildingLook(i: number): string {
    const width = world.lab.state.size.x;
    const b = buildingOn(i % width, Math.floor(i / width));
    return b === null ? '' : `${b.kind}${b.workers}`;
  }

  /** How square `i` looks, as one string, for spotting the squares that changed. */
  function squareLook(i: number): string {
    return [
      tops[i],
      world.lab.depths.depths[i],
      world.surface.features[i],
      world.surface.apples[i],
      world.surface.stumps[i],
      sights[i],
      // The hazards drawn on the ground (owner: "Can't see pump when you set it down").
      world.hazards.flooded[i] === true ? 'w' : '',
      world.hazards.fires[i] === true ? 'f' : '',
      world.hazards.pumps.some((p) => p.x + world.lab.state.size.x * p.y === i) ? 'p' : '',
      buildingLook(i),
      world.mushrooms[i] === true ? 'm' : '',
      `${world.crops[i] ?? 0}${world.cropIn[i] === 0 ? 'r' : ''}`,
    ].join(',');
  }

  /**
   * Run `paint` with the camera set to the one the ground was drawn for, so
   * that `toPx` and everything that draws a square place it on the ground.
   */
  function atGroundCamera(paint: () => void): void {
    const now = camera;
    camera = groundCamera;
    try {
      paint();
    } finally {
      camera = now;
    }
  }

  /**
   * Bring `ground` up to date: all of it when the zoom or the canvas changed,
   * when the camera has moved nearly to the edge of its margin, or when
   * `settle` is set (a pan has stopped); otherwise only the squares that
   * changed, with 3 squares round them (shadows, forest edges, the lit edge
   * and the fog's mottle reach that far).
   */
  function drawGround(width: number, height: number, ratio: number, settle: boolean): void {
    const c = cellPixels();
    const viewKey = [camera.cells, width, height, ratio].join(',');
    const shiftX = (groundCamera.x - camera.x) * c;
    const shiftY = (groundCamera.y - camera.y) * c;
    const moved = shiftX !== 0 || shiftY !== 0;
    const tooFar = Math.abs(shiftX) > GROUND_MARGIN || Math.abs(shiftY) > GROUND_MARGIN;
    const size = world.lab.state.size;
    const pixelWidth = Math.round((width + 2 * GROUND_MARGIN) * ratio);
    const pixelHeight = Math.round((height + 2 * GROUND_MARGIN) * ratio);
    const ctx = ground.getContext('2d');
    if (ctx === null) {
      return;
    }
    if (viewKey !== drawnView || tooFar || (settle && moved)) {
      // All of it, for the camera as it is now.
      if (ground.width !== pixelWidth || ground.height !== pixelHeight) {
        ground.width = pixelWidth;
        ground.height = pixelHeight;
      }
      groundCamera = { ...camera };
      drawnView = viewKey;
      groundKey = [
        world.lab.state,
        world.lab.depths,
        world.surface,
        world.camps,
        sights,
        world.hazards,
        world.buildings,
        world.mushrooms,
        world.crops,
        world.cropIn,
      ];
      drawnSquares = [];
      for (let i = 0; i < size.x * size.y; i += 1) drawnSquares.push(squareLook(i));
      groundDraws += 1;
      groundDrawn = 'all';
      ctx.setTransform(ratio, 0, 0, ratio, GROUND_MARGIN * ratio, GROUND_MARGIN * ratio);
      ctx.imageSmoothingEnabled = true;
      drawGroundOn(ctx, null);
      return;
    }
    const key = [
      world.lab.state,
      world.lab.depths,
      world.surface,
      world.camps,
      sights,
      world.hazards,
      world.buildings,
      world.mushrooms,
      world.crops,
      world.cropIn,
    ];
    if (key.every((k, i) => k === groundKey[i])) {
      return; // the same world: the ground is as it was
    }
    groundKey = key;
    // The squares that look different now: their bounding box, if any.
    const looks: string[] = [];
    for (let i = 0; i < size.x * size.y; i += 1) looks.push(squareLook(i));
    let area: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (let i = 0; i < looks.length; i += 1) {
      if (looks[i] === drawnSquares[i]) continue;
      const x = i % size.x;
      const y = Math.floor(i / size.x);
      area =
        area === null
          ? { x0: x, y0: y, x1: x, y1: y }
          : {
              x0: Math.min(area.x0, x),
              y0: Math.min(area.y0, y),
              x1: Math.max(area.x1, x),
              y1: Math.max(area.y1, y),
            };
    }
    drawnSquares = looks;
    if (area === null) {
      return; // nothing on the ground changed (camps are drawn on top)
    }
    groundDraws += 1;
    groundDrawn = 'part';
    const reach = 3;
    const part = {
      x0: area.x0 - reach,
      y0: area.y0 - reach,
      x1: area.x1 + reach,
      y1: area.y1 + reach,
    };
    atGroundCamera(() => {
      // Only the part is drawn again: clipped to it, on whole device pixels
      // (a clip edge through the middle of a pixel would blend the old
      // ground and the new along it). Squares just outside the part spill
      // into it (the lit edge's glow, a forest's edge, a shadow), so they
      // are drawn too, and clipped.
      const from = toPx(part.x0, part.y0);
      const to = toPx(part.x1 + 1, part.y1 + 1);
      const left = Math.floor((from.px + GROUND_MARGIN) * ratio);
      const top = Math.floor((from.py + GROUND_MARGIN) * ratio);
      const right = Math.ceil((to.px + GROUND_MARGIN) * ratio);
      const bottom = Math.ceil((to.py + GROUND_MARGIN) * ratio);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      ctx.setTransform(ratio, 0, 0, ratio, GROUND_MARGIN * ratio, GROUND_MARGIN * ratio);
      drawGroundOn(ctx, {
        x0: part.x0 - 3,
        y0: part.y0 - 3,
        x1: part.x1 + 3,
        y1: part.y1 + 3,
      });
      ctx.restore();
    });
  }

  function draw(now: number = performance.now(), settle = false): void {
    viewInDraw = null;
    const ready = prepareCanvas(canvas);
    if (ready === null) {
      return;
    }
    viewInDraw = { width: ready.width, height: ready.height };
    try {
      drawFrame(ready, now, settle);
    } finally {
      viewInDraw = null;
    }
  }

  /** One frame of the map, into the canvas `prepareCanvas` made ready. */
  function drawFrame(
    ready: { ctx: CanvasRenderingContext2D; width: number; height: number },
    now: number,
    settle: boolean,
  ): void {
    const { ctx } = ready;
    const c = cellPixels();
    const ratio = window.devicePixelRatio || 1;
    drawGround(ready.width, ready.height, ratio, settle);
    // The ground, shifted by however far the camera has moved since it was
    // drawn (in whole device pixels, so it is copied, not resampled).
    const shiftX = Math.round(((groundCamera.x - camera.x) * c - GROUND_MARGIN) * ratio);
    const shiftY = Math.round(((groundCamera.y - camera.y) * c - GROUND_MARGIN) * ratio);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(ground, shiftX, shiftY);
    ctx.restore();
    if (groundCamera.x !== camera.x || groundCamera.y !== camera.y) {
      // Panning: once the camera stops, draw the ground for where it stopped.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => draw(performance.now(), true), GROUND_SETTLE_MS);
    }

    drawAnimals(ctx, c);
    // Dragons (hazards PR 4), on lit squares only. In the morning one glides
    // from where it was to where it flew in the night, so it is seen to move.
    // Dragons are drawn wherever they are, over the fog too, and one off the
    // screen gets a pointer at the map's edge (owner, after the 0.26.0 build:
    // "The dragon showed up but I couldn't see it").
    let pointers = 0;
    for (const dragon of world.hazards.dragons) {
      const flight = lastFlight.get(dragon.id);
      let fx = dragon.x;
      let fy = dragon.y;
      if (flight !== undefined) {
        const t = Math.min(1, Math.max(0, (now - flight.at) / flight.ms));
        const eased = t * t * (3 - 2 * t);
        fx = flight.x + (dragon.x - flight.x) * eased;
        fy = flight.y + (dragon.y - flight.y) * eased;
      }
      const { px, py } = toPx(fx, fy);
      const mx = px + c / 2;
      const my = py + c / 2;
      const v = view();
      if (mx < 0 || my < 0 || mx > v.width || my > v.height) {
        const size = Math.max(26, Math.min(38, c * 1.2));
        const edge = size * 0.9;
        // Clear of the HUD and map buttons along the top, and of End shift
        // and Undo along the bottom (CAMP_LOOK.pointerInsets).
        const [top, bottom] = CAMP_LOOK.pointerInsets;
        const x = Math.min(v.width - edge, Math.max(edge, mx));
        const y = Math.min(v.height - bottom - edge, Math.max(top + edge, my));
        drawDragonPointer(ctx, x, y, Math.atan2(my - y, mx - x), size);
        pointers += 1;
      } else {
        drawDragon(ctx, mx, my, c);
      }
    }
    // For the tests: how many dragons are pointed at from the edge.
    if (canvas.dataset['dragonPointers'] !== String(pointers)) {
      canvas.dataset['dragonPointers'] = String(pointers);
    }
    if (mode.kind === 'placing' && mode.target !== null) {
      drawPlacePreview(ctx, mode.target, c, now);
    }
    if (held !== null) drawDigPreview(ctx, held, c);
    for (const camp of world.camps) {
      if (sightOf(camp.x, camp.y) === 'shown') {
        const selected = mode.kind === 'camp' && mode.id === camp.id;
        if (selected) {
          drawRing(ctx, camp.x, camp.y, campRing(camp), c, 1, false);
        }
        drawCampMarker(ctx, camp, c, selected);
      }
    }
    // Fires on a camp's ground go over its marker, so a burning camp shows (hazards PR 3).
    const across = world.lab.state.size.x;
    world.hazards.fires.forEach((burning, i) => {
      const fx = i % across;
      const fy = Math.floor(i / across);
      if (!burning || campAt(world, fx, fy) === null || sightOf(fx, fy) !== 'shown') return;
      const { px, py } = toPx(fx, fy);
      drawFire(ctx, squareBox(px, py, c), fx, fy, now);
    });
    drawEffects(ctx, now, c);
    writeCanvasData(c);
  }

  /** True if square (x, y), or one within 2 squares of it, is fog. */
  function fogNear(x: number, y: number): boolean {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (sightOf(x + dx, y + dy) === 'fog') return true;
      }
    }
    return false;
  }

  /**
   * The ground: fog, then every lit or greyed square, then the edge of the
   * lit area. With `part`, only the squares in it (the caller clips to it).
   */
  function drawGroundOn(
    ctx: CanvasRenderingContext2D,
    part: { x0: number; y0: number; x1: number; y1: number } | null,
  ): void {
    const css = view();
    const c = cellPixels();
    const size = world.lab.state.size;
    const margin = GROUND_MARGIN / c; // the ground's margin, in squares
    // The squares in view and in the margin, or in `part` (as far as it is in them).
    const x0 = Math.max(0, Math.floor(camera.x - margin), part?.x0 ?? 0);
    const y0 = Math.max(0, Math.floor(camera.y - margin), part?.y0 ?? 0);
    const x1 = Math.min(
      size.x - 1,
      Math.ceil(camera.x + camera.cells + margin),
      part?.x1 ?? size.x,
    );
    const y1 = Math.min(
      size.y - 1,
      Math.ceil(camera.y + rowsOf(camera, css) + margin),
      part?.y1 ?? size.y,
    );

    // Fog fills everything first, edge to edge (no gaps between fog squares).
    ctx.fillStyle = CAMP_MARKS.fog;
    ctx.fillRect(
      -GROUND_MARGIN,
      -GROUND_MARGIN,
      css.width + 2 * GROUND_MARGIN,
      css.height + 2 * GROUND_MARGIN,
    );
    // A faint, soft mottle, so the fog reads as darkness over ground, not a
    // hole. A patch reaches under 2 squares or so either way; where all of
    // those are lit or greyed, their squares cover it, so it is not drawn.
    // A patch reaches about 3 squares, so those just outside are drawn too.
    for (let y = y0 - 3; y <= y1 + 3; y += 1) {
      for (let x = x0 - 3; x <= x1 + 3; x += 1) {
        if ((x * 7 + y * 13) % 6 === 0 && fogNear(x, y)) {
          const { px, py } = toPx(x, y);
          const glow = ctx.createRadialGradient(
            px + c / 2,
            py + c / 2,
            0,
            px + c / 2,
            py + c / 2,
            c * 1.8,
          );
          glow.addColorStop(0, CAMP_MARKS.fogMottle);
          glow.addColorStop(1, 'rgba(255, 240, 220, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(px - c * 1.8, py - c * 1.8, c * 4.6, c * 4.6);
        }
      }
    }

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const sight = sightOf(x, y);
        if (sight === 'fog') {
          continue;
        }
        const { px, py } = toPx(x, y);
        const box = squareBox(px, py, c);
        const i = x + size.x * y;
        const depth = world.lab.depths.depths[i] ?? 0;
        // A gap-coloured backing, so lit and greyed squares keep Lab 1's thin grid.
        ctx.fillStyle = '#0d0b0a';
        ctx.fillRect(px, py, c, c);
        // Clay is a real block now (plan A1): it is drawn with its own texture.
        const clay = tops[i] === BLOCKS.clay.code ? clayTexture(x, y) : null;
        drawBlockSquare(
          ctx,
          tops[i] ?? 0,
          depth,
          shadowEdges(world.lab.depths, x, y),
          x,
          y,
          box,
          clay,
        );
        drawFeature(ctx, i, box, x, y, { px, py, c });
        // Hazards (docs/plans/hazards.md): water, and a pump on it.
        if (world.hazards.flooded[i] === true) {
          drawWater(ctx, box, x, y);
          if (world.hazards.pumps.some((p) => p.x === x && p.y === y)) drawPump(ctx, box);
        }
        // A building (owner, after the 0.17.0 build). A 2 x 2 work camp is
        // drawn whole, clipped to this square, so one square can be redrawn.
        const building = buildingOn(x, y);
        if (building?.kind === 'sawHouse') drawSawHouse(ctx, box);
        if (building?.kind === 'sugarShack') drawSugarShack(ctx, box);
        if (
          building !== null &&
          (building.kind === 'lumberCamp' ||
            building.kind === 'farmCamp' ||
            building.kind === 'hermitCamp')
        ) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(px, py, c, c);
          ctx.clip();
          const whole = {
            left: box.left - (x - building.x) * c,
            top: box.top - (y - building.y) * c,
            inner: box.inner + c,
          };
          drawWorkCamp(ctx, whole, building.kind, building.workers);
          ctx.restore();
        }
        // A crop (owner, after the 0.19.0 build): sprouts, or ripe.
        const sown = FRONTIER_CROPS[(world.crops[i] ?? 0) - 1];
        if (sown !== undefined) drawCrop(ctx, box, sown.crop, world.cropIn[i] === 0);
        // A mushroom (owner, after the 0.17.0 build): one of 7 looks, at a
        // spot of its square, both fixed by the square (mushroomLook).
        if (world.mushrooms[i] === true) drawMushroom(ctx, box, mushroomLook(i));
        // A fire (hazards PR 3), drawn still: the ground is drawn once and kept.
        if (world.hazards.fires[i] === true) drawFire(ctx, box, x, y, 0);
        if (sight === 'greyed') {
          drawGreyed(ctx, px, py, c);
        }
      }
    }

    // The edge of the lit area: a soft shade inside, a glow spilling outside, a thin line on it.
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (sightOf(x, y) === 'shown') {
          drawLitEdges(ctx, x, y, c);
        }
      }
    }
  }

  /** The canvas's data attributes as last written, and the world they were worked out for: see `writeCanvasData`. */
  const canvasData = new Map<string, string>();
  let canvasDataWorld: CampWorld | null = null;
  let canvasDataSights: Sight[] | null = null;

  /** What the map shows, as data attributes on the canvas, for the e2e tests. */
  function writeCanvasData(c: number): void {
    // Every frame calls this: write an attribute only when its value changed
    // (each write makes the browser look at the page's styles again), and
    // work out the world's part only when the world changed (owner, after the
    // 0.28.0 build: "The game still slows down when the map is full").
    const put = (key: string, value: string): void => {
      if (canvasData.get(key) === value) return;
      canvasData.set(key, value);
      canvas.dataset[key] = value;
    };
    put('groundDraws', String(groundDraws));
    put('groundDrawn', groundDrawn);
    put('camX', String(camera.x));
    put('camY', String(camera.y));
    put('cells', String(camera.cells));
    put('cellPx', String(c));
    put('mode', mode.kind);
    // The square a new camp would go on, while placing: '' if none yet.
    put(
      'target',
      mode.kind === 'placing' && mode.target !== null ? `${mode.target.x},${mode.target.y}` : '',
    );
    if (canvasDataWorld === world && canvasDataSights === sights) return;
    canvasDataWorld = world;
    canvasDataSights = sights;
    canvas.dataset['shown'] = String(sights.filter((s) => s === 'shown').length);
    canvas.dataset['greyed'] = String(sights.filter((s) => s === 'greyed').length);
    canvas.dataset['camps'] = String(world.camps.length);
    // For the e2e tests: the shift, and where the animals are.
    canvas.dataset['shift'] = String(world.turn.shift);
    canvas.dataset['animals'] = world.surface.animals.map((a) => `${a.x},${a.y}`).join(' ');
    // ...and the stumps (felled trees that will grow back), drawn as rings.
    const width = world.lab.state.size.x;
    const stumps: string[] = [];
    world.surface.stumps.forEach((stump, i) => {
      if (stump !== NO_FEATURE) stumps.push(`${i % width},${Math.floor(i / width)}`);
    });
    canvas.dataset['stumps'] = stumps.join(' ');
    // ...and the hazards: flooded squares and pumps (hazards PR 2).
    const flooded: string[] = [];
    world.hazards.flooded.forEach((wet, i) => {
      if (wet) flooded.push(`${i % width},${Math.floor(i / width)}`);
    });
    canvas.dataset['flooded'] = flooded.join(' ');
    canvas.dataset['pumps'] = world.hazards.pumps.map((p) => `${p.x},${p.y}`).join(' ');
    const fires: string[] = [];
    world.hazards.fires.forEach((burning, i) => {
      if (burning) fires.push(`${i % width},${Math.floor(i / width)}`);
    });
    canvas.dataset['fires'] = fires.join(' ');
    canvas.dataset['dragons'] = world.hazards.dragons.map((d) => `${d.x},${d.y}`).join(' ');
    const mushrooms: string[] = [];
    world.mushrooms.forEach((m, i) => {
      if (m) mushrooms.push(`${i % width},${Math.floor(i / width)}`);
    });
    canvas.dataset['mushrooms'] = mushrooms.join(' ');
    // The crops, as "x,y:crop" with ":ripe" once ripe.
    const crops: string[] = [];
    world.crops.forEach((k, i) => {
      const def = FRONTIER_CROPS[k - 1];
      if (def === undefined) return;
      const ripe = world.cropIn[i] === 0 ? ':ripe' : '';
      crops.push(`${i % width},${Math.floor(i / width)}:${def.crop}${ripe}`);
    });
    canvas.dataset['crops'] = crops.join(' ');
    // The buildings, as "kind@x,y".
    canvas.dataset['buildings'] = world.buildings.map((b) => `${b.kind}@${b.x},${b.y}`).join(' ');
    // Each camp's defense level, as drawn on its marker: "id:level".
    canvas.dataset['defenses'] = world.camps.map((camp) => `${camp.id}:${camp.defense}`).join(' ');
  }

  /** The building whose square or 2 x 2 covers (x, y), or `null`. */
  function buildingOn(x: number, y: number): FrontierBuilding | null {
    return (
      world.buildings.find((b) =>
        buildingFootprint(b.kind, b.x, b.y).some((s) => s.x === x && s.y === y),
      ) ?? null
    );
  }

  /** True if square (x, y) is on the map, not in fog, and has a tree or an apple tree: part of a forest. */
  function forestAt(x: number, y: number): boolean {
    const size = world.lab.state.size;
    if (x < 0 || y < 0 || x >= size.x || y >= size.y || sightOf(x, y) === 'fog') {
      return false;
    }
    const feature = world.surface.features[x + size.x * y];
    return isTree(feature);
  }

  /**
   * What grows on square `i` (grass, a tree, an apple tree), drawn over its
   * block and hiding it. Trees join the forest squares beside them. A stump
   * is drawn small, over the block.
   */
  function drawFeature(
    ctx: CanvasRenderingContext2D,
    i: number,
    box: SquareBox,
    x: number,
    y: number,
    cell: { px: number; py: number; c: number },
  ): void {
    const feature = world.surface.features[i];
    if (feature === GRASS) {
      drawGrass(ctx, box, x, y);
      return;
    }
    if (!isTree(feature)) {
      const stump = world.surface.stumps[i] ?? NO_FEATURE;
      if (stump !== NO_FEATURE && world.surface.planted[i] === true) {
        drawSapling(ctx, box, stump === APPLE_TREE, stump === MAPLE_TREE); // a planted sapling
      } else if (stump !== NO_FEATURE) {
        drawStump(ctx, box); // a felled tree that will grow back
      }
      return;
    }
    const joins = {
      n: forestAt(x, y - 1),
      e: forestAt(x + 1, y),
      s: forestAt(x, y + 1),
      w: forestAt(x - 1, y),
    };
    if (feature === TREE) {
      drawForest(ctx, cell, box, x, y, joins);
    } else if (feature === MAPLE_TREE) {
      drawMapleTree(ctx, cell, box, x, y, joins, world.surface.apples[i] ?? 0);
    } else {
      drawAppleTree(ctx, cell, box, x, y, joins, world.surface.apples[i] ?? 0);
    }
  }

  /**
   * The animals on lit squares (never in fog or on greyed ground). An animal
   * that has just stepped slides across from where it was.
   */
  function drawAnimals(ctx: CanvasRenderingContext2D, c: number): void {
    const now = performance.now();
    for (const animal of world.surface.animals) {
      if (sightOf(animal.x, animal.y) !== 'shown') {
        continue;
      }
      const step = lastStep.get(animal.id);
      let ax = animal.x;
      let ay = animal.y;
      let facing = 0;
      if (step !== undefined) {
        facing = step.facing;
        const t = Math.min(1, Math.max(0, (now - step.at) / CAMP_LOOK.animalSlideMs));
        ax = step.x + (animal.x - step.x) * t;
        ay = step.y + (animal.y - step.y) * t;
      }
      const { px, py } = toPx(ax, ay);
      drawAnimal(ctx, px + c / 2, py + c / 2, c, facing);
    }
  }

  /** Note each animal that moved between `before` and the world now, for `drawAnimals`. */
  /** Note each dragon that flew in the night, so it glides there in the morning. */
  function noteFlights(before: FrontierDragon[], ms = CAMP_LOOK.dragonFlightMs): void {
    for (const dragon of world.hazards.dragons) {
      const was = before.find((d) => d.id === dragon.id);
      if (was !== undefined && (was.x !== dragon.x || was.y !== dragon.y)) {
        lastFlight.set(dragon.id, { x: was.x, y: was.y, at: performance.now(), ms });
      }
    }
    if (lastFlight.size > 0) cues.start();
  }

  function noteSteps(before: Animal[]): void {
    for (const animal of world.surface.animals) {
      const was = before.find((a) => a.id === animal.id);
      if (was !== undefined && (was.x !== animal.x || was.y !== animal.y)) {
        const facing = Math.atan2(animal.y - was.y, animal.x - was.x);
        lastStep.set(animal.id, { x: was.x, y: was.y, at: performance.now(), facing });
      }
    }
  }

  /** A greyed square: its colour drained, and darker. */
  function drawGreyed(ctx: CanvasRenderingContext2D, px: number, py: number, c: number): void {
    ctx.save();
    // "saturation" keeps the picture's brightness but takes the colour of
    // what is drawn on top: grey, so the square loses its colour.
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(px, py, c, c);
    ctx.restore();
    ctx.fillStyle = `rgba(8, 7, 6, ${CAMP_LOOK.greyedDim})`;
    ctx.fillRect(px, py, c, c);
  }

  /** Along each edge of lit square (x, y) that borders a square that is not lit. */
  function drawLitEdges(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
    const { px, py } = toPx(x, y);
    for (const step of SQUARE_STEPS) {
      if (sightOf(x + step.dx, y + step.dy) === 'shown') {
        continue;
      }
      // Inside: a shade fading in from the edge, like dusk at the lantern's reach.
      edgeGradient(
        ctx,
        step.direction,
        px,
        py,
        c,
        CAMP_LOOK.edgeWidth,
        `0, 0, 0`,
        CAMP_LOOK.edgeAlpha,
        false,
      );
      // Outside: the lantern light spilling a little way into the dark.
      edgeGradient(
        ctx,
        step.direction,
        px,
        py,
        c,
        CAMP_LOOK.spillWidth,
        CAMP_MARKS.spill,
        CAMP_LOOK.spillAlpha,
        true,
      );
      // On the edge: a thin warm line, so the reach of the camps reads at a glance.
      const line = Math.max(1.5, c * 0.05);
      ctx.fillStyle = CAMP_MARKS.border;
      if (step.direction === 'north') ctx.fillRect(px, py - line / 2, c, line);
      else if (step.direction === 'south') ctx.fillRect(px, py + c - line / 2, c, line);
      else if (step.direction === 'west') ctx.fillRect(px - line / 2, py, line, c);
      else ctx.fillRect(px + c - line / 2, py, line, c);
    }
  }

  /**
   * A gradient strip along one edge of the square at (px, py): `width` (a
   * part of the square) wide, `alpha` strong at the edge and clear at its
   * far side. `outside` puts it in the neighbouring square instead.
   */
  function edgeGradient(
    ctx: CanvasRenderingContext2D,
    edge: SquareDirection,
    px: number,
    py: number,
    c: number,
    width: number,
    rgb: string,
    alpha: number,
    outside: boolean,
  ): void {
    const w = c * width;
    // The gradient runs from the edge (`from`) to `w` away from it (`to`);
    // inside the square, or in the neighbour's when `outside`.
    const sign = outside ? -1 : 1;
    let from: { x: number; y: number };
    let to: { x: number; y: number };
    let rect: { x: number; y: number; w: number; h: number };
    if (edge === 'north') {
      from = { x: px, y: py };
      to = { x: px, y: py + sign * w };
      rect = { x: px, y: outside ? py - w : py, w: c, h: w };
    } else if (edge === 'south') {
      from = { x: px, y: py + c };
      to = { x: px, y: py + c - sign * w };
      rect = { x: px, y: outside ? py + c : py + c - w, w: c, h: w };
    } else if (edge === 'west') {
      from = { x: px, y: py };
      to = { x: px + sign * w, y: py };
      rect = { x: outside ? px - w : px, y: py, w, h: c };
    } else {
      from = { x: px + c, y: py };
      to = { x: px + c - sign * w, y: py };
      rect = { x: outside ? px + c : px + c - w, y: py, w, h: c };
    }
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  /**
   * A camp: its 3 x 3 base (a warm wash with a gold edge over the nine
   * squares), and on the middle square a dark disc with a gold ring, a tent,
   * and a tag with its level.
   */
  function drawCampMarker(
    ctx: CanvasRenderingContext2D,
    camp: Camp,
    c: number,
    selected: boolean,
  ): void {
    const { px, py } = toPx(camp.x, camp.y);
    const cx = px + c / 2;
    const cy = py + c / 2;
    // The base: the footprint, one square either side of the middle.
    const base = { x: px - c + c * 0.06, y: py - c + c * 0.06, size: c * 3 - c * 0.12 };
    ctx.fillStyle = CAMP_MARKS.baseWash;
    ctx.fillRect(base.x, base.y, base.size, base.size);
    ctx.lineWidth = Math.max(2, c * (selected ? 0.09 : 0.06));
    ctx.strokeStyle = CAMP_MARKS.markerRing;
    ctx.strokeRect(base.x, base.y, base.size, base.size);
    // Its defenses round the edge (hazards PR 5): stakes, a wall, a gatehouse.
    drawCampWall(ctx, base, c, camp.defense);
    const r = c * CAMP_LOOK.markerRadius;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = c * 0.2;
    ctx.fillStyle = CAMP_MARKS.markerDisc;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(2, c * (selected ? 0.1 : 0.07));
    ctx.strokeStyle = CAMP_MARKS.markerRing;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // The tent: a triangle with a door.
    const t = r * 0.62;
    ctx.fillStyle = CAMP_MARKS.tent;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t);
    ctx.lineTo(cx + t, cy + t * 0.7);
    ctx.lineTo(cx - t, cy + t * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CAMP_MARKS.tentDoor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - t * 0.05);
    ctx.lineTo(cx + t * 0.32, cy + t * 0.7);
    ctx.lineTo(cx - t * 0.32, cy + t * 0.7);
    ctx.closePath();
    ctx.fill();

    // The level, in a small tag at the bottom right.
    const tagR = Math.max(6, c * 0.17);
    const tx = cx + r * 0.78;
    const ty = cy + r * 0.78;
    ctx.fillStyle = CAMP_MARKS.levelTag;
    ctx.beginPath();
    ctx.arc(tx, ty, tagR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAMP_MARKS.levelText;
    ctx.font = `800 ${Math.round(tagR * 1.3)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A deep camp's tag says D: it has no level to grow (progression PR 6).
    ctx.fillText(camp.deep ? 'D' : String(camp.level), tx, ty + tagR * 0.06);

    // A smelter: a small flame in a tag at the bottom left.
    if (camp.smelter) {
      const fx = cx - r * 0.78;
      ctx.fillStyle = CAMP_MARKS.levelTag;
      ctx.beginPath();
      ctx.arc(fx, ty, tagR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8a2b';
      ctx.beginPath();
      ctx.moveTo(fx, ty - tagR * 0.7);
      ctx.quadraticCurveTo(fx + tagR * 0.65, ty, fx, ty + tagR * 0.6);
      ctx.quadraticCurveTo(fx - tagR * 0.65, ty, fx, ty - tagR * 0.7);
      ctx.fill();
    }

    // A lantern: a small warm light in a tag at the top left.
    if (camp.lantern) {
      const lx = cx - r * 0.78;
      const ly = cy - r * 0.78;
      ctx.fillStyle = CAMP_MARKS.levelTag;
      ctx.beginPath();
      ctx.arc(lx, ly, tagR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd36b';
      ctx.fillRect(lx - tagR * 0.35, ly - tagR * 0.4, tagR * 0.7, tagR * 0.8);
      ctx.fillStyle = '#c27443';
      ctx.fillRect(lx - tagR * 0.5, ly - tagR * 0.62, tagR, tagR * 0.24);
      ctx.fillRect(lx - tagR * 0.5, ly + tagR * 0.4, tagR, tagR * 0.22);
    }

    // Defenses: a shield with the level, at the top right (hazards PR 5).
    drawDefenseTag(ctx, cx + r * 0.78, cy - r * 0.78, tagR * 2, camp.defense);
  }

  /** A circle round square (x, y) at `radius` squares, as the ring a camp lights. */
  function drawRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    c: number,
    alpha: number,
    dashed: boolean,
  ): void {
    const { px, py } = toPx(x, y);
    // `inCircle` covers squares to about radius + 0.5 (see campWorld.ts); the line goes just outside them.
    const r = (radius + 0.5) * c;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = CAMP_MARKS.ring;
    ctx.lineWidth = Math.max(2, c * 0.07);
    if (dashed) {
      ctx.setLineDash([c * 0.3, c * 0.18]);
    }
    ctx.beginPath();
    ctx.arc(px + c / 2, py + c / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** A held long press: the squares it would dig washed orange, and the 3 x 3 outlined. */
  function drawDigPreview(
    ctx: CanvasRenderingContext2D,
    at: { x: number; y: number; dug: { x: number; y: number }[] },
    c: number,
  ): void {
    ctx.save();
    ctx.fillStyle = CAMP_MARKS.digWash;
    for (const sq of at.dug) {
      const { px, py } = toPx(sq.x, sq.y);
      ctx.fillRect(px, py, c, c);
    }
    const { px, py } = toPx(at.x - 1, at.y - 1);
    ctx.strokeStyle = CAMP_MARKS.digOutline;
    ctx.lineWidth = Math.max(2, c * 0.08);
    ctx.setLineDash([c * 0.25, c * 0.15]);
    ctx.strokeRect(
      px + ctx.lineWidth / 2,
      py + ctx.lineWidth / 2,
      c * 3 - ctx.lineWidth,
      c * 3 - ctx.lineWidth,
    );
    // The cost on the map, above the 3 x 3 (below it at the top edge), where
    // the finger does not cover it: "⚡4", red if the shift has too few taps.
    if (at.dug.length > 0) {
      const cost = digAreaPreview(world, at.x, at.y).cost;
      const label = `⚡${cost}`;
      ctx.setLineDash([]);
      ctx.font = `700 ${Math.max(11, Math.round(c * 0.42))}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + c * 0.4;
      const h = Math.max(16, c * 0.62);
      const above = py - h - c * 0.12;
      const top = above >= 0 ? above : py + c * 3 + c * 0.12;
      const left = px + (c * 3 - w) / 2;
      ctx.fillStyle = 'rgba(24, 19, 15, 0.92)';
      ctx.strokeStyle =
        cost > world.turn.tapsLeft ? CAMP_MARKS.notLevelWash : CAMP_MARKS.digOutline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // roundRect is newer (Chrome 99): an older WebView gets square corners.
      if (typeof ctx.roundRect === 'function') ctx.roundRect(left, top, w, h, h / 2);
      else ctx.rect(left, top, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = cost > world.turn.tapsLeft ? '#ff9a7f' : '#ffe2b0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left + w / 2, top + h / 2);
    }
    ctx.restore();
  }

  /** Where the new camp would go: its ring, the squares it would light, and a pulsing square. */
  function drawPlacePreview(
    ctx: CanvasRenderingContext2D,
    target: { x: number; y: number },
    c: number,
    now: number,
  ): void {
    const width = world.lab.state.size.x;
    const height = world.lab.state.size.y;
    const refusal = placeRefusal(world, target.x, target.y);
    const blocked = refusal !== null && refusal !== 'cost';
    // The new ring and the squares it would light, only where a camp can
    // stand: on a refused target they would say the opposite of the red
    // footprint (review of PR #120).
    if (!blocked) {
      ctx.fillStyle = CAMP_MARKS.previewWash;
      for (const i of preview) {
        const { px, py } = toPx(i % width, Math.floor(i / width));
        ctx.fillRect(px, py, c, c);
      }
      const ring = placingDeep ? FRONTIER_DEEP_CAMP.radius : campRadius(1);
      drawRing(ctx, target.x, target.y, ring, c, 1, true);
    }
    const pulse =
      0.6 +
      0.4 * Math.cos(((now % CAMP_LOOK.targetPulseMs) / CAMP_LOOK.targetPulseMs) * Math.PI * 2);
    // The 3 x 3 footprint: gold if a camp can stand there, red if not. On
    // uneven ground, the squares not at the middle square's depth are washed red.
    const middleDepth = world.lab.depths.depths[target.x + width * target.y] ?? 0;
    for (const sq of footprintOf(target.x, target.y)) {
      if (sq.x < 0 || sq.y < 0 || sq.x >= width || sq.y >= height) {
        continue; // off the map: nothing to wash
      }
      const depth = world.lab.depths.depths[sq.x + width * sq.y];
      if (refusal === 'notLevel' && depth !== undefined && depth !== middleDepth) {
        const at = toPx(sq.x, sq.y);
        ctx.fillStyle = CAMP_MARKS.notLevelWash;
        ctx.fillRect(at.px, at.py, c, c);
      }
    }
    const { px, py } = toPx(target.x, target.y);
    ctx.save();
    if (blocked) {
      // A dark band under the red dashes, so the outline reads over clay's
      // reddish ground too (review of PR #122).
      ctx.strokeStyle = CAMP_MARKS.notLevelHalo;
      ctx.lineWidth = Math.max(4, c * 0.17);
      ctx.strokeRect(
        px - c + ctx.lineWidth / 2,
        py - c + ctx.lineWidth / 2,
        c * 3 - ctx.lineWidth,
        c * 3 - ctx.lineWidth,
      );
    }
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = blocked ? CAMP_MARKS.notLevel : CAMP_MARKS.target;
    ctx.lineWidth = Math.max(2, c * 0.09);
    ctx.setLineDash(blocked ? [c * 0.25, c * 0.15] : []);
    ctx.strokeRect(
      px - c + ctx.lineWidth / 2,
      py - c + ctx.lineWidth / 2,
      c * 3 - ctx.lineWidth,
      c * 3 - ctx.lineWidth,
    );
    ctx.restore();
    if (blocked) {
      return; // no tent where no camp can stand
    }
    // A faint tent where the camp would stand.
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawCampMarker(
      ctx,
      {
        id: 0,
        x: target.x,
        y: target.y,
        level: 1,
        smelter: false,
        lantern: false,
        pen: false,
        penned: 0,
        breedIn: 0,
        smelterLevel: 0,
        smeltIron: 0,
        smeltCopper: 0,
        smeltCoal: 0,
        deep: false,
        defense: 0,
      },
      c,
      false,
    );
    ctx.restore();
  }

  function drawEffects(ctx: CanvasRenderingContext2D, now: number, c: number): void {
    for (const effect of effects) {
      const { px, py } = toPx(effect.x, effect.y);
      const t = (now - effect.start) / effectMs(effect.kind);
      if (effect.kind === 'mined') {
        drawMinedCue(ctx, px, py, c, t, effect.label);
      } else if (effect.kind === 'refused') {
        drawRefusedCue(ctx, px, py, c, t, effect.higher, toPx);
      } else if (effect.kind === 'tooHard') {
        drawTooHardCue(ctx, px, py, c, t, effect.label);
      } else {
        // The ring spreading out from a camp as the fog lifts.
        const eased = 1 - (1 - Math.min(1, t)) ** 3;
        const radius = effect.fromRadius + (effect.toRadius - effect.fromRadius) * eased;
        drawRing(ctx, effect.x, effect.y, radius, c, Math.max(0, 1 - t * 0.9), false);
      }
    }
  }

  /** "Needs a level 2 camp": a blue wash with a padlock on the square, and the label floating up. */
  function drawTooHardCue(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    c: number,
    t: number,
    label: string,
  ): void {
    const fade = Math.max(0, 1 - t);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = CAMP_MARKS.tooHardWash;
    ctx.fillRect(px, py, c, c);
    ctx.strokeStyle = CAMP_MARKS.tooHard;
    ctx.lineWidth = Math.max(2, c * 0.08);
    ctx.strokeRect(
      px + ctx.lineWidth / 2,
      py + ctx.lineWidth / 2,
      c - ctx.lineWidth,
      c - ctx.lineWidth,
    );
    // The padlock: a body and a shackle, popping in a little at the start.
    const pop = 1 + 0.25 * Math.max(0, 1 - t * 5);
    const s = c * 0.22 * pop;
    const cx = px + c / 2;
    const cy = py + c / 2 + s * 0.3;
    ctx.fillStyle = CAMP_MARKS.tooHard;
    ctx.fillRect(cx - s, cy - s * 0.2, s * 2, s * 1.5);
    ctx.lineWidth = Math.max(2, s * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.2, s * 0.65, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
    drawFloatingLabel(ctx, px, py - c * 0.2, c, t, label, CAMP_MARKS.tooHard);
  }

  const cues = cueLoop((now) => {
    effects = effects.filter((e) => now - e.start < effectMs(e.kind));
    draw(now);
    // For the tests: how many cues are still playing (0 once the map is still).
    canvas.dataset['effects'] = String(effects.length);
    // While the camp tool has a target, keep drawing: its square pulses. So
    // too while an animal is still sliding to where End shift moved it.
    const sliding =
      [...lastStep.values()].some((step) => now - step.at < CAMP_LOOK.animalSlideMs) ||
      [...lastFlight.values()].some((f) => now - f.at < f.ms);
    return effects.length > 0 || sliding || (mode.kind === 'placing' && mode.target !== null);
  });

  // Draw again whenever the map's box changes size (owner, on the hazards
  // build: "I clicked on a block outside of the circle and the screen
  // stretched out"). The canvas takes its pixel size only when it is drawn;
  // if the tray or a panel grows or shrinks after the last draw, the browser
  // would stretch the old picture to the new box until something drew again.
  if (typeof ResizeObserver !== 'undefined') {
    let drawnBox = '';
    new ResizeObserver(() => {
      const box = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (box === drawnBox) return;
      drawnBox = box;
      draw();
    }).observe(canvas);
  }

  function addEffect(effect: Omit<Effect, 'start'>): void {
    effects.push({ ...effect, start: performance.now() });
    cues.start();
  }

  // ----- The counter above the map -----

  /**
   * The counter: "Dug", then the lab's own items (wood, grass, apples,
   * animals, clay) with their icons, then the game's items (stone, coal, ...).
   * One row at a fixed height, as in Lab 1, so the map never moves.
   */
  function showCampCounter(): void {
    // Which chips there are, and their order, depend only on which items are
    // held and on the lowest camp's level (the next upgrade's cost comes
    // first). While those stay the same, only the numbers change: they are
    // written into the chips that stand, and nothing is built again (owner,
    // after the 0.28.0 build: "The game still slows down when the map is
    // full": building every chip and drawing every icon on each tap was a
    // large part of a tap's time).
    const counts = world.lab.counts;
    const held = [...counts.entries()]
      .filter(([, n]) => n > 0)
      .map(([item]) => item)
      .sort()
      .join(',');
    const shape = `${Math.min(...world.camps.map((c) => c.level))}|${held}`;
    if (shape !== counterShape || counter.children.length === 0) {
      counterShape = shape;
      counter.replaceChildren(...counterChips(''));
      return;
    }
    for (const chip of Array.from(counter.children) as HTMLElement[]) {
      const id = chip.dataset['testid'] ?? '';
      const count =
        id === 'lab-dug'
          ? world.lab.mined
          : id === 'lab-coins'
            ? (counts.get(FRONTIER_MARKET.coin) ?? 0)
            : (counts.get(id.replace('lab-res-', '')) ?? 0);
      const text = String(count);
      if (chip.dataset['count'] === text) continue;
      chip.dataset['count'] = text;
      const label = chip.querySelector('.lab-chip-count');
      if (label !== null) label.textContent = text;
    }
  }
  /** What the counter's chips were last built for: see `showCampCounter`. */
  let counterShape = '';

  /**
   * The counter's chips: Dug, Coins, then every item held. `prefix` is put
   * before each chip's test id, so the recipe book's copy of them (owner, UI
   * rework: "When crafting, we need to show inventory") has its own ids.
   */
  function counterChips(prefix: string): HTMLElement[] {
    const counts = world.lab.counts;
    const dug = element('div', 'lab-chip lab-chip-dug');
    dug.dataset['testid'] = `${prefix}lab-dug`;
    dug.dataset['count'] = String(world.lab.mined);
    dug.append(
      element('span', 'lab-chip-glyph', '⛏'),
      element('span', 'lab-chip-count', String(world.lab.mined)),
      element('span', 'lab-chip-name', 'Dug'),
    );
    // Coins (progression PR 1): the run's score, so always shown, next to Dug.
    const coins = counts.get(FRONTIER_MARKET.coin) ?? 0;
    const coinChip = element('div', 'lab-chip lab-chip-dug');
    coinChip.dataset['testid'] = `${prefix}lab-coins`;
    coinChip.dataset['count'] = String(coins);
    coinChip.append(
      element('span', 'lab-chip-glyph', '🪙'),
      element('span', 'lab-chip-count', String(coins)),
      element('span', 'lab-chip-name', 'Coins'),
    );
    const chips: HTMLElement[] = [dug, coinChip];
    const chip = (item: string, count: number, icon: HTMLCanvasElement): void => {
      const made = element('div', 'lab-chip');
      made.dataset['testid'] = `${prefix}lab-res-${item}`;
      made.dataset['count'] = String(count);
      made.title = itemName(item);
      made.append(
        icon,
        element('span', 'lab-chip-count', String(count)),
        element('span', 'lab-chip-name', itemName(item)),
      );
      chips.push(made);
    };
    // Every item collected: the lab's own (with their icons), then the game's.
    const all: { item: string; count: number; icon: () => HTMLCanvasElement | null }[] = [];
    for (const item of Object.keys(LAB_ITEMS)) {
      all.push({
        item,
        count: counts.get(item) ?? 0,
        icon: () => labItemIcon(item, 'lab-chip-icon'),
      });
    }
    for (const entry of resourceEntries(counts)) {
      if (entry.item in LAB_ITEMS) {
        continue; // clay is a game item now too (plan A1): shown once, with the lab's icon
      }
      all.push({
        item: entry.item,
        count: entry.count,
        icon: () => blockIcon(entry.iconBlock, 'lab-chip-icon'),
      });
    }
    // What a smelter makes, and what is made from ingots (no block yields
    // them, so each has its own icon).
    for (const item of [
      'ironIngot',
      'copperIngot',
      FRONTIER_PICKAXE.item,
      FRONTIER_DRILL.item,
      FRONTIER_STEEL_DRILL.item,
      FRONTIER_LANTERN.item,
      FRONTIER_AXE.item,
      'sapling',
      'appleSapling',
      'mapleSapling',
      'hay',
      'sap',
      'syrup',
      'lumber',
      'mushroom',
      FRONTIER_MINERS.item,
      'wheatSeed',
      'cornSeed',
      'carrotSeed',
      'potatoSeed',
      'wheat',
      'corn',
      'carrot',
      'potato',
      FRONTIER_PUMP.item,
      FRONTIER_DRAGON.sword,
    ]) {
      const count = counts.get(item) ?? 0;
      if (count > 0) all.push({ item, count, icon: () => labItemIcon(item, 'lab-chip-icon') });
    }
    // What the next steps cost comes first, so it never hides off the right
    // edge (review of PR #122): the lowest camp's next upgrade, then a new
    // camp. (Wood and grass come early, when they are the only chips anyway.)
    // The rest keeps its order after them.
    const lowest = Math.min(...world.camps.map((c) => c.level));
    const wanted: string[] = [];
    for (const stack of [...(upgradeCostFrom(lowest) ?? []), ...LAB_NEW_CAMP_COST]) {
      if (!wanted.includes(stack.item)) wanted.push(stack.item);
    }
    const rank = (item: string): number => {
      const at = wanted.indexOf(item);
      return at === -1 ? wanted.length : at;
    };
    // `sort` keeps equal ranks in their order (it is stable), so the rest stays as it was.
    all.sort((a, b) => rank(a.item) - rank(b.item));
    for (const entry of all) {
      const icon = entry.count > 0 ? entry.icon() : null;
      if (icon !== null) {
        chip(entry.item, entry.count, icon);
      }
    }
    return chips;
  }

  // ----- The tray under the map -----

  /** A row of cost chips: each item's icon, what you have of it and what it costs. */
  /**
   * One chip for each item of `cost`: its icon and have/need, red while
   * short. Each chip's test id is `${testPrefix}-${item}`.
   */
  function costRow(cost: ItemStack[], testPrefix = 'lab2-cost'): HTMLElement {
    const row = element('div', 'lab2-cost');
    const icons = new Map(
      resourceEntries(new Map(cost.map((s) => [s.item, 1]))).map((e) => [e.item, e.iconBlock]),
    );
    for (const stack of cost) {
      const have = world.lab.counts.get(stack.item) ?? 0;
      const enough = have >= stack.count;
      const chip = element('span', enough ? 'lab2-cost-chip' : 'lab2-cost-chip lab2-cost-short');
      chip.dataset['testid'] = `${testPrefix}-${stack.item}`;
      const icon = icons.get(stack.item);
      const labIcon = labItemIcon(stack.item, 'lab2-cost-icon');
      if (labIcon !== null) {
        chip.append(labIcon);
      } else if (icon !== undefined) {
        chip.append(blockIcon(icon, 'lab2-cost-icon'));
      }
      chip.title = itemName(stack.item);
      chip.append(
        element('span', 'lab2-cost-count', `${Math.min(have, stack.count)}/${stack.count}`),
      );
      // With one item there is room for its name; with more, the icons say which is which.
      if (cost.length === 1) {
        chip.append(element('span', 'lab2-cost-name', itemName(stack.item)));
      }
      row.append(chip);
    }
    return row;
  }

  function showTray(): void {
    tray.dataset['mode'] = mode.kind;
    bookCard.hidden = mode.kind !== 'book' && mode.kind !== 'market' && mode.kind !== 'goals';
    bookCard.setAttribute(
      'aria-label',
      mode.kind === 'market' ? 'Market' : mode.kind === 'goals' ? 'Goals' : 'Recipe book',
    );
    if (mode.kind === 'idle') {
      showIdleTray();
    } else if (mode.kind === 'book') {
      // The tray behind the card stays as it is when nothing is open.
      showIdleTray();
      showBookCard();
    } else if (mode.kind === 'market') {
      showIdleTray();
      showMarketCard();
    } else if (mode.kind === 'goals') {
      showIdleTray();
      showGoalsCard();
    } else if (mode.kind === 'planting') {
      showPlantingTray(mode.item);
    } else if (mode.kind === 'building') {
      showBuildingTray(mode.what);
    } else if (mode.kind === 'workCamp') {
      showWorkCampTray(mode.x, mode.y);
    } else if (mode.kind === 'placeMenu') {
      showPlaceTray();
    } else if (mode.kind === 'placing') {
      showPlacingTray(mode.target);
    } else {
      const id = mode.id;
      const camp = world.camps.find((c) => c.id === id);
      if (camp === undefined) {
        mode = { kind: 'idle' };
        showIdleTray();
      } else {
        showCampTray(camp);
      }
    }
  }

  function showIdleTray(): void {
    // The pinned recipes, in a strip that scrolls sideways, above the legend
    // (owner, UI rework: "Square Legend at bottom", the pinned bar above it).
    // The contracts, the recipe book and placing are buttons over the map.
    // The row's height never changes.
    const head = element('div', 'lab2-tray-head');
    head.append(pinStrip());
    const key = labKey();
    // The key lists the kinds you can see: lit and greyed squares, never what is under the fog.
    const seenTops = tops.filter((_, i) => (sights[i] ?? 'fog') !== 'fog');
    // Clay is listed below with its texture as the swatch, not with the blocks' plain icon.
    showKey(
      key,
      seenTops.filter((code) => code !== BLOCKS.clay.code),
    );
    const clayInSight = seenTops.includes(BLOCKS.clay.code);
    // So is the surface: grass, trees and apple trees on lit or greyed ground.
    const seenFeatures = new Set(
      world.surface.features.filter((_, i) => (sights[i] ?? 'fog') !== 'fog'),
    );
    // Clay's swatch is its texture; the features' are drawn with the map's own art.
    const extras: { show: boolean; swatch: () => HTMLCanvasElement | null; name: string }[] = [
      { show: clayInSight, swatch: () => labItemIcon('clay', 'lab-key-icon'), name: 'Clay' },
      {
        show: seenFeatures.has(GRASS),
        swatch: () => featureSwatch('grass', 'lab-key-icon'),
        name: 'Grass',
      },
      {
        show: seenFeatures.has(TREE),
        swatch: () => featureSwatch('tree', 'lab-key-icon'),
        name: 'Tree',
      },
      {
        show: seenFeatures.has(APPLE_TREE),
        swatch: () => featureSwatch('appleTree', 'lab-key-icon'),
        name: 'Apple tree',
      },
      {
        show: seenFeatures.has(MAPLE_TREE),
        swatch: () => featureSwatch('mapleTree', 'lab-key-icon'),
        name: 'Maple tree',
      },
    ];
    for (const extra of extras) {
      const icon = extra.show ? extra.swatch() : null;
      if (icon !== null) {
        const entry = element('span', 'lab-key-entry');
        entry.append(icon, element('span', 'lab-key-name', extra.name));
        key.append(entry);
      }
    }
    tray.replaceChildren(head, key);
  }

  /** A recipe's icon: a tent, with the camp level it makes for an upgrade. */
  function recipeIcon(recipe: Recipe): HTMLElement {
    // A camp or an upgrade: a tent; a pickaxe or a lantern: itself;
    // smelting: a flame.
    const item = recipe.makes?.item;
    const face = recipe.deep
      ? '⛏'
      : item === undefined
        ? '⛺'
        : item === FRONTIER_PICKAXE.item
          ? '⛏️'
          : item === FRONTIER_DRILL.item
            ? '🔩'
            : item === FRONTIER_LANTERN.item
              ? '🏮'
              : item === 'appleSapling'
                ? '🌱'
                : item === 'hay'
                  ? '🌾'
                  : '🔥';
    const icon = element('span', 'lab2-recipe-icon', face);
    if (recipe.level > 1) {
      icon.append(element('span', 'lab2-recipe-level', String(recipe.level)));
    }
    if (recipe.deep) {
      // As its tag on the map: D.
      icon.append(element('span', 'lab2-recipe-level', 'D'));
    }
    icon.title = recipe.name;
    return icon;
  }

  /**
   * The pinned recipes: for each, its icon and what it needs as have/need,
   * and an × to unpin it. A tap on a card goes to where it is built: the
   * camp tool for a new camp, the panel of a camp one level below for an
   * upgrade.
   */
  function pinStrip(): HTMLElement {
    const strip = element('div', 'lab2-pins');
    strip.dataset['testid'] = 'lab2-pins';
    const pinned = pins
      .map((id) => recipeById(id))
      .filter((r): r is Recipe => r !== null)
      // A second of this would add nothing: its pin waits until it would.
      .filter((r) => r.makes === null || !ownsUseful(toFrontier(world), r.makes.item));
    if (pinned.length === 0) {
      strip.append(element('span', 'lab2-pins-empty', 'Pin a recipe from the book 📖'));
      return strip;
    }
    for (const recipe of pinned) {
      const card = element('div', 'lab2-pin');
      card.dataset['testid'] = `lab2-pin-${recipe.id}`;
      const go = button('lab2-pin-go', '');
      go.setAttribute('aria-label', recipe.name);
      go.append(recipeIcon(recipe), costRow(recipe.cost, `lab2-pin-${recipe.id}`));
      go.addEventListener('click', () => buildFrom(recipe));
      const unpin = button('lab2-pin-remove', '×');
      unpin.dataset['testid'] = `lab2-unpin-${recipe.id}`;
      unpin.setAttribute('aria-label', `Unpin ${recipe.name}`);
      unpin.addEventListener('click', () => {
        setPins(pins.filter((id) => id !== recipe.id));
        showTray();
      });
      card.append(go, unpin);
      strip.append(card);
    }
    return strip;
  }

  /** Go to where `recipe` is built. */
  function buildFrom(recipe: Recipe): void {
    if (recipe.makes !== null) {
      openBook(); // made in the book, with its Make button
      return;
    }
    if (recipe.deep) {
      // The camp tool, switched to the deep camp.
      placingDeep = true;
      setMode({ kind: 'placing', target: null });
      return;
    }
    if (recipe.level === 1) {
      setMode({ kind: 'placing', target: null });
      return;
    }
    const camp = world.camps.find((c) => c.level === recipe.level - 1);
    if (camp === undefined) {
      setHint(`No level ${recipe.level - 1} camp to upgrade yet.`, true);
      return;
    }
    setMode({ kind: 'camp', id: camp.id });
  }

  /** Open the recipe book card, with a history entry for the back button to take away. */
  function openBook(): void {
    if (mode.kind === 'book') return;
    bookNote.textContent = '';
    window.history.pushState({ lab2Book: true }, '');
    setMode({ kind: 'book' });
  }

  /**
   * Open the market's card, as the recipe book's: the same card. Only while
   * the market is open: after a market day's night, before the day.
   */
  function openMarket(): void {
    if (mode.kind === 'market' || !world.turn.marketOpen) return;
    bookNote.textContent = '';
    window.history.pushState({ lab2Book: true }, '');
    setMode({ kind: 'market' });
  }

  /** Open the goals card, as the recipe book's. */
  function openGoals(): void {
    if (mode.kind === 'goals') return;
    bookNote.textContent = '';
    window.history.pushState({ lab2Book: true }, '');
    setMode({ kind: 'goals' });
  }

  /**
   * Close the market: the day starts. Its trades can no longer be undone
   * (the Undo history starts again, as at End shift).
   */
  function leaveMarket(): void {
    const next = closeCampMarket(world);
    setMode({ kind: 'idle' });
    if (next === world) return;
    history = emptyHistory(next);
    showUndo();
    setWorld(next);
    if (asGame) saveRun(next);
    setHint('The market closes. The day begins.', false);
  }

  /**
   * Close the recipe book, market or goals card: going back takes away its
   * history entry, and `popstate` closes it (and the market with its card).
   */
  function closeBook(): void {
    if (mode.kind !== 'book' && mode.kind !== 'market' && mode.kind !== 'goals') return;
    const state: unknown = window.history.state;
    const ours = typeof state === 'object' && state !== null && 'lab2Book' in state;
    if (ours) {
      window.history.back();
    } else if (mode.kind === 'market') {
      leaveMarket();
    } else {
      setMode({ kind: 'idle' });
    }
  }

  /** The recipe book card: every recipe, what it costs, and a pin to put it on the row. */
  function showBookCard(): void {
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '📖 Recipe book'));
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close the recipe book');
    close.dataset['testid'] = 'lab2-book-close';
    close.addEventListener('click', closeBook);
    head.append(close);
    // What the store holds, while crafting (owner, UI rework).
    const inventory = element('div', 'lab2-book-inventory');
    inventory.dataset['testid'] = 'lab2-book-inventory';
    inventory.append(...counterChips('book-'));
    // The list scrolls inside the card.
    const list = element('div', 'lab2-book-list');
    list.dataset['testid'] = 'lab2-book-list';
    for (const recipe of labRecipes()) {
      // A second of this would add nothing (owner, after the 0.17.0 build).
      if (recipe.makes !== null && ownsUseful(toFrontier(world), recipe.makes.item)) continue;
      const row = element('div', 'lab2-recipe');
      row.dataset['testid'] = `lab2-recipe-${recipe.id}`;
      const pinned = pins.includes(recipe.id);
      const pin = button(
        pinned ? 'lab2-recipe-pin lab2-recipe-pinned' : 'lab2-recipe-pin',
        pinned ? 'Pinned ✓' : 'Pin',
      );
      pin.dataset['testid'] = `lab2-recipe-pin-${recipe.id}`;
      pin.setAttribute('aria-pressed', String(pinned));
      pin.addEventListener('click', () => {
        setPins(pinned ? pins.filter((id) => id !== recipe.id) : [...pins, recipe.id]);
        const scroll = list.scrollTop;
        showTray();
        // Keep the list where it was, so pinning does not jump it.
        const fresh = bookCard.querySelector('.lab2-book-list');
        if (fresh !== null) fresh.scrollTop = scroll;
      });
      const text = element('div', 'lab2-recipe-text');
      const makes = recipe.makes;
      // "Smelt iron → 2 iron ingots"; a pickaxe or a lantern is named once.
      const name =
        makes === null || makes.count === 1
          ? recipe.name
          : `${recipe.name} → ${makes.count} ${itemName(makes.item).toLowerCase()}s`;
      text.append(
        element('span', 'lab2-recipe-name', name),
        costRow(recipe.cost, `lab2-recipe-${recipe.id}`),
      );
      const does = recipe.deep
        ? `A camp of its own at depth ${FRONTIER_DEEP_CAMP.minDepth}+: ring ${FRONTIER_DEEP_CAMP.radius}, mines as level ${FRONTIER_DEEP_CAMP.level}, never upgraded. The kit comes from the market after a tier-1 contract.`
        : whatItDoes(makes);
      if (does !== null) {
        const line = element('span', 'lab2-recipe-does', does);
        line.dataset['testid'] = `lab2-recipe-does-${recipe.id}`;
        text.append(line);
      }
      const buttons = element('div', 'lab2-recipe-buttons');
      if (makes !== null) {
        // Made here, for 1 tap, while a smelter stands (smelting and crafting).
        const why = makeRefusal(world, recipe.id);
        const make = button('lab2-recipe-make', 'Make');
        make.dataset['testid'] = `lab2-recipe-make-${recipe.id}`;
        make.disabled = why !== null;
        make.addEventListener('click', () => makeInBook(recipe));
        buttons.append(make);
        if (why === 'noSugarShack') {
          const note = element('span', 'lab2-recipe-why', 'Needs a sugar shack: build one with ⊕.');
          note.dataset['testid'] = `lab2-recipe-why-${recipe.id}`;
          text.append(note);
        }
        if (why === 'noSawHouse') {
          const note = element('span', 'lab2-recipe-why', 'Needs a saw house: build one with ⊕.');
          note.dataset['testid'] = `lab2-recipe-why-${recipe.id}`;
          text.append(note);
        }
        if (why === 'noSmelter') {
          const note = element(
            'span',
            'lab2-recipe-why',
            'Needs a smelter: build one at a level 2 camp.',
          );
          note.dataset['testid'] = `lab2-recipe-why-${recipe.id}`;
          text.append(note);
        }
      }
      buttons.append(pin);
      row.append(recipeIcon(recipe), text, buttons);
      list.append(row);
    }
    const inner = element('div', 'lab2-book-inner');
    inner.append(head, inventory, bookNote, list);
    bookCard.replaceChildren(inner);
  }

  /**
   * The market's card (progression PR 1): what it buys and sells, a lot at
   * a time, with Sell / Sell all / Buy buttons, each 1 tap. On other days it
   * shows the prices and when it opens, with the buttons off.
   */
  function showMarketCard(): void {
    const head = element('div', 'lab2-panel-head');
    const coins = world.lab.counts.get(FRONTIER_MARKET.coin) ?? 0;
    head.append(element('span', 'lab2-panel-title', `🏪 Market · 🪙 ${coins}`));
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close the market and start the day');
    close.dataset['testid'] = 'lab2-market-close';
    close.addEventListener('click', closeBook);
    head.append(close);
    const when = element(
      'p',
      'lab2-market-when',
      'Market day: trade before the day starts (no taps). Close it (×) to begin the day; it opens again only after a later night.',
    );
    when.dataset['testid'] = 'lab2-market-when';
    const list = element('div', 'lab2-book-list');
    list.dataset['testid'] = 'lab2-market-list';
    const section = (title: string): void => {
      list.append(element('span', 'lab2-market-section', title));
    };
    // The contract board (progression PR 5): taken only here, at the market.
    const state = toFrontier(world);
    // Those held are not offered again; up to the best camp's level are held at once.
    const held = state.contracts.map((c) => c.id);
    const board = contractBoard(state).filter((c) => !held.includes(c.id));
    // Contracts held can be delivered here too (owner, on the hazards build).
    const heldDefs = heldContracts(state);
    if (heldDefs.length > 0) {
      section('Your contracts');
      for (const contract of heldDefs) list.append(contractRow(contract, 'marketHeld'));
    }
    if (board.length > 0) {
      section(`Contract board · you hold ${held.length} of ${contractLimit(state)}`);
      for (const offer of board) list.append(contractRow(offer, 'offer'));
    }
    section('Sell');
    for (const lot of FRONTIER_MARKET.sellPrices) {
      if ((world.lab.counts.get(lot.item) ?? 0) > 0) list.append(marketRow('sell', lot));
    }
    section('Buy');
    // An item a second of which adds nothing is left out once one is held (owner).
    for (const lot of FRONTIER_MARKET.buyPrices) {
      if (!ownsUseful(toFrontier(world), lot.item)) list.append(marketRow('buy', lot));
    }
    const inner = element('div', 'lab2-book-inner');
    inner.append(head, when, bookNote, list);
    bookCard.replaceChildren(inner);
  }

  /**
   * The goals card: the phase and what moves it on, the contract held (with
   * Deliver and Drop, on any shift), the contracts done, and when the market
   * opens next.
   */
  function showGoalsCard(): void {
    const head = element('div', 'lab2-panel-head');
    const coins = world.lab.counts.get(FRONTIER_MARKET.coin) ?? 0;
    head.append(element('span', 'lab2-panel-title', `🎯 Goals · 🪙 ${coins}`));
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close the goals');
    close.dataset['testid'] = 'lab2-goals-close';
    close.addEventListener('click', closeBook);
    head.append(close);
    const list = element('div', 'lab2-book-list');
    const section = (title: string): void => {
      list.append(element('span', 'lab2-market-section', title));
    };
    const state = toFrontier(world);
    const phase = runPhase(state);
    const goal = FRONTIER_PHASES[phase - 1];
    section(`Phase ${phase} of 5${goal === undefined ? '' : ` · ${goal.title}`}`);
    const next = element('p', 'lab2-market-when', goal?.next ?? '');
    next.dataset['testid'] = 'lab2-goal';
    list.append(next);
    // The contract stage (owner, after the 0.25.0 build): what the board
    // offers now, and what opens the next stage.
    const stage = contractStage(state);
    const STAGE_GOODS = [
      'clay, stone, wood, hay',
      'coal, raw ore, apples, lumber',
      'crops, animals, syrup, mushrooms',
      'ingots, bigger contracts',
      'crystal, rare ore, relics',
    ];
    const coming = FRONTIER_STAGES.find((st) => st.stage === stage + 1);
    const stageLine = element(
      'p',
      'lab2-market-when',
      `Contract stage ${stage} of 5: ${STAGE_GOODS.slice(0, stage).join('; ')}.` +
        (coming === undefined
          ? ''
          : ` Stage ${coming.stage} (${STAGE_GOODS[coming.stage - 1] ?? ''}) opens with ${coming.milestone} and ${coming.delivered} contracts delivered (you have ${contractsDelivered(state)}).`),
    );
    stageLine.dataset['testid'] = 'lab2-contract-stage';
    list.append(stageLine);
    // Up to the best camp's level of contracts at once (owner).
    const held = heldContracts(state);
    const limit = contractLimit(state);
    section(`Your contracts · ${held.length} of ${limit}`);
    if (held.length === 0) {
      list.append(
        element('p', 'lab2-market-when', 'None. Take them from the board at the market.'),
      );
    }
    for (const contract of held) list.append(contractRow(contract, 'held'));
    const done = world.turn.contractsDone;
    if (done.some((n) => n > 0)) {
      list.append(
        element(
          'p',
          'lab2-market-when',
          `Delivered: tier 1 ×${done[0] ?? 0}, tier 2 ×${done[1] ?? 0}, tier 3 ×${done[2] ?? 0}.`,
        ),
      );
    }
    // Accomplishments: this run's, with its glory and the family's standing.
    const glory = gloryOf(state);
    const featsHead = element(
      'span',
      'lab2-market-section',
      `Accomplishments · ${state.feats.length} of ${FRONTIER_FEATS.length} · ✨ ${glory} glory · ${standingOf(glory)}`,
    );
    featsHead.dataset['testid'] = 'lab2-feats-head';
    list.append(featsHead);
    const best = loadBestGlory();
    if (asGame) {
      const replay = button('lab2-pack', 'Replay the tutorial');
      replay.dataset['testid'] = 'lab2-tutorial-replay';
      replay.addEventListener('click', () => {
        startTutorial();
        closeBook();
      });
      list.prepend(replay);
    }
    if (best > 0) {
      list.append(
        element('p', 'lab2-market-when', `Your best run: ✨ ${best} glory (${standingOf(best)}).`),
      );
    }
    const featList = element('div', 'lab2-feats');
    featList.dataset['testid'] = 'lab2-feats';
    for (const feat of FRONTIER_FEATS) {
      const has = state.feats.includes(feat.id);
      const row = element('p', has ? 'lab2-feat lab2-feat-earned' : 'lab2-feat');
      row.dataset['testid'] = `lab2-feat-${feat.id}`;
      row.dataset['earned'] = String(has);
      row.append(
        element('span', 'lab2-feat-mark', has ? '🏅' : '○'),
        element('span', 'lab2-feat-name', `${feat.name} · ${feat.how}`),
        element('span', 'lab2-feat-glory', `+${feat.glory}`),
      );
      featList.append(row);
    }
    list.append(featList);
    section('Market');
    const when = element(
      'p',
      'lab2-market-when',
      `It opens after the night before shift ${nextMarketShift(world)}: every ${FRONTIER_MARKET.everyShifts.join(', ')} shifts with your best camp at level 1, 2, 3.`,
    );
    when.dataset['testid'] = 'lab2-market-when';
    list.append(when);
    const inner = element('div', 'lab2-book-inner');
    inner.append(head, bookNote, list);
    bookCard.replaceChildren(inner);
  }

  /**
   * A contract: its name, tier and pay, what it asks for (have/need), and
   * its buttons: for one on the board, Fill when the store holds everything
   * it asks for (owner, on the hazards build: "Should be able to immediately
   * fill contracts if you have the materials"), else Take; for one held,
   * Deliver and Drop, or at the market Deliver only.
   */
  function contractRow(
    contract: FrontierContractDef,
    as: 'held' | 'offer' | 'marketHeld',
  ): HTMLElement {
    const row = element('div', 'lab2-recipe');
    row.dataset['testid'] = `lab2-contract-${as}-${contract.id}`;
    const text = element('div', 'lab2-recipe-text');
    text.append(
      element(
        'span',
        'lab2-recipe-name',
        `T${contract.tier} · ${contract.name} → ${contract.pays} 🪙`,
      ),
      costRow(contract.asks, `lab2-contract-${contract.id}`),
    );
    const buttons = element('div', 'lab2-recipe-buttons lab2-market-buttons');
    const fill: ContractStep = { kind: 'fillContract', id: contract.id };
    const actions: { label: string; action: ContractStep }[] =
      as === 'offer'
        ? contractRefusal(world, fill) === null
          ? [{ label: 'Fill', action: fill }]
          : [{ label: 'Take', action: { kind: 'takeContract', id: contract.id } }]
        : as === 'marketHeld'
          ? [{ label: 'Deliver', action: { kind: 'deliver', id: contract.id } }]
          : [
              { label: 'Drop', action: { kind: 'dropContract', id: contract.id } },
              { label: 'Deliver', action: { kind: 'deliver', id: contract.id } },
            ];
    for (const { label, action } of actions) {
      const b = button(label === 'Drop' ? 'lab2-recipe-pin' : 'lab2-recipe-make', label);
      b.dataset['testid'] = `lab2-contract-${label.toLowerCase()}-${contract.id}`;
      b.disabled = contractRefusal(world, action) !== null;
      b.addEventListener('click', () => contractInMarket(action, contract));
      buttons.append(b);
    }
    row.append(text, buttons);
    return row;
  }

  /** Take, deliver or drop a contract from the market's card, for 1 tap. */
  function contractInMarket(action: ContractStep, contract: FrontierContractDef): void {
    const next = contractCamp(world, action);
    if (next === world) return; // the button is off whenever this would happen
    remember(action);
    const notes = {
      takeContract: `Taken: ${contract.name}. Deliver it from 🎯 on any shift once you hold everything.`,
      fillContract: `Filled: ${contract.name}, for ${contract.pays} coins.`,
      deliver: `Delivered: ${contract.name}, for ${contract.pays} coins.`,
      dropContract: `Dropped: ${contract.name}.`,
    };
    bookNote.textContent = notes[action.kind];
    setWorld(next);
  }

  /** One lot at the market: what it takes (have/need) and gives, and its buttons. */
  function marketRow(side: TradeSide, lot: FrontierLot): HTMLElement {
    const row = element('div', 'lab2-recipe');
    row.dataset['testid'] = `lab2-${side}-${lot.item}`;
    const text = element('div', 'lab2-recipe-text');
    const goods = countText(lot.count, lot.item);
    const coins = `${lot.coins} 🪙`;
    // What the trade gives up, with the item's icon: the goods to sell, or the coins to buy with.
    const gives = side === 'sell' ? lot.item : FRONTIER_MARKET.coin;
    const held = world.lab.counts.get(gives) ?? 0;
    // To buy: what you own of it already, and the coins you have.
    const owned = world.lab.counts.get(lot.item) ?? 0;
    const have = element(
      'span',
      'lab2-recipe-does',
      side === 'buy'
        ? `Own ${owned} · Have ${countText(held, gives)}`
        : `Have ${countText(held, gives)}`,
    );
    have.dataset['testid'] = `lab2-${side}-have-${lot.item}`;
    // A lot not on sale yet says when it will be (owner: "I have 5 coins but I
    // can't buy the apples": the button was off with no reason given).
    const locked =
      side === 'buy' && tradeRefusal(world, side, lot.item, 1) === 'notYet'
        ? lot.afterTier1 === true
          ? 'Unlocks after your first tier-1 contract'
          : `Unlocks with a level-${lot.fromLevel ?? 1} camp`
        : null;
    // The lab's own icon for the item, else the icon of the block that yields it.
    const block = resourceEntries(new Map([[lot.item, 1]]))[0]?.iconBlock;
    const icon =
      labItemIcon(lot.item, 'lab2-cost-icon') ??
      (block === undefined ? null : blockIcon(block, 'lab2-cost-icon'));
    const name = element(
      'span',
      'lab2-recipe-name',
      side === 'sell' ? `${goods} → ${coins}` : `${coins} → ${goods}`,
    );
    // What it does, behind an info chip (owner: "Maybe do it in an info chip to save space").
    const info = itemInfo(lot.item);
    if (info !== null) {
      const key = `${side}:${lot.item}`;
      const chip = button('lab2-info-chip', 'ⓘ');
      chip.dataset['testid'] = `lab2-${side}-info-${lot.item}`;
      chip.setAttribute('aria-label', `What ${itemName(lot.item).toLowerCase()} does`);
      chip.setAttribute('aria-expanded', String(openInfo.has(key)));
      chip.addEventListener('click', () => {
        if (openInfo.has(key)) openInfo.delete(key);
        else openInfo.add(key);
        const list = bookCard.querySelector('.lab2-book-list');
        const scroll = list === null ? 0 : list.scrollTop;
        showMarketCard();
        const fresh = bookCard.querySelector('.lab2-book-list');
        if (fresh !== null) fresh.scrollTop = scroll;
      });
      name.append(chip);
    }
    text.append(name, have);
    if (locked !== null) {
      const why = element('span', 'lab2-market-locked', `🔒 ${locked}`);
      why.dataset['testid'] = `lab2-buy-locked-${lot.item}`;
      text.append(why);
    }
    if (info !== null && openInfo.has(`${side}:${lot.item}`)) {
      const line = element('span', 'lab2-item-info', info);
      line.dataset['testid'] = `lab2-${side}-info-text-${lot.item}`;
      text.append(line);
    }
    const buttons = element('div', 'lab2-recipe-buttons lab2-market-buttons');
    if (side === 'sell') {
      const most = mostLots(toFrontier(world), side, lot.item);
      const all = button('lab2-recipe-pin', `All ×${most}`);
      all.dataset['testid'] = `lab2-sell-all-${lot.item}`;
      all.disabled = most < 2 || tradeRefusal(world, side, lot.item, most) !== null;
      all.addEventListener('click', () => tradeInMarket(side, lot, most));
      buttons.append(all);
    }
    const one = button('lab2-recipe-make', side === 'sell' ? 'Sell' : 'Buy');
    one.dataset['testid'] = `lab2-${side}-one-${lot.item}`;
    one.disabled = tradeRefusal(world, side, lot.item, 1) !== null;
    one.addEventListener('click', () => tradeInMarket(side, lot, 1));
    buttons.append(one);
    if (icon !== null) row.append(icon);
    row.append(text, buttons);
    return row;
  }

  /** "1 animal", "5 grass", "40 coins": a count and an item's name, singular for 1. */
  function countText(count: number, item: string): string {
    const name = itemName(item).toLowerCase();
    // The data's names are plural where it reads better ("Animals", "Apples", "Coins").
    return `${count} ${count === 1 && name.endsWith('s') ? name.slice(0, -1) : name}`;
  }

  /** Trade `lots` lots at the market, for 1 tap, keeping the card's scroll where it was. */
  function tradeInMarket(side: TradeSide, lot: FrontierLot, lots: number): void {
    const next = tradeCamp(world, side, lot.item, lots);
    if (next === world) {
      return; // the button is off whenever this would happen
    }
    remember({ kind: side, item: lot.item, lots });
    const list = bookCard.querySelector('.lab2-book-list');
    const scroll = list === null ? 0 : list.scrollTop;
    const goods = countText(lot.count * lots, lot.item);
    const coins = countText(lot.coins * lots, FRONTIER_MARKET.coin);
    bookNote.textContent =
      side === 'sell' ? `Sold ${goods} for ${coins}.` : `Bought ${goods} for ${coins}.`;
    setWorld(next);
    const fresh = bookCard.querySelector('.lab2-book-list');
    if (fresh !== null) fresh.scrollTop = scroll;
  }

  /** What a made thing does, for the book; `null` for ingots, which only go into other recipes. */
  function whatItDoes(makes: { item: string } | null): string | null {
    if (makes?.item === FRONTIER_PICKAXE.item) {
      return `Every mining tap gives ${FRONTIER_PICKAXE.yieldTimes}×, while you have one.`;
    }
    if (makes?.item === FRONTIER_DRILL.item) {
      return 'Mines iron and copper ore on any camp’s ground, while you have one.';
    }
    if (makes?.item === FRONTIER_AXE.item) {
      return `A felled tree gives ${FRONTIER_AXE.woodPerTree} wood, not ${FRONTIER_SURFACE.woodPerTree}, while you have one.`;
    }
    if (makes?.item === 'syrup') {
      return 'Sells well at the market. Needs a sugar shack.';
    }
    if (makes?.item === 'lumber') {
      return 'For lumber contracts, or sell it at the market. Needs a saw house.';
    }
    if (makes?.item === 'hay') {
      return `Food for the crew, and ${FRONTIER_PEN.hayPerBirth} feeds a pen's new animal. No smelter needed.`;
    }
    if (makes?.item === 'appleSapling') {
      return `Plant it with 🌱: an apple tree in ${FRONTIER_SAPLINGS.appleSaplingGrowShifts} shifts. No smelter needed.`;
    }
    if (makes?.item === FRONTIER_LANTERN.item) {
      return `Hang it at a camp from its panel: ring +${FRONTIER_LANTERN.ringBonus}.`;
    }
    return null;
  }

  /** Make `recipe` once, from the book: its inputs and 1 tap. */
  function makeInBook(recipe: Recipe): void {
    const next = makeCampRecipe(world, recipe.id);
    if (next === world || recipe.makes === null) {
      return; // the button is off whenever this would happen
    }
    remember({ kind: 'make', recipe: recipe.id });
    const list = bookCard.querySelector('.lab2-book-list');
    const scroll = list === null ? 0 : list.scrollTop;
    const made = itemName(recipe.makes.item).toLowerCase();
    bookNote.textContent = `Made ${recipe.makes.count} ${made}${recipe.makes.count > 1 ? 's' : ''}.`;
    setWorld(next);
    const fresh = bookCard.querySelector('.lab2-book-list');
    if (fresh !== null) fresh.scrollTop = scroll;
  }

  /**
   * The planting tray (progression PR 3): which sapling to plant, how many
   * are held, and ×. Each tap on lit dirt plants one, for 1 tap, until ×.
   */
  function showPlantingTray(item: string): void {
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '🌱 Plant'));
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Stop planting');
    cancel.dataset['testid'] = 'lab2-plant-cancel';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);
    const body = element('p', 'lab2-panel-line', plantHint(item));
    body.dataset['testid'] = 'lab2-plant-line';
    // Only what is held (and the one chosen), in a row that scrolls sideways
    // when there are more than fit: seven kinds never fit a phone.
    const actions = element('div', 'lab2-actions lab2-actions-scroll');
    for (const { item: kind, label } of PLANTABLES) {
      const count = world.lab.counts.get(kind) ?? 0;
      if (count === 0 && kind !== item) continue;
      const choose = button(
        kind === item ? 'lab2-button lab2-button-main' : 'lab2-button',
        `${label} ×${count}`,
      );
      choose.dataset['testid'] = `lab2-plant-${kind}`;
      choose.setAttribute('aria-pressed', String(kind === item));
      choose.disabled = count === 0;
      choose.addEventListener('click', () => setMode({ kind: 'planting', item: kind }));
      actions.append(choose);
    }
    tray.replaceChildren(head, body, actions);
  }

  /** A tap on the map while planting: plant one there, or say why not. */
  function tapWhilePlanting(x: number, y: number, item: string): void {
    canvas.dataset['lastTap'] = `plant ${x},${y}`;
    const why = plantRefusal(world, x, y, item);
    if (why !== null) {
      setHint(PLANT_REFUSALS[why] ?? 'A sapling cannot go there.', true);
      return;
    }
    remember({ kind: 'plant', x, y, item });
    setWorld(plantCamp(world, x, y, item));
    const left = world.lab.counts.get(item) ?? 0;
    setHint(
      `Planted. ${left === 0 ? 'None left.' : `${left} left.`} It grows unless its ground is dug.`,
      false,
    );
    if (left === 0) {
      const other = PLANTABLES.map((p) => p.item).find((k) => (world.lab.counts.get(k) ?? 0) > 0);
      setMode(other !== undefined ? { kind: 'planting', item: other } : { kind: 'idle' });
    }
  }

  /**
   * The building tray (owner, after the 0.17.0 build): which building, what
   * it does and costs, and ×. Each tap on bare, undug, lit ground builds the
   * one chosen, for 1 tap.
   */
  function showBuildingTray(what: BuildingKind | 'dirt'): void {
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '🔨 Build'));
    const body = element('p', 'lab2-panel-line');
    body.dataset['testid'] = 'lab2-build-line';
    if (what === 'dirt') {
      // Filling with dirt costs nothing but the tap (owner: "No resource restrictions").
      body.textContent = FILL_HINT;
    } else {
      const info = buildingInfo(what);
      const cost = BUILDING_COSTS[what];
      // The cost goes in the head: beside the choices it would not fit a
      // phone, and a row of its own would grow the tray and move the map.
      const costs = costRow(cost);
      costs.dataset['testid'] = 'lab2-build-cost';
      head.append(costs);
      // A work camp is 2 x 2: the square tapped is its top-left square.
      body.textContent = isWorkCamp(what)
        ? `Tap its top-left square (2 × 2). ${info.does}`
        : `Tap bare ground. ${info.does}`;
      if (!canAfford(world.lab.counts, cost)) {
        body.textContent = `${missingText(cost)} · ${info.does}`;
        body.classList.add('lab2-panel-warn');
      }
    }
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Stop building');
    cancel.dataset['testid'] = 'lab2-build-cancel';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);
    // The choices, short so three fit a 320 px phone: the line above says what each does.
    const choices: { kind: BuildingKind | 'dirt'; label: string; name: string }[] = [
      ...BUILDINGS.map((b) => ({ kind: b.kind, label: `${b.icon} ${b.short}`, name: b.name })),
      { kind: 'dirt', label: '🟫 Dirt', name: 'Fill with dirt' },
    ];
    // Six choices never fit a phone: the row scrolls sideways.
    const actions = element('div', 'lab2-actions lab2-actions-scroll');
    for (const c of choices) {
      const choose = button(
        c.kind === what ? 'lab2-button lab2-button-main' : 'lab2-button',
        c.label,
      );
      choose.dataset['testid'] = `lab2-build-${c.kind}`;
      choose.setAttribute('aria-label', c.name);
      choose.setAttribute('aria-pressed', String(c.kind === what));
      choose.addEventListener('click', () => setMode({ kind: 'building', what: c.kind }));
      actions.append(choose);
    }
    tray.replaceChildren(head, body, actions);
  }

  /**
   * A work camp's panel (owner, after the 0.20.0 build): who works there, how
   * far they reach, what they eat, and Hire. Hiring costs coins and 1 tap.
   */
  function showWorkCampTray(x: number, y: number): void {
    const camp = buildingOn(x, y);
    if (camp === null || !isWorkCamp(camp.kind)) {
      setMode({ kind: 'idle' });
      return;
    }
    const def = FRONTIER_WORK_CAMPS[camp.kind];
    const info = buildingInfo(camp.kind);
    const who =
      camp.kind === 'lumberCamp' ? 'lumberjack' : camp.kind === 'farmCamp' ? 'farmer' : 'gatherer';
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', `${info.icon} ${info.name}`));
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Close');
    cancel.dataset['testid'] = 'lab2-work-close';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);
    const upkeep = campUpkeep(camp);
    const eats =
      upkeep.food === 0
        ? 'nothing yet'
        : `${upkeep.food} food${upkeep.syrup > 0 ? `, ${upkeep.syrup} syrup` : ''} when the crew eats`;
    const horses = def.horse === null ? '' : ` · ${camp.horses} horses`;
    const body = element(
      'p',
      'lab2-panel-line',
      `${camp.workers}/${def.most} ${who}s${horses} · reach ${campReach(camp)} · eats ${eats}`,
    );
    body.dataset['testid'] = 'lab2-work-line';
    const actions = element('div', 'lab2-actions');
    const hires: { who: 'worker' | 'horse'; label: string; coins: number }[] = [
      { who: 'worker', label: `Hire ${who}`, coins: def.hire },
    ];
    if (def.horse !== null)
      hires.push({ who: 'horse', label: 'Hire horse', coins: def.horse.hire });
    for (const h of hires) {
      const why = hireCampRefusal(world, camp.x, camp.y, h.who);
      const b = button(
        why === null ? 'lab2-button lab2-button-main' : 'lab2-button',
        `${h.label} · ${h.coins} 🪙`,
      );
      b.dataset['testid'] = `lab2-hire-${h.who}`;
      b.disabled = why !== null;
      b.title = why === null ? '' : (HIRE_REFUSALS[why] ?? '');
      b.addEventListener('click', () => {
        remember({ kind: 'hire', x: camp.x, y: camp.y, who: h.who });
        setWorld(hireAtCamp(world, camp.x, camp.y, h.who));
        setHint(`Hired: a ${h.who === 'worker' ? who : 'horse'}.`, false);
        setMode({ kind: 'workCamp', x: camp.x, y: camp.y });
      });
      actions.append(b);
    }
    tray.replaceChildren(head, body, actions);
  }

  /**
   * The Place tray (owner, UI rework: "Place button"; asked, everything that
   * can be placed): a camp, each building, dirt, and a plant while a sapling
   * or a seed is held, in a row that scrolls sideways. Each opens its own
   * tray, as the old buttons did.
   */
  function showPlaceTray(): void {
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', '⊕ Place'));
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Close');
    cancel.dataset['testid'] = 'lab2-place-menu-close';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);
    const body = element('p', 'lab2-panel-line', 'What to place: then tap the map.');
    body.dataset['testid'] = 'lab2-place-menu-line';
    const actions = element('div', 'lab2-actions lab2-actions-scroll');
    const camp = button('lab2-button lab2-button-main', '⛺ Camp');
    camp.dataset['testid'] = 'lab2-camp-tool';
    camp.setAttribute('aria-label', 'New camp: choose where');
    if (!canAfford(world.lab.counts, LAB_NEW_CAMP_COST)) camp.classList.add('lab2-tool-short');
    camp.addEventListener('click', () => setMode({ kind: 'placing', target: null }));
    actions.append(camp);
    const held = (item: string): number => world.lab.counts.get(item) ?? 0;
    const firstHeld = PLANTABLES.map((p) => p.item).find((k) => held(k) > 0);
    if (firstHeld !== undefined) {
      const sow = button('lab2-button', '🌱 Plant');
      sow.dataset['testid'] = 'lab2-plant-tool';
      sow.setAttribute('aria-label', 'Plant a sapling or a seed');
      sow.addEventListener('click', () => setMode({ kind: 'planting', item: firstHeld }));
      actions.append(sow);
    }
    for (const b of BUILDINGS) {
      const choose = button('lab2-button', `${b.icon} ${b.short}`);
      choose.dataset['testid'] = `lab2-place-${b.kind}`;
      choose.setAttribute('aria-label', b.name);
      if (!canAfford(world.lab.counts, BUILDING_COSTS[b.kind]))
        choose.classList.add('lab2-tool-short');
      choose.addEventListener('click', () => setMode({ kind: 'building', what: b.kind }));
      actions.append(choose);
    }
    const dirt = button('lab2-button', '🟫 Dirt');
    dirt.dataset['testid'] = 'lab2-place-dirt';
    dirt.setAttribute('aria-label', 'Fill with dirt');
    dirt.addEventListener('click', () => setMode({ kind: 'building', what: 'dirt' }));
    actions.append(dirt);
    tray.replaceChildren(head, body, actions);
  }

  /** A tap on the map while filling: fill it, or say why not. */
  function tapWhileFilling(x: number, y: number): void {
    canvas.dataset['lastTap'] = `fill ${x},${y}`;
    const why = fillSquareRefusal(world, x, y);
    if (why !== null) {
      setHint(FILL_REFUSALS[why] ?? 'That square cannot be filled.', true);
      return;
    }
    remember({ kind: 'fillSquare', x, y });
    setWorld(fillCampSquare(world, x, y));
    setHint('Filled with dirt: 1 level higher.', false);
  }

  /** A tap on the map while building: build the chosen one there, or say why not. */
  function tapWhileBuilding(x: number, y: number, what: BuildingKind): void {
    canvas.dataset['lastTap'] = `build ${x},${y}`;
    const info = buildingInfo(what);
    const why = buildRefusal(world, what, x, y);
    if (why !== null) {
      setHint(BUILD_REFUSALS[why] ?? `A ${info.name.toLowerCase()} cannot go there.`, true);
      return;
    }
    remember({ kind: 'build', building: what, x, y });
    setWorld(buildCampBuilding(world, what, x, y));
    setHint(`${info.name} built. ${info.does}`, false);
    setMode({ kind: 'idle' });
  }

  function showPlacingTray(target: { x: number; y: number } | null): void {
    // Cancel is the × in the head, as in a camp's panel, so the row below has
    // room for the cost and "Place camp" even on a narrow phone (owner's bug
    // report: "Place camp doesn't show").
    const head = element('div', 'lab2-panel-head');
    head.append(element('span', 'lab2-panel-title', placingDeep ? '⛏ Deep camp' : '⛺ New camp'));
    // Holding a camp kit (progression PR 6): switch between a camp and a deep camp.
    if ((world.lab.counts.get('campKit') ?? 0) > 0 || placingDeep) {
      const swap = button('lab2-button', placingDeep ? '⛺ Camp' : '⛏ Deep');
      swap.dataset['testid'] = 'lab2-place-deep';
      swap.setAttribute('aria-pressed', String(placingDeep));
      swap.addEventListener('click', () => {
        placingDeep = !placingDeep;
        setMode(mode);
      });
      head.append(swap);
    }
    const cancel = button('lab2-close', '×');
    cancel.setAttribute('aria-label', 'Cancel');
    cancel.dataset['testid'] = 'lab2-place-cancel';
    cancel.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(cancel);

    // The line says why "Place camp" is off, whenever it is.
    const body = element('p', 'lab2-panel-line');
    body.dataset['testid'] = 'lab2-place-line';
    const refusal = target === null ? null : placeRefusal(world, target.x, target.y, placingDeep);
    const placeCost = placingDeep ? FRONTIER_DEEP_CAMP.cost : LAB_NEW_CAMP_COST;
    const missing = missingText(placeCost);
    if (target === null) {
      body.textContent = placingDeep
        ? `Any lit 3 × 3 that levels at depth ${FRONTIER_DEEP_CAMP.minDepth}+: its concrete foundation digs the patch level. Ring ${FRONTIER_DEEP_CAMP.radius}; mines as level ${FRONTIER_DEEP_CAMP.level}.`
        : PLACE_HINT;
    } else if (refusal !== null && refusal !== 'cost') {
      body.textContent = placeRefusalText(refusal);
      body.classList.add('lab2-panel-warn');
    } else {
      const fresh = preview.size;
      const lights = `lights ${fresh} new ${fresh === 1 ? 'square' : 'squares'}`;
      if (refusal === 'cost') {
        body.textContent = `${missing} · ${lights}`;
        body.classList.add('lab2-panel-warn');
      } else {
        body.textContent = placingDeep
          ? `At ${target.x}, ${target.y} · foundation at depth ${foundationDepthOf(world, target.x, target.y)} · ${lights}`
          : `At ${target.x}, ${target.y} · level ground · ${lights}`;
      }
    }

    const actions = element('div', 'lab2-actions');
    const confirm = button(
      'lab2-button lab2-button-main',
      placingDeep ? 'Place deep' : 'Place camp',
    );
    confirm.dataset['testid'] = 'lab2-place-confirm';
    confirm.disabled = target === null || refusal !== null;
    // A disabled button keeps its outline and text, and says why in its tooltip too.
    confirm.title =
      target === null
        ? 'Choose a spot first'
        : refusal === 'cost'
          ? missing
          : confirm.disabled
            ? body.textContent
            : '';
    confirm.addEventListener('click', () => {
      if (target !== null) {
        confirmPlace(target.x, target.y);
      }
    });
    actions.append(costRow(placeCost), confirm);
    tray.replaceChildren(head, body, actions);
  }

  /** "Need 2 more wood and 5 more grass", for what the counts lack of `cost`; '' if nothing. */
  function missingText(cost: ItemStack[]): string {
    const short = cost
      .map((stack) => ({ stack, lack: stack.count - (world.lab.counts.get(stack.item) ?? 0) }))
      .filter((s) => s.lack > 0)
      .map((s) => `${s.lack} more ${itemName(s.stack.item).toLowerCase()}`);
    if (short.length === 0) {
      return '';
    }
    const last = short.pop() ?? '';
    return `Need ${short.length > 0 ? `${short.join(', ')} and ${last}` : last}`;
  }

  function showCampTray(camp: Camp): void {
    const head = element('div', 'lab2-panel-head');
    const title = element(
      'span',
      'lab2-panel-title',
      camp.deep ? `⛏ Deep camp ${camp.id}` : `⛺ Camp ${camp.id} · Level ${camp.level}`,
    );
    title.dataset['testid'] = 'lab2-camp-title';
    head.append(title);
    // Demolish: only once other camps cover all of this one's base. Otherwise
    // the button stays, quieter, and a tap on it says what to do first.
    const demolish = button('lab2-pack', 'Demolish');
    demolish.dataset['testid'] = 'lab2-demolish';
    if (demolishRefusal(world, camp.id) !== null) {
      demolish.classList.add('lab2-pack-short');
    }
    demolish.addEventListener('click', () => confirmDemolish(camp.id));
    head.append(demolish);
    const close = button('lab2-close', '×');
    close.setAttribute('aria-label', 'Close');
    close.dataset['testid'] = 'lab2-camp-close';
    close.addEventListener('click', () => setMode({ kind: 'idle' }));
    head.append(close);

    // Now: its ring and what it mines.
    const line = element('p', 'lab2-panel-line');
    line.dataset['testid'] = 'lab2-camp-line';
    // With a lantern, the ring is its level's plus the lantern's (said on the lantern's line below).
    // A drill in the store adds ore (🔩) and a steel drill crystal and relics too (⚙️), on any camp's ground.
    const held = (item: string): boolean => (world.lab.counts.get(item) ?? 0) > 0;
    const tools = held(FRONTIER_STEEL_DRILL.item)
      ? ' · ⚙️ + ore, crystal, relics'
      : held(FRONTIER_DRILL.item)
        ? ' · 🔩 + ore'
        : '';
    line.textContent = `Ring ${campRing(camp)} · mines ${minesText(camp.level)}${tools}`;

    // Next: what the upgrade gives, and what it costs.
    const next = element('p', 'lab2-panel-line lab2-panel-next');
    next.dataset['testid'] = 'lab2-camp-next';
    const actions = element('div', 'lab2-actions');
    const cost = camp.deep ? null : upgradeCostFrom(camp.level);
    if (camp.deep) {
      next.textContent = 'A deep camp is never upgraded.';
    } else if (cost === null) {
      next.textContent = `Top level: the widest ring, and every block the lab has.`;
    } else {
      const up = camp.level + 1;
      const ring = campRing({ ...camp, level: up });
      const adds = addedNamesAt(up);
      next.textContent =
        adds.length === 0
          ? `Level ${up}: ring ${ring}, nothing new to mine`
          : `Level ${up}: ring ${ring}, adds ${adds.join(', ')}`;
      actions.append(costRow(cost));
      const upgrade = button('lab2-button lab2-button-main', 'Upgrade');
      upgrade.dataset['testid'] = 'lab2-upgrade';
      upgrade.disabled = !canAfford(world.lab.counts, cost) || turnRefusal(world) !== null;
      upgrade.addEventListener('click', () => confirmUpgrade(camp.id));
      actions.append(upgrade);
    }
    tray.replaceChildren(head, line, next, actions);

    // The smelter (smelting and crafting): built here from level 2, or here already.
    if (camp.smelter) {
      // Loaded here, it smelts overnight (owner, after the 0.27.0 build).
      const data = FRONTIER_SMELTER.levels[Math.max(1, camp.smelterLevel) - 1];
      const ore = camp.smeltIron + camp.smeltCopper;
      const has = element(
        'p',
        'lab2-panel-line',
        `🔥 Smelter L${camp.smelterLevel} · ore ${ore}/${data?.ore ?? 0} (${camp.smeltIron} iron, ${camp.smeltCopper} copper) · coal ${camp.smeltCoal}/${data?.coal ?? 0} · makes ${data?.perNight ?? 0} ingots a night`,
      );
      has.dataset['testid'] = 'lab2-camp-smelter';
      has.dataset['level'] = String(camp.smelterLevel);
      has.dataset['iron'] = String(camp.smeltIron);
      has.dataset['copper'] = String(camp.smeltCopper);
      has.dataset['coal'] = String(camp.smeltCoal);
      tray.append(has);
      const row = element('div', 'lab2-actions');
      for (const [oreItem, label] of [
        ['rawIronOre', 'Load iron'],
        ['rawCopperOre', 'Load copper'],
      ] as const) {
        const load = button('lab2-button', label);
        load.dataset['testid'] = `lab2-smelter-load-${oreItem}`;
        const plan = loadSmelterPlan(world, camp.id, oreItem);
        // Off when no ore of this kind would go in (coal alone goes with either).
        load.disabled =
          loadSmelterRefusal(world, camp.id, oreItem) !== null ||
          (plan.ore === 0 && plan.coal === 0);
        load.title = `Loads ${plan.ore} ore and ${plan.coal} coal from your store, for 1 tap`;
        load.addEventListener('click', () => confirmLoad(camp.id, oreItem));
        row.append(load);
      }
      const kit = FRONTIER_SMELTER.kits[camp.smelterLevel - 1];
      if (kit !== undefined && camp.smelterLevel < FRONTIER_SMELTER.levels.length) {
        const up = button('lab2-button', `⬆ Level ${camp.smelterLevel + 1} kit`);
        up.dataset['testid'] = 'lab2-smelter-upgrade';
        up.disabled = smelterKitRefusal(world, camp.id) !== null;
        up.title =
          (world.lab.counts.get(kit) ?? 0) > 0
            ? `Use your ${itemName(kit)}, for 1 tap`
            : `Needs a ${itemName(kit)} from the market 🏪`;
        up.addEventListener('click', () => confirmSmelterKit(camp.id));
        row.append(up);
      }
      tray.append(row);
    } else if (camp.level >= FRONTIER_SMELTER.minLevel) {
      const row = element('div', 'lab2-actions');
      row.append(costRow(FRONTIER_SMELTER.cost, 'lab2-smelter-cost'));
      const build = button('lab2-button', '🔥 Build smelter');
      build.dataset['testid'] = 'lab2-build-smelter';
      build.disabled = smelterRefusal(world, camp.id) !== null;
      build.addEventListener('click', () => confirmSmelter(camp.id));
      row.append(build);
      tray.append(row);
    }

    // The animal pen (progression PR 4): build one, or move animals in and out.
    if (camp.pen) {
      const row = element('div', 'lab2-actions');
      // Short, so it fits beside its buttons on a phone: "🐑 2/4 · lamb in 3".
      const breeding =
        camp.breedIn > 0 ? ` · lamb in ${camp.breedIn}` : camp.penned < 2 ? ' · 2 breed' : '';
      const has = element(
        'span',
        'lab2-panel-line',
        `🐑 ${camp.penned}/${FRONTIER_PEN.capacity}${breeding}`,
      );
      has.title = `Pen: ${camp.penned} of ${FRONTIER_PEN.capacity}. Two or more breed every ${FRONTIER_PEN.breedEveryShifts} shifts, eating ${FRONTIER_PEN.hayPerBirth} hay.`;
      has.dataset['testid'] = 'lab2-camp-pen';
      const putIn = button('lab2-button', 'In');
      putIn.dataset['testid'] = 'lab2-pen-in';
      putIn.setAttribute('aria-label', 'Put an animal in the pen');
      putIn.disabled = penRefusal(world, 'penIn', camp.id) !== null;
      putIn.addEventListener('click', () => confirmPen('penIn', camp.id));
      const takeOut = button('lab2-button', 'Out');
      takeOut.dataset['testid'] = 'lab2-pen-out';
      takeOut.setAttribute('aria-label', 'Take an animal out of the pen');
      takeOut.disabled = penRefusal(world, 'penOut', camp.id) !== null;
      takeOut.addEventListener('click', () => confirmPen('penOut', camp.id));
      row.append(has, putIn, takeOut);
      tray.append(row);
    } else if (camp.level >= FRONTIER_PEN.minLevel) {
      const row = element('div', 'lab2-actions');
      row.append(costRow(FRONTIER_PEN.cost, 'lab2-pen-cost'));
      const build = button('lab2-button', '🐑 Build pen');
      build.dataset['testid'] = 'lab2-build-pen';
      build.disabled = penRefusal(world, 'buildPen', camp.id) !== null;
      build.addEventListener('click', () => confirmPen('buildPen', camp.id));
      row.append(build);
      tray.append(row);
    }

    // Defenses (hazards PR 5): built a level at a time, against marauders,
    // from level 2 as the smelter and pen (a base camp's panel has no room).
    if (camp.level >= FRONTIER_DEFENSE_MIN_LEVEL) {
      const row = element('div', 'lab2-actions');
      const next = FRONTIER_DEFENSE[camp.defense];
      const have =
        camp.defense === 0 ? 'No defenses' : (FRONTIER_DEFENSE[camp.defense - 1]?.name ?? '');
      const line = element(
        'span',
        'lab2-panel-line',
        `🛡 ${have} · ${camp.defense}/${FRONTIER_DEFENSE.length}`,
      );
      line.title = `Marauders come 1 to ${FRONTIER_RAID.strengthChances.length} strong, the stronger the rarer: a camp with that many levels of defenses turns them away, and each level short lets them take less.`;
      line.dataset['testid'] = 'lab2-camp-defense';
      row.append(line);
      if (next !== undefined) {
        row.append(costRow(next.cost, 'lab2-defense-cost'));
        const build = button('lab2-button', `🛡 ${next.name}`);
        build.dataset['testid'] = 'lab2-build-defense';
        build.disabled = defenseRefusal(world, camp.id) !== null;
        build.addEventListener('click', () => confirmDefense(camp.id));
        row.append(build);
      }
      tray.append(row);
    }

    // The lantern (PR 3): hung here from the store, or here already.
    if (camp.lantern) {
      const has = element(
        'p',
        'lab2-panel-line',
        `🏮 Lantern here · ring +${FRONTIER_LANTERN.ringBonus}`,
      );
      has.dataset['testid'] = 'lab2-camp-lantern';
      tray.append(has);
    } else if ((world.lab.counts.get(FRONTIER_LANTERN.item) ?? 0) > 0) {
      const row = element('div', 'lab2-actions');
      row.append(
        element('span', 'lab2-panel-line', `Ring +${FRONTIER_LANTERN.ringBonus} for 1 lantern`),
      );
      const hang = button('lab2-button', '🏮 Hang lantern');
      hang.dataset['testid'] = 'lab2-hang-lantern';
      hang.disabled = lanternRefusal(world, camp.id) !== null;
      hang.addEventListener('click', () => confirmLantern(camp.id));
      row.append(hang);
      tray.append(row);
    }
  }

  // ----- Accomplishments (owner, after the 0.26.0 build) -----

  let featTimer = 0;
  /** Say the accomplishments just earned, in the toast, and keep the best glory of any run. */
  function showFeats(ids: string[]): void {
    const feats = FRONTIER_FEATS.filter((f) => ids.includes(f.id));
    if (feats.length === 0) return;
    featToast.replaceChildren(
      ...feats.map((f) => element('p', 'lab2-feat-line', `🏅 ${f.name} · +${f.glory} glory`)),
    );
    featToast.dataset['feats'] = feats.map((f) => f.id).join(' ');
    featToast.hidden = false;
    window.clearTimeout(featTimer);
    featTimer = window.setTimeout(() => {
      featToast.hidden = true;
    }, FEAT_TOAST_MS);
    if (asGame) saveBestGlory(gloryOf(toFrontier(world)));
  }

  // ----- Changing the world -----

  /** Take a new world: work out what is shown again, and refresh the counter and tray. */
  function setWorld(next: CampWorld): void {
    const earned = next.turn.feats.filter((id) => !world.turn.feats.includes(id));
    world = next;
    if (earned.length > 0) showFeats(earned);
    // Say a dragon's attack even if the action says nothing more.
    const news = takeDragonNews();
    if (news.length > 0) {
      dragonLine = news.map(dragonText).join(' ');
      hint.textContent = dragonLine;
      hint.classList.toggle('lab-hint-warn', true);
      // A hint set straight after (the action's own) carries it; later ones do not.
      queueMicrotask(() => {
        dragonLine = '';
      });
    }
    tops = topBlocksOf(world.lab.state);
    sights = sightMap(world);
    showHud();
    showCampCounter();
    showTray();
    draw();
    showTutorial();
  }

  // ----- The tutorial and its tips (tutorial.ts; owner, after the 0.26.0 build) -----

  /** Where the tutorial stands, or `null` if it has not started (it starts with a brand-new run). */
  let tutorial: TutorialState | null = asGame ? loadTutorial() : null;
  /** True after a night marauders came in: for the raid tip. */
  let raidedLastNight = false;
  /** What the card's button does now. */
  let tutorialPress: () => void = () => undefined;
  tutorialButton.addEventListener('click', (event) => {
    event.stopPropagation();
    tutorialPress();
  });

  function setTutorial(next: TutorialState): void {
    tutorial = next;
    saveJson(TUTORIAL_KEY, next);
  }

  /** Start the tutorial from its first step (a brand-new run, or Replay). */
  function startTutorial(): void {
    if (!asGame) return;
    setTutorial({ step: 0, dugArea: false });
    showTutorial();
  }

  /** What the tutorial needs to know of the run now. */
  function tutorialFacts(): TutorialFacts {
    const counts = world.lab.counts;
    const has = (item: string): boolean => (counts.get(item) ?? 0) > 0;
    const width = world.lab.state.size.x;
    return {
      gathered: has('wood') || has('grass') || has('apple'),
      mined: world.lab.mined,
      dugArea: tutorial?.dugArea ?? false,
      shift: world.turn.shift,
      canPayCamp: canAfford(counts, LAB_NEW_CAMP_COST),
      camps: world.camps.length,
      bestLevel: Math.max(0, ...world.camps.map((c) => c.level)),
      contracts:
        world.turn.contracts.length + world.turn.contractsDone.reduce((sum, n) => sum + n, 0),
      dragon: world.hazards.dragons.length > 0,
      fire: world.hazards.fires.some(
        (burning, i) => burning && sightOf(i % width, Math.floor(i / width)) === 'shown',
      ),
      flood: world.hazards.flooded.some((f) => f),
      raided: raidedLastNight,
      smelter: world.camps.some((c) => c.smelter),
    };
  }

  /** True while the ? has the tips open, once the tutorial is over (not kept: it opens shut). */
  let helpOpen = false;
  helpButton.addEventListener('click', () => {
    // The ? brings the card back: the tutorial's step, or the tips after it.
    if (tutorialGoing() && tutorial !== null) setTutorial({ ...tutorial, min: false });
    else helpOpen = true;
    showTutorial();
  });
  tutorialMin.addEventListener('click', (event) => {
    event.stopPropagation();
    if (tutorialGoing() && tutorial !== null) setTutorial({ ...tutorial, min: true });
    else helpOpen = false;
    showTutorial();
  });

  /** True while the tutorial's steps are still going (started, and not finished or skipped). */
  function tutorialGoing(): boolean {
    return tutorial !== null && tutorial.step <= TUTORIAL_STEPS.length;
  }

  /**
   * The card and the ? (owner, after the 0.27.0 build: "Need to be able to
   * minimize the tutorial card into a ? above the end shift button. It
   * becomes just a tip rotation after the tutorial"):
   * - a one-time tip due (a dragon, a fire ...) opens the card until "Got it";
   * - else, while the tutorial goes on, its step, or the ? if it is minimized;
   * - else the ?, which opens the tips: one at a time, round and round.
   * The button a step points at pulses while its step shows.
   */
  function showTutorial(): void {
    if (!asGame) return;
    const facts = tutorialFacts();
    const targets: Record<TutorialTarget, HTMLElement> = {
      endShift: endShiftButton,
      place: placeButton,
      goals: goalsButton,
    };
    for (const el of Object.values(targets)) el.classList.remove('lab2-tutorial-target');
    /** Show the card (and not the ?), or the ? (and not the card). */
    const open = (isOpen: boolean): void => {
      tutorialCard.hidden = !isOpen;
      helpButton.hidden = isOpen;
    };
    tutorialMin.hidden = false;
    // A tip first: one sentence, once ever, until "Got it".
    const tipId = world.turn.status === 'active' ? tipsDue(facts, loadTips())[0] : undefined;
    const tip = TUTORIAL_TIPS.find((t) => t.id === tipId);
    if (tip !== undefined) {
      open(true);
      tutorialCard.dataset['kind'] = 'tip';
      tutorialCard.dataset['step'] = tip.id;
      tutorialText.textContent = tip.text;
      tutorialCount.textContent = 'Tip';
      tutorialButton.textContent = 'Got it';
      tutorialMin.hidden = true;
      tutorialPress = () => {
        saveJson(TIPS_KEY, [...loadTips(), tip.id]);
        if (tip.id === 'raid') raidedLastNight = false;
        showTutorial();
      };
      return;
    }
    if (tutorial !== null && tutorialGoing()) {
      const at = tutorialStep(tutorial.step, facts);
      if (at !== tutorial.step) setTutorial({ ...tutorial, step: at });
      const step = TUTORIAL_STEPS[at];
      helpButton.dataset['kind'] = 'step';
      if (tutorial.min === true) {
        open(false);
        return;
      }
      open(true);
      tutorialCard.dataset['kind'] = 'step';
      if (step === undefined) {
        // Every step done: one last card, then it is over for good.
        tutorialCard.dataset['step'] = 'done';
        tutorialText.textContent =
          'That’s the basics. The rest is yours to find: reclaim your family’s heritage! The ? has more tips.';
        tutorialCount.textContent = '';
        tutorialButton.textContent = 'Done';
      } else {
        tutorialCard.dataset['step'] = step.id;
        tutorialText.textContent = step.text;
        tutorialCount.textContent = `Tutorial ${at + 1} / ${TUTORIAL_STEPS.length}`;
        tutorialButton.textContent = 'Skip';
        if (step.target !== undefined) targets[step.target].classList.add('lab2-tutorial-target');
      }
      tutorialPress = () => {
        // Skip, or Done: the tutorial is over (Replay in the contracts card brings it back).
        setTutorial({ step: TUTORIAL_STEPS.length + 1, dugArea: true });
        helpOpen = false;
        showTutorial();
      };
      return;
    }
    // After the tutorial (or without one): the ? turns through the tips.
    helpButton.dataset['kind'] = 'tips';
    if (!helpOpen) {
      open(false);
      return;
    }
    open(true);
    const kept = loadJson(TIP_AT_KEY);
    const at = typeof kept === 'number' && ROTATING_TIPS[kept] !== undefined ? kept : 0;
    tutorialCard.dataset['kind'] = 'rotate';
    tutorialCard.dataset['step'] = String(at);
    tutorialText.textContent = ROTATING_TIPS[at] ?? '';
    tutorialCount.textContent = `Tip ${at + 1} / ${ROTATING_TIPS.length}`;
    tutorialButton.textContent = 'Next tip';
    tutorialPress = () => {
      saveJson(TIP_AT_KEY, nextTip(at));
      showTutorial();
    };
  }

  function setMode(next: Mode): void {
    mode = next;
    if (mode.kind !== 'placing') placingDeep = false;
    preview =
      mode.kind === 'placing' && mode.target !== null
        ? new Set(newlyCovered(world, mode.target.x, mode.target.y, placingDeep))
        : new Set();
    if (mode.kind === 'placing') {
      // While placing, the hint says what to do next: choose a spot, then
      // tap Place camp (the panel says why a spot is refused, if it is).
      setHint(mode.target === null ? PLACE_HINT : PLACE_CHOSEN_HINT, false);
    }
    showTray();
    draw();
    cues.start();
  }

  /** The dragons' news from the last action, said with the next hint (cleared once said). */
  let dragonLine = '';

  function setHint(text: string, warn: boolean | 'hard'): void {
    // A dragon attacked with the taps just spent (owner, after the 0.25.0
    // build): its news leads whatever the action itself says.
    const news = takeDragonNews();
    if (news.length > 0) dragonLine = news.map(dragonText).join(' ');
    hint.textContent = dragonLine === '' ? text : `${dragonLine} ${text}`.trim();
    if (dragonLine !== '') warn = true;
    dragonLine = '';
    hint.classList.toggle('lab-hint-warn', warn === true);
    hint.classList.toggle('lab2-hint-hard', warn === 'hard');
  }

  function confirmPlace(x: number, y: number): void {
    const deep = placingDeep;
    const next = placeCamp(world, x, y, deep);
    if (next === world) {
      return;
    }
    remember({ kind: deep ? 'placeDeep' : 'place', x, y });
    mode = { kind: 'idle' };
    placingDeep = false;
    preview = new Set();
    setWorld(next);
    setHint(
      deep
        ? 'Deep camp placed: it mines as a level-3 camp, deep down.'
        : 'Camp placed: the fog lifts around it.',
      false,
    );
    addEffect({
      kind: 'ring',
      x,
      y,
      label: '',
      higher: [],
      fromRadius: 0,
      toRadius: deep ? FRONTIER_DEEP_CAMP.radius : campRadius(1),
    });
  }

  function confirmUpgrade(id: number): void {
    const before = world.camps.find((c) => c.id === id);
    const next = upgradeCamp(world, id);
    if (before === undefined || next === world) {
      return;
    }
    remember({ kind: 'upgrade', id });
    setWorld(next);
    const harder = addedNamesAt(before.level + 1).length > 0 ? ', harder blocks' : '';
    setHint(`Camp ${id} is level ${before.level + 1}: a wider ring${harder}.`, false);
    addEffect({
      kind: 'ring',
      x: before.x,
      y: before.y,
      label: '',
      higher: [],
      fromRadius: campRing(before),
      toRadius: campRing({ ...before, level: before.level + 1 }),
    });
  }

  function confirmDefense(id: number): void {
    const next = buildCampDefense(world, id);
    if (next === world) {
      return; // the button is off whenever this would happen
    }
    remember({ kind: 'buildDefense', id });
    setWorld(next);
    const level = next.camps.find((c) => c.id === id)?.defense ?? 0;
    setHint(
      `Camp ${id} has a ${FRONTIER_DEFENSE[level - 1]?.name.toLowerCase() ?? 'defense'} 🛡: it turns away marauders up to ${level} strong.`,
      false,
    );
  }

  function confirmLantern(id: number): void {
    const before = world.camps.find((c) => c.id === id);
    const next = hangCampLantern(world, id);
    if (before === undefined || next === world) {
      return; // the button is off whenever this would happen
    }
    remember({ kind: 'hangLantern', id });
    setWorld(next);
    setHint(`A lantern at camp ${id}: its ring is ${FRONTIER_LANTERN.ringBonus} wider.`, false);
    addEffect({
      kind: 'ring',
      x: before.x,
      y: before.y,
      label: '',
      higher: [],
      fromRadius: campRing(before),
      toRadius: campRing({ ...before, lantern: true }),
    });
  }

  function confirmSmelter(id: number): void {
    const next = buildCampSmelter(world, id);
    if (next === world) {
      return; // the button is off whenever this would happen
    }
    remember({ kind: 'buildSmelter', id });
    setWorld(next);
    setHint(
      `A smelter at camp ${id}: load it with raw ore and coal here, and it smelts overnight.`,
      false,
    );
  }

  /** Load camp `id`'s smelter with `ore` and coal from the store (owner, after the 0.27.0 build). */
  function confirmLoad(id: number, ore: string): void {
    const plan = loadSmelterPlan(world, id, ore);
    const next = loadCampSmelter(world, id, ore);
    if (next === world) return; // the button is off whenever this would happen
    remember({ kind: 'loadSmelter', id, ore });
    setWorld(next);
    setHint(
      `Loaded ${plan.ore} ${itemName(ore).toLowerCase()} and ${plan.coal} coal: the smelter works tonight.`,
      false,
    );
  }

  /** Upgrade camp `id`'s smelter with its kit. */
  function confirmSmelterKit(id: number): void {
    const next = upgradeCampSmelter(world, id);
    if (next === world) return;
    remember({ kind: 'upgradeSmelter', id });
    setWorld(next);
    const level = next.camps.find((c) => c.id === id)?.smelterLevel ?? 0;
    const data = FRONTIER_SMELTER.levels[level - 1];
    setHint(
      `Smelter level ${level}: it holds ${data?.ore ?? 0} ore and ${data?.coal ?? 0} coal, and makes ${data?.perNight ?? 0} ingots a night.`,
      false,
    );
  }

  /** Build a pen at camp `id`, or move an animal into or out of it (progression PR 4). */
  function confirmPen(kind: 'buildPen' | 'penIn' | 'penOut', id: number): void {
    const next = penCamp(world, kind, id);
    if (next === world) {
      return; // the button is off whenever this would happen
    }
    remember({ kind, id });
    setWorld(next);
    const hints = {
      buildPen: `A pen at camp ${id}: put animals in; two or more breed, eating hay.`,
      penIn: 'An animal in the pen: safe from upkeep.',
      penOut: 'An animal out of the pen, in the store.',
    };
    setHint(hints[kind], false);
  }

  function confirmDemolish(id: number): void {
    const next = demolishCamp(world, id);
    if (next === world) {
      const why = turnRefusal(world);
      setHint(why === 'noTaps' ? NO_TAPS_HINT : why === 'over' ? OVER_HINT : DEMOLISH_FIRST, true);
      return;
    }
    remember({ kind: 'demolish', id });
    mode = { kind: 'idle' };
    setWorld(next);
    setHint('Camp demolished: its ground can be mined now.', false);
  }

  // ----- Shifts (plan A4) -----

  /** The HUD, the shift buttons and the end-of-run banner, from the world's turn. */
  function showHud(): void {
    const turn = world.turn;
    hudShift.textContent = `Shift ${turn.shift}`;
    // Taps left only: with 100 a shift, "100/100" crowds the map's buttons on a 320 px phone.
    hudTaps.textContent = `⚡ ${turn.tapsLeft}`;
    hudTaps.setAttribute(
      'aria-label',
      `${turn.tapsLeft} of ${tapsPerShift(world.lab.counts)} taps left`,
    );
    hud.dataset['shift'] = String(turn.shift);
    hud.dataset['taps'] = String(turn.tapsLeft);
    hud.dataset['status'] = turn.status;
    hudTaps.classList.toggle('lab2-hud-empty', turn.tapsLeft === 0);
    const active = turn.status === 'active';
    endShiftButton.disabled = !active;
    placeButton.disabled = !active;
    // The contracts button glows when a contract held can be delivered.
    const deliverable = anyDeliverable(toFrontier(world));
    goalsButton.classList.toggle('lab2-market-open', deliverable);
    goalsButton.dataset['deliverable'] = String(deliverable);
    const goalsLabel = deliverable ? 'Contracts: one can be delivered' : 'Contracts and goals';
    goalsButton.setAttribute('aria-label', goalsLabel);
    goalsButton.title = goalsLabel;
    // Out of taps: End shift is what to press next, so it stands out.
    endShiftButton.classList.toggle('lab2-end-shift-now', active && turn.tapsLeft === 0);
    overBanner.hidden = active;
    const score = world.lab.counts.get(FRONTIER_MARKET.coin) ?? 0;
    // The run's glory and the family's standing (accomplishments), with the coins.
    const glory = gloryOf(toFrontier(world));
    const standing = `✨ ${glory} glory: the family is ${standingOf(glory).toLowerCase()}.`;
    overBanner.textContent =
      turn.status === 'finished'
        ? `The pass is closing after ${FRONTIER_RUN.shifts} shifts: 🪙 ${score} coins. ${standing} Tap New world to start again.`
        : `Mine closed after ${turn.shift} shifts. ${standing} Tap New world to start again.`;
  }

  /**
   * End the shift. The animals slide to where they stepped, the Undo history is
   * emptied (it never crosses a shift, question 151), and the hint says what
   * upkeep was paid and what going short cost.
   */
  function finishShift(): void {
    const before = world.surface.animals;
    const dragonsBefore = world.hazards.dragons;
    const result = endShift(world);
    if (result.report === null) {
      return;
    }
    history = emptyHistory(result.world);
    showUndo();
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setWorld(result.world);
    if (asGame) {
      saveRun(result.world); // saved every shift (question 152)
    }
    const text = shiftText(result.report, result.world.turn);
    setHint(text, result.report.unpaid.length > 0);
    if (result.report.raid !== null) {
      raidedLastNight = true;
      showTutorial();
    }
    // Night (owner, after the playtest of PR #146): the state has moved on
    // already; the night only shows it. The animals slide to where they
    // stepped once it is morning.
    night?.skip();
    night = showNight(root, {
      shift: result.report.shift,
      summary: text,
      rain: result.report.rained,
      page,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onDone: () => {
        night = null;
        noteSteps(before);
        noteFlights(dragonsBefore);
        cues.start();
        // A market day: the market opens now, after the night, before the day.
        openMarket();
      },
    });
  }

  /** The night being shown between two shifts, or `null`. */
  let night: Night | null = null;

  // ----- Undo -----

  /**
   * Note an action that did something, for Undo (undoHistory.ts). A catch
   * or an apple pick is noted as not undoable (question 141).
   */
  function remember(step: CampStep, undoable = true): void {
    history = noteAction(history, step, undoable);
    showUndo();
  }

  /** The Undo button is off when there is nothing to undo. */
  function showUndo(): void {
    const count = undoCount(history);
    undoButton.disabled = count === 0;
    undoButton.dataset['count'] = String(count);
  }

  /** What an action was, for the hint after it is undone. */
  function describeStep(step: CampStep): string {
    if (step.kind === 'tap') return `the tap at ${step.x}, ${step.y}`;
    if (step.kind === 'place') return 'placing the camp';
    if (step.kind === 'placeDeep') return 'placing the deep camp';
    if (step.kind === 'upgrade') return `the upgrade of camp ${step.id}`;
    if (step.kind === 'demolish') return `demolishing camp ${step.id}`;
    if (step.kind === 'sell' || step.kind === 'buy') return `the ${step.kind} of ${step.item}`;
    if (step.kind === 'plant') return `planting at ${step.x}, ${step.y}`;
    if (step.kind === 'fillSquare') return `filling ${step.x}, ${step.y}`;
    if (step.kind === 'hire') return `hiring at ${step.x}, ${step.y}`;
    if (step.kind === 'digArea') return `the miners' dig at ${step.x}, ${step.y}`;
    if (step.kind === 'build') {
      return isBuildingKind(step.building)
        ? `the ${buildingInfo(step.building).name.toLowerCase()} at ${step.x}, ${step.y}`
        : `building at ${step.x}, ${step.y}`;
    }
    if (step.kind === 'buildPen') return `the pen at camp ${step.id}`;
    if (step.kind === 'buildDefense') return `the defenses at camp ${step.id}`;
    if (step.kind === 'takeContract') return 'taking the contract';
    if (step.kind === 'fillContract') return 'filling the contract';
    if (step.kind === 'deliver') return 'the delivery';
    if (step.kind === 'dropContract') return 'dropping the contract';
    if (step.kind === 'penIn' || step.kind === 'penOut')
      return `moving an animal at camp ${step.id}`;
    return 'the end of the shift'; // never in the history: it is emptied when a shift ends
  }

  /**
   * Undo the last undoable action of the shift: the engine plays the shift
   * again without it (plan A5), so the player's own change is taken back
   * exactly and its tap comes back. Caught animals and picked apples stay
   * so (owner, question 141). The camera stays put.
   */
  function undo(): void {
    const result = undoLast(history, world);
    if (result === null) {
      return;
    }
    if ('refused' in result) {
      setHint(result.refused, true);
      return;
    }
    history = result.history;
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setWorld(result.world);
    const left = undoCount(history);
    setHint(
      `Undone: ${describeStep(result.undone)}.${left === 0 ? ' Nothing more to undo.' : ''}`,
      false,
    );
    showUndo();
  }

  // ----- A tap -----
  function tap(x: number, y: number): void {
    if (mode.kind === 'placing') {
      tapWhilePlacing(x, y);
      return;
    }
    if (mode.kind === 'planting') {
      tapWhilePlanting(x, y, mode.item);
      return;
    }
    if (mode.kind === 'building') {
      if (mode.what === 'dirt') tapWhileFilling(x, y);
      else tapWhileBuilding(x, y, mode.what);
      return;
    }

    const result = campTap(world, x, y);
    canvas.dataset['lastTap'] = `${result.kind} ${x},${y}`;
    if (result.kind === 'fog') {
      return; // Fog: nothing at all happens.
    }
    if (result.kind === 'noTaps' || result.kind === 'over') {
      // A camp can still be opened to look at it; nothing else happens.
      const camp = campAt(world, x, y);
      if (camp !== null) {
        setMode({ kind: 'camp', id: camp.id });
      }
      setHint(result.kind === 'noTaps' ? NO_TAPS_HINT : OVER_HINT, true);
      return;
    }
    if (result.kind === 'uprooted') {
      remember({ kind: 'tap', x, y });
      setWorld(result.world);
      setHint('Sapling pulled up: it is back in your store, and the ground is not dug.', false);
      return;
    }
    if (result.kind === 'growing') {
      const i = x + world.lab.state.size.x * y;
      const left = world.cropIn[i] ?? 0;
      setHint(`Still growing: ripe in ${left} ${left === 1 ? 'shift' : 'shifts'}.`, false);
      return;
    }
    if (result.kind === 'building') {
      const here = buildingOn(x, y);
      // A work camp opens its panel (owner, after the 0.20.0 build).
      if (here !== null && isWorkCamp(here.kind)) {
        setMode({ kind: 'workCamp', x: here.x, y: here.y });
        return;
      }
      if (here !== null) {
        const info = buildingInfo(here.kind);
        setHint(`A ${info.name.toLowerCase()}. ${info.does}`, false);
      }
      return;
    }
    if (result.kind === 'camp') {
      const camp = campAt(world, x, y);
      if (camp !== null) {
        setMode({ kind: 'camp', id: camp.id });
        setHint(HINT, false);
      }
      return;
    }
    if (mode.kind === 'camp' || mode.kind === 'book') {
      // A tap elsewhere closes the camp's panel (or the book), and then acts as a tap.
      mode = { kind: 'idle' };
      showTray();
    }
    if (result.kind === 'greyed') {
      setHint(GREYED_HINT, true);
      draw();
      return;
    }
    if (result.kind === 'tooHard') {
      const name = blockDefByCode(tops[x + world.lab.state.size.x * y] ?? 0).name;
      // One reason: a camp level, or a tool (progression plan section 4).
      const text =
        result.needs !== null
          ? `${name} needs a level ${result.needs} camp over it.`
          : result.needsTool === FRONTIER_DRILL.item
            ? `${name} needs an iron drill: buy one at the market 🏪, or make one at a smelter.`
            : result.needsTool !== null
              ? `${name} needs a steel drill: buy one at the market 🏪.`
              : `${name} cannot be mined.`;
      setHint(text, 'hard');
      effects = effects.filter((e) => e.kind !== 'tooHard');
      addEffect({
        kind: 'tooHard',
        x,
        y,
        label:
          result.needs !== null
            ? `Needs Lv ${result.needs}`
            : result.needsTool !== null
              ? `Needs ${result.needsTool === FRONTIER_DRILL.item ? 'drill' : 'steel drill'}`
              : 'Too hard',
        higher: [],
        fromRadius: 0,
        toRadius: 0,
      });
      return;
    }
    // Water (hazards PR 2): a flooded square, and the pump.
    if (result.kind === 'flooded') {
      setHint(
        `Flooded 💧: buy a pump at the market 🏪 (${pumpCoins()} coins), then tap the water to set it.`,
        true,
      );
      return;
    }
    if (result.kind === 'needsSword') {
      setHint(
        `A dragon 🐉! It eats animals and apples and sets fires until a sword ⚔ drives it off: make one at a smelter (3 iron ingots, 2 wood) or buy one at the market 🏪 (${swordCoins()} coins, from a level-3 camp).`,
        true,
      );
      return;
    }
    if (result.kind === 'dragon') {
      remember({ kind: 'tap', x, y });
      setWorld(result.world);
      setHint('You drove the dragon off with your sword ⚔.', false);
      return;
    }
    if (result.kind === 'fire') {
      remember({ kind: 'tap', x, y });
      setWorld(result.world);
      const left = result.world.hazards.fires.filter((f) => f).length;
      setHint(
        left === 0
          ? 'Fire put out 🔥. That was the last one.'
          : `Fire put out 🔥. ${left} still ${left === 1 ? 'burns' : 'burn'}: tap each one, or it spreads tonight.`,
        left > 0,
      );
      return;
    }
    if (result.kind === 'pump') {
      remember({ kind: 'tap', x, y });
      setWorld(result.world);
      setHint(
        result.pump === 'set'
          ? `Pump set: it drains ${FRONTIER_PUMP.drainPerShift} flooded squares a night, then comes back to your store.`
          : 'Pump picked up: the water stays until a pump drains it.',
        false,
      );
      return;
    }
    if (result.kind === 'refused') {
      const refusal = result.tap?.result.refusal;
      setHint(refusal === 'bottom' ? BOTTOM_HINT : STEEP_HINT, true);
      effects = effects.filter((e) => e.kind !== 'refused');
      addEffect({
        kind: 'refused',
        x,
        y,
        label: '',
        higher: result.tap?.result.higherNeighbours ?? [],
        fromRadius: 0,
        toRadius: 0,
      });
      frame.classList.remove('lab-shake');
      void frame.offsetWidth; // forces a layout, so the shake starts again
      frame.classList.add('lab-shake');
      return;
    }
    if (result.kind === 'harvested' && result.harvest !== null) {
      effects = effects.filter((e) => !(e.x === x && e.y === y));
      // Cut grass and felled trees can be undone; a caught animal or a picked
      // apple cannot (owner, question 141): it is noted, so Undo plays it
      // again, but never takes it back.
      const undoable = result.harvest.kind === 'grass' || result.harvest.kind === 'felled';
      remember({ kind: 'tap', x, y }, undoable);
      setWorld(result.world);
      const extra = result.harvest.extra;
      setHint(
        extra === null
          ? HARVEST_HINTS[result.harvest.kind]
          : 'Tree felled, and a sapling 🌱 with it: plant it on bare dirt to grow a new tree.',
        false,
      );
      addEffect({
        kind: 'mined',
        x,
        y,
        label: gainText(extra === null ? [result.harvest.gain] : [result.harvest.gain, extra]),
        higher: [],
        fromRadius: 0,
        toRadius: 0,
      });
      return;
    }
    // Mined.
    effects = effects.filter((e) => !(e.x === x && e.y === y));
    remember({ kind: 'tap', x, y });
    const dragonsBeforeTap = world.hazards.dragons;
    setWorld(result.world);
    // The dragons flew on a square: they glide there (hazards PR 4).
    noteFlights(dragonsBeforeTap, CAMP_LOOK.dragonStepMs);
    if (result.gas === 'exploded') {
      const n = result.fires.length;
      setHint(
        `Gas 💥! The blast blew away ${result.blown.length} ${result.blown.length === 1 ? 'block' : 'blocks'}${n > 0 ? ` and set ${n} ${n === 1 ? 'fire' : 'fires'} 🔥: tap each fire to put it out before night, or it spreads` : ''}.`,
        true,
      );
    } else if (result.gas === 'vented') {
      setHint('You hit a gas pocket, but it vented without exploding.', false);
    } else if (result.flooded.length > 0) {
      const n = result.flooded.length;
      setHint(
        `You hit water 💧: ${n} ${n === 1 ? 'square is' : 'squares are'} flooded. A pump from the market 🏪 drains it.`,
        true,
      );
    } else {
      setHint(HINT, false);
    }
    addEffect({
      kind: 'mined',
      x,
      y,
      label: gainText(result.tap?.result.yields ?? []),
      higher: [],
      fromRadius: 0,
      toRadius: 0,
    });
  }

  function tapWhilePlacing(x: number, y: number): void {
    canvas.dataset['lastTap'] = `place ${x},${y}`;
    if (sightOf(x, y) !== 'shown') {
      setHint(placeRefusalText('notShown'), true);
      return;
    }
    if (campAt(world, x, y) !== null) {
      setHint('A camp already stands there.', true);
      return;
    }
    // Any other target is chosen, so the preview can show why it fails, if it
    // does. The reason is said once, in the panel (review of PR #120).
    setMode({ kind: 'placing', target: { x, y } });
  }

  /**
   * Placing a camp (owner, UI rework: "When placing a camp, you should be able
   * to drag the square around the map"): a press that starts on the chosen
   * 3 x 3 grabs it, and the drag moves it, keeping the same square of it under
   * the finger. Where the new middle cannot be chosen, it stays where it was.
   */
  let grabOffset = { x: 0, y: 0 };
  function grabTarget(x: number, y: number): boolean {
    if (mode.kind !== 'placing' || mode.target === null) return false;
    const { target } = mode;
    if (Math.abs(x - target.x) > 1 || Math.abs(y - target.y) > 1) return false;
    grabOffset = { x: x - target.x, y: y - target.y };
    return true;
  }
  function dragTarget(x: number, y: number): void {
    if (mode.kind !== 'placing' || mode.target === null) return;
    const next = { x: x - grabOffset.x, y: y - grabOffset.y };
    if (next.x === mode.target.x && next.y === mode.target.y) return;
    if (sightOf(next.x, next.y) !== 'shown' || campAt(world, next.x, next.y) !== null) return;
    setMode({ kind: 'placing', target: next });
  }

  /** Mark the 3 x 3 a held press would dig (or none), for the drawing and the tests. */
  function setHeld(next: typeof held): void {
    held = next;
    canvas.dataset['digPreview'] =
      next === null ? '' : next.dug.map((d) => `${d.x},${d.y}`).join(' ');
    draw();
  }

  /** "4 squares": a count and its noun. */
  function many(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
  }

  /**
   * A long press on a lit square (owner, after the 0.21.0 build: "Long press
   * should always be mine everything possible in 3 by 3 at the expense of one
   * move for each square dug unless you have hired miners"). Held, it marks
   * the squares a dig would dig and the hint says the cost; the 3 x 3 follows
   * the finger; letting go digs, and letting go off the map does not (owner,
   * after the 0.22.0 build: "Long press, it highlights squares that will get
   * dug and tells you cost. Release and it digs."). A camp is placed from ⊕ Place.
   */
  function hold(x: number, y: number): void {
    holdOver({ x, y });
  }

  /** The held finger is over `square` (or off the map): show what a dig there would do. */
  function holdOver(square: { x: number; y: number } | null): void {
    if (square === null) {
      setHeld(null);
      setHint('Let go here to dig nothing.', false);
      return;
    }
    const { x, y } = square;
    if (sightOf(x, y) !== 'shown' || campAt(world, x, y) !== null) {
      setHeld({ x, y, dug: [] });
      setHint('Nothing round there can be dug now.', true);
      return;
    }
    const plan = digAreaPreview(world, x, y);
    setHeld({ x, y, dug: plan.dug });
    const dig = digAreaRefusal(world, x, y);
    if (dig === null) {
      setHint(
        `Release to dig ${many(plan.dug.length, 'square')} for ${many(plan.cost, 'tap')}.`,
        false,
      );
    } else if (dig === 'noTaps') {
      setHint(
        `${many(plan.dug.length, 'square')} would take ${many(plan.cost, 'tap')}: only ${world.turn.tapsLeft} left.`,
        true,
      );
    } else if (dig === 'over') {
      setHint(OVER_HINT, true);
    } else {
      setHint('Nothing round there can be dug now.', true);
    }
  }

  /** The held finger lifted over `square` (or off the map): dig there, if it can. */
  function holdEnd(square: { x: number; y: number } | null, cancelled: boolean): void {
    setHeld(null);
    if (square === null || cancelled) {
      setHint('Nothing dug.', false);
      return;
    }
    const { x, y } = square;
    if (sightOf(x, y) !== 'shown' || campAt(world, x, y) !== null) return;
    if (digAreaRefusal(world, x, y) !== null) return; // the hint already says why
    const before = world.lab.mined;
    const taps = world.turn.tapsLeft;
    remember({ kind: 'digArea', x, y });
    if (tutorial !== null && !tutorial.dugArea) setTutorial({ ...tutorial, dugArea: true });
    setWorld(digCampArea(world, x, y));
    const dug = world.lab.mined - before;
    const spent = taps - world.turn.tapsLeft;
    const who = areaCost(world.lab.counts) === null ? 'You' : 'Your miners';
    setHint(`${who} dug ${many(dug, 'square')} for ${many(spent, 'tap')}.`, false);
  }

  /** As the game, New run takes two taps: it throws the saved run away. */
  let newAskedAt = -Infinity;
  top.newWorld.addEventListener('click', () => {
    if (asGame && world.turn.status === 'active') {
      const now = performance.now();
      if (now - newAskedAt > CLOSE_CONFIRM_MS) {
        newAskedAt = now;
        top.newWorld.textContent = 'Sure?';
        setHint('Start a new run? This one is lost. Tap New run again to confirm.', true);
        window.setTimeout(() => {
          top.newWorld.textContent = 'New run';
        }, CLOSE_CONFIRM_MS);
        return;
      }
    }
    newAskedAt = -Infinity;
    if (asGame) {
      top.newWorld.textContent = 'New run';
    }
    clearPrepared();
    isPrepared = false;
    world = newCampWorld(randomSeed(Math.random));
    if (asGame) {
      saveRun(world);
    }
    history = emptyHistory(world);
    showUndo();
    lastStep.clear();
    lastFlight.clear();
    effects = [];
    mode = { kind: 'idle' };
    preview = new Set();
    setHint(HINT, false);
    showWorld();
    tellStory();
  });

  /**
   * The back story (story.ts), as the game only: told when a new run starts,
   * on the first launch and after New run. Not when a saved run is carried
   * on, nor when the address names a seed (a run opened for a look or a test).
   */
  function tellStory(): void {
    if (!asGame) return;
    showStory(root, {
      page,
      // The tutorial starts with the first run ever (not again on later runs).
      onDone: () => {
        if (tutorial === null) startTutorial();
      },
    });
  }

  function centreOnFirstCamp(): void {
    const first = world.camps[0];
    const v = view();
    const centred = centredLabCamera(CAMP_LOOK.startCells, world.lab.state.size, v);
    if (first === undefined || v.width === 0) {
      camera = centred;
      return;
    }
    const rows = rowsOf(centred, v);
    camera = clampLabCamera(
      { x: first.x + 0.5 - centred.cells / 2, y: first.y + 0.5 - rows / 2, cells: centred.cells },
      world.lab.state.size,
      v,
    );
  }

  function showWorld(): void {
    top.seedText.textContent = isPrepared
      ? `Seed ${world.lab.seed} · prepared`
      : `Seed ${world.lab.seed}`;
    tops = topBlocksOf(world.lab.state);
    sights = sightMap(world);
    centreOnFirstCamp();
    showHud();
    showCampCounter();
    showTray();
    draw();
    showTutorial();
  }

  attachLabGestures(canvas, {
    camera: () => camera,
    setCamera: (next) => {
      camera = next;
      draw();
    },
    ground: () => world.lab.state.size,
    onTap: tap,
    onHold: hold,
    onHoldMove: holdOver,
    onHoldEnd: holdEnd,
    grab: grabTarget,
    onGrabMove: dragTarget,
  });

  showUndo();
  showWorld();
  // A run saved while its market was open opens it again (a run is saved at End shift).
  openMarket();
  // A brand-new run opens with the story.
  if (saved === null && seed === null) tellStory();
}
