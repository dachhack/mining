# Mining Game — Repo and Build Plan (v0.1)

This is the handoff document for Claude Code. Read `game-design-doc.md` first; it is the source of truth for game rules. This document covers the stack, repo layout, conventions, CI, and the order of work. `agent-plan.md` covers how the work is divided among agents, and adds a playtest round to the end of M1–M3.

---

## 1. Goals and constraints

- Ship one codebase to **Android and iOS**, with a **web build** used for day-to-day playtesting.
- All development happens in **GitHub** and **Claude Code cloud sessions**. There is no local machine with a game editor, and no Mac. Everything must be buildable and testable from the command line on Linux, except the iOS build, which runs on a GitHub-hosted macOS runner.
- The owner (Matt) directs the work and reviews pull requests. He is fluent in Python and Git/CI, not in TypeScript, so code and PR descriptions should be readable by a strong engineer who is new to the language.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | |
| Rendering | Three.js | 3D view and slice view |
| Build | Vite | |
| Unit tests | Vitest | Engine tests run with no DOM |
| Browser tests | Playwright | Smoke and screenshot tests |
| Mobile wrapper | Capacitor 8 | Needs Node 22+; use Swift Package Manager for iOS, not CocoaPods |
| Lint / format | ESLint + Prettier | |
| Package manager | npm | |
| CI/CD | GitHub Actions | |
| Store delivery | Fastlane | Play internal testing and TestFlight |
| Web hosting | GitHub Pages | Auto-deployed playtest build |

Confirm current stable versions of each tool when scaffolding, and pin them in `package.json`. App Store uploads currently require Xcode 26 or later, so pin the macOS runner image accordingly.

## 3. Architecture

Three layers, with a one-way dependency: `app → render → engine`. The engine depends on nothing.

### 3.1 `engine/` — the rules

