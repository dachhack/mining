# 0045 — Keep the labs clear of Android's system bars

Date: 2026-11-22. Status: implemented (PR #124). This is a follow-up to 0044, after the owner's playtest of the APK from PR #123: "Can't place the new camp." There are no game rule, data, engine or golden changes.

## What was wrong

- Android 15 and later draws an app edge to edge, under the status bar and the gesture bar.
- `#app` (in `index.html`) was padded by the bars' insets, but the lab inside it was still a full `100dvh` tall.
- So the page was taller than the screen by both bars, and the page cannot scroll. On the phone, Place camp sat under the gesture bar.
- Playwright's Chromium has no system bars, so the insets were 0 in every test, and the tests passed at 390 × 844 while the phone failed.

## What changed

- **Insets.** `index.html` defines `--inset-top`, `--inset-right`, `--inset-bottom` and `--inset-left`. Each is the larger of two values:
  - `env(safe-area-inset-*)`, which WebView 140 and later provides;
  - `--safe-area-inset-*`, which Capacitor's SystemBars plugin sets on `<html>`.
- **Padding and height.** `#app` is padded by these insets. The labs' height is `100dvh` minus the top and bottom insets, so a lab fills exactly the part of the screen the bars leave free, and the map gives way.
- **Hint.** While placing a camp with a spot chosen, the hint says "Tap Place camp to build here, or tap another spot." It no longer goes back to "Tap to gather and dig".
- **Tests.** New e2e tests set `--safe-area-inset-*` on `<html>`, as Capacitor does on the phone. They run at 390 × 844, 390 × 780, 360 × 700 and 915 × 412, with status-bar and gesture-bar insets of 24 to 48 px. They check that:
  - the page is no taller than the screen;
  - the top bar, the tray and Place camp all lie inside the free area;
  - a tap on Place camp places the camp.
- **Checked against the old code.** With main's lab height, these tests fail: the page is 56 to 80 px taller than the screen, as on the phone.
