import { makeRequest, type RuntimeIdentity } from '@chatroom/shared'
import { createChatroomApi, type ChatroomApi } from './chatroom-api.js'
import { getProjectId, getRunId, getServerUrl, getWsUrl } from './config.js'
import {
  createChatEventBuffer,
  type ChatEventBuffer,
  type WaitForEventsOptions,
  type WaitForEventsResult,
} from './event-buffer.js'
import {
  createChatroomWebSocketClient,
  type ChatroomWebSocketClient,
  type ConnectorSocketConstructor,
} from './chatroom-ws.js'
import {
  createConnectorSessionState,
  type ConnectorSessionState,
} from './session-state.js'

export interface ChatroomClient {
  readonly connectedName: string | null
  readonly projectId: string | null
  readonly channelId: string | null
  readonly runId: string | null
  readonly isConnected: boolean
  connect(
    name: string,
    description: string,
    projectId?: string,
    runId?: string,
    runtime?: RuntimeIdentity,
  ): Promise<{ project_id: string; channel_id: string; run_id?: string }>
  sendMessage(args: {
    channel_id: string
    text: string
    mentions?: string[]
  }): Promise<unknown>
  listMembers(): Promise<{
    members: Array<{ name: string; description: string; channel_id: string }>
  }>
  waitForEvents(options?: WaitForEventsOptions): Promise<WaitForEventsResult>
  close(): void
}

export interface CreateChatroomClientOptions {
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  WebSocketImpl?: ConnectorSocketConstructor
  logger?: Pick<Console, 'error' | 'warn'>
  serverUrl?: string
  wsUrl?: string
  requestTimeoutMs?: number
  maxBufferedEvents?: number
  api?: ChatroomApi
  wsClient?: ChatroomWebSocketClient
  state?: ConnectorSessionState
  eventBuffer?: ChatEventBuffer
}

export function createChatroomClient({
  env = process.env,
  fetchImpl,
  WebSocketImpl,
  logger = console,
  serverUrl: providedServerUrl,
  wsUrl: providedWsUrl,
  requestTimeoutMs,
  maxBufferedEvents,
  api: providedApi,
  wsClient: providedWsClient,
  state = createConnectorSessionState(),
  eventBuffer = createChatEventBuffer({
    logger,
    maxSize: maxBufferedEvents,
  }),
}: CreateChatroomClientOptions): ChatroomClient {
  const serverUrl = providedServerUrl ?? getServerUrl(env)
  const wsUrl = providedWsUrl ?? getWsUrl(serverUrl)
  const configuredProjectId = getProjectId(env)
  const configuredRunId = getRunId(env)

  const api =
    providedApi ??
    createChatroomApi({
      fetchImpl: fetchImpl as typeof fetch,
      serverUrl,
    })

  const wsClient =
    providedWsClient ??
    createChatroomWebSocketClient({
      WebSocketImpl: WebSocketImpl as ConnectorSocketConstructor,
      wsUrl,
      state,
      logger,
      requestTimeoutMs,
      onEvent: (event) => {
        eventBuffer.push(event)
      },
      onClose: (error) => {
        eventBuffer.cancelPendingWait(error)
      },
    })

  return {
    get connectedName() {
      return state.connectedName
    },

    get projectId() {
      return state.projectId
    },

    get channelId() {
      return state.channelId
    },

    get runId() {
      return state.runId
    },

    get isConnected() {
      return state.wsConnection !== null
    },

    async connect(
      name: string,
      description: string,
      projectId?: string,
      runId?: string,
      runtime?: RuntimeIdentity,
    ) {
      if (state.connectedName) {
        throw new Error(`Already connected as "${state.connectedName}"`)
      }

      const selectedProjectId = projectId?.trim() || configuredProjectId
      if (!selectedProjectId) {
        throw new Error(
          'Project ID is required. Pass project_id to connect_chat or set CHATROOM_PROJECT_ID.',
        )
      }

      const selectedRunId = runId?.trim() || configuredRunId || undefined

      try {
        const data = await api.connect(
          name,
          description,
          selectedProjectId,
          selectedRunId,
          runtime,
        )
        await wsClient.connect(name, data.project_id)
        state.setIdentity(
          name,
          data.project_id,
          data.channel_id,
          data.run_id ?? null,
        )
        eventBuffer.clear()
        return data
      } catch (error) {
        wsClient.close()
        state.clearWsConnection()
        state.clearIdentity()
        eventBuffer.clear()
        throw error
      }
    },

    async sendMessage(args: {
      channel_id: string
      text: string
      mentions?: string[]
    }) {
      if (!state.connectedName || !state.wsConnection) {
        throw new Error('Not connected. Call connect_chat first.')
      }

      if (args.channel_id !== state.channelId) {
        throw new Error(`Invalid channel_id. Expected "${state.channelId}".`)
      }

      const id = state.nextRpcId()
      const request = makeRequest(id, 'send_message', {
        channel_id: args.channel_id,
        text: args.text,
        mentions: args.mentions ?? [],
      })

      return wsClient.sendRpcRequest(id, request)
    },

    listMembers() {
      if (!state.projectId) {
        return Promise.reject(
          new Error('Not connected. Call connect_chat first.'),
        )
      }

      return api.listMembers(state.projectId)
    },

    waitForEvents(options = {}) {
      if (!state.wsConnection || !state.connectedName) {
        return Promise.reject(
          new Error('Not connected. Call connect_chat first.'),
        )
      }

      return eventBuffer.waitForEvents(options, {
        connectedName: state.connectedName,
      })
    },

    close() {
      eventBuffer.cancelPendingWait(new Error('WebSocket connection closed'))
      eventBuffer.clear()
      wsClient.close()
      state.clearWsConnection()
      state.clearIdentity()
    },
  }
}
