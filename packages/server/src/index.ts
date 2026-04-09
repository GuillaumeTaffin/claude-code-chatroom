import { query } from '@anthropic-ai/claude-agent-sdk'
import {
  createSpawnManager,
  createClaudeSessionFactory,
  type ClaudeAgentDependencies,
} from '@chatroom/spawner'
import { createApp } from './app.js'
import { createProjectChatDependencies } from './state.js'

const PORT = Number(process.env.PORT) || 3000

const claudeFactory = createClaudeSessionFactory({
  query: query as unknown as ClaudeAgentDependencies['query'],
})

const spawnManager = createSpawnManager({
  serverUrl: `http://localhost:${PORT}`,
  sessionFactory: claudeFactory,
})

const dependencies = createProjectChatDependencies({ spawnManager })

export const app = createApp(dependencies).listen(PORT)

console.log(`Chatroom server running on http://localhost:${PORT}`)

export type App = typeof app
