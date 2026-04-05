#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createChatroomApi } from './chatroom-api.js'
import {
  createChatroomWebSocketClient,
  type ConnectorSocketConstructor,
} from './chatroom-ws.js'
import { getServerUrl, getWsUrl } from './config.js'
import { createMcpServer } from './mcp-server.js'
import { forwardServerNotification } from './notification-forwarder.js'
import { createConnectorSessionState } from './session-state.js'
import { createToolHandlers } from './tool-handlers.js'

const serverUrl = getServerUrl(process.env)
const wsUrl = getWsUrl(serverUrl)
const state = createConnectorSessionState()
const api = createChatroomApi({ fetchImpl: fetch, serverUrl })

let mcp!: ReturnType<typeof createMcpServer>

const wsClient = createChatroomWebSocketClient({
  WebSocketImpl: WebSocket as unknown as ConnectorSocketConstructor,
  wsUrl,
  state,
  logger: console,
  onNotification: (method, params) =>
    forwardServerNotification(
      {
        notify: (notification) => mcp.notification(notification),
        logger: console,
      },
      method,
      params,
    ),
})

const handlers = createToolHandlers({
  api,
  wsClient,
  state,
})

mcp = createMcpServer(handlers)

await mcp.connect(new StdioServerTransport())
console.error('[connector] MCP channel server started')
