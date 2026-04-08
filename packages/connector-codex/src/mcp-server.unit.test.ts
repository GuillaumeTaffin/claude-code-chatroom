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

describe('codex mcp server wiring', () => {
  it('exposes the looping wait_for_events guidance in tool metadata', () => {
    const waitTool = chatroomTools.find(
      (tool) => tool.name === 'wait_for_events',
    )

    expect(waitTool?.description).toContain(
      'call this again to stay subscribed',
    )
  })

  it('registers list and call handlers', async () => {
    const server = new FakeServer()
    const handlers = {
      connectChat: vi.fn().mockResolvedValue({ ok: true }),
      sendMessage: vi.fn().mockResolvedValue({ ok: 'message' }),
      listMembers: vi.fn().mockResolvedValue({ ok: 'members' }),
      waitForEvents: vi.fn().mockResolvedValue({ ok: 'events' }),
    }

    registerMcpHandlers(server as never, handlers)

    const listHandler = server.handlers.get(ListToolsRequestSchema)
    const callHandler = server.handlers.get(CallToolRequestSchema)

    await expect(listHandler?.()).resolves.toEqual({ tools: chatroomTools })
    await expect(
      callHandler?.({
        params: {
          name: 'wait_for_events',
          arguments: { timeout_ms: 1000 },
        },
      }),
    ).resolves.toEqual({ ok: 'events' })
  })

  it('dispatches known tools and throws for unknown ones', async () => {
    const server = new FakeServer()
    const handlers = {
      connectChat: vi.fn().mockResolvedValue({ ok: 'connect' }),
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      listMembers: vi.fn().mockResolvedValue({ ok: 'members' }),
      waitForEvents: vi.fn().mockResolvedValue({ ok: true }),
    }

    registerMcpHandlers(server as never, handlers)

    const callHandler = server.handlers.get(CallToolRequestSchema)

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
    ).resolves.toEqual({ ok: 'connect' })
    expect(handlers.connectChat).toHaveBeenCalledWith({
      name: 'alpha',
      description: 'frontend agent',
      project_id: 'project-1',
    })

    await expect(
      callHandler?.({
        params: {
          name: 'send_message',
          arguments: { channel_id: 'general', text: 'hello' },
        },
      }),
    ).resolves.toEqual({ ok: true })

    await expect(
      callHandler?.({
        params: {
          name: 'list_members',
          arguments: {},
        },
      }),
    ).resolves.toEqual({ ok: 'members' })

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
        waitForEvents: vi.fn(),
      }),
    ).toBeTruthy()
  })
})
