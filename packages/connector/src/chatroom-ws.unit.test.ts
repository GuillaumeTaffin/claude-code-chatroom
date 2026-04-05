import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectorSessionState } from './session-state.js'
import {
  createChatroomWebSocketClient,
  type ConnectorSocket,
} from './chatroom-ws.js'

class MockWebSocket implements ConnectorSocket {
  static instances: MockWebSocket[] = []

  onopen: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  sentMessages: string[] = []

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sentMessages.push(data)
  }

  close(): void {
    this.onclose?.()
  }

  emitOpen() {
    this.onopen?.()
  }

  emitError(event: unknown = new Error('socket error')) {
    this.onerror?.(event)
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
  }
}

describe('chatroom websocket client', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.useRealTimers()
  })

  it('connects and stores the websocket', async () => {
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onNotification: vi.fn(),
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    expect(state.wsConnection).toBe(MockWebSocket.instances[0])
  })

  it('rejects failed websocket connections', async () => {
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state: createConnectorSessionState(),
      logger: console,
      onNotification: vi.fn(),
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitError()

    await expect(connectPromise).rejects.toThrow('WebSocket connection failed')
  })

  it('sends rpc requests and resolves successful responses', async () => {
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onNotification: vi.fn(),
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    const requestPromise = client.sendRpcRequest(1, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    })
    MockWebSocket.instances[0]?.emitMessage({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    })

    await expect(requestPromise).resolves.toEqual({ ok: true })
    expect(MockWebSocket.instances[0]?.sentMessages).toEqual([
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      }),
    ])
  })

  it('rejects rpc error responses', async () => {
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onNotification: vi.fn(),
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    const requestPromise = client.sendRpcRequest(1, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    })
    MockWebSocket.instances[0]?.emitMessage({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'failed' },
    })

    await expect(requestPromise).rejects.toThrow('failed')
  })

  it('rejects missing websocket connections and timed out requests', async () => {
    vi.useFakeTimers()
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      requestTimeoutMs: 25,
      onNotification: vi.fn(),
    })

    await expect(
      client.sendRpcRequest(1, { jsonrpc: '2.0', id: 1, method: 'ping' }),
    ).rejects.toThrow('WebSocket not connected')

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    const requestPromise = client.sendRpcRequest(2, {
      jsonrpc: '2.0',
      id: 2,
      method: 'ping',
    })
    const rejection =
      expect(requestPromise).rejects.toThrow('Request timed out')

    await vi.advanceTimersByTimeAsync(25)

    await rejection
  })

  it('dispatches server notifications and clears pending requests on close', async () => {
    const onNotification = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onNotification,
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    const requestPromise = client.sendRpcRequest(3, {
      jsonrpc: '2.0',
      id: 3,
      method: 'ping',
    })

    MockWebSocket.instances[0]?.emitMessage({
      jsonrpc: '2.0',
      method: 'new_message',
      params: { text: 'hello' },
    })
    MockWebSocket.instances[0]?.close()

    expect(onNotification).toHaveBeenCalledWith('new_message', {
      text: 'hello',
    })
    await expect(requestPromise).rejects.toThrow('WebSocket connection closed')
    expect(state.wsConnection).toBeNull()
  })

  it('ignores websocket responses without a pending request and non-notification payloads', async () => {
    const onNotification = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onNotification,
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    expect(() => {
      MockWebSocket.instances[0]?.emitMessage({
        jsonrpc: '2.0',
        id: 999,
        result: { ok: true },
      })
      MockWebSocket.instances[0]?.emitMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {},
      })
    }).not.toThrow()

    expect(onNotification).not.toHaveBeenCalled()
    expect(state.pendingRequests.size).toBe(0)
  })

  it('logs malformed websocket payloads', async () => {
    const logger = { error: vi.fn() }
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state: createConnectorSessionState(),
      logger,
      onNotification: vi.fn(),
    })

    const connectPromise = client.connect('alpha')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    MockWebSocket.instances[0]?.emitMessage('{bad json')

    expect(logger.error).toHaveBeenCalledWith(
      '[connector] Failed to parse WS message:',
      expect.anything(),
    )
  })
})
