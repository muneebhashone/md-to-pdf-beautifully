"use client";

import JSZip from "jszip";
import { useCallback, useRef, useState } from "react";

const MAX_BYTES = 25 * 1024 * 1024;
const VALID_EXT = /\.(md|markdown|zip)$/i;
const BATCH_CONCURRENCY = 2;

type SingleMode = {
  kind: "single";
  file: File;
  html?: string;
  previewing: boolean;
  converting: boolean;
  done?: string;
  error?: string;
};

type ItemState =
  | { kind: "queued" }
  | { kind: "working" }
  | { kind: "done"; pdf: Blob; pdfName: string }
  | { kind: "error"; message: string };

type Item = {
  id: string;
  file: File;
  state: ItemState;
};

type BatchMode = {
  kind: "batch";
  items: Item[];
  running: boolean;
  finished: boolean;
  zipReady: boolean;
};

type Mode = { kind: "idle"; error?: string } | SingleMode | BatchMode;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function stemOf(name: string) {
  return name.replace(VALID_EXT, "") || "document";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function dedupeName(used: Set<string>, base: string) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? "" : base.slice(dot);
  let i = 2;
  while (used.has(`${stem} (${i})${ext}`)) i++;
  const out = `${stem} (${i})${ext}`;
  used.add(out);
  return out;
}

type Validation = { ok: File[]; rejected: { name: string; reason: string }[] };

