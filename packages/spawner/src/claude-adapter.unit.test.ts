import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SpawnedAgentStatus } from './types.js'
import type { AgentSessionConfig } from './agent-session.js'
import type {
  ClaudeAgentDependencies,
  ClaudeQueryHandle,
  ChatroomMcpHandlers,
} from './claude-adapter.js'

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
  createClaudeSession,
  createClaudeSessionFactory,
  buildPrompt,
  CHATROOM_MCP_SERVER_NAME,
  CHATROOM_SEND_MESSAGE_TOOL,
} from './claude-adapter.js'

const mockCreateChatroomTools = vi.mocked(createChatroomTools)

function makeConfig(
  overrides: Partial<AgentSessionConfig> = {},
): AgentSessionConfig {
  return {
    runtime: 'claude',
    agentName: 'test-agent',
    roleDescription: 'A helpful test agent',
    projectId: 'project-1',
    runId: 'run-1',
    serverUrl: 'http://localhost:3000',
    ...overrides,
  }
}

/** Helper to create a controllable query handle with streamInput */
function createControllableQueryHandle() {
  let resolve: ((value: IteratorResult<unknown>) => void) | null = null
  let reject: ((err: unknown) => void) | null = null

  const iterator = {
    next() {
      return new Promise<IteratorResult<unknown>>((res, rej) => {
        resolve = res
        reject = rej
      })
    },
    return(value: unknown) {
      return Promise.resolve({ value, done: true as const })
    },
    throw(err: unknown) {
      return Promise.reject(err)
    },
  }

  const queryHandle: ClaudeQueryHandle = {
    streamInput: vi.fn().mockResolvedValue(undefined),
    [Symbol.asyncIterator]() {
      return iterator
    },
  }

  return {
    queryHandle,
    yieldValue(value: unknown) {
      resolve?.({ value, done: false })
    },
    complete() {
      resolve?.({ value: undefined, done: true })
    },
    error(err: unknown) {
      reject?.(err)
    },
  }
}

const MCP_SENTINEL = { __sentinel: 'chatroom-mcp' }

