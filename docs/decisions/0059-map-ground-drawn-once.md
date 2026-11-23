# 0059: The map's ground is drawn once, and again only where it changes

Date: 2026-11-23. The owner's playtest of 8842e83: "The game starts to slow down when the full map is revealed."

- **What was slow.** Every frame redrew every square in view, including the frames of the short cue after each tap. Zoomed out on a fully revealed map, that meant all 1,024 squares, plus a radial gradient for each fog patch, on every frame. The engine was not the cost: each tap's engine work is small next to the drawing.
- **The ground layer.** The ground is fog, blocks, plants, greyed squares and the lit edge. It is drawn into an offscreen canvas, and each frame copies that canvas, then draws what moves on top: animals, the place preview, camps and effects. The ground is drawn again only when the world, what is seen, or the camera changes.
- **Pans shift the ground.** The ground reaches 160 css pixels past each side of the view and is drawn for the camera as it was then. While a pan stays within that margin, each frame only copies the ground shifted by whole device pixels. When the pan nears the margin's edge, or 150 ms after it stops, the ground is drawn whole for where the camera is. A zoom draws it whole too.
- **Only the part that changed.** When only the world changes, `drawGround` compares every square's look (top block, depth, plant, apples, stump, sight) with the last drawing. It draws again only the squares that changed, plus 3 squares around them, plus 3 more beyond those (clipped), because neighbours' shadows, forest edges, glow and fog patches spill that far. The clip sits on whole device pixels. A zoom, or a new canvas size, draws the whole ground.
- **Fog patches** are not drawn where every square within 2 is lit or greyed, since those squares cover them.
- **Measured** in Chromium on a 390 × 844 screen with 4× CPU throttling, fully revealed and zoomed out, over 12 taps:
  - main-thread blocking per tap went from three long tasks of about 1.3 s in all to one of 50–90 ms;
  - animation frames went from 24 rendered (median 105–129 ms of script) to about 250 (1.8 ms);
  - panning (412 × 915 at 2.625 device pixels per css pixel, a Pixel-sized screen): a pan of 64 small moves went from 17.6 s of long tasks (26 s zoomed out) to none, and a long pan of 164 moves from 48 s to 4.5 s. The 4.5 s is the full redraw each time the pan crosses the margin, about 0.6 s at 4× throttling, every 160 px.
- **Guarded by** `tests/e2e/fullMap.spec.ts`. It counts the ground draws a tap causes (exactly 1, a part, and none in its cue), checks that a short pan causes none until it stops and then exactly one, and checks that a ground drawn in parts matches one drawn all at once, within a few levels in 255 of rasteriser rounding.
- No rules or engine code changed.
