# 0076: A guided first run, and accomplishments worth family glory

The owner, after the 0.26.0 build: "Next, we need a short tutorial mode. We
also need a accomplishment system." Asked, the owner chose:

- the tutorial is a **guided first run** (not a separate level, not tips
  alone), teaching **the basics** in about 8 steps, with a one-time tip for
  each later thing;
- accomplishments are **per run**, each worth **family glory**.

What was built:

- **Accomplishments are in the engine** (`feats` in the state, version 28;
  feats.ts): earned by the action that does it, saved with the run, replayed
  with it, and checked by the simulator (only ever added, each once, exactly
  those the outcome names). The list, the glory and the standings are data.
  Three are read from what the action reports (a dragon driven off, a raid
  turned away, a square dug to a depth); the rest from the state after.
- "All 8 relics held at once" (60 glory, the most) and "a keystone brought
  up" give a reason to bring heirlooms home and not sell them, a first answer
  to question 206. The score is still coins.
- The best glory of any run is kept on the phone, outside the run, so a
  per-run list still gives something to beat.
- **The tutorial is the screen's** (tutorial.ts for the words and logic,
  campScreen.ts for the card): it reads the run and never acts on it. Its
  step and the tips seen are kept in the phone's storage, apart from the run.
