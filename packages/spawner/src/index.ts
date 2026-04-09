export type {
  AgentSession,
  AgentSessionConfig,
  AgentSessionFactory,
} from './agent-session.js'
export type {
  ChatroomTools,
  ChatroomToolsConfig,
  ChatroomMessage,
  ChatroomMessageCallback,
} from './chatroom-tools.js'
export { createChatroomTools } from './chatroom-tools.js'
export type {
  ProjectAgentMember,
  SpawnManager,
  SpawnManagerConfig,
} from './spawn-manager.js'
export { createSpawnManager } from './spawn-manager.js'
export type {
  SpawnedAgentStatus,
  SpawnedAgentInfo,
  RunSpawnStatus,
} from './types.js'
export {
  createClaudeSession,
  createClaudeSessionFactory,
  buildPrompt,
} from './claude-adapter.js'
export type {
  ClaudeAgentDependencies,
  ClaudeQueryHandle,
} from './claude-adapter.js'
export {
  createCopilotSession,
  createCopilotSessionFactory,
  extractCopilotText,
} from './copilot-adapter.js'
export type {
  CopilotAgentDependencies,
  CopilotClientHandle,
  CopilotSessionHandle,
} from './copilot-adapter.js'
