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
    ``,
    `You are participating in a live group chatroom with humans and other agents.`,
    `You are ALREADY CONNECTED to the chatroom — you do not need to write any code, run any scripts, or make any HTTP/WebSocket calls to connect.`,
    `Messages from other participants will be delivered to you automatically as new user turns, formatted as "[sender]: text".`,
    `Whatever plain-text response you produce will be automatically posted to the chatroom as a message from you.`,
    `Just talk naturally — reply in plain text. Do not narrate your actions, do not write scripts, do not call tools to send messages.`,
    `Wait until you are addressed (by name or by context) before responding. If a message is not for you, stay quiet.`,
    `Keep replies concise and conversational unless asked for detail.`,
  ]
  if (config.systemPrompt) {
    parts.push('', config.systemPrompt)
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
  let wakeUpStream: (() => void) | null = null

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

      // Create a message queue: agent blocks until a chatroom message arrives,
      // then yields it as a user turn. No fake initial prompt.
      const messageQueue: Array<{
        type: 'user'
        message: { role: 'user'; content: string }
        parent_tool_use_id: null
      }> = []

      async function* promptStream() {
        while (!abortedRef.value) {
          if (messageQueue.length === 0) {
            await new Promise<void>((resolve) => {
              wakeUpStream = resolve
            })
          }
          if (abortedRef.value) break
          while (messageQueue.length > 0) {
            const next = messageQueue.shift()!
            yield next
          }
        }
      }

      const queryHandle = deps.query({
        prompt: promptStream(),
        options: {
          systemPrompt: buildPrompt(config),
          model: config.model,
          maxTurns: config.maxTurns,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      })

      tools.onMessage((msg) => {
        messageQueue.push({
          type: 'user',
          message: {
            role: 'user',
            content: `[${msg.sender}]: ${msg.text}`,
          },
          parent_tool_use_id: null,
        })
        if (wakeUpStream) {
          const fn = wakeUpStream
          wakeUpStream = null
          fn()
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
      if (wakeUpStream) {
        const fn = wakeUpStream
        wakeUpStream = null
        fn()
      }
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
