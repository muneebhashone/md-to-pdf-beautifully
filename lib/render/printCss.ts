export const printCss = `
:root {
  --fg: #111317;
  --muted: #5b6470;
  --accent: #0b66c3;
  --border: #e6e8ec;
  --code-bg: #f6f7f9;
  --serif: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
  --sans: 'Inter Tight', 'Inter', -apple-system, system-ui, sans-serif;
  --mono: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
}

@page { size: A4; margin: 22mm 18mm 24mm; }

html, body { background: white; }
body {
  font-family: var(--sans);
  font-size: 10.5pt;
  line-height: 1.6;
  color: var(--fg);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-feature-settings: "ss01", "cv11";
}

article { break-before: page; }
article:first-of-type { break-before: auto; }

h1, h2, h3, h4, h5, h6 {
  font-family: var(--serif);
  font-weight: 600;
  letter-spacing: -0.01em;
  break-after: avoid;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
  line-height: 1.25;
}
h1 { font-size: 26pt; margin-top: 0; }
h2 { font-size: 18pt; }
h3 { font-size: 14pt; }
h4 { font-size: 12pt; }

p { margin: 0.6em 0; orphans: 3; widows: 3; }

a { color: var(--accent); text-decoration: none; border-bottom: 1px solid rgba(11,102,195,0.25); }
a:hover { border-bottom-color: var(--accent); }

ul, ol { padding-left: 1.4em; margin: 0.6em 0; }
li { margin: 0.2em 0; }
li > p { margin: 0.2em 0; }

blockquote {
  margin: 1em 0;
  padding: 0.4em 1em;
  border-left: 3px solid var(--accent);
  color: var(--muted);
  background: #fafbfc;
  break-inside: avoid;
}

hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }

code {
  font-family: var(--mono);
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  border: 1px solid var(--border);
}
pre {
  font-family: var(--mono);
  font-size: 9.5pt;
  line-height: 1.5;
  text-align: left;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.9em 1em;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  break-inside: avoid;
}
pre code { background: none; border: 0; padding: 0; font-size: inherit; }

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 9.5pt;
  break-inside: avoid;
}
th, td { border: 1px solid var(--border); padding: 0.45em 0.7em; text-align: left; vertical-align: top; }
thead th { background: #f3f4f7; font-weight: 600; }

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1em auto;
  break-inside: avoid;
}

figure { margin: 1em 0; break-inside: avoid; text-align: center; }
figcaption { font-size: 9pt; color: var(--muted); margin-top: 0.4em; }

.mermaid-wrapper {
  margin: 1.2em auto;
  text-align: center;
  break-inside: avoid;
  overflow: hidden;
  max-width: 100%;
}
.mermaid-wrapper svg {
  max-width: 100%;
  height: auto;
  display: inline-block;
}
/* Belt-and-braces: any direct svg child of the wrapper must not exceed
   the wrapper's box. Width is driven explicitly by the fit-to-page script
   but we cap it here in case the calculation ever lands a hair too wide. */
.mermaid-wrapper > svg { max-width: 100% !important; }

/* shiki theming */
[data-rehype-pretty-code-figure] { text-align: left; }
[data-rehype-pretty-code-figure] pre { background: var(--code-bg); }
[data-line] { padding: 0 0.2em; }

/* footnotes */
.footnotes { font-size: 9.5pt; color: var(--muted); border-top: 1px solid var(--border); margin-top: 2em; padding-top: 1em; }
.footnotes ol { padding-left: 1.4em; }
sup a { border: 0; }

/* heading anchor link from rehype-autolink-headings */
.anchor { display: none; }
`;
