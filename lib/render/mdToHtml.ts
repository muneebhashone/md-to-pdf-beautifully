import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";
import type { Plugin } from "unified";
import {
  buildFileSlugs,
  dataUriFor,
  isExternal,
  resolveRel,
  type FileSlugMap,
} from "../bundle/resolve";
import type { Vfs } from "../bundle/extract";

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style", "id"],
    code: [...(defaultSchema.attributes?.code ?? []), "className", "data-line", "data-language"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style", "data-line"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className", "data-language", "data-theme"],
    div: [...(defaultSchema.attributes?.div ?? []), "className", "data-language", "data-theme"],
    figure: [
      ...(defaultSchema.attributes?.figure ?? []),
      "data-rehype-pretty-code-figure",
    ],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption"],
};

const rewriteLinksAndImages =
  (currentFile: string, vfs: Vfs, fileSlugs: FileSlugMap): Plugin<[], Root> =>
  () =>
  (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      // Mermaid: convert <pre><code class="language-mermaid">...</code></pre> to <div class="mermaid-wrapper"><pre class="mermaid">...</pre></div>
      if (node.tagName === "pre" && node.children?.length === 1) {
        const child = node.children[0] as Element;
        if (
          child.type === "element" &&
          child.tagName === "code" &&
          (child.properties?.className as string[] | undefined)?.includes("language-mermaid")
        ) {
          const text = (child.children[0] as { value?: string })?.value ?? "";
          node.tagName = "div";
          node.properties = { className: ["mermaid-wrapper"] };
          node.children = [
            {
              type: "element",
              tagName: "pre",
              properties: { className: ["mermaid"] },
              children: [{ type: "text", value: text }],
            } as Element,
          ];
          return;
        }
      }

      if (node.tagName === "a") {
        const href = node.properties?.href as string | undefined;
        if (!href) return;
        if (isExternal(href)) {
          if (/^https?:/i.test(href)) {
            node.properties = { ...node.properties, target: "_blank", rel: "noreferrer" };
          }
          return;
        }
        // Local link: maybe to .md or anchor in another .md
        const [pathPart, hash] = href.split("#");
        if (pathPart && /\.(md|markdown)$/i.test(pathPart)) {
          const target = resolveRel(currentFile, pathPart);
          const slug = fileSlugs.get(target);
          if (slug) {
            node.properties.href = "#" + slug + (hash ? "--" + hash : "");
            return;
          }
        }
        if (!pathPart && hash) {
          // same-file anchor; leave as-is but prefix with current file slug for global uniqueness
          const cur = fileSlugs.get(currentFile);
          if (cur) node.properties.href = "#" + cur + "--" + hash;
          return;
        }
      }

      if (node.tagName === "img") {
        const src = node.properties?.src as string | undefined;
        if (!src || isExternal(src)) return;
        const target = resolveRel(currentFile, src);
        const data = dataUriFor(vfs, target);
        if (data) node.properties.src = data;
      }
    });
  };

const prefixHeadingIds =
  (filePathSlug: string): Plugin<[], Root> =>
  () =>
  (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties?.id) {
        node.properties.id = filePathSlug + "--" + node.properties.id;
      }
    });
  };

export async function renderFile(opts: {
  filePath: string;
  source: string;
  vfs: Vfs;
  fileSlugs: FileSlugMap;
}): Promise<string> {
  const { filePath, source, vfs, fileSlugs } = opts;
  const fileSlugId = fileSlugs.get(filePath)!;

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSlug)
    .use(prefixHeadingIds(fileSlugId))
    .use(rehypeAutolinkHeadings, { behavior: "wrap" })
    .use(rewriteLinksAndImages(filePath, vfs, fileSlugs))
    .use(rehypePrettyCode, {
      theme: "github-light",
      keepBackground: false,
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(source);

  return `<article id="${fileSlugId}">\n${String(file)}\n</article>`;
}

export async function renderBundle(
  vfs: Vfs,
  entry: string,
): Promise<{ html: string; title: string }> {
  const mdFiles = [...vfs.keys()].filter((p) => /\.(md|markdown)$/i.test(p));
  // entry first, then others alphabetically
  mdFiles.sort((a, b) => {
    if (a === entry) return -1;
    if (b === entry) return 1;
    return a.localeCompare(b);
  });
  const fileSlugs = buildFileSlugs(mdFiles);
  const parts: string[] = [];
  for (const f of mdFiles) {
    const source = vfs.get(f)!.toString("utf8");
    parts.push(await renderFile({ filePath: f, source, vfs, fileSlugs }));
  }

  // Try to extract first H1 from entry as document title
  const entrySrc = vfs.get(entry)!.toString("utf8");
  const titleMatch = entrySrc.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : entry.replace(/\.(md|markdown)$/i, "");

  return { html: parts.join("\n"), title };
}
