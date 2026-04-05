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

export const routeHandlers = {
  connect({
    body,
    set,
  }: {
    body: { name: string; description: string }
    set: { status?: number | string }
  }) {
    return handleConnect(body, set)
  },
  members() {
    return handleMembers()
  },
}

export const routes = new Elysia()
  .post('/connect', routeHandlers.connect, {
    body: t.Object({
      name: t.String(),
      description: t.String(),
    }),
  })
  .get('/members', routeHandlers.members)
