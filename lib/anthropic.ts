/**
 * OpenClaw gateway integration for vision (image) messages.
 *
 * The gateway's /v1/chat/completions endpoint strips image_url content parts.
 * Images work through the agent pipeline (chat.send), which is the same path
 * Discord/Telegram/etc use. We invoke the CLI directly via execFile.
 *
 * Flow: extract images as attachments → CLI chat.send → parse response → return
 */

import { execFile } from 'child_process'
import type { ApiMessage, ContentPart } from './validation'

export interface OpenClawAttachment {
  mimeType: string
  content: string // base64
}

/**
 * Check if any message in the array contains image_url content parts.
 */
export function hasImageContent(messages: ApiMessage[]): boolean {
  return messages.some(m => {
    if (typeof m.content === 'string') return false
    return (m.content as ContentPart[]).some(p => p.type === 'image_url')
  })
}

/**
 * Extract all image attachments from messages in OpenClaw's format:
 * { mimeType: "image/png", content: "<base64>" }
 */
export function extractImageAttachments(messages: ApiMessage[]): OpenClawAttachment[] {
  const attachments: OpenClawAttachment[] = []

  for (const msg of messages) {
    if (typeof msg.content === 'string') continue
    for (const part of msg.content as ContentPart[]) {
      if (part.type === 'image_url') {
        const { mediaType, data } = parseDataUrl(part.image_url.url)
        attachments.push({ mimeType: mediaType, content: data })
      }
    }
  }

  return attachments
}

/**
 * Build a text prompt from the system prompt and conversation messages.
 * Extracts text from content arrays, skips system messages and image parts.
 */
export function buildTextPrompt(systemPrompt: string, messages: ApiMessage[]): string {
  const parts: string[] = []

  if (systemPrompt) {
    parts.push(systemPrompt)
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue

    let text: string
    if (typeof msg.content === 'string') {
      text = msg.content
    } else {
      text = (msg.content as ContentPart[])
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n')
    }

    if (text) {
      parts.push(`${msg.role}: ${text}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * Send a vision message through the OpenClaw gateway via CLI (execFile).
 * Runs `openclaw gateway call chat.send --params <json> --expect-final`.
 *
 * Images must be resized client-side to fit within the OS argument size limit.
 *
 * Returns the assistant's response text, or null on failure.
 */
export async function sendViaOpenClaw(opts: {
  gatewayToken: string
  message: string
  attachments: OpenClawAttachment[]
  sessionKey?: string
  timeoutMs?: number
}): Promise<string | null> {
  const openclawBin = process.env.OPENCLAW_BIN || 'openclaw'
  const sessionKey = opts.sessionKey || 'agent:main:manor-ui'
  const idempotencyKey = `manor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timeoutMs = opts.timeoutMs || 60000

  const params = JSON.stringify({
    sessionKey,
    idempotencyKey,
    message: opts.message,
    attachments: opts.attachments,
  })

  return new Promise<string | null>((resolve) => {
    const args = [
      'gateway', 'call', 'chat.send',
      '--params', params,
      '--expect-final',
      '--timeout', String(timeoutMs),
      '--token', opts.gatewayToken,
      '--json',
    ]

    execFile(openclawBin, args, { timeout: timeoutMs + 5000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('sendViaOpenClaw execFile error:', err.message)
        if (stderr) console.error('stderr:', stderr)
        resolve(null)
        return
      }

      try {
        const result = JSON.parse(stdout)
        const content = extractCliResponse(result)
        resolve(content)
      } catch {
        // stdout might be plain text response
        const trimmed = stdout.trim()
        if (trimmed) {
          resolve(trimmed)
        } else {
          console.error('sendViaOpenClaw: empty response')
          resolve(null)
        }
      }
    })
  })
}

/**
 * Extract the assistant's response from the CLI JSON output.
 * The CLI can return responses in several formats.
 */
function extractCliResponse(data: Record<string, unknown>): string | null {
  // Direct content field
  if (typeof data.content === 'string' && data.content) {
    return data.content
  }

  // Response text field
  if (typeof data.text === 'string' && data.text) {
    return data.text
  }

  // Reply field
  if (typeof data.reply === 'string' && data.reply) {
    return data.reply
  }

  // Nested in result/payload
  if (data.result && typeof data.result === 'object') {
    const result = data.result as Record<string, unknown>
    if (typeof result.content === 'string' && result.content) return result.content
    if (typeof result.text === 'string' && result.text) return result.text
    if (result.message && typeof result.message === 'object') {
      const msg = result.message as Record<string, unknown>
      if (typeof msg.content === 'string' && msg.content) return msg.content
    }
  }

  if (data.payload && typeof data.payload === 'object') {
    const payload = data.payload as Record<string, unknown>
    if (typeof payload.content === 'string' && payload.content) return payload.content
    if (typeof payload.text === 'string' && payload.text) return payload.text
  }

  // ok: true with message
  if (data.ok && data.message && typeof data.message === 'object') {
    const msg = data.message as Record<string, unknown>
    if (typeof msg.content === 'string' && msg.content) return msg.content
  }

  return null
}

function parseDataUrl(url: string): { mediaType: string; data: string } {
  if (!url.startsWith('data:')) {
    return { mediaType: 'image/png', data: url }
  }

  const commaIdx = url.indexOf(',')
  if (commaIdx === -1) {
    return { mediaType: 'image/png', data: url }
  }

  const header = url.slice(5, commaIdx)
  const data = url.slice(commaIdx + 1)
  const mediaType = header.split(';')[0] || 'image/png'

  return { mediaType, data }
}
