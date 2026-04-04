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
import { getOrCreateRoom, DEFAULT_CHANNEL_ID } from './state.js'

export const ws = new Elysia().ws('/ws', {
  query: t.Object({
    name: t.String(),
  }),

  open(ws) {
    const name = ws.data.query.name
    const room = getOrCreateRoom(DEFAULT_CHANNEL_ID)

    // Validate the member has registered via POST /connect
    if (!room.isRegistered(name)) {
      ws.send(
        makeErrorResponse(0, NOT_CONNECTED, `"${name}" is not registered. Call POST /connect first.`),
      )
      ws.close()
      return
    }

    // Register WebSocket connection
    if (!room.registerWebSocket(ws.raw, name)) {
      ws.send(
        makeErrorResponse(0, NOT_CONNECTED, `"${name}" already has an active WebSocket connection.`),
      )
      ws.close()
      return
    }

    // Broadcast member_joined to all OTHER connected members
    const member = room.getMember(name)!
    const joinNotification = JSON.stringify(
      makeNotification('member_joined', {
        name: member.name,
        description: member.description,
      }),
    )

    room.broadcast(joinNotification, name)
    console.log(`[ws] ${name} connected to room "${room.channelId}"`)
  },

  message(ws, rawMessage) {
    const name = ws.data.query.name
    const room = getOrCreateRoom(DEFAULT_CHANNEL_ID)

    let msg: JsonRpcMessage
    try {
      msg = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : (rawMessage as JsonRpcMessage)
    } catch {
      ws.send(makeErrorResponse(0, -32700, 'Parse error'))
      return
    }

    if (!isRequest(msg)) {
      ws.send(makeErrorResponse(0, -32600, 'Expected a JSON-RPC request'))
      return
    }

    if (msg.method === 'send_message') {
      const params = msg.params as SendMessageParams | undefined
      if (!params || !params.text || !params.channel_id) {
        ws.send(makeErrorResponse(msg.id, INVALID_PARAMS, 'text and channel_id are required'))
        return
      }

      if (params.channel_id !== room.channelId) {
        ws.send(makeErrorResponse(msg.id, INVALID_CHANNEL, `Invalid channel_id "${params.channel_id}"`))
        return
      }

      if (!room.hasWebSocket(name)) {
        ws.send(makeErrorResponse(msg.id, NOT_CONNECTED, 'Not connected to this room'))
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
      ws.send(makeErrorResponse(msg.id, METHOD_NOT_FOUND, `Unknown method "${msg.method}"`))
    }
  },

  close(ws) {
    const room = getOrCreateRoom(DEFAULT_CHANNEL_ID)

    const removedName = room.unregisterWebSocket(ws.raw)
    if (removedName) {
      // Broadcast member_left to remaining members
      const leaveNotification = JSON.stringify(
        makeNotification('member_left', { name: removedName }),
      )
      room.broadcastAll(leaveNotification)

      console.log(`[ws] ${removedName} disconnected`)
    }
  },
})
