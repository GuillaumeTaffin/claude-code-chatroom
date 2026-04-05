import { describe, expect, it, vi } from 'vitest'
import { createToolHandlers } from './tool-handlers.js'

describe('codex tool handlers', () => {
  it('connects, sends messages, and lists members', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect: vi.fn().mockResolvedValue({ channel_id: 'general' }),
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        listMembers: vi.fn().mockResolvedValue({
          members: [
            {
              name: 'alpha',
              description: 'frontend agent',
              channel_id: 'general',
            },
          ],
        }),
        waitForEvents: vi.fn(),
      } as never,
    })

    await expect(
      handlers.connectChat({ name: 'alpha', description: 'frontend agent' }),
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected to chatroom as "alpha" (channel_id: general)',
        },
      ],
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Message sent.' }],
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected members:\n- alpha: frontend agent',
        },
      ],
    })
  })

  it('returns already connected and connection errors', async () => {
    const alreadyConnectedHandlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
        waitForEvents: vi.fn(),
      } as never,
    })

    await expect(
      alreadyConnectedHandlers.connectChat({
        name: 'beta',
        description: 'backend agent',
      }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Already connected as "alpha"' }],
    })

    const failingHandlers = createToolHandlers({
      client: {
        connectedName: null,
        connect: vi.fn().mockRejectedValue(new Error('connect failed')),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
        waitForEvents: vi.fn(),
      } as never,
    })

    await expect(
      failingHandlers.connectChat({
        name: 'alpha',
        description: 'frontend agent',
      }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Connection error: connect failed' }],
      isError: true,
    })
  })

  it('returns wait_for_events results and errors', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
        waitForEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [],
            timedOut: true,
          })
          .mockRejectedValueOnce(
            new Error('Not connected. Call connect_chat first.'),
          ),
      } as never,
    })

    await expect(
      handlers.waitForEvents({ timeout_ms: 30_000 }),
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'No matching events arrived within 30000ms. If you are still participating in the chatroom, call wait_for_events again.\n{"timed_out":true,"events":[]}',
        },
      ],
    })

    await expect(handlers.waitForEvents({})).resolves.toEqual({
      content: [
        { type: 'text', text: 'Not connected. Call connect_chat first.' },
      ],
      isError: true,
    })
  })

  it('returns send and member-list failures, plus the empty member case', async () => {
    const handlers = createToolHandlers({
      client: {
        connectedName: 'alpha',
        connect: vi.fn(),
        sendMessage: vi.fn().mockRejectedValue(new Error('socket failed')),
        listMembers: vi
          .fn()
          .mockResolvedValueOnce({ members: [] })
          .mockRejectedValueOnce(new Error('members failed')),
        waitForEvents: vi.fn(),
      } as never,
    })

    await expect(
      handlers.sendMessage({ channel_id: 'general', text: 'hello' }),
    ).resolves.toEqual({
      content: [{ type: 'text', text: 'Send failed: socket failed' }],
      isError: true,
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [{ type: 'text', text: 'No members connected.' }],
    })

    await expect(handlers.listMembers()).resolves.toEqual({
      content: [{ type: 'text', text: 'Error: members failed' }],
      isError: true,
    })
  })
})
