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
// - FARMING: a planted sapling is a waiting stump on unmined dirt; cut grass
//   waits only on a square with nothing growing on it; a planting takes one
//   sapling from the store.
// - THE MARKET AND THE RUN'S END: a trade happens only on a market day
//   (worked out here from the data), in a lot open at the best camp's
//   level, gives up and gets exactly a whole
//   number of lots at its price, and changes nothing else in the store; a
//   run is 'finished' only by the End shift or rest of its last shift, and
//   no shift past the last is ever played.

import { BLOCKS } from '../src/data';
import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_CAMP_PLACE,
  FRONTIER_TOOLS,
  FRONTIER_LANTERN,
  FRONTIER_MARKET,
  FRONTIER_RUN,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
  FRONTIER_SURFACE,
} from '../src/data/frontier';
import {
  SQUARE_STEPS,
  campAt,
  coverLevelAt,
  coverLevels,
  depthAt,
  isLevelPatch,
  isSquare,
  previewTap,
  topBlockAt,
} from '../src/engine';
import type { FrontierOutcome, FrontierState } from '../src/engine';
import { APPLE_TREE, NO_FEATURE, TREE } from '../src/engine/frontier/state';
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
    if (after.tapsLeft !== FRONTIER_SHIFT.taps && after.status === 'active')
      say(`a new shift has ${after.tapsLeft} taps`);
  } else if (verb !== 'close' && after.tapsLeft !== before.tapsLeft - 1) {
    say(`taps went from ${before.tapsLeft} to ${after.tapsLeft}`);
  }
  if (after.tapsLeft < 0 || after.tapsLeft > FRONTIER_SHIFT.taps)
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

  // Shifts and health.
  if (endsShift && after.shift !== before.shift + 1)
    say(`the shift went from ${before.shift} to ${after.shift}`);
  if (!endsShift && after.shift !== before.shift) say('the shift changed without End shift');
  if (after.health < 0 || after.health > FRONTIER_SHIFT.startHealth) say(`health ${after.health}`);
  if (after.health === 0 && after.status !== 'lost') say('health 0 but the run is not lost');
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
    const every = FRONTIER_MARKET.everyShifts;
    const cadence = every[Math.min(best, every.length) - 1] ?? 1;
    if (before.shift % cadence !== 0)
      say(`a trade on shift ${before.shift}, with the market every ${cadence} shifts`);
    const lot = (verb === 'sell' ? FRONTIER_MARKET.sellPrices : FRONTIER_MARKET.buyPrices).find(
      (l) => l.item === item,
    );
    if (lot === undefined) {
      say(`a trade in ${item ?? '?'}, which the market does not ${verb}`);
    } else {
      if (best < (lot.fromLevel ?? 1))
        say(`bought ${lot.item}, sold from camp level ${lot.fromLevel ?? 1}, with level ${best}`);
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
  // The run's end.
  if (after.status === 'finished' && !(endsShift && before.shift === FRONTIER_RUN.shifts))
    say(`the run finished on shift ${before.shift}, by "${verb}"`);
  if (after.status === 'active' && after.shift > FRONTIER_RUN.shifts)
    say(`shift ${after.shift} is past the run's last`);

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
    if (f === TREE || f === APPLE_TREE) say(`an animal on a tree at ${key}`);
    if (depthAt(after.cube, a.x, a.y) !== 0) say(`an animal in a pit at ${key}`);
  }
  after.apples.forEach((n, i) => {
    const appleTree = after.features[i] === APPLE_TREE;
    if (n < 0 || n > FRONTIER_SURFACE.applesPerTree || (!appleTree && n !== 0))
      say(`${n} apples on square ${i}`);
    const waiting = (after.regrowIn[i] ?? -1) >= 0;
    if (
      after.features[i] !== NO_FEATURE &&
      campAt(after.camps, i % width, Math.floor(i / width)) !== null
    )
      say(`something grows on a camp's ground at square ${i}`);
    const stump = after.stumps[i] ?? NO_FEATURE;
    if (stump !== NO_FEATURE) {
      if (stump !== TREE && stump !== APPLE_TREE) say(`square ${i} has a stump of ${stump}`);
      if (!waiting) say(`the stump on square ${i} is not waiting to grow`);
      if (after.features[i] !== NO_FEATURE) say(`something grows on the stump on square ${i}`);
      if (depthAt(after.cube, i % width, Math.floor(i / width)) !== 0)
        say(`a stump on square ${i}, whose ground was mined`);
    } else if (waiting && !(appleTree && n === 0)) {
      say(`square ${i} waits to regrow but is neither a bare apple tree nor a stump`);
    }
  });
  return problems;
}
