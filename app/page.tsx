"use client";

import { useCallback, useRef, useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "ready"; file: File }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "done"; filename: string };

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Home() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setFile = useCallback((file: File | null | undefined) => {
    if (!file) return;
    const ok = /\.(md|markdown|zip)$/i.test(file.name);
    if (!ok) {
      setStatus({ kind: "error", message: "Please drop a .md or .zip file." });
      return;
    }
    setStatus({ kind: "ready", file });
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      setFile(e.dataTransfer.files?.[0]);
    },
    [setFile],
  );

  const file = status.kind === "ready" ? status.file : null;

  const convert = async () => {
    if (!file) return;
    setStatus({ kind: "working" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stem = file.name.replace(/\.(md|markdown|zip)$/i, "") || "document";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      setStatus({ kind: "done", filename: `${stem}.pdf` });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to convert",
      });
    }
  };

  const reset = () => {
    setStatus({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black px-6 py-16">
      <main className="w-full max-w-2xl">
        <header className="mb-10 text-center">
          <h1 className="font-[family-name:var(--font-serif)] text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Markdown → PDF
          </h1>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400 text-lg">
            Drop a <code className="font-mono text-sm">.md</code> file, or a{" "}
            <code className="font-mono text-sm">.zip</code> bundle with images and linked markdown.
            We render Mermaid, preserve links, and emit a polished PDF.
          </p>
        </header>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            "rounded-2xl border-2 border-dashed transition-all cursor-pointer",
            "px-8 py-16 text-center select-none",
            dragOver
              ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 scale-[1.01]"
              : "border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/40 hover:border-zinc-400 dark:hover:border-zinc-600",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".md,.markdown,.zip,text/markdown,application/zip"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
          {file ? (
            <div className="space-y-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
              <p className="text-sm text-zinc-500">{fmtBytes(file.size)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Drop file here, or click to choose
              </p>
              <p className="text-sm text-zinc-500">
                Supports .md, .markdown, .zip (≤25 MB)
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={!file || status.kind === "working"}
            onClick={convert}
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 h-12 text-white font-medium hover:bg-zinc-800 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
          >
            {status.kind === "working" ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating PDF…
              </span>
            ) : (
              "Generate PDF"
            )}
          </button>
          {file && status.kind !== "working" && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center rounded-full px-4 h-12 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
            >
              Clear
            </button>
          )}
        </div>

        {status.kind === "error" && (
          <p className="mt-6 text-center text-red-600 dark:text-red-400 text-sm">
            {status.message}
          </p>
        )}
        {status.kind === "done" && (
          <p className="mt-6 text-center text-emerald-600 dark:text-emerald-400 text-sm">
            Downloaded {status.filename}
          </p>
        )}
      </main>
    </div>
  );
}
