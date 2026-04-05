import type { WaitForEventsResult } from '@chatroom/connector-core'

export function formatWaitForEventsResult(
  result: WaitForEventsResult,
  timeoutMs: number,
): string {
  const payload = JSON.stringify({
    timed_out: result.timedOut,
    events: result.events,
  })

  if (result.timedOut) {
    return `No matching events arrived within ${timeoutMs}ms.\n${payload}`
  }

  return `Received ${result.events.length} event(s).\n${payload}`
}