function makeDeps(
  overrides: Partial<ClaudeAgentDependencies> = {},
): ClaudeAgentDependencies {
  return {
    query:
      overrides.query ??
      (() => {
        const ctrl = createControllableQueryHandle()
        // Auto-complete the generator so tests don't hang
        setTimeout(() => ctrl.complete(), 0)
        return ctrl.queryHandle
      }),
    createChatroomMcpServer:
      overrides.createChatroomMcpServer ??
      vi.fn().mockReturnValue(MCP_SENTINEL),
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

describe('buildPrompt', () => {
  it('includes agent name and role description', () => {
    const config = makeConfig()
    const prompt = buildPrompt(config)

    expect(prompt).toContain('"test-agent"')
    expect(prompt).toContain('A helpful test agent')
  })

  it('explains the agent is already connected and instructs MCP send_message', () => {
    const prompt = buildPrompt(makeConfig())

    expect(prompt).toContain('ALREADY CONNECTED')
    expect(prompt).toContain('`send_message` MCP tool')
    expect(prompt).toContain('Plain-text output is NOT delivered')
  })

  it('includes custom system prompt when provided', () => {
    const config = makeConfig({ systemPrompt: 'Be extra careful' })
    const prompt = buildPrompt(config)

    expect(prompt).toContain('Be extra careful')
  })

  it('omits custom system prompt section when not provided', () => {
    const config = makeConfig()
    const prompt = buildPrompt(config)

    expect(prompt).not.toContain('undefined')
  })
})

describe('createClaudeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue(makeTools() as never)
  })

  it('initializes with starting status and correct properties', () => {
    const config = makeConfig()
    const session = createClaudeSession(config, makeDeps())

    expect(session.status).toBe('starting')
    expect(session.agentName).toBe('test-agent')
    expect(session.runtime).toBe('claude')
  })

  it('start() connects chatroom tools and fires status changes starting -> connected -> running', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const config = makeConfig()
    const session = createClaudeSession(config, makeDeps())
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    expect(mockCreateChatroomTools).toHaveBeenCalledWith({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A helpful test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.connect).toHaveBeenCalled()

    expect(statuses).toEqual(['connected', 'running'])
    expect(session.status).toBe('running')
  })

  it('start() runs the agent loop and fires stopped on completion', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Complete the generator
    ctrl.complete()
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
    expect(session.status).toBe('stopped')
  })

  it('start() fires errored if the agent loop throws', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Error the generator
    ctrl.error(new Error('agent crashed'))
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'errored'])
    expect(session.status).toBe('errored')
  })

  it('stop() aborts the loop, closes chatroom tools, and fires stopped', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    await session.stop()

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.close).toHaveBeenCalled()

    // Yield a value after stop to exercise the aborted-break branch
    ctrl.yieldValue({ type: 'message' })
    await new Promise((r) => setTimeout(r, 0))

    // stopped should appear exactly once (from stop()), not again from loop completion
    expect(statuses.filter((s) => s === 'stopped')).toHaveLength(1)
    expect(session.status).toBe('stopped')
  })

  it('stop() does not fire errored after abort', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    await session.stop()

    // Error after stop - should not fire 'errored'
    ctrl.error(new Error('post-abort error'))
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).not.toContain('errored')
  })

  it('onStatusChange receives all transitions', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const session = createClaudeSession(makeConfig(), makeDeps())
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    // Generator completes immediately (auto-complete in makeDeps)
    await new Promise((r) => setTimeout(r, 10))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })

  it('processes generator messages while not aborted', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Yield a value while the loop is running (not aborted)
    ctrl.yieldValue({ type: 'message', text: 'hello' })
    await new Promise((r) => setTimeout(r, 0))

    // Session should still be running
    expect(session.status).toBe('running')

    // Now complete the generator
    ctrl.complete()
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })

  it('passes systemPrompt, model, maxTurns, and permission options to query', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const config = makeConfig({
      systemPrompt: 'Custom prompt',
      model: 'claude-4',
      maxTurns: 5,
    })
    const session = createClaudeSession(config, {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      prompt: unknown
      options: Record<string, unknown>
    }
    expect(callArgs.prompt).toBeDefined()
    expect(callArgs.options.model).toBe('claude-4')
    expect(callArgs.options.maxTurns).toBe(5)
    expect(callArgs.options.permissionMode).toBe('bypassPermissions')
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true)
    expect(callArgs.options.systemPrompt).toContain('Custom prompt')
    expect(callArgs.options.systemPrompt).toContain('"test-agent"')
  })

  it('uses buildPrompt as systemPrompt with role description', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const config = makeConfig()
    const session = createClaudeSession(config, {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      options: Record<string, unknown>
    }
    expect(callArgs.options.systemPrompt).toContain('A helpful test agent')
  })

  it('passes undefined model and maxTurns when not in config', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const config = makeConfig()
    const session = createClaudeSession(config, {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      options: Record<string, unknown>
    }
    expect(callArgs.options.model).toBeUndefined()
    expect(callArgs.options.maxTurns).toBeUndefined()
  })

  it('registers onMessage callback on chatroom tools', async () => {
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.onMessage).toHaveBeenCalledWith(expect.any(Function))
  })

  it('feeds incoming chatroom messages to the query prompt stream', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const session = createClaudeSession(makeConfig(), {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    // Capture the prompt async iterable passed to query()
    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      prompt: AsyncIterable<unknown>
    }
    const promptStream = callArgs.prompt

    // Simulate receiving a chatroom message
    onMessageCallback({
      sender: 'alice',
      text: 'hello agent',
      mentions: ['test-agent'],
    })

    // Consume the next item from the prompt stream
    const iterator = promptStream[Symbol.asyncIterator]()
    const result = await iterator.next()

    expect(result.done).toBe(false)
    expect(result.value).toEqual({
      type: 'user',
      message: { role: 'user', content: '[alice]: hello agent' },
      parent_tool_use_id: null,
    })

    // Stop the session to unblock the stream
    await session.stop()
  })

  it('wakes up the prompt stream when a message arrives mid-block', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const session = createClaudeSession(makeConfig(), {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const onMessageCallback = (tools.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as (msg: {
      sender: string
      text: string
      mentions: string[]
    }) => void

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      prompt: AsyncIterable<unknown>
    }
    const iterator = callArgs.prompt[Symbol.asyncIterator]()

    // Start consuming the stream - this will block waiting for a message
    const nextPromise = iterator.next()

    // Push a message while the stream is blocked
    onMessageCallback({
      sender: 'bob',
      text: 'wake up',
      mentions: [],
    })

    const result = await nextPromise
    expect(result.done).toBe(false)
    expect(result.value).toEqual({
      type: 'user',
      message: { role: 'user', content: '[bob]: wake up' },
      parent_tool_use_id: null,
    })

    await session.stop()
  })

  it('prompt stream exits cleanly on stop', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const session = createClaudeSession(makeConfig(), {
      query: queryFn,
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    })

    await session.start()

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      prompt: AsyncIterable<unknown>
    }
    const iterator = callArgs.prompt[Symbol.asyncIterator]()

    // Start consuming (will block on the empty queue)
    const nextPromise = iterator.next()

    // Stop the session - should wake up the stream
    await session.stop()

    const result = await nextPromise
    expect(result.done).toBe(true)
  })

  it('does not relay assistant text output to the chatroom', async () => {
    // Plain-text assistant output must NOT be auto-posted: the agent is
    // expected to use the `send_message` MCP tool instead.
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const session = createClaudeSession(makeConfig(), deps)

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value

    ctrl.yieldValue({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello from agent!' }],
      },
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(tools.sendMessage).not.toHaveBeenCalled()
  })

  it('passes the chatroom MCP server through to query() options', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const createChatroomMcpServer = vi.fn().mockReturnValue(MCP_SENTINEL)
    const session = createClaudeSession(makeConfig(), {
      query: queryFn,
      createChatroomMcpServer,
    })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    expect(createChatroomMcpServer).toHaveBeenCalledWith({
      sendMessage: expect.any(Function),
    })

    const callArgs = (queryFn.mock.calls as unknown as unknown[][])[0][0] as {
      options: Record<string, unknown>
    }
    expect(callArgs.options.mcpServers).toEqual({
      [CHATROOM_MCP_SERVER_NAME]: MCP_SENTINEL,
    })
    expect(callArgs.options.allowedTools).toEqual([CHATROOM_SEND_MESSAGE_TOOL])
  })

  it('chatroom MCP handler delegates send_message to ChatroomTools.sendMessage', async () => {
    const queryFn = vi.fn(() => {
      const ctrl = createControllableQueryHandle()
      setTimeout(() => ctrl.complete(), 0)
      return ctrl.queryHandle
    })
    const createChatroomMcpServer = vi.fn().mockReturnValue(MCP_SENTINEL)
    const session = createClaudeSession(makeConfig(), {
      query: queryFn,
      createChatroomMcpServer,
    })

    await session.start()

    const tools = mockCreateChatroomTools.mock.results[0].value
    const handlers = (
      createChatroomMcpServer.mock.calls[0] as [ChatroomMcpHandlers]
    )[0]

    await handlers.sendMessage('hi from tool', ['alice'])
    expect(tools.sendMessage).toHaveBeenCalledWith('hi from tool', ['alice'])
  })

  it('drains the iterator without crashing on arbitrary message shapes', async () => {
    // The agent loop must tolerate any value the SDK yields (it no longer
    // inspects message shape) and exit cleanly when the iterator completes.
    const ctrl = createControllableQueryHandle()
    const deps: ClaudeAgentDependencies = {
      query: vi.fn().mockReturnValue(ctrl.queryHandle),
      createChatroomMcpServer: vi.fn().mockReturnValue(MCP_SENTINEL),
    }
    const statuses: SpawnedAgentStatus[] = []
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    ctrl.yieldValue(null)
    await new Promise((r) => setTimeout(r, 0))
    ctrl.yieldValue({ random: 'shape' })
    await new Promise((r) => setTimeout(r, 0))
    ctrl.complete()
    await new Promise((r) => setTimeout(r, 0))

    const tools = mockCreateChatroomTools.mock.results[0].value
    expect(tools.sendMessage).not.toHaveBeenCalled()
    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })
})

describe('createClaudeSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateChatroomTools.mockReturnValue(makeTools() as never)
  })

  it('returns a factory that creates sessions', () => {
    const deps = makeDeps()
    const factory = createClaudeSessionFactory(deps)
    const config = makeConfig()

    const session = factory(config)

    expect(session.status).toBe('starting')
    expect(session.agentName).toBe('test-agent')
    expect(session.runtime).toBe('claude')
  })

  it('factory creates functional sessions that can start', async () => {
    const deps = makeDeps()
    const factory = createClaudeSessionFactory(deps)
    const session = factory(makeConfig())

    const statuses: SpawnedAgentStatus[] = []
    session.onStatusChange((s) => statuses.push(s))

    await session.start()
    await new Promise((r) => setTimeout(r, 10))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })
})
