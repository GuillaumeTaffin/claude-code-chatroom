import type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
import type { SpawnedAgentStatus } from './types.js'
import { createChatroomTools, type ChatroomTools } from './chatroom-tools.js'

export interface CopilotSessionHandle {
  send(options: { prompt: string }): void
  on(event: string, callback: (data: unknown) => void): void
  close(): Promise<void>
}

export interface CopilotClientHandle {
  createSession(options?: {
    systemPrompt?: string
    model?: string
    tools?: unknown[]
  }): Promise<CopilotSessionHandle>
}

export interface CopilotAgentDependencies {
  createClient(): CopilotClientHandle
}

export function buildCopilotPrompt(config: AgentSessionConfig): string {
  const parts = [
    `You are "${config.agentName}", ${config.roleDescription}.`,
    `You are participating in a project chatroom.`,
    `The chatroom server is at ${config.serverUrl}.`,
    `Your project ID is "${config.projectId}" and run ID is "${config.runId}".`,
  ]
  if (config.systemPrompt) {
    parts.push(config.systemPrompt)
  }
  return parts.join('\n')
}

export function createCopilotSession(
  config: AgentSessionConfig,
  deps: CopilotAgentDependencies,
): AgentSession {
  let status: SpawnedAgentStatus = 'starting'
  const listeners: Array<(s: SpawnedAgentStatus) => void> = []
  let tools: ChatroomTools | null = null
  let sessionHandle: CopilotSessionHandle | null = null
  let aborted = false

  function fireStatusChange(newStatus: SpawnedAgentStatus) {
    status = newStatus
    for (const cb of listeners) cb(newStatus)
  }

  return {
    get status() {
      return status
    },
    get agentName() {
      return config.agentName
    },
    get runtime() {
      return config.runtime
    },

    async start() {
      tools = createChatroomTools({
        serverUrl: config.serverUrl,
        agentName: config.agentName,
        roleDescription: config.roleDescription,
        projectId: config.projectId,
        runId: config.runId,
        runtime: config.runtime,
      })

      await tools.connect()
      fireStatusChange('connected')

      const client = deps.createClient()
      sessionHandle = await client.createSession({
        systemPrompt: config.systemPrompt ?? config.roleDescription,
        model: config.model,
      })

      fireStatusChange('running')

      const prompt = buildCopilotPrompt(config)
      sessionHandle.send({ prompt })

      sessionHandle.on('session.idle', () => {
        if (!aborted) fireStatusChange('stopped')
      })

      sessionHandle.on('error', () => {
        if (!aborted) fireStatusChange('errored')
      })
    },

    async stop() {
      aborted = true
      await sessionHandle?.close()
      tools?.close()
      fireStatusChange('stopped')
    },

    onStatusChange(cb) {
      listeners.push(cb)
    },
  }
}

export function createCopilotSessionFactory(
  deps: CopilotAgentDependencies,
): AgentSessionFactory {
  return (config) => createCopilotSession(config, deps)
}
