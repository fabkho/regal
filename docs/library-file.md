# The Regal library file (version 2)

The one input Regal's display reads: a JSON file with everything it shows of a Library, the resolved images and colours included, so a page needs one fetch. A **Pipeline** produces it (today [Libellus](https://github.com/fabkho/libellus)); Regal only renders it. Spec: [#37](https://github.com/fabkho/regal/issues/37).

- Types: [`shared/types/libraryFile.ts`](../shared/types/libraryFile.ts). Validator: `validateLibraryFile(data)` / `parseLibraryFile(text)` in [`shared/library/libraryFile.ts`](../shared/library/libraryFile.ts), returning `{ ok: true, library }` or `{ ok: false, errors: [{ path, reason }] }` (`path` like `books[3].assets.palette.text`, `''` for the file itself).
- Examples (synthetic): [`tests/fixtures/library-file/demo.json`](../tests/fixtures/library-file/demo.json) (the demo Library), [`all-fields.json`](../tests/fixtures/library-file/all-fields.json) (every field, set and null), [`minimal.json`](../tests/fixtures/library-file/minimal.json); invalid ones in `invalid/`.
- From old published data (the v1 `library.json` + `manifest.json`): `pnpm library:convert`, a bridge (see [Converting](#converting-old-published-data)).

## Rules

- UTF-8 JSON, one object. A byte order mark is tolerated.
- **Optional** fields may be left out or be `null`; both mean "unknown" and Regal uses the default given below. **Required** fields must be there and valid.
- Unknown fields are allowed and ignored, at any level, so a producer can carry its own (they are not part of the format; a later version may claim the name).
- Strings are plain text (no HTML, no Markdown); newlines in `review` and `description` are kept.
- Dates are calendar days, `YYYY-MM-DD`, without time or zone. `generatedAt` is the only date-time.
- **Image references** are absolute `http(s)://` URLs or URLs relative to the library file's own URL (`9780756413026/front.webp`, `./a.webp`, `/books/a.webp`, `//cdn.example.com/a.webp`), resolved like a link in a page at the file's address. No other schemes (`data:`, `javascript:` …), no spaces (percent-encode them). Images must be loadable cross-origin by the page that shows them (CORS), as they become WebGL textures.
- **Colours** are `#rrggbb` (six hex digits, any case).
- The validator collects every error (the first 100, then a count), except for a wrong `version`, where it stops: a file of another version is not read field by field.

## Top level

| Field | Type | | Meaning |
|---|---|---|---|
| `version` | `2` | required | Format version. Regal refuses any other value. A breaking change bumps it; an added optional field does not. |
| `generatedAt` | string | required | When the file was written: ISO 8601 date-time with `Z` or an offset, e.g. `2026-05-01T06:00:00Z`. |
| `owner` | string | optional | Whose Library it is, as shown to visitors ("Fabian"). |
| `generator` | string | optional | Which Pipeline wrote it (`regal library:convert`, `libellus 1.2.0`). For debugging; never shown. |
| `books` | Book[] | required | The Library, may be empty. Order doesn't matter: Regal sorts. |

## Book

| Field | Type | | Default | Meaning |
|---|---|---|---|---|
| `id` | string | required | | Stable, unique within the file, never reused for another Book. Picks and hovers refer to it, so it should survive re-exports (the tracker's id, not an index). |
| `title` | string | required | | The title without the series part: `Golden Son`, not `Golden Son (Red Rising, #2)`. Not empty. |
| `seriesTitle` | string | optional | none | Series and number as printed under the title: `Red Rising, #2`. |
| `authors` | string[] | required | | Names in credit order, the first is the main author (shown on Spine and records). May be empty (anonymous). |
| `isbn13` | string | optional | none | ISBN-13 of the edition: 13 digits starting `978`/`979`, no hyphens. Printed as the barcode on a drawn back cover. |
| `isbn10` | string | optional | none | ISBN-10: 9 digits and a check digit or `X`, no hyphens. |
| `pages` | integer | optional | none | Page count, ≥ 1. Sets the Book's thickness (unknown: a typical one). |
| `binding` | string | optional | none | `Hardcover`, `Paperback`, `Mass Market Paperback`, `Kindle Edition`, `Audiobook` … Sets the Book's height; shown in the details. |
| `yearPublished` | integer | optional | none | Year this edition was published. |
| `originalYear` | integer | optional | none | Year the work was first published (negative for BCE). |
| `status` | string | required | | Reading status: `read`, `currently-reading`, `to-read`, `dnf` (abandoned), or a custom exclusive shelf (`wishlist`), shown with dashes as spaces. Groups the Books. Not empty. |
| `dateRead` | date | optional | none | Finished reading (the last time, if several). Sorts and groups the Stack by year/month. |
| `dateStarted` | date | optional | none | Started reading (the current or last reading). |
| `dateAdded` | date | optional | none | Added to the Library. Sorts Books without `dateRead`. |
| `rating` | number | optional | `0` | Quarter stars from 0 to 5 (`0`, `0.25`, `0.5` … `5`); `0` = unrated. |
| `review` | string | optional | none | The owner's review. |
| `reviewHasSpoiler` | boolean | optional | `false` | The review gives the plot away: it is hidden behind a click. |
| `readCount` | integer | optional | `0` | How often the Book was finished, ≥ 0. |
| `description` | string | optional | none | The blurb: details panel and the drawn back cover. |
| `publisher` | string | optional | none | Publisher imprint, printed at the foot of a drawn back cover. |
| `genre` | string | optional | none | Shelf category as printed on a back cover (`SCIENCE FICTION`). |
| `quotes` | Quote[] | optional | none | Lines of praise for a drawn back cover; Regal prints the first two. |
| `assets` | Assets | optional | none | Resolved images and colours. Without them Regal draws the Book itself. |

### Quote

| Field | Type | | Meaning |
|---|---|---|---|
| `text` | string | required | The praise, not empty. |
| `source` | string | required | Who said it (`Max Gladstone, author of Three Parts Dead`); may be `""`. |

### Assets

Every field is optional; a missing face is drawn by Regal (Spine and back typeset from the Book's data, front as a placeholder cover).

| Field | Type | Meaning |
|---|---|---|
| `front` | image | Full-size front (the Cover). Shown when the Book is picked; the Stack's top Book. |
| `spine` | image | Full-size Spine art. |
| `back` | image | Full-size back art. Without it the back is drawn: `description`, `quotes`, `genre`, `publisher`, barcode. |
| `pile` | object | Small copies for the Stack, loaded before the full faces: `{ "front": image, "spine": image }` (both optional). The pipeline makes them 512 px (front) and 640 px (Spine) tall. Absent: the full faces stand in. |
| `palette` | object | Spine colours `{ "background", "text", "accent" }`, all three `#rrggbb` and all required when `palette` is set. Lets Regal draw the Spine at once, before or without its art. Absent: sampled from the front in the browser. |
| `spineColor` | colour | Average colour of the Spine art: the boards along the page edges. Absent: measured from the art. |
| `photoFaces` | string[] | Faces (`front`, `spine`, `back`) that are photos of the owner's copy: drawn as they are, not as artwork. |
| `source` | string | `photo` (all faces photographed) or `ai` (Spine/back generated). Provenance only; the display doesn't use it. |

## Example

```json
{
  "version": 2,
  "generatedAt": "2026-05-01T06:00:00Z",
  "owner": "Demo Reader",
  "books": [
    {
      "id": "demo-03",
      "title": "The Two Towers",
      "seriesTitle": "The Lord of the Rings, #2",
      "authors": ["J. R. R. Tolkien"],
      "isbn13": "9780000000033",
      "pages": 352,
      "binding": "Paperback",
      "status": "read",
      "dateRead": "2025-11-02",
      "rating": 4.25,
      "review": "Gandalf comes back, and the ents march on Isengard.",
      "reviewHasSpoiler": true,
      "readCount": 1,
      "assets": {
        "front": "covers/demo-03/front.webp",
        "pile": { "front": "covers/demo-03/front-pile.webp" },
        "palette": { "background": "#3d5a3a", "text": "#f5f2eb", "accent": "#d4b06a" }
      }
    }
  ]
}
```

## For producers

- **Libellus** (the producer today: `pnpm export:regal`, with `--carry-art` to keep the art already published). A Book is an edition with its reading sessions: `id` = the edition id; `authors` from its authors in order; ISBNs, page count as they are. From the latest session: `status` (`read` for finished, `dnf` for abandoned, `currently-reading` while open), `dateStarted`, `dateRead` (finished only), `rating` (Libellus stores quarter stars 1–20; exported ÷ 4, so 0.25–5), `review`; `readCount` = finished sessions. The cover URL goes in `assets.front`, the precomputed cover colours in `assets.palette`.
- **The pipeline (bridge).** `pnpm library:convert` turns old published data, the v1 `library.json` (reading-tracker export, `{ books: [...] }`) and `manifest.json`, into this file. Not part of the daily job any more.
- **Regal assets** (`pipeline/`, `pnpm regal-assets`). A producer may leave `assets` out, or bring only a cover URL, and run the file through Regal assets: it keeps what is good enough, finds or makes the rest (fronts, Spines and backs, pile copies, palette, Spine colour, a blurb where `description` is missing) and writes the enriched file next to its images, relative references. See the README, "Producing the library file".
- Validate before publishing: `parseLibraryFile(text)` returns the errors as `{ path, reason }`; `formatLibraryFileErrors(errors)` makes lines of them.

## Converting old published data

A bridge for data published before Libellus (the v1 files at the bucket root). The daily job doesn't use it.

The v1 files at the bucket root are due to be deleted ([#48](https://github.com/fabkho/regal/issues/48)); once they are gone, the URLs below answer 404. Then give `--library` and `--manifest` local copies (paths work as well as URLs) and `--assets-base` wherever the images are, or re-run the pipeline from Libellus instead of converting.

```bash
pnpm library:convert \
  --library https://books.fabkho.dev/library.json \
  --manifest https://books.fabkho.dev/manifest.json \
  --assets-base https://books.fabkho.dev/ \
  --out .data/library-v2.json
```

| Option | | Meaning |
|---|---|---|
| `--library` | required | The reading-tracker JSON (`reading list --json`, or the published `library.json`): URL or path. |
| `--manifest` | optional | The asset `manifest.json`: URL or path. Without it no Book gets assets except the tracker's Cover. |
| `--assets-base` | optional | Where the manifest's paths live: an absolute URL, or a path relative to `--out`. Default: the manifest's folder. |
| `--out` | required | The file to write. It is validated first and not written when invalid. Real data belongs in `.data/` (gitignored). |
| `--owner` | optional | `owner` of the file. |
| `--generated-at` | optional | `generatedAt` (default: now), for reproducible output. |

It reads the inputs the way the display does today, so the converted file shows the same Library: Books through the reading-tracker importer (series split from the title, ISBN-10/13 sorted out, quarter-star ratings, tracker shelves as Reading status), the manifest entry by ISBN-13 first and Book id second, the manifest's cleaned blurb before the tracker's, `publisher`/`genre`/`quotes` from the manifest only, colours only when they are `#rrggbb` (others are dropped with a warning, as the display ignores them). `dateStarted` comes from the tracker session's `startedAt`. A Book without an asset front gets the tracker's `coverUrl` (http(s) only) as `assets.front`, as Regal will have no Cover resolver. It prints the counts (Books, Books with assets per face, manifest entries no Book uses). It only reads its inputs.
