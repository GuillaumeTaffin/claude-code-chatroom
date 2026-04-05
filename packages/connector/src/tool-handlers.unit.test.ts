import { describe, expect, it, vi } from 'vitest'
import { createConnectorSessionState } from './session-state.js'
import { createToolHandlers, formatMemberList } from './tool-handlers.js'

describe('tool handlers', () => {
  it('formats member lists for MCP output', () => {
    expect(
      formatMemberList([
        { name: 'alpha', description: 'frontend agent' },
        { name: 'beta', description: 'backend agent' },
      ]),
    ).toBe('- alpha: frontend agent\n- beta: backend agent')
  })

  it('returns already connected when a session exists', async () => {
    const state = createConnectorSessionState()
    state.setIdentity('alpha', 'general')

    const handlers = createToolHandlers({
      api: {
        connect: vi.fn(),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn(),
      },
      state,
    })

    await expect(
      handlers.connectChat({ name: 'beta', description: 'backend agent' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Already connected as "alpha"' }],
    })
  })

  it('connects successfully and stores session identity', async () => {
    const state = createConnectorSessionState()
    const handlers = createToolHandlers({
      api: {
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn().mockResolvedValue(undefined),
        sendRpcRequest: vi.fn(),
      },
      state,
    })

    const result = await handlers.connectChat({
      name: 'alpha',
      description: 'frontend agent',
    })

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected to chatroom as "alpha" (channel_id: general)',
        },
      ],
    })
    expect(state.connectedName).toBe('alpha')
    expect(state.channelId).toBe('general')
  })

  it('returns connection errors', async () => {
    const state = createConnectorSessionState()
    const handlers = createToolHandlers({
      api: {
        connect: vi.fn().mockRejectedValue(new Error('connect failed')),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn(),
      },
      state,
    })

    await expect(
      handlers.connectChat({ name: 'alpha', description: 'frontend agent' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Connection error: connect failed' }],
      isError: true,
    })
    expect(state.connectedName).toBeNull()
  })

  it('validates send_message preconditions and failures', async () => {
    const state = createConnectorSessionState()
    const handlers = createToolHandlers({
      api: {
        connect: vi.fn(),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn().mockRejectedValue(new Error('socket failed')),
      },
      state,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [
        { type: 'text', text: 'Not connected. Call connect_chat first.' },
      ],
      isError: true,
    })

    state.setIdentity('alpha', 'general')
    state.setWsConnection({ send: vi.fn() })

    await expect(
      handlers.sendMessage({ channel_id: 'random', text: 'hello' }),
    ).resolves.toEqual({
      content: [
        { type: 'text', text: 'Invalid channel_id. Expected "general".' },
      ],
      isError: true,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Send failed: socket failed' }],
      isError: true,
    })
  })

  it('sends messages successfully with default mentions', async () => {
    const state = createConnectorSessionState()
    state.setIdentity('alpha', 'general')
    state.setWsConnection({ send: vi.fn() })
    const sendRpcRequest = vi.fn().mockResolvedValue({ ok: true })

    const handlers = createToolHandlers({
      api: {
        connect: vi.fn(),
        listMembers: vi.fn(),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest,
      },
      state,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Message sent.' }],
    })

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
  })

  it('lists members for empty, populated, and failed responses', async () => {
    const handlers = createToolHandlers({
      api: {
        connect: vi.fn(),
        listMembers: vi
          .fn()
          .mockResolvedValueOnce({ members: [] })
          .mockResolvedValueOnce({
            members: [
              {
                name: 'alpha',
                description: 'frontend agent',
                channel_id: 'general',
              },
            ],
          })
          .mockRejectedValueOnce(new Error('members failed')),
      },
      wsClient: {
        connect: vi.fn(),
        sendRpcRequest: vi.fn(),
      },
      state: createConnectorSessionState(),
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [{ type: 'text', text: 'No members connected.' }],
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected members:\n- alpha: frontend agent',
        },
      ],
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [{ type: 'text', text: 'Error: members failed' }],
      isError: true,
    })
  })
})
