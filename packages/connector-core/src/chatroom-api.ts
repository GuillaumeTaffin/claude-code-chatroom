import type { ConnectResponse, MembersResponse } from '@chatroom/shared'

export interface ChatroomMember {
  name: string
  description: string
  channel_id: string
}

export interface ChatroomApi {
  connect(name: string, description: string): Promise<ConnectResponse>
  listMembers(): Promise<MembersResponse>
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
    async connect(name: string, description: string) {
      const response = await fetchImpl(`${serverUrl}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error || response.statusText)
      }

      return (await response.json()) as ConnectResponse
    },

    async listMembers() {
      const response = await fetchImpl(`${serverUrl}/members`)
      if (!response.ok) {
        throw new Error(response.statusText)
      }

      return (await response.json()) as MembersResponse
    },
  }
}
