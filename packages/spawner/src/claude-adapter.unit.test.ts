import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SpawnedAgentStatus } from './types.js'
import type { AgentSessionConfig } from './agent-session.js'
import type { ClaudeAgentDependencies } from './claude-adapter.js'

vi.mock('./chatroom-tools.js', () => ({
  createChatroomTools: vi.fn().mockReturnValue({
    client: {},
    connect: vi.fn().mockResolvedValue({ channelId: 'ch-1' }),
    close: vi.fn(),
  }),
}))

import { createChatroomTools } from './chatroom-tools.js'
import {
  createClaudeSession,
  createClaudeSessionFactory,
  buildPrompt,
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

function makeDeps(
  overrides: Partial<ClaudeAgentDependencies> = {},
): ClaudeAgentDependencies {
  return {
    query: overrides.query ?? async function* () {},
  }
}

/** Helper to create a controllable async generator */
function createControllableGenerator() {
  let resolve: ((value: IteratorResult<unknown>) => void) | null = null
  let reject: ((err: unknown) => void) | null = null

  const generator = {
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
    [Symbol.asyncIterator]() {
      return generator
    },
    async [Symbol.asyncDispose]() {
      await generator.return(undefined)
    },
  } as AsyncGenerator<unknown>

  return {
    generator,
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

describe('buildPrompt', () => {
  it('includes agent name, role description, server URL, project and run IDs', () => {
    const config = makeConfig()
    const prompt = buildPrompt(config)

    expect(prompt).toContain('"test-agent"')
    expect(prompt).toContain('A helpful test agent')
    expect(prompt).toContain('http://localhost:3000')
    expect(prompt).toContain('"project-1"')
    expect(prompt).toContain('"run-1"')
  })

  it('includes custom system prompt when provided', () => {
    const config = makeConfig({ systemPrompt: 'Be extra careful' })
    const prompt = buildPrompt(config)

    expect(prompt).toContain('Be extra careful')
  })

  it('omits system prompt line when not provided', () => {
    const config = makeConfig()
    const lines = buildPrompt(config).split('\n')

    expect(lines).toHaveLength(4)
  })
})

describe('createClaudeSession', () => {
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
    const ctrl = createControllableGenerator()
    const deps = makeDeps({
      query: vi.fn().mockReturnValue(ctrl.generator),
    })
    const session = createClaudeSession(makeConfig(), deps)
    session.onStatusChange((s) => statuses.push(s))

    await session.start()

    // Complete the generator
    ctrl.complete()
    // Allow microtask to settle
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
    expect(session.status).toBe('stopped')
  })

  it('start() fires errored if the agent loop throws', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableGenerator()
    const deps = makeDeps({
      query: vi.fn().mockReturnValue(ctrl.generator),
    })
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
    const ctrl = createControllableGenerator()
    const deps = makeDeps({
      query: vi.fn().mockReturnValue(ctrl.generator),
    })
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
    const ctrl = createControllableGenerator()
    const deps = makeDeps({
      query: vi.fn().mockReturnValue(ctrl.generator),
    })
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
    // Generator completes immediately (empty generator)
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })

  it('processes generator messages while not aborted', async () => {
    const statuses: SpawnedAgentStatus[] = []
    const ctrl = createControllableGenerator()
    const deps = makeDeps({
      query: vi.fn().mockReturnValue(ctrl.generator),
    })
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

  it('passes systemPrompt to query options when provided', async () => {
    const queryFn = vi.fn(async function* () {})
    const config = makeConfig({
      systemPrompt: 'Custom prompt',
      model: 'claude-4',
      maxTurns: 5,
    })
    const session = createClaudeSession(config, { query: queryFn })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    expect(queryFn).toHaveBeenCalledWith({
      prompt: expect.stringContaining('"test-agent"'),
      options: {
        systemPrompt: 'Custom prompt',
        model: 'claude-4',
        maxTurns: 5,
      },
    })
  })

  it('uses roleDescription as systemPrompt fallback when no systemPrompt provided', async () => {
    const queryFn = vi.fn(async function* () {})
    const config = makeConfig()
    const session = createClaudeSession(config, { query: queryFn })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    expect(queryFn).toHaveBeenCalledWith({
      prompt: expect.any(String),
      options: expect.objectContaining({
        systemPrompt: 'A helpful test agent',
      }),
    })
  })

  it('passes undefined model and maxTurns when not in config', async () => {
    const queryFn = vi.fn(async function* () {})
    const config = makeConfig()
    const session = createClaudeSession(config, { query: queryFn })

    await session.start()
    await new Promise((r) => setTimeout(r, 0))

    expect(queryFn).toHaveBeenCalledWith({
      prompt: expect.any(String),
      options: expect.objectContaining({
        model: undefined,
        maxTurns: undefined,
      }),
    })
  })
})

describe('createClaudeSessionFactory', () => {
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
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses).toEqual(['connected', 'running', 'stopped'])
  })
})
