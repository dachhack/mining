// Rules that must hold after every step of every run of the new game,
// whatever the player does (plan B3, the acceptance check). `checkStep`
// compares the state before and after one step and returns a sentence for
// every broken rule. It reads the state only through the engine's public
// surface.
//
// What it checks:
// - TAPS: an action that did something costs exactly 1 tap (End shift, rest
//   and close cost none); taps stay between 0 and a shift's; a refused action
//   changes nothing at all.
// - THE LEVEL RULE: a mined square went down exactly 1 level, and is no more
//   than 1 level below any neighbour.
// - HARDNESS: a mined block is in the list of a camp level no higher than
//   the best camp over it, or, if no level lists it, a camp covers it and a
//   tool in the store lists it (FRONTIER_TOOLS). No camp is above the top
//   level.
// - CAMPS STAND HIGH: a newly placed camp's ground is no deeper than
//   FRONTIER_CAMP_PLACE.maxDepth.
// - SHIFTS AND HEALTH: the shift number goes up by exactly 1 at End shift and
//   rest; health stays between 0 and full; a run at 0 health is lost; a run
//   that has ended stays ended.
// - THE INVENTORY: only whole counts above 0.
// - CAMPS: ids are different; no two 3 x 3 footprints overlap; every camp
//   stands on level ground.
// - SIGHT: what has been seen only grows, and every lit square has been seen.
// - THE SURFACE: animals stand on open ground at ground level, never two on
//   a square; an apple tree holds 0 to a full tree's apples, nothing else
//   holds any; a square waits to regrow only as a bare apple tree or a stump
//   (a felled tree, with nothing growing on it, on ground never mined), and
//   every stump waits;
//   nothing grows on a camp's ground.
// - SMELTERS: only at camps of FRONTIER_SMELTER.minLevel or more.
// - LANTERNS: hung ones came from the store: a camp gains a lantern only as
//   one lantern leaves the store.
// - PENS: a camp without a pen holds no animals in one; a pen holds 0 to
//   FRONTIER_PEN.capacity; animals put in or taken out move between the
//   pen and the store one at a time; a breeding count runs only while the
//   pen may breed.
// - CONTRACTS: one is taken only while the market is open, from that day's
//   board, while fewer are held than the best camp's level and not that
//   one already; filling one (only while the market is open, from the
//   board) and delivering pay its coins and take its items, and
//   counts one more done for its tier; the counts done never fall.
// - FARMING: a planted sapling is a waiting stump on unmined dirt; cut grass
//   waits only on a square with nothing growing on it; a planting takes one
//   sapling from the store.
// - THE MARKET AND THE RUN'S END: a trade happens only on a market day
//   (worked out here from the data), in a lot open at the best camp's
//   level, gives up and gets exactly a whole
//   number of lots at its price, and changes nothing else in the store; a
//   run is 'finished' only by the End shift or rest of its last shift, and
//   no shift past the last is ever played.
// - RAIN: a square's depth changes without a mining tap only at End shift
//   or rest, by 1 block, at a low spot that is not a camp's ground or
//   flooded; the level rule holds everywhere after the night.
// - WATER: a flooded square is never mined, never a camp's ground; squares
//   become flooded only by a mining tap, at FRONTIER_WATER.fromDepth or
//   deeper, at most FRONTIER_WATER.maxSquares at once; they dry only at the
//   night, at most FRONTIER_PUMP.drainPerShift a pump; a pump always stands
//   on a flooded square, and pumps set plus pumps held change only by a
//   trade.
// - GAS AND FIRE: on a mining tap, squares other than the one mined change
//   depth only if gas exploded, only within FRONTIER_GAS.blastRadius, by 1,
//   and the level rule holds everywhere after; a fire starts only by a blast
//   (within FRONTIER_GAS.fireRadius) or at night beside a fire or a dragon,
//   and only on something that can burn; a tap puts out exactly the fire it is on; at
//   night every fire burning before goes out, leaving nothing growing (a
//   stump may wait to grow back).
// - DRAGONS: never more than FRONTIER_DRAGON.most, always on the map; one
//   comes only at night, at the edge, from FRONTIER_DRAGON.fromShift; they
//   move at night (at most FRONTIER_DRAGON.steps squares) and, in the day,
//   only on a step that spent taps (an attack: to anywhere on the map); one leaves
//   only by a tap on it with a sword held, and the sword stays.
// - RAIDS AND DEFENSES: a camp's defenses stay between 0 and
//   FRONTIER_DEFENSE.length, go up only by buildDefense, 1 level, and never
//   come down; a camp loses a level only at night (fire or a raid); the
//   night never takes coins.

