import type { ChatroomClient } from '@chatroom/connector-core'
import type { RuntimeIdentity } from '@chatroom/shared'

const CLAUDE_RUNTIME: RuntimeIdentity = {
  runtime_id: 'claude',
  runtime_version: null,
  capabilities: {
    can_stream_events: true,
    can_use_tools: true,
    can_manage_files: true,
    can_execute_commands: true,
  },
}

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
    project_id?: string
    run_id?: string
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
  client: ChatroomClient
}

export function formatMemberList(
  members: Array<{ name: string; description: string }>,
): string {
  return members
    .map((member) => `- ${member.name}: ${member.description}`)
    .join('\n')
}

export function createToolHandlers({
  client,
}: CreateToolHandlersOptions): ToolHandlers {
  return {
    async connectChat(args: {
      name: string
      description: string
      project_id?: string
      run_id?: string
    }) {
      if (client.connectedName) {
        return successContent(`Already connected as "${client.connectedName}"`)
      }

      try {
        const data = await client.connect(
          args.name,
          args.description,
          args.project_id,
          args.run_id,
          CLAUDE_RUNTIME,
        )

        return successContent(
          `Connected to project "${data.project_id}" as "${args.name}" (channel_id: ${data.channel_id})`,
        )
      } catch (error) {
        return errorContent(`Connection error: ${(error as Error).message}`)
      }
    },

    async sendMessage(args: {
      channel_id: string
      text: string
      mentions?: string[]
    }) {
      try {
        await client.sendMessage(args)
        return successContent('Message sent.')
      } catch (error) {
        return errorContent(`Send failed: ${(error as Error).message}`)
      }
    },

    async listMembers() {
      try {
        const data = await client.listMembers()

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
