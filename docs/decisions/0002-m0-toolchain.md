# 0002 — M0 toolchain and versions

Date: 2026-11-18. Status: accepted.

## Context

The repo plan asks for current stable versions, pinned.

## Decision

- Node 22 (`.nvmrc`), TypeScript 6.0.3, Vite 8, Vitest 5, ESLint 10 with typescript-eslint 8, Prettier 3, Playwright 1.65. Exact versions are in `package.json`; `package-lock.json` pins the rest.
- TypeScript 7 is out, but typescript-eslint 8 supports only TypeScript < 6.1, so we stay on 6.0.x for now.
- Three.js is not installed until M3, when the renderer needs it.
- The engine's purity rules (no render/app/Three.js imports, no `Math.random`, `Date`, timers, or DOM globals) are enforced by ESLint rules scoped to `src/engine/`, not just by convention.
- Vite's `base` comes from `BASE_PATH`, which the Pages workflow sets from `actions/configure-pages`, so the site works at `/<repo>/`.

## Consequences

- A known ReDoS advisory (GHSA-fc5q-39xc-vjpf) in `picomatch`, pulled in by Vite and Vitest, has no fixed release yet. It affects build-time file globbing only and ships nothing to players. Update when a fix is published.
