// UI lab 1 (issue #116): how the lab looks. Presentation only: nothing here
// is a game rule, so it lives with the screen, not in src/data.

import type { BlockId } from '../../data';

export const LAB_LOOK = {
  /** Squares across the map when a world opens: big enough to see each block's texture. */
  startCells: 11,
  /** How many texture tiles each block kind has; squares pick one by position, so the ground does not repeat. */
  textureVariants: 4,
  /** The size in pixels of one texture tile; it is scaled to the square's size when drawn. */
  texturePx: 64,
  /** The shadow along an edge that faces a higher neighbour: its width as a part of the square... */
  shadowWidth: 0.34,
  /** ...and how dark it is at the edge (it fades to nothing across its width). */
  shadowAlpha: 0.5,
  /** A thin, sharp dark line right on the shadowed edge, so the step reads at any zoom. */
  shadowLineAlpha: 0.35,
  /** Each level down dims a square by this much, to no less than `depthMinBrightness`. */
  depthBrightnessPerLevel: 0.9,
  depthMinBrightness: 0.5,
  /** How long the cue after a refused tap lasts, in milliseconds. */
  refusedMs: 700,
  /** How long the "+1 Coal" label after a mine floats, in milliseconds. */
  gainMs: 900,
  /** The thin gap between squares, as a part of the square. */
  gapFraction: 0.04,
};

/**
 * The colours of each block kind's texture: `base` fills the tile, `dark`
 * and `light` are the grains and highlights, and `accent` the ore nuggets or
 * crystals (where the kind has them). Each kind also has its own pattern,
 * drawn in textures.ts, so no two kinds differ by colour alone.
 */
export interface BlockPaint {
  base: string;
  dark: string;
  light: string;
  accent: string;
  accentLight: string;
}

export const BLOCK_PAINT: Record<BlockId, BlockPaint> = {
  air: {
    base: '#000000',
    dark: '#000000',
    light: '#000000',
    accent: '#000000',
    accentLight: '#000000',
  },
  dirt: {
    base: '#8b5a34',
    dark: '#6a4223',
    light: '#a8734a',
    accent: '#5a3a20',
    accentLight: '#b98a5e',
  },
  stone: {
    base: '#8e8c88',
    dark: '#6f6d69',
    light: '#a9a7a2',
    accent: '#5f5d5a',
    accentLight: '#bdbbb6',
  },
  hardRock: {
    base: '#4f5862',
    dark: '#3a414a',
    light: '#66707b',
    accent: '#2c3239',
    accentLight: '#7c8691',
  },
  coalSeam: {
    base: '#2a2826',
    dark: '#151413',
    light: '#3d3a37',
    accent: '#0b0b0b',
    accentLight: '#8f8f96',
  },
  timberRoot: {
    base: '#7b5532',
    dark: '#5c3d22',
    light: '#946a43',
    accent: '#3f7f3a',
    accentLight: '#7fbf63',
  },
  ironOre: {
    base: '#8a8580',
    dark: '#6b6762',
    light: '#a29d97',
    accent: '#a8452a',
    accentLight: '#e08a62',
  },
  copperOre: {
    base: '#8a8580',
    dark: '#6b6762',
    light: '#a29d97',
    accent: '#d07a2e',
    accentLight: '#3fb39b',
  },
  crystal: {
    base: '#7f8a94',
    dark: '#626c75',
    light: '#98a3ad',
    accent: '#6cc6f2',
    accentLight: '#ffffff',
  },
  unstableOre: {
    base: '#5c4a63',
    dark: '#43344a',
    light: '#73607b',
    accent: '#c440d6',
    accentLight: '#ffe14d',
  },
  relic: {
    base: '#8a7a55',
    dark: '#6b5d3e',
    light: '#a39270',
    accent: '#e0b83a',
    accentLight: '#fff1b0',
  },
  keystone: {
    base: '#e6dcc4',
    dark: '#b8ab8a',
    light: '#f6efdf',
    accent: '#8a7a50',
    accentLight: '#ffffff',
  },
  bedrock: {
    base: '#141414',
    dark: '#070707',
    light: '#232323',
    accent: '#000000',
    accentLight: '#2e2e2e',
  },
  rubble: {
    base: '#6f655c',
    dark: '#544b43',
    light: '#8b8075',
    accent: '#463e37',
    accentLight: '#a3978a',
  },
  sealed: {
    base: '#4b5170',
    dark: '#363b55',
    light: '#626a8c',
    accent: '#262a3e',
    accentLight: '#7a83a8',
  },
};

/** Colours of the marks drawn over the map. */
export const LAB_MARKS = {
  /** The outline of a neighbour that is too high, after a refused tap. */
  tooHigh: '#ffcf4a',
  /** The wash over a neighbour that is too high. */
  tooHighWash: 'rgba(255, 207, 74, 0.3)',
  /** The outline of the square a refused tap was on. */
  refused: '#ff6b4a',
  /** The flash on a square just mined. */
  minedFlash: 'rgba(255, 245, 220, 0.75)',
  /** The floating "+1 Coal" label, and its outline. */
  gain: '#fff4d6',
  gainOutline: 'rgba(0, 0, 0, 0.8)',
  /** The gap between squares. */
  gap: '#0d0b0a',
};