import { BLOCKS } from '../src/data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_CAMP_PLACE,
  FRONTIER_CONTRACTS,
  FRONTIER_DEEP_CAMP,
  FRONTIER_DEFENSE,
  FRONTIER_DRAGON,
  FRONTIER_GAS,
  FRONTIER_TOOLS,
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
  FRONTIER_PEN,
  FRONTIER_PUMP,
  FRONTIER_RUN,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
  FRONTIER_WATER,
} from '../src/data/frontier';
import {
  SQUARE_STEPS,
  campAt,
  contractBoard,
  coverLevelAt,
  coverLevels,
  depthAt,
  isLevelPatch,
  isSquare,
  previewTap,
  topBlockAt,
} from '../src/engine';
import { areaCost, digAreaPlan, frontierAct, hashFrontier, tapsPerShift } from '../src/engine';
import type { FrontierOutcome, FrontierState } from '../src/engine';
import { NO_FEATURE, cropOf, isTree } from '../src/engine/frontier/state';
import { fullCrop } from '../src/engine/frontier/surface';
import type { FrontierStep } from './frontierRun';

/** Every broken rule in going from `before` to `outcome.state` by `step`. Empty if none. */
export function checkStep(
  before: FrontierState,
  step: FrontierStep,
  outcome: FrontierOutcome,
): string[] {
  const after = outcome.state;
  const problems: string[] = [];
  const say = (text: string): void => {
    problems.push(`shift ${before.shift}, "${step}": ${text}`);
  };
  const verb = step.split(' ')[0] ?? '';
  const endsShift = verb === 'endShift' || verb === 'rest';

  // The miners' dig of a 3 x 3 (owner, after the 0.20.0 build): it must be
  // the mining taps it stands for, one after another, each checked as a tap,
  // for the lesser of the crew's cost and the squares dug.
  if (verb === 'digArea' && outcome.done) {
    const [cx, cy] = (step.split(' ')[1] ?? '').split(',').map(Number);
    const plan = digAreaPlan(before, cx ?? -1, cy ?? -1);
    // A tap a square, or with 2 or more miners their cap (crew.ts).
    const most = areaCost(before.inventory) ?? Infinity;
    if (plan.dug.length === 0) say('dug a 3 x 3 that had nothing to dig');
    if (plan.cost !== Math.min(most, plan.dug.length)) say(`a dig cost ${plan.cost}`);
    if (after.tapsLeft !== before.tapsLeft - plan.cost)
      say(`taps went from ${before.tapsLeft} to ${after.tapsLeft} for a dig costing ${plan.cost}`);
    if (hashFrontier({ ...plan.state, tapsLeft: after.tapsLeft }) !== hashFrontier(after))
      say('the dig is not the taps it stands for');
    let s = { ...before, tapsLeft: FRONTIER_SHIFT.taps };
    for (const sq of plan.dug) {
      const tapStep = `tap ${sq.x},${sq.y}`;
      const out = frontierAct(s, { kind: 'tap', x: sq.x, y: sq.y });
      for (const p of checkStep(s, tapStep, out)) problems.push(`${p} (in "${step}")`);
      s = out.state;
    }
    return problems;
  }

  // A tap does what previewTap said it would (policies and views rely on it).
  if (verb === 'tap') {
    const [x, y] = (step.split(' ')[1] ?? '').split(',').map(Number);
    const said = previewTap(before, x ?? -1, y ?? -1).kind;
    const did =
      outcome.tap?.kind ??
      (outcome.refusal === 'noTaps' || outcome.refusal === 'over' ? said : 'none');
    if (said !== did) say(`previewTap said "${said}", the tap did "${did}"`);
  }

  // Taps.
  if (!outcome.done) {
    if (after !== before) say('a refused action changed the state');
    return problems;
  }
  if (endsShift) {
    // A shift's taps, more with miners (crew.ts), less FRONTIER_SHIFT.tapsLostPerUnpaid
    // for each item of upkeep the night could not pay (shift.ts).
    // (`unpaid` merges like items: 2 wood unpaid is one stack of 2.)
    const unpaidItems = (outcome.report?.unpaid ?? []).reduce((n, st) => n + st.count, 0);
    const lost = unpaidItems * FRONTIER_SHIFT.tapsLostPerUnpaid;
    const due = Math.max(0, tapsPerShift(after.inventory) - lost);
    if (after.tapsLeft !== due && after.status === 'active')
      say(`a new shift has ${after.tapsLeft} taps, not ${due}`);
  } else if (before.marketOpen) {
    // Market actions cost no taps (market.ts).
    if (after.tapsLeft !== before.tapsLeft) say(`a market action changed the taps`);
  } else if (verb === 'digArea') {
    // Its own cost, checked above.
  } else if (verb === 'deliver' || verb === 'dropContract') {
    // Delivering or dropping a contract held is free (owner, after the 0.20.0 build).
    if (after.tapsLeft !== before.tapsLeft) say(`${verb} changed the taps`);
  } else if (verb !== 'close' && after.tapsLeft !== before.tapsLeft - 1) {
    say(`taps went from ${before.tapsLeft} to ${after.tapsLeft}`);
  }
  if (after.tapsLeft < 0 || after.tapsLeft > tapsPerShift(after.inventory))
    say(`${after.tapsLeft} taps left`);

  // The level rule, for a mined square.
  if (after.mined > before.mined) {
    const [, coords] = step.split(' ');
    const [x, y] = (coords ?? '').split(',').map(Number);
    if (x !== undefined && y !== undefined) {
      // Hardness: worked out here from the data, not with the engine's frontierMineCheck.
      const allowed = coverLevelAt(before.camps, x, y);
      const code = topBlockAt(before.cube, x, y);
      const byLevel = FRONTIER_CAMP_LEVELS.findIndex((l) =>
        l.addsBlocks.some((id) => BLOCKS[id].code === code),
      );
      const byTool = FRONTIER_TOOLS.some(
        (t) =>
          (before.inventory.get(t.item) ?? 0) > 0 && t.mines.some((id) => BLOCKS[id].code === code),
      );
      const ok = byLevel >= 0 ? byLevel + 1 <= allowed : allowed > 0 && byTool;
      if (!ok)
        say(`mined ${x},${y} (block ${code}) with level ${allowed} over it and tool ${byTool}`);
      const was = depthAt(before.cube, x, y);
      const now = depthAt(after.cube, x, y);
      if (now !== was + 1) say(`mined ${x},${y} went from depth ${was} to ${now}`);
      for (const s of SQUARE_STEPS) {
        const nx = x + s.dx;
        const ny = y + s.dy;
        if (isSquare(after.cube, nx, ny) && now - depthAt(after.cube, nx, ny) > 1) {
          say(`${x},${y} is more than 1 level below its neighbour ${nx},${ny}`);
        }
      }
    }
  }

  // Rain (hazards plan, section 1): at End shift a square may be filled by
  // 1 block, only if it was a low spot (worked out here: dug, no neighbour
  // deeper, some neighbour shallower) and not a camp's ground; the level rule
  // still holds everywhere. "fillSquare" fills its own square by 1 block.
  // Other steps never fill a square.
  if (after.cube !== before.cube && !(after.mined > before.mined)) {
    const w = before.cube.size.x;
    const h = before.cube.size.y;
    const was: number[] = [];
    const now: number[] = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        was.push(depthAt(before.cube, x, y));
        now.push(depthAt(after.cube, x, y));
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = x + w * y;
        const d = was[i] ?? 0;
        const n = now[i] ?? 0;
        let deeper = false;
        let shallower = false;
        for (const st of SQUARE_STEPS) {
          const nx = x + st.dx;
          const ny = y + st.dy;
          if (!isSquare(after.cube, nx, ny)) continue;
          const j = nx + w * ny;
          if ((was[j] ?? 0) > d) deeper = true;
          if ((was[j] ?? 0) < d) shallower = true;
          // Steep sides (a deep camp's foundation) may stay; no gap may grow past 1.
          const gap = Math.abs(n - (now[j] ?? 0));
          // A deep camp's foundation may leave steep sides where it dug.
          if (gap > 1 && gap > Math.abs(d - (was[j] ?? 0)) && verb !== 'placeDeep')
            say(`after the night ${x},${y} breaks the level rule`);
        }
        if (n === d) continue;
        // A deep camp's foundation digs its 3 x 3 level (owner, on the hazards build).
        const foundation =
          verb === 'placeDeep' &&
          after.camps.some((c) => c.deep && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1);
        if (foundation) {
          if (n < d) say(`the foundation raised ${x},${y}`);
          continue;
        }
        // Filling a square with dirt (fill.ts): that square, 1 level, never above a deeper neighbour.
        const filledHere = verb === 'fillSquare' && step.split(' ')[1] === `${x},${y}`;
        if (filledHere) {
          if (n !== d - 1) say(`filling took ${x},${y} from depth ${d} to ${n}`);
          else if (deeper) say(`filled ${x},${y}, beside a deeper square`);
          else if (campAt(after.camps, x, y) !== null) say(`filled ${x},${y}, a camp's ground`);
        } else if (!endsShift) say(`${x},${y} went from depth ${d} to ${n} without a mining tap`);
        else if (n !== d - 1) say(`rain took ${x},${y} from depth ${d} to ${n}`);
        else if (deeper || !shallower) say(`rain filled ${x},${y}, which was not a low spot`);
        else if (campAt(after.camps, x, y) !== null) say(`rain filled ${x},${y}, a camp's ground`);
        else if (after.hazards.flooded[i] === true) say(`rain filled flooded ${x},${y}`);
      }
    }
  }

  // Water and pumps (hazards PR 2).
  {
    const w = after.cube.size.x;
    let wetted = 0;
    let dried = 0;
    after.hazards.flooded.forEach((wet, i) => {
      const was = before.hazards.flooded[i] === true;
      const x = i % w;
      const y = Math.floor(i / w);
      if (wet && campAt(after.camps, x, y) !== null) say(`camp ground ${x},${y} is flooded`);
      if (wet && !was) {
        wetted += 1;
        if (depthAt(after.cube, x, y) < FRONTIER_WATER.fromDepth)
          say(`${x},${y} flooded at depth ${depthAt(after.cube, x, y)}`);
      }
      if (!wet && was) dried += 1;
      if (was && verb === 'tap' && after.mined > before.mined) {
        const [mx, my] = (step.split(' ')[1] ?? '').split(',').map(Number);
        if (mx === x && my === y) say(`flooded ${x},${y} was mined`);
      }
    });
    if (wetted > 0 && !(verb === 'tap' && after.mined > before.mined))
      say(`${wetted} squares flooded by "${verb}"`);
    if (wetted > FRONTIER_WATER.maxSquares) say(`${wetted} squares flooded at once`);
    if (dried > 0 && !endsShift) say(`${dried} squares dried by "${verb}"`);
    if (dried > before.hazards.pumps.length * FRONTIER_PUMP.drainPerShift)
      say(`${dried} squares dried by ${before.hazards.pumps.length} pumps`);
    for (const pump of after.hazards.pumps) {
      if (after.hazards.flooded[pump.x + w * pump.y] !== true)
        say(`a pump stands on dry ${pump.x},${pump.y}`);
    }
    const pumps = (x: FrontierState): number =>
      x.hazards.pumps.length + (x.inventory.get(FRONTIER_PUMP.item) ?? 0);
    if (pumps(after) !== pumps(before) && verb !== 'buy')
      say(`pumps went from ${pumps(before)} to ${pumps(after)} by "${verb}"`);
  }

  // Gas and fire (hazards PR 3).
  {
    const w = after.cube.size.x;
    const h = after.cube.size.y;
    const tapped = verb === 'tap' ? (step.split(' ')[1] ?? '').split(',').map(Number) : [];
    const [tx, ty] = tapped;
    const exploded = outcome.tap?.gas === 'exploded';
    if (verb === 'tap' && after.mined > before.mined && after.cube !== before.cube) {
      let blownSeen = false;
      for (let y = 0; y < h && (exploded || !blownSeen); y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (x === tx && y === ty) continue;
          const d0 = depthAt(before.cube, x, y);
          const d1 = depthAt(after.cube, x, y);
          if (d0 === d1) continue;
          blownSeen = true;
          const near =
            Math.abs(x - (tx ?? -99)) <= FRONTIER_GAS.blastRadius &&
            Math.abs(y - (ty ?? -99)) <= FRONTIER_GAS.blastRadius;
          if (!exploded || !near || d1 !== d0 + 1) say(`${x},${y} went from depth ${d0} to ${d1}`);
        }
      }
      if (blownSeen) {
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            // A gap past 1 (a deep camp's foundation) may stay; none may grow.
            const d = depthAt(after.cube, x, y);
            const d0 = depthAt(before.cube, x, y);
            for (const [nx, ny] of [
              [x + 1, y],
              [x, y + 1],
            ] as const) {
              if (nx >= w || ny >= h) continue;
              const gap = Math.abs(d - depthAt(after.cube, nx, ny));
              if (gap > 1 && gap > Math.abs(d0 - depthAt(before.cube, nx, ny)))
                say(`after the blast ${x},${y} breaks the level rule`);
            }
          }
        }
      }
    }
    // What can burn: before the step, or after it (at night a tree can grow
    // back on its stump and catch fire in the same End shift).
    const burnable = (st: FrontierState, x: number, y: number): boolean => {
      const i = x + w * y;
      return (
        (st.features[i] ?? NO_FEATURE) !== NO_FEATURE ||
        (st.stumps[i] ?? NO_FEATURE) !== NO_FEATURE ||
        campAt(st.camps, x, y) !== null
      );
    };
    const canBurn = (x: number, y: number): boolean =>
      burnable(before, x, y) || (endsShift && burnable(after, x, y));
    const burningBefore = (x: number, y: number): boolean =>
      before.hazards.fires[x + w * y] === true;
    after.hazards.fires.forEach((burning, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      const was = before.hazards.fires[i] === true;
      if (burning && !was) {
        if (!canBurn(x, y)) say(`a fire started on ${x},${y}, where nothing can burn`);
        if (endsShift) {
          const beside = SQUARE_STEPS.some(
            (st) =>
              isSquare(after.cube, x + st.dx, y + st.dy) && burningBefore(x + st.dx, y + st.dy),
          );
          const dragonNear = after.hazards.dragons.some(
            (d) => Math.abs(d.x - x) <= 1 && Math.abs(d.y - y) <= 1,
          );
          if (!beside && !dragonNear)
            say(`a fire started on ${x},${y} at night with no fire or dragon beside it`);
        } else {
          const near =
            Math.abs(x - (tx ?? -99)) <= FRONTIER_GAS.fireRadius &&
            Math.abs(y - (ty ?? -99)) <= FRONTIER_GAS.fireRadius;
          if (!exploded || !near) say(`a fire started on ${x},${y} by "${step}"`);
        }
      }
      // A camp's ground can burn again: a dragon beside it may set it alight once more.
      const dragonBy = after.hazards.dragons.some(
        (d) => Math.abs(d.x - x) <= 1 && Math.abs(d.y - y) <= 1,
      );
      if (was && burning && endsShift && !dragonBy)
        say(`the fire on ${x},${y} burned on through the night`);
      if (was && endsShift && (after.features[i] ?? NO_FEATURE) !== NO_FEATURE)
        say(`${x},${y} burned out but something grows there`);
      if (was && !burning && !endsShift && !(outcome.tap?.kind === 'fire' && x === tx && y === ty))
        say(`the fire on ${x},${y} went out by "${step}"`);
    });
  }

  // Dragons (hazards PR 4).
  {
    const dw = after.cube.size.x;
    const dh = after.cube.size.y;
    if (after.hazards.dragons.length > FRONTIER_DRAGON.most)
      say(`${after.hazards.dragons.length} dragons on the map`);
    for (const d of after.hazards.dragons) {
      if (d.x < 0 || d.y < 0 || d.x >= dw || d.y >= dh) say(`dragon ${d.id} is off the map`);
      const was = before.hazards.dragons.find((b) => b.id === d.id);
      if (was === undefined) {
        const edge = d.x === 0 || d.y === 0 || d.x === dw - 1 || d.y === dh - 1;
        if (!endsShift) say(`dragon ${d.id} came by "${step}"`);
        if (!edge) say(`dragon ${d.id} came in at ${d.x},${d.y}, not the edge`);
        if (before.shift < FRONTIER_DRAGON.fromShift)
          say(`dragon ${d.id} came on shift ${before.shift}`);
      } else {
        // Straight flights in 8 directions: at most `steps` squares each way.
        const moved = Math.max(Math.abs(d.x - was.x), Math.abs(d.y - was.y));
        // At night a flight; in the day an attack, only on a step that spent taps; else still.
        const spent = !endsShift && after.tapsLeft < before.tapsLeft;
        const most = endsShift ? FRONTIER_DRAGON.steps : spent ? Infinity : 0;
        if (moved > most) say(`dragon ${d.id} flew ${moved} squares by "${step}"`);
        if (Math.abs(d.dx) > 1 || Math.abs(d.dy) > 1 || (d.dx === 0 && d.dy === 0))
          say(`dragon ${d.id} has heading ${d.dx},${d.dy}`);
        const restHigh = FRONTIER_DRAGON.restTaps[1];
        if (d.restTaps < 1 || d.restTaps > restHigh || !Number.isInteger(d.restTaps))
          say(`dragon ${d.id} rests ${d.restTaps} taps`);
      }
    }
    for (const d of before.hazards.dragons) {
      if (after.hazards.dragons.some((a) => a.id === d.id)) continue;
      const [tx, ty] = verb === 'tap' ? (step.split(' ')[1] ?? '').split(',').map(Number) : [];
      const sword = (before.inventory.get(FRONTIER_DRAGON.sword) ?? 0) > 0;
      if (!(outcome.tap?.kind === 'dragon' && tx === d.x && ty === d.y && sword))
        say(`dragon ${d.id} left by "${step}"`);
      if ((after.inventory.get(FRONTIER_DRAGON.sword) ?? 0) < 1) say('the sword was used up');
    }
  }

  // Raids and defenses (hazards PR 5).
  for (const camp of after.camps) {
    if (camp.defense < 0 || camp.defense > FRONTIER_DEFENSE.length)
      say(`camp ${camp.id} has defenses ${camp.defense}`);
    const was = before.camps.find((c) => c.id === camp.id);
    if (was === undefined) {
      if (camp.defense !== 0) say(`new camp ${camp.id} has defenses ${camp.defense}`);
      continue;
    }
    if (camp.defense < was.defense) say(`camp ${camp.id}'s defenses came down`);
    if (
      camp.defense > was.defense &&
      !(verb === 'buildDefense' && camp.defense === was.defense + 1)
    )
      say(`camp ${camp.id}'s defenses went up by "${step}"`);
    if (camp.level < was.level && !endsShift) say(`camp ${camp.id} lost a level by "${step}"`);
  }
  if (endsShift && (after.inventory.get('coin') ?? 0) < (before.inventory.get('coin') ?? 0))
    say('the night took coins');

  // Shifts and health.
  if (endsShift && after.shift !== before.shift + 1)
    say(`the shift went from ${before.shift} to ${after.shift}`);
  if (!endsShift && after.shift !== before.shift) say('the shift changed without End shift');
  if (before.status !== 'active') say('an action was taken after the run ended');

  // The inventory.
  for (const [item, count] of after.inventory) {
    if (!Number.isInteger(count) || count <= 0) say(`${count} ${item} held`);
  }

  // Camps.
  const ids = new Set(after.camps.map((c) => c.id));
  if (ids.size !== after.camps.length) say('two camps share an id');
  for (const a of after.camps) {
    if (!isLevelPatch(after.cube, a.x, a.y)) say(`camp ${a.id} is not on level ground`);
    for (const b of after.camps) {
      if (a.id < b.id && Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2)
        say(`camps ${a.id} and ${b.id} overlap`);
    }
  }

  // Sight.
  const width = after.cube.size.x;
  const lit = coverLevels(after.camps, width, after.cube.size.y);
  after.seen.forEach((seen, i) => {
    if (before.seen[i] === true && !seen) say(`square ${i} was seen and is not now`);
    if ((lit[i] ?? 0) > 0 && !seen) say(`square ${i} is lit but not seen`);
  });

  // New camps stand high.
  const oldIds = new Set(before.camps.map((c) => c.id));
  for (const camp of after.camps) {
    // A deep camp (progression PR 6) stands at any depth, at its own level, always.
    if (camp.deep && camp.level !== FRONTIER_DEEP_CAMP.level)
      say(`deep camp ${camp.id} is at level ${camp.level}`);
    if (camp.deep && !oldIds.has(camp.id) && verb !== 'placeDeep')
      say(`a deep camp placed by "${verb}"`);
    const depth = depthAt(after.cube, camp.x, camp.y);
    if (camp.deep && !oldIds.has(camp.id) && depth < FRONTIER_DEEP_CAMP.minDepth)
      say(`deep camp ${camp.id} was placed at depth ${depth}`);
    if (camp.deep) continue;
    if (!oldIds.has(camp.id) && depthAt(after.cube, camp.x, camp.y) > FRONTIER_CAMP_PLACE.maxDepth)
      say(`camp ${camp.id} was placed at depth ${depthAt(after.cube, camp.x, camp.y)}`);
  }

  // Camp levels: none above the top level.
  for (const camp of after.camps) {
    if (camp.level < 1 || camp.level > FRONTIER_CAMP_LEVELS.length)
      say(`camp ${camp.id} is at level ${camp.level}`);
  }

  // Smelters: only at a camp of the level that may have one.
  for (const camp of after.camps) {
    if (camp.smelter && camp.level < FRONTIER_SMELTER.minLevel)
      say(`a smelter at camp ${camp.id}, of level ${camp.level}`);
  }

  // Lanterns: each one newly hung left the store.
  const hungBefore = new Set(before.camps.filter((c) => c.lantern).map((c) => c.id));
  const newlyHung = after.camps.filter((c) => c.lantern && !hungBefore.has(c.id)).length;
  if (newlyHung > 0) {
    const held = (s: FrontierState): number => s.inventory.get(FRONTIER_LANTERN.item) ?? 0;
    if (held(before) - held(after) !== newlyHung)
      say(`${newlyHung} lantern(s) hung, but the store went ${held(before)} -> ${held(after)}`);
  }

  // The market: worked out here from the data, not with the engine's market.ts.
  if (verb === 'sell' || verb === 'buy') {
    const [, item, lotsText] = step.split(' ');
    const lots = Number(lotsText);
    const best = before.camps.reduce((b, c) => Math.max(b, c.level), 1);
    if (!before.marketOpen) say(`a trade on shift ${before.shift} with the market closed`);
    const lot = (verb === 'sell' ? FRONTIER_MARKET.sellPrices : FRONTIER_MARKET.buyPrices).find(
      (l) => l.item === item,
    );
    if (lot === undefined) {
      say(`a trade in ${item ?? '?'}, which the market does not ${verb}`);
    } else {
      if (best < (lot.fromLevel ?? 1))
        say(`bought ${lot.item}, sold from camp level ${lot.fromLevel ?? 1}, with level ${best}`);
      if (lot.afterTier1 === true && (before.contractsDone[0] ?? 0) === 0)
        say(`traded ${lot.item} before a tier-1 contract was done`);
      const sign = verb === 'sell' ? 1 : -1;
      const expected = new Map<string, number>([
        [lot.item, -sign * lot.count * lots],
        [FRONTIER_MARKET.coin, sign * lot.coins * lots],
      ]);
      const items = new Set([...before.inventory.keys(), ...after.inventory.keys()]);
      for (const key of items) {
        const change = (after.inventory.get(key) ?? 0) - (before.inventory.get(key) ?? 0);
        if (change !== (expected.get(key) ?? 0))
          say(`the trade changed ${key} by ${change}, not ${expected.get(key) ?? 0}`);
      }
    }
  }
  // The market opens only after a market day's night, and only market actions are taken while it is open.
  if (endsShift && after.status === 'active') {
    const best = after.camps.reduce((b, c) => Math.max(b, c.level), 1);
    const every = FRONTIER_MARKET.everyShifts;
    const cadence = every[Math.min(best, every.length) - 1] ?? 1;
    if (after.marketOpen !== (after.shift % cadence === 0))
      say(
        `after End shift the market is ${after.marketOpen ? 'open' : 'closed'} on shift ${after.shift}`,
      );
  }
  if (
    before.marketOpen &&
    !['sell', 'buy', 'takeContract', 'fillContract', 'deliver', 'closeMarket', 'close'].includes(
      verb,
    )
  )
    say(`"${verb}" was done while the market was open`);
  if (!endsShift && !before.marketOpen && after.marketOpen)
    say('the market opened without a night');

  // The run's end.
  if (after.status === 'finished' && !(endsShift && before.shift === FRONTIER_RUN.shifts))
    say(`the run finished on shift ${before.shift}, by "${verb}"`);
  if (after.status === 'active' && after.shift > FRONTIER_RUN.shifts)
    say(`shift ${after.shift} is past the run's last`);

  // Contracts (progression plan section 5).
  if (verb === 'takeContract') {
    const id = step.split(' ')[1] ?? '';
    const limit = before.camps.reduce((b, c) => Math.max(b, c.level), 1);
    if (before.contracts.length >= limit)
      say(
        `took a contract holding ${before.contracts.length}, with the best camp at level ${limit}`,
      );
    if (before.contracts.some((c) => c.id === id)) say(`took ${id}, which was held already`);
    if (!contractBoard(before).some((c) => c.id === id))
      say(`took ${id}, which is not on the board`);
  }
  if (verb === 'fillContract') {
    // Filled at once from the board, while the market is open; never held after.
    const id = step.split(' ')[1] ?? '';
    if (!before.marketOpen) say(`filled ${id} with the market closed`);
    if (!contractBoard(before).some((c) => c.id === id)) say(`filled ${id}, not on the board`);
    if (after.contracts.some((c) => c.id === id)) say(`filled ${id}, and it is still held`);
  }
  if (verb === 'deliver' || verb === 'fillContract') {
    const id = step.split(' ')[1] ?? '';
    const isHeld = verb === 'fillContract' || before.contracts.some((c) => c.id === id);
    const held = isHeld ? FRONTIER_CONTRACTS.find((c) => c.id === id) : undefined;
    if (held === undefined) {
      say('delivered with no contract held');
    } else {
      const expected = new Map<string, number>(held.asks.map((a) => [a.item, -a.count]));
      expected.set('coin', (expected.get('coin') ?? 0) + held.pays);
      const items = new Set([...before.inventory.keys(), ...after.inventory.keys()]);
      for (const key of items) {
        const change = (after.inventory.get(key) ?? 0) - (before.inventory.get(key) ?? 0);
        if (change !== (expected.get(key) ?? 0)) say(`delivering changed ${key} by ${change}`);
      }
      const doneBefore = before.contractsDone[held.tier - 1] ?? 0;
      if ((after.contractsDone[held.tier - 1] ?? 0) !== doneBefore + 1)
        say('delivering did not count');
    }
  }
  after.contractsDone.forEach((n, i) => {
    if (n < (before.contractsDone[i] ?? 0)) say(`tier ${i + 1}'s contracts done fell`);
  });

  // Pens (progression plan section 6.3).
  for (const camp of after.camps) {
    if (!camp.pen && camp.penned !== 0) say(`camp ${camp.id} has ${camp.penned} penned and no pen`);
    if (camp.pen && camp.level < FRONTIER_PEN.minLevel)
      say(`a pen at camp ${camp.id}, of level ${camp.level}`);
    if (camp.penned < 0 || camp.penned > FRONTIER_PEN.capacity)
      say(`camp ${camp.id}'s pen holds ${camp.penned}`);
    const mayBreed = camp.penned >= 2 && camp.penned < FRONTIER_PEN.capacity;
    if (!mayBreed && camp.breedIn !== 0) say(`camp ${camp.id} counts to breed but may not`);
  }
  if (verb === 'penIn' || verb === 'penOut') {
    const id = Number(step.split(' ')[1]);
    const pennedOf = (s: FrontierState): number => s.camps.find((c) => c.id === id)?.penned ?? 0;
    const sign = verb === 'penIn' ? 1 : -1;
    if (pennedOf(after) - pennedOf(before) !== sign)
      say(`the pen changed by ${pennedOf(after) - pennedOf(before)}`);
    const held = (s: FrontierState): number => s.inventory.get('animal') ?? 0;
    if (held(after) - held(before) !== -sign)
      say(`the store's animals changed by ${held(after) - held(before)}`);
  }

  // Farming (progression plan sections 6.1 and 6.2).
  after.planted.forEach((planted, i) => {
    if (planted && (after.stumps[i] ?? NO_FEATURE) === NO_FEATURE)
      say(`square ${i} is planted but has no stump`);
  });
  after.grassIn.forEach((left, i) => {
    if (left >= 0 && after.features[i] !== NO_FEATURE)
      say(`cut grass waits on square ${i}, where something grows`);
    if (left >= 0 && depthAt(after.cube, i % width, Math.floor(i / width)) !== 0)
      say(`cut grass waits on square ${i}, whose ground was mined`);
  });
  if (verb === 'plant') {
    const item = step.split(' ')[2] ?? '';
    const change = (after.inventory.get(item) ?? 0) - (before.inventory.get(item) ?? 0);
    if (change !== -1) say(`planting ${item} changed the store by ${change}`);
  }

  // The surface.
  const squares = new Set<string>();
  for (const a of after.animals) {
    const key = `${a.x},${a.y}`;
    if (squares.has(key)) say(`two animals on ${key}`);
    squares.add(key);
    const f = after.features[a.x + width * a.y];
    if (isTree(f)) say(`an animal on a tree at ${key}`);
    if (depthAt(after.cube, a.x, a.y) !== 0) say(`an animal in a pit at ${key}`);
  }
  // Crops (owner, after the 0.19.0 build): on ground never dug, with nothing
  // else growing there, and a count only while a crop is sown.
  after.crops.forEach((k, i) => {
    const left = after.cropIn[i] ?? -1;
    if (k === 0) {
      if (left !== -1) say(`square ${i} counts down a crop that is not there`);
      return;
    }
    if (left < 0) say(`the crop on square ${i} has no count`);
    if (after.features[i] !== NO_FEATURE) say(`a crop and a plant share square ${i}`);
    if (depthAt(after.cube, i % width, Math.floor(i / width)) !== 0)
      say(`a crop on square ${i}, whose ground was mined`);
  });
  after.apples.forEach((n, i) => {
    // An apple tree's apples, or a maple's sap (`cropOf`).
    const appleTree = cropOf(after.features[i]) !== null;
    if (n < 0 || n > fullCrop(after.features[i]) || (!appleTree && n !== 0))
      say(`${n} apples or sap on square ${i}`);
    const waiting = (after.regrowIn[i] ?? -1) >= 0;
    if (
      after.features[i] !== NO_FEATURE &&
      campAt(after.camps, i % width, Math.floor(i / width)) !== null
    )
      say(`something grows on a camp's ground at square ${i}`);
    const stump = after.stumps[i] ?? NO_FEATURE;
    if (stump !== NO_FEATURE) {
      if (!isTree(stump)) say(`square ${i} has a stump of ${stump}`);
      if (!waiting) say(`the stump on square ${i} is not waiting to grow`);
      if (after.features[i] !== NO_FEATURE) say(`something grows on the stump on square ${i}`);
      if (depthAt(after.cube, i % width, Math.floor(i / width)) !== 0)
        say(`a stump on square ${i}, whose ground was mined`);
    } else if (waiting && !(appleTree && n === 0)) {
      say(`square ${i} waits to regrow but is neither a bare apple or maple tree nor a stump`);
    }
  });
  return problems;
}
