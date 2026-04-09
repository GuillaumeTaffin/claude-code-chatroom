import type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
import type { SpawnedAgentStatus } from './types.js'
import { createChatroomTools, type ChatroomTools } from './chatroom-tools.js'

export interface ClaudeAgentDependencies {
  query: (options: {
    prompt: string
    options?: {
      systemPrompt?: string
      model?: string
      maxTurns?: number
      mcpServers?: Record<string, unknown>
      allowedTools?: string[]
      permissionMode?: string
    }
  }) => AsyncGenerator<unknown>
}

export function buildPrompt(config: AgentSessionConfig): string {
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

export function createClaudeSession(
  config: AgentSessionConfig,
  deps: ClaudeAgentDependencies,
): AgentSession {
  let status: SpawnedAgentStatus = 'starting'
  const listeners: Array<(s: SpawnedAgentStatus) => void> = []
  let tools: ChatroomTools | null = null
  let aborted = false

  function fireStatusChange(newStatus: SpawnedAgentStatus) {
    status = newStatus
    for (const cb of listeners) cb(newStatus)
  }

  async function runAgentLoop() {
    const prompt = buildPrompt(config)

    const generator = deps.query({
      prompt,
      options: {
        systemPrompt: config.systemPrompt ?? config.roleDescription,
        model: config.model,
        maxTurns: config.maxTurns,
      },
    })

    let done = false
    while (!done && !aborted) {
      const result = await generator.next()
      done = !!result.done
    }
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

      fireStatusChange('running')
      runAgentLoop()
        .then(() => {
          if (!aborted) fireStatusChange('stopped')
        })
        .catch(() => {
          if (!aborted) fireStatusChange('errored')
        })
    },

    async stop() {
      aborted = true
      tools?.close()
      fireStatusChange('stopped')
    },

    onStatusChange(cb) {
      listeners.push(cb)
    },
  }
}

export function createClaudeSessionFactory(
  deps: ClaudeAgentDependencies,
): AgentSessionFactory {
  return (config) => createClaudeSession(config, deps)
}
