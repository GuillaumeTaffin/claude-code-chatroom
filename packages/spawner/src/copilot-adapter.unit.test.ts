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
  }),
}))

import { createChatroomTools } from './chatroom-tools.js'
import {
  createCopilotSession,
  createCopilotSessionFactory,
  buildCopilotPrompt,
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

function makeSessionHandle(
  overrides: Partial<CopilotSessionHandle> = {},
): CopilotSessionHandle {
  const eventHandlers = new Map<string, (data: unknown) => void>()
  return {
    send: overrides.send ?? vi.fn(),
    on:
      overrides.on ??
      vi.fn((event: string, callback: (data: unknown) => void) => {
        eventHandlers.set(event, callback)
      }),
    close: overrides.close ?? vi.fn().mockResolvedValue(undefined),
    _handlers: eventHandlers,
  } as CopilotSessionHandle & {
    _handlers: Map<string, (data: unknown) => void>
  }
}

function makeDeps(
  sessionHandle?: CopilotSessionHandle & {
    _handlers: Map<string, (data: unknown) => void>
  },
): CopilotAgentDependencies & {
  sessionHandle: CopilotSessionHandle & {
    _handlers: Map<string, (data: unknown) => void>
  }
  clientHandle: CopilotClientHandle
} {
  const handle =
    sessionHandle ??
    (makeSessionHandle() as CopilotSessionHandle & {
      _handlers: Map<string, (data: unknown) => void>
    })
  const clientHandle: CopilotClientHandle = {
    createSession: vi.fn().mockResolvedValue(handle),
  }
  return {
    createClient: vi.fn().mockReturnValue(clientHandle),
    sessionHandle: handle,
    clientHandle,
  }
}

describe('buildCopilotPrompt', () => {
  it('includes agent name, role description, server URL, project and run IDs', () => {
    const config = makeConfig()
    const prompt = buildCopilotPrompt(config)

    expect(prompt).toContain('"test-agent"')
    expect(prompt).toContain('A helpful test agent')
    expect(prompt).toContain('http://localhost:3000')
    expect(prompt).toContain('"project-1"')
    expect(prompt).toContain('"run-1"')
  })

  it('includes custom system prompt when provided', () => {
    const config = makeConfig({ systemPrompt: 'Be extra careful' })
    const prompt = buildCopilotPrompt(config)

    expect(prompt).toContain('Be extra careful')
  })

  it('omits system prompt line when not provided', () => {
    const config = makeConfig()
    const lines = buildCopilotPrompt(config).split('\n')

    expect(lines).toHaveLength(4)
  })
})

describe('createCopilotSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue({
      client: {} as never,
      connect: vi.fn().mockResolvedValue({ channelId: 'ch-1' }),
      close: vi.fn(),
    })
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

  it('start() creates a client and session with correct params', async () => {
    const config = makeConfig({
      systemPrompt: 'Custom prompt',
      model: 'gpt-4o',
    })
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)

    await session.start()

    expect(deps.createClient).toHaveBeenCalled()
    expect(deps.clientHandle.createSession).toHaveBeenCalledWith({
      systemPrompt: 'Custom prompt',
      model: 'gpt-4o',
    })
  })

  it('uses roleDescription as systemPrompt fallback when no systemPrompt provided', async () => {
    const config = makeConfig()
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)

    await session.start()

    expect(deps.clientHandle.createSession).toHaveBeenCalledWith({
      systemPrompt: 'A helpful test agent',
      model: undefined,
    })
  })

  it('start() sends the prompt to the session', async () => {
    const config = makeConfig()
    const deps = makeDeps()
    const session = createCopilotSession(config, deps)

    await session.start()

    expect(deps.sessionHandle.send).toHaveBeenCalledWith({
      prompt: expect.stringContaining('"test-agent"'),
    })
  })

  it('session.idle event fires stopped status', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Simulate the session.idle event
    const idleHandler = deps.sessionHandle._handlers.get('session.idle')
    expect(idleHandler).toBeDefined()
    idleHandler!(undefined)

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
    expect(session.status).toBe('stopped')
  })

  it('session error event fires errored status', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Simulate the error event
    const errorHandler = deps.sessionHandle._handlers.get('error')
    expect(errorHandler).toBeDefined()
    errorHandler!(new Error('something went wrong'))

    expect(statuses).toEqual(['connected', 'running', 'errored'])
    expect(session.status).toBe('errored')
  })

  it('stop() closes session handle and chatroom tools, fires stopped', async () => {
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)

    await session.start()
    await session.stop()

    expect(deps.sessionHandle.close).toHaveBeenCalled()
    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.close).toHaveBeenCalled()
    expect(session.status).toBe('stopped')
  })

  it('stop() prevents subsequent event callbacks from firing', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    await session.stop()

    // Fire events after stop - they should be ignored
    const idleHandler = deps.sessionHandle._handlers.get('session.idle')
    idleHandler?.(undefined)
    const errorHandler = deps.sessionHandle._handlers.get('error')
    errorHandler?.(new Error('post-abort error'))

    // Only connected, running, stopped (from stop()) should appear
    expect(statuses).toEqual(['connected', 'running', 'stopped'])
    expect(statuses).not.toContain('errored')
  })

  it('onStatusChange receives all transitions', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const deps = makeDeps()
    const session = createCopilotSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Trigger idle to complete
    const idleHandler = deps.sessionHandle._handlers.get('session.idle')
    idleHandler!(undefined)

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })
})

describe('createCopilotSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue({
      client: {} as never,
      connect: vi.fn().mockResolvedValue({ channelId: 'ch-1' }),
      close: vi.fn(),
    })
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
