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

export interface ChatroomTools {
  readonly client: ChatroomClient
  connect(): Promise<{ channelId: string }>
  close(): void
}

export function createChatroomTools(
  config: ChatroomToolsConfig,
): ChatroomTools {
  const client = createChatroomClient({
    env: { CHATROOM_URL: config.serverUrl },
    fetchImpl: fetch,
    WebSocketImpl: WebSocket as unknown as ConnectorSocketConstructor,
  })

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
      return { channelId: data.channel_id }
    },

    close() {
      client.close()
    },
  }
}
