# Security

## Reporting a vulnerability

Please report it privately: **[open a security advisory](https://github.com/fabkho/regal/security/advisories/new)** on GitHub (Security → Report a vulnerability). Don't open a public issue.

## What Regal is, security-wise

- **The layer** renders a [Regal library file](docs/library-file.md) in the browser. It registers no server routes and keeps nothing in the browser (no cookies, no storage). Text from the file is rendered as text, never as HTML. Image references are restricted to `http(s)` URLs (no `data:`, no `javascript:`), validated before anything is shown.
- **The viewer's `?src=`** and the playground's URL and file loader read a file the visitor names, in the browser only; the server never fetches it. A dropped file is read in the tab and never uploaded or kept.
- **Regal assets** (`pipeline/`) runs locally or in CI and calls third-party APIs (cover lookups, Gemini, R2). Its credentials (`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `REGAL_EXPORT_TOKEN` …) live in the environment or in GitHub Actions secrets, never in the repository.

## Privacy

Real reading data (Goodreads exports, personal library files, reviews, private notes) and publisher images never belong in this repository: `pnpm check:privacy` fails on the usual files, CI runs it, and fixtures are synthetic.
