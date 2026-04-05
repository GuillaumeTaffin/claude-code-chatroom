import { describe, expect, it } from 'vitest'
import { formatWaitForEventsResult } from './event-result-format.js'

describe('wait_for_events result formatter', () => {
  it('formats timeout results', () => {
    expect(
      formatWaitForEventsResult(
        {
          events: [],
          timedOut: true,
        },
        30_000,
      ),
    ).toBe(
      'No matching events arrived within 30000ms.\n{"timed_out":true,"events":[]}',
    )
  })

  it('formats event results', () => {
    expect(
      formatWaitForEventsResult(
        {
          timedOut: false,
          events: [
            {
              type: 'message',
              sender: 'alpha',
              sender_role: 'frontend agent',
              text: 'hello',
              mentions: ['beta'],
              timestamp: '2026-04-05T00:00:00.000Z',
            },
          ],
        },
        30_000,
      ),
    ).toBe(
      'Received 1 event(s).\n{"timed_out":false,"events":[{"type":"message","sender":"alpha","sender_role":"frontend agent","text":"hello","mentions":["beta"],"timestamp":"2026-04-05T00:00:00.000Z"}]}',
    )
  })
})
