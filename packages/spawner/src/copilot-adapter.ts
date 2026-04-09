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

export function buildCopilotPrompt(config: AgentSessionConfig): string {
  const parts = [
    `You are "${config.agentName}", ${config.roleDescription}.`,
    ``,
    `You are participating in a live group chatroom with humans and other agents.`,
    `You are ALREADY CONNECTED to the chatroom — you do not need to write any code, run any scripts, or make any HTTP/WebSocket calls to connect.`,
    `Messages from other participants will be delivered to you as new prompts, formatted as "[sender]: text".`,
    `Whatever plain-text response you produce will be automatically posted to the chatroom as a message from you.`,
    `Just talk naturally — reply in plain text. Do not narrate your actions, do not write scripts, do not call tools to send messages.`,
    `Wait until you are addressed (by name or by context) before responding. If a message is not for you, stay quiet by replying with the single word "skip".`,
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
          // Skip if the agent sent a "skip" reply (defensive)
          void Promise.resolve(
            sessionHandle.send({ prompt: `[${msg.sender}]: ${msg.text}` }),
          ).catch(() => {
            // session may have ended
          })
        }
      })

      sessionHandle.on('assistant.message', (event: unknown) => {
        if (!aborted && tools) {
          const content = extractCopilotText(event)
          if (content && content.trim().toLowerCase() !== 'skip') {
            tools.sendMessage(content).catch(() => {
              // chatroom may have disconnected
            })
          }
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

export function extractCopilotText(event: unknown): string | null {
  if (
    event &&
    typeof event === 'object' &&
    'data' in event &&
    event.data &&
    typeof event.data === 'object' &&
    'content' in event.data &&
    typeof (event.data as { content: unknown }).content === 'string'
  ) {
    return (event.data as { content: string }).content
  }
  return null
}

export function createCopilotSessionFactory(
  deps: CopilotAgentDependencies,
): AgentSessionFactory {
  return (config) => createCopilotSession(config, deps)
}
