// UI lab 2 (issue #118): how the fog, the camps and their cues look.
// Presentation only: nothing here is a rule, so it lives with the screen,
// not in src/data. The camps' radii and costs are in src/data/labCamps.ts.

export const CAMP_LOOK = {
  /**
   * Squares across the map when a world opens, centred on the first camp:
   * about 26 px a square on a 390 px phone, big enough to tap. A level-1 ring
   * (radius 9, 19 across) runs past the sides; the map drags and pinches to
   * show the rest (decision note 0046).
   */
  startCells: 14,
  /** How far the soft edge of the lit ring reaches into a lit square, as a part of the square. */
  edgeWidth: 0.55,
  /** How dark the soft edge is, right at the border. */
  edgeAlpha: 0.55,
  /** How far the lantern light spills into the fog, as a part of the square. */
  spillWidth: 0.6,
  /** How bright the spill is, right at the border. */
  spillAlpha: 0.16,
  /** Greyed squares (seen once, out of range now): how much darker than lit ones. */
  greyedDim: 0.5,
  /** The camp marker's radius, as a part of the square. */
  markerRadius: 0.62,
  /** How long the "needs a level 2 camp" cue lasts, in milliseconds. */
  tooHardMs: 1100,
  /** How long the ring that spreads from a new or upgraded camp takes, in milliseconds. */
  ringMs: 900,
  /** How long an animal takes to slide to where End shift moved it, in milliseconds. */
  animalSlideMs: 400,
  /** How long a dragon takes to glide, in the morning, along its night's flight (hazards PR 4). */
  dragonFlightMs: 1400,
  /** How long a dragon takes to glide the square it flies on each mining tap. */
  dragonStepMs: 350,
  /** How long the pulse on the square a new camp would go on takes, once round, in milliseconds. */
  targetPulseMs: 1200,
};

export const CAMP_MARKS = {
  /** Fog: never seen. */
  fog: '#0b0a09',
  /** The faint pattern in the fog. */
  fogMottle: 'rgba(255, 240, 220, 0.045)',
  /** The thin line along the border of the lit area. */
  border: 'rgba(255, 196, 112, 0.75)',
  /** The light that spills from the lit area into the fog. */
  spill: '255, 190, 110',
  /** The camp marker: its disc, its ring, the tent, and the level tag. */
  markerDisc: '#2b1d12',
  markerRing: '#f1b85a',
  tent: '#f7e4c2',
  tentDoor: '#2b1d12',
  levelTag: '#f1b85a',
  levelText: '#1b1209',
  /** A camp's 3 x 3 base. */
  baseWash: 'rgba(241, 184, 90, 0.16)',
  /** "Ground not level": the footprint's outline, and the wash on the squares at another depth. */
  notLevel: '#ff6b4a',
  /** A dark band under the refused outline, so it stands out on any ground, clay's red included. */
  notLevelHalo: 'rgba(20, 10, 6, 0.85)',
  notLevelWash: 'rgba(255, 107, 74, 0.35)',
  /** The ring drawn round a selected camp, or round where a new camp would go. */
  ring: 'rgba(255, 204, 120, 0.95)',
  /** The wash over squares a new camp would light up. */
  previewWash: 'rgba(255, 214, 150, 0.22)',
  /** A held long press: the squares it would dig, and the 3 x 3 round them. */
  digWash: 'rgba(255, 176, 74, 0.45)',
  digOutline: '#ffb04a',
  /** The square a new camp would go on. */
  target: '#ffd27a',
  /** "Needs a level 2 camp": the lock, its wash, and its label. */
  tooHard: '#86c8ff',
  tooHardWash: 'rgba(134, 200, 255, 0.28)',
};
