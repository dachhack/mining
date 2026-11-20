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
  /**
   * Cells across and down the window at the default zoom. 14 across a phone
   * 390 px wide makes each square about 26 px: big enough to tap.
   */
  viewCells: 14,
  /** The most zoomed in: this many cells across (big tiles, easy to tap). */
  minCells: 8,
  /** The most zoomed out: this many cells across (the whole 32 x 32 map). */
  maxCells: 32,
  /**
   * How fast the mouse wheel zooms: each pixel of wheel movement multiplies
   * the cells across by e^(this). 100 px (one notch, usually) is about 16 %.
   */
  wheelZoomRate: 0.0015,
  /** Below this cell size in pixels the grid lines are left out, so marks stay clear. */
  gridMinCellPx: 12,
  /** A press that moves less than this many pixels is a tap; more is a drag. */
  dragThresholdPx: 8,
  /** From this cell size in pixels up, a dug square shows its depth as a number. */
  depthNumberMinCellPx: 20,
  /**
   * Depth shading (issue #86): a square `d` levels down is drawn at
   * `depthBrightnessPerLevel ** d` of its full brightness, and never darker
   * than `depthMinBrightness`, so that the block's colour can still be told.
   */
  depthBrightnessPerLevel: 0.8,
  depthMinBrightness: 0.22,
  /** How wide the shadow under a higher neighbour is, as a part of the cell. */
  wallShadowWidth: 0.14,
  /** How strongly a surface kind's pattern is drawn over the block under it on the top view. */
  surfaceMarkAlpha: 0.55,
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
  | 'bars'
  // The surface forest (issue #70).
  | 'tree'
  | 'stump'
  | 'grass'
  | 'track'
  | 'peak';

export interface BlockLook {
  /** Fill colour of the tile in light (CSS colour). */
  colour: string;
  /** Colour of the pattern drawn on it. */
  ink: string;
  pattern: Pattern;
}

/** One entry per block the cube can hold. A comment says what each is meant to suggest. */
export const BLOCK_LOOKS: Record<BlockId, BlockLook> = {
  // Open space: never a top block; kept so that every block has a look.
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

/** The kinds of surface cell (issue #70), as the tiles name them. */
export type SurfaceMark = 'tree' | 'stump' | 'path' | 'meadow' | 'outcrop';

/**
 * How each kind of surface cell looks on a square at ground level (issue
 * #78). A tree hides the block under it, so it is drawn solid in its `haze`
 * colour with its pattern. The open kinds draw only their pattern, faintly
 * (`PREVIEW_MAP.surfaceMarkAlpha`), over the block under them, so each still
 * differs from the others by pattern as well as colour; their `haze` is used
 * for nothing but the legend's look of the colour family.
 */
export const SURFACE_LOOKS: Record<SurfaceMark, { haze: string; ink: string; pattern: Pattern }> = {
  // Tree: dark green with a light green fir.
  tree: { haze: '#1f4d24', ink: '#8fd27f', pattern: 'tree' },
  // Stump: a pale-green haze with a brown ring of wood.
  stump: { haze: 'rgba(200, 225, 180, 0.6)', ink: '#6b4423', pattern: 'stump' },
  // Dirt path: a sandy haze with two wheel ruts.
  path: { haze: 'rgba(235, 215, 170, 0.6)', ink: '#7a5a2e', pattern: 'track' },
  // Meadow: a light green haze with tufts of grass.
  meadow: { haze: 'rgba(190, 235, 170, 0.6)', ink: '#3f8f2f', pattern: 'grass' },
  // Stone outcrop: a grey haze with a peak.
  outcrop: { haze: 'rgba(225, 225, 225, 0.6)', ink: '#4a4a4a', pattern: 'peak' },
};

/** Cells the player has not seen: dark, with diagonal lines, never coloured by what is there. */
export const UNKNOWN_LOOK = { colour: '#1d1916', ink: '#3a332d' };

/** Colours of the marks drawn on top of tiles. */
export const MARK_COLOURS = {
  support: '#e8e0d0',
  otherStructure: '#60d0ff',
  traces: '#ffd84a',
  /** The outline of the square a refused tap was on. */
  selected: '#ffe14d',
  /** The outline of a neighbour that is too high for the level rule. */
  tooHigh: '#ff4a3a',
  /** Water standing on a square: a blue wash with wave lines, and its units. */
  water: 'rgba(40, 120, 230, 0.6)',
  waterInk: '#d6ecff',
  /** Lava standing on a square: an orange wash with flames, and its units. */
  lava: 'rgba(255, 96, 16, 0.75)',
  lavaInk: '#fff0a0',
  /** Gas standing on a square: a green-yellow wash with rings, and its units. */
  gas: 'rgba(170, 200, 40, 0.5)',
  gasInk: '#f2ffb0',
  /** A placed explosive (a round charge with a fuse) and armed unstable ore (a starburst). */
  charge: '#ff3b3b',
  chargeInk: '#fff3c4',
  /** A square that will be in an explosion when the shift ends: a dashed frame. */
  blast: '#ffd21f',
  /** The dark edge under the numbers and marks of water and lava. */
  fluidOutline: 'rgba(0, 0, 0, 0.8)',
  /** The outline of a square a mine would make unstable. */
  unstable: '#ff9a2e',
  /** The outline of a square that stops a camp being founded on its patch. */
  blocked: '#ff4a3a',
  /** A camp square: the tent, and the wash under it. */
  camp: '#ffe9a8',
  campOutline: 'rgba(0, 0, 0, 0.8)',
  campWash: 'rgba(255, 233, 168, 0.28)',
  /** The corner tick on a square where mining is cheaper near a camp. */
  cheaper: '#7dff9a',
  /** A crack on a top block, and the countdown beside it. */
  crack: '#ff5a3c',
  /** A crack whose countdown has stopped (the square is stable or held). */
  crackStopped: '#c9c2b8',
  crackOutline: 'rgba(0, 0, 0, 0.8)',
  /** The shadow a higher neighbour casts on a lower square. */
  wallShadow: 'rgba(0, 0, 0, 0.5)',
  depthNumber: '#ffffff',
  depthNumberOutline: 'rgba(0, 0, 0, 0.75)',
  grid: 'rgba(0, 0, 0, 0.35)',
};
