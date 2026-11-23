# 0063: The market scene, and saplings only from the market

Date: 2026-11-23. The owner, after the progression playtest build (engine 0.9.0), before playing it:

> Let's make the market only available after the night scene after the prescribed number of days. Night scene then market opens. You take your market actions then it closes and the day starts. That's the only time the market is available. Saplings are only available from the market. Apple saplings are also available.

## What changed (engine 0.10.0)

- **The market is a scene between the night and the day.** A market day still comes every 10, 5 or 3 shifts by the best camp's level. The End shift that starts one opens the market (`marketOpen` in the state). While it is open only market actions can be taken: selling, buying and taking a contract, none of which costs a tap, since they come before the day. Closing it (`closeMarket`) starts the day, and the market cannot be opened again until the next market day. A run saved with its market open opens it again when the game opens.
- **Contracts:** one is taken only at the market. Delivering and dropping are day actions, from a new goals card (🎯 in the tray, where the 🏪 button was), which also shows the phase, its goal, and when the market opens next.
- **Saplings and apple saplings come only from the market** (3 and 6 coins). Felled trees no longer give saplings, and the recipe book no longer makes apple saplings from apples. `treesFelled` still counts trees felled.
- **Undo:** the market's trades can be undone while it is open; closing it starts a new Undo history, as End shift does.

## The simulator

The policies close the market as soon as they have nothing more to trade; the gatherer and careful policies buy saplings (two at a time) when they hold none. The full-run golden run moved from seed 3 to seed 4, whose run reaches every step the coverage check asks for (seed 3's no longer places a deep camp or reaches level 4). No long simulator runs were made for this change (owner: "Don't do any playthroughs or play tests").
