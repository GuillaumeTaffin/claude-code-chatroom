import { describe, expect, it, vi } from 'vitest'
import { forwardServerNotification } from './notification-forwarder.js'

describe('notification forwarder', () => {
  it('forwards new messages', async () => {
    const notify = vi.fn().mockResolvedValue(undefined)

    await forwardServerNotification(
      { notify, logger: console },
      {
        type: 'message',
        sender: 'alpha',
        sender_role: 'frontend agent',
        text: 'hello',
        mentions: ['beta'],
        timestamp: '2026-04-05T00:00:00.000Z',
      },
    )

    expect(notify).toHaveBeenCalledWith({
      method: 'notifications/claude/channel',
      params: {
        content: 'hello',
        meta: {
          sender: 'alpha',
          sender_role: 'frontend agent',
          mentions: 'beta',
          type: 'message',
        },
      },
    })
  })

  it('forwards member joined and left events', async () => {
    const notify = vi.fn().mockResolvedValue(undefined)

    await forwardServerNotification(
      { notify, logger: console },
      {
        type: 'member_joined',
        name: 'alpha',
        description: 'frontend agent',
        timestamp: '2026-04-05T00:00:01.000Z',
      },
    )

    await forwardServerNotification(
      { notify, logger: console },
      {
        type: 'member_left',
        name: 'alpha',
        timestamp: '2026-04-05T00:00:02.000Z',
      },
    )

    expect(notify).toHaveBeenNthCalledWith(1, {
      method: 'notifications/claude/channel',
      params: {
        content: 'alpha joined the chatroom (frontend agent)',
        meta: {
          type: 'system',
          event: 'joined',
          name: 'alpha',
          description: 'frontend agent',
        },
      },
    })
    expect(notify).toHaveBeenNthCalledWith(2, {
      method: 'notifications/claude/channel',
      params: {
        content: 'alpha left the chatroom',
        meta: {
          type: 'system',
          event: 'left',
          name: 'alpha',
        },
      },
    })
  })

  it('logs notification forwarding failures', async () => {
    const logger = { error: vi.fn() }

    await forwardServerNotification(
      {
        notify: vi.fn().mockRejectedValue(new Error('failed')),
        logger,
      },
      {
        type: 'message',
        sender: 'alpha',
        sender_role: 'frontend agent',
        text: 'hello',
        mentions: [],
        timestamp: '2026-04-05T00:00:00.000Z',
      },
    )

    expect(logger.error).toHaveBeenCalledWith(
      '[connector] Failed to forward notification:',
      expect.any(Error),
    )
  })
})
