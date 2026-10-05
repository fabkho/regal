# Agent notes

- Stack: Nuxt 4, TresJS (`@tresjs/nuxt`, `@tresjs/cientos`), three.js, GSAP, Vitest + `@nuxt/test-utils`. pnpm. `pipeline/` (Regal assets) is a separate package: sharp, wrangler, tsx, its own lockfile.
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
- `pnpm typecheck` (vue-tsc via `nuxt typecheck`; CI runs it, don't run it locally unless needed)
- `pnpm check:privacy` fails on tracked real data or publisher images (Goodreads exports, `public/book-assets/`, any `.data/`, databases, CSV/images outside fixtures/docs); `--staged` checks only what a commit adds
- CI (`.github/workflows/ci.yml`, PRs and `main`): privacy check, lint, typecheck, unit tests, then `pipeline/` typecheck and tests. The e2e suite stays local (WebGL in a browser; overkill for CI). Never run a real `regal-assets` (network, Gemini, R2) in CI

## Page structure

`app/pages/index.vue` is the shell. The 3D scene lives in `BookcaseStage` and its children; owner, summary and list view live in `LibraryPanel` and its children. The site is a viewer of one Regal library file (`docs/library-file.md`); the display never reads sources (no importers, resolvers, server routes, upload or localStorage). Keep features inside their own component trees so parallel tickets don't collide.

## Nuxt layer

Regal is also a Nuxt layer (README: "Use Regal as a Nuxt layer"; the portfolio's `/books` extends it). Keep it host-safe:

- Standalone-only setup (global CSS `main.css`, head, `@nuxt/eslint`, test-utils, the dev choices panel, the demo library file served from `demo/`) lives in the `regalApp` module in `nuxt.config.ts` and runs only when Regal is the root app. Don't add globals to the plain config keys.
- Host API: `RegalBooksStage`, `RegalBooksSidebar` (`app/components/regal/`), config `runtimeConfig.public.regal` (`librarySrc`, the library file's URL). The layer registers no server routes. Keep it small; document changes in the README.
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

## Asset pipeline (Regal assets, `pipeline/`)

The layer doesn't make assets. `pipeline/` (own package and lockfile; `pnpm --dir pipeline install`) takes a library file and returns it enriched: `pnpm regal-assets --in <file|url> [--out <dir>] …` (README: "Producing the library file"). Always `--dry-run` first: nothing remote, no Gemini call, the AI cost printed. AI needs `GEMINI_API_KEY` (billing on); `--no-ai`/`--no-model` for free runs. Output, downloads, jackets and state go to `.data/regal-assets/` (gitignored). `--publish <prefix>` writes to R2 under that prefix only (`v2`), never the bucket root.

- Put pipeline code and its tests in `pipeline/src`, `pipeline/tests` (`pnpm --dir pipeline test`, offline with stubbed lookups). It may import the layer's pure files (`shared/`, `app/utils/…`) via `pipeline/src/layer.ts`; the layer never imports the pipeline.
- Sources are not here: Libellus (fabkho/libellus) writes the library file and the workflow `.github/workflows/publish-shelf.yml` (daily, by hand, and on Libellus' `libellus-changed` dispatch) fetches it from Libellus' `regal-export` function and runs `regal-assets --publish v2` (README: "The daily chain"). The old reading-tracker build (`books:daily`) is retired; `pnpm library:convert` (`scripts/library/`) stays as a bridge for v1 published data. Never copy the owner's overrides file, Goodreads exports or their contents into the repo.
