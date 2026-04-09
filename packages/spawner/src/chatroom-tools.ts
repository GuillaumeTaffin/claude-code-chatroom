import {
  createChatroomClient,
  type ChatroomClient,
  type ConnectorSocketConstructor,
} from '@chatroom/connector-core'
import type { AgentRuntime } from '@chatroom/shared'

export interface ChatroomToolsConfig {
  serverUrl: string
  agentName: string
  roleDescription: string
  projectId: string
  runId: string
  runtime: AgentRuntime
}

export interface ChatroomMessage {
  sender: string
  text: string
  mentions: string[]
}

export type ChatroomMessageCallback = (msg: ChatroomMessage) => void

export interface ChatroomTools {
  readonly client: ChatroomClient
  connect(): Promise<{ channelId: string }>
  close(): void
  onMessage(callback: ChatroomMessageCallback): void
  sendMessage(text: string, mentions?: string[]): Promise<void>
}

export function createChatroomTools(
  config: ChatroomToolsConfig,
): ChatroomTools {
  const client = createChatroomClient({
    env: { CHATROOM_URL: config.serverUrl },
    fetchImpl: fetch,
    WebSocketImpl:
      globalThis.WebSocket as unknown as ConnectorSocketConstructor,
  })

  const messageCallbacks: ChatroomMessageCallback[] = []
  let closed = false
  let channelId: string | null = null

  async function startEventLoop() {
    while (!closed) {
      try {
        const result = await client.waitForEvents({
          timeoutMs: 55000,
          maxEvents: 100,
          includeSystem: false,
        })
        for (const event of result.events) {
          if (event.type === 'message' && event.sender !== config.agentName) {
            for (const cb of messageCallbacks) {
              cb({
                sender: event.sender,
                text: event.text,
                mentions: event.mentions,
              })
            }
          }
        }
      } catch {
        if (!closed) break
      }
    }
  }

  return {
    get client() {
      return client
    },

    async connect() {
      const data = await client.connect(
        config.agentName,
        config.roleDescription,
        config.projectId,
        config.runId,
        {
          runtime_id: config.runtime,
          runtime_version: null,
          capabilities: {
            can_stream_events: false,
            can_use_tools: true,
            can_manage_files: true,
            can_execute_commands: true,
          },
        },
      )
      channelId = data.channel_id
      startEventLoop()
      return { channelId: data.channel_id }
    },

    close() {
      closed = true
      client.close()
    },

    onMessage(callback: ChatroomMessageCallback) {
      messageCallbacks.push(callback)
    },

    async sendMessage(text: string, mentions?: string[]) {
      if (!channelId) {
        throw new Error('Not connected. Call connect() first.')
      }
      await client.sendMessage({
        channel_id: channelId,
        text,
        mentions,
      })
    },
  }
}
