import { Elysia, t } from 'elysia'
import {
  type JsonRpcMessage,
  type SendMessageParams,
  isRequest,
  makeResponse,
  makeErrorResponse,
  makeNotification,
  METHOD_NOT_FOUND,
  NOT_CONNECTED,
  INVALID_CHANNEL,
  INVALID_PARAMS,
} from '@chatroom/shared'
import {
  defaultProjectChatDependencies,
  findRoomByWebSocket,
  getProjectRoom,
  type ProjectChatDependencies,
} from './state.js'

interface ChannelSocket {
  raw: {
    send(message: string | ArrayBufferLike | ArrayBufferView): unknown
  }
  send(message: unknown): void
  close(): void
  data: {
    query: {
      name: string
      project_id: string
    }
  }
}

export function handleOpen(ws: ChannelSocket) {
  handleOpenWithDependencies(ws, defaultProjectChatDependencies)
}

export function handleOpenWithDependencies(
  ws: ChannelSocket,
  dependencies: ProjectChatDependencies,
) {
  const name = ws.data.query.name
  const projectId = ws.data.query.project_id

  if (!projectId) {
    ws.send(makeErrorResponse(0, INVALID_PARAMS, 'project_id is required'))
    ws.close()
    return
  }

  const room = getProjectRoom(projectId, dependencies)
  if (!room) {
    ws.send(
      makeErrorResponse(
        0,
        INVALID_CHANNEL,
        `Invalid project_id "${projectId}"`,
      ),
    )
    ws.close()
    return
  }

  // Validate the member has registered via POST /connect
  if (!room.isRegistered(name)) {
    ws.send(
      makeErrorResponse(
        0,
        NOT_CONNECTED,
        `"${name}" is not registered. Call POST /connect first.`,
      ),
    )
    ws.close()
    return
  }

  // Register WebSocket connection
  if (!room.registerWebSocket(ws.raw, name)) {
    ws.send(
      makeErrorResponse(
        0,
        NOT_CONNECTED,
        `"${name}" already has an active WebSocket connection.`,
      ),
    )
    ws.close()
    return
  }

  // Broadcast member_joined to all OTHER connected members
  const member = room.getMember(name)!
  const timestamp = new Date().toISOString()
  const joinNotification = JSON.stringify(
    makeNotification('member_joined', {
      name: member.name,
      description: member.description,
      timestamp,
    }),
  )

  room.broadcast(joinNotification, name)
  console.log(`[ws] ${name} connected to room "${room.channelId}"`)
}

export function handleMessage(ws: ChannelSocket, rawMessage: unknown) {
  handleMessageWithDependencies(ws, rawMessage, defaultProjectChatDependencies)
}

export function handleMessageWithDependencies(
  ws: ChannelSocket,
  rawMessage: unknown,
  dependencies: ProjectChatDependencies,
) {
  const name = ws.data.query.name
  const projectId = ws.data.query.project_id
  const room = getProjectRoom(projectId, dependencies)

  let msg: JsonRpcMessage
  try {
    msg =
      typeof rawMessage === 'string'
        ? JSON.parse(rawMessage)
        : (rawMessage as JsonRpcMessage)
  } catch {
    ws.send(makeErrorResponse(0, -32700, 'Parse error'))
    return
  }

  if (!isRequest(msg)) {
    ws.send(makeErrorResponse(0, -32600, 'Expected a JSON-RPC request'))
    return
  }

  if (!room) {
    ws.send(
      makeErrorResponse(
        msg.id,
        INVALID_CHANNEL,
        `Invalid project_id "${projectId}"`,
      ),
    )
    return
  }

  if (msg.method === 'send_message') {
    const params = msg.params as SendMessageParams | undefined
    if (!params || !params.text || !params.channel_id) {
      ws.send(
        makeErrorResponse(
          msg.id,
          INVALID_PARAMS,
          'text and channel_id are required',
        ),
      )
      return
    }

    if (params.channel_id !== room.channelId) {
      ws.send(
        makeErrorResponse(
          msg.id,
          INVALID_CHANNEL,
          `Invalid channel_id "${params.channel_id}"`,
        ),
      )
      return
    }

    if (!room.hasWebSocket(name)) {
      ws.send(
        makeErrorResponse(msg.id, NOT_CONNECTED, 'Not connected to this room'),
      )
      return
    }

    const member = room.getMember(name)!
    const timestamp = new Date().toISOString()

    // Broadcast new_message to all OTHER members (no self-echo)
    const notification = JSON.stringify(
      makeNotification('new_message', {
        sender: member.name,
        sender_role: member.description,
        text: params.text,
        mentions: params.mentions ?? [],
        timestamp,
      }),
    )

    room.broadcast(notification, name)

    // Confirm receipt to sender
    ws.send(makeResponse(msg.id, { ok: true, timestamp }))

    console.log(`[msg] ${name}: ${params.text}`)
  } else {
    ws.send(
      makeErrorResponse(
        msg.id,
        METHOD_NOT_FOUND,
        `Unknown method "${msg.method}"`,
      ),
    )
  }
}

export function handleClose(ws: Pick<ChannelSocket, 'raw'>) {
  handleCloseWithDependencies(ws, defaultProjectChatDependencies)
}

export function handleCloseWithDependencies(
  ws: Pick<ChannelSocket, 'raw'>,
  dependencies: ProjectChatDependencies,
) {
  const room = findRoomByWebSocket(ws.raw, dependencies)
  if (!room) return

  const removedName = room.unregisterWebSocket(ws.raw)!
  // Broadcast member_left to remaining members
  const timestamp = new Date().toISOString()
  const leaveNotification = JSON.stringify(
    makeNotification('member_left', { name: removedName, timestamp }),
  )
  room.broadcastAll(leaveNotification)

  console.log(`[ws] ${removedName} disconnected`)
}

export function createWsHandlers(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  return {
    open(ws: ChannelSocket) {
      handleOpenWithDependencies(ws, dependencies)
    },
    message(ws: ChannelSocket, rawMessage: unknown) {
      handleMessageWithDependencies(ws, rawMessage, dependencies)
    },
    close(ws: Pick<ChannelSocket, 'raw'>) {
      handleCloseWithDependencies(ws, dependencies)
    },
  }
}

export const wsHandlers = createWsHandlers()

export function createWs(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const handlers = createWsHandlers(dependencies)

  return new Elysia().ws('/ws', {
    query: t.Object({
      name: t.String(),
      project_id: t.String(),
    }),
    open: handlers.open,
    message: handlers.message,
    close: handlers.close,
  })
}

export const ws = createWs()
