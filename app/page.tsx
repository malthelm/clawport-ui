"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import type { Agent, CronJob } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ErrorState"

const ManorMap = dynamic(
  () => import("@/components/ManorMap").then((m) => ({ default: m.ManorMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Skeleton width={240} height={12} />
          <Skeleton width={180} height={12} />
          <Skeleton width={200} height={12} />
        </div>
      </div>
    ),
  },
)

const TOOL_ICONS: Record<string, string> = {
  web_search: "\uD83D\uDD0D",
  read: "\uD83D\uDCC1",
  write: "\u270F\uFE0F",
  exec: "\uD83D\uDCBB",
  web_fetch: "\uD83C\uDF10",
  message: "\uD83D\uDD14",
  tts: "\uD83D\uDCAC",
  edit: "\u2702\uFE0F",
  sessions_spawn: "\uD83D\uDD04",
  memory_search: "\uD83E\udDE0",
}

function StatusDot({ status }: { status: CronJob["status"] }) {
  return (
    <span
      className={status === "error" ? "animate-error-pulse" : ""}
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        flexShrink: 0,
        background:
          status === "ok"
            ? "var(--system-green)"
            : status === "error"
              ? "var(--system-red)"
              : "var(--text-tertiary)",
      }}
    />
  )
}

/* ──────────────────────────────────────────────
   Loading skeleton for the map area
   ────────────────────────────────────────────── */
function MapSkeleton() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-6"
      style={{ padding: "var(--space-8)" }}
    >
      {/* Fake root node */}
      <Skeleton width={160} height={80} style={{ borderRadius: "var(--radius-md)" }} />
      {/* Fake second row */}
      <div className="flex gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            width={140}
            height={72}
            style={{ borderRadius: "var(--radius-md)" }}
          />
        ))}
      </div>
      {/* Fake third row */}
      <div className="flex gap-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton
            key={i}
            width={130}
            height={64}
            style={{ borderRadius: "var(--radius-md)" }}
          />
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   Main page
   ────────────────────────────────────────────── */
