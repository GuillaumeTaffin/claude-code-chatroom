import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVER_URL,
  getProjectId,
  getRunId,
  getServerUrl,
  getWsUrl,
} from './config.js'

describe('connector config', () => {
  it('returns the default server url when CHATROOM_URL is unset', () => {
    expect(getServerUrl({})).toBe(DEFAULT_SERVER_URL)
  })

  it('returns the configured server url when CHATROOM_URL is set', () => {
    expect(getServerUrl({ CHATROOM_URL: 'https://chatroom.example.com' })).toBe(
      'https://chatroom.example.com',
    )
  })

  it('returns the configured project id when CHATROOM_PROJECT_ID is set', () => {
    expect(getProjectId({ CHATROOM_PROJECT_ID: ' project-7 ' })).toBe(
      'project-7',
    )
    expect(getProjectId({})).toBeNull()
  })

  it('returns the configured run id when CHATROOM_RUN_ID is set', () => {
    expect(getRunId({ CHATROOM_RUN_ID: ' run-42 ' })).toBe('run-42')
    expect(getRunId({})).toBeNull()
  })

  it('derives websocket urls from server urls', () => {
    expect(getWsUrl('http://localhost:3000')).toBe('ws://localhost:3000')
    expect(getWsUrl('https://chatroom.example.com')).toBe(
      'wss://chatroom.example.com',
    )
  })
})
