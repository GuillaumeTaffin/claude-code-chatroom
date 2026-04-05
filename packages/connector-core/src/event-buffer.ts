import type { ChatEvent } from '@chatroom/shared'

export interface WaitForEventsOptions {
  timeoutMs?: number
  maxEvents?: number
  mentionsOnly?: boolean
  includeSystem?: boolean
}

export interface WaitForEventsResult {
  events: ChatEvent[]
  timedOut: boolean
}

export interface EventBufferLogger {
  warn(message: string): void
}

interface WaitForEventsContext {
  connectedName: string | null
}

interface ResolvedWaitForEventsOptions {
  timeoutMs: number
  maxEvents: number
  mentionsOnly: boolean
  includeSystem: boolean
}

interface PendingWait {
  options: ResolvedWaitForEventsOptions
  context: WaitForEventsContext
  resolve: (result: WaitForEventsResult) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface ChatEventBuffer {
  readonly size: number
  readonly hasPendingWait: boolean
  push(event: ChatEvent): void
  waitForEvents(
    options: WaitForEventsOptions | undefined,
    context: WaitForEventsContext,
  ): Promise<WaitForEventsResult>
  cancelPendingWait(error: Error): void
  clear(): void
}

export interface CreateChatEventBufferOptions {
  logger: EventBufferLogger
  maxSize?: number
}

export function clampWaitForEventsOptions(
  options: WaitForEventsOptions = {},
): ResolvedWaitForEventsOptions {
  const timeoutMs = Math.max(0, Math.min(options.timeoutMs ?? 30_000, 55_000))
  const maxEvents = Math.max(1, Math.min(options.maxEvents ?? 20, 100))

  return {
    timeoutMs,
    maxEvents,
    mentionsOnly: options.mentionsOnly ?? false,
    includeSystem: options.includeSystem ?? true,
  }
}

export function eventMatchesWaitOptions(
  event: ChatEvent,
  options: ResolvedWaitForEventsOptions,
  context: WaitForEventsContext,
): boolean {
  if (!options.includeSystem && event.type !== 'message') {
    return false
  }

  if (
    options.mentionsOnly &&
    (event.type !== 'message' ||
      !context.connectedName ||
      !event.mentions.includes(context.connectedName))
  ) {
    return false
  }

  return true
}

export function createChatEventBuffer({
  logger,
  maxSize = 500,
}: CreateChatEventBufferOptions): ChatEventBuffer {
  const queue: ChatEvent[] = []
  let overflowWarned = false
  let pendingWait: PendingWait | null = null

  function resetOverflowWarningIfNeeded() {
    if (queue.length < maxSize) {
      overflowWarned = false
    }
  }

  function drainMatching(
    options: ResolvedWaitForEventsOptions,
    context: WaitForEventsContext,
  ): ChatEvent[] {
    const matched: ChatEvent[] = []
    const remaining: ChatEvent[] = []

    for (const event of queue) {
      if (
        matched.length < options.maxEvents &&
        eventMatchesWaitOptions(event, options, context)
      ) {
        matched.push(event)
        continue
      }

      remaining.push(event)
    }

    queue.splice(0, queue.length, ...remaining)
    resetOverflowWarningIfNeeded()
    return matched
  }

  function resolvePendingWaitIfPossible() {
    if (!pendingWait) return

    const events = drainMatching(pendingWait.options, pendingWait.context)
    if (events.length === 0) return

    clearTimeout(pendingWait.timeout)
    pendingWait.resolve({ events, timedOut: false })
    pendingWait = null
  }

  return {
    get size() {
      return queue.length
    },

    get hasPendingWait() {
      return pendingWait !== null
    },

    push(event: ChatEvent) {
      queue.push(event)

      while (queue.length > maxSize) {
        queue.shift()
        if (!overflowWarned) {
          logger.warn(
            `[connector-core] Event buffer exceeded ${maxSize} items; dropping oldest events.`,
          )
          overflowWarned = true
        }
      }

      resolvePendingWaitIfPossible()
    },

    waitForEvents(options, context) {
      if (pendingWait) {
        return Promise.reject(
          new Error('Another wait_for_events call is already pending.'),
        )
      }

      const resolvedOptions = clampWaitForEventsOptions(options)
      const immediateEvents = drainMatching(resolvedOptions, context)
      if (immediateEvents.length > 0) {
        return Promise.resolve({
          events: immediateEvents,
          timedOut: false,
        })
      }

      if (resolvedOptions.timeoutMs === 0) {
        return Promise.resolve({
          events: [],
          timedOut: true,
        })
      }

      return new Promise<WaitForEventsResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          const timedOutEvents = drainMatching(resolvedOptions, context)
          pendingWait = null
          resolve({
            events: timedOutEvents,
            timedOut: timedOutEvents.length === 0,
          })
        }, resolvedOptions.timeoutMs)

        pendingWait = {
          options: resolvedOptions,
          context,
          resolve,
          reject,
          timeout,
        }
      })
    },

    cancelPendingWait(error: Error) {
      if (!pendingWait) return

      clearTimeout(pendingWait.timeout)
      pendingWait.reject(error)
      pendingWait = null
    },

    clear() {
      queue.length = 0
      resetOverflowWarningIfNeeded()
    },
  }
}
