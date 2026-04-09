import type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
import type { SpawnedAgentStatus } from './types.js'
import { createChatroomTools, type ChatroomTools } from './chatroom-tools.js'

export interface ClaudeQueryHandle {
  streamInput(
    input: AsyncIterable<{
      type: 'user'
      message: { role: 'user'; content: string }
      parent_tool_use_id: null
    }>,
  ): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<unknown>
}

export interface ClaudeAgentDependencies {
  query: (options: {
    prompt: string | AsyncIterable<unknown>
    options?: Record<string, unknown>
  }) => ClaudeQueryHandle
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

async function runAgentLoop(
  queryHandle: ClaudeQueryHandle,
  tools: ChatroomTools,
  abortedRef: { value: boolean },
) {
  for await (const message of queryHandle) {
    if (abortedRef.value) break
    if (message && typeof message === 'object' && 'type' in message) {
      const msg = message as {
        type: string
        message?: { content?: unknown[] }
      }
      if (msg.type === 'assistant' && msg.message?.content) {
        const textBlocks = (
          msg.message.content as Array<{ type: string; text?: string }>
        )
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text!)
        if (textBlocks.length > 0) {
          await tools.sendMessage(textBlocks.join('\n'))
        }
      }
    }
  }
}

export function createClaudeSession(
  config: AgentSessionConfig,
  deps: ClaudeAgentDependencies,
): AgentSession {
  let status: SpawnedAgentStatus = 'starting'
  const listeners: Array<(s: SpawnedAgentStatus) => void> = []
  let tools: ChatroomTools | null = null
  const abortedRef = { value: false }

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

      const prompt = buildPrompt(config)
      const queryHandle = deps.query({
        prompt,
        options: {
          systemPrompt: config.systemPrompt ?? config.roleDescription,
          model: config.model,
          maxTurns: config.maxTurns,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      })

      tools.onMessage(async (msg) => {
        try {
          await queryHandle.streamInput(
            (async function* () {
              yield {
                type: 'user' as const,
                message: {
                  role: 'user' as const,
                  content: `[${msg.sender}]: ${msg.text}`,
                },
                parent_tool_use_id: null,
              }
            })(),
          )
        } catch {
          // session may have ended
        }
      })

      fireStatusChange('running')

      runAgentLoop(queryHandle, tools, abortedRef)
        .then(() => {
          if (!abortedRef.value) fireStatusChange('stopped')
        })
        .catch(() => {
          if (!abortedRef.value) fireStatusChange('errored')
        })
    },

    async stop() {
      abortedRef.value = true
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
