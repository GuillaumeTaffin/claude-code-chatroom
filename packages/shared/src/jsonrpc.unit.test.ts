import { describe, expect, it } from 'vitest'
import {
  INTERNAL_ERROR,
  INVALID_CHANNEL,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  NOT_CONNECTED,
  isNotification,
  isRequest,
  isResponse,
  makeErrorResponse,
  makeNotification,
  makeRequest,
  makeResponse,
} from './jsonrpc.js'

describe('jsonrpc helpers', () => {
  it('builds a request and identifies it as a request', () => {
    const request = makeRequest(1, 'send_message', { text: 'hello' })

    expect(request).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'send_message',
      params: { text: 'hello' },
    })
    expect(isRequest(request)).toBe(true)
    expect(isNotification(request)).toBe(false)
    expect(isResponse(request)).toBe(false)
  })

  it('builds a response and identifies it as a response', () => {
    const response = makeResponse(2, { ok: true })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: { ok: true },
    })
    expect(isResponse(response)).toBe(true)
    expect(isRequest(response)).toBe(false)
  })

  it('builds an error response with the provided details', () => {
    const error = makeErrorResponse(3, INVALID_PARAMS, 'Missing channel', {
      field: 'channel_id',
    })

    expect(error).toEqual({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: INVALID_PARAMS,
        message: 'Missing channel',
        data: { field: 'channel_id' },
      },
    })
  })

  it('builds a notification and identifies it as a notification', () => {
    const notification = makeNotification('member_joined', { name: 'agent' })

    expect(notification).toEqual({
      jsonrpc: '2.0',
      method: 'member_joined',
      params: { name: 'agent' },
    })
    expect(isNotification(notification)).toBe(true)
    expect(isRequest(notification)).toBe(false)
    expect(isResponse(notification)).toBe(false)
  })

  it('exports stable application error codes', () => {
    expect({
      INTERNAL_ERROR,
      METHOD_NOT_FOUND,
      NOT_CONNECTED,
      INVALID_CHANNEL,
    }).toEqual({
      INTERNAL_ERROR: -32603,
      METHOD_NOT_FOUND: -32601,
      NOT_CONNECTED: -32000,
      INVALID_CHANNEL: -32002,
    })
  })
})
