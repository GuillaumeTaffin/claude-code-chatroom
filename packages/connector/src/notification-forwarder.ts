import type {
  MemberJoinedParams,
  MemberLeftParams,
  NewMessageParams,
} from '@chatroom/shared'

export interface ClaudeChannelNotification {
  method: 'notifications/claude/channel'
  params: {
    content: string
    meta: Record<string, string>
  }
}

export interface NotificationForwarderDependencies {
  notify: (notification: ClaudeChannelNotification) => Promise<void>
  logger: Pick<Console, 'error'>
}

export async function forwardServerNotification(
  dependencies: NotificationForwarderDependencies,
  method: string,
  params: unknown,
) {
  try {
    switch (method) {
      case 'new_message': {
        const payload = params as NewMessageParams
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: payload.text,
            meta: {
              sender: payload.sender,
              sender_role: payload.sender_role,
              mentions: payload.mentions.join(','),
              type: 'message',
            },
          },
        })
        break
      }

      case 'member_joined': {
        const payload = params as MemberJoinedParams
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: `${payload.name} joined the chatroom (${payload.description})`,
            meta: {
              type: 'system',
              event: 'joined',
              name: payload.name,
              description: payload.description,
            },
          },
        })
        break
      }

      case 'member_left': {
        const payload = params as MemberLeftParams
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: `${payload.name} left the chatroom`,
            meta: {
              type: 'system',
              event: 'left',
              name: payload.name,
            },
          },
        })
        break
      }
    }
  } catch (error) {
    dependencies.logger.error(
      '[connector] Failed to forward notification:',
      error,
    )
  }
}
