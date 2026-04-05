import { describe, expect, it } from 'vitest'
import { formatMemberList, serverUrlToWsUrl } from './utils.js'

describe('connector utils', () => {
  it('derives the websocket endpoint from an http server url', () => {
    expect(serverUrlToWsUrl('http://localhost:3000')).toBe(
      'ws://localhost:3000',
    )
    expect(serverUrlToWsUrl('https://chatroom.example.com')).toBe(
      'wss://chatroom.example.com',
    )
  })

  it('formats the member list for MCP tool output', () => {
    expect(
      formatMemberList([
        { name: 'alpha', description: 'frontend agent' },
        { name: 'beta', description: 'backend agent' },
      ]),
    ).toBe('- alpha: frontend agent\n- beta: backend agent')
  })
})
