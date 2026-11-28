# 0079: Between taps, only what changed is drawn

The owner, after note 0078: "Let's do the bigger change of just redrawing
things that change between taps."

Three changes, all in the screen (`src/app/lab/campScreen.ts`); no rule and
no state changed.

- **A smaller part of the ground is drawn for a tap.** A changed square can
  change its neighbours' look (the shadow on a shared edge, a forest's edge)
  and each square paints a little past its own edge. So the part drawn again
  is the changed squares and 2 squares round them (`GROUND_REACH`), with 1
  more ring drawn to fill the clip rightly (`GROUND_SPILL`): 7 x 7 squares
  for one tap, where it was 13 x 13.
- **What stands still is kept as one picture** (`still`): the ground, the
  animals, the dragons and the camps. A frame of a cue's animation copies it
  and draws only the cue and the fires on top. It is not used while an
  animal slides, a dragon flies, the camera moves, or a preview is shown
  (placing, a held dig): those frames are drawn in full as before, so
  nothing looks different. The frame a tap changes the world on is also
  drawn straight to the screen; the picture is made on the next frame, off
  the tap's own time.
- **The legend under the map is kept** until a new kind of square comes into
  sight; its icons were drawn again on every tap.

Measured as in note 0078 (Chromium, CPU slowed 4 times, a fully revealed map
holding every item, 14 taps):

|                 | tap to paint | in the tap's handler | drawing, all frames of a tap |
| --------------- | ------------ | -------------------- | ---------------------------- |
| 0.28.0 build    | 190 ms       | 98 ms                | —                            |
| after note 0078 | 154 ms       | 78 ms                | 113 ms                       |
| after this note | 127 ms       | 53 ms                | 67 ms                        |

The test machine draws on the CPU; a phone copies pictures on its graphics
chip, so the copies that are now most of what is left should cost less there.

Checked by `tests/e2e/fullMap.spec.ts`: after eight taps, the map drawn in
parts and through the kept picture is the same picture as the map drawn all
at once (a handful of pixels on clip edges differ by a few levels, as they
did with the wider part).
