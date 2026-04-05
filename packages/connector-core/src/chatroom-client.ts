import { makeRequest } from '@chatroom/shared'
import { createChatroomApi, type ChatroomApi } from './chatroom-api.js'
import { getServerUrl, getWsUrl } from './config.js'
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
  readonly channelId: string | null
  readonly isConnected: boolean
  connect(name: string, description: string): Promise<{ channel_id: string }>
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

    get channelId() {
      return state.channelId
    },

    get isConnected() {
      return state.wsConnection !== null
    },

    async connect(name: string, description: string) {
      if (state.connectedName) {
        throw new Error(`Already connected as "${state.connectedName}"`)
      }

      try {
        const data = await api.connect(name, description)
        await wsClient.connect(name)
        state.setIdentity(name, data.channel_id)
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
      return api.listMembers()
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
