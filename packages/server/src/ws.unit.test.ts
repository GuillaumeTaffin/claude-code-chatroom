import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INVALID_CHANNEL,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  NOT_CONNECTED,
  makeRequest,
} from '@chatroom/shared'
import { createProject, getProjectRoom, resetState } from './state.js'
import { handleClose, handleMessage, handleOpen, wsHandlers } from './ws.js'

function createSocket(name: string, projectId = '') {
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
        project_id: projectId,
      },
    },
  }
}

describe('websocket handlers', () => {
  beforeEach(() => {
    resetState()
    vi.restoreAllMocks()
  })

  it('rejects missing project ids on open', () => {
    const socket = createSocket('alpha')

    handleOpen(socket)

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: INVALID_PARAMS,
        message: 'project_id is required',
        data: undefined,
      },
    })
    expect(socket.close).toHaveBeenCalled()
  })

  it('rejects unregistered members on open', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const socket = createSocket('alpha', project.id)

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

  it('rejects unknown project ids on open', () => {
    const socket = createSocket('alpha', 'missing-project')

    handleOpen(socket)

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 0,
      error: {
        code: INVALID_CHANNEL,
        message: 'Invalid project_id "missing-project"',
        data: undefined,
      },
    })
    expect(socket.close).toHaveBeenCalled()
  })

  it('rejects duplicate websocket connections on open', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const existing = createSocket('alpha', project.id)
    const socket = createSocket('alpha', project.id)

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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const other = createSocket('beta', project.id)
    const joining = createSocket('alpha', project.id)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T11:59:00.000Z'))

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
          timestamp: '2026-04-04T11:59:00.000Z',
        },
      }),
    )
    expect(logSpy).toHaveBeenCalledWith(
      `[ws] alpha connected to room "${project.channel_id}"`,
    )
    vi.useRealTimers()
  })

  it('exposes websocket adapter handlers that delegate to the runtime handlers', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const socket = createSocket('alpha', project.id)
    const remaining = createSocket('beta', project.id)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:10:00.000Z'))

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
          timestamp: '2026-04-04T12:10:00.000Z',
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
    vi.useRealTimers()
  })

  it('rejects invalid websocket payloads', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const socket = createSocket('alpha', project.id)

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

  it('rejects messages for unknown project ids', () => {
    const socket = createSocket('alpha', 'missing-project')

    handleMessage(
      socket,
      makeRequest(10, 'send_message', {
        channel_id: 'missing-project',
        text: 'hello',
      }),
    )

    expect(socket.send).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 10,
      error: {
        code: INVALID_CHANNEL,
        message: 'Invalid project_id "missing-project"',
        data: undefined,
      },
    })
  })

  it('rejects invalid send_message requests', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const socket = createSocket('alpha', project.id)

    room.addMember({ name: 'alpha', description: 'frontend agent' })
    room.registerWebSocket(socket.raw, 'alpha')

    handleMessage(
      socket,
      makeRequest(1, 'send_message', { channel_id: project.channel_id }),
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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const socket = createSocket('alpha', project.id)

    room.addMember({ name: 'alpha', description: 'frontend agent' })

    handleMessage(
      socket,
      makeRequest(3, 'send_message', {
        channel_id: project.channel_id,
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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const sender = createSocket('alpha', project.id)
    const receiver = createSocket('beta', project.id)
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
        channel_id: project.channel_id,
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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const sender = createSocket('alpha', project.id)
    const receiver = createSocket('beta', project.id)
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
        channel_id: project.channel_id,
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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const socket = createSocket('alpha', project.id)

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
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const room = getProjectRoom(project.id)!
    const leaving = createSocket('alpha', project.id)
    const remaining = createSocket('beta', project.id)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:15:00.000Z'))

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
          timestamp: '2026-04-04T12:15:00.000Z',
        },
      }),
    )
    expect(logSpy).toHaveBeenCalledWith('[ws] alpha disconnected')

    const unknown = createSocket('ghost', project.id)
    expect(() => handleClose(unknown)).not.toThrow()
    vi.useRealTimers()
  })

  it('keeps websocket traffic isolated to the selected project', () => {
    const alphaProject = createProject({
      name: 'Alpha',
      root_path: '/workspace/alpha',
    })
    const betaProject = createProject({
      name: 'Beta',
      root_path: '/workspace/beta',
    })
    const alphaSender = createSocket('alpha', alphaProject.id)
    const alphaReceiver = createSocket('beta', alphaProject.id)
    const betaReceiver = createSocket('gamma', betaProject.id)
    const alphaRoom = getProjectRoom(alphaProject.id)!
    const betaRoom = getProjectRoom(betaProject.id)!
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:20:00.000Z'))

    alphaRoom.addMember({ name: 'alpha', description: 'alpha sender' })
    alphaRoom.addMember({ name: 'beta', description: 'alpha receiver' })
    betaRoom.addMember({ name: 'gamma', description: 'beta receiver' })
    alphaRoom.registerWebSocket(alphaSender.raw, 'alpha')
    alphaRoom.registerWebSocket(alphaReceiver.raw, 'beta')
    betaRoom.registerWebSocket(betaReceiver.raw, 'gamma')

    handleMessage(
      alphaSender,
      makeRequest(7, 'send_message', {
        channel_id: alphaProject.channel_id,
        text: 'alpha only',
      }),
    )

    expect(alphaReceiver.send).toHaveBeenCalledWith(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'new_message',
        params: {
          sender: 'alpha',
          sender_role: 'alpha sender',
          text: 'alpha only',
          mentions: [],
          timestamp: '2026-04-04T12:20:00.000Z',
        },
      }),
    )
    expect(betaReceiver.send).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
