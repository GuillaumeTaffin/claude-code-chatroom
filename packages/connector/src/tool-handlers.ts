import { makeRequest } from '@chatroom/shared'
import type { ChatroomApi } from './chatroom-api.js'
import type { ConnectorSessionState } from './session-state.js'
import type { ChatroomWebSocketClient } from './chatroom-ws.js'

function successContent(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  }
}

function errorContent(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  }
}

export interface ToolHandlers {
  connectChat(args: {
    name: string
    description: string
  }): Promise<
    ReturnType<typeof successContent> | ReturnType<typeof errorContent>
  >
  sendMessage(args: {
    channel_id: string
    text: string
    mentions?: string[]
  }): Promise<
    ReturnType<typeof successContent> | ReturnType<typeof errorContent>
  >
  listMembers(): Promise<
    ReturnType<typeof successContent> | ReturnType<typeof errorContent>
  >
}

export interface CreateToolHandlersOptions {
  api: ChatroomApi
  wsClient: ChatroomWebSocketClient
  state: ConnectorSessionState
}

export function formatMemberList(
  members: Array<{ name: string; description: string }>,
): string {
  return members
    .map((member) => `- ${member.name}: ${member.description}`)
    .join('\n')
}

export function createToolHandlers({
  api,
  wsClient,
  state,
}: CreateToolHandlersOptions): ToolHandlers {
  return {
    async connectChat(args: { name: string; description: string }) {
      if (state.connectedName) {
        return successContent(`Already connected as "${state.connectedName}"`)
      }

      try {
        const data = await api.connect(args.name, args.description)
        await wsClient.connect(args.name)
        state.setIdentity(args.name, data.channel_id)

        return successContent(
          `Connected to chatroom as "${args.name}" (channel_id: ${data.channel_id})`,
        )
      } catch (error) {
        state.clearIdentity()
        return errorContent(`Connection error: ${(error as Error).message}`)
      }
    },

    async sendMessage(args: {
      channel_id: string
      text: string
      mentions?: string[]
    }) {
      if (!state.connectedName || !state.wsConnection) {
        return errorContent('Not connected. Call connect_chat first.')
      }

      if (args.channel_id !== state.channelId) {
        return errorContent(
          `Invalid channel_id. Expected "${state.channelId}".`,
        )
      }

      try {
        const id = state.nextRpcId()
        const request = makeRequest(id, 'send_message', {
          channel_id: args.channel_id,
          text: args.text,
          mentions: args.mentions ?? [],
        })

        await wsClient.sendRpcRequest(id, request)
        return successContent('Message sent.')
      } catch (error) {
        return errorContent(`Send failed: ${(error as Error).message}`)
      }
    },

    async listMembers() {
      try {
        const data = await api.listMembers()

        if (data.members.length === 0) {
          return successContent('No members connected.')
        }

        return successContent(
          `Connected members:\n${formatMemberList(data.members)}`,
        )
      } catch (error) {
        return errorContent(`Error: ${(error as Error).message}`)
      }
    },
  }
}
