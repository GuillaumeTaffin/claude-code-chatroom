#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  createChatroomClient,
  type ConnectorSocketConstructor,
} from '@chatroom/connector-core'
import { createMcpServer } from './mcp-server.js'
import { forwardServerNotification } from './notification-forwarder.js'
import { createToolHandlers } from './tool-handlers.js'

let mcp!: ReturnType<typeof createMcpServer>
const client = createChatroomClient({
  env: process.env,
  fetchImpl: fetch,
  WebSocketImpl: WebSocket as unknown as ConnectorSocketConstructor,
  logger: console,
})
const handlers = createToolHandlers({ client })

mcp = createMcpServer(handlers)

const originalConnect = client.connect.bind(client)
client.connect = async (name, description, projectId) => {
  const channel = await originalConnect(name, description, projectId)
  const waitForEvents = async () => {
    while (client.isConnected) {
      try {
        const result = await client.waitForEvents({
          timeoutMs: 55_000,
          maxEvents: 100,
        })

        if (result.timedOut) {
          continue
        }

        for (const event of result.events) {
          await forwardServerNotification(
            {
              notify: (notification) => mcp.notification(notification),
              logger: console,
            },
            event,
          )
        }
      } catch (error) {
        if ((error as Error).message === 'WebSocket connection closed') {
          break
        }

        console.error('[connector] Failed to forward notification:', error)
        break
      }
    }
  }

  void waitForEvents()
  return channel
}

await mcp.connect(new StdioServerTransport())
console.error('[connector] MCP channel server started')
