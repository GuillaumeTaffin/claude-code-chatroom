import type { RuntimeIdentity } from '@chatroom/shared'
import { describe, expect, it, vi } from 'vitest'
import { createToolHandlers, formatMemberList } from './tool-handlers.js'

const CLAUDE_RUNTIME: RuntimeIdentity = {
  runtime_id: 'claude',
  runtime_version: null,
  capabilities: {
    can_stream_events: true,
    can_use_tools: true,
    can_manage_files: true,
    can_execute_commands: true,
  },
}

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
    const connect = vi
      .fn()
      .mockResolvedValue({ project_id: 'project-1', channel_id: 'project-1' })
    const handlers = createToolHandlers({
      client: {
        connectedName: null,
        connect,
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
      } as never,
    })

    const result = await handlers.connectChat({
      name: 'alpha',
      description: 'frontend agent',
      project_id: 'project-1',
    })

    expect(result).toEqual({
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
      CLAUDE_RUNTIME,
    )
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
      CLAUDE_RUNTIME,
    )
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
                channel_id: 'project-1',
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
