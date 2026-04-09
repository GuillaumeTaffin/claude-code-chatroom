import type { Run, RunTeamSnapshotMember } from '@chatroom/shared'
import type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
import type {
  RunSpawnStatus,
  SpawnedAgentInfo,
  SpawnedAgentStatus,
} from './types.js'

export interface SpawnManagerConfig {
  serverUrl: string
  sessionFactory: AgentSessionFactory
}

export interface SpawnManager {
  spawnForRun(run: Run): Promise<RunSpawnStatus>
  getSpawnStatus(runId: string): RunSpawnStatus | undefined
  stopRun(runId: string): Promise<void>
  stopAgent(runId: string, agentName: string): Promise<void>
}

interface RunEntry {
  sessions: Map<string, AgentSession>
  info: Map<string, SpawnedAgentInfo>
}

function deriveAgentName(roleName: string, existingNames: Set<string>): string {
  const base = roleName.toLowerCase().replace(/\s+/g, '-')
  if (!existingNames.has(base)) {
    return base
  }
  let suffix = 2
  while (existingNames.has(`${base}-${suffix}`)) {
    suffix++
  }
  return `${base}-${suffix}`
}

export function createSpawnManager(config: SpawnManagerConfig): SpawnManager {
  const runs = new Map<string, RunEntry>()

  function buildSpawnStatus(runId: string, entry: RunEntry): RunSpawnStatus {
    return {
      run_id: runId,
      agents: Array.from(entry.info.values()),
    }
  }

  function spawnAgent(
    run: Run,
    entry: RunEntry,
    member: RunTeamSnapshotMember,
    agentName: string,
  ): AgentSession {
    const sessionConfig: AgentSessionConfig = {
      runtime: member.agent_config!.runtime,
      agentName,
      roleDescription: member.role_description,
      systemPrompt: member.agent_config!.system_prompt ?? undefined,
      model: member.agent_config!.model ?? undefined,
      projectId: run.project_id,
      runId: run.id,
      serverUrl: config.serverUrl,
    }

    const session = config.sessionFactory(sessionConfig)

    const info: SpawnedAgentInfo = {
      role_id: member.role_id,
      agent_name: agentName,
      runtime: member.agent_config!.runtime,
      status: 'starting',
      started_at: new Date().toISOString(),
    }

    entry.sessions.set(agentName, session)
    entry.info.set(agentName, info)

    session.onStatusChange((status: SpawnedAgentStatus) => {
      const stored = entry.info.get(agentName)!
      stored.status = status
      if (status === 'stopped' || status === 'errored') {
        stored.stopped_at = new Date().toISOString()
      }
    })

    return session
  }

  return {
    async spawnForRun(run: Run): Promise<RunSpawnStatus> {
      const entry: RunEntry = {
        sessions: new Map(),
        info: new Map(),
      }
      runs.set(run.id, entry)

      const agentMembers = run.team_snapshot.members.filter(
        (m) => m.agent_config !== null,
      )

      const usedNames = new Set<string>()
      const sessionsToStart: Array<{
        session: AgentSession
        agentName: string
      }> = []

      for (const member of agentMembers) {
        const agentName = deriveAgentName(member.role_name, usedNames)
        usedNames.add(agentName)

        const session = spawnAgent(run, entry, member, agentName)
        sessionsToStart.push({ session, agentName })
      }

      const results = await Promise.allSettled(
        sessionsToStart.map((s) => s.session.start()),
      )

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const { agentName } = sessionsToStart[i]
        const info = entry.info.get(agentName)!

        if (result.status === 'rejected') {
          info.status = 'errored'
          info.error =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          info.stopped_at = new Date().toISOString()
        }
      }

      return buildSpawnStatus(run.id, entry)
    },

    getSpawnStatus(runId: string): RunSpawnStatus | undefined {
      const entry = runs.get(runId)
      if (!entry) {
        return undefined
      }
      return buildSpawnStatus(runId, entry)
    },

    async stopRun(runId: string): Promise<void> {
      const entry = runs.get(runId)
      if (!entry) {
        return
      }

      await Promise.allSettled(
        Array.from(entry.sessions.values()).map((s) => s.stop()),
      )

      for (const [, info] of entry.info) {
        if (info.status !== 'stopped' && info.status !== 'errored') {
          info.status = 'stopped'
          info.stopped_at = new Date().toISOString()
        }
      }
    },

    async stopAgent(runId: string, agentName: string): Promise<void> {
      const entry = runs.get(runId)
      if (!entry) {
        return
      }

      const session = entry.sessions.get(agentName)
      if (!session) {
        return
      }

      await session.stop()

      const info = entry.info.get(agentName)
      if (info && info.status !== 'stopped' && info.status !== 'errored') {
        info.status = 'stopped'
        info.stopped_at = new Date().toISOString()
      }
    },
  }
}