function validateFiles(files: File[]): Validation {
  const ok: File[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const f of files) {
    if (!VALID_EXT.test(f.name)) {
      rejected.push({ name: f.name, reason: "not a .md or .zip file" });
      continue;
    }
    if (f.size > MAX_BYTES) {
      rejected.push({ name: f.name, reason: "exceeds 25 MB" });
      continue;
    }
    ok.push(f);
  }
  return { ok, rejected };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFiles = useCallback((list: FileList | null | undefined) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const { ok, rejected } = validateFiles(incoming);

    setMode((prev) => {
      // If we're already in batch mode, append.
      if (prev.kind === "batch" && !prev.running) {
        const items = [
          ...prev.items,
          ...ok.map<Item>((file) => ({
            id: crypto.randomUUID(),
            file,
            state: { kind: "queued" },
          })),
        ];
        return { ...prev, items, finished: false, zipReady: false };
      }

      if (ok.length === 0) {
        const reason = rejected[0]?.reason ?? "no valid files";
        return { kind: "idle", error: `Rejected: ${reason}` };
      }

      if (ok.length === 1) {
        return {
          kind: "single",
          file: ok[0],
          previewing: false,
          converting: false,
        };
      }

      return {
        kind: "batch",
        items: ok.map<Item>((file) => ({
          id: crypto.randomUUID(),
          file,
          state: { kind: "queued" },
        })),
        running: false,
        finished: false,
        zipReady: false,
      };
    });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      acceptFiles(e.dataTransfer.files);
    },
    [acceptFiles],
  );

  const reset = () => {
    setMode({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  // ---------- Single-file flow ----------

  const previewSingle = async () => {
    if (mode.kind !== "single" || mode.previewing || mode.converting) return;
    const file = mode.file;
    setMode({ ...mode, previewing: true, error: undefined });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/convert?mode=preview", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const html = await res.text();
      setMode({
        kind: "single",
        file,
        html,
        previewing: false,
        converting: false,
      });
    } catch (err) {
      setMode({
        kind: "single",
        file,
        previewing: false,
        converting: false,
        error: err instanceof Error ? err.message : "Failed to preview",
      });
    }
  };

  const convertSingle = async () => {
    if (mode.kind !== "single" || mode.converting || mode.previewing) return;
    const { file, html } = mode;
    setMode({ ...mode, converting: true, error: undefined });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const blob = await res.blob();
      const filename = `${stemOf(file.name)}.pdf`;
      downloadBlob(blob, filename);
      setMode({
        kind: "single",
        file,
        html,
        previewing: false,
        converting: false,
        done: filename,
      });
    } catch (err) {
      setMode({
        kind: "single",
        file,
        html,
        previewing: false,
        converting: false,
        error: err instanceof Error ? err.message : "Failed to convert",
      });
    }
  };

  const backFromPreview = () => {
    if (mode.kind !== "single") return;
    setMode({
      kind: "single",
      file: mode.file,
      previewing: false,
      converting: false,
    });
  };

  // ---------- Batch flow ----------

  const updateItem = (id: string, state: ItemState) => {
    setMode((prev) => {
      if (prev.kind !== "batch") return prev;
      return {
        ...prev,
        items: prev.items.map((it) => (it.id === id ? { ...it, state } : it)),
      };
    });
  };

  const removeItem = (id: string) => {
    setMode((prev) => {
      if (prev.kind !== "batch" || prev.running) return prev;
      const items = prev.items.filter((it) => it.id !== id);
      if (items.length === 0) return { kind: "idle" };
      return { ...prev, items, finished: false, zipReady: false };
    });
  };

  const buildAndDownloadZip = async (items: Item[]) => {
    const zip = new JSZip();
    const used = new Set<string>();
    for (const it of items) {
      if (it.state.kind !== "done") continue;
      const name = dedupeName(used, `${stemOf(it.file.name)}.pdf`);
      zip.file(name, it.state.pdf);
    }
    if (used.size === 0) return;
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "markdown-pdfs.zip");
  };

  const runBatch = async () => {
    setMode((prev) => {
      if (prev.kind !== "batch" || prev.running) return prev;
      // Reset any prior errored items to queued; keep done items as-is.
      const items = prev.items.map<Item>((it) =>
        it.state.kind === "error" ? { ...it, state: { kind: "queued" } } : it,
      );
      return { ...prev, items, running: true, finished: false, zipReady: false };
    });

    // Snapshot the queue (items needing work) by reading state in a microtask.
    // We rely on the closure capturing the latest setMode-driven state via a ref-like read.
    const snapshot: Item[] = await new Promise((resolve) => {
      setMode((prev) => {
        if (prev.kind === "batch") resolve(prev.items);
        else resolve([]);
        return prev;
      });
    });

    const queue = snapshot.filter((it) => it.state.kind !== "done");

    let cursor = 0;
    const next = () => (cursor < queue.length ? queue[cursor++] : null);

    const worker = async () => {
      while (true) {
        const item = next();
        if (!item) return;
        updateItem(item.id, { kind: "working" });
        try {
          const fd = new FormData();
          fd.append("file", item.file);
          const res = await fetch("/api/convert", { method: "POST", body: fd });
          if (!res.ok) {
            throw new Error((await res.text()) || `HTTP ${res.status}`);
          }
          const pdf = await res.blob();
          updateItem(item.id, {
            kind: "done",
            pdf,
            pdfName: `${stemOf(item.file.name)}.pdf`,
          });
        } catch (err) {
          updateItem(item.id, {
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to convert",
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(BATCH_CONCURRENCY, queue.length) }, () =>
        worker(),
      ),
    );

    // Read final state, auto-download ZIP if any succeeded.
    const finalItems: Item[] = await new Promise((resolve) => {
      setMode((prev) => {
        if (prev.kind !== "batch") {
          resolve([]);
          return prev;
        }
        resolve(prev.items);
        return {
          ...prev,
          running: false,
          finished: true,
          zipReady: prev.items.some((it) => it.state.kind === "done"),
        };
      });
    });

    if (finalItems.some((it) => it.state.kind === "done")) {
      await buildAndDownloadZip(finalItems);
    }
  };

  const downloadOne = (item: Item) => {
    if (item.state.kind !== "done") return;
    downloadBlob(item.state.pdf, item.state.pdfName);
  };

  const downloadZipNow = async () => {
    if (mode.kind !== "batch") return;
    await buildAndDownloadZip(mode.items);
  };

  // ---------- Render ----------

  const isPreviewView = mode.kind === "single" && mode.html !== undefined;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black px-6 py-16">
      <main
        className={
          mode.kind === "batch" || isPreviewView
            ? "w-full max-w-5xl"
            : "w-full max-w-2xl"
        }
      >
        <header className="mb-10 text-center">
          <h1 className="font-[family-name:var(--font-serif)] text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Markdown → PDF
          </h1>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400 text-lg">
            Drop a <code className="font-mono text-sm">.md</code> file, or a{" "}
            <code className="font-mono text-sm">.zip</code> bundle with images
            and linked markdown. Drop multiple files to batch-convert.
          </p>
        </header>

        {isPreviewView && mode.kind === "single" && mode.html ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white shadow-sm">
              <iframe
                title="Preview"
                srcDoc={mode.html}
                sandbox="allow-scripts"
                className="w-full h-[80vh] bg-white"
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={convertSingle}
                disabled={mode.converting}
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 h-12 text-white font-medium hover:bg-zinc-800 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
              >
                {mode.converting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Generating PDF…
                  </span>
                ) : (
                  "Download PDF"
                )}
              </button>
              <button
                type="button"
                onClick={backFromPreview}
                disabled={mode.converting}
                className="inline-flex items-center justify-center rounded-full px-4 h-12 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50 transition"
              >
                Back
              </button>
            </div>
          </div>
        ) : mode.kind === "batch" ? (
          <BatchView
            mode={mode}
            onAddMore={() => inputRef.current?.click()}
            onRun={runBatch}
            onDownloadZip={downloadZipNow}
            onDownloadOne={downloadOne}
            onRemove={removeItem}
            onClear={reset}
          />
        ) : (
          <SingleOrIdleView
            mode={mode}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onDrop={onDrop}
            onPick={() => inputRef.current?.click()}
            onPreview={previewSingle}
            onConvert={convertSingle}
            onClear={reset}
          />
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.markdown,.zip,text/markdown,application/zip"
          className="hidden"
          onChange={(e) => {
            acceptFiles(e.target.files);
            // allow re-selecting the same file
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </main>
    </div>
  );
}

function SingleOrIdleView({
  mode,
  dragOver,
  setDragOver,
  onDrop,
  onPick,
  onPreview,
  onConvert,
  onClear,
}: {
  mode: Mode;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPick: () => void;
  onPreview: () => void;
  onConvert: () => void;
  onClear: () => void;
}) {
  const file = mode.kind === "single" ? mode.file : null;
  const busy =
    mode.kind === "single" && (mode.previewing || mode.converting);
  const idleError = mode.kind === "idle" ? mode.error : undefined;
  const singleError = mode.kind === "single" ? mode.error : undefined;
  const done = mode.kind === "single" ? mode.done : undefined;

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={onPick}
        className={[
          "rounded-2xl border-2 border-dashed transition-all cursor-pointer",
          "px-8 py-16 text-center select-none",
          dragOver
            ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 scale-[1.01]"
            : "border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/40 hover:border-zinc-400 dark:hover:border-zinc-600",
        ].join(" ")}
      >
        {file ? (
          <div className="space-y-1">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              {file.name}
            </p>
            <p className="text-sm text-zinc-500">{fmtBytes(file.size)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">
              Drop file(s) here, or click to choose
            </p>
            <p className="text-sm text-zinc-500">
              Supports .md, .markdown, .zip (≤25 MB each). Drop multiple files
              to batch-convert.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={!file || busy}
          onClick={onPreview}
          className="inline-flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 h-12 text-zinc-900 dark:text-zinc-50 font-medium hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {mode.kind === "single" && mode.previewing ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Rendering preview…
            </span>
          ) : (
            "Preview"
          )}
        </button>
        <button
          type="button"
          disabled={!file || busy}
          onClick={onConvert}
          className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 h-12 text-white font-medium hover:bg-zinc-800 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
        >
          {mode.kind === "single" && mode.converting ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Generating PDF…
            </span>
          ) : (
            "Generate PDF"
          )}
        </button>
        {file && !busy && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center rounded-full px-4 h-12 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            Clear
          </button>
        )}
      </div>

      {(idleError || singleError) && (
        <p className="mt-6 text-center text-red-600 dark:text-red-400 text-sm">
          {idleError ?? singleError}
        </p>
      )}
      {done && (
        <p className="mt-6 text-center text-emerald-600 dark:text-emerald-400 text-sm">
          Downloaded {done}
        </p>
      )}
    </>
  );
}

