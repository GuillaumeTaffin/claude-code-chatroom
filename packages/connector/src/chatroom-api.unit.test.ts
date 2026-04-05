import { describe, expect, it, vi } from 'vitest'
import { createChatroomApi } from './chatroom-api.js'

function createJsonResponse({
  ok = true,
  statusText = 'OK',
  json,
}: {
  ok?: boolean
  statusText?: string
  json: unknown
}): Response {
  return {
    ok,
    statusText,
    json: async () => json,
  } as Response
}

describe('chatroom api', () => {
  it('connects to the server and returns the channel id', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: { channel_id: 'general' },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.connect('alpha', 'frontend agent')).resolves.toEqual({
      channel_id: 'general',
    })
  })

  it('throws a server-provided connect error', async () => {
    const api = createChatroomApi({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          ok: false,
          statusText: 'Conflict',
          json: { error: 'name already taken' },
        }),
      ),
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.connect('alpha', 'frontend agent')).rejects.toThrow(
      'name already taken',
    )
  })

  it('falls back to the HTTP status text when a connect error payload is empty', async () => {
    const api = createChatroomApi({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          ok: false,
          statusText: 'Bad Request',
          json: {},
        }),
      ),
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.connect('alpha', 'frontend agent')).rejects.toThrow(
      'Bad Request',
    )
  })

  it('lists chatroom members', async () => {
    const api = createChatroomApi({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          json: {
            members: [
              {
                name: 'alpha',
                description: 'frontend agent',
                channel_id: 'general',
              },
            ],
          },
        }),
      ),
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.listMembers()).resolves.toEqual({
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'general',
        },
      ],
    })
  })

  it('throws on member list failures', async () => {
    const api = createChatroomApi({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        createJsonResponse({
          ok: false,
          statusText: 'Service Unavailable',
          json: {},
        }),
      ),
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.listMembers()).rejects.toThrow('Service Unavailable')
  })
})
