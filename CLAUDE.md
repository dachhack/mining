# Mining Game — conventions

## Source of truth

- Game rules: docs/game-design-doc.md. Items marked [Decided] must not change without the owner's approval. Items marked [Default] may be tuned, but only in src/data.
- If the code and the design doc disagree, stop and ask; then update whichever is wrong in the same PR.

## Architecture rules

- src/engine imports nothing from src/render, src/app, three, or the DOM.
- No Math.random, Date.now, or timers in src/engine. Use the seeded RNG in state.
- No gameplay numbers in code. Put them in src/data.
- The renderer never mutates game state.
- The first three rules are enforced by ESLint (see eslint.config.js); `npm run lint` fails on a violation.

## Working agreement

- One milestone task per PR. Small PRs.
- Every rule change comes with a test. Every bug fix comes with a failing test first.
- If a golden-run hash changes, say so in the PR description and explain why.
- Run before pushing: npm run lint && npm run typecheck && npm test
- PR descriptions: what changed, how it was tested, and any design question raised.
- Record significant decisions in docs/decisions/ as short notes.
- The owner reads Python fluently but is new to TypeScript: prefer plain, explicit code over clever type tricks, and explain non-obvious TS in comments or the PR description.

## Commands

```bash
npm run dev       # local web build
npm test          # unit, scenario, determinism tests
npm run sim       # headless simulation (stub until M1)
npm run e2e       # Playwright
npm run build     # production web build
npm run format    # apply Prettier
```

## Cloud session notes

- Playwright: the cloud container has a pre-installed Chromium that may not match the pinned Playwright version. Run e2e locally with
  `PW_CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) npm run e2e`.
  CI installs the matching browser itself.

## Pinned versions

- TypeScript is pinned to 6.0.x, not 7.x, because typescript-eslint 8 supports TypeScript < 6.1 only. Revisit when typescript-eslint adds TS 7 support.
