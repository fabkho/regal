# Agent notes

- Stack: Nuxt 4, TresJS (`@tresjs/nuxt`, `@tresjs/cientos`), three.js, GSAP, papaparse, Vitest + `@nuxt/test-utils`. pnpm.
- Vocabulary: see `CONTEXT.md`. Use its terms.
- Issues: see `docs/agents/issue-tracker.md`.
- Design: paper-ink design language (warm paper `#F5F2EB`, ink `#2C2C2A`, one brick-red accent `#B93E2E`, IBM Plex Mono). Source of truth for tokens: `~/code/portfolio/app/assets/css/main.css`.
- Privacy: never commit a real Goodreads export. Personal exports contain reviews and private notes. Fixtures must be synthetic or sanitized.
- Don't run full typechecks unless asked; use targeted checks.

## Commands

- `pnpm dev`, `pnpm build`
- `pnpm lint` / `pnpm lint:fix` (ESLint stylistic: 2 spaces, no semicolons, single quotes, trailing commas)
- `pnpm test` (all), `pnpm test:unit`, `pnpm test:e2e`
- Test layout: `tests/unit` (pure modules, node env), `tests/nuxt` (Nuxt runtime env), `tests/e2e` (`@nuxt/test-utils/e2e`, builds the app)

## Page structure

`app/pages/index.vue` is the shell. The 3D scene lives in `BookcaseStage` and its children; upload, summary and list view live in `LibraryPanel` and its children. Keep features inside their own component trees so parallel tickets don't collide.
