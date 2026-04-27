# md-to-pdf-beautifully

A web app that turns Markdown into a typographically polished PDF. Drop in a `.md` file or a `.zip` bundle of Markdown + assets and download a print-ready PDF — Mermaid diagrams rendered, internal `.md` links rewritten as in-PDF anchors, external links clickable, images inlined, footnotes preserved.

Built on Next.js 16, React 19, Tailwind 4, unified/remark/rehype, and headless Chromium via Puppeteer.

## What it does

- **Single Markdown file** → PDF.
- **ZIP bundle** (multiple `.md` files + images) → one PDF, with cross-`.md` links rewritten to anchors inside the PDF.
- **Mermaid diagrams** rendered as SVG with a fit-to-page algorithm: every diagram, no matter the aspect ratio, fits within the printable A4 area without horizontal or vertical overflow, and small diagrams are upscaled to use the page rather than sit lonely in whitespace.
- **Professional typography**: Source Serif 4 headings, Inter Tight body, JetBrains Mono code. Real footnotes, GFM tables, blockquotes, syntax-highlighted code blocks (Shiki), page numbers in the footer.
- **Link-aware**:
  - External links remain clickable in the PDF.
  - `[text](other.md#section)` is rewritten to a same-document anchor jump.
  - `[text](#anchor)` within a file is namespaced by the file slug so anchors don't collide across a bundle.
- **Images** referenced relatively from a ZIP bundle are inlined as data URIs. External `https://` images are left as-is (no SSRF, no remote fetches).
- **Hardened** against zip-slip, oversized uploads (25 MB cap), oversized expansions (50 MB / 500 entries cap), and untrusted HTML in Markdown (`rehype-sanitize`).

## Quick start

```bash
bun install
bun run dev
# open http://localhost:3000
```

Drop a `.md` or `.zip` onto the page and click **Generate PDF**.

> Puppeteer downloads a Chromium binary on first install (~170 MB into `~/.cache/puppeteer`). If your install was done with `bun` and the postinstall was skipped, run `bun pm trust puppeteer` once.

### From the command line

```bash
curl -F "file=@your-doc.md" http://localhost:3000/api/convert -o out.pdf
curl -F "file=@docs.zip"    http://localhost:3000/api/convert -o out.pdf
```

## How it works

```
upload ──► /api/convert ──► extract (md or zip)
                              │
                              ├─► build virtual FS + pick entry (README.md > index.md > shallowest)
                              ├─► unified pipeline per .md file
                              │     remark-parse → remark-gfm → remark-rehype
                              │     → rehype-raw → rehype-sanitize → rehype-slug
                              │     → rewrite cross-.md links + inline images
                              │     → rehype-pretty-code (Shiki) → rehype-stringify
                              ├─► concatenate articles into one HTML doc with print CSS
                              └─► Puppeteer: setContent → run mermaid → fit-to-page
                                  → page.pdf({ format: 'A4', preferCSSPageSize: true })
```

The fit-to-page pass runs in the headless page after `mermaid.run()`. It computes the printable area from the `@page` rule (A4 minus margins, in mm), reads each diagram's natural aspect ratio from its `viewBox`, and sets the SVG's width/height directly so the content scales via `viewBox` — no `transform: scale()` ghost boxes, no whitespace from oversized wrappers.

## Project layout

```
app/
  api/convert/route.ts     # POST: file → PDF stream (runtime: 'nodejs')
  layout.tsx, page.tsx     # dropzone UI + font wiring
  globals.css
lib/
  bundle/
    extract.ts             # zip → in-memory virtual FS, with zip-slip checks
    resolve.ts             # file slugs, link/image resolution, mime → data URI
  render/
    mdToHtml.ts            # unified pipeline + AST rewrites
    template.ts            # full HTML doc + mermaid loader + fit-to-page script
    printCss.ts            # @page rules, typography, mermaid-wrapper rules
  pdf/
    browser.ts             # cached puppeteer Browser singleton
    renderPdf.ts           # html → PDF Buffer
test-fixtures/
  simple.md                # GFM, footnotes, table, blockquote, syntax highlight
  mermaid-large.md         # small + wide + tall diagrams to exercise fit-to-page
  bundle/                  # multi-file bundle with relative links and an image
```

## Limits & guarantees

| Limit | Default | Where |
|---|---|---|
| Upload size | 25 MB | `app/api/convert/route.ts` |
| Total uncompressed bundle | 50 MB | `lib/bundle/extract.ts` |
| Bundle entry count | 500 | `lib/bundle/extract.ts` |
| Render timeout | 45 s `setContent` + 30 s mermaid | `lib/pdf/renderPdf.ts` |
| Page format | A4, 22/24/18/18 mm margins | `lib/render/printCss.ts` |

## Known limitations

- Local-only Puppeteer. To deploy on a serverless platform, swap `puppeteer` for `puppeteer-core` + `@sparticuz/chromium-min` and set `PUPPETEER_EXECUTABLE_PATH`.
- Mermaid runs from a CDN (`cdn.jsdelivr.net`) inside the headless page so the build stays small. If you need offline operation, vendor `mermaid` locally and adjust `lib/render/template.ts`.
- Pandoc-style explicit heading IDs (`## Foo { #foo }`) are not parsed — `rehype-slug`'s autogenerated IDs are used. Anchor links to autogenerated slugs work as expected.

## License

MIT.
