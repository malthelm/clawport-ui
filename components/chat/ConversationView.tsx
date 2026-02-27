'use client'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Agent } from '@/lib/types'
import type { Conversation, ConversationStore, Message, MediaAttachment } from '@/lib/conversations'
import { parseMedia, addMessage, updateLastMessage } from '@/lib/conversations'

interface ConversationViewProps {
  agent: Agent
  conversation: Conversation
  onUpdate: (agentId: string, updater: (prev: ConversationStore) => ConversationStore) => void
  onBack?: () => void
}

/* ── Markdown rendering ──────────────────────────────────── */

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Match URLs, bold, inline code, italic — in priority order
  const regex = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])|(\*\*(.+?)\*\*)|(`([^`]+)`)|\*([^*]+)\*/g
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1]) {
      // URL
      parts.push(
        <a
          key={match.index}
          href={match[1]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--system-blue)', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {match[1]}
        </a>
      )
    } else if (match[2]) {
      // Bold
      parts.push(<strong key={match.index} style={{ fontWeight: 'var(--weight-bold)' }}>{match[3]}</strong>)
    } else if (match[4]) {
      // Inline code
      parts.push(
        <code key={match.index} style={{
          background: 'var(--code-bg)',
          border: '1px solid var(--code-border)',
          borderRadius: 5,
          padding: '1px 5px',
          fontSize: '0.88em',
          fontFamily: '"SF Mono", Menlo, monospace',
          color: 'var(--code-text)',
        }}>{match[5]}</code>
      )
    } else if (match[6]) {
      // Italic
      parts.push(<em key={match.index} style={{ fontStyle: 'italic', opacity: 0.85 }}>{match[6]}</em>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <>{parts}</>
}

function CodeBlock({ code, keyProp }: { code: string; keyProp: number }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div key={keyProp} className="code-block-wrapper">
      <button
        className="code-copy-btn focus-ring"
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre><code>{code}</code></pre>
    </div>
  )
}

function formatMessage(content: string): React.ReactNode {
  if (!content) return null
  const lines = content.split('\n')
  const result: React.ReactNode[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLines = []
      } else {
        inCodeBlock = false
        result.push(<CodeBlock key={i} keyProp={i} code={codeLines.join('\n')} />)
        codeLines = []
      }
      continue
    }
    if (inCodeBlock) { codeLines.push(line); continue }
    if (line.trim() === '') { result.push(<div key={`space-${i}`} style={{ height: 6 }} />); continue }
    if (line.match(/^[-*] /)) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>&bull;</span>
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      )
      continue
    }
    if (line.match(/^\d+\. /)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      result.push(
        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 2 }}>
          <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 'var(--weight-semibold)', minWidth: 16 }}>{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
      continue
    }
    if (line.startsWith('### ')) {
      result.push(
        <div key={i} style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-footnote)', marginTop: 'var(--space-2)', marginBottom: 2 }}>
          {inlineFormat(line.slice(4))}
        </div>
      )
      continue
    }
    if (line.startsWith('## ')) {
      result.push(
        <div key={i} style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subheadline)', marginTop: 'var(--space-3)', marginBottom: 3 }}>
          {inlineFormat(line.slice(3))}
        </div>
      )
      continue
    }
    if (line.startsWith('# ')) {
      result.push(
        <div key={i} style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body)', marginTop: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
          {inlineFormat(line.slice(2))}
        </div>
      )
      continue
    }
    result.push(<div key={i} style={{ marginBottom: 1 }}>{inlineFormat(line)}</div>)
  }
  return <>{result}</>
}

/* ── Timestamp formatting ──────────────────────────────── */

function formatTimestamp(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const isToday = now.toDateString() === date.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = yesterday.toDateString() === date.toDateString()
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

function shouldShowTimestamp(messages: Message[], index: number): boolean {
  if (index === 0) return true
  const gap = messages[index].timestamp - messages[index - 1].timestamp
  return gap > 5 * 60 * 1000 // 5 minutes
}

function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (index === 0) return true
  return messages[index - 1].role !== messages[index].role
}

/* ── Component ──────────────────────────────────────────── */

export function ConversationView({ agent, conversation, onUpdate, onBack }: ConversationViewProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messages = conversation?.messages || []
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return
    const text = input.trim()
    setInput('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const assistantMsgId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }

    onUpdate(agent.id, prev => {
      let next = addMessage(prev, agent.id, userMsg)
      next = addMessage(next, agent.id, assistantMsg)
      return next
    })

    setIsStreaming(true)

    // Use ref to read latest messages (avoids stale closure)
    const apiMessages = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(`/api/chat/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(line.slice(6))
              if (chunk.content) {
                fullContent += chunk.content
                const capturedContent = fullContent
                onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, capturedContent, true))
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }

      const finalContent = fullContent
      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, finalContent, false))
    } catch {
      onUpdate(agent.id, prev => updateLastMessage(prev, agent.id, assistantMsgId, 'Error getting response. Check API connection.', false))
    } finally {
      setIsStreaming(false)
      textareaRef.current?.focus()
    }
  }, [input, isStreaming, agent.id, onUpdate])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      textareaRef.current?.blur()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    const isImage = file.type.startsWith('image/')
    const isAudio = file.type.startsWith('audio/')
    const media: MediaAttachment[] = [{
      type: isImage ? 'image' : isAudio ? 'audio' : 'file',
      url,
      name: file.name,
    }]
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: isImage ? `[Attached: ${file.name}]` : `[File: ${file.name}]`,
      timestamp: Date.now(),
      media,
    }
    onUpdate(agent.id, prev => addMessage(prev, agent.id, msg))
    e.target.value = ''
  }

  function clearChat() {
    onUpdate(agent.id, prev => ({
      ...prev,
      [agent.id]: {
        agentId: agent.id,
        messages: [{
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: `I'm ${agent.name}. ${agent.description} What do you need?`,
          timestamp: Date.now(),
        }],
        unread: 0,
        lastActivity: Date.now(),
      }
    }))
  }

  const hasInput = input.trim().length > 0

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* ── Header ─────────────────────────────────── */}
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        borderBottom: '1px solid var(--separator)',
        background: 'var(--material-thick)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}>
        {/* Mobile back button */}
        {onBack && (
          <button
            className="md:hidden btn-ghost focus-ring"
            onClick={onBack}
            aria-label="Back to agents"
            style={{
              padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              marginRight: 'var(--space-2)',
              fontSize: 'var(--text-subheadline)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        )}

        {/* Agent info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flex: 1,
          minWidth: 0,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}55)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
            border: `1px solid ${agent.color}44`,
          }}>
            {agent.emoji}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--text-subheadline)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              letterSpacing: '-0.2px',
              lineHeight: 1.2,
            }}>
              {agent.name}
            </div>
            <div style={{
              fontSize: 'var(--text-caption2)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {agent.title}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <button
            className="btn-ghost focus-ring"
            aria-label="View agent profile"
            onClick={() => router.push(`/agents/${agent.id}`)}
            style={{
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <button
            className="btn-ghost focus-ring"
            aria-label="Clear conversation"
            onClick={clearChat}
            style={{
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ──────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg)',
        padding: 'var(--space-5) 0 var(--space-16) 0',
      }}>
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user'
          const showAvatar = shouldShowAvatar(messages, i)
          const showTimestamp = shouldShowTimestamp(messages, i)
          const isLastAssistant = !isUser && i === messages.length - 1 && (isStreaming || msg.isStreaming)
          const showTypingDots = isLastAssistant && !msg.content
          const media = msg.media || parseMedia(msg.content)

          // Strip media URLs from text for display
          let textContent = msg.content
          if (media.length > 0 && !msg.media) {
            media.forEach(m => {
              textContent = textContent.replace(m.url, '')
              textContent = textContent.replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
            })
            textContent = textContent.trim()
          }

          return (
            <div key={msg.id || i} className="animate-fade-in">
              {/* Timestamp divider */}
              {showTimestamp && (
                <div style={{
                  textAlign: 'center',
                  padding: 'var(--space-3) 0',
                  fontSize: 'var(--text-caption2)',
                  color: 'var(--text-tertiary)',
                }}>
                  {formatTimestamp(msg.timestamp)}
                </div>
              )}

              {/* Spacing between role switches */}
              {!showTimestamp && i > 0 && (
                <div style={{ height: messages[i - 1].role !== msg.role ? 'var(--space-4)' : 'var(--space-1)' }} />
              )}

              {/* User message */}
              {isUser && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '0 var(--space-4)',
                  marginBottom: 'var(--space-1)',
                }}>
                  <div className="msg-user" style={{
                    maxWidth: '75%',
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)',
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: 'var(--text-subheadline)',
                    lineHeight: 'var(--leading-relaxed)',
                    fontWeight: 'var(--weight-medium)',
                    boxShadow: 'var(--shadow-subtle)',
                  }}>
                    {textContent}
                  </div>
                </div>
              )}

              {/* Assistant message */}
              {!isUser && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  padding: '0 var(--space-4)',
                  marginBottom: 'var(--space-1)',
                }}>
                  {/* Small avatar */}
                  <div style={{
                    flexShrink: 0,
                    width: 28,
                    marginRight: 'var(--space-2)',
                  }}>
                    {showAvatar ? (
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}55)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        border: `1px solid ${agent.color}44`,
                      }}>
                        {agent.emoji}
                      </div>
                    ) : <div style={{ width: 28 }} />}
                  </div>

                  <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column' }}>
                    {/* Typing indicator */}
                    {showTypingDots && (
                      <div className="msg-assistant" style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                        background: 'var(--material-thin)',
                        border: '1px solid var(--separator)',
                      }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
                          <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                          <span className="typing-dot" style={{ animationDelay: '150ms' }} />
                          <span className="typing-dot" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    )}

                    {/* Text bubble */}
                    {textContent && (
                      <div className="msg-assistant" style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                        background: 'var(--material-thin)',
                        border: '1px solid var(--separator)',
                        color: 'var(--text-primary)',
                        fontSize: 'var(--text-subheadline)',
                        lineHeight: 'var(--leading-relaxed)',
                      }}>
                        {formatMessage(textContent)}
                        {/* Streaming cursor */}
                        {isLastAssistant && textContent && (
                          <span style={{
                            display: 'inline-block',
                            width: 2,
                            height: '1.1em',
                            background: 'var(--accent)',
                            marginLeft: 2,
                            animation: 'blink-cursor 1s step-end infinite',
                            verticalAlign: 'text-bottom',
                          }} />
                        )}
                      </div>
                    )}

                    {/* Image attachments */}
                    {media.filter(m => m.type === 'image').map((m, mi) => (
                      <div key={mi} style={{
                        marginTop: 'var(--space-2)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        maxWidth: 280,
                      }}>
                        <img
                          src={m.url}
                          alt={m.name || 'Image'}
                          style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-lg)', cursor: 'pointer' }}
                          onClick={() => window.open(m.url, '_blank')}
                        />
                      </div>
                    ))}

                    {/* Audio attachments */}
                    {media.filter(m => m.type === 'audio').map((m, mi) => (
                      <div key={mi} style={{
                        marginTop: 'var(--space-2)',
                        background: 'var(--material-thin)',
                        border: '1px solid var(--separator)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-3) var(--space-4)',
                        maxWidth: 280,
                      }}>
                        <div style={{
                          fontSize: 'var(--text-caption2)',
                          color: 'var(--text-tertiary)',
                          marginBottom: 'var(--space-2)',
                        }}>
                          {m.name || 'Audio'}
                        </div>
                        <audio controls src={m.url} style={{ width: '100%', height: 32 }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User-side image/audio attachments */}
              {isUser && media.length > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '0 var(--space-4)',
                  marginBottom: 'var(--space-1)',
                }}>
                  <div style={{ maxWidth: '75%' }}>
                    {media.filter(m => m.type === 'image').map((m, mi) => (
                      <div key={mi} style={{
                        marginTop: 'var(--space-2)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        maxWidth: 280,
                      }}>
                        <img
                          src={m.url}
                          alt={m.name || 'Image'}
                          style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-lg)', cursor: 'pointer' }}
                          onClick={() => window.open(m.url, '_blank')}
                        />
                      </div>
                    ))}
                    {media.filter(m => m.type === 'audio').map((m, mi) => (
                      <div key={mi} style={{
                        marginTop: 'var(--space-2)',
                        background: 'var(--material-thin)',
                        border: '1px solid var(--separator)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-3) var(--space-4)',
                        maxWidth: 280,
                      }}>
                        <div style={{
                          fontSize: 'var(--text-caption2)',
                          color: 'var(--text-tertiary)',
                          marginBottom: 'var(--space-2)',
                        }}>
                          {m.name || 'Audio'}
                        </div>
                        <audio controls src={m.url} style={{ width: '100%', height: 32 }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ────────────────────────────── */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid var(--separator)',
        background: 'var(--material-regular)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-2)',
          background: 'var(--fill-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-2) var(--space-3)',
          border: '1px solid var(--separator)',
        }}>
          {/* Attach button */}
          <button
            className="btn-ghost focus-ring"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 'var(--space-1)',
              flexShrink: 0,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*"
            style={{ display: 'none' }}
            onChange={handleFileAttach}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}...`}
            rows={1}
            disabled={isStreaming}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-subheadline)',
              lineHeight: 'var(--leading-normal)',
              maxHeight: 120,
              minHeight: 24,
              padding: '2px 0',
              opacity: isStreaming ? 0.5 : 1,
            }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 120) + 'px'
            }}
          />

          {/* Send button */}
          <button
            className="focus-ring"
            onClick={sendMessage}
            disabled={!hasInput || isStreaming}
            aria-label="Send message"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: hasInput ? 'var(--accent)' : 'var(--fill-tertiary)',
              color: hasInput ? '#000' : 'var(--text-quaternary)',
              border: 'none',
              cursor: hasInput ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 'var(--weight-bold)',
              transition: 'all 150ms var(--ease-smooth)',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>

        {/* Hint */}
        <div style={{
          fontSize: 'var(--text-caption2)',
          color: 'var(--text-quaternary)',
          textAlign: 'center',
          marginTop: 'var(--space-1)',
        }}>
          Enter to send &middot; Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}
