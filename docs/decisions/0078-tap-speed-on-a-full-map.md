# 0078: A tap on a full map: three wastes removed

The owner, after the 0.28.0 build: "The game still slows down when the map is
full. There is a delay from when you tap to the message and the block
disappears."

Measured in Chromium with the CPU slowed 4 times (about a mid-range phone),
on a fully revealed map holding every item, over 14 taps: 190 ms from the tap
to the next paint, 98 ms of it in the tap's own handler. A profile showed
three things done on every tap, or every frame, that need not be:

- **The counter was built again**: every chip, and every item's icon drawn
  on a new canvas (25 ms). Now the chips stand while the same items are held
  and the lowest camp's level is the same; only the numbers are written.
- **About 25 data attributes were written on the canvas every frame**, some
  after reading every square of the map (27 ms). Now each is written only
  when its value changed, and the world's part only when the world changed.
- **The map's size was read for every square drawn** (`toPx` asks for it).
  Now a frame reads it once.

After: 154 ms to the paint, 78 ms in the handler: about a fifth less. What is
left is drawing: each tap draws the ground round the square again, and each
frame of the cue's animation draws the whole map (the ground copied, then the
animals, camps and buildings). Cutting that further means keeping what does
not move on a layer of its own, a larger change, not made here.
