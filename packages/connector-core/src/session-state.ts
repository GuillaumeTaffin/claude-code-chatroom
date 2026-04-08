export interface ConnectorWebSocket {
  send(data: string): void
  close?(): void
}

export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface ConnectorSessionState {
  readonly connectedName: string | null
  readonly projectId: string | null
  readonly channelId: string | null
  readonly runId: string | null
  readonly wsConnection: ConnectorWebSocket | null
  readonly pendingRequests: Map<string | number, PendingRequest>
  setIdentity(
    name: string,
    projectId: string,
    channelId: string,
    runId?: string | null,
  ): void
  clearIdentity(): void
  setWsConnection(connection: ConnectorWebSocket): void
  clearWsConnection(): void
  nextRpcId(): number
}

export function createConnectorSessionState(): ConnectorSessionState {
  let connectedName: string | null = null
  let projectId: string | null = null
  let channelId: string | null = null
  let runId: string | null = null
  let wsConnection: ConnectorWebSocket | null = null
  let rpcIdCounter = 0
  const pendingRequests = new Map<string | number, PendingRequest>()

  return {
    get connectedName() {
      return connectedName
    },
    get projectId() {
      return projectId
    },
    get channelId() {
      return channelId
    },
    get runId() {
      return runId
    },
    get wsConnection() {
      return wsConnection
    },
    get pendingRequests() {
      return pendingRequests
    },
    setIdentity(
      name: string,
      nextProjectId: string,
      nextChannelId: string,
      nextRunId?: string | null,
    ) {
      connectedName = name
      projectId = nextProjectId
      channelId = nextChannelId
      runId = nextRunId ?? null
    },
    clearIdentity() {
      connectedName = null
      projectId = null
      channelId = null
      runId = null
    },
    setWsConnection(connection: ConnectorWebSocket) {
      wsConnection = connection
    },
    clearWsConnection() {
      wsConnection = null
    },
    nextRpcId() {
      rpcIdCounter += 1
      return rpcIdCounter
    },
  }
}
