# Agent notes

- Stack: Nuxt 4, TresJS (`@tresjs/nuxt`, `@tresjs/cientos`), three.js, GSAP, papaparse, Vitest + `@nuxt/test-utils`. pnpm.
- Vocabulary: see `CONTEXT.md`. Use its terms.
- Issues: see `docs/agents/issue-tracker.md`.
- Design: paper-ink design language (warm paper `#F5F2EB`, ink `#2C2C2A`, one brick-red accent `#B93E2E`, IBM Plex Mono). Source of truth for tokens: `~/code/portfolio/app/assets/css/main.css`.
- Privacy: never commit a real Goodreads export. Personal exports contain reviews and private notes. Fixtures must be synthetic or sanitized.
- Don't run full typechecks unless asked; use targeted checks.
