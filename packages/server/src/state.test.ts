import { describe, expect, it, vi } from 'vitest'
import { Room, getOrCreateRoom, getRoom } from './state.js'

function createSocket() {
  return {
    send: vi.fn(),
  }
}

describe('Room', () => {
  it('adds members once and exposes them with the channel id', () => {
    const room = new Room('general')

    expect(room.addMember({ name: 'alpha', description: 'first agent' })).toBe(
      true,
    )
    expect(
      room.addMember({ name: 'alpha', description: 'duplicate agent' }),
    ).toBe(false)
    expect(room.getMembers()).toEqual([
      {
        name: 'alpha',
        description: 'first agent',
        channel_id: 'general',
      },
    ])
  })

  it('registers websockets for known members and removes them on disconnect', () => {
    const room = new Room('general')
    const socket = createSocket()

    room.addMember({ name: 'beta', description: 'connected agent' })

    expect(room.registerWebSocket(socket, 'beta')).toBe(true)
    expect(room.hasWebSocket('beta')).toBe(true)
    expect(room.getNameByWebSocket(socket)).toBe('beta')
    expect(room.unregisterWebSocket(socket)).toBe('beta')
    expect(room.hasWebSocket('beta')).toBe(false)
    expect(room.getMember('beta')).toBeUndefined()
  })

  it('broadcasts to every connected socket except the excluded member', () => {
    const room = new Room('general')
    const alpha = createSocket()
    const beta = createSocket()

    room.addMember({ name: 'alpha', description: 'sender' })
    room.addMember({ name: 'beta', description: 'receiver' })
    room.registerWebSocket(alpha, 'alpha')
    room.registerWebSocket(beta, 'beta')

    room.broadcast('hello room', 'alpha')

    expect(alpha.send).not.toHaveBeenCalled()
    expect(beta.send).toHaveBeenCalledWith('hello room')
  })

  it('removes members and associated sockets explicitly', () => {
    const room = new Room('general')
    const socket = createSocket()

    room.addMember({ name: 'gamma', description: 'member to remove' })
    room.registerWebSocket(socket, 'gamma')

    expect(room.removeMember('gamma')).toEqual({
      name: 'gamma',
      description: 'member to remove',
    })
    expect(room.getMember('gamma')).toBeUndefined()
    expect(room.getNameByWebSocket(socket)).toBeUndefined()
  })

  it('returns undefined when removing an unknown member', () => {
    const room = new Room('general')

    expect(room.removeMember('missing')).toBeUndefined()
  })

  it('rejects websocket registration for unknown or duplicate members', () => {
    const room = new Room('general')
    const alpha = createSocket()
    const beta = createSocket()

    expect(room.registerWebSocket(alpha, 'missing')).toBe(false)

    room.addMember({ name: 'delta', description: 'known member' })
    expect(room.registerWebSocket(alpha, 'delta')).toBe(true)
    expect(room.registerWebSocket(beta, 'delta')).toBe(false)
  })

  it('broadcastAll sends to every socket and ignores stale failures', () => {
    const room = new Room('general')
    const healthy = createSocket()
    const broken = {
      send: vi.fn(() => {
        throw new Error('socket closed')
      }),
    }

    room.addMember({ name: 'alpha', description: 'healthy' })
    room.addMember({ name: 'beta', description: 'broken' })
    room.registerWebSocket(healthy, 'alpha')
    room.registerWebSocket(broken, 'beta')

    expect(() => room.broadcastAll('announcement')).not.toThrow()
    expect(healthy.send).toHaveBeenCalledWith('announcement')
    expect(broken.send).toHaveBeenCalledWith('announcement')
  })

  it('reuses and exposes rooms from the registry', () => {
    const room = getOrCreateRoom('ops')

    expect(getOrCreateRoom('ops')).toBe(room)
    expect(getRoom('ops')).toBe(room)
    expect(getRoom('missing')).toBeUndefined()
  })
})
