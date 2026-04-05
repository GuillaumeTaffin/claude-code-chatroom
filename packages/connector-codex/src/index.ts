#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  createChatroomClient,
  type ConnectorSocketConstructor,
} from '@chatroom/connector-core'
import { createMcpServer } from './mcp-server.js'
import { createToolHandlers } from './tool-handlers.js'

const client = createChatroomClient({
  env: process.env,
  fetchImpl: fetch,
  WebSocketImpl: WebSocket as unknown as ConnectorSocketConstructor,
  logger: console,
})
const handlers = createToolHandlers({ client })
const mcp = createMcpServer(handlers)

await mcp.connect(new StdioServerTransport())
console.error('[connector-codex] MCP server started')
