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

/**
 * Minimal surface a chatroom MCP server needs from the spawner. We pass this
 * (rather than the full ChatroomTools) so the server-side factory can build
 * an in-process MCP server without depending on spawner internals.
 */
export interface ChatroomMcpHandlers {
  sendMessage(text: string, mentions?: string[]): Promise<void>
}

export interface ClaudeAgentDependencies {
  query: (options: {
    prompt: string | AsyncIterable<unknown>
    options?: Record<string, unknown>
  }) => ClaudeQueryHandle
  /**
   * Builds an in-process MCP server exposing the chatroom `send_message` tool.
   * The returned value is passed straight through to the Claude SDK as an
   * `mcpServers` entry; spawner does not introspect it.
   */
  createChatroomMcpServer: (handlers: ChatroomMcpHandlers) => unknown
}

export const CHATROOM_MCP_SERVER_NAME = 'chatroom'
export const CHATROOM_SEND_MESSAGE_TOOL = 'mcp__chatroom__send_message'

export function buildPrompt(config: AgentSessionConfig): string {
  const parts = [
    `You are "${config.agentName}", ${config.roleDescription}.`,
    ``,
    `You are participating in a live group chatroom with humans and other agents.`,
    `You are ALREADY CONNECTED to the chatroom — you do not need to write any code, run any scripts, or make any HTTP/WebSocket calls to connect.`,
    `Messages from other participants will be delivered to you automatically as new user turns, formatted as "[sender]: text".`,
    `To reply in the chatroom you MUST call the \`send_message\` MCP tool with \`{ text, mentions? }\`. Plain-text output is NOT delivered to anyone — only \`send_message\` calls reach the chat.`,
    `Wait until you are addressed (by name or by context) before responding. If a message is not for you, do nothing — do not call \`send_message\`.`,
    `Keep replies concise and conversational unless asked for detail.`,
  ]
  if (config.systemPrompt) {
    parts.push('', config.systemPrompt)
  }
  return parts.join('\n')
}

async function runAgentLoop(
  queryHandle: ClaudeQueryHandle,
  abortedRef: { value: boolean },
) {
  // Drain the iterator so the SDK can keep making progress (and so abort
  // is honored). The agent posts to the chatroom by calling the MCP
  // `send_message` tool, so we deliberately do NOT relay assistant text
  // output to the chatroom from here.
  for await (const _message of queryHandle) {
    void _message
    if (abortedRef.value) break
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

      const chatroomMcpServer = deps.createChatroomMcpServer({
        sendMessage: (text, mentions) => tools!.sendMessage(text, mentions),
      })

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
          mcpServers: { [CHATROOM_MCP_SERVER_NAME]: chatroomMcpServer },
          allowedTools: [CHATROOM_SEND_MESSAGE_TOOL],
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

      runAgentLoop(queryHandle, abortedRef)
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
