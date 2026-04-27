import GithubSlugger from "github-slugger";
import path from "node:path";
import type { Vfs } from "./extract";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

export function fileSlug(filePath: string): string {
  const slug = filePath
    .replace(/\.(md|markdown)$/i, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "doc";
}

export function isExternal(href: string): boolean {
  return /^([a-z]+:|\/\/|mailto:|tel:|#)/i.test(href);
}

export function resolveRel(fromFile: string, target: string): string {
  const dir = path.posix.dirname(fromFile);
  const joined = path.posix.normalize(path.posix.join(dir, target));
  return joined.replace(/^\.\//, "");
}

export function dataUriFor(vfs: Vfs, key: string): string | null {
  const buf = vfs.get(key);
  if (!buf) return null;
  const ext = path.posix.extname(key).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export type FileSlugMap = Map<string, string>;

export function buildFileSlugs(mdFiles: string[]): FileSlugMap {
  const slugger = new GithubSlugger();
  const map: FileSlugMap = new Map();
  for (const f of mdFiles) map.set(f, slugger.slug(fileSlug(f)));
  return map;
}
