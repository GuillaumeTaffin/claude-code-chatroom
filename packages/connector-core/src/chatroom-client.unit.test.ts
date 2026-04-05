import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatroomClient } from './chatroom-client.js'
import { createConnectorSessionState } from './session-state.js'
import type { ConnectorSocket } from './chatroom-ws.js'

class MockWebSocket implements ConnectorSocket {
  static instances: MockWebSocket[] = []

  onopen: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  send(): void {}

  close(): void {
    this.onclose?.({})
  }

  emitOpen() {
    this.onopen?.({})
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
  }
}

describe('chatroom client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    MockWebSocket.instances = []
  })

  it('connects successfully and tracks state', async () => {
    const state = createConnectorSessionState()
    const eventBuffer = {
      clear: vi.fn(),
      cancelPendingWait: vi.fn(),
      waitForEvents: vi.fn(),
      push: vi.fn(),
      size: 0,
      hasPendingWait: false,
    }
    const client = createChatroomClient({
      api: {
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
        sendRpcRequest: vi.fn(),
        close: vi.fn(),
      },
      eventBuffer,
      state,
    })

    await expect(client.connect('alpha', 'frontend agent')).resolves.toEqual({
      channel_id: 'general',
    })

    expect(client.connectedName).toBe('alpha')
    expect(client.channelId).toBe('general')
    expect(client.isConnected).toBe(true)
    expect(eventBuffer.clear).toHaveBeenCalled()
  })

  it('clears state on connect failures and rejects duplicate connects', async () => {
    const close = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomClient({
      api: {
        connect: vi.fn().mockRejectedValue(new Error('connect failed')),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn(),
        close,
      },
      eventBuffer: {
        clear: vi.fn(),
        cancelPendingWait: vi.fn(),
        waitForEvents: vi.fn(),
        push: vi.fn(),
        size: 0,
        hasPendingWait: false,
      },
      state,
    })

    await expect(client.connect('alpha', 'frontend agent')).rejects.toThrow(
      'connect failed',
    )
    expect(close).toHaveBeenCalled()

    const duplicateClient = createChatroomClient({
      state: createConnectorSessionState(),
      api: {
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => undefined),
        sendRpcRequest: vi.fn(),
        close: vi.fn(),
      },
      eventBuffer: {
        clear: vi.fn(),
        cancelPendingWait: vi.fn(),
        waitForEvents: vi.fn(),
        push: vi.fn(),
        size: 0,
        hasPendingWait: false,
      },
    })

    await duplicateClient.connect('alpha', 'frontend agent')
    await expect(
      duplicateClient.connect('beta', 'backend agent'),
    ).rejects.toThrow('Already connected as "alpha"')
  })

  it('sends messages, lists members, waits for events, and closes the session', async () => {
    const sendRpcRequest = vi.fn().mockResolvedValue({ ok: true })
    const waitForEvents = vi.fn().mockResolvedValue({
      events: [],
      timedOut: true,
    })
    const cancelPendingWait = vi.fn()
    const clear = vi.fn()
    const state = createConnectorSessionState()
    const client = createChatroomClient({
      api: {
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        listMembers: vi.fn().mockResolvedValue({
          members: [
            {
              name: 'alpha',
              description: 'frontend agent',
              channel_id: 'general',
            },
          ],
        }),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn(), close: vi.fn() })
        }),
        sendRpcRequest,
        close: vi.fn(),
      },
      eventBuffer: {
        clear,
        cancelPendingWait,
        waitForEvents,
        push: vi.fn(),
        size: 0,
        hasPendingWait: false,
      },
      state,
    })

    await client.connect('alpha', 'frontend agent')

    await expect(
      client.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({ ok: true })
    expect(sendRpcRequest).toHaveBeenCalledWith(1, {
      jsonrpc: '2.0',
      id: 1,
      method: 'send_message',
      params: {
        channel_id: 'general',
        text: 'hello',
        mentions: [],
      },
    })

    await expect(client.listMembers()).resolves.toEqual({
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'general',
        },
      ],
    })

    await expect(client.waitForEvents({ timeoutMs: 0 })).resolves.toEqual({
      events: [],
      timedOut: true,
    })
    expect(waitForEvents).toHaveBeenCalledWith(
      { timeoutMs: 0 },
      { connectedName: 'alpha' },
    )

    client.close()
    expect(cancelPendingWait).toHaveBeenCalledWith(
      new Error('WebSocket connection closed'),
    )
    expect(clear).toHaveBeenCalled()
  })

  it('validates sendMessage and waitForEvents preconditions', async () => {
    const client = createChatroomClient({
      state: createConnectorSessionState(),
      api: {
        connect: vi.fn(),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn(),
        close: vi.fn(),
      },
      eventBuffer: {
        clear: vi.fn(),
        cancelPendingWait: vi.fn(),
        waitForEvents: vi.fn(),
        push: vi.fn(),
        size: 0,
        hasPendingWait: false,
      },
    })

    await expect(
      client.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).rejects.toThrow('Not connected. Call connect_chat first.')

    await expect(client.waitForEvents()).rejects.toThrow(
      'Not connected. Call connect_chat first.',
    )
  })

  it('validates channel ids and wires default websocket callbacks into the event buffer', async () => {
    const eventBuffer = {
      clear: vi.fn(),
      cancelPendingWait: vi.fn(),
      waitForEvents: vi.fn(),
      push: vi.fn(),
      size: 0,
      hasPendingWait: false,
    }
    const client = createChatroomClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ channel_id: 'general' }),
      } as Response),
      WebSocketImpl: MockWebSocket,
      eventBuffer,
      logger: { error: vi.fn(), warn: vi.fn() },
    })

    const connectPromise = client.connect('alpha', 'frontend agent')
    while (MockWebSocket.instances.length === 0) {
      await Promise.resolve()
    }
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    await expect(
      client.sendMessage({ channel_id: 'random', text: 'hello' }),
    ).rejects.toThrow('Invalid channel_id. Expected "general".')

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
    expect(eventBuffer.push).toHaveBeenCalledWith({
      type: 'message',
      sender: 'beta',
      sender_role: 'backend agent',
      text: 'hello',
      mentions: ['alpha'],
      timestamp: '2026-04-05T00:00:00.000Z',
    })

    MockWebSocket.instances[0]?.close()
    expect(eventBuffer.cancelPendingWait).toHaveBeenCalledWith(
      new Error('WebSocket connection closed'),
    )
  })
})
