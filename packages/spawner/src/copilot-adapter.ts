import type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
import type { SpawnedAgentStatus } from './types.js'
import { createChatroomTools, type ChatroomTools } from './chatroom-tools.js'

export interface CopilotSessionHandle {
  send(options: { prompt: string }): Promise<string> | string
  on(event: string, callback: (data: unknown) => void): unknown
  disconnect(): Promise<void>
}

export interface CopilotClientHandle {
  createSession(config: Record<string, unknown>): Promise<CopilotSessionHandle>
  stop?(): Promise<unknown>
}

export interface CopilotAgentDependencies {
  createClient(): CopilotClientHandle
}

export const CHATROOM_SEND_MESSAGE_TOOL_NAME = 'send_message'

export interface CopilotSendMessageArgs {
  text: string
  mentions?: string[]
}

/**
 * Builds a Copilot SDK tool definition that lets the agent post a chatroom
 * message by calling the `send_message` tool. Exported for testing.
 */
export function buildSendMessageTool(tools: ChatroomTools) {
  return {
    name: CHATROOM_SEND_MESSAGE_TOOL_NAME,
    description:
      'Post a message into the chatroom you are connected to. This is the ONLY way your reply reaches other members.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The message text to post in the chatroom.',
        },
        mentions: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of member names to @mention in the message.',
        },
      },
      required: ['text'],
    },
    handler: async (args: CopilotSendMessageArgs) => {
      await tools.sendMessage(args.text, args.mentions)
      return 'Message sent.'
    },
    skipPermission: true,
  }
}

export function buildCopilotPrompt(config: AgentSessionConfig): string {
  const parts = [
    `You are "${config.agentName}", ${config.roleDescription}.`,
    ``,
    `You are participating in a live group chatroom with humans and other agents.`,
    `You are ALREADY CONNECTED to the chatroom — you do not need to write any code, run any scripts, or make any HTTP/WebSocket calls to connect.`,
    `Messages from other participants will be delivered to you as new prompts, formatted as "[sender]: text".`,
    `To reply in the chatroom you MUST call the \`send_message\` tool with \`{ text, mentions? }\`. Plain-text output is NOT delivered to anyone — only \`send_message\` calls reach the chat.`,
    `Wait until you are addressed (by name or by context) before responding. If a message is not for you, do nothing — do not call \`send_message\`.`,
    `Keep replies concise and conversational unless asked for detail.`,
  ]
  if (config.systemPrompt) {
    parts.push('', config.systemPrompt)
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
      const sessionConfig: Record<string, unknown> = {
        // approveAll permission handler — accepts all tool requests since
        // the agent only needs to talk in the chatroom
        onPermissionRequest: async () => ({ allowed: true }),
        systemMessage: {
          mode: 'replace',
          content: buildCopilotPrompt(config),
        },
        // Expose `send_message` so the agent can explicitly post replies.
        // We do NOT relay raw `assistant.message` events anymore — the agent
        // must call this tool to reach the chatroom.
        tools: [buildSendMessageTool(tools)],
      }
      if (config.model) {
        sessionConfig.model = config.model
      }
      sessionHandle = await client.createSession(sessionConfig)

      fireStatusChange('running')

      tools.onMessage((msg) => {
        if (!aborted && sessionHandle) {
          // Skip our own messages (chatroom-tools already filters but be safe)
          if (msg.sender === config.agentName) return
          void Promise.resolve(
            sessionHandle.send({ prompt: `[${msg.sender}]: ${msg.text}` }),
          ).catch(() => {
            // session may have ended
          })
        }
      })
    },

    async stop() {
      aborted = true
      try {
        await sessionHandle?.disconnect()
      } catch {
        // session may already be closed
      }
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
