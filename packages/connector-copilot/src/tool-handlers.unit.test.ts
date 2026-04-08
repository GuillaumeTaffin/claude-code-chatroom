import type { RuntimeIdentity } from '@chatroom/shared'
import { describe, expect, it, vi } from 'vitest'
import { createToolHandlers } from './tool-handlers.js'

const COPILOT_RUNTIME: RuntimeIdentity = {
  runtime_id: 'copilot',
  runtime_version: null,
  capabilities: {
    can_stream_events: false,
    can_use_tools: true,
    can_manage_files: true,
    can_execute_commands: true,
  },
}

describe('copilot tool handlers', () => {
  it('connects, sends messages, and lists members', async () => {
    const connect = vi
      .fn()
      .mockResolvedValue({ project_id: 'project-1', channel_id: 'project-1' })
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect,
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
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
        waitForEvents: vi.fn(),
      } as never,
    })

    await expect(
      handlers.connectChat({
        name: 'alpha',
        description: 'frontend agent',
        project_id: 'project-1',
      }),
    ).resolves.toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected to project "project-1" as "alpha" (channel_id: project-1)',
        },
      ],
    })
    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'frontend agent',
      'project-1',
      undefined,
      COPILOT_RUNTIME,
    )

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

  it('connects with run_id when provided', async () => {
    const connect = vi.fn().mockResolvedValue({
      project_id: 'project-1',
      channel_id: 'run-channel-1',
      run_id: 'run-1',
    })
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect,
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
        waitForEvents: vi.fn(),
      } as never,
    })

    const result = await handlers.connectChat({
      name: 'alpha',
      description: 'frontend agent',
      project_id: 'project-1',
      run_id: 'run-1',
    })

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Connected to project "project-1" as "alpha" (channel_id: run-channel-1)',
        },
      ],
    })
    expect(connect).toHaveBeenCalledWith(
      'alpha',
      'frontend agent',
      'project-1',
      'run-1',
      COPILOT_RUNTIME,
    )
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
