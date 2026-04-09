import type { Run } from '@chatroom/shared'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSession } from './agent-session.js'
import { createSpawnManager } from './spawn-manager.js'
import type { SpawnedAgentStatus } from './types.js'

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  const callbacks: Array<(status: SpawnedAgentStatus) => void> = []
  return {
    status: 'starting',
    agentName: 'test-agent',
    runtime: 'claude',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onStatusChange(cb) {
      callbacks.push(cb)
    },
    _fireStatusChange(status: SpawnedAgentStatus) {
      for (const cb of callbacks) cb(status)
    },
    ...overrides,
  } as AgentSession & { _fireStatusChange: (s: SpawnedAgentStatus) => void }
}

function makeRun(members: Run['team_snapshot']['members']): Run {
  return {
    id: 'run-1',
    name: 'Test Run',
    project_id: 'project-1',
    team_snapshot: {
      team_id: 'team-1',
      team_name: 'Test Team',
      members,
    },
    channel_id: 'channel-1',
    status: 'active',
    phases: [],
    current_phase_id: null,
    approval_required: false,
    approvals: [],
    created_at: new Date().toISOString(),
  }
}

describe('SpawnManager', () => {
  it('spawns sessions for agent roles and ignores human roles', async () => {
    const sessions: AgentSession[] = []
    const factory = vi.fn().mockImplementation(() => {
      const session = makeSession()
      sessions.push(session)
      return session
    })

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Backend Agent',
        role_description: 'Backend developer',
        agent_config: {
          runtime: 'claude',
          system_prompt: null,
          model: null,
        },
      },
      {
        role_id: 'r2',
        role_name: 'Frontend Agent',
        role_description: 'Frontend developer',
        agent_config: {
          runtime: 'copilot',
          system_prompt: 'Be helpful',
          model: 'gpt-4',
        },
      },
      {
        role_id: 'r3',
        role_name: 'Human Reviewer',
        role_description: 'Reviews code',
        agent_config: null,
      },
    ])

    const status = await manager.spawnForRun(run)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(status.run_id).toBe('run-1')
    expect(status.agents).toHaveLength(2)
    expect(status.agents[0].agent_name).toBe('backend-agent')
    expect(status.agents[0].runtime).toBe('claude')
    expect(status.agents[1].agent_name).toBe('frontend-agent')
    expect(status.agents[1].runtime).toBe('copilot')
    expect(sessions[0].start).toHaveBeenCalled()
    expect(sessions[1].start).toHaveBeenCalled()
  })

  it('derives unique names for duplicate role names', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'First agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
      {
        role_id: 'r2',
        role_name: 'Agent',
        role_description: 'Second agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
      {
        role_id: 'r3',
        role_name: 'Agent',
        role_description: 'Third agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    const status = await manager.spawnForRun(run)

    const names = status.agents.map((a) => a.agent_name)
    expect(names).toEqual(['agent', 'agent-2', 'agent-3'])
  })

  it('marks agents as errored when session start fails', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue(new Error('spawn failed')),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Broken Agent',
        role_description: 'Will fail',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    const status = await manager.spawnForRun(run)

    expect(status.agents[0].status).toBe('errored')
    expect(status.agents[0].error).toBe('spawn failed')
    expect(status.agents[0].stopped_at).toBeDefined()
  })

  it('handles non-Error rejection reasons', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue('string error'),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Broken Agent',
        role_description: 'Will fail',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    const status = await manager.spawnForRun(run)

    expect(status.agents[0].status).toBe('errored')
    expect(status.agents[0].error).toBe('string error')
  })

  it('returns correct spawn status for a run', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    const status = manager.getSpawnStatus('run-1')

    expect(status).toBeDefined()
    expect(status!.run_id).toBe('run-1')
    expect(status!.agents).toHaveLength(1)
    expect(status!.agents[0].role_id).toBe('r1')
    expect(status!.agents[0].started_at).toBeDefined()
  })

  it('returns undefined for unknown runId', () => {
    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: vi.fn(),
    })

    expect(manager.getSpawnStatus('unknown')).toBeUndefined()
  })

  it('stops all sessions for a run', async () => {
    const sessions: AgentSession[] = []
    const factory = vi.fn().mockImplementation(() => {
      const session = makeSession()
      sessions.push(session)
      return session
    })

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent One',
        role_description: 'First',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
      {
        role_id: 'r2',
        role_name: 'Agent Two',
        role_description: 'Second',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    await manager.stopRun('run-1')

    expect(sessions[0].stop).toHaveBeenCalled()
    expect(sessions[1].stop).toHaveBeenCalled()

    const status = manager.getSpawnStatus('run-1')
    expect(status!.agents[0].status).toBe('stopped')
    expect(status!.agents[0].stopped_at).toBeDefined()
    expect(status!.agents[1].status).toBe('stopped')
    expect(status!.agents[1].stopped_at).toBeDefined()
  })

  it('does not update status on stopRun when already stopped or errored', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue(new Error('fail')),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    const statusBefore = manager.getSpawnStatus('run-1')!
    const stoppedAt = statusBefore.agents[0].stopped_at

    await manager.stopRun('run-1')

    const statusAfter = manager.getSpawnStatus('run-1')!
    expect(statusAfter.agents[0].status).toBe('errored')
    expect(statusAfter.agents[0].stopped_at).toBe(stoppedAt)
  })

  it('stopRun is a no-op for unknown runId', async () => {
    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: vi.fn(),
    })

    await expect(manager.stopRun('unknown')).resolves.toBeUndefined()
  })

  it('stops a specific agent', async () => {
    const sessions: AgentSession[] = []
    const factory = vi.fn().mockImplementation(() => {
      const session = makeSession()
      sessions.push(session)
      return session
    })

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent One',
        role_description: 'First',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
      {
        role_id: 'r2',
        role_name: 'Agent Two',
        role_description: 'Second',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    await manager.stopAgent('run-1', 'agent-one')

    expect(sessions[0].stop).toHaveBeenCalled()
    expect(sessions[1].stop).not.toHaveBeenCalled()

    const status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('stopped')
    expect(status.agents[0].stopped_at).toBeDefined()
  })

  it('does not update status on stopAgent when already stopped', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue(new Error('fail')),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    await manager.stopAgent('run-1', 'agent')

    const status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('errored')
  })

  it('stopAgent is a no-op for unknown runId', async () => {
    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: vi.fn(),
    })

    await expect(manager.stopAgent('unknown', 'agent')).resolves.toBeUndefined()
  })

  it('stopAgent is a no-op for unknown agent name', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)
    await expect(
      manager.stopAgent('run-1', 'nonexistent'),
    ).resolves.toBeUndefined()
  })

  it('updates SpawnedAgentInfo when onStatusChange fires', async () => {
    const sessions: Array<
      AgentSession & { _fireStatusChange: (s: SpawnedAgentStatus) => void }
    > = []
    const factory = vi.fn().mockImplementation(() => {
      const session = makeSession()
      sessions.push(
        session as AgentSession & {
          _fireStatusChange: (s: SpawnedAgentStatus) => void
        },
      )
      return session
    })

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: { runtime: 'claude', system_prompt: null, model: null },
      },
    ])

    await manager.spawnForRun(run)

    sessions[0]._fireStatusChange('connected')
    let status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('connected')
    expect(status.agents[0].stopped_at).toBeUndefined()

    sessions[0]._fireStatusChange('running')
    status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('running')

    sessions[0]._fireStatusChange('stopped')
    status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('stopped')
    expect(status.agents[0].stopped_at).toBeDefined()

    sessions[0]._fireStatusChange('errored')
    status = manager.getSpawnStatus('run-1')!
    expect(status.agents[0].status).toBe('errored')
  })

  it('passes session config with system_prompt and model from agent_config', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const run = makeRun([
      {
        role_id: 'r1',
        role_name: 'Agent',
        role_description: 'An agent',
        agent_config: {
          runtime: 'copilot',
          system_prompt: 'Be helpful',
          model: 'gpt-4',
        },
      },
    ])

    await manager.spawnForRun(run)

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: 'copilot',
        agentName: 'agent',
        roleDescription: 'An agent',
        systemPrompt: 'Be helpful',
        model: 'gpt-4',
        projectId: 'project-1',
        runId: 'run-1',
        serverUrl: 'http://localhost:3000',
      }),
    )
  })
})

