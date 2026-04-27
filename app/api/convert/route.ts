import { NextRequest } from "next/server";
import { extractZip, pickEntry, singleMd, type Vfs } from "@/lib/bundle/extract";
import { renderBundle } from "@/lib/render/mdToHtml";
import { buildHtml } from "@/lib/render/template";
import { htmlToPdf } from "@/lib/pdf/renderPdf";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_UPLOAD = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response("Missing 'file' field", { status: 400 });
    }
    if (file.size > MAX_UPLOAD) {
      return new Response("File too large (max 25 MB)", { status: 413 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name || "input";
    const isZip =
      /\.zip$/i.test(name) ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";

    let vfs: Vfs;
    if (isZip) {
      vfs = await extractZip(buf);
    } else if (/\.(md|markdown)$/i.test(name) || file.type.startsWith("text/")) {
      vfs = singleMd(name.replace(/[\\/]/g, "_"), buf);
    } else {
      return new Response("Unsupported file type. Use .md or .zip.", { status: 415 });
    }

    const entry = pickEntry(vfs);
    const { html: body, title } = await renderBundle(vfs, entry);
    const html = buildHtml({ title, body });

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "preview") {
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const pdf = await htmlToPdf(html);

    const stem = entry.replace(/^.*[\\/]/, "").replace(/\.(md|markdown)$/i, "");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stem}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("convert failed:", err);
    return new Response(`Conversion failed: ${message}`, { status: 500 });
  }
}
