import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SpawnedAgentStatus } from './types.js'
import type { AgentSessionConfig } from './agent-session.js'
import type {
  CopilotAgentDependencies,
  CopilotSessionHandle,
  CopilotClientHandle,
} from './copilot-adapter.js'

vi.mock('./chatroom-tools.js', () => ({
  createChatroomTools: vi.fn().mockReturnValue({
    client: {},
    connect: vi.fn().mockResolvedValue({ channelId: 'ch-1' }),
    close: vi.fn(),
    onMessage: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { createChatroomTools } from './chatroom-tools.js'
import {
  createCopilotSession,
  createCopilotSessionFactory,
  buildCopilotPrompt,
  extractCopilotText,
} from './copilot-adapter.js'

const mockCreateChatroomTools = vi.mocked(createChatroomTools)

function makeConfig(
  overrides: Partial<AgentSessionConfig> = {},
): AgentSessionConfig {
  return {
    runtime: 'copilot',
    agentName: 'test-agent',
    roleDescription: 'A helpful test agent',
    projectId: 'project-1',
    runId: 'run-1',
    serverUrl: 'http://localhost:3000',
    ...overrides,
  }
}

type SessionHandleWithHandlers = CopilotSessionHandle & {
  _handlers: Map<string, (data: unknown) => void>
}

function makeSessionHandle(): SessionHandleWithHandlers {
  const eventHandlers = new Map<string, (data: unknown) => void>()
  return {
    send: vi.fn().mockResolvedValue('msg-id'),
    on: vi.fn((event: string, callback: (data: unknown) => void) => {
      eventHandlers.set(event, callback)
      return () => {}
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    _handlers: eventHandlers,
  } as unknown as SessionHandleWithHandlers
}

function makeDeps(sessionHandle?: SessionHandleWithHandlers): {
  createClient: ReturnType<typeof vi.fn>
  sessionHandle: SessionHandleWithHandlers
  clientHandle: CopilotClientHandle
} & CopilotAgentDependencies {
  const handle = sessionHandle ?? makeSessionHandle()
  const clientHandle: CopilotClientHandle = {
    createSession: vi.fn().mockResolvedValue(handle),
  }
  return {
    createClient: vi.fn().mockReturnValue(clientHandle),
    sessionHandle: handle,
    clientHandle,
  }
}

function makeTools() {
  return {
    client: {} as never,
    connect: vi.fn().mockResolvedValue({ channelId: 'ch-1' }),
    close: vi.fn(),
    onMessage: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }
}

describe('buildCopilotPrompt', () => {
  it('includes agent name and role description', () => {
    const config = makeConfig()
    const prompt = buildCopilotPrompt(config)

    expect(prompt).toContain('"test-agent"')
    expect(prompt).toContain('A helpful test agent')
  })

  it('mentions that the agent is already connected and should not write scripts', () => {
    const prompt = buildCopilotPrompt(makeConfig())

    expect(prompt).toContain('ALREADY CONNECTED')
    expect(prompt).toContain('do not write scripts')
  })

  it('instructs the agent to reply with "skip" when a message is not for it', () => {
    const prompt = buildCopilotPrompt(makeConfig())

    expect(prompt).toContain('skip')
  })

  it('includes custom system prompt when provided', () => {
    const config = makeConfig({ systemPrompt: 'Be extra careful' })
    const prompt = buildCopilotPrompt(config)

    expect(prompt).toContain('Be extra careful')
  })

  it('does not include "undefined" when no custom system prompt provided', () => {
    const prompt = buildCopilotPrompt(makeConfig())

    expect(prompt).not.toContain('undefined')
  })
})

describe('extractCopilotText', () => {
  it('extracts string content from event.data.content', () => {
    expect(extractCopilotText({ data: { content: 'Hello world' } })).toBe(
      'Hello world',
    )
  })

  it('returns null when data is missing', () => {
    expect(extractCopilotText({})).toBeNull()
  })

  it('returns null when data.content is not a string', () => {
    expect(extractCopilotText({ data: { content: 123 } })).toBeNull()
  })

  it('returns null when data has no content property', () => {
    expect(extractCopilotText({ data: { text: 'Hello' } })).toBeNull()
  })

  it('returns null when data is null', () => {
    expect(extractCopilotText({ data: null })).toBeNull()
  })

  it('returns null for null event', () => {
    expect(extractCopilotText(null)).toBeNull()
  })

  it('returns null for undefined event', () => {
    expect(extractCopilotText(undefined)).toBeNull()
  })

  it('returns null for non-object event', () => {
    expect(extractCopilotText('string')).toBeNull()
  })
})

describe('createCopilotSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue(makeTools() as never)
  })

  it('initializes with starting status and correct properties', () => {
    const config = makeConfig()
    const session = createCopilotSession(config, makeDeps())

    expect(session.status).toBe('starting')
    expect(session.agentName).toBe('test-agent')
    expect(session.runtime).toBe('copilot')
  })

  it('start() connects chatroom tools and fires status changes starting -> connected -> running', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const config = makeConfig()
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    expect(mockCreateChatroomTools).toHaveBeenCalledWith({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A helpful test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'copilot',
    })

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.connect).toHaveBeenCalled()

    expect(statuses).toEqual(['connected', 'running'])
    expect(session.status).toBe('running')
  })

  it('start() creates a client and session with onPermissionRequest, systemMessage and model', async () => {
    const config = makeConfig({
      systemPrompt: 'Custom prompt',
      model: 'gpt-4o',
    })
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)

    await session.start()

    expect(deps.createClient).toHaveBeenCalled()
    expect(deps.clientHandle.createSession).toHaveBeenCalledTimes(1)

    const sessionConfigArg = (
      deps.clientHandle.createSession as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as Record<string, unknown>

    expect(sessionConfigArg.onPermissionRequest).toBeTypeOf('function')
    expect(sessionConfigArg.systemMessage).toEqual({
      mode: 'replace',
      content: buildCopilotPrompt(config),
    })
    expect(sessionConfigArg.model).toBe('gpt-4o')

    // onPermissionRequest should approve all
    const handler = sessionConfigArg.onPermissionRequest as () => Promise<{
      allowed: boolean
    }>
    await expect(handler()).resolves.toEqual({ allowed: true })
  })

  it('start() omits model when not provided in config', async () => {
    const config = makeConfig()
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)

    await session.start()

    const sessionConfigArg = (
      deps.clientHandle.createSession as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as Record<string, unknown>

    expect('model' in sessionConfigArg).toBe(false)
  })

  it('start() does not send any initial prompt to the session', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    expect(deps.sessionHandle.send).not.toHaveBeenCalled()
  })

  it('registers onMessage callback on chatroom tools', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.onMessage).toHaveBeenCalledWith(expect.any(Function))
  })

  it('forwards incoming chatroom messages to session via send', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    onMessageCallback({
      sender: 'alice',
      text: 'hello agent',
      mentions: ['test-agent'],
    })

    expect(deps.sessionHandle.send).toHaveBeenCalledWith({
      prompt: '[alice]: hello agent',
    })
  })

  it('filters out chatroom messages from itself', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    onMessageCallback({
      sender: 'test-agent',
      text: 'my own message',
      mentions: [],
    })

    expect(deps.sessionHandle.send).not.toHaveBeenCalled()
  })

  it('does not forward chatroom messages after abort', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    await session.stop()
    ;(deps.sessionHandle.send as ReturnType<typeof vi.fn>).mockClear()

    onMessageCallback({
      sender: 'alice',
      text: 'too late',
      mentions: [],
    })

    expect(deps.sessionHandle.send).not.toHaveBeenCalled()
  })

  it('catches errors from session.send when forwarding chatroom messages', async () => {
    const handle = makeSessionHandle()
    ;(handle.send as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('session ended'),
    )
    const deps = makeDeps(handle)
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    // Should not throw
    onMessageCallback({ sender: 'alice', text: 'hi', mentions: [] })
    await new Promise((r) => setTimeout(r, 0))

    expect(session.status).toBe('running')
  })

  it('posts assistant.message content to chatroom', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const assistantHandler =
      deps.sessionHandle._handlers.get('assistant.message')
    expect(assistantHandler).toBeDefined()

    assistantHandler!({ data: { content: 'Hello from Copilot!' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(tools.sendMessage).toHaveBeenCalledWith('Hello from Copilot!')
  })

  it('filters out "skip" replies (case insensitive)', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const assistantHandler =
      deps.sessionHandle._handlers.get('assistant.message')

    assistantHandler!({ data: { content: 'skip' } })
    assistantHandler!({ data: { content: 'SKIP' } })
    assistantHandler!({ data: { content: '  Skip  ' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(tools.sendMessage).not.toHaveBeenCalled()
  })

  it('ignores assistant.message with non-string content', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const assistantHandler =
      deps.sessionHandle._handlers.get('assistant.message')

    assistantHandler!({ data: { content: 123 } })
    await new Promise((r) => setTimeout(r, 0))

    expect(tools.sendMessage).not.toHaveBeenCalled()
  })

  it('catches sendMessage errors from the assistant.message handler', async () => {
    const toolsMock = makeTools()
    toolsMock.sendMessage.mockRejectedValue(new Error('chatroom disconnected'))
    mockCreateChatroomTools.mockReturnValue(toolsMock as never)

    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)
    await session.start()

    const assistantHandler =
      deps.sessionHandle._handlers.get('assistant.message')

    // Should not throw
    assistantHandler!({ data: { content: 'Hello' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(toolsMock.sendMessage).toHaveBeenCalledWith('Hello')
    expect(session.status).toBe('running')
  })

  it('does not post assistant messages after abort', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    await session.stop()
    ;(tools.sendMessage as ReturnType<typeof vi.fn>).mockClear()

    const assistantHandler =
      deps.sessionHandle._handlers.get('assistant.message')
    assistantHandler!({ data: { content: 'Too late' } })
    await new Promise((r) => setTimeout(r, 0))

    expect(tools.sendMessage).not.toHaveBeenCalled()
  })

  it('stop() calls session disconnect, tools.close, and fires stopped', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    const statuses: SpawnedAgentStatus[] = []
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    await session.stop()

    expect(deps.sessionHandle.disconnect).toHaveBeenCalled()
    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.close).toHaveBeenCalled()
    expect(session.status).toBe('stopped')
    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })

  it('stop() swallows errors thrown by disconnect', async () => {
    const handle = makeSessionHandle()
    ;(handle.disconnect as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('already closed'),
    )
    const deps = makeDeps(handle)
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()
    await expect(session.stop()).resolves.toBeUndefined()

    expect(session.status).toBe('stopped')
    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.close).toHaveBeenCalled()
  })

  it('stop() without prior start also fires stopped', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await expect(session.stop()).resolves.toBeUndefined()
    expect(session.status).toBe('stopped')
  })
})

describe('createCopilotSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue(makeTools() as never)
  })

  it('returns a factory that creates sessions', () => {
    const deps = makeDeps()
    const factory = createCopilotSessionFactory(deps)
    const config = makeConfig()

    const session = factory(config)

    expect(session.status).toBe('starting')
    expect(session.agentName).toBe('test-agent')
    expect(session.runtime).toBe('copilot')
  })

  it('factory creates functional sessions that can start', async () => {
    const deps = makeDeps()
    const factory = createCopilotSessionFactory(deps)
    const session = factory(makeConfig())

    const statuses: SpawnedAgentStatus[] = []
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    expect(statuses).toEqual(['connected', 'running'])
  })
})
