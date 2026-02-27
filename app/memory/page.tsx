"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryFile } from "@/lib/types";
import { renderMarkdown, colorizeJson } from "@/lib/sanitize";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";

/* ─── Helpers ───────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isJsonFile(file: MemoryFile): boolean {
  return file.label.includes("JSON") || file.path.endsWith(".json");
}

/* ─── Icons ─────────────────────────────────────────────────────── */

function FileIcon({ isJson }: { isJson: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: isJson ? "var(--system-blue)" : "var(--text-tertiary)", flexShrink: 0 }}
    >
      {isJson ? (
        /* clipboard icon for JSON */
        <>
          <rect x="4" y="2" width="8" height="12" rx="1.5" />
          <path d="M6 2V1.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V2" />
          <line x1="6.5" y1="6" x2="9.5" y2="6" />
          <line x1="6.5" y1="8.5" x2="9.5" y2="8.5" />
          <line x1="6.5" y1="11" x2="8" y2="11" />
        </>
      ) : (
        /* document icon for MD */
        <>
          <path d="M4 1.5h5.5L12 4v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" />
          <polyline points="9.5 1.5 9.5 4.5 12 4.5" />
          <line x1="5.5" y1="7.5" x2="10.5" y2="7.5" />
          <line x1="5.5" y1="10" x2="10.5" y2="10" />
        </>
      )}
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--text-tertiary)" }}
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BackArrow() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="10 3 5 8 10 13" />
    </svg>
  );
}