- Pure TypeScript. **No DOM, no Three.js, no timers, no `Math.random`, no `Date`.**
- State is a plain serialisable object. The public surface is roughly:
  - `createRun(seed, contractId, loadoutId) → GameState`
  - `legalActions(state) → Action[]`
  - `applyAction(state, action) → { state, events }`
  - `endShift(state) → { state, events }` (runs the cube phase and upkeep)
  - `previewCubePhase(state) → ShiftForecast` (`{ hazards, upkeep }`: what the cube phase will do to known hazards, and what upkeep will do to fuel (banked AP was removed by the owner's decision in issue #32); throws once the run has ended, as `endShift` does)
- All randomness comes from a seeded PRNG stored in the state. Same seed plus same action list must give an identical final state (this is a tested invariant).
- The cube is stored in typed arrays (32,768 cells): block type, revealed flag, fluid level, gas level, structure id.
- `events` are a list of things that happened (block mined, block fell, water advanced, damage taken). The renderer animates from events; it never inspects engine internals.

### 3.2 `render/` — drawing

- Reads `GameState` and `events`; never mutates state.
- Slice view (primary) and 3D cube view (secondary). Use instanced meshes or greedy meshing; only exposed faces need drawing.
- Must hold 60 fps on a mid-range phone. Budget: one draw call per block type per view is fine.

### 3.3 `app/` — UI and platform

- Screens: title, contract select, run, run summary, unlock office, log.
- Input handling, HUD, save/load, settings.
- Platform adapters (storage, haptics, safe-area insets) behind small interfaces so the web build and the Capacitor build share everything else.

### 3.4 `data/` — content

- **Every number and recipe in the design doc lives here** as JSON or TS constants: block definitions, recipes, hazard parameters, contract templates, unlocks, loadouts.
- Validate data files with a schema at build time.

## 4. Repo layout

```
/
├─ CLAUDE.md                 # conventions for Claude Code sessions (see section 9)
├─ README.md
├─ docs/
│  ├─ game-design-doc.md     # copy of the design doc; keep in sync
│  ├─ repo-plan.md           # this file
│  ├─ agent-plan.md          # roles and loop for agent development
│  ├─ agents/                # one brief per agent role
│  ├─ playtests/             # playtest reports, play logs, evaluations
│  ├─ milestones/            # the coordinator's summary for each milestone
│  ├─ owner-questions.md     # design questions waiting for the owner
│  └─ decisions/             # short ADRs, one per significant decision
├─ src/
│  ├─ engine/
│  │  ├─ state.ts
│  │  ├─ rng.ts
│  │  ├─ generation/         # cube and contract generation
│  │  ├─ actions/
│  │  ├─ hazards/            # cave-in, water, gas, lava, unstable ore
│  │  ├─ camps.ts
│  │  ├─ pathing.ts          # reachability, entombment check
│  │  └─ index.ts
│  ├─ render/
│  ├─ app/
│  └─ data/
├─ tests/
│  ├─ engine/                # unit and scenario tests
│  ├─ golden/                # seed + action log → expected state hash
│  └─ e2e/                   # Playwright
├─ tools/
│  ├─ sim.ts                 # headless CLI: play a seed with a scripted or random policy
│  ├─ play.ts                # text play interface: shows only what a player could know
│  └─ ascii.ts               # print a layer as text for debugging
├─ android/                  # Capacitor (added in M4)
├─ ios/                      # Capacitor (added in M5)
├─ fastlane/
└─ .github/workflows/
```

## 5. Testing strategy

1. **Unit tests** for each rule: movement, gravity, each hazard, crafting, camps.
2. **Scenario tests:** Build a tiny hand-made cube (e.g. 5×5×5) in a test, apply actions, assert on outcomes. Every hazard rule in the design doc gets at least one scenario.
3. **Determinism tests:** Same seed and action log → same state hash. Run on every PR.
4. **Property tests:** For random seeds and random legal action sequences, the engine never throws, never produces an illegal state, and never soft-locks (either a legal action exists or the run has ended).
5. **Golden runs:** A few recorded full runs. A changed hash means rules changed; the PR must say so and update the golden file deliberately.
6. **Simulation tool:** `npm run sim -- --seed 123 --policy random --runs 1000` reports death causes, run lengths, and resource totals. This is the balance-tuning tool.
7. **Playwright:** Load the web build, start a run from a fixed seed, perform a scripted sequence, and compare screenshots. If the cloud session cannot download Playwright's browsers, run these in CI only.

## 6. CI/CD

| Workflow | Trigger | Runner | Does |
|---|---|---|---|
| `ci.yml` | Every PR and push to `main` | Linux | Install, lint, type-check, unit tests, determinism tests, build, Playwright smoke |
| `pages.yml` | Push to `main` | Linux | Build web and deploy to GitHub Pages |
| `preview.yml` (optional) | PR | Linux | Deploy a per-PR preview and comment the link |
| `android.yml` | Tag `v*` or manual | Linux | Build signed AAB, upload to Play internal testing via Fastlane |
| `ios.yml` | Tag `v*` or manual | macOS | Build, sign, upload to TestFlight via Fastlane |

macOS runner minutes cost more than Linux minutes on private repos, so the iOS workflow should run only on tags or manual dispatch.

### 6.1 Secrets (added by the owner, never committed)

- Android: upload keystore (base64), keystore password, key alias, key password, Play service-account JSON.
- iOS: App Store Connect API key (key id, issuer id, `.p8`), signing certificate and provisioning profile (or a Fastlane `match` repo and its passphrase).

## 7. Owner prerequisites (manual, outside Claude Code)

These block M4 and M5 only. M0–M3 need none of them.

1. Create the GitHub repo and connect it to Claude Code.
2. Enable GitHub Pages (source: GitHub Actions).
3. Choose an app id (e.g. `com.<name>.mininggame`) and a display name.
4. Google Play developer account; create the app; create a service account for uploads.
5. Apple Developer Program membership; create the app record in App Store Connect; create an API key.
6. Add the secrets in section 6.1.

## 8. Milestones

Each milestone is one or more PRs. Do not start a milestone until the previous one's acceptance criteria pass in CI.

### M0 — Scaffold
- Vite + TypeScript strict + ESLint + Prettier + Vitest. `ci.yml` green. `CLAUDE.md` and `docs/` in place.
- **Accept:** `npm run build` and `npm test` pass in CI; an empty page deploys to Pages.

### M1 — Engine core (no graphics)
- State model, seeded RNG, cube generation (blocks and veins only), movement, gravity, mining, reveal rules, AP and shifts, fuel upkeep, field crafting, inventory and weight.
- `tools/ascii.ts`, `tools/sim.ts` (with `--json` metrics output), and `tools/play.ts` (the text play interface for playtest agents; see `agent-plan.md` section 3.1).
- **Accept:** A scripted test digs from the surface to layer 8 on a fixed seed. Determinism and property tests pass.

### M2 — Hazards and camps
- Cave-ins and supports, water, gas, lava, unstable ore; hazard forecasts; avatar health and air; all death conditions including entombment; camps (founding, smelting, crafting, stash, air line, destruction).
- **Accept:** One scenario test per hazard rule and per death cause. 1,000 random-policy simulated runs complete without an exception or soft-lock.

### M3 — Playable web build
- Slice view, 3D view, tap-to-select and confirm, HUD, end-shift preview, autosave and resume, a minimal title screen with seed entry.
- Placeholder art (flat colours and simple icons) is fine.
- **Accept:** A full dig is playable on a phone browser from the Pages URL. Playwright smoke test passes. 60 fps on a mid-range phone.

### M4 — Contracts, escape, and Android
- Contract generation and selection, deliverables, survey hints, keystone trigger, Act 2 escalation, run outcomes and summary screen.
- Add Capacitor and the Android project; `android.yml`.
- **Accept:** A complete run (contract → keystone → escape → payout) is playable. A signed build reaches Play internal testing.

### M5 — Unlocks and iOS
- Credits, unlock office, at least 3 unlocks per track, miner's log, run history.
- Add the iOS project; `ios.yml`.
- **Accept:** Unlocks persist across runs and app restarts. A build reaches TestFlight.

### M6 — Balance and polish
- Tutorial run, balance pass using `sim`, art and audio pass, daily seed, accessibility (colour-blind-safe hazard tells, text size), store listing assets.

## 9. `CLAUDE.md` starter

Put this at the repo root in M0 and keep it current.

```markdown
# Mining Game — conventions

## Source of truth
- Game rules: docs/game-design-doc.md. Items marked [Decided] must not change without the owner's approval. Items marked [Default] may be tuned, but only in src/data.
- If the code and the design doc disagree, stop and ask; then update whichever is wrong in the same PR.

## Architecture rules
- src/engine imports nothing from src/render, src/app, three, or the DOM.
- No Math.random, Date.now, or timers in src/engine. Use the seeded RNG in state.
- No gameplay numbers in code. Put them in src/data.
- The renderer never mutates game state.

## Working agreement
- One milestone task per PR. Small PRs.
- Every rule change comes with a test. Every bug fix comes with a failing test first.
- If a golden-run hash changes, say so in the PR description and explain why.
- Run before pushing: npm run lint && npm run typecheck && npm test
- PR descriptions: what changed, how it was tested, and any design question raised.
- Record significant decisions in docs/decisions/ as short notes.

## Commands
- npm run dev        # local web build
- npm test           # unit, scenario, determinism tests
- npm run sim        # headless simulation
- npm run e2e        # Playwright
- npm run build      # production web build
```

## 10. First prompt for Claude Code

> Read `docs/game-design-doc.md` and `docs/repo-plan.md`. Do milestone M0 only: scaffold the repo as described in sections 2–4, add `CLAUDE.md` from section 9, set up `ci.yml` and `pages.yml`, and open a pull request. Confirm current stable versions of each tool and pin them. Do not start M1. List any questions or ambiguities you found in the two documents in the PR description.

Then, for each later milestone: "Do milestone M*n* from `docs/repo-plan.md`. Split it into small PRs. Ask before changing anything marked [Decided]."

## 11. Risks

- **Touch selection in 3D:** Mitigated by making the slice view primary. Validate on a real phone at M3 before building more UI.
- **Rule complexity (supports, fluids):** Keep rules simple enough to explain in one sentence each; the scenario tests are the specification.
- **iOS signing in CI:** The most likely place to lose time. Left until M5 so it does not block gameplay work.
- **Cloud session limits:** If a session cannot reach a download host (e.g. Playwright browsers), move that step to CI and note it in `CLAUDE.md`.
- **Scope:** M1–M3 are the game. If the core dig is not fun at M3, change the design before doing M4.
