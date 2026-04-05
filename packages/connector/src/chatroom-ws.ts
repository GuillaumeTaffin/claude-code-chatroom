import {
  isNotification,
  isResponse,
  type JsonRpcMessage,
  type JsonRpcResponse,
} from '@chatroom/shared'
import type {
  ConnectorSessionState,
  ConnectorWebSocket,
  PendingRequest,
} from './session-state.js'

export interface ConnectorSocketMessageEvent {
  data: string
}

export interface ConnectorSocket extends ConnectorWebSocket {
  onopen: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  onclose: ((event: unknown) => void) | null
  onmessage: ((event: ConnectorSocketMessageEvent) => void) | null
}

export type ConnectorSocketConstructor = new (url: string) => ConnectorSocket

export interface CreateChatroomWebSocketClientOptions {
  WebSocketImpl: ConnectorSocketConstructor
  wsUrl: string
  state: ConnectorSessionState
  logger: Pick<Console, 'error'>
  requestTimeoutMs?: number
  onNotification: (method: string, params: unknown) => Promise<void> | void
}

export interface ChatroomWebSocketClient {
  connect(name: string): Promise<void>
  sendRpcRequest(id: number, request: unknown): Promise<unknown>
}

function clearPendingRequests(
  state: ConnectorSessionState,
  error: Error,
): void {
  for (const pending of state.pendingRequests.values()) {
    clearTimeout(pending.timeout)
    pending.reject(error)
  }
  state.pendingRequests.clear()
}

function resolveResponse(
  state: ConnectorSessionState,
  message: JsonRpcResponse,
) {
  const pending = state.pendingRequests.get(message.id)
  if (!pending) return

  state.pendingRequests.delete(message.id)
  clearTimeout(pending.timeout)

  if ('error' in message && message.error) {
    pending.reject(new Error(message.error.message))
    return
  }

  pending.resolve(message.result)
}

export function createChatroomWebSocketClient({
  WebSocketImpl,
  wsUrl,
  state,
  logger,
  requestTimeoutMs = 10_000,
  onNotification,
}: CreateChatroomWebSocketClientOptions): ChatroomWebSocketClient {
  return {
    connect(name: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const socket = new WebSocketImpl(
          `${wsUrl}/ws?name=${encodeURIComponent(name)}`,
        )

        socket.onopen = () => {
          state.setWsConnection(socket)
          logger.error(`[connector] WebSocket connected as "${name}"`)
          resolve()
        }

        socket.onerror = (event) => {
          logger.error('[connector] WebSocket error:', event)
          reject(new Error('WebSocket connection failed'))
        }

        socket.onclose = () => {
          logger.error('[connector] WebSocket closed')
          state.clearWsConnection()
          clearPendingRequests(state, new Error('WebSocket connection closed'))
        }

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as JsonRpcMessage

            if (isResponse(message)) {
              resolveResponse(state, message)
              return
            }

            if (isNotification(message)) {
              void onNotification(message.method, message.params)
            }
          } catch (error) {
            logger.error('[connector] Failed to parse WS message:', error)
          }
        }
      })
    },

    sendRpcRequest(id: number, request: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (!state.wsConnection) {
          reject(new Error('WebSocket not connected'))
          return
        }

        const timeout = setTimeout(() => {
          state.pendingRequests.delete(id)
          reject(new Error('Request timed out'))
        }, requestTimeoutMs)

        const pendingRequest: PendingRequest = {
          resolve,
          reject,
          timeout,
        }

        state.pendingRequests.set(id, pendingRequest)
        state.wsConnection.send(JSON.stringify(request))
      })
    },
  }
}
