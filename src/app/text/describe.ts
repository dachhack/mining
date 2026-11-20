// Words for the play interface: what each choice means, and what happened
// after one was taken.
//
// Like view.ts, these functions say only what the player could know. A
// square is read only through the engine's `knownSquare`, which never answers
// for a block below a top or under a tree that was never cut.

import {
  BLOCKS,
  CAMPS,
  CREW,
  CAMP_TOOLS,
  HAZARDS,
  STRUCTURES,
  SURFACE,
  TELLS,
  blockDefByCode,
  findCampRecipe,
  findRecipe,
  itemDef,
} from '../../data';
import type { ItemStack } from '../../data';
import {
  SQUARE_STEPS,
  isSquare,
  isWorked,
  knownSquare,
  mineCheck,
  oreArmedByMine,
  scanSquares,
} from '../../engine';
import type { Action, GameEvent, GameState, KnownSquare } from '../../engine';
import { belowCellText } from '../below';
import type { LogEntry } from './log';
import { blastText, patchText, squareText } from './squares';
import { tracedSymbolsText } from './symbols';

/** "2 Stone, 1 Coal", or "nothing". */
export function stackListText(stacks: ItemStack[]): string {
  if (stacks.length === 0) {
    return 'nothing';
  }
  return stacks.map((stack) => `${stack.count} ${itemDef(stack.item).name}`).join(', ');
}

/** "ground level" or "depth 3". A square's depth is how many blocks were taken from it. */
export function depthName(depth: number): string {
  return depth === 0 ? 'ground level' : `depth ${depth}`;
}

/** What the player is told when the run is over, in words (the engine's ids are not shown). */
const RUN_END_TEXT: Record<string, string> = {
  mineClosed:
    'you closed the mine: the run ended alive, with what was in the stockpile (a "salvage" run)',
  outOfFuel: 'you ran out of fuel and the run is lost',
  // The crew lost its last health (design doc 5.3).
  buried: 'the crew was buried by a slumping pit wall and the run is lost',
  drowned: 'the crew drowned and the run is lost',
  burned: 'the crew was burned and the run is lost',
  poisoned: 'the crew was poisoned by gas and the run is lost',
};

/** How a run ended, in words. `cause` is the engine's `RunEndCause`. */
export function runEndText(cause: string): string {
  return RUN_END_TEXT[cause] ?? cause;
}

/**
 * The hazard tells a square's top block shows (design doc 3.7), as short
 * names: "damp", "pitted", "warm glow", "hairline glow". Empty for most
 * squares. The words are the minimum that lets a player read a tell; task
 * T14 gives them marks on the map.
 */
export function tellNames(square: KnownSquare): string[] {
  const names: string[] = [];
  if (square.tells.dampStone) names.push('damp');
  if (square.tells.pittedRock) names.push('pitted');
  if (square.tells.warmGlow) names.push('warm glow');
  if (square.tells.hairlineGlow) names.push('hairline glow');
  return names;
}

/**
 * What stands on a square in the open, as a short list: "6 water",
 * "9 lava (a source: it keeps pouring)", "8 gas". Empty for most squares.
 */
export function contentsNames(square: KnownSquare): string[] {
  const names: string[] = [];
  const contents = square.contents;
  if (contents.water > 0) names.push(`${contents.water} water`);
  if (contents.lava > 0) {
    names.push(
      `${contents.lava} lava${contents.lavaSource ? ' (a source: it keeps pouring)' : ''}`,
    );
  }
  if (contents.gas > 0) names.push(`${contents.gas} gas`);
  return names;
}

/** ", mineral traces, damp": what a top block shows besides itself, or "". */
function tellsSuffix(square: KnownSquare): string {
  const shown = [...(square.traces ? ['mineral traces'] : []), ...tellNames(square)];
  return shown.map((name) => `, ${name}`).join('');
}

/**
 * What the top block of the square (x, y) is and gives, as far as the player
 * knows: "Stone, mineral traces, gives 1 Stone". "ground you have not seen"
 * under a tree that was never cut.
 */
export function topBlockText(state: GameState, x: number, y: number): string {
  const square = knownSquare(state, x, y);
  if (square.top === null) {
    return square.depth >= state.size.z ? 'the bedrock floor' : 'ground you have not seen';
  }
  const block = blockDefByCode(square.top.block);
  return `${block.name}${tellsSuffix(square)}, gives ${stackListText(block.yields)}`;
}

