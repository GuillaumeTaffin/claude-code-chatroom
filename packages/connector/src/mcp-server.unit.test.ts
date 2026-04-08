import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  chatroomTools,
  createMcpServer,
  registerMcpHandlers,
} from './mcp-server.js'

type FakeRequestHandler = (request?: {
  params: {
    name: string
    arguments: unknown
  }
}) => Promise<unknown>

class FakeServer {
  handlers = new Map<unknown, FakeRequestHandler>()

  setRequestHandler(schema: unknown, handler: FakeRequestHandler) {
    this.handlers.set(schema, handler)
  }
}

describe('mcp server wiring', () => {
  it('registers list and call handlers', async () => {
    const server = new FakeServer()
    const handlers = {
      connectChat: vi.fn().mockResolvedValue({ ok: true }),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      listMembers: vi.fn().mockResolvedValue({ ok: true }),
    }

    registerMcpHandlers(server as never, handlers)

    const listHandler = server.handlers.get(ListToolsRequestSchema)
    const callHandler = server.handlers.get(CallToolRequestSchema)

    await expect(listHandler?.()).resolves.toEqual({ tools: chatroomTools })
    await expect(
      callHandler?.({
        params: {
          name: 'connect_chat',
          arguments: {
            name: 'alpha',
            description: 'frontend agent',
            project_id: 'project-1',
          },
        },
      }),
    ).resolves.toEqual({ ok: true })
    expect(handlers.connectChat).toHaveBeenCalledWith({
      name: 'alpha',
      description: 'frontend agent',
      project_id: 'project-1',
    })
  })

  it('passes run_id to connect_chat when provided', async () => {
    const server = new FakeServer()
    const handlers = {
      connectChat: vi.fn().mockResolvedValue({ ok: true }),
      sendMessage: vi.fn(),
      listMembers: vi.fn(),
    }

    registerMcpHandlers(server as never, handlers)

    const callHandler = server.handlers.get(CallToolRequestSchema)

    await callHandler?.({
      params: {
        name: 'connect_chat',
        arguments: {
          name: 'alpha',
          description: 'frontend agent',
          project_id: 'project-1',
          run_id: 'run-1',
        },
      },
    })
    expect(handlers.connectChat).toHaveBeenCalledWith({
      name: 'alpha',
      description: 'frontend agent',
      project_id: 'project-1',
      run_id: 'run-1',
    })
  })

  it('dispatches send_message and list_members calls', async () => {
    const server = new FakeServer()
    const handlers = {
      connectChat: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue({ ok: 'message' }),
      listMembers: vi.fn().mockResolvedValue({ ok: 'members' }),
    }

    registerMcpHandlers(server as never, handlers)

    const callHandler = server.handlers.get(CallToolRequestSchema)

    await expect(
      callHandler?.({
        params: {
          name: 'send_message',
          arguments: { channel_id: 'general', text: 'hello' },
        },
      }),
    ).resolves.toEqual({ ok: 'message' })

    await expect(
      callHandler?.({
        params: {
          name: 'list_members',
          arguments: {},
        },
      }),
    ).resolves.toEqual({ ok: 'members' })
  })

  it('throws for unknown tools and can create the real server', async () => {
    const server = new FakeServer()

    registerMcpHandlers(server as never, {
      connectChat: vi.fn(),
      sendMessage: vi.fn(),
      listMembers: vi.fn(),
    })

    const callHandler = server.handlers.get(CallToolRequestSchema)
    await expect(
      callHandler?.({
        params: {
          name: 'missing',
          arguments: {},
        },
      }),
    ).rejects.toThrow('Unknown tool: missing')

    expect(
      createMcpServer({
        connectChat: vi.fn(),
        sendMessage: vi.fn(),
        listMembers: vi.fn(),
      }),
    ).toBeTruthy()
  })
})
