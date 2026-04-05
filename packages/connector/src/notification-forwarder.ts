import type { ChatEvent } from '@chatroom/shared'

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
  event: ChatEvent,
) {
  try {
    switch (event.type) {
      case 'message': {
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: event.text,
            meta: {
              sender: event.sender,
              sender_role: event.sender_role,
              mentions: event.mentions.join(','),
              type: 'message',
            },
          },
        })
        break
      }

      case 'member_joined': {
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: `${event.name} joined the chatroom (${event.description})`,
            meta: {
              type: 'system',
              event: 'joined',
              name: event.name,
              description: event.description,
            },
          },
        })
        break
      }

      case 'member_left': {
        await dependencies.notify({
          method: 'notifications/claude/channel',
          params: {
            content: `${event.name} left the chatroom`,
            meta: {
              type: 'system',
              event: 'left',
              name: event.name,
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
