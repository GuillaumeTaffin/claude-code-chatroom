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
  it('connects to the server with project context and returns it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: { project_id: 'project-1', channel_id: 'project-1' },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await expect(
      api.connect('alpha', 'frontend agent', 'project-1'),
    ).resolves.toEqual({
      project_id: 'project-1',
      channel_id: 'project-1',
    })
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'alpha',
        description: 'frontend agent',
        project_id: 'project-1',
      }),
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

    await expect(
      api.connect('alpha', 'frontend agent', 'project-1'),
    ).rejects.toThrow('name already taken')
  })

  it('connects with run_id when provided', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: {
          project_id: 'project-1',
          channel_id: 'run-channel-1',
          run_id: 'run-1',
        },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await expect(
      api.connect('alpha', 'frontend agent', 'project-1', 'run-1'),
    ).resolves.toEqual({
      project_id: 'project-1',
      channel_id: 'run-channel-1',
      run_id: 'run-1',
    })
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'alpha',
        description: 'frontend agent',
        project_id: 'project-1',
        run_id: 'run-1',
      }),
    })
  })

  it('omits run_id from connect request when not provided', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: { project_id: 'project-1', channel_id: 'project-1' },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await api.connect('alpha', 'frontend agent', 'project-1')
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'alpha',
        description: 'frontend agent',
        project_id: 'project-1',
      }),
    })
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

    await expect(
      api.connect('alpha', 'frontend agent', 'project-1'),
    ).rejects.toThrow('Bad Request')
  })

  it('lists chatroom members for the selected project', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: {
          project_id: 'project-1',
          members: [
            {
              name: 'alpha',
              description: 'frontend agent',
              channel_id: 'project-1',
            },
          ],
        },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await expect(api.listMembers('project-1')).resolves.toEqual({
      project_id: 'project-1',
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: 'project-1',
        },
      ],
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3000/members?project_id=project-1',
    )
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

    await expect(api.listMembers('project-1')).rejects.toThrow(
      'Service Unavailable',
    )
  })

  it('connects with runtime identity', async () => {
    const runtime = {
      runtime_id: 'claude',
      runtime_version: null,
      capabilities: {
        can_stream_events: true,
        can_use_tools: true,
        can_manage_files: true,
        can_execute_commands: true,
      },
    }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: {
          project_id: 'project-1',
          channel_id: 'project-1',
          runtime,
        },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await expect(
      api.connect('alpha', 'claude agent', 'project-1', undefined, runtime),
    ).resolves.toEqual({
      project_id: 'project-1',
      channel_id: 'project-1',
      runtime,
    })
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'alpha',
        description: 'claude agent',
        project_id: 'project-1',
        runtime,
      }),
    })
  })

  it('omits runtime from connect request when not provided', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        json: { project_id: 'project-1', channel_id: 'project-1' },
      }),
    )

    const api = createChatroomApi({
      fetchImpl,
      serverUrl: 'http://localhost:3000',
    })

    await api.connect('alpha', 'frontend agent', 'project-1')
    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.runtime).toBeUndefined()
  })
})