describe('SpawnManager - spawnForProject', () => {
  it('spawns a session with correct config', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const result = await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Backend Agent',
      role_description: 'Backend developer',
      agent_config: {
        runtime: 'claude',
        system_prompt: 'Be helpful',
        model: 'claude-sonnet',
      },
    })

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: 'claude',
        agentName: 'backend-agent',
        roleDescription: 'Backend developer',
        systemPrompt: 'Be helpful',
        model: 'claude-sonnet',
        projectId: 'proj-1',
        runId: '',
        serverUrl: 'http://localhost:3000',
      }),
    )

    expect(result.role_id).toBe('r1')
    expect(result.agent_name).toBe('backend-agent')
    expect(result.runtime).toBe('claude')
    expect(result.status).toBe('starting')
    expect(result.started_at).toBeDefined()
  })

  it('derives agent name from role_name', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const result = await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Frontend Developer',
      role_description: 'Builds UIs',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    expect(result.agent_name).toBe('frontend-developer')
  })

  it('derives unique names for duplicate role names in the same project', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const member = {
      role_id: 'r1',
      role_name: 'Agent',
      role_description: 'An agent',
      agent_config: {
        runtime: 'claude' as const,
        system_prompt: null,
        model: null,
      },
    }

    const r1 = await manager.spawnForProject('proj-1', member)
    const r2 = await manager.spawnForProject('proj-1', {
      ...member,
      role_id: 'r2',
    })
    const r3 = await manager.spawnForProject('proj-1', {
      ...member,
      role_id: 'r3',
    })

    expect(r1.agent_name).toBe('agent')
    expect(r2.agent_name).toBe('agent-2')
    expect(r3.agent_name).toBe('agent-3')
  })

  it('returns SpawnedAgentInfo with correct fields', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const result = await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Dev',
      role_description: 'Developer',
      agent_config: {
        runtime: 'copilot',
        system_prompt: null,
        model: 'gpt-4',
      },
    })

    expect(result).toEqual({
      role_id: 'r1',
      agent_name: 'dev',
      runtime: 'copilot',
      status: 'starting',
      started_at: expect.any(String),
    })
  })

  it('handles start failures by marking as errored', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue(new Error('spawn failed')),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const result = await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Broken Agent',
      role_description: 'Will fail',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    expect(result.status).toBe('errored')
    expect(result.error).toBe('spawn failed')
    expect(result.stopped_at).toBeDefined()
  })

  it('handles non-Error rejection reasons in start failures', async () => {
    const factory = vi.fn().mockImplementation(() =>
      makeSession({
        start: vi.fn().mockRejectedValue('string error'),
      }),
    )

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    const result = await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Broken Agent',
      role_description: 'Will fail',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    expect(result.status).toBe('errored')
    expect(result.error).toBe('string error')
  })

  it('converts null system_prompt and model to undefined in session config', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Agent',
      role_description: 'An agent',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: undefined,
        model: undefined,
      }),
    )
  })

  it('updates SpawnedAgentInfo when onStatusChange fires', async () => {
    const sessions: Array<
      AgentSession & { _fireStatusChange: (s: SpawnedAgentStatus) => void }
    > = []
    const factory = vi.fn().mockImplementation(() => {
      const session = makeSession()
      sessions.push(
        session as AgentSession & {
          _fireStatusChange: (s: SpawnedAgentStatus) => void
        },
      )
      return session
    })

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Agent',
      role_description: 'An agent',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    sessions[0]._fireStatusChange('connected')
    let agents = manager.getProjectAgents('proj-1')
    expect(agents[0].status).toBe('connected')

    sessions[0]._fireStatusChange('stopped')
    agents = manager.getProjectAgents('proj-1')
    expect(agents[0].status).toBe('stopped')
    expect(agents[0].stopped_at).toBeDefined()
  })
})

describe('SpawnManager - getProjectAgents', () => {
  it('returns empty array for unknown project', () => {
    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: vi.fn(),
    })

    expect(manager.getProjectAgents('unknown')).toEqual([])
  })

  it('returns agents for known project', async () => {
    const factory = vi.fn().mockImplementation(() => makeSession())

    const manager = createSpawnManager({
      serverUrl: 'http://localhost:3000',
      sessionFactory: factory,
    })

    await manager.spawnForProject('proj-1', {
      role_id: 'r1',
      role_name: 'Agent One',
      role_description: 'First agent',
      agent_config: { runtime: 'claude', system_prompt: null, model: null },
    })

    await manager.spawnForProject('proj-1', {
      role_id: 'r2',
      role_name: 'Agent Two',
      role_description: 'Second agent',
      agent_config: { runtime: 'copilot', system_prompt: null, model: null },
    })

    const agents = manager.getProjectAgents('proj-1')
    expect(agents).toHaveLength(2)
    expect(agents[0].agent_name).toBe('agent-one')
    expect(agents[1].agent_name).toBe('agent-two')
  })
})
