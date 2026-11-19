# 0018 — Early phone preview: a tap screen and a debug Android build

Date: 2026-11-19. Status: accepted (owner approved issue #64 as a side task outside the milestone order).

## Decision

- **The play tool's view code is shared.** `view.ts`, `describe.ts`, `log.ts`, `missing.ts` and `symbols.ts` moved from `tools/play/` to `src/app/text/`, so the web build can import them; `turn.ts` there holds the one-choice step both use. `tools/play/` keeps only what needs Node (`cli.ts`: arguments and files; `help.ts`). The play tool's output is byte-for-byte unchanged. `src/engine` does not import from `src/app` (ESLint enforces it).
- **The web page is the preview screen** (`src/app/preview.ts`) until M3: the play tool's gauges, map, hazards, forecast and "what came of it" lines, and one button per choice. It changes the game only through the choice list (`applyAction` / `endShift`).
- **A run is saved as its play log** in `localStorage` (the same JSON as `npm run play -- --log`), and resumed by replaying it. A log that no longer replays (the rules changed) is dropped with a note to the player.
- **Capacitor 8.6.2 and its Android project were added now**, ahead of M4, for a debug APK only. The Android project in `android/` is committed as Capacitor generated it; only its web-asset copy is ignored. `.github/workflows/android-preview.yml` builds the APK on every push to `main` and publishes it on a rolling pre-release tagged `android-preview`. No signing secrets and no Play upload: those stay in M4.
- **One fixed, public debug key** (`android/app/debug-preview.keystore`, alias `androiddebugkey`, passwords `android`) signs every preview build (coordinator's answer to the PR #65 question), so a new APK installs over the last and keeps the saved run. It is for the debug preview only and is never used for Play; M4 adds a separate, secret upload key.

## Consequences

- M3 replaces the preview screen; `src/app/text/` may stay for the play tool or move back.
- M4 adds release signing and `android.yml` on top of the same `android/` project.
