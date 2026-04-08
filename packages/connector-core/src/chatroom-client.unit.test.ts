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
        connect: vi.fn().mockResolvedValue({
          project_id: 'project-1',
          channel_id: 'project-1',
        }),
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

    await expect(
      client.connect('alpha', 'frontend agent', 'project-1'),
    ).resolves.toEqual({
      project_id: 'project-1',
      channel_id: 'project-1',
    })

    expect(client.connectedName).toBe('alpha')
    expect(client.projectId).toBe('project-1')
    expect(client.channelId).toBe('project-1')
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

    await expect(
      client.connect('alpha', 'frontend agent', 'project-1'),
    ).rejects.toThrow('connect failed')
    expect(close).toHaveBeenCalled()

    const duplicateClient = createChatroomClient({
      state: createConnectorSessionState(),
      api: {
        connect: vi.fn().mockResolvedValue({
          project_id: 'project-1',
          channel_id: 'project-1',
        }),
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

    await duplicateClient.connect('alpha', 'frontend agent', 'project-1')
    await expect(
      duplicateClient.connect('beta', 'backend agent', 'project-2'),
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
        connect: vi.fn().mockResolvedValue({
          project_id: 'project-1',
          channel_id: 'project-1',
        }),
        listMembers: vi.fn().mockResolvedValue({
          project_id: 'project-1',
          members: [
            {
              name: 'alpha',
              description: 'frontend agent',
              channel_id: 'project-1',
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

    await client.connect('alpha', 'frontend agent', 'project-1')

    await expect(
      client.sendMessage({ channel_id: 'project-1', text: 'hello' }),
    ).resolves.toEqual({ ok: true })
    expect(sendRpcRequest).toHaveBeenCalledWith(1, {
      jsonrpc: '2.0',
      id: 1,
      method: 'send_message',
      params: {
        channel_id: 'project-1',
        text: 'hello',
        mentions: [],
      },
    })

    await expect(client.listMembers()).resolves.toEqual({
      project_id: 'project-1',
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'project-1',
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

    await expect(client.listMembers()).rejects.toThrow(
      'Not connected. Call connect_chat first.',
    )

    await expect(client.waitForEvents()).rejects.toThrow(
      'Not connected. Call connect_chat first.',
    )
  })

  it('validates project-aware channel ids and wires default websocket callbacks into the event buffer', async () => {
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
        json: async () => ({
          project_id: 'project-1',
          channel_id: 'project-1',
        }),
      } as Response),
      WebSocketImpl: MockWebSocket,
      eventBuffer,
      logger: { error: vi.fn(), warn: vi.fn() },
    })

    const connectPromise = client.connect(
      'alpha',
      'frontend agent',
      'project-1',
    )
    while (MockWebSocket.instances.length === 0) {
      await Promise.resolve()
    }
    MockWebSocket.instances[0]?.emitOpen()
    await connectPromise

    await expect(
      client.sendMessage({ channel_id: 'random', text: 'hello' }),
    ).rejects.toThrow('Invalid channel_id. Expected "project-1".')

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

  it('uses CHATROOM_PROJECT_ID when connect_chat does not pass one', async () => {
    const state = createConnectorSessionState()
    const connect = vi
      .fn()
      .mockResolvedValue({ project_id: 'project-9', channel_id: 'project-9' })
    const client = createChatroomClient({
      env: { CHATROOM_PROJECT_ID: 'project-9' } as NodeJS.ProcessEnv,
      api: {
        connect,
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
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
      state,
    })

    await client.connect('alpha', 'frontend agent')

    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'frontend agent',
      'project-9',
      undefined,
      undefined,
    )
    expect(client.projectId).toBe('project-9')
  })

  it('connects with run_id and tracks it in state', async () => {
    const state = createConnectorSessionState()
    const connect = vi.fn().mockResolvedValue({
      project_id: 'project-1',
      channel_id: 'run-channel-1',
      run_id: 'run-1',
    })
    const client = createChatroomClient({
      api: {
        connect,
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
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
      state,
    })

    await expect(
      client.connect('alpha', 'frontend agent', 'project-1', 'run-1'),
    ).resolves.toEqual({
      project_id: 'project-1',
      channel_id: 'run-channel-1',
      run_id: 'run-1',
    })

    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'frontend agent',
      'project-1',
      'run-1',
      undefined,
    )
    expect(client.runId).toBe('run-1')
    expect(client.channelId).toBe('run-channel-1')
  })

  it('uses CHATROOM_RUN_ID when connect_chat does not pass one', async () => {
    const state = createConnectorSessionState()
    const connect = vi.fn().mockResolvedValue({
      project_id: 'project-1',
      channel_id: 'run-channel-1',
      run_id: 'run-9',
    })
    const client = createChatroomClient({
      env: {
        CHATROOM_PROJECT_ID: 'project-1',
        CHATROOM_RUN_ID: 'run-9',
      } as NodeJS.ProcessEnv,
      api: {
        connect,
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
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
      state,
    })

    await client.connect('alpha', 'frontend agent')

    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'frontend agent',
      'project-1',
      'run-9',
      undefined,
    )
    expect(client.runId).toBe('run-9')
  })

  it('does not set runId when connecting without run context', async () => {
    const state = createConnectorSessionState()
    const client = createChatroomClient({
      api: {
        connect: vi.fn().mockResolvedValue({
          project_id: 'project-1',
          channel_id: 'project-1',
        }),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
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
      state,
    })

    await client.connect('alpha', 'frontend agent', 'project-1')

    expect(client.runId).toBeNull()
  })

  it('passes runtime identity through to api.connect', async () => {
    const state = createConnectorSessionState()
    const runtime = {
      runtime_id: 'claude',
      runtime_version: null,
      capabilities: {
        can_stream_events: true,
        can_use_tools: true,
        can_manage_files: true,
        can_execute_commands: true,
      },
    }
    const connect = vi.fn().mockResolvedValue({
      project_id: 'project-1',
      channel_id: 'project-1',
    })
    const client = createChatroomClient({
      api: {
        connect,
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockImplementation(async () => {
          state.setWsConnection({ send: vi.fn() })
        }),
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
      state,
    })

    await client.connect(
      'alpha',
      'claude agent',
      'project-1',
      undefined,
      runtime,
    )

    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'claude agent',
      'project-1',
      undefined,
      runtime,
    )
  })

  it('requires a project id when none is configured', async () => {
    const client = createChatroomClient({
      env: {} as NodeJS.ProcessEnv,
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
      state: createConnectorSessionState(),
    })

    await expect(client.connect('alpha', 'frontend agent')).rejects.toThrow(
      'Project ID is required. Pass project_id to connect_chat or set CHATROOM_PROJECT_ID.',
    )
  })
})
