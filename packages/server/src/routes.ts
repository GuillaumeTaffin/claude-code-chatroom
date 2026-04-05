import { Elysia, t } from 'elysia'
import type { ConnectResponse, MembersResponse } from '@chatroom/shared'
import { getOrCreateRoom, DEFAULT_CHANNEL_ID } from './state.js'

export function handleConnect(
  body: { name: string; description: string },
  set: { status?: number | string },
) {
  const room = getOrCreateRoom(DEFAULT_CHANNEL_ID)

  if (!body.name || !body.description) {
    set.status = 400
    return { error: 'name and description are required' }
  }

  if (!room.addMember({ name: body.name, description: body.description })) {
    set.status = 409
    return { error: `name "${body.name}" is already taken` }
  }

  return { channel_id: room.channelId } satisfies ConnectResponse
}

export function handleMembers() {
  const room = getOrCreateRoom(DEFAULT_CHANNEL_ID)
  return { members: room.getMembers() } satisfies MembersResponse
}

/* v8 ignore start -- framework route wiring delegates to tested handlers */
export const routes = new Elysia()
  .post('/connect', ({ body, set }) => handleConnect(body, set), {
    body: t.Object({
      name: t.String(),
      description: t.String(),
    }),
  })
  .get('/members', () => handleMembers())
/* v8 ignore stop */
