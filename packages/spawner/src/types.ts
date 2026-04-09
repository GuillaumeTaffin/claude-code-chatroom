import type { AgentRuntime } from '@chatroom/shared'

export type SpawnedAgentStatus =
  | 'starting'
  | 'connected'
  | 'running'
  | 'stopped'
  | 'errored'

export interface SpawnedAgentInfo {
  role_id: string
  agent_name: string
  runtime: AgentRuntime
  status: SpawnedAgentStatus
  error?: string
  started_at: string
  stopped_at?: string
}

export interface RunSpawnStatus {
  run_id: string
  agents: SpawnedAgentInfo[]
}