/* ─── Component ─────────────────────────────────────────────────── */

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selected, setSelected] = useState<MemoryFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [mobileShowContent, setMobileShowContent] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/memory")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load memory files");
        return r.json();
      })
      .then((data: MemoryFile[]) => {
        setFiles(data);
        if (data.length > 0 && !selected) setSelected(data[0]);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* Filtered files by search */
  const filteredFiles = files.filter((f) =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.path.toLowerCase().includes(search.toLowerCase())
  );

  /* Keyboard navigation in file list */
  function handleListKeyDown(e: React.KeyboardEvent) {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!items || items.length === 0) return;

    const currentIdx = Array.from(items).findIndex(
      (el) => el.getAttribute("aria-selected") === "true"
    );

    let nextIdx = currentIdx;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      nextIdx = Math.min(currentIdx + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextIdx = Math.max(currentIdx - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentIdx >= 0) {
        items[currentIdx].click();
        setMobileShowContent(true);
      }
      return;
    } else if (e.key === "Escape") {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }

    if (nextIdx !== currentIdx && nextIdx >= 0) {
      items[nextIdx].click();
      items[nextIdx].focus();
    }
  }

  /* Copy content */
  function copyContent() {
    if (!selected) return;
    navigator.clipboard.writeText(selected.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  /* Download content */
  function downloadContent() {
    if (!selected) return;
    const blob = new Blob([selected.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selected.path.split("/").pop() || "file.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Select file and show content on mobile */
  function selectFile(file: MemoryFile) {
    setSelected(file);
    setMobileShowContent(true);
  }

  /* Computed */
  const isJson = selected ? isJsonFile(selected) : false;
  const lineCount = selected ? selected.content.split("\n").length : 0;
  const words = selected ? wordCount(selected.content) : 0;
  const sizeBytes = selected ? new Blob([selected.content]).size : 0;

  /* Breadcrumb from path */
  const breadcrumb = selected?.path.replace(/^\//, "").split("/") ?? [];

  /* Error state */
  if (error && files.length === 0) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  /* ─── Rendered content ────────────────────────────────────────── */
  let renderedContent: React.ReactNode = null;
  if (selected) {
    if (isJson) {
      try {
        const pretty = JSON.stringify(JSON.parse(selected.content), null, 2);
        const lines = pretty.split("\n");
        renderedContent = (
          <div
            style={{
              background: "var(--code-bg)",
              border: "1px solid var(--code-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              overflow: "auto",
            }}
          >
            <div className="flex">
              {/* Line numbers */}
              <div
                className="flex-shrink-0 select-none"
                style={{
                  paddingRight: "var(--space-4)",
                  marginRight: "var(--space-4)",
                  borderRight: "1px solid var(--separator)",
                }}
              >
                {lines.map((_, i) => (
                  <div
                    key={i}
                    className="font-mono text-right"
                    style={{
                      fontSize: "var(--text-caption2)",
                      lineHeight: "var(--leading-relaxed)",
                      color: "var(--text-tertiary)",
                      minWidth: "2.5ch",
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              {/* JSON content */}
              <pre
                className="font-mono flex-1"
                style={{
                  fontSize: "var(--text-footnote)",
                  lineHeight: "var(--leading-relaxed)",
                  color: "var(--code-text)",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
                dangerouslySetInnerHTML={{
                  __html: colorizeJson(pretty),
                }}
              />
            </div>
          </div>
        );
      } catch {
        renderedContent = (
          <div
            style={{
              background: "var(--code-bg)",
              border: "1px solid var(--code-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <pre
              className="font-mono"
              style={{
                fontSize: "var(--text-footnote)",
                color: "var(--system-red)",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}
            >
              {selected.content}
            </pre>
          </div>
        );
      }
    } else {
      renderedContent = (
        <div
          style={{
            fontSize: "var(--text-subheadline)",
            lineHeight: "var(--leading-relaxed)",
            color: "var(--text-secondary)",
          }}
          dangerouslySetInnerHTML={{
            __html: `<p class="mb-3" style="color:var(--text-secondary)">${renderMarkdown(selected.content)}</p>`,
          }}
        />
      );
    }
  }

  return (
    <div
      className="flex h-full animate-fade-in"
      style={{ background: "var(--bg)" }}
    >
      {/* ── File list sidebar ──────────────────────────────────── */}
      <aside
        className={`flex-shrink-0 flex flex-col ${
          mobileShowContent && selected ? "hidden md:flex" : "flex"
        }`}
        style={{
          width: "100%",
          maxWidth: "100%",
          background: "var(--material-regular)",
          backdropFilter: "var(--sidebar-backdrop)",
          WebkitBackdropFilter: "var(--sidebar-backdrop)",
          borderRight: "1px solid var(--separator)",
        }}
      >
        <style>{`@media (min-width: 768px) { aside { width: 260px !important; min-width: 260px !important; } }`}</style>

        {/* Sidebar header */}
        <div
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderBottom: "1px solid var(--separator)",
          }}
        >
          <span
            style={{
              fontSize: "var(--text-body)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-primary)",
            }}
          >
            Memory
          </span>
          <button
            onClick={refresh}
            className="btn-ghost focus-ring"
            aria-label="Refresh file list"
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
              padding: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-tertiary)" }}
            >
              <path d="M1.5 8a6.5 6.5 0 0 1 11.48-4.17" />
              <path d="M14.5 8a6.5 6.5 0 0 1-11.48 4.17" />
              <polyline points="1.5 1.5 1.5 4 4 4" />
              <polyline points="14.5 14.5 14.5 12 12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "var(--space-2) var(--space-3)" }}>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="apple-input focus-ring"
            aria-label="Search memory files"
            style={{
              width: "100%",
              height: 32,
              fontSize: "var(--text-footnote)",
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-sm)",
            }}
          />
        </div>

        {/* File list */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Memory files"
          onKeyDown={handleListKeyDown}
          className="flex-1 overflow-y-auto"
        >
          {loading ? (
            /* Skeleton rows */
            <div style={{ padding: "var(--space-2) var(--space-3)" }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    padding: "var(--space-3) var(--space-3)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-2)",
                  }}
                >
                  <Skeleton
                    className="flex-shrink-0"
                    style={{ width: 16, height: 16, borderRadius: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <Skeleton style={{ width: "80%", height: 13, marginBottom: 6 }} />
                    <Skeleton style={{ width: "50%", height: 10 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredFiles.length === 0 ? (
            <div
              className="flex items-center justify-center"
              style={{
                height: 120,
                fontSize: "var(--text-footnote)",
                color: "var(--text-tertiary)",
              }}
            >
              No files match
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isActive = selected?.path === file.path;
              const json = isJsonFile(file);
              return (
                <button
                  key={file.path}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => selectFile(file)}
                  className="w-full text-left hover-bg focus-ring"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--space-2)",
                    padding: "var(--space-3) var(--space-3)",
                    border: "none",
                    cursor: "pointer",
                    background: isActive
                      ? "var(--fill-secondary)"
                      : "transparent",
                    borderLeft: isActive
                      ? "3px solid var(--accent)"
                      : "3px solid transparent",
                  }}
                >
                  <FileIcon isJson={json} />
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{
                        fontSize: "var(--text-footnote)",
                        fontWeight: "var(--weight-semibold)",
                        color: "var(--text-primary)",
                        lineHeight: "var(--leading-snug)",
                      }}
                    >
                      {file.label}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--text-caption2)",
                        color: "var(--text-tertiary)",
                        marginTop: 2,
                      }}
                    >
                      {formatBytes(new Blob([file.content]).size)} {"\u00b7"}{" "}
                      {timeAgo(file.lastModified)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Content view ───────────────────────────────────────── */}
      <main
        className={`flex-1 flex flex-col overflow-hidden ${
          !mobileShowContent || !selected ? "hidden md:flex" : "flex"
        }`}
        style={{ background: "var(--bg)" }}
      >
        {selected ? (
          <>
            {/* Content header (sticky) */}
            <div
              className="flex-shrink-0"
              style={{
                padding: "var(--space-3) var(--space-6)",
                borderBottom: "1px solid var(--separator)",
                background: "var(--material-regular)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
            >
              {/* Mobile back button */}
              <button
                onClick={() => setMobileShowContent(false)}
                className="md:hidden btn-ghost focus-ring"
                aria-label="Back to file list"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-footnote)",
                  color: "var(--system-blue)",
                  marginBottom: "var(--space-2)",
                  marginLeft: "-8px",
                }}
              >
                <BackArrow />
                Files
              </button>

              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  {/* Breadcrumb */}
                  <div
                    className="truncate"
                    style={{
                      fontSize: "var(--text-footnote)",
                      fontWeight: "var(--weight-semibold)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {breadcrumb.map((part, i) => (
                      <span key={i}>
                        {i > 0 && (
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              margin: "0 4px",
                            }}
                          >
                            /
                          </span>
                        )}
                        <span
                          style={{
                            color:
                              i === breadcrumb.length - 1
                                ? "var(--text-primary)"
                                : "var(--text-tertiary)",
                          }}
                        >
                          {part}
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Metadata */}
                  <div
                    style={{
                      fontSize: "var(--text-caption2)",
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                    }}
                  >
                    {lineCount} line{lineCount !== 1 ? "s" : ""}
                    {!isJson && <> {"\u00b7"} {words.toLocaleString()} words</>}
                    {" \u00b7 "}
                    {formatBytes(sizeBytes)}
                    {" \u00b7 "}
                    {timeAgo(selected.lastModified)}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center flex-shrink-0" style={{ gap: "var(--space-2)" }}>
                  <button
                    onClick={copyContent}
                    className="btn-ghost focus-ring"
                    aria-label="Copy file content"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption1)",
                      fontWeight: "var(--weight-medium)",
                    }}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={downloadContent}
                    className="btn-ghost focus-ring"
                    aria-label="Download file"
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "var(--text-caption1)",
                      fontWeight: "var(--weight-medium)",
                    }}
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable content area */}
            <div
              className="flex-1 overflow-y-auto"
              style={{
                padding: "var(--space-8) var(--space-10)",
              }}
            >
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                {renderedContent}
              </div>
            </div>
          </>
        ) : (
          /* ── Empty state (no file selected) ──────────────────── */
          <div
            className="flex flex-col items-center justify-center h-full"
            style={{ gap: "var(--space-3)" }}
          >
            <FolderIcon />
            <span
              style={{
                fontSize: "var(--text-subheadline)",
                fontWeight: "var(--weight-medium)",
                color: "var(--text-secondary)",
                marginTop: "var(--space-2)",
              }}
            >
              Select a file
            </span>
            <span
              style={{
                fontSize: "var(--text-footnote)",
                color: "var(--text-tertiary)",
                textAlign: "center",
                maxWidth: 240,
              }}
            >
              Choose a file from the sidebar to view its contents
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
