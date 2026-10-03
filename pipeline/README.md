# Regal assets

A Regal library file in, the same file with its Books' images and colours out, plus the images, optionally published to R2. The long-lived half of the old asset build: whatever writes the library file (Libellus today), the portfolio keeps its high-resolution fronts, photographed or generated Spines and backs, Stack copies and colours.

Its own package: own `package.json` and lockfile, installed with `pnpm --dir pipeline install`, never by a host that extends the Regal layer. It imports the layer's library-file types and validator and two pure display helpers (Spine colours, Book sizes) by relative path (`src/layer.ts`).

```bash
pnpm --dir pipeline assets --in <file|url> [--out <dir>] [--dry-run] [--no-ai] [--publish v2] …
pnpm --dir pipeline test        # offline: lookups, Gemini and the uploader stubbed
pnpm --dir pipeline typecheck
```

Options, steps and the daily chain: the root [README](../README.md#producing-the-library-file); the flags are also listed at the top of [`src/cli.ts`](src/cli.ts).

| File | |
|---|---|
| `src/cli.ts` | Arguments → `runAssets` with the real lookups, Gemini and wrangler. |
| `src/run.ts` | One run: validate the input, enrich the Books, AI, write the file, publish. |
| `src/enrich.ts` | One Book: keep what's good enough, look up the rest, pile copies and colours; fingerprint. |
| `src/ai.ts` | AI Spines/backs: stored jackets, Batch API, direct calls. |
| `src/output.ts` | The enriched file, validated; unchanged → not rewritten. |
| `src/publish.ts` | Upload what changed under a prefix (never the bucket root). |
| `src/load.ts` | The input's images: download cache, conditional revalidation. |
| `src/assets/` | Today's asset logic: front chain, photos, jacket, Gemini client, pile copies, blurb, back-cover words. |
| `src/resolvers/` | Cover and description lookups (Open Library, Google Books, Apple). |

Real data stays local: the cache and the output live under the repo's `.data/` (gitignored, refused by `pnpm check:privacy`).
