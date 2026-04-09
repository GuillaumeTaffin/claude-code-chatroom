import { describe, expect, it, vi } from 'vitest'
import { createChatroomTools } from './chatroom-tools.js'

vi.mock('@chatroom/connector-core', () => ({
  createChatroomClient: vi.fn(),
}))

import { createChatroomClient } from '@chatroom/connector-core'

const mockCreateChatroomClient = vi.mocked(createChatroomClient)

describe('createChatroomTools', () => {
  it('creates a client with correct config', () => {
    const mockClient = {
      connect: vi.fn(),
      close: vi.fn(),
    }
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    expect(mockCreateChatroomClient).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { CHATROOM_URL: 'http://localhost:3000' },
      }),
    )
    expect(tools.client).toBe(mockClient)
  })

  it('connect() calls client.connect with correct params and returns channelId', async () => {
    const mockClient = {
      connect: vi.fn().mockResolvedValue({
        project_id: 'project-1',
        channel_id: 'channel-1',
      }),
      close: vi.fn(),
    }
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const result = await tools.connect()

    expect(result).toEqual({ channelId: 'channel-1' })
    expect(mockClient.connect).toHaveBeenCalledWith(
      'test-agent',
      'A test agent',
      'project-1',
      'run-1',
      {
        runtime_id: 'claude',
        runtime_version: null,
        capabilities: {
          can_stream_events: false,
          can_use_tools: true,
          can_manage_files: true,
          can_execute_commands: true,
        },
      },
    )
  })

  it('close() calls client.close()', () => {
    const mockClient = {
      connect: vi.fn(),
      close: vi.fn(),
    }
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    tools.close()

    expect(mockClient.close).toHaveBeenCalled()
  })
})
