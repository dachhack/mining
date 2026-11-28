// Accomplishments (owner, after the 0.26.0 build: "We also need a
// accomplishment system"; asked: per run, each worth family glory).
//
// - A run's `feats` are the ids of the accomplishments it has earned
//   (FRONTIER_FEATS), in the order earned. Each is earned once a run.
// - After every action that does something, `earnFeats` looks at the state
//   before and after and at what the action reported, and adds the ones
//   newly earned (shift.ts, `frontierAct`). The outcome names them.
// - Most are read from the state after (a second camp, a level-3 camp, 500
//   coins held, a relic in the store ...); three come from the action
//   itself: a dragon driven off (the tap's answer), marauders turned away
//   (End shift's report), and a square dug to a depth (the square tapped, or
//   the 3 x 3 dug: only those are measured, not the whole map).
// - A run's glory is the sum of its feats' (`gloryOf`), and the family's
//   standing the last of FRONTIER_STANDINGS it has reached (`standingOf`).
//
// The list, the glory and the standings are in src/data/frontier.ts.

import {
  FRONTIER_DEFENSE,
  FRONTIER_FEATS,
  FRONTIER_MARKET,
  FRONTIER_MINERS,
  FRONTIER_STANDINGS,
  FRONTIER_TREASURE,
} from '../../data/frontier';
import { depthAt } from '../heightmap';
import { isWorkCamp } from './state';
import type { FrontierState } from './state';

/** What an action reported, as far as accomplishments care. */
export interface FeatNews {
  /** True if the tap drove a dragon off. */
  dragonDriven: boolean;
  /** True if End shift's raid was turned away. */
  raidTurnedAway: boolean;
  /** The squares the action may have dug: the one tapped, or the 3 x 3 of a dig. */
  dug: { x: number; y: number }[];
}

/** True if accomplishment `id` holds for `after`, given what the action reported. */
function holds(id: string, after: FrontierState, news: FeatNews): boolean {
  const held = (item: string): number => after.inventory.get(item) ?? 0;
  const delivered = after.contractsDone.reduce((sum, n) => sum + n, 0);
  const level = (n: number): boolean => after.camps.some((c) => !c.deep && c.level >= n);
  const depth = (n: number): boolean =>
    news.dug.some(
      (sq) =>
        sq.x >= 0 &&
        sq.y >= 0 &&
        sq.x < after.cube.size.x &&
        sq.y < after.cube.size.y &&
        depthAt(after.cube, sq.x, sq.y) >= n,
    );
  switch (id) {
    case 'second-camp':
      return after.camps.length >= 2;
    case 'level-2':
      return level(2);
    case 'level-3':
      return level(3);
    case 'level-4':
      return level(4);
    case 'smelter':
      return after.camps.some((c) => c.smelter);
    case 'first-contract':
      return delivered >= 1;
    case 'contracts-5':
      return delivered >= 5;
    case 'contracts-15':
      return delivered >= 15;
    case 'depth-10':
      return depth(10);
    case 'depth-20':
      return depth(20);
    case 'deep-camp':
      return after.camps.some((c) => c.deep);
    case 'worker':
      return after.buildings.some((b) => isWorkCamp(b.kind) && b.workers > 0);
    case 'full-crew':
      return held(FRONTIER_MINERS.item) >= FRONTIER_MINERS.most;
    case 'dragon-slayer':
      return news.dragonDriven;
    case 'raid-repelled':
      return news.raidTurnedAway;
    case 'fortress':
      return after.camps.some((c) => c.defense >= FRONTIER_DEFENSE.length);
    case 'coins-500':
      return held(FRONTIER_MARKET.coin) >= 500;
    case 'coins-2000':
      return held(FRONTIER_MARKET.coin) >= 2000;
    case 'first-relic':
      return held('relic') >= 1;
    case 'keystone':
      return held('keystone') >= 1;
    case 'all-relics':
      return held('relic') >= FRONTIER_TREASURE.relics;
    case 'finished':
      return after.status === 'finished';
    default:
      return false;
  }
}

/**
 * `after` with the accomplishments it has newly earned added to its `feats`,
 * and their ids, in the order of FRONTIER_FEATS. The very same state comes
 * back if none is new.
 */
export function earnFeats(
  after: FrontierState,
  news: FeatNews,
): { state: FrontierState; earned: string[] } {
  const earned: string[] = [];
  for (const feat of FRONTIER_FEATS) {
    if (after.feats.includes(feat.id)) continue;
    if (holds(feat.id, after, news)) earned.push(feat.id);
  }
  if (earned.length === 0) return { state: after, earned };
  return { state: { ...after, feats: [...after.feats, ...earned] }, earned };
}

/** A run's glory: the sum of its accomplishments'. */
export function gloryOf(state: FrontierState): number {
  let glory = 0;
  for (const feat of FRONTIER_FEATS) if (state.feats.includes(feat.id)) glory += feat.glory;
  return glory;
}

/** The family's standing for `glory`: the last of FRONTIER_STANDINGS reached. */
export function standingOf(glory: number): string {
  let name = FRONTIER_STANDINGS[0]?.name ?? '';
  for (const standing of FRONTIER_STANDINGS) if (glory >= standing.glory) name = standing.name;
  return name;
}
