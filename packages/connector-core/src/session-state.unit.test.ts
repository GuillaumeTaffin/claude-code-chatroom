import { describe, expect, it, vi } from 'vitest'
import { createConnectorSessionState } from './session-state.js'

describe('connector session state', () => {
  it('tracks connection identity and websocket state', () => {
    const state = createConnectorSessionState()
    const socket = { send: vi.fn() }

    state.setIdentity('alpha', 'project-1', 'project-1')
    state.setWsConnection(socket)

    expect(state.connectedName).toBe('alpha')
    expect(state.projectId).toBe('project-1')
    expect(state.channelId).toBe('project-1')
    expect(state.runId).toBeNull()
    expect(state.wsConnection).toBe(socket)

    state.clearWsConnection()
    state.clearIdentity()

    expect(state.connectedName).toBeNull()
    expect(state.projectId).toBeNull()
    expect(state.channelId).toBeNull()
    expect(state.runId).toBeNull()
    expect(state.wsConnection).toBeNull()
  })

  it('tracks run_id in identity', () => {
    const state = createConnectorSessionState()

    state.setIdentity('alpha', 'project-1', 'channel-1', 'run-1')

    expect(state.runId).toBe('run-1')

    state.clearIdentity()

    expect(state.runId).toBeNull()
  })

  it('increments rpc ids monotonically', () => {
    const state = createConnectorSessionState()

    expect(state.nextRpcId()).toBe(1)
    expect(state.nextRpcId()).toBe(2)
  })
})