function describeAction(state: GameState, action: Action): string {
  switch (action.type) {
    case 'mine': {
      const where = squareText(action.x, action.y);
      // An entry from a log may name a square that is not on the map; the
      // engine refuses it, but this line is worked out first.
      if (!isSquare(state, action.x, action.y)) {
        return `Mine ${where}`;
      }
      const depth = depthName(knownSquare(state, action.x, action.y).depth);
      // Near a camp a mine costs less (design doc 8); say so, so the lower
      // cost is not a puzzle.
      const check = mineCheck(state, action.x, action.y);
      const discount = check.campDiscount ?? 0;
      const cheaper = discount > 0 ? ` (${discount} AP less: near a camp)` : '';
      // The same for the drill (design doc 3.5).
      const drill = check.drillSaving ?? 0;
      const drilled = drill > 0 ? ` (${drill} AP less: you have a drill)` : '';
      const arms = oreArmedByMine(state, action.x, action.y)
        .map((ore) => squareText(ore.x, ore.y))
        .join(', ');
      const arming = arms === '' ? '' : `; ARMS the unstable ore on ${arms}`;
      return `Mine ${where} (${depth}): ${topBlockText(state, action.x, action.y)}${cheaper}${drilled}${arming}`;
    }
    case 'cutTree':
      return (
        `Cut the tree on ${squareText(action.x, action.y)}: ` +
        `gives ${stackListText(SURFACE.cutTree.yields)}; the ground under it shows`
      );
    case 'craft': {
      const fieldRecipe = findRecipe(action.recipe);
      if (fieldRecipe !== undefined) {
        return `Craft ${fieldRecipe.name} from ${stackListText(fieldRecipe.inputs)}`;
      }
      const campRecipe = findCampRecipe(action.recipe);
      if (campRecipe !== undefined) {
        return `At the camp, craft ${campRecipe.name} from ${stackListText(campRecipe.inputs)}`;
      }
      return `Craft ${action.recipe}`;
    }
    case 'closeMine':
      return 'Close the mine: ends the run alive, with what is in the stockpile';
    case 'placeSupport':
      return (
        `Place a support on ${squareText(action.x, action.y)}: ` +
        'it holds that square against slumping, and is lost if the square is mined'
      );
    case 'placeExplosive':
      return describePlaceExplosive(state, action.x, action.y);
    case 'placePump':
      return (
        `Place a pump on ${squareText(action.x, action.y)}: each shift it takes up to ` +
        `${HAZARDS.water.pumpUnitsPerShift} water from the squares within ` +
        `${HAZARDS.water.pumpReach} steps, the nearest first`
      );
    case 'placeVent':
      return (
        `Place a vent on ${squareText(action.x, action.y)}: when a shift ends it clears all the gas ` +
        `on the squares within ${HAZARDS.gas.ventReach} steps, before the gas can burn or poison`
      );
    case 'seal':
      return (
        `Seal ${squareText(action.x, action.y)}: uses up 1 sealant; a block of sealed rock goes on ` +
        'top of the square (it comes up 1 level), and the water, lava and gas on it are destroyed'
      );
    case 'scan':
      return (
        `Scan round ${squareText(action.x, action.y)}: uses up ${CAMP_TOOLS.scanChargesPerScan} ` +
        `scanner charge; shows the ${CAMP_TOOLS.scanDepth} blocks under the top block of that ` +
        'square and of the 8 squares round it'
      );
    case 'foundCamp':
      return (
        `Found a camp round ${squareText(action.x, action.y)} (${patchText(action.x, action.y)}): ` +
        `uses up 1 ${itemDef(CAMPS.kitItem).name.toLowerCase()} and takes the rest of the shift`
      );
    case 'rest':
      return (
        `Rest at the camp at ${squareText(action.x, action.y)}: takes the rest of the shift; ` +
        'crew health is back to full when the shift ends, if the camp still stands'
      );
    case 'decommissionCamp':
      return (
        `Decommission the camp at ${squareText(action.x, action.y)}: its upkeep, its recipes and ` +
        'its cheaper mining end, its squares can be mined again, and the kit is not given back'
      );
  }
}

/** The line for the choice "explosive x,y": what the charge will do, and to which squares. */
function describePlaceExplosive(state: GameState, x: number, y: number): string {
  if (!isSquare(state, x, y)) {
    return `Place an explosive on ${squareText(x, y)}`; // an entry from a log
  }
  return (
    `Place an explosive on ${squareText(x, y)}: it goes off when this shift ends and destroys ` +
    `the top block of each square of its blast (${blastText(state, x, y)}), with no yield`
  );
}

