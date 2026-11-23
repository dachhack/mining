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

import {
  FRONTIER_LANTERN,
  FRONTIER_SHIFT,
  FRONTIER_SMELTER,
  FRONTIER_SURFACE,
} from '../src/data/frontier';
import {
  SQUARE_STEPS,
  campAt,
  coverLevels,
  depthAt,
  isLevelPatch,
  isSquare,
  previewTap,
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
