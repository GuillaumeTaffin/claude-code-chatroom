import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectorSessionState } from './session-state.js'
import {
  createChatroomWebSocketClient,
  normalizeChatEvent,
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

  it('normalizes known chat notifications', () => {
    expect(
      normalizeChatEvent('new_message', {
        sender: 'alpha',
        sender_role: 'frontend agent',
        text: 'hello',
        mentions: [],
        timestamp: '2026-04-05T00:00:00.000Z',
      }),
    ).toEqual({
      type: 'message',
      sender: 'alpha',
      sender_role: 'frontend agent',
      text: 'hello',
      mentions: [],
      timestamp: '2026-04-05T00:00:00.000Z',
    })

    expect(
      normalizeChatEvent('member_joined', {
        name: 'beta',
        description: 'backend agent',
        timestamp: '2026-04-05T00:00:01.000Z',
      }),
    ).toEqual({
      type: 'member_joined',
      name: 'beta',
      description: 'backend agent',
      timestamp: '2026-04-05T00:00:01.000Z',
    })

    expect(
      normalizeChatEvent('member_left', {
        name: 'gamma',
        timestamp: '2026-04-05T00:00:02.000Z',
      }),
    ).toEqual({
      type: 'member_left',
      name: 'gamma',
      timestamp: '2026-04-05T00:00:02.000Z',
    })

    expect(normalizeChatEvent('unknown', {})).toBeNull()
  })

  it('connects and stores the websocket', async () => {
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onEvent: vi.fn(),
    })

    const connectPromise = client.connect('alpha', 'project-1')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    expect(state.wsConnection).toBe(MockWebSocket.instances[0])
    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://localhost:3000/ws?name=alpha&project_id=project-1',
    )
  })

  it('rejects failed websocket connections', async () => {
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state: createConnectorSessionState(),
      logger: console,
      onEvent: vi.fn(),
    })

    const connectPromise = client.connect('alpha', 'project-1')
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
      onEvent: vi.fn(),
    })

    const connectPromise = client.connect('alpha', 'project-1')
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
      onEvent: vi.fn(),
    })

    const connectPromise = client.connect('alpha', 'project-1')
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
      onEvent: vi.fn(),
    })

    await expect(
      client.sendRpcRequest(1, { jsonrpc: '2.0', id: 1, method: 'ping' }),
    ).rejects.toThrow('WebSocket not connected')

    const connectPromise = client.connect('alpha', 'project-1')
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

  it('dispatches normalized chat events and clears pending requests on close', async () => {
    const onEvent = vi.fn()
    const onClose = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onEvent,
      onClose,
    })

    const connectPromise = client.connect('alpha', 'project-1')
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
      params: {
        sender: 'beta',
        sender_role: 'backend agent',
        text: 'hello',
        mentions: ['alpha'],
        timestamp: '2026-04-05T00:00:00.000Z',
      },
    })
    MockWebSocket.instances[0]?.close()

    expect(onEvent).toHaveBeenCalledWith({
      type: 'message',
      sender: 'beta',
      sender_role: 'backend agent',
      text: 'hello',
      mentions: ['alpha'],
      timestamp: '2026-04-05T00:00:00.000Z',
    })
    expect(onClose).toHaveBeenCalledWith(
      new Error('WebSocket connection closed'),
    )
    await expect(requestPromise).rejects.toThrow('WebSocket connection closed')
    expect(state.wsConnection).toBeNull()
  })

  it('ignores websocket responses without a pending request and unknown notification payloads', async () => {
    const onEvent = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state,
      logger: console,
      onEvent,
    })

    const connectPromise = client.connect('alpha', 'project-1')
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
      MockWebSocket.instances[0]?.emitMessage({
        jsonrpc: '2.0',
        method: 'unknown',
        params: {},
      })
      client.close()
    }).not.toThrow()

    expect(onEvent).not.toHaveBeenCalled()
    expect(state.pendingRequests.size).toBe(0)
  })

  it('logs malformed websocket payloads', async () => {
    const logger = { error: vi.fn() }
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state: createConnectorSessionState(),
      logger,
      onEvent: vi.fn(),
    })

    const connectPromise = client.connect('alpha', 'project-1')
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    MockWebSocket.instances[0]?.emitMessage('{bad json')

    expect(logger.error).toHaveBeenCalledWith(
      '[connector] Failed to parse WS message:',
      expect.anything(),
    )
  })

  it('closes safely when no websocket has been connected yet', () => {
    const client = createChatroomWebSocketClient({
      WebSocketImpl: MockWebSocket,
      wsUrl: 'ws://localhost:3000',
      state: createConnectorSessionState(),
      logger: console,
      onEvent: vi.fn(),
    })

    expect(() => client.close()).not.toThrow()
  })
})
