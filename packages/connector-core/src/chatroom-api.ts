import type {
  ConnectRequest,
  ConnectResponse,
  MembersResponse,
  RuntimeIdentity,
} from '@chatroom/shared'

export interface ChatroomMember {
  name: string
  description: string
  channel_id: string
}

export interface ChatroomApi {
  connect(
    name: string,
    description: string,
    projectId: string,
    runId?: string,
    runtime?: RuntimeIdentity,
  ): Promise<ConnectResponse>
  listMembers(projectId: string): Promise<MembersResponse>
}

export interface CreateChatroomApiOptions {
  fetchImpl: typeof fetch
  serverUrl: string
}

export function createChatroomApi({
  fetchImpl,
  serverUrl,
}: CreateChatroomApiOptions): ChatroomApi {
  return {
    async connect(
      name: string,
      description: string,
      projectId: string,
      runId?: string,
      runtime?: RuntimeIdentity,
    ) {
      const request: ConnectRequest = {
        name,
        description,
        project_id: projectId,
        ...(runId && { run_id: runId }),
        ...(runtime && { runtime }),
      }

      const response = await fetchImpl(`${serverUrl}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error || response.statusText)
      }

      return (await response.json()) as ConnectResponse
    },

    async listMembers(projectId: string) {
      const response = await fetchImpl(
        `${serverUrl}/members?project_id=${encodeURIComponent(projectId)}`,
      )
      if (!response.ok) {
        throw new Error(response.statusText)
      }

      return (await response.json()) as MembersResponse
    },
  }
}
