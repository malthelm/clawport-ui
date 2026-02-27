"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Agent, CronJob } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ErrorState";

/* ─── Time helpers ──────────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    const m = Math.floor(absDiff / 60000);
    const h = Math.floor(absDiff / 3600000);
    const dy = Math.floor(absDiff / 86400000);
    if (m < 60) return `in ${m}m`;
    if (h < 24) return `in ${h}h`;
    return `in ${dy}d`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function nextRunLabel(dateStr: string | null): string {
  if (!dateStr) return "not scheduled";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "\u2014";
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `in ${mins}m`;
  if (hrs < 24) return `in ${hrs}h`;
  return `in ${days}d`;
}

/* ─── Types ─────────────────────────────────────────────────────── */

type Filter = "all" | "ok" | "error" | "idle";

const STATUS_DOT: Record<string, string> = {
  ok: "var(--system-green)",
  error: "var(--system-red)",
  idle: "var(--text-tertiary)",
};

const PILLS: { key: Filter; label: string; dotColor: string }[] = [
  { key: "all", label: "All", dotColor: "var(--text-primary)" },
  { key: "ok", label: "OK", dotColor: "var(--system-green)" },
  { key: "error", label: "Errors", dotColor: "var(--system-red)" },
  { key: "idle", label: "Idle", dotColor: "var(--text-tertiary)" },
];

/* ─── Component ─────────────────────────────────────────────────── */

