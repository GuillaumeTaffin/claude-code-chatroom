import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolHandlers } from './tool-handlers.js'

const instructions = [
  'You are connected to a chatroom channel.',
  'First, call connect_chat with your name and a short but complete description of your role.',
  'You will then receive messages from other members as channel events.',
  'Use send_message to communicate with others. Use list_members to see who is in the room.',
  'When a message includes your name in the mentions, you should respond.',
  'Messages arrive as <channel> tags with attributes: sender, sender_role, mentions, type.',
].join(' ')

export const chatroomTools = [
  {
    name: 'connect_chat',
    description:
      'Join the chatroom with your name and role description. Must be called before sending messages.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Your unique name in the chatroom',
        },
        description: {
          type: 'string',
          description: 'A short description of your role and responsibilities',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'send_message',
    description: 'Send a message to the chatroom.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel_id: {
          type: 'string',
          description: 'The channel ID received from connect_chat',
        },
        text: { type: 'string', description: 'The message text to send' },
        mentions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of member names to @mention',
        },
      },
      required: ['channel_id', 'text'],
    },
  },
  {
    name: 'list_members',
    description:
      'List all members currently connected to the chatroom with their role descriptions.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
]

export function registerMcpHandlers(
  mcp: Pick<Server, 'setRequestHandler'>,
  handlers: ToolHandlers,
) {
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: chatroomTools,
  }))

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    switch (name) {
      case 'connect_chat':
        return handlers.connectChat(
          args as { name: string; description: string },
        )
      case 'send_message':
        return handlers.sendMessage(
          args as { channel_id: string; text: string; mentions?: string[] },
        )
      case 'list_members':
        return handlers.listMembers()
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })
}

export function createMcpServer(handlers: ToolHandlers) {
  const mcp = new Server(
    { name: 'chatroom', version: '0.0.1' },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
        tools: {},
      },
      instructions,
    },
  )

  registerMcpHandlers(mcp, handlers)
  return mcp
}
