import {
  isNotification,
  isResponse,
  type ChatEvent,
  type JsonRpcMessage,
  type JsonRpcResponse,
  type MemberJoinedParams,
  type MemberLeftParams,
  type NewMessageParams,
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
  onEvent: (event: ChatEvent) => Promise<void> | void
  onClose?: (error: Error) => Promise<void> | void
}

export interface ChatroomWebSocketClient {
  connect(name: string): Promise<void>
  sendRpcRequest(id: number, request: unknown): Promise<unknown>
  close(): void
}

export function normalizeChatEvent(
  method: string,
  params: unknown,
): ChatEvent | null {
  switch (method) {
    case 'new_message':
      return { type: 'message', ...(params as NewMessageParams) }
    case 'member_joined':
      return { type: 'member_joined', ...(params as MemberJoinedParams) }
    case 'member_left':
      return { type: 'member_left', ...(params as MemberLeftParams) }
    default:
      return null
  }
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
  onEvent,
  onClose,
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
          const closeError = new Error('WebSocket connection closed')
          logger.error('[connector] WebSocket closed')
          state.clearWsConnection()
          clearPendingRequests(state, closeError)
          void onClose?.(closeError)
        }

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as JsonRpcMessage

            if (isResponse(message)) {
              resolveResponse(state, message)
              return
            }

            if (isNotification(message)) {
              const normalizedEvent = normalizeChatEvent(
                message.method,
                message.params,
              )
              if (normalizedEvent) {
                void onEvent(normalizedEvent)
              }
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

    close() {
      state.wsConnection?.close?.()
    },
  }
}
