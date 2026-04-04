import {
  type JsonRpcMessage,
  type NewMessageParams,
  type MemberJoinedParams,
  type MemberLeftParams,
  isNotification,
  isResponse,
  makeRequest,
} from '@chatroom/shared'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  type: 'message' | 'system'
  sender?: string
  senderRole?: string
  text: string
  mentions: string[]
  timestamp: string
}

export interface ChatMember {
  name: string
  description: string
  channel_id: string
}

// ── Reactive state ──────────────────────────────────────────────────────────

let messages = $state<ChatMessage[]>([])
let members = $state<ChatMember[]>([])
let connected = $state(false)
let myName = $state('')
let channelId = $state('')

// ── Internal state ──────────────────────────────────────────────────────────

let ws: WebSocket | null = null
let rpcIdCounter = 0
const pendingRequests = new Map<
  string | number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>()

const SERVER_URL = 'http://localhost:3000'
const WS_URL = 'ws://localhost:3000'

// ── Public API ──────────────────────────────────────────────────────────────

export function getMessages() {
  return messages
}

export function getMembers() {
  return members
}

export function isConnected() {
  return connected
}

export function getMyName() {
  return myName
}

export function getChannelId() {
  return channelId
}

export async function connect(name: string, description: string): Promise<void> {
  // Register via REST
  const res = await fetch(`${SERVER_URL}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  })

  if (!res.ok) {
    const err = (await res.json()) as { error?: string }
    throw new Error(err.error || res.statusText)
  }

  const data = (await res.json()) as { channel_id: string }
  myName = name
  channelId = data.channel_id

  // Establish WebSocket
  await connectWebSocket(name)
  connected = true

  // Fetch initial member list
  await refreshMembers()

  addSystemMessage(`You joined the chatroom as "${name}"`)
}

export async function sendMessage(text: string, mentions: string[] = []): Promise<void> {
  if (!ws || !connected) throw new Error('Not connected')

  const id = ++rpcIdCounter
  const request = makeRequest(id, 'send_message', {
    channel_id: channelId,
    text,
    mentions,
  })

  await sendRpcRequest(id, request)

  // Add own message to the local list (since server doesn't echo back)
  messages = [
    ...messages,
    {
      id: crypto.randomUUID(),
      type: 'message',
      sender: myName,
      senderRole: '',
      text,
      mentions,
      timestamp: new Date().toISOString(),
    },
  ]
}

export function disconnect(): void {
  if (ws) {
    ws.close()
    ws = null
  }
  connected = false
  myName = ''
  channelId = ''
  messages = []
  members = []
}

// ── WebSocket ───────────────────────────────────────────────────────────────

function connectWebSocket(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${WS_URL}/ws?name=${encodeURIComponent(name)}`)

    socket.onopen = () => {
      ws = socket
      resolve()
    }

    socket.onerror = () => {
      reject(new Error('WebSocket connection failed'))
    }

    socket.onclose = () => {
      ws = null
      connected = false
    }

    socket.onmessage = (event) => {
      try {
        const msg: JsonRpcMessage = JSON.parse(event.data)

        // Handle responses to our requests
        if (isResponse(msg)) {
          const pending = pendingRequests.get(msg.id)
          if (pending) {
            pendingRequests.delete(msg.id)
            if (msg.error) {
              pending.reject(new Error(msg.error.message))
            } else {
              pending.resolve(msg.result)
            }
          }
          return
        }

        // Handle notifications
        if (isNotification(msg)) {
          handleNotification(msg.method, msg.params)
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e)
      }
    }
  })
}

function sendRpcRequest(id: number, request: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws) {
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

    ws.send(JSON.stringify(request))
  })
}

// ── Notification handlers ───────────────────────────────────────────────────

function handleNotification(method: string, params: unknown) {
  switch (method) {
    case 'new_message': {
      const p = params as NewMessageParams
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          type: 'message',
          sender: p.sender,
          senderRole: p.sender_role,
          text: p.text,
          mentions: p.mentions,
          timestamp: p.timestamp,
        },
      ]
      break
    }

    case 'member_joined': {
      const p = params as MemberJoinedParams
      addSystemMessage(`${p.name} joined (${p.description})`)
      members = [...members, { name: p.name, description: p.description, channel_id: channelId }]
      break
    }

    case 'member_left': {
      const p = params as MemberLeftParams
      addSystemMessage(`${p.name} left the chatroom`)
      members = members.filter((m) => m.name !== p.name)
      break
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function addSystemMessage(text: string) {
  messages = [
    ...messages,
    {
      id: crypto.randomUUID(),
      type: 'system',
      text,
      mentions: [],
      timestamp: new Date().toISOString(),
    },
  ]
}

async function refreshMembers() {
  try {
    const res = await fetch(`${SERVER_URL}/members`)
    if (res.ok) {
      const data = (await res.json()) as { members: ChatMember[] }
      members = data.members
    }
  } catch {
    // silently fail
  }
}
