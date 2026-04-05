import { beforeEach, describe, expect, it } from 'vitest'
import { handleConnect, handleMembers, routeHandlers } from './routes.js'
import { getOrCreateRoom } from './state.js'

function clearDefaultRoom() {
  const room = getOrCreateRoom()
  for (const member of room.getMembers()) {
    room.removeMember(member.name)
  }
}

describe('route handlers', () => {
  beforeEach(() => {
    clearDefaultRoom()
  })

  it('rejects missing fields', () => {
    const set: { status?: number } = {}

    const result = handleConnect({ name: '', description: '' }, set)

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'name and description are required' })
  })

  it('registers a member and returns the channel id', () => {
    const set: { status?: number } = {}

    const result = handleConnect(
      { name: 'alpha', description: 'frontend agent' },
      set,
    )

    expect(set.status).toBeUndefined()
    expect(result).toEqual({ channel_id: 'general' })
  })

  it('rejects duplicate member names', () => {
    handleConnect({ name: 'alpha', description: 'frontend agent' }, {})
    const set: { status?: number } = {}

    const result = handleConnect(
      { name: 'alpha', description: 'duplicate' },
      set,
    )

    expect(set.status).toBe(409)
    expect(result).toEqual({ error: 'name "alpha" is already taken' })
  })

  it('returns the current member list', () => {
    handleConnect({ name: 'alpha', description: 'frontend agent' }, {})

    expect(handleMembers()).toEqual({
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'general',
        },
      ],
    })
  })

  it('exposes Elysia route adapters that delegate to the handlers', () => {
    const set: { status?: number } = {}

    expect(
      routeHandlers.connect({
        body: { name: 'alpha', description: 'frontend agent' },
        set,
      }),
    ).toEqual({ channel_id: 'general' })
    expect(routeHandlers.members()).toEqual({
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'general',
        },
      ],
    })
  })
})