export default function CronsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAgo, setUpdatedAgo] = useState("just now");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* Filter pill keyboard navigation */
  const pillsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    Promise.all([
      fetch("/api/crons").then((r) => {
        if (!r.ok) throw new Error("Failed to load crons");
        return r.json();
      }),
      fetch("/api/agents").then((r) => {
        if (!r.ok) throw new Error("Failed to load agents");
        return r.json();
      }),
    ])
      .then(([c, a]) => {
        setCrons(c);
        setAgents(a);
        setLastRefresh(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  /* Auto-refresh every 60s */
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  /* Update "Updated Xm ago" label every 30s */
  useEffect(() => {
    const tick = () => setUpdatedAgo(timeAgo(lastRefresh.toISOString()));
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [lastRefresh]);

  /* Derived data */
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const statusOrder: Record<string, number> = { error: 0, idle: 1, ok: 2 };
  const filtered = crons
    .filter((c) => filter === "all" || c.status === filter)
    .sort(
      (a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    );
  const counts = {
    all: crons.length,
    ok: crons.filter((c) => c.status === "ok").length,
    error: crons.filter((c) => c.status === "error").length,
    idle: crons.filter((c) => c.status === "idle").length,
  };

  /* Pill keyboard handler */
  function handlePillKeyDown(e: React.KeyboardEvent) {
    const pills = pillsRef.current;
    if (!pills) return;
    const buttons = Array.from(
      pills.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    const current = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    let next = current;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next = (current + 1) % buttons.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      next = (current - 1 + buttons.length) % buttons.length;
    }
    if (next !== current) {
      buttons[next].focus();
      buttons[next].click();
    }
  }

  /* Copy error text */
  function copyError(cronId: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(cronId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  /* ─── Error state ──────────────────────────────────────────────── */
  if (error && crons.length === 0) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden animate-fade-in"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Sticky header ──────────────────────────────────────── */}
      <header
        className="sticky top-0 z-10 flex-shrink-0"
        style={{
          background: "var(--material-regular)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          borderBottom: "1px solid var(--separator)",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "var(--space-4) var(--space-6)" }}
        >
          {/* Left: title + summary */}
          <div>
            <h1
              style={{
                fontSize: "var(--text-title1)",
                fontWeight: "var(--weight-bold)",
                color: "var(--text-primary)",
                letterSpacing: "-0.5px",
                lineHeight: "var(--leading-tight)",
              }}
            >
              Cron Monitor
            </h1>
            {!loading && (
              <p
                style={{
                  fontSize: "var(--text-footnote)",
                  color: "var(--text-secondary)",
                  marginTop: "var(--space-1)",
                }}
              >
                {counts.all} job{counts.all !== 1 ? "s" : ""}
                {counts.error > 0 && (
                  <span style={{ color: "var(--system-red)" }}>
                    {" \u00b7 "}{counts.error} error{counts.error !== 1 ? "s" : ""}
                  </span>
                )}
                {" \u00b7 "}{counts.ok} ok
              </p>
            )}
          </div>

          {/* Right: updated label + refresh */}
          <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
            <span
              style={{
                fontSize: "var(--text-caption1)",
                color: "var(--text-tertiary)",
              }}
            >
              Updated {updatedAgo}
            </span>
            <button
              onClick={refresh}
              className="focus-ring"
              aria-label="Refresh cron data"
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "transparent",
                color: "var(--text-tertiary)",
                cursor: "pointer",
                transition: "color 150ms var(--ease-smooth)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M1.5 8a6.5 6.5 0 0 1 11.48-4.17" />
                <path d="M14.5 8a6.5 6.5 0 0 1-11.48 4.17" />
                <polyline points="1.5 1.5 1.5 4 4 4" />
                <polyline points="14.5 14.5 14.5 12 12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Filter pills ─────────────────────────────────────── */}
        <div
          ref={pillsRef}
          role="tablist"
          aria-label="Filter cron jobs by status"
          onKeyDown={handlePillKeyDown}
          className="flex items-center overflow-x-auto flex-shrink-0"
          style={{
            padding: "0 var(--space-6) var(--space-3)",
            gap: "var(--space-2)",
          }}
        >
          {PILLS.map((pill) => {
            const isActive = filter === pill.key;
            return (
              <button
                key={pill.key}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setFilter(pill.key)}
                className="focus-ring flex items-center flex-shrink-0"
                style={{
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: "var(--text-footnote)",
                  fontWeight: "var(--weight-medium)",
                  border: "none",
                  cursor: "pointer",
                  gap: "var(--space-2)",
                  transition: "all 200ms var(--ease-smooth)",
                  ...(isActive
                    ? {
                        background: "var(--accent-fill)",
                        color: "var(--accent)",
                        boxShadow:
                          "0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)",
                      }
                    : {
                        background: "var(--fill-secondary)",
                        color: "var(--text-primary)",
                      }),
                }}
              >
                <span
                  className={`flex-shrink-0 rounded-full ${
                    pill.key === "error" && counts.error > 0
                      ? "animate-error-pulse"
                      : ""
                  }`}
                  style={{
                    width: 6,
                    height: 6,
                    background: pill.dotColor,
                  }}
                />
                <span>{pill.label}</span>
                <span
                  style={{
                    fontWeight: "var(--weight-semibold)",
                    color: isActive ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  {counts[pill.key]}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Cron list ──────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "var(--space-4) var(--space-6) var(--space-6)" }}
      >
        {loading ? (
          /* ── Loading skeleton ─────────────────────────────────── */
          <div
            style={{
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--material-regular)",
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center"
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderBottom:
                    i < 5 ? "1px solid var(--separator)" : undefined,
                  gap: "var(--space-3)",
                }}
              >
                <Skeleton
                  className="flex-shrink-0"
                  style={{ width: 8, height: 8, borderRadius: "50%" }}
                />
                <Skeleton style={{ width: 180, height: 14 }} />
                <div className="ml-auto flex items-center" style={{ gap: "var(--space-3)" }}>
                  <Skeleton style={{ width: 48, height: 12 }} />
                  <Skeleton style={{ width: 64, height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────── */
          <div
            className="flex flex-col items-center justify-center"
            style={{
              height: 200,
              color: "var(--text-secondary)",
              gap: "var(--space-2)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-tertiary)", marginBottom: "var(--space-2)" }}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span style={{ fontSize: "var(--text-subheadline)", fontWeight: "var(--weight-medium)" }}>
              {crons.length === 0
                ? "No cron jobs found"
                : "No crons match this filter"}
            </span>
            <span style={{ fontSize: "var(--text-footnote)", color: "var(--text-tertiary)" }}>
              {crons.length === 0
                ? "Cron jobs will appear here once configured"
                : "Try selecting a different status filter"}
            </span>
          </div>
        ) : (
          /* ── Cron rows ───────────────────────────────────────── */
          <div
            style={{
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
              background: "var(--material-regular)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {filtered.map((cron, idx) => {
              const agent = cron.agentId
                ? agentMap.get(cron.agentId)
                : null;
              const isExpanded = expanded === cron.id;
              const isError = cron.status === "error";
              const isOverdue =
                cron.nextRun && nextRunLabel(cron.nextRun) === "overdue";

              return (
                <div key={cron.id}>
                  {/* Separator */}
                  {idx > 0 && (
                    <div
                      style={{
                        height: 1,
                        background: "var(--separator)",
                        marginLeft: "var(--space-4)",
                        marginRight: "var(--space-4)",
                      }}
                    />
                  )}

                  {/* Collapsed row */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-label={`${cron.name}, status ${cron.status}${
                      agent ? `, agent ${agent.name}` : ""
                    }`}
                    onClick={() =>
                      setExpanded(isExpanded ? null : cron.id)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(isExpanded ? null : cron.id);
                      }
                    }}
                    className="flex items-center cursor-pointer hover-bg focus-ring"
                    style={{
                      minHeight: 48,
                      padding: "0 var(--space-4)",
                      background: isError
                        ? "rgba(255,69,58,0.06)"
                        : undefined,
                      borderLeft: `3px solid ${
                        isError
                          ? "var(--system-red)"
                          : cron.status === "ok"
                            ? "var(--system-green)"
                            : "transparent"
                      }`,
                    }}
                  >
                    {/* Status dot */}
                    <span
                      className={`flex-shrink-0 rounded-full ${
                        isError ? "animate-error-pulse" : ""
                      }`}
                      style={{
                        width: 8,
                        height: 8,
                        background: STATUS_DOT[cron.status] ?? "var(--text-tertiary)",
                      }}
                    />

                    {/* Name + agent (mobile stacked) */}
                    <div
                      className="ml-3 min-w-0 flex-1"
                      style={{ display: "flex", flexDirection: "column" }}
                    >
                      <span
                        className="truncate"
                        style={{
                          fontSize: "var(--text-footnote)",
                          fontWeight: "var(--weight-semibold)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {cron.name}
                      </span>
                      {/* Agent name under cron name on mobile */}
                      {agent && (
                        <Link
                          href={`/chat/${agent.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="md:hidden focus-ring"
                          aria-label={`Chat with ${agent.name}`}
                          style={{
                            fontSize: "var(--text-caption1)",
                            color: "var(--system-blue)",
                            textDecoration: "none",
                            lineHeight: "var(--leading-snug)",
                          }}
                        >
                          {agent.name}
                        </Link>
                      )}
                    </div>

                    {/* Right side: agent, schedule, chevron */}
                    <div
                      className="ml-auto flex items-center flex-shrink-0"
                      style={{ gap: "var(--space-3)" }}
                    >
                      {/* Agent (desktop) */}
                      {agent ? (
                        <Link
                          href={`/chat/${agent.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hidden md:inline focus-ring"
                          aria-label={`Chat with ${agent.name}`}
                          style={{
                            fontSize: "var(--text-caption1)",
                            color: "var(--system-blue)",
                            textDecoration: "none",
                          }}
                        >
                          {agent.name}
                        </Link>
                      ) : (
                        <span
                          className="hidden md:inline"
                          style={{
                            fontSize: "var(--text-caption1)",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {"\u2014"}
                        </span>
                      )}

                      {/* Schedule (hidden on mobile) */}
                      <span
                        className="hidden md:inline font-mono"
                        style={{
                          fontSize: "var(--text-caption1)",
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {cron.schedule}
                      </span>

                      {/* Chevron */}
                      <span
                        aria-hidden="true"
                        style={{
                          fontSize: "var(--text-footnote)",
                          color: "var(--text-tertiary)",
                          transition: "transform 200ms var(--ease-smooth)",
                          transform: isExpanded
                            ? "rotate(90deg)"
                            : "rotate(0deg)",
                          display: "inline-block",
                        }}
                      >
                        &#8250;
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      className="animate-slide-down"
                      style={{
                        padding: "0 var(--space-4) var(--space-4) var(--space-4)",
                        marginLeft: 3, /* align with border-left offset */
                      }}
                    >
                      {/* Detail grid */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: "var(--space-1) var(--space-4)",
                          marginTop: "var(--space-2)",
                          marginBottom: "var(--space-3)",
                        }}
                      >
                        <span style={{ fontSize: "var(--text-caption1)", color: "var(--text-tertiary)" }}>
                          Last run
                        </span>
                        <span style={{ fontSize: "var(--text-caption1)", color: "var(--text-secondary)" }}>
                          {timeAgo(cron.lastRun)}
                        </span>

                        <span style={{ fontSize: "var(--text-caption1)", color: "var(--text-tertiary)" }}>
                          Next run
                        </span>
                        <span
                          style={{
                            fontSize: "var(--text-caption1)",
                            color: isOverdue
                              ? "var(--system-orange)"
                              : "var(--text-secondary)",
                            fontWeight: isOverdue ? "var(--weight-semibold)" : undefined,
                          }}
                        >
                          {nextRunLabel(cron.nextRun)}
                        </span>

                        <span style={{ fontSize: "var(--text-caption1)", color: "var(--text-tertiary)" }}>
                          Status
                        </span>
                        <span
                          style={{
                            fontSize: "var(--text-caption1)",
                            color:
                              cron.status === "error"
                                ? "var(--system-red)"
                                : cron.status === "ok"
                                  ? "var(--system-green)"
                                  : "var(--text-secondary)",
                            fontWeight: "var(--weight-medium)",
                            textTransform: "capitalize",
                          }}
                        >
                          {cron.status}
                        </span>

                        <span style={{ fontSize: "var(--text-caption1)", color: "var(--text-tertiary)" }}>
                          Schedule
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: "var(--text-caption1)", color: "var(--text-secondary)" }}
                        >
                          {cron.schedule}
                        </span>
                      </div>

                      {/* Error box */}
                      {cron.lastError && (
                        <div
                          style={{
                            borderRadius: "var(--radius-sm)",
                            background: "var(--code-bg)",
                            border: "1px solid var(--code-border)",
                            padding: "var(--space-3)",
                            marginBottom: "var(--space-3)",
                          }}
                        >
                          <div
                            className="flex items-start justify-between"
                            style={{ gap: "var(--space-2)" }}
                          >
                            <pre
                              className="font-mono"
                              style={{
                                fontSize: "var(--text-caption1)",
                                color: "var(--system-red)",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                margin: 0,
                                flex: 1,
                                lineHeight: "var(--leading-relaxed)",
                              }}
                            >
                              {cron.lastError}
                            </pre>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyError(cron.id, cron.lastError!);
                              }}
                              className="btn-ghost focus-ring flex-shrink-0"
                              aria-label="Copy error text"
                              style={{
                                padding: "4px 10px",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "var(--text-caption2)",
                                fontWeight: "var(--weight-medium)",
                              }}
                            >
                              {copiedId === cron.id ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
                        {agent && (
                          <Link
                            href={`/chat/${agent.id}`}
                            className="btn-ghost focus-ring"
                            aria-label={`Chat with ${agent.name}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "var(--space-1)",
                              padding: "6px 12px",
                              borderRadius: "var(--radius-sm)",
                              fontSize: "var(--text-caption1)",
                              fontWeight: "var(--weight-medium)",
                              textDecoration: "none",
                              color: "var(--system-blue)",
                            }}
                          >
                            Chat with {agent.name}
                            <span aria-hidden="true" style={{ fontSize: "var(--text-caption1)" }}>
                              {"\u2192"}
                            </span>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
