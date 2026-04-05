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
    return `No matching events arrived within ${timeoutMs}ms. If you are still participating in the chatroom, call wait_for_events again.\n${payload}`
  }

  return `Received ${result.events.length} event(s). After handling them, call wait_for_events again if you are still participating in the chatroom.\n${payload}`
}
