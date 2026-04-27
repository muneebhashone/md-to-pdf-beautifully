import JSZip from "jszip";

export type VFile = { path: string; bytes: Buffer };
export type Vfs = Map<string, Buffer>;

const MAX_TOTAL = 50 * 1024 * 1024;
const MAX_ENTRIES = 500;

function normalize(p: string) {
  const norm = p.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  if (norm.startsWith("/") || norm.includes("..")) {
    throw new Error(`Unsafe zip entry: ${p}`);
  }
  return norm;
}

export async function extractZip(buf: Buffer): Promise<Vfs> {
  const zip = await JSZip.loadAsync(buf);
  const vfs: Vfs = new Map();
  let total = 0;
  let count = 0;
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (++count > MAX_ENTRIES) throw new Error("Zip has too many entries");
    const safe = normalize(name);
    const bytes = Buffer.from(await entry.async("arraybuffer"));
    total += bytes.length;
    if (total > MAX_TOTAL) throw new Error("Zip uncompressed size too large");
    vfs.set(safe, bytes);
  }
  return vfs;
}

export function singleMd(name: string, buf: Buffer): Vfs {
  const vfs: Vfs = new Map();
  vfs.set(name || "index.md", buf);
  return vfs;
}

export function pickEntry(vfs: Vfs): string {
  const mdFiles = [...vfs.keys()].filter((p) => /\.(md|markdown)$/i.test(p));
  if (mdFiles.length === 0) throw new Error("No markdown files found");
  const byName = (n: string) =>
    mdFiles.find((p) => p.toLowerCase() === n) ??
    mdFiles.find((p) => p.toLowerCase().endsWith("/" + n));
  return (
    byName("readme.md") ||
    byName("index.md") ||
    mdFiles.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0]
  );
}