/** "placeSupport" -> "place-support": an id from src/data in the lower case a choice is typed in. */
function idInLowerCase(id: string): string {
  return id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The name of a choice: what the player types to take it. It is made from
 * the action alone, never from the cube, so it means the same at every step
 * and is safe in a chain (issue #30).
 *
 * The names:
 * - "mine 3,4": mine the top block of the square x 3, y 4;
 * - "cut 3,4": cut the tree on that square;
 * - "support 3,4": place a support on that square;
 * - "camp 3,4": found a camp whose centre square that is;
 * - "rest 3,4", "decommission 3,4": the camp centred on that square;
 * - "pump 3,4", "vent 3,4", "seal 3,4", "scan 3,4": a camp-made tool, used
 *   on that square;
 * - craft-fuel, craft-support, ...: "craft-" and the recipe;
 * - close-mine, and end for "end the shift".
 */
export function choiceName(entry: LogEntry): string {
  switch (entry.type) {
    case 'endShift':
      return 'end';
    case 'mine':
      return `mine ${entry.x},${entry.y}`;
    case 'cutTree':
      return `cut ${entry.x},${entry.y}`;
    case 'craft':
      return `craft-${idInLowerCase(entry.recipe)}`;
    case 'closeMine':
      return 'close-mine';
    case 'placeSupport':
      return `support ${entry.x},${entry.y}`;
    case 'placeExplosive':
      return `explosive ${entry.x},${entry.y}`;
    case 'placePump':
      return `pump ${entry.x},${entry.y}`;
    case 'placeVent':
      return `vent ${entry.x},${entry.y}`;
    case 'seal':
      return `seal ${entry.x},${entry.y}`;
    case 'scan':
      return `scan ${entry.x},${entry.y}`;
    case 'foundCamp':
      return `camp ${entry.x},${entry.y}`;
    case 'rest':
      return `rest ${entry.x},${entry.y}`;
    case 'decommissionCamp':
      return `decommission ${entry.x},${entry.y}`;
  }
}

/**
 * The words for a choice: a line of the action list, and the start of the
 * line that says what was done (`takeTurn`). Describe the choice in the state
 * before it is taken.
 */
export function describeChoice(state: GameState, entry: LogEntry): string {
  if (entry.type === 'endShift') {
    return 'End the shift';
  }
  return describeAction(state, entry);
}

/** The display name of the structure with this code. */
function structureNameByCode(code: number): string {
  for (const def of Object.values(STRUCTURES)) {
    if (def.code === code) {
      return def.name.toLowerCase();
    }
  }
  return 'structure';
}

const GAUGE_REASONS: Record<string, string> = {
  upkeep: 'the shift',
  crafted: 'crafted',
};

/**
 * The kinds of hazard that hurt the crew, in words (design doc 5.2). The
 * keys are the engine's `DamageCause`; a cause not listed is shown by its id.
 */
const DAMAGE_CAUSES: Record<string, string> = {
  slump: 'a slumping pit wall',
  water: 'water',
  lava: 'lava',
  gas: 'gas',
  gasExplosion: 'a gas explosion',
  explosion: 'an explosion',
};

/**
 * How a structure was lost, in words. The keys are the engine's
 * `DestructionCause`; a cause not listed reads "was destroyed".
 */
const DESTRUCTION_CAUSES: Record<string, string> = {
  rockfall: 'was buried or carried off by a slump and is lost',
  mined: 'went with the block and is lost',
  lava: 'was destroyed by lava',
  water: 'was destroyed by water',
  explosion: 'was destroyed by an explosion',
};

/** The event types of step (b) of the cube phase that `describeFlows` words. */
const FLOW_EVENT_TYPES = ['fluidMoved', 'fluidRemoved', 'lavaPoured', 'stoneFormed'];

/** True for an event that `describeFlows` words. */
function isFlowEvent(event: GameEvent): boolean {
  return FLOW_EVENT_TYPES.includes(event.type);
}

/**
 * What water and lava did in a cube phase, or will do in the coming one
 * (design doc 6.3 and 6.4), as sentences. `events` are engine events:
 * the ones a step emitted, or `ShiftForecast.flows`. `coming` is true for the
 * forecast, which is worded as what will happen. Empty when nothing flows.
 *
 * One sentence for each fluid's moves ("Water flowed: x2 y3 to x2 y4 (2
 * units); ..."), then what the pumps took, what drained at ground level, what
 * a source poured, and where water met lava. (The pumps act before the water
 * flows; the moves are said first because they are what threatens.)
 */
export function describeFlows(events: GameEvent[], coming: boolean): string[] {
  const sentences: string[] = [];

  // The moves, counted for each pair of squares, in the order first seen.
  for (const fluid of ['water', 'lava'] as const) {
    const counts = new Map<string, number>();
    for (const event of events) {
      if (event.type === 'fluidMoved' && event.fluid === fluid) {
        const key =
          `${squareText(event.from.x, event.from.y)} to ` + squareText(event.to.x, event.to.y);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    if (counts.size === 0) {
      continue;
    }
    const parts: string[] = [];
    for (const [key, count] of counts) {
      parts.push(count === 1 ? key : `${key} (${count} units)`);
    }
    const name = fluid === 'water' ? 'Water' : 'Lava';
    const verb = coming ? `${name.toUpperCase()} WILL FLOW` : `${name} flowed`;
    sentences.push(`${verb}: ${parts.join('; ')}.`);
  }

  // Pumps (design doc 6.3): what they took, square by square.
  const pumped: string[] = [];
  for (const event of events) {
    if (event.type === 'fluidRemoved' && event.reason === 'pumped') {
      pumped.push(`${event.units} from ${squareText(event.pos.x, event.pos.y)}`);
    }
  }
  if (pumped.length > 0) {
    sentences.push(
      coming
        ? `The pumps will take water: ${pumped.join('; ')}.`
        : `The pumps took water: ${pumped.join('; ')}.`,
    );
  }

  // Stone: how many blocks formed on each square.
  const stone = new Map<string, number>();
  for (const event of events) {
    if (event.type === 'stoneFormed') {
      const key = squareText(event.pos.x, event.pos.y);
      stone.set(key, (stone.get(key) ?? 0) + 1);
    }
  }

  for (const event of events) {
    if (event.type === 'lavaPoured') {
      const where = squareText(event.pos.x, event.pos.y);
      sentences.push(
        coming
          ? `The lava source on ${where} will pour ${event.units} more lava.`
          : `The lava source on ${where} poured ${event.units} more lava.`,
      );
    } else if (event.type === 'fluidRemoved' && event.reason === 'reachedSurface') {
      const where = squareText(event.pos.x, event.pos.y);
      sentences.push(
        coming
          ? `${event.units} ${event.fluid} on ${where} stands above ground level and will drain away.`
          : `${event.units} ${event.fluid} on ${where} stood above ground level and drained away.`,
      );
    }
  }
  for (const [where, blocks] of stone) {
    const raised = blocks === 1 ? '1 level' : `${blocks} levels`;
    sentences.push(
      coming
        ? `Water will meet lava on ${where}: they turn to stone, and the square comes up ${raised}.`
        : `Water met lava on ${where}: they turned to stone, and the square came up ${raised}.`,
    );
  }
  return sentences;
}

/**
 * What the coming cube phase will do with water and lava, for the "If you
 * end the shift now" line: `describeFlows`, and what the lava will destroy.
 * `flows` is `ShiftForecast.flows`.
 */
export function describeForecastFlows(flows: GameEvent[]): string[] {
  const sentences = describeFlows(flows, true);
  for (const event of flows) {
    if (event.type === 'structureDestroyed') {
      sentences.push(
        `The ${structureNameByCode(event.structure)} on ${squareText(event.pos.x, event.pos.y)} ` +
          `will be destroyed by ${event.cause}.`,
      );
    } else if (event.type === 'campDestroyed') {
      const fluid = event.cause === 'lava' ? 'LAVA' : 'WATER';
      sentences.push(`THE ${fluid} DESTROYS THE CAMP at ${squareText(event.pos.x, event.pos.y)}.`);
    }
  }
  return sentences;
}
// ---------------------------------------------------------------------------
// Gas and explosions (design doc 6.5 and 6.6; issue #103)
// ---------------------------------------------------------------------------

/** "x3 y4, x4 y4": the squares an `exploded` event names. */
function explodedSquaresText(event: Extract<GameEvent, { type: 'exploded' }>): string {
  return event.cells.map((cell) => squareText(cell.x, cell.y)).join(', ');
}

/** "1 chance in 2": the probability that a blast destroys a relic or keystone. */
function chanceText(): string {
  const percent = Math.round(HAZARDS.explosion.chanceBlockDestroyed * 100);
  return `${percent} chances in 100`;
}

/**
 * What the crew loses to the explosion `event`, from the squares it worked
 * this shift, or 0: a charge or ore hurts when its blast includes a worked
 * square, a gas explosion on a worked square or beside one (design doc 5.2).
 * The worked squares are the player's own actions, so this tells nothing
 * hidden.
 */
function explosionDamage(
  state: GameState,
  event: Extract<GameEvent, { type: 'exploded' }>,
): number {
  for (const cell of event.cells) {
    if (!isSquare(state, cell.x, cell.y)) {
      continue;
    }
    if (isWorked(state, cell.x, cell.y)) {
      return event.kind === 'gas' ? CREW.damage.gasExplosion : CREW.damage.explosion;
    }
    if (event.kind !== 'gas') {
      continue;
    }
    for (const step of SQUARE_STEPS) {
      const x = cell.x + step.dx;
      const y = cell.y + step.dy;
      if (isSquare(state, x, y) && isWorked(state, x, y)) {
        return CREW.damage.gasExplosion;
      }
    }
  }
  return 0;
}

/**
 * What step (c) of the coming cube phase will do, for the "If you end the
 * shift now" line: where gas will reach, what goes off, what each explosion
 * destroys, and whether the crew is in it. `gas` is `ShiftForecast.gas`;
 * `state` is the state the forecast was made from, read only through
 * `knownSquare` and the worked squares.
 */
export function describeForecastGas(state: GameState, gas: GameEvent[]): string[] {
  const sentences: string[] = [];
  // What the vents will clear comes first: it is the good news, and it
  // explains why gas that "will spread" below is not there afterwards.
  if (gas.some((event) => event.type === 'gasRemoved' && event.reason === 'vented')) {
    sentences.push(`The vents will clear gas: ${ventedText(gas)}.`);
  }

  // Gas: only the squares it has not reached yet. Settled gas goes on
  // shifting a unit or two between level squares for ever; saying so every
  // shift would bury the news.
  const reached = new Map<string, number>();
  for (const event of gas) {
    if (
      event.type === 'gasMoved' &&
      knownSquare(state, event.to.x, event.to.y).contents.gas === 0
    ) {
      const key = squareText(event.to.x, event.to.y);
      reached.set(key, (reached.get(key) ?? 0) + event.units);
    }
  }
  if (reached.size > 0) {
    const parts: string[] = [];
    for (const [where, units] of reached) {
      parts.push(`${where} (${units})`);
    }
    sentences.push(`GAS WILL SPREAD onto: ${parts.join(', ')}.`);
  }

  const destroyed: string[] = [];
  for (const event of gas) {
    switch (event.type) {
      case 'exploded': {
        const where = squareText(event.pos.x, event.pos.y);
        const damage = explosionDamage(state, event);
        const crew = damage > 0 ? ` THE CREW WORKED THERE: it loses ${damage} health.` : '';
        if (event.kind === 'explosive') {
          sentences.push(
            `THE EXPLOSIVE on ${where} GOES OFF: its blast covers ${explodedSquaresText(event)} ` +
              `and destroys their top blocks, with no yield.${crew}`,
          );
        } else if (event.kind === 'unstableOre') {
          sentences.push(
            `THE UNSTABLE ORE on ${where} GOES OFF: the ore is destroyed, and its blast covers ` +
              `${explodedSquaresText(event)}.${crew}`,
          );
        } else {
          sentences.push(
            `GAS EXPLODES on ${explodedSquaresText(event)}: the gas burns off, and what is ` +
              `placed on those squares and beside them is destroyed.${crew}`,
          );
        }
        break;
      }
      case 'blockMayBeDestroyed':
        sentences.push(
          `The ${blockDefByCode(event.block).name} on ${squareText(event.pos.x, event.pos.y)} is in ` +
            `the blast: it may be destroyed (${chanceText()}), and is otherwise left in place.`,
        );
        break;
      case 'treeDestroyed':
        destroyed.push(`the tree on ${squareText(event.pos.x, event.pos.y)}`);
        break;
      case 'structureDestroyed':
        destroyed.push(
          `the ${structureNameByCode(event.structure)} on ${squareText(event.pos.x, event.pos.y)}`,
        );
        break;
      case 'campDestroyed':
        sentences.push(
          `THE EXPLOSION DESTROYS THE CAMP at ${squareText(event.pos.x, event.pos.y)}.`,
        );
        break;
      default:
        break;
    }
  }
  if (destroyed.length > 0) {
    sentences.push(`The explosion will destroy ${destroyed.join(', ')}.`);
  }
  return sentences;
}

/**
 * The squares gas spread onto in a step, which had none before: "x3 y4 (2)".
 * `after` is the state the step led to. A square is new when all the gas now
 * on it arrived in this step. (Gas that reached a square and burnt in the
 * same step is not listed: the explosion is what the player is told.)
 */
function gasReachedText(after: GameState, events: GameEvent[]): string[] {
  const arrived = new Map<string, { x: number; y: number; units: number }>();
  for (const event of events) {
    if (event.type === 'gasMoved') {
      const key = `${event.to.x},${event.to.y}`;
      const entry = arrived.get(key) ?? { x: event.to.x, y: event.to.y, units: 0 };
      entry.units += event.units;
      arrived.set(key, entry);
    }
  }
  const parts: string[] = [];
  for (const entry of arrived.values()) {
    if (knownSquare(after, entry.x, entry.y).contents.gas === entry.units) {
      parts.push(`${squareText(entry.x, entry.y)} (${entry.units})`);
    }
  }
  return parts;
}

/** What destroyed a camp, in words. The keys are the engine's `DestructionCause`. */
const CAMP_DESTRUCTION_CAUSES: Record<string, string> = {
  rockfall: 'a slump reached one of its squares',
  water: 'water entered one of its squares',
  lava: 'lava entered one of its squares',
  explosion: 'an explosion reached it',
};

/** "it falls at the end of this shift" / "... of the next shift" / "... in 3 shifts". */
export function crackFallsText(shown: number): string {
  if (shown <= 1) {
    return 'it falls at the end of this shift';
  }
  if (shown === 2) {
    return 'it falls at the end of the next shift';
  }
  return `it falls at the end of the shift ${shown - 1} shifts from now`;
}

/**
 * What the coming cube phase will do to the pit walls, as sentences for the
 * "If you end the shift now" line. `slumps` is `ShiftForecast.slumps`: the
 * events step (a) would emit. Empty when nothing will slump or crack.
 */
export function describeForecastSlumps(slumps: GameEvent[]): string[] {
  const falls: string[] = [];
  const cracks: string[] = [];
  const campsLost: string[] = [];
  for (const event of slumps) {
    if (event.type === 'blockFell') {
      falls.push(
        `${squareText(event.from.x, event.from.y)} onto ${squareText(event.to.x, event.to.y)}`,
      );
    } else if (event.type === 'blockCracked') {
      cracks.push(squareText(event.pos.x, event.pos.y));
    } else if (event.type === 'campDestroyed') {
      campsLost.push(squareText(event.pos.x, event.pos.y));
    }
  }
  const sentences: string[] = [];
  if (falls.length > 0) {
    sentences.push(`THE PIT WALL SLUMPS: ${falls.join('; ')}.`);
  }
  if (campsLost.length > 0) {
    sentences.push(`THE SLUMP DESTROYS THE CAMP at ${campsLost.join(', ')}.`);
  }
  if (cracks.length > 0) {
    sentences.push(
      `New cracks (unstable squares): ${cracks.join(', ')}; each falls at the end of the shift after next unless it is supported or made stable.`,
    );
  }
  return sentences;
}

/**
 * What the player now sees on top of the square (x, y) of `after`, as a
 * sentence: "The top block there is now Coal seam (depth 2)."
 */
function newTopText(after: GameState, x: number, y: number): string {
  const square = knownSquare(after, x, y);
  if (square.top === null) {
    return `Nothing is left there: ${squareText(x, y)} is at the bedrock floor.`;
  }
  const block = blockDefByCode(square.top.block);
  const shown = [...(square.traces ? ['mineral traces'] : []), ...tellNames(square)];
  const withTells = shown.length > 0 ? `, with ${shown.join(', ')}` : '';
  return `The top block there is now ${block.name}${withTells} (${depthName(square.depth)}).`;
}

/**
 * The sentence for a mine that broke into a cavern or a pocket (design doc
 * 6.2). `event` is the engine's `spaceCollapsed` event. `Extract<...>` picks
 * that one shape out of the list of all events.
 */
function spaceCollapsedText(event: Extract<GameEvent, { type: 'spaceCollapsed' }>): string {
  const out: string[] = [];
  if (event.water > 0) out.push(`${event.water} water`);
  if (event.lava > 0) out.push(`${event.lava} lava`);
  if (event.gas > 0) out.push(`${event.gas} gas`);
  if (out.length === 0) {
    return "It was the roof of an empty cavern, which fell in: the square's new top is rubble.";
  }
  const source = event.lavaSource ? ' The lava is a source: it keeps pouring.' : '';
  return (
    `It was the roof of a pocket, which fell in: the square's new top is rubble, and ` +
    `${out.join(', ')} came out and now stands on the square.${source}`
  );
}

/**
 * What happened in one step, as short sentences. `after` is the state the
 * step led to; it is read only through `knownSquare`, to say what a square
 * shows now.
 */
export function describeEvents(after: GameState, events: GameEvent[]): string[] {
  const lines: string[] = [];
  // Said once for a step, however many blocks it was seen on.
  let tracesSaid = false;
  const tracesLine = tracesSeenText(events);
  // A space that collapsed says what the new top is itself.
  const roofFell = events.some((event) => event.type === 'spaceCollapsed');
  // Water and lava: all of a step's flow is said together, where it began.
  let flowsSaid = false;
  // The same for gas reaching new squares, and for the blocks a blast took.
  let gasSaid = false;
  let blastedSaid = false;
  // Vented gas: said once for a step.
  let ventedSaid = false;
  for (const event of events) {
    if (isFlowEvent(event)) {
      if (!flowsSaid) {
        lines.push(...describeFlows(events, false));
        flowsSaid = true;
      }
      continue;
    }
    switch (event.type) {
      case 'damageTaken':
        lines.push(
          `The crew lost ${event.amount} health to ${DAMAGE_CAUSES[event.cause] ?? event.cause} where it worked this shift (crew health is now ${event.health}).`,
        );
        break;
      case 'blockMined':
        lines.push(`Mined ${blockDefByCode(event.block).name}.`);
        if (!roofFell) {
          lines.push(newTopText(after, event.pos.x, event.pos.y));
        }
        break;
      case 'spaceCollapsed':
        lines.push(spaceCollapsedText(event));
        break;
      case 'blockRevealed':
        // The map shows what is newly known.
        break;
      case 'mineralTracesSeen':
        if (!tracesSaid) {
          lines.push(tracesLine);
          tracesSaid = true;
        }
        break;
      case 'itemGained':
        // Every yield goes straight into the stockpile (design doc 4.1).
        lines.push(`Got ${event.count} ${itemDef(event.item).name}.`);
        break;
      case 'structurePlaced': {
        // "a support", "an explosive".
        const name = structureNameByCode(event.structure);
        const article = /^[aeiou]/.test(name) ? 'an' : 'a';
        lines.push(`Placed ${article} ${name}.`);
        break;
      }
      case 'cellSealed':
        lines.push(sealedText(after, event.pos.x, event.pos.y, events));
        break;
      case 'scanned':
        lines.push(...scannedLines(after, event.x, event.y, event.cells));
        break;
      case 'structureDestroyed':
        lines.push(
          `The ${structureNameByCode(event.structure)} on ${squareText(event.pos.x, event.pos.y)} ` +
            `${DESTRUCTION_CAUSES[event.cause] ?? 'was destroyed'}.`,
        );
        break;
      case 'blockCracked':
        // `timer + 1` is the number shown on the block: 1 means "this shift".
        lines.push(
          `${squareText(event.pos.x, event.pos.y)} is cracked (${blockDefByCode(event.block).name}): ` +
            `${crackFallsText(event.timer + 1)}, unless it is made stable or supported first.`,
        );
        break;
      case 'blockFell':
        lines.push(
          `The pit wall slumped: the ${blockDefByCode(event.block).name} on ` +
            `${squareText(event.from.x, event.from.y)} slid down onto ` +
            `${squareText(event.to.x, event.to.y)} and lies there as rubble.`,
        );
        break;
      case 'crafted': {
        const recipe = findRecipe(event.recipe) ?? findCampRecipe(event.recipe);
        lines.push(`Crafted ${recipe?.name ?? event.recipe}.`);
        break;
      }
      case 'campFounded':
        lines.push(
          `The camp stands on ${patchText(event.pos.x, event.pos.y)} (${depthName(event.pos.z)}). ` +
            'Its squares cannot be mined; mining near it is cheaper; camp recipes are on the list; ' +
            `"rest ${event.pos.x},${event.pos.y}" restores crew health.`,
        );
        break;
      case 'restStarted':
        lines.push(
          `The crew rests at the camp at ${squareText(event.pos.x, event.pos.y)} for the rest of the shift. ` +
            "The camp's squares count as worked this shift: a hazard that reaches them hurts the crew.",
        );
        break;
      case 'healthRestored':
        lines.push(`The crew rested: health +${event.amount}, now ${event.health}.`);
        break;
      case 'campDestroyed':
        lines.push(
          `THE CAMP at ${squareText(event.pos.x, event.pos.y)} IS DESTROYED: ` +
            `${CAMP_DESTRUCTION_CAUSES[event.cause] ?? 'a hazard reached it'}. It is lost, with its kit.`,
        );
        break;
      case 'campDecommissioned':
        lines.push(
          `The camp at ${squareText(event.pos.x, event.pos.y)} is taken down. Its squares can be mined again.`,
        );
        break;
      case 'shiftEnded':
        lines.push(`Shift ${event.shift} ended; shift ${event.nextShift} begins.`);
        break;
      case 'fuelChanged':
        lines.push(
          `Fuel ${signed(event.delta)} (${GAUGE_REASONS[event.reason] ?? event.reason}), now ${event.fuel}.`,
        );
        break;
      case 'runEnded':
        // The view that follows opens with the outcome.
        break;
      case 'oreArmed':
        lines.push(
          `MINING BESIDE IT ARMED THE UNSTABLE ORE on ${squareText(event.pos.x, event.pos.y)}: ` +
            `it goes off when this shift ends, and its blast covers ` +
            `${blastText(after, event.pos.x, event.pos.y)}. Mining the ore itself now is safe, and yields.`,
        );
        break;
      case 'gasMoved':
        if (!gasSaid) {
          gasSaid = true;
          const reached = gasReachedText(after, events);
          if (reached.length > 0) {
            lines.push(`Gas spread onto: ${reached.join(', ')}.`);
          }
        }
        break;
      case 'gasRemoved':
        // Burnt gas is said by its explosion. Vented gas is said once for
        // the step, at its first event.
        if (event.reason === 'vented') {
          if (!ventedSaid) {
            ventedSaid = true;
            lines.push(`The vents cleared gas: ${ventedText(events)}.`);
          }
        } else if (event.reason === 'reachedSurface') {
          lines.push(
            `${event.units} gas on ${squareText(event.pos.x, event.pos.y)} came up to ground level and blew away.`,
          );
        }
        break;
      case 'exploded': {
        const where = squareText(event.pos.x, event.pos.y);
        if (event.kind === 'explosive') {
          lines.push(
            `THE EXPLOSIVE on ${where} WENT OFF: its blast covered ${explodedSquaresText(event)}.`,
          );
        } else if (event.kind === 'unstableOre') {
          lines.push(
            `THE UNSTABLE ORE on ${where} WENT OFF: its blast covered ${explodedSquaresText(event)}.`,
          );
        } else {
          lines.push(`GAS EXPLODED on ${explodedSquaresText(event)}: the gas there burnt off.`);
        }
        break;
      }
      case 'blockDestroyed':
        if (!blastedSaid) {
          blastedSaid = true;
          const blocks: string[] = [];
          for (const other of events) {
            if (other.type === 'blockDestroyed') {
              blocks.push(
                `${blockDefByCode(other.block).name} on ${squareText(other.pos.x, other.pos.y)}`,
              );
            }
          }
          lines.push(`Destroyed, with no yield: ${blocks.join(', ')}.`);
        }
        break;
      case 'blockSurvivedBlast':
        lines.push(
          `The ${blockDefByCode(event.block).name} on ${squareText(event.pos.x, event.pos.y)} ` +
            'was in the blast and survived: it is still there.',
        );
        break;
      case 'blockMayBeDestroyed':
        // Only in a forecast: `describeForecastGas` words it.
        break;
      case 'treeDestroyed':
        lines.push(
          `The blast destroyed the tree on ${squareText(event.pos.x, event.pos.y)}: no timber, and no stump.`,
        );
        break;
      case 'treeCut':
        lines.push(
          `You cut down the tree; a stump is left. ${newTopText(after, event.pos.x, event.pos.y)}`,
        );
        break;
      case 'treeGrew':
        lines.push(`A tree grew back on the stump at ${squareText(event.pos.x, event.pos.y)}.`);
        break;
    }
  }
  return lines;
}

/** "4 from x3 y4; 2 from x4 y4": what the vents cleared, from a step's events. */
function ventedText(events: GameEvent[]): string {
  const parts: string[] = [];
  for (const event of events) {
    if (event.type === 'gasRemoved' && event.reason === 'vented') {
      parts.push(`${event.units} from ${squareText(event.pos.x, event.pos.y)}`);
    }
  }
  return parts.join('; ');
}

/**
 * The sentence for a square that was sealed (design doc 7.2): the new top,
 * and what the sealant destroyed, read from the step's own events.
 */
function sealedText(after: GameState, x: number, y: number, events: GameEvent[]): string {
  const destroyed: string[] = [];
  for (const event of events) {
    if (event.type === 'fluidRemoved' && event.reason === 'sealed') {
      destroyed.push(`${event.units} ${event.fluid}`);
    } else if (event.type === 'gasRemoved' && event.reason === 'sealed') {
      destroyed.push(`${event.units} gas`);
    }
  }
  const gone = destroyed.length === 0 ? '' : ` The ${destroyed.join(', ')} on it is destroyed.`;
  const depth = depthName(knownSquare(after, x, y).depth);
  return `Sealed ${squareText(x, y)}: its top block is now sealed rock (${depth}).${gone}`;
}

/**
 * The lines for a scan (design doc 7.2): how much is newly known, then what
 * is now known under the top of each square of the patch, from the top down.
 * Read through `knownSquare`, so only revealed cells are named.
 */
function scannedLines(after: GameState, x: number, y: number, cells: number): string[] {
  const lines = [
    `Scanned round ${squareText(x, y)}: ${cells} ${cells === 1 ? 'block is' : 'blocks are'} newly known.`,
  ];
  for (const square of scanSquares(after, x, y)) {
    const known = knownSquare(after, square.x, square.y);
    if (known.below.length === 0) {
      continue;
    }
    const cellsText = known.below.map((cell) => `depth ${cell.z} ${belowCellText(cell)}`);
    lines.push(`  under ${squareText(square.x, square.y)}: ${cellsText.join('; ')}`);
  }
  return lines;
}

/**
 * The sentence for a step in which mineral traces were first seen.
 *
 * The engine notes traces after the action is done (`applyAction`: the mine,
 * then reveal, then traces). So when a step mines an ore and traces are then
 * noticed on the rock it uncovered, the mined ore is already gone from the
 * cube: those traces come from OTHER ore, still in the rock. The sentence
 * says so, because a player may otherwise take them for traces of the ore
 * just mined (issue #47 item 6; review of PR #48). Only the step's events are
 * read: which block was mined, and that traces were seen.
 */
function tracesSeenText(events: GameEvent[]): string {
  const onMap = `(On the map: ${tracedSymbolsText()}.)`;
  const oreNames: string[] = TELLS.mineralTraces.sourceBlocks;
  const minedOre = events.some(
    (event) => event.type === 'blockMined' && oreNames.includes(blockIdByCode(event.block)),
  );
  if (minedOre) {
    return (
      'You notice mineral traces in the rock this uncovered: other ore is near ' +
      `(the ore you just mined no longer counts). ${onMap}`
    );
  }
  return `You notice mineral traces in the rock: ore is near. ${onMap}`;
}

/** The id in src/data of the block with this code ("ironOre"), or '' if there is none. */
function blockIdByCode(code: number): string {
  for (const [blockId, def] of Object.entries(BLOCKS)) {
    if (def.code === code) {
      return blockId;
    }
  }
  return '';
}

/** "+3" or "-1". */
function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
