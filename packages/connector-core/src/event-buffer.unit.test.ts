import { describe, expect, it, vi } from 'vitest'
import {
  clampWaitForEventsOptions,
  createChatEventBuffer,
  eventMatchesWaitOptions,
} from './event-buffer.js'

function messageEvent(
  overrides: Partial<{
    sender: string
    sender_role: string
    text: string
    mentions: string[]
    timestamp: string
  }> = {},
) {
  return {
    type: 'message' as const,
    sender: overrides.sender ?? 'alpha',
    sender_role: overrides.sender_role ?? 'frontend agent',
    text: overrides.text ?? 'hello',
    mentions: overrides.mentions ?? [],
    timestamp: overrides.timestamp ?? '2026-04-05T00:00:00.000Z',
  }
}

function joinedEvent() {
  return {
    type: 'member_joined' as const,
    name: 'beta',
    description: 'backend agent',
    timestamp: '2026-04-05T00:00:01.000Z',
  }
}

function leftEvent() {
  return {
    type: 'member_left' as const,
    name: 'gamma',
    timestamp: '2026-04-05T00:00:02.000Z',
  }
}

describe('chat event buffer', () => {
  it('clamps wait options into the supported range', () => {
    expect(
      clampWaitForEventsOptions({
        timeoutMs: 99_999,
        maxEvents: 0,
      }),
    ).toEqual({
      timeoutMs: 55_000,
      maxEvents: 1,
      mentionsOnly: false,
      includeSystem: true,
    })
  })

  it('matches events according to mentions and system filters', () => {
    const waitOptions = clampWaitForEventsOptions({
      mentionsOnly: true,
      includeSystem: false,
    })

    expect(
      eventMatchesWaitOptions(
        messageEvent({ mentions: ['alpha'] }),
        waitOptions,
        {
          connectedName: 'alpha',
        },
      ),
    ).toBe(true)
    expect(
      eventMatchesWaitOptions(messageEvent(), waitOptions, {
        connectedName: 'alpha',
      }),
    ).toBe(false)
    expect(
      eventMatchesWaitOptions(joinedEvent(), waitOptions, {
        connectedName: 'alpha',
      }),
    ).toBe(false)
  })

  it('returns buffered matching events immediately and keeps unmatched events queued', async () => {
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    buffer.push(messageEvent())
    buffer.push(joinedEvent())

    await expect(
      buffer.waitForEvents(
        { includeSystem: false },
        {
          connectedName: 'alpha',
        },
      ),
    ).resolves.toEqual({
      events: [messageEvent()],
      timedOut: false,
    })

    expect(buffer.size).toBe(1)
  })

  it('waits for matching events and rejects concurrent waits', async () => {
    vi.useFakeTimers()
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    const waitPromise = buffer.waitForEvents(
      { mentionsOnly: true, timeoutMs: 25 },
      {
        connectedName: 'alpha',
      },
    )

    await expect(
      buffer.waitForEvents({}, { connectedName: 'alpha' }),
    ).rejects.toThrow('Another wait_for_events call is already pending.')

    buffer.push(messageEvent({ mentions: ['alpha'] }))

    await expect(waitPromise).resolves.toEqual({
      events: [messageEvent({ mentions: ['alpha'] })],
      timedOut: false,
    })
    expect(buffer.hasPendingWait).toBe(false)
    vi.useRealTimers()
  })

  it('keeps a pending wait open when a pushed event does not match', async () => {
    vi.useFakeTimers()
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    const waitPromise = buffer.waitForEvents(
      { mentionsOnly: true, timeoutMs: 20 },
      {
        connectedName: 'alpha',
      },
    )

    buffer.push(joinedEvent())
    expect(buffer.hasPendingWait).toBe(true)

    await vi.advanceTimersByTimeAsync(20)

    await expect(waitPromise).resolves.toEqual({
      events: [],
      timedOut: true,
    })
    vi.useRealTimers()
  })

  it('can drain matching events while a full unmatched queue stays at capacity', async () => {
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
      maxSize: 1,
    })

    buffer.push(joinedEvent())

    await expect(
      buffer.waitForEvents(
        { mentionsOnly: true, timeoutMs: 0 },
        {
          connectedName: 'alpha',
        },
      ),
    ).resolves.toEqual({
      events: [],
      timedOut: true,
    })

    expect(buffer.size).toBe(1)
  })

  it('times out cleanly and supports zero-timeout polls', async () => {
    vi.useFakeTimers()
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    const waitPromise = buffer.waitForEvents(
      { timeoutMs: 10 },
      {
        connectedName: 'alpha',
      },
    )

    await vi.advanceTimersByTimeAsync(10)

    await expect(waitPromise).resolves.toEqual({
      events: [],
      timedOut: true,
    })

    await expect(
      buffer.waitForEvents({ timeoutMs: 0 }, { connectedName: 'alpha' }),
    ).resolves.toEqual({
      events: [],
      timedOut: true,
    })
    vi.useRealTimers()
  })

  it('filters mentions without discarding unmatched events', async () => {
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    buffer.push(messageEvent())
    buffer.push(messageEvent({ text: 'ping alpha', mentions: ['alpha'] }))

    await expect(
      buffer.waitForEvents(
        { mentionsOnly: true },
        {
          connectedName: 'alpha',
        },
      ),
    ).resolves.toEqual({
      events: [messageEvent({ text: 'ping alpha', mentions: ['alpha'] })],
      timedOut: false,
    })

    expect(buffer.size).toBe(1)
  })

  it('drops oldest events on overflow and warns once until the queue shrinks', async () => {
    const logger = { warn: vi.fn() }
    const buffer = createChatEventBuffer({
      logger,
      maxSize: 2,
    })

    buffer.push(messageEvent({ text: 'one' }))
    buffer.push(joinedEvent())
    buffer.push(leftEvent())
    buffer.push(messageEvent({ text: 'two' }))

    expect(logger.warn).toHaveBeenCalledTimes(1)

    await expect(
      buffer.waitForEvents(
        { includeSystem: true, maxEvents: 5 },
        {
          connectedName: 'alpha',
        },
      ),
    ).resolves.toEqual({
      events: [leftEvent(), messageEvent({ text: 'two' })],
      timedOut: false,
    })

    buffer.push(messageEvent({ text: 'three' }))
    buffer.push(messageEvent({ text: 'four' }))
    buffer.push(messageEvent({ text: 'five' }))

    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending wait and clears the queue', async () => {
    vi.useFakeTimers()
    const buffer = createChatEventBuffer({
      logger: { warn: vi.fn() },
    })

    buffer.push(messageEvent())
    buffer.clear()
    expect(buffer.size).toBe(0)

    const waitPromise = buffer.waitForEvents(
      { timeoutMs: 100 },
      {
        connectedName: 'alpha',
      },
    )

    buffer.cancelPendingWait(new Error('closed'))

    await expect(waitPromise).rejects.toThrow('closed')
    expect(() =>
      buffer.cancelPendingWait(new Error('closed again')),
    ).not.toThrow()
    vi.useRealTimers()
  })
})
