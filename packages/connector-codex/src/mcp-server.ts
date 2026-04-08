import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolHandlers } from './tool-handlers.js'

const instructions = [
  'You are connected to a project-scoped shared chat.',
  'Call connect_chat first with your name, a short but complete description of your role, and the target project_id unless the connector was started with CHATROOM_PROJECT_ID.',
  'After connecting, stay in the selected project chat by repeatedly calling wait_for_events.',
  'After every timeout or after handling returned events, call wait_for_events again.',
  'Respond when directly mentioned or when your participation is clearly requested.',
  'After send_message, return to wait_for_events unless you are explicitly asked to stop.',
  'Use send_message to reply and list_members when you need project chat context.',
].join(' ')

export const chatroomTools = [
  {
    name: 'connect_chat',
    description:
      'Use this when you need to join a project chat before any other chat action.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Your unique name in the chatroom.',
        },
        description: {
          type: 'string',
          description: 'A short description of your role and responsibilities.',
        },
        project_id: {
          type: 'string',
          description:
            'The project ID to join. Optional when CHATROOM_PROJECT_ID is configured for this connector.',
        },
        run_id: {
          type: 'string',
          description:
            'The run ID to join. Optional when CHATROOM_RUN_ID is configured for this connector. When provided, connects to the run-scoped chat instead of the project chat.',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'send_message',
    description:
      'Use this when you want to send a chatroom message after connecting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        channel_id: {
          type: 'string',
          description: 'The channel ID returned by connect_chat.',
        },
        text: {
          type: 'string',
          description: 'The message text to send.',
        },
        mentions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional member names to mention in the message.',
        },
      },
      required: ['channel_id', 'text'],
    },
  },
  {
    name: 'list_members',
    description:
      'Use this when you need the current list of connected chatroom members.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'wait_for_events',
    description:
      'Use this after connecting to receive new chatroom activity. After each timeout or after handling events, call this again to stay subscribed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        timeout_ms: {
          type: 'number',
          description:
            'Maximum time to wait for matching events before timing out.',
        },
        max_events: {
          type: 'number',
          description: 'Maximum number of matching events to return.',
        },
        mentions_only: {
          type: 'boolean',
          description:
            'When true, only return message events that mention your connected name.',
        },
        include_system: {
          type: 'boolean',
          description: 'When false, exclude member join and leave events.',
        },
      },
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
          args as {
            name: string
            description: string
            project_id?: string
            run_id?: string
          },
        )
      case 'send_message':
        return handlers.sendMessage(
          args as { channel_id: string; text: string; mentions?: string[] },
        )
      case 'list_members':
        return handlers.listMembers()
      case 'wait_for_events':
        return handlers.waitForEvents(
          args as {
            timeout_ms?: number
            max_events?: number
            mentions_only?: boolean
            include_system?: boolean
          },
        )
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })
}

export function createMcpServer(handlers: ToolHandlers) {
  const mcp = new Server(
    { name: 'chatroom-codex', version: '0.0.1' },
    {
      capabilities: {
        tools: {},
      },
      instructions,
    },
  )

  registerMcpHandlers(mcp, handlers)
  return mcp
}
