import type { AgentRuntime } from '@chatroom/shared'
import type { SpawnedAgentStatus } from './types.js'

export interface AgentSessionConfig {
  runtime: AgentRuntime
  agentName: string
  roleDescription: string
  systemPrompt?: string
  model?: string
  maxTurns?: number
  projectId: string
  runId: string
  serverUrl: string
}

export interface AgentSession {
  readonly status: SpawnedAgentStatus
  readonly agentName: string
  readonly runtime: AgentRuntime
  start(): Promise<void>
  stop(): Promise<void>
  onStatusChange(cb: (status: SpawnedAgentStatus) => void): void
}

export type AgentSessionFactory = (config: AgentSessionConfig) => AgentSession
