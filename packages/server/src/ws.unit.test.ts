import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INVALID_CHANNEL,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  NOT_CONNECTED,
  makeRequest,
} from '@chatroom/shared'
import { getOrCreateRoom } from './state.js'
import { handleClose, handleMessage, handleOpen, wsHandlers } from './ws.js'

function clearDefaultRoom() {
  const room = getOrCreateRoom()
  for (const member of room.getMembers()) {
    room.removeMember(member.name)
  }
}

function createSocket(name: string) {
  const send = vi.fn()
  const raw = {
    send,
  }

  return {
    raw,
    send,
    close: vi.fn(),
    data: {
      query: {
        name,
      },
    },
  }
}

describe('websocket handlers', () => {
  beforeEach(() => {
    clearDefaultRoom()
    vi.restoreAllMocks()
  })

  it('rejects unregistered members on open', () => {
    const socket = createSocket('alpha')

    handleOpen(socket)

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: NOT_CONNECTED,
        message: '"alpha" is not registered. Call POST /connect first.',
        data: undefined,
      },
    })
    expect(socket.close).toHaveBeenCalled()
  })

  it('rejects duplicate websocket connections on open', () => {
    const room = getOrCreateRoom()
    const existing = createSocket('alpha')
    const socket = createSocket('alpha')

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(existing.raw, 'alpha')

    handleOpen(socket)

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: NOT_CONNECTED,
        message: '"alpha" already has an active WebSocket connection.',
        data: undefined,
      },
    })
    expect(socket.close).toHaveBeenCalled()
  })

  it('broadcasts member joins to other sockets', () => {
    const room = getOrCreateRoom()
    const other = createSocket('beta')
    const joining = createSocket('alpha')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    room.addMember({ name: 'beta', description: 'backend agent' })
    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(other.raw, 'beta')

    handleOpen(joining)

    expect(other.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'member_joined',
        params: {
          name: 'alpha',
          description: 'frontend agent',
        },
      }),
    )
    expect(logSpy).toHaveBeenCalledWith(
      '[ws] alpha connected to room "general"',
    )
  })

  it('exposes websocket adapter handlers that delegate to the runtime handlers', () => {
    const room = getOrCreateRoom()
    const socket = createSocket('alpha')
    const remaining = createSocket('beta')

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.addMember({ name: 'beta', description: 'backend agent' })
    room.registerWebSocket(remaining.raw, 'beta')

    wsHandlers.open(socket)
    expect(socket.close).not.toHaveBeenCalled()

    wsHandlers.message(socket, makeRequest(9, 'ping'))
    expect(socket.send).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 9,
      error: {
        code: METHOD_NOT_FOUND,
        message: 'Unknown method "ping"',
        data: undefined,
      },
    })

    wsHandlers.close(socket)
    expect(remaining.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'member_left',
        params: {
          name: 'alpha',
        },
      }),
    )
    expect(socket.send).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 9,
      error: {
        code: METHOD_NOT_FOUND,
        message: 'Unknown method "ping"',
        data: undefined,
      },
    })
  })

  it('rejects invalid websocket payloads', () => {
    const room = getOrCreateRoom()
    const socket = createSocket('alpha')

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(socket.raw, 'alpha')

    handleMessage(socket, '{bad json')
    expect(socket.send).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32700, message: 'Parse error', data: undefined },
    })

    handleMessage(
      socket,
      JSON.stringify({ jsonrpc: '2.0', method: 'member_joined', params: {} }),
    )
    expect(socket.send).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: -32600,
        message: 'Expected a JSON-RPC request',
        data: undefined,
      },
    })
  })

  it('rejects invalid send_message requests', () => {
    const room = getOrCreateRoom()
    const socket = createSocket('alpha')

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(socket.raw, 'alpha')

    handleMessage(
      socket,
      makeRequest(1, 'send_message', { channel_id: 'general' }),
    )
    expect(socket.send).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: INVALID_PARAMS,
        message: 'text and channel_id are required',
        data: undefined,
      },
    })

    handleMessage(
      socket,
      makeRequest(2, 'send_message', {
        channel_id: 'random',
        text: 'hello',
      }),
    )
    expect(socket.send).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      id: 2,
      error: {
        code: INVALID_CHANNEL,
        message: 'Invalid channel_id "random"',
        data: undefined,
      },
    })
  })

  it('rejects messages from members without an active websocket', () => {
    const room = getOrCreateRoom()
    const socket = createSocket('alpha')

    room.addMember({ name: 'alpha', description: 'frontend agent' })

    handleMessage(
      socket,
      makeRequest(3, 'send_message', {
        channel_id: 'general',
        text: 'hello',
      }),
    )

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: NOT_CONNECTED,
        message: 'Not connected to this room',
        data: undefined,
      },
    })
  })

  it('broadcasts valid messages and acknowledges the sender', () => {
    const room = getOrCreateRoom()
    const sender = createSocket('alpha')
    const receiver = createSocket('beta')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00.000Z'))

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.addMember({ name: 'beta', description: 'backend agent' })
    room.registerWebSocket(sender.raw, 'alpha')
    room.registerWebSocket(receiver.raw, 'beta')

    handleMessage(
      sender,
      makeRequest(4, 'send_message', {
        channel_id: 'general',
        text: 'hello room',
        mentions: ['beta'],
      }),
    )

    expect(receiver.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'new_message',
        params: {
          sender: 'alpha',
          sender_role: 'frontend agent',
          text: 'hello room',
          mentions: ['beta'],
          timestamp: '2026-04-04T12:00:00.000Z',
        },
      }),
    )
    expect(sender.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 4,
      result: {
        ok: true,
        timestamp: '2026-04-04T12:00:00.000Z',
      },
    })
    expect(logSpy).toHaveBeenCalledWith('[msg] alpha: hello room')
    vi.useRealTimers()
  })

  it('defaults missing mentions to an empty list', () => {
    const room = getOrCreateRoom()
    const sender = createSocket('alpha')
    const receiver = createSocket('beta')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:05:00.000Z'))

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.addMember({ name: 'beta', description: 'backend agent' })
    room.registerWebSocket(sender.raw, 'alpha')
    room.registerWebSocket(receiver.raw, 'beta')

    handleMessage(
      sender,
      makeRequest(6, 'send_message', {
        channel_id: 'general',
        text: 'hello without mentions',
      }),
    )

    expect(receiver.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'new_message',
        params: {
          sender: 'alpha',
          sender_role: 'frontend agent',
          text: 'hello without mentions',
          mentions: [],
          timestamp: '2026-04-04T12:05:00.000Z',
        },
      }),
    )
    expect(sender.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 6,
      result: {
        ok: true,
        timestamp: '2026-04-04T12:05:00.000Z',
      },
    })
    expect(logSpy).toHaveBeenCalledWith('[msg] alpha: hello without mentions')
    vi.useRealTimers()
  })

  it('rejects unknown methods', () => {
    const room = getOrCreateRoom()
    const socket = createSocket('alpha')

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(socket.raw, 'alpha')

    handleMessage(socket, makeRequest(5, 'ping'))

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 5,
      error: {
        code: METHOD_NOT_FOUND,
        message: 'Unknown method "ping"',
        data: undefined,
      },
    })
  })

  it('broadcasts member leave events on close and ignores unknown sockets', () => {
    const room = getOrCreateRoom()
    const leaving = createSocket('alpha')
    const remaining = createSocket('beta')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.addMember({ name: 'beta', description: 'backend agent' })
    room.registerWebSocket(leaving.raw, 'alpha')
    room.registerWebSocket(remaining.raw, 'beta')

    handleClose(leaving)

    expect(remaining.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'member_left',
        params: {
          name: 'alpha',
        },
      }),
    )
    expect(logSpy).toHaveBeenCalledWith('[ws] alpha disconnected')

    const unknown = createSocket('ghost')
    expect(() => handleClose(unknown)).not.toThrow()
  })
})
