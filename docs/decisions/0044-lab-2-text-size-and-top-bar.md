# 0044 — Phone text size off, a one-row lab top bar, and reviews paused

Date: 2026-11-22. Status: implemented (PR #123). Owner's answers to questions 136 and 137, from the bug report "Place camp doesn't show" in Lab 2. No game rule, game data number or golden hash changes; `ENGINE_VERSION` stays 0.4.0, and nothing under `src/engine` changed.

## What

- **The phone's text size is off in the Android app** (question 136). `MainActivity` sets the WebView's text zoom to 100%, so the app always uses its own sizes. With it on, Android scaled every font in the page, and Lab 2's fixed-height tray cut off its buttons.
- **Lab 2's layout copes with large text and with a phone on its side anyway**, because the web build still follows a browser's own text-size setting:
  - the tray is at least 164px, as before, but as tall as its content needs, and the map gives way;
  - a short landscape screen puts the map on the left and the bar, counter, hint and tray on the right, the tray at the bottom;
  - Place camp never shrinks, and when it is off it is an outlined button and the line says why ("Need 5 more wood and 5 more grass").
- **The shared lab top bar is always one row** (question 137), in Lab 1 and Lab 2:
  - the back button, the title box and "New world" side by side;
  - the title box has two lines: the title, then the subtitle and seed, each cut off with "…" rather than wrapped;
  - its text grows with the page's text size only up to a cap (`min(1.25rem, 24px)` and so on), so the bar is 62px high at normal text and at most 68px with any root size.
- **Tests.** The e2e tests set the root font size to 130%, 150% and 200% as a guard, in portrait (390 × 844, 320 × 640) and on its side (915 × 412, 844 × 390, 740 × 360). At each size they check:
  - the top bar is one tidy row;
  - Place camp is whole and inside the tray, on screen, and places a camp when tapped.

## Reviews paused

The owner has stopped the reviewer sessions for now and does all the playtesting themselves; there is no separate reviewer. Until that changes, developers check their own work carefully before pushing:

- `npm run lint && npm run typecheck && npm test`;
- the e2e tests locally;
- screenshots looked at, at the phone sizes above.

## Choices

- **A cap rather than fixed pixel sizes in the top bar.** Text still grows a little with a larger root size, up to the point where the bar would no longer fit one row.
- **The Java change cannot be run here.** The cloud container has no Android SDK. CI's Android build compiles it.
