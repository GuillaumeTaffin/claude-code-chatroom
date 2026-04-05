import { describe, expect, it } from 'vitest'
import { DEFAULT_SERVER_URL, getServerUrl, getWsUrl } from './config.js'

describe('connector config', () => {
  it('returns the default server url when CHATROOM_URL is unset', () => {
    expect(getServerUrl({})).toBe(DEFAULT_SERVER_URL)
  })

  it('returns the configured server url when CHATROOM_URL is set', () => {
    expect(getServerUrl({ CHATROOM_URL: 'https://chatroom.example.com' })).toBe(
      'https://chatroom.example.com',
    )
  })

  it('derives websocket urls from server urls', () => {
    expect(getWsUrl('http://localhost:3000')).toBe('ws://localhost:3000')
    expect(getWsUrl('https://chatroom.example.com')).toBe(
      'wss://chatroom.example.com',
    )
  })
})
