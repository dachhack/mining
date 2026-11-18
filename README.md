# Mining Game

A turn-based roguelike for Android and iOS: mine a 32×32×32 cube from the top down, fulfil a contract, and escape.

- Game rules: [docs/game-design-doc.md](docs/game-design-doc.md)
- Stack, layout, and milestones: [docs/repo-plan.md](docs/repo-plan.md)
- How agents build, playtest, and evaluate it: [docs/agent-plan.md](docs/agent-plan.md)
- Design questions waiting for the owner: [docs/owner-questions.md](docs/owner-questions.md)
- Conventions for contributors and Claude Code: [CLAUDE.md](CLAUDE.md)

## Getting started

Requires Node 22.12 or later.

```bash
npm install
npm run dev
```

See `CLAUDE.md` for the full command list.

## Layout

| Path          | Contents                                                       |
| ------------- | -------------------------------------------------------------- |
| `src/engine/` | Pure, deterministic rules. No DOM, Three.js, timers, or random |
| `src/render/` | Three.js slice and 3D views                                    |
| `src/app/`    | Screens, input, HUD, save/load, platform adapters              |
| `src/data/`   | Every gameplay number and recipe                               |
| `tests/`      | Engine, golden-run, and Playwright tests                       |
| `tools/`      | `sim` and `ascii` debugging CLIs                               |
