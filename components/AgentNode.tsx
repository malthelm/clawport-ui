"use client"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import type { Agent, CronJob } from "@/lib/types"

type AgentNodeData = Agent & { crons: CronJob[] } & Record<string, unknown>

export function AgentNode({ data, selected }: NodeProps) {
  const agent = data as AgentNodeData
  const hasCrons = agent.crons && agent.crons.length > 0
  const hasErrors = hasCrons && agent.crons.some((c: CronJob) => c.status === "error")

  return (
    <div
      className={`hover-lift focus-ring${selected ? " node-selected" : ""}`}
      title={agent.title}
      style={{
        background: "var(--material-regular)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderRadius: "var(--radius-md)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--separator)"}`,
        padding: "var(--space-3) var(--space-4)",
        minWidth: 140,
        maxWidth: 180,
        cursor: "pointer",
        position: "relative",
        boxShadow: selected ? "0 0 0 1px var(--accent), var(--shadow-card)" : "var(--shadow-card)",
      }}
    >
      {/* Status dot -- top right */}
      {hasCrons && (
        <div
          className={hasErrors ? "animate-error-pulse" : ""}
          style={{
            position: "absolute",
            top: -3,
            right: -3,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: hasErrors ? "var(--system-red)" : "var(--system-green)",
            border: "2px solid var(--bg)",
          }}
        />
      )}

      {/* Emoji on tinted squircle */}
      <div
        style={{
          fontSize: 24,
          marginBottom: "var(--space-1)",
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${agent.color}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {agent.emoji}
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: "var(--text-footnote)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {agent.name}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: "var(--text-caption2)",
          color: "var(--text-tertiary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1,
        }}
      >
        {agent.title}
      </div>

      {/* Handles - invisible */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

export const nodeTypes = { agentNode: AgentNode }
