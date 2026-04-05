import { describe, expect, it, vi } from 'vitest'
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
    const handlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
      } as never,
    })

    await expect(
      handlers.connectChat({ name: 'beta', description: 'backend agent' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Already connected as "alpha"' }],
    })
  })

  it('connects successfully', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
      } as never,
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
  })

  it('returns connection errors', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect: vi.fn().mockRejectedValue(new Error('connect failed')),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
      } as never,
    })

    await expect(
      handlers.connectChat({ name: 'alpha', description: 'frontend agent' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Connection error: connect failed' }],
      isError: true,
    })
  })

  it('returns send_message failures from the shared client', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage: vi.fn().mockRejectedValue(new Error('socket failed')),
        listMembers: vi.fn(),
      } as never,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Send failed: socket failed' }],
      isError: true,
    })
  })

  it('sends messages successfully', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })

    const handlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage,
        listMembers: vi.fn(),
      } as never,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Message sent.' }],
    })

    expect(sendMessage).toHaveBeenCalledWith({
      channel_id: 'general',
      text: 'hello',
    })
  })

  it('lists members for empty, populated, and failed responses', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect: vi.fn(),
        sendMessage: vi.fn(),
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
      } as never,
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
