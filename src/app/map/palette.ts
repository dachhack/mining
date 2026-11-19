// How the tap map looks (issue #66): one colour and one pattern per block,
// and the sizes of the map. Presentation only: nothing here is a game rule,
// so it lives with the screen, not in src/data.
//
// Every block has a pattern as well as a colour, so that two blocks never
// differ by colour alone (colour-blind players): for example dirt and copper
// ore are both brownish, but dirt is speckled and copper ore has a ring.

import type { BlockId } from '../../data';

/** The sizes and timings of the map. */
export const PREVIEW_MAP = {
  /** Cells across and down the window. */
  viewCells: 16,
  /** A press that moves less than this many pixels is a tap; more is a drag. */
  dragThresholdPx: 8,
  /** How long the "nothing to do there" hint stays, in milliseconds. */
  hintMs: 1500,
};

/** A small shape drawn over a tile's colour (see `drawPattern` in mapView.ts). */
export type Pattern =
  | 'plain'
  | 'speckle'
  | 'hatch'
  | 'dots'
  | 'stripes'
  | 'diamond'
  | 'ring'
  | 'plus'
  | 'cross'
  | 'star'
  | 'grid'
  | 'bars';

export interface BlockLook {
  /** Fill colour of the tile in light (CSS colour). */
  colour: string;
  /** Colour of the pattern drawn on it. */
  ink: string;
  pattern: Pattern;
}

/** One entry per block the cube can hold. A comment says what each is meant to suggest. */
export const BLOCK_LOOKS: Record<BlockId, BlockLook> = {
  // Open space: pale, so the tunnels stand out against the rock.
  air: { colour: '#d9cfbf', ink: '#d9cfbf', pattern: 'plain' },
  // Dirt: warm brown, speckled like loose earth.
  dirt: { colour: '#8a5a33', ink: '#5e3c20', pattern: 'speckle' },
  // Stone: mid grey, plain.
  stone: { colour: '#8d8d8d', ink: '#8d8d8d', pattern: 'plain' },
  // Hard rock: darker blue-grey with diagonal hatching (it costs more to mine).
  hardRock: { colour: '#505860', ink: '#30363c', pattern: 'hatch' },
  // Coal seam: near-black with grey dots, the fuel.
  coalSeam: { colour: '#232323', ink: '#9a9a9a', pattern: 'dots' },
  // Timber-root: green with vertical stripes, like fibres.
  timberRoot: { colour: '#3f7f3a', ink: '#24501f', pattern: 'stripes' },
  // Iron ore: rust red with a diamond.
  ironOre: { colour: '#a8472a', ink: '#f0c0a8', pattern: 'diamond' },
  // Copper ore: copper orange with a ring (verdigris green ink).
  copperOre: { colour: '#c97f35', ink: '#2f8f7f', pattern: 'ring' },
  // Crystal: icy blue with a plus, like a sparkle.
  crystal: { colour: '#7cc8f0', ink: '#ffffff', pattern: 'plus' },
  // Unstable ore: magenta with a cross, a warning colour.
  unstableOre: { colour: '#b03fc0', ink: '#ffe14d', pattern: 'cross' },
  // Relic: gold with a star.
  relic: { colour: '#d9b23c', ink: '#6b4f00', pattern: 'star' },
  // Keystone: ivory with a grid.
  keystone: { colour: '#efe6cf', ink: '#7a6a40', pattern: 'grid' },
  // Bedrock: black (the cube's floor; never mined).
  bedrock: { colour: '#050505', ink: '#050505', pattern: 'plain' },
  // Rubble: brown-grey with dots, broken rock.
  rubble: { colour: '#6f6359', ink: '#c9bcae', pattern: 'dots' },
  // Sealed rock: slate with horizontal bars.
  sealed: { colour: '#4b5170', ink: '#262a3e', pattern: 'bars' },
};

/** Cells the player has not seen: dark, with diagonal lines, never coloured by what is there. */
export const UNKNOWN_LOOK = { colour: '#1d1916', ink: '#3a332d' };

/** The pale veil over a surface cell, through which the ground under it shows. */
export const SURFACE_HAZE = 'rgba(232, 224, 210, 0.6)';

/** How much darker a seen cell is drawn when it is not in light (0 = black, 1 = as lit). */
export const UNLIT_BRIGHTNESS = 0.45;

/** Colours of the marks drawn on top of tiles. */
export const MARK_COLOURS = {
  miner: '#ff5a36',
  minerOutline: '#ffffff',
  ladder: '#f0c060',
  torch: '#ff9d2e',
  torchCore: '#fff2a8',
  support: '#e8e0d0',
  otherStructure: '#60d0ff',
  items: '#ffffff',
  itemsOutline: '#000000',
  traces: '#ffd84a',
  grid: 'rgba(0, 0, 0, 0.35)',
};
