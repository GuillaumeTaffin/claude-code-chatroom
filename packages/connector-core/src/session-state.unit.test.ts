import { describe, expect, it, vi } from 'vitest'
import { createConnectorSessionState } from './session-state.js'

describe('connector session state', () => {
  it('tracks connection identity and websocket state', () => {
    const state = createConnectorSessionState()
    const socket = { send: vi.fn() }

    state.setIdentity('alpha', 'general')
    state.setWsConnection(socket)

    expect(state.connectedName).toBe('alpha')
    expect(state.channelId).toBe('general')
    expect(state.wsConnection).toBe(socket)

    state.clearWsConnection()
    state.clearIdentity()

    expect(state.connectedName).toBeNull()
    expect(state.channelId).toBeNull()
    expect(state.wsConnection).toBeNull()
  })

  it('increments rpc ids monotonically', () => {
    const state = createConnectorSessionState()

    expect(state.nextRpcId()).toBe(1)
    expect(state.nextRpcId()).toBe(2)
  })
})
