// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  hasImageContent,
  extractImageAttachments,
  buildTextPrompt,
  sendViaOpenClaw,
} from './anthropic'
import type { ApiMessage } from './validation'

// --- hasImageContent ---

describe('hasImageContent', () => {
  it('returns false for plain text messages', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]
    expect(hasImageContent(msgs)).toBe(false)
  })

  it('returns true when any message has image_url parts', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
        ],
      },
    ]
    expect(hasImageContent(msgs)).toBe(true)
  })

  it('returns false when content array has only text parts', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'just text in array form' },
        ],
      },
    ]
    expect(hasImageContent(msgs)).toBe(false)
  })

  it('returns true even if only one message out of many has images', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'reply' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xyz' } },
        ],
      },
    ]
    expect(hasImageContent(msgs)).toBe(true)
  })
})

// --- extractImageAttachments ---

describe('extractImageAttachments', () => {
  it('extracts base64 data and mimeType from data URL', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAA' } },
        ],
      },
    ]
    const result = extractImageAttachments(msgs)
    expect(result).toEqual([
      { mimeType: 'image/png', content: 'iVBORw0KGgoAAAA' },
    ])
  })

  it('extracts multiple images from a single message', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'compare' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBB' } },
        ],
      },
    ]
    const result = extractImageAttachments(msgs)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ mimeType: 'image/png', content: 'AAA' })
    expect(result[1]).toEqual({ mimeType: 'image/jpeg', content: 'BBB' })
  })

  it('extracts images from multiple messages', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,FIRST' } },
        ],
      },
      { role: 'assistant', content: 'I see it' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/webp;base64,SECOND' } },
        ],
      },
    ]
    const result = extractImageAttachments(msgs)
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('FIRST')
    expect(result[1].content).toBe('SECOND')
  })

  it('returns empty array when no images', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'just text' },
    ]
    expect(extractImageAttachments(msgs)).toEqual([])
  })

  it('defaults to image/png for non-data URLs', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
        ],
      },
    ]
    const result = extractImageAttachments(msgs)
    expect(result[0].mimeType).toBe('image/png')
  })
})

// --- buildTextPrompt ---

describe('buildTextPrompt', () => {
  it('combines system prompt and conversation history', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'what is this?' },
    ]
    const result = buildTextPrompt('You are helpful.', msgs)
    expect(result).toContain('You are helpful.')
    expect(result).toContain('what is this?')
  })

  it('includes all user and assistant messages', () => {
    const msgs: ApiMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'user', content: 'describe the image' },
    ]
    const result = buildTextPrompt('system prompt', msgs)
    expect(result).toContain('hello')
    expect(result).toContain('hi there')
    expect(result).toContain('describe the image')
  })

  it('extracts text from content part arrays', () => {
    const msgs: ApiMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what do you see?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
        ],
      },
    ]
    const result = buildTextPrompt('', msgs)
    expect(result).toContain('what do you see?')
    // Should not contain the data URL
    expect(result).not.toContain('data:image')
  })

  it('skips system role messages from the messages array', () => {
    const msgs: ApiMessage[] = [
      { role: 'system', content: 'extra system' },
      { role: 'user', content: 'question' },
    ]
    const result = buildTextPrompt('main system', msgs)
    // System prompt is the first arg, system messages in array are skipped
    expect(result).toContain('main system')
    expect(result).toContain('question')
    expect(result).not.toContain('extra system')
  })
})

// --- sendViaOpenClaw ---

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile as mockExecFile } from 'child_process'

describe('sendViaOpenClaw', () => {
  beforeEach(() => {
    vi.stubEnv('OPENCLAW_BIN', '/usr/bin/openclaw')
    vi.mocked(mockExecFile).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('calls execFile with correct arguments', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        JSON.stringify({ content: 'I see a cat' }),
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    const result = await sendViaOpenClaw({
      gatewayToken: 'test-token',
      message: 'describe this',
      attachments: [{ mimeType: 'image/png', content: 'base64data' }],
    })

    expect(result).toBe('I see a cat')

    const calls = vi.mocked(mockExecFile).mock.calls
    expect(calls).toHaveLength(1)
    const [bin, args] = calls[0]
    expect(bin).toBe('/usr/bin/openclaw')
    expect(args).toContain('gateway')
    expect(args).toContain('call')
    expect(args).toContain('chat.send')
    expect(args).toContain('--expect-final')
    expect(args).toContain('--json')
    expect(args).toContain('--token')
    expect(args).toContain('test-token')

    // Verify params JSON includes our data
    const paramsIdx = (args as string[]).indexOf('--params')
    const paramsJson = JSON.parse((args as string[])[paramsIdx + 1])
    expect(paramsJson.message).toBe('describe this')
    expect(paramsJson.attachments).toHaveLength(1)
    expect(paramsJson.attachments[0].mimeType).toBe('image/png')
  })

  it('returns null on execFile error', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        new Error('spawn E2BIG'),
        '',
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    const result = await sendViaOpenClaw({
      gatewayToken: 'test-token',
      message: 'test',
      attachments: [],
    })

    expect(result).toBeNull()
  })

  it('handles plain text stdout as fallback', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        'Hello, I can see a dog in the image.',
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    const result = await sendViaOpenClaw({
      gatewayToken: 'test-token',
      message: 'what is this?',
      attachments: [{ mimeType: 'image/jpeg', content: 'abc' }],
    })

    expect(result).toBe('Hello, I can see a dog in the image.')
  })

  it('extracts content from nested result object', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        JSON.stringify({ ok: true, result: { content: 'nested response' } }),
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    const result = await sendViaOpenClaw({
      gatewayToken: 'test-token',
      message: 'test',
      attachments: [],
    })

    expect(result).toBe('nested response')
  })

  it('returns null for empty stdout', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        '',
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    const result = await sendViaOpenClaw({
      gatewayToken: 'test-token',
      message: 'test',
      attachments: [],
    })

    expect(result).toBeNull()
  })

  it('uses custom sessionKey and timeout when provided', async () => {
    vi.mocked(mockExecFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        JSON.stringify({ content: 'ok' }),
        ''
      )
      return {} as ReturnType<typeof mockExecFile>
    })

    await sendViaOpenClaw({
      gatewayToken: 'tok',
      message: 'hi',
      attachments: [],
      sessionKey: 'custom:session',
      timeoutMs: 30000,
    })

    const [, args] = vi.mocked(mockExecFile).mock.calls[0]
    const paramsIdx = (args as string[]).indexOf('--params')
    const paramsJson = JSON.parse((args as string[])[paramsIdx + 1])
    expect(paramsJson.sessionKey).toBe('custom:session')

    const timeoutIdx = (args as string[]).indexOf('--timeout')
    expect((args as string[])[timeoutIdx + 1]).toBe('30000')
  })
})
