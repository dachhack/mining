// UI lab 2 (issues #118 and #121): what is still Lab 2's own.
//
// Lab 2 is becoming the game (docs/plans/lab2-becomes-the-game.md). Its
// camps, costs and surface numbers now live in src/data/frontier.ts, which
// the engine's new world reads too; they are named here as before so Lab 2's
// code is unchanged. What stays the lab's alone: the items' display names,
// and the clock in milliseconds the lab's animals and apples run on (the
// game will count in shifts). Lab 2 goes in phase C of the plan.

import {
  FRONTIER_CAMP_LEVELS,
  FRONTIER_NEW_CAMP_COST,
  FRONTIER_START_REACH,
  FRONTIER_SURFACE,
} from './frontier';
import type { FrontierCampLevel } from './frontier';

/** One camp level (src/data/frontier.ts). */
export type LabCampLevel = FrontierCampLevel;

/** The camp levels, level 1 first (src/data/frontier.ts). */
export const LAB_CAMP_LEVELS = FRONTIER_CAMP_LEVELS;

/** What a new camp costs (src/data/frontier.ts). */
export const LAB_NEW_CAMP_COST = FRONTIER_NEW_CAMP_COST;

/** How far from the middle the free first camp may stand (src/data/frontier.ts). */
export const LAB_START_REACH = FRONTIER_START_REACH;

/**
 * The lab's own items (issue #121): what the surface and clay give. The
 * game's items (stone, coal, ...) keep their names from src/data/items.ts.
 * Item id -> display name, in the order the counter shows them.
 */
export const LAB_ITEMS: Record<string, string> = {
  wood: 'Wood',
  grass: 'Grass',
  apple: 'Apples',
  animal: 'Animals',
  clay: 'Clay',
};

/**
 * The surface (src/data/frontier.ts). Its clock is shifts now (plan A4,
 * FRONTIER_SHIFT): Lab 2's millisecond timings are gone.
 */
export const LAB_SURFACE = FRONTIER_SURFACE;