export default function ManorPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [crons, setCrons] = useState<CronJob[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const loadData = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch("/api/agents").then((r) => {
        if (!r.ok) throw new Error("Failed to fetch agents")
        return r.json()
      }),
      fetch("/api/crons").then((r) => {
        if (!r.ok) throw new Error("Failed to fetch crons")
        return r.json()
      }),
    ])
      .then(([a, c]) => {
        setAgents(a)
        setCrons(c)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Focus close button when panel opens
  useEffect(() => {
    if (selected && closeRef.current) {
      closeRef.current.focus()
    }
  }, [selected])

  // Keyboard: ESC closes panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selected) {
        setSelected(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selected])

  const agentCrons = selected ? crons.filter((c) => c.agentId === selected.id) : []

  // Find hierarchy info for the detail panel
  const parentAgent = selected?.reportsTo
    ? agents.find((a) => a.id === selected.reportsTo)
    : null
  const childAgents = selected
    ? selected.directReports
        .map((cid) => agents.find((a) => a.id === cid))
        .filter(Boolean) as Agent[]
    : []

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />
  }

  return (
    <div className="flex h-full relative" style={{ background: "var(--bg)" }}>
      {/* ── Map area ── */}
      <div className="flex-1 h-full relative">
        {loading ? (
          <MapSkeleton />
        ) : (
          <ManorMap
            agents={agents}
            crons={crons}
            selectedId={selected?.id ?? null}
            onNodeClick={setSelected}
          />
        )}

        {/* Legend -- top right */}
        <div
          className="hidden md:flex"
          style={{
            position: "absolute",
            top: "var(--space-4)",
            right: selected ? 376 : "var(--space-4)",
            transition: "right 300ms var(--ease-snappy)",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            background: "var(--material-regular)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--separator)",
            fontSize: "var(--text-caption2)",
            color: "var(--text-tertiary)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--system-green)",
                display: "inline-block",
              }}
            />
            Healthy
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--system-red)",
                display: "inline-block",
              }}
            />
            Errors
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--text-tertiary)",
                display: "inline-block",
              }}
            />
            No crons
          </span>
        </div>
      </div>

      {/* ── Mobile backdrop ── */}
      {selected && (
        <div
          className="fixed inset-0 z-30 md:hidden backdrop-fade"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setSelected(null)}
        />
      )}

      {/* ── Detail panel ── */}
      {selected ? (
        <div
          className="fixed inset-0 z-40 md:relative md:z-auto panel-slide-in"
          style={{
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <div
            className="h-full flex flex-col ml-auto"
            style={{
              width: "100%",
              maxWidth: 360,
              flexShrink: 0,
              overflowY: "auto",
              background: "var(--material-regular)",
              backdropFilter: "var(--sidebar-backdrop)",
              WebkitBackdropFilter: "var(--sidebar-backdrop)",
              boxShadow: "var(--shadow-overlay)",
            }}
          >
            {/* Color strip */}
            <div
              style={{
                height: 3,
                background: selected.color,
                flexShrink: 0,
              }}
            />

            {/* Close button */}
            <div
              style={{
                padding: "var(--space-4) var(--space-5) 0",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                ref={closeRef}
                onClick={() => setSelected(null)}
                className="focus-ring"
                aria-label="Close detail panel"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--fill-secondary)",
                  color: "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "var(--text-footnote)",
                  transition: "all 150ms var(--ease-spring)",
                }}
              >
                &#x2715;
              </button>
            </div>

            {/* Header */}
            <div style={{ padding: "var(--space-2) var(--space-6) var(--space-5)" }}>
              {/* Emoji on squircle */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: `${selected.color}26`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  marginBottom: "var(--space-3)",
                }}
              >
                {selected.emoji}
              </div>

              <h2
                style={{
                  fontSize: "var(--text-title1)",
                  fontWeight: "var(--weight-bold)",
                  letterSpacing: "-0.5px",
                  color: "var(--text-primary)",
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {selected.name}
              </h2>

              <p
                style={{
                  fontSize: "var(--text-subheadline)",
                  fontWeight: "var(--weight-regular)",
                  color: "var(--text-secondary)",
                  margin: "2px 0 0",
                }}
              >
                {selected.title}
              </p>

              <div
                style={{
                  marginTop: "var(--space-3)",
                  height: 1,
                  background: "var(--separator)",
                }}
              />
            </div>

            {/* ABOUT */}
            <div style={{ padding: "0 var(--space-6) var(--space-4)" }}>
              <div className="section-header" style={{ marginBottom: "var(--space-2)" }}>
                About
              </div>
              <p
                style={{
                  fontSize: "var(--text-footnote)",
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                {selected.description}
              </p>
            </div>

            {/* TOOLS */}
            <div style={{ padding: "0 var(--space-6) var(--space-4)" }}>
              <div className="section-header" style={{ marginBottom: "var(--space-2)" }}>
                Tools
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selected.tools.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "var(--fill-secondary)",
                      borderRadius: 8,
                      padding: "5px 10px",
                      fontSize: "var(--text-caption1)",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {TOOL_ICONS[t] && (
                      <span style={{ fontSize: "var(--text-caption2)" }}>{TOOL_ICONS[t]}</span>
                    )}
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* HIERARCHY */}
            {(parentAgent || childAgents.length > 0) && (
              <div style={{ padding: "0 var(--space-6) var(--space-4)" }}>
                <div className="section-header" style={{ marginBottom: "var(--space-2)" }}>
                  Hierarchy
                </div>
                {parentAgent && (
                  <div style={{ marginBottom: "var(--space-2)" }}>
                    <span
                      style={{
                        fontSize: "var(--text-caption2)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      Reports to
                    </span>
                    <button
                      className="focus-ring"
                      aria-label={`Select ${parentAgent.name}`}
                      onClick={() => setSelected(parentAgent)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        marginTop: 2,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "var(--text-body)",
                        fontWeight: "var(--weight-medium)",
                        color: "var(--system-blue)",
                        padding: 0,
                      }}
                    >
                      <span>{parentAgent.emoji}</span>
                      <span>{parentAgent.name}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>&rarr;</span>
                    </button>
                  </div>
                )}
                {childAgents.length > 0 && (
                  <div>
                    <span
                      style={{
                        fontSize: "var(--text-caption2)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      Direct reports
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        marginTop: 2,
                      }}
                    >
                      {childAgents.map((c) => (
                        <button
                          key={c.id}
                          className="focus-ring"
                          aria-label={`Select ${c.name}`}
                          onClick={() => setSelected(c)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "var(--space-2)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "var(--text-body)",
                            fontWeight: "var(--weight-medium)",
                            color: "var(--system-blue)",
                            padding: "2px 0",
                          }}
                        >
                          <span>{c.emoji}</span>
                          <span>{c.name}</span>
                          <span style={{ color: "var(--text-tertiary)" }}>&rarr;</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CRONS */}
            {agentCrons.length > 0 && (
              <div style={{ padding: "0 var(--space-6) var(--space-4)" }}>
                <div className="section-header" style={{ marginBottom: "var(--space-2)" }}>
                  Crons
                </div>
                <div
                  style={{
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                  }}
                >
                  {agentCrons.map((c, idx) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        minHeight: 40,
                        padding: "0 var(--space-3)",
                        borderTop:
                          idx > 0 ? "1px solid var(--separator)" : undefined,
                      }}
                    >
                      <StatusDot status={c.status} />
                      <span
                        style={{
                          fontSize: "var(--text-body)",
                          fontWeight: "var(--weight-medium)",
                          color: "var(--text-primary)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.name}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--text-caption1)",
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                        }}
                      >
                        {c.schedule}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs -- pushed to bottom */}
            <div
              style={{
                marginTop: "auto",
                padding: "var(--space-5) var(--space-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              <button
                onClick={() => router.push(`/chat/${selected.id}`)}
                className="btn-primary focus-ring"
                aria-label={`Open chat with ${selected.name}`}
              >
                Open Chat
              </button>
              <Link
                href={`/agents/${selected.id}`}
                className="btn-ghost focus-ring"
                aria-label={`View full profile of ${selected.name}`}
              >
                View Profile
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state -- hidden on mobile */
        <div
          className="hidden md:flex"
          style={{
            width: 360,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            background: "var(--material-regular)",
            backdropFilter: "var(--sidebar-backdrop)",
            WebkitBackdropFilter: "var(--sidebar-backdrop)",
            boxShadow: "var(--shadow-overlay)",
          }}
        >
          <div style={{ textAlign: "center", padding: "0 var(--space-6)" }}>
            <div style={{ fontSize: 48, marginBottom: "var(--space-3)" }}>
              {"\uD83D\uDDFA\uFE0F"}
            </div>
            <div
              style={{
                fontSize: "var(--text-title2)",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-primary)",
              }}
            >
              Select an agent
            </div>
            <div
              style={{
                fontSize: "var(--text-footnote)",
                color: "var(--text-secondary)",
                marginTop: "var(--space-1)",
                lineHeight: 1.5,
              }}
            >
              Click any node on the map to inspect
            </div>
            <div
              style={{
                fontSize: "var(--text-caption2)",
                color: "var(--text-tertiary)",
                marginTop: "var(--space-3)",
              }}
            >
              Tip: Press ESC to close the panel
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
