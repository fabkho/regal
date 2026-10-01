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

## Nuxt layer

Regal is also a Nuxt layer (README: "Use Regal as a Nuxt layer"; the portfolio's `/books` extends it). Keep it host-safe:

- Standalone-only setup (global CSS `main.css`, head, `@nuxt/eslint`, test-utils, the dev choices panel and `server/dev/*` API) lives in the `regalApp` module in `nuxt.config.ts` and runs only when Regal is the root app. Don't add globals to the plain config keys.
- Host API: `RegalBooksStage`, `RegalBooksSidebar` (`app/components/regal/`), config `runtimeConfig.public.regal` (`mode`, `librarySrc`, `assetsBase`). Keep it small; document changes in the README.
- Component CSS: tokens always with a fallback, `var(--color-ink, #2C2C2A)`; no reliance on global classes (`.btn`) in anything the embed components render.
- In `app/`, import shared code as `~~/shared/...` (layer-aware), never `#shared/...` (that is the host's).
- Runtime packages go in `dependencies` (hosts install the layer with `{ install: true }`).
- Look decisions: `DECIDED_LOOK` in `useDevChoices.ts`, read through `useLook()`.
- `tests/e2e/layer-host.test.ts` builds `tests/fixtures/layer-host/` (synthetic data only).

## Dependencies

- Before installing any npm package, look up the latest version with pnpm (`pnpm view <pkg> version`; check `pnpm view <pkg> peerDependencies` when compatibility matters) and install that exact latest: `pnpm add <pkg>@<latest>`. Applies to one-off tooling too (use `pnpm dlx` / pnpm in scratch dirs, not npm/npx with guessed versions).
- Only pin below latest for a verified incompatibility, and record it here.

Pinned below latest:

- `typescript` 6.x (latest 7.x): TS 7 ships no JS compiler API (`ts.createProgram` is undefined), which `vue-tsc` needs, and `typescript-eslint` peer range is `<6.1.0`. Re-check when either supports 7.

## Asset pipeline

`pnpm assets:build` builds asset sets (front, blurb, AI back/spine) for the latest N finished Books from the reading-tracker CLI (`~/code/reading-tracker-cli`, override with `READING_TRACKER_CLI`) or `--from <export>`. Always `--dry-run` first: it prints the Gemini cost. Needs `GEMINI_API_KEY` (billing on). Output goes to `public/book-assets/` (gitignored: derived from publisher covers and personal data). `--recrop` re-cuts stored jackets for free; `--no-ai` does fronts and blurbs only.
