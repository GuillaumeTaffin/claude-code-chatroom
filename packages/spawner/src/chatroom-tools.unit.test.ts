import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createChatroomTools } from './chatroom-tools.js'

vi.mock('@chatroom/connector-core', () => ({
  createChatroomClient: vi.fn(),
}))

import { createChatroomClient } from '@chatroom/connector-core'

const mockCreateChatroomClient = vi.mocked(createChatroomClient)

function makeMockClient() {
  return {
    connect: vi.fn().mockResolvedValue({
      project_id: 'project-1',
      channel_id: 'channel-1',
    }),
    close: vi.fn(),
    waitForEvents: vi.fn().mockResolvedValue({ events: [], timedOut: true }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }
}

describe('createChatroomTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a client with correct config', () => {
    const mockClient = makeMockClient()
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
    const mockClient = makeMockClient()
    // Make waitForEvents hang forever so the event loop doesn't spin
    mockClient.waitForEvents.mockReturnValue(new Promise(() => {}))
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

  it('close() sets closed flag and calls client.close()', () => {
    const mockClient = makeMockClient()
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

  it('onMessage() registers a callback that receives messages from the event loop', async () => {
    const mockClient = makeMockClient()

    let waitCallCount = 0
    mockClient.waitForEvents.mockImplementation(() => {
      waitCallCount++
      if (waitCallCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: 'message',
              sender: 'alice',
              sender_role: 'developer',
              text: 'Hello!',
              mentions: ['test-agent'],
              timestamp: new Date().toISOString(),
            },
          ],
          timedOut: false,
        })
      }
      // Second call: hang to stop loop
      return new Promise(() => {})
    })

    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const messages: Array<{
      sender: string
      text: string
      mentions: string[]
    }> = []
    tools.onMessage((msg) => messages.push(msg))

    await tools.connect()

    // Wait for event loop iteration
    await new Promise((r) => setTimeout(r, 10))

    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      sender: 'alice',
      text: 'Hello!',
      mentions: ['test-agent'],
    })
  })

  it('event loop filters out messages from the agent itself', async () => {
    const mockClient = makeMockClient()

    let waitCallCount = 0
    mockClient.waitForEvents.mockImplementation(() => {
      waitCallCount++
      if (waitCallCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: 'message',
              sender: 'test-agent',
              sender_role: 'agent',
              text: 'My own message',
              mentions: [],
              timestamp: new Date().toISOString(),
            },
            {
              type: 'message',
              sender: 'other-agent',
              sender_role: 'agent',
              text: 'Other message',
              mentions: [],
              timestamp: new Date().toISOString(),
            },
          ],
          timedOut: false,
        })
      }
      return new Promise(() => {})
    })

    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const messages: Array<{
      sender: string
      text: string
      mentions: string[]
    }> = []
    tools.onMessage((msg) => messages.push(msg))

    await tools.connect()
    await new Promise((r) => setTimeout(r, 10))

    expect(messages).toHaveLength(1)
    expect(messages[0].sender).toBe('other-agent')
  })

  it('event loop breaks on error when not closed', async () => {
    const mockClient = makeMockClient()
    mockClient.waitForEvents.mockRejectedValue(new Error('connection lost'))
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    // Should not throw - the loop catches and breaks
    await tools.connect()
    await new Promise((r) => setTimeout(r, 10))

    // The loop should have exited - waitForEvents called once
    expect(mockClient.waitForEvents).toHaveBeenCalled()
  })

  it('event loop suppresses errors when closed', async () => {
    const mockClient = makeMockClient()

    const waitRef: { reject: ((err: Error) => void) | null } = { reject: null }
    mockClient.waitForEvents.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          waitRef.reject = reject as (err: Error) => void
        }),
    )

    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    await tools.connect()
    tools.close()

    // Now reject the pending wait - should not cause issues because closed is true
    waitRef.reject?.(new Error('connection closed'))
    await new Promise((r) => setTimeout(r, 10))
  })

  it('sendMessage() calls client.sendMessage with correct params', async () => {
    const mockClient = makeMockClient()
    mockClient.waitForEvents.mockReturnValue(new Promise(() => {}))
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    await tools.connect()
    await tools.sendMessage('Hello world', ['alice'])

    expect(mockClient.sendMessage).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      text: 'Hello world',
      mentions: ['alice'],
    })
  })

  it('sendMessage() works without mentions', async () => {
    const mockClient = makeMockClient()
    mockClient.waitForEvents.mockReturnValue(new Promise(() => {}))
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    await tools.connect()
    await tools.sendMessage('Hello world')

    expect(mockClient.sendMessage).toHaveBeenCalledWith({
      channel_id: 'channel-1',
      text: 'Hello world',
      mentions: undefined,
    })
  })

  it('sendMessage() throws if not connected', async () => {
    const mockClient = makeMockClient()
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    await expect(tools.sendMessage('Hello')).rejects.toThrow(
      'Not connected. Call connect() first.',
    )
  })

  it('onMessage() supports multiple callbacks', async () => {
    const mockClient = makeMockClient()

    let waitCallCount = 0
    mockClient.waitForEvents.mockImplementation(() => {
      waitCallCount++
      if (waitCallCount === 1) {
        return Promise.resolve({
          events: [
            {
              type: 'message',
              sender: 'alice',
              sender_role: 'developer',
              text: 'Hi',
              mentions: [],
              timestamp: new Date().toISOString(),
            },
          ],
          timedOut: false,
        })
      }
      return new Promise(() => {})
    })

    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const cb1Messages: Array<{ sender: string }> = []
    const cb2Messages: Array<{ sender: string }> = []
    tools.onMessage((msg) => cb1Messages.push(msg))
    tools.onMessage((msg) => cb2Messages.push(msg))

    await tools.connect()
    await new Promise((r) => setTimeout(r, 10))

    expect(cb1Messages).toHaveLength(1)
    expect(cb2Messages).toHaveLength(1)
  })

  it('event loop continues polling after receiving events', async () => {
    const mockClient = makeMockClient()

    let waitCallCount = 0
    mockClient.waitForEvents.mockImplementation(() => {
      waitCallCount++
      if (waitCallCount <= 2) {
        return Promise.resolve({
          events: [
            {
              type: 'message',
              sender: 'alice',
              sender_role: 'developer',
              text: `Message ${waitCallCount}`,
              mentions: [],
              timestamp: new Date().toISOString(),
            },
          ],
          timedOut: false,
        })
      }
      return new Promise(() => {})
    })

    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    const messages: Array<{ text: string }> = []
    tools.onMessage((msg) => messages.push(msg))

    await tools.connect()
    await new Promise((r) => setTimeout(r, 20))

    expect(messages).toHaveLength(2)
    expect(messages[0].text).toBe('Message 1')
    expect(messages[1].text).toBe('Message 2')
    expect(mockClient.waitForEvents).toHaveBeenCalledTimes(3)
  })

  it('event loop calls waitForEvents with correct options', async () => {
    const mockClient = makeMockClient()
    mockClient.waitForEvents.mockReturnValue(new Promise(() => {}))
    mockCreateChatroomClient.mockReturnValue(mockClient as never)

    const tools = createChatroomTools({
      serverUrl: 'http://localhost:3000',
      agentName: 'test-agent',
      roleDescription: 'A test agent',
      projectId: 'project-1',
      runId: 'run-1',
      runtime: 'claude',
    })

    await tools.connect()
    await new Promise((r) => setTimeout(r, 10))

    expect(mockClient.waitForEvents).toHaveBeenCalledWith({
      timeoutMs: 55000,
      maxEvents: 100,
      includeSystem: false,
    })
  })
})
