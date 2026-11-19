# 0010 — An uncontrolled fall costs health from the first block

Date: 2026-11-18. Status: the direction is the owner's answer to question 42 ("a single one-block shaft should be dangerous"); the form below is the coordinator's assumed default for it (issue #34), for the owner to confirm. It changes decision note 0005 item 7. In design doc 5.2 it rewords the first sentence of the fall bullet ("A chosen drop of 1–2 blocks is free") and adds the sentences on uncontrolled falls and on a ladder preventing the fall.

**Changed by 0022 (owner, issue #75):** digging down onto rock is now a safe one-block drop, as in Minecraft (`AVATAR.safeDigDownBlocks`). A dig down that ends in a longer fall is still uncontrolled, counted from where the miner stood, and costs health from the first block as below. A bare one-cell shaft is no longer dangerous in itself; the danger is digging into an unseen open space.

## Context

In playtest round m1-r1 (finding 3, issue #23) the fastest way down was a bare one-cell shaft: mine the block underfoot, drop 1 block for free, repeat. It needed no ladders and no steps and carried no risk, because design doc 5.2 made every fall of 1–2 blocks free.

## Decision

- **Two kinds of descent.**
  - A **chosen drop** is a fall that directly follows a move: walking off a ledge, or climbing down off the bottom of a ladder. Unchanged: only drops of 1 or 2 blocks are offered, and they are free.
  - An **uncontrolled fall** is any other fall. In M1 that is the fall after the miner mines the block it stands on. It costs `AVATAR.uncontrolledFallDamagePerBlock` (1) health for each of the first `freeFallBlocks` (2) blocks; each block beyond those costs `fallDamagePerBlock` (2) as before; `fatalFallBlocks` (6) or more is fatal as before. So 1, 2, 3, 4, 5 blocks cost 1, 2, 4, 6, 8.
- **A ladder in the miner's own cell still holds it** (0005 item 5), so "place a ladder, then mine below" causes no fall and costs no health. That is the safe way to sink a shaft; it costs a ladder and an AP per layer.
- **How gravity knows which kind it is.** `settle(state, events, fallKind)` takes the kind as a third argument. The dispatcher (`applyAction` in `src/engine/index.ts`) passes `'chosenDrop'` when the action was a move and `'uncontrolled'` for every other action; `endShift` passes `'uncontrolled'`. Nothing is stored in the state for it. The order the dispatcher calls the rule modules in (0006) is unchanged.
- **Events.** `fell` carries `kind: 'chosenDrop' | 'uncontrolled'`, so the renderer and the play tool can tell the two apart without redoing the rule. `damageTaken` is unchanged (its cause is still `'fall'`), and death by either kind of fall is still the run-end cause `'fell'`.
- **The play tool** states the cost on the "Mine below you" line, from revealed cells only: "you will fall 1 block and lose 1 health"; "3 blocks or more and lose at least 4 health; below that is unseen" when the bottom is unseen; "FATAL" when the known part of the fall is 6 blocks or would take all the health left. It uses the engine's own `fallDamage`, exported from the public surface for this.

## Consequences

- Sinking a bare one-cell shaft costs 1 health a layer: ten layers kill from full health, and nothing in M1–M2 gives health back except resting at a camp.
- The staircase policy is not affected (it walks off 1-block ledges, which are chosen drops): 1000 of 1000 runs still reach layer 8 unharmed. The `random` and `wander` policies now die of falls (8 and 36 runs in 1000, measured after issue #32 shortened runs), where no run did before.
- Golden runs `wander-seed-9` and `random-seed-25-cut-short` have new hashes: both mine underfoot and now lose health. Every recorded decision is still legal, so they were re-hashed, not re-recorded.
- When M2 adds cave-ins, a fall caused by the cube phase taking the miner's floor is uncontrolled too, with no further change.
- Open points for the owner are in the pull request for issue #34.
