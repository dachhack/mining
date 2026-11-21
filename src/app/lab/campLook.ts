// UI lab 2 (issue #118): how the fog, the camps and their cues look.
// Presentation only: nothing here is a rule, so it lives with the screen,
// not in src/data. The camps' radii and costs are in src/data/labCamps.ts.

export const CAMP_LOOK = {
  /** Squares across the map when a world opens: the first camp's ring and a little fog around it. */
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
  markerRadius: 0.4,
  /** How long the "needs a level 2 camp" cue lasts, in milliseconds. */
  tooHardMs: 1100,
  /** How long the ring that spreads from a new or upgraded camp takes, in milliseconds. */
  ringMs: 900,
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
  /** The ring drawn round a selected camp, or round where a new camp would go. */
  ring: 'rgba(255, 204, 120, 0.95)',
  /** The wash over squares a new camp would light up. */
  previewWash: 'rgba(255, 214, 150, 0.22)',
  /** The square a new camp would go on. */
  target: '#ffd27a',
  /** "Needs a level 2 camp": the lock, its wash, and its label. */
  tooHard: '#86c8ff',
  tooHardWash: 'rgba(134, 200, 255, 0.28)',
};
