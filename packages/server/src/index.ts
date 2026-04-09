import {
  createSpawnManager,
  createClaudeSessionFactory,
  type ClaudeQueryHandle,
} from '@chatroom/spawner'
import { createApp } from './app.js'
import { createProjectChatDependencies } from './state.js'

const PORT = Number(process.env.PORT) || 3000

const claudeFactory = createClaudeSessionFactory({
  query: (options) => {
    // Stub: real SDK integration plugs in here
    // Replace this body with: import('@anthropic-ai/claude-agent-sdk').then(sdk => sdk.query(options))
    console.error(
      '[spawner] Claude agent session started (stub)',
      options.prompt.slice(0, 60),
    )
    return {
      async streamInput() {},
      async *[Symbol.asyncIterator]() {},
    } as ClaudeQueryHandle
  },
})

const spawnManager = createSpawnManager({
  serverUrl: `http://localhost:${PORT}`,
  sessionFactory: claudeFactory,
})

const dependencies = createProjectChatDependencies({ spawnManager })

export const app = createApp(dependencies).listen(PORT)

console.log(`Chatroom server running on http://localhost:${PORT}`)

export type App = typeof app