function BatchView({
  mode,
  onAddMore,
  onRun,
  onDownloadZip,
  onDownloadOne,
  onRemove,
  onClear,
}: {
  mode: BatchMode;
  onAddMore: () => void;
  onRun: () => void;
  onDownloadZip: () => void;
  onDownloadOne: (item: Item) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const total = mode.items.length;
  const doneCount = mode.items.filter((it) => it.state.kind === "done").length;
  const errorCount = mode.items.filter((it) => it.state.kind === "error").length;
  const allTerminal = mode.items.every(
    (it) => it.state.kind === "done" || it.state.kind === "error",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 px-5 py-4">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {total} file{total === 1 ? "" : "s"} queued
          </p>
          <p className="text-sm text-zinc-500">
            {doneCount} done
            {errorCount > 0 ? ` · ${errorCount} failed` : ""}
            {mode.running ? " · converting…" : ""}
          </p>
        </div>
        <div className="w-40 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-zinc-900 dark:bg-zinc-50 transition-all"
            style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <ul className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/40 divide-y divide-zinc-200 dark:divide-zinc-800">
        {mode.items.map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-4 px-5 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                {it.file.name}
              </p>
              <p className="text-xs text-zinc-500">{fmtBytes(it.file.size)}</p>
            </div>
            <StatusPill state={it.state} />
            {it.state.kind === "done" && (
              <button
                type="button"
                onClick={() => onDownloadOne(it)}
                className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
              >
                Download
              </button>
            )}
            {!mode.running && (
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none"
                aria-label={`Remove ${it.file.name}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={mode.running || total === 0 || (allTerminal && errorCount === 0)}
          className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 h-12 text-white font-medium hover:bg-zinc-800 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
        >
          {mode.running ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Converting…
            </span>
          ) : errorCount > 0 && allTerminal ? (
            "Retry failed"
          ) : (
            "Convert all"
          )}
        </button>
        {mode.zipReady && !mode.running && (
          <button
            type="button"
            onClick={onDownloadZip}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 h-12 font-medium hover:border-zinc-400 dark:hover:border-zinc-600 transition"
          >
            Download ZIP
          </button>
        )}
        {!mode.running && (
          <button
            type="button"
            onClick={onAddMore}
            className="inline-flex items-center justify-center rounded-full px-4 h-12 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            Add more
          </button>
        )}
        {!mode.running && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center rounded-full px-4 h-12 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ state }: { state: ItemState }) {
  if (state.kind === "queued") {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-3 py-1 text-xs font-medium">
        Queued
      </span>
    );
  }
  if (state.kind === "working") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-1 text-xs font-medium">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Converting…
      </span>
    );
  }
  if (state.kind === "done") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-1 text-xs font-medium">
        Done
      </span>
    );
  }
  return (
    <span
      title={state.message}
      className="inline-flex items-center rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-1 text-xs font-medium max-w-[16rem] truncate"
    >
      Error: {state.message}
    </span>
  );
}
