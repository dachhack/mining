# 0056: The switch: the app opens on the new game

Date: 2026-11-22. Plan: Lab 2 becomes the game (`docs/plans/lab2-becomes-the-game.md`), step B1.

- **The app opens on the new game** (no address hash, or `#play`), titled "Mining Game". `#play/110` starts a new run on seed 110.
- **Saving (question 152).** The run is saved in the browser's storage (`mining-game.run`) at the start of every shift: after End shift, Rest and Close mine, and when a new run starts. Reopening the app carries on from the start of the current shift. Taps within a shift are not saved; Undo could take them back anyway. A save from another state version is not read; a new run starts instead.
- **New run** takes two taps while a run is going, since it throws the saved run away.
- **Kept until Phase C** (coordinator: "nothing is lost if the playtest of B1 turns up problems"):
  - the old game, still at `#game`;
  - Lab 1 at `#lab1`;
  - Lab 2 as an unsaved sandbox at `#lab2`, which the e2e tests use for prepared worlds.

  All three are listed under **Other versions** (`#versions`), where the game's back button leads. The plan had `#game` lead to the new game; it stays on the old one until Phase C removes it.
