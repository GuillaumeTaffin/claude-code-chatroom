import type { ChatroomClient } from '@chatroom/connector-core'
import type { RuntimeIdentity } from '@chatroom/shared'
import { formatWaitForEventsResult } from './event-result-format.js'

const COPILOT_RUNTIME: RuntimeIdentity = {
  runtime_id: 'copilot',
  runtime_version: null,
  capabilities: {
    can_stream_events: false,
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
  waitForEvents(args: {
    timeout_ms?: number
    max_events?: number
    mentions_only?: boolean
    include_system?: boolean
  }): Promise<
    ReturnType<typeof successContent> | ReturnType<typeof errorContent>
  >
}

export interface CreateToolHandlersOptions {
  client: ChatroomClient
}

function formatMemberList(
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
    async connectChat(args) {
      if (client.connectedName) {
        return successContent(`Already connected as "${client.connectedName}"`)
      }

      try {
        const data = await client.connect(
          args.name,
          args.description,
          args.project_id,
          args.run_id,
          COPILOT_RUNTIME,
        )

        return successContent(
          `Connected to project "${data.project_id}" as "${args.name}" (channel_id: ${data.channel_id})`,
        )
      } catch (error) {
        return errorContent(`Connection error: ${(error as Error).message}`)
      }
    },

    async sendMessage(args) {
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

    async waitForEvents(args) {
      const timeoutMs = args.timeout_ms ?? 30_000

      try {
        const result = await client.waitForEvents({
          timeoutMs,
          maxEvents: args.max_events,
          mentionsOnly: args.mentions_only,
          includeSystem: args.include_system,
        })

        return successContent(formatWaitForEventsResult(result, timeoutMs))
      } catch (error) {
        return errorContent((error as Error).message)
      }
    },
  }
}
