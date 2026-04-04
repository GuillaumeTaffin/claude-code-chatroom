#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  type JsonRpcMessage,
  type NewMessageParams,
  type MemberJoinedParams,
  type MemberLeftParams,
  isNotification,
  makeRequest,
} from '@chatroom/shared'

// ── Configuration ───────────────────────────────────────────────────────────

const SERVER_URL = process.env.CHATROOM_URL || 'http://localhost:3000'
const WS_URL = SERVER_URL.replace(/^http/, 'ws')

// ── State ───────────────────────────────────────────────────────────────────

let connectedName: string | null = null
let channelId: string | null = null
let wsConnection: WebSocket | null = null
let rpcIdCounter = 0
const pendingRequests = new Map<
  string | number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>()

// ── MCP Server ──────────────────────────────────────────────────────────────

const mcp = new Server(
  { name: 'chatroom', version: '0.0.1' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions: [
      'You are connected to a chatroom channel.',
      'First, call connect_chat with your name and a short but complete description of your role.',
      'You will then receive messages from other members as channel events.',
      'Use send_message to communicate with others. Use list_members to see who is in the room.',
      'When a message includes your name in the mentions, you should respond.',
      'Messages arrive as <channel> tags with attributes: sender, sender_role, mentions, type.',
    ].join(' '),
  },
)

// ── Tool definitions ────────────────────────────────────────────────────────

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'connect_chat',
      description:
        'Join the chatroom with your name and role description. Must be called before sending messages.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Your unique name in the chatroom' },
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
          channel_id: { type: 'string', description: 'The channel ID received from connect_chat' },
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
      description: 'List all members currently connected to the chatroom with their role descriptions.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}))

// ── Tool handlers ───────────────────────────────────────────────────────────

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  switch (name) {
    case 'connect_chat':
      return handleConnectChat(args as { name: string; description: string })
    case 'send_message':
      return handleSendMessage(args as { channel_id: string; text: string; mentions?: string[] })
    case 'list_members':
      return handleListMembers()
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
})

async function handleConnectChat(args: { name: string; description: string }) {
  if (connectedName) {
    return {
      content: [{ type: 'text' as const, text: `Already connected as "${connectedName}"` }],
    }
  }

  try {
    const res = await fetch(`${SERVER_URL}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: args.name, description: args.description }),
    })

    if (!res.ok) {
      const err = await res.json() as { error?: string }
      return {
        content: [{ type: 'text' as const, text: `Failed to connect: ${err.error || res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { channel_id: string }
    connectedName = args.name
    channelId = data.channel_id

    // Establish WebSocket connection
    await connectWebSocket(args.name)

    return {
      content: [
        {
          type: 'text' as const,
          text: `Connected to chatroom as "${args.name}" (channel_id: ${data.channel_id})`,
        },
      ],
    }
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Connection error: ${(e as Error).message}` }],
      isError: true,
    }
  }
}

async function handleSendMessage(args: { channel_id: string; text: string; mentions?: string[] }) {
  if (!connectedName || !wsConnection) {
    return {
      content: [{ type: 'text' as const, text: 'Not connected. Call connect_chat first.' }],
      isError: true,
    }
  }

  if (args.channel_id !== channelId) {
    return {
      content: [{ type: 'text' as const, text: `Invalid channel_id. Expected "${channelId}".` }],
      isError: true,
    }
  }

  try {
    const id = ++rpcIdCounter
    const request = makeRequest(id, 'send_message', {
      channel_id: args.channel_id,
      text: args.text,
      mentions: args.mentions ?? [],
    })

    const result = await sendRpcRequest(id, request)
    return {
      content: [{ type: 'text' as const, text: `Message sent.` }],
    }
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Send failed: ${(e as Error).message}` }],
      isError: true,
    }
  }
}

async function handleListMembers() {
  try {
    const res = await fetch(`${SERVER_URL}/members`)
    if (!res.ok) {
      return {
        content: [{ type: 'text' as const, text: `Failed to list members: ${res.statusText}` }],
        isError: true,
      }
    }

    const data = await res.json() as { members: Array<{ name: string; description: string; channel_id: string }> }

    if (data.members.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No members connected.' }],
      }
    }

    const list = data.members
      .map((m) => `- ${m.name}: ${m.description}`)
      .join('\n')

    return {
      content: [{ type: 'text' as const, text: `Connected members:\n${list}` }],
    }
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    }
  }
}

// ── WebSocket connection to chatroom server ─────────────────────────────────

function connectWebSocket(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ws?name=${encodeURIComponent(name)}`)

    ws.onopen = () => {
      wsConnection = ws
      console.error(`[connector] WebSocket connected as "${name}"`)
      resolve()
    }

    ws.onerror = (event) => {
      console.error('[connector] WebSocket error:', event)
      reject(new Error('WebSocket connection failed'))
    }

    ws.onclose = () => {
      console.error('[connector] WebSocket closed')
      wsConnection = null
    }

    ws.onmessage = (event) => {
      try {
        const msg: JsonRpcMessage = JSON.parse(event.data as string)

        // Handle responses to our requests
        if ('id' in msg && !('method' in msg)) {
          const pending = pendingRequests.get(msg.id)
          if (pending) {
            pendingRequests.delete(msg.id)
            if ('error' in msg && msg.error) {
              pending.reject(new Error(msg.error.message))
            } else {
              pending.resolve(msg.result)
            }
          }
          return
        }

        // Handle incoming notifications from the server
        if (isNotification(msg)) {
          handleServerNotification(msg.method, msg.params)
        }
      } catch (e) {
        console.error('[connector] Failed to parse WS message:', e)
      }
    }
  })
}

function sendRpcRequest(id: number, request: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!wsConnection) {
      reject(new Error('WebSocket not connected'))
      return
    }

    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error('Request timed out'))
    }, 10000)

    pendingRequests.set(id, {
      resolve: (v) => {
        clearTimeout(timeout)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timeout)
        reject(e)
      },
    })

    wsConnection.send(JSON.stringify(request))
  })
}

// ── Forward server notifications to Claude Code via channel ─────────────────

async function handleServerNotification(method: string, params: unknown) {
  try {
    switch (method) {
      case 'new_message': {
        const p = params as NewMessageParams
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: p.text,
            meta: {
              sender: p.sender,
              sender_role: p.sender_role,
              mentions: p.mentions.join(','),
              type: 'message',
            },
          },
        })
        break
      }

      case 'member_joined': {
        const p = params as MemberJoinedParams
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: `${p.name} joined the chatroom (${p.description})`,
            meta: {
              type: 'system',
              event: 'joined',
              name: p.name,
              description: p.description,
            },
          },
        })
        break
      }

      case 'member_left': {
        const p = params as MemberLeftParams
        await mcp.notification({
          method: 'notifications/claude/channel',
          params: {
            content: `${p.name} left the chatroom`,
            meta: {
              type: 'system',
              event: 'left',
              name: p.name,
            },
          },
        })
        break
      }
    }
  } catch (e) {
    console.error('[connector] Failed to forward notification:', e)
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

await mcp.connect(new StdioServerTransport())
console.error('[connector] MCP channel server started')
