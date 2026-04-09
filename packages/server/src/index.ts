import { createSpawnManager } from '@chatroom/spawner'
import { createClaudeSessionFactory } from '@chatroom/spawner'
import { createApp } from './app.js'
import { createProjectChatDependencies } from './state.js'

const PORT = Number(process.env.PORT) || 3000

const claudeFactory = createClaudeSessionFactory({
  query: async function* () {
    // Stub: real SDK integration plugs in here
    console.error('[spawner] Claude agent session started (stub)')
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
