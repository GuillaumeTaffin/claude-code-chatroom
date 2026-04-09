import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { CopilotClient } from '@github/copilot-sdk'
import {
  createSpawnManager,
  createClaudeSessionFactory,
  createCopilotSessionFactory,
  type ClaudeAgentDependencies,
  type ChatroomMcpHandlers,
  type CopilotClientHandle,
  type AgentSession,
  type AgentSessionConfig,
} from '@chatroom/spawner'
import { createApp } from './app.js'
import { createProjectChatDependencies } from './state.js'

const PORT = Number(process.env.PORT) || 3000

function createChatroomMcpServer(handlers: ChatroomMcpHandlers) {
  return createSdkMcpServer({
    name: 'chatroom',
    version: '0.0.1',
    tools: [
      tool(
        'send_message',
        'Post a message into the chatroom you are connected to. This is the ONLY way your reply reaches other members.',
        {
          text: z
            .string()
            .describe('The message text to post in the chatroom.'),
          mentions: z
            .array(z.string())
            .optional()
            .describe('Optional list of member names to @mention.'),
        },
        async (args) => {
          await handlers.sendMessage(args.text, args.mentions)
          return {
            content: [{ type: 'text', text: 'Message sent.' }],
          }
        },
      ),
    ],
  })
}

const claudeFactory = createClaudeSessionFactory({
  query: query as unknown as ClaudeAgentDependencies['query'],
  createChatroomMcpServer,
})

// Lazy-create one shared CopilotClient on first use; the SDK spawns the
// Copilot CLI as a subprocess so we want to reuse it across sessions.
let copilotClient: CopilotClient | null = null
const copilotFactory = createCopilotSessionFactory({
  createClient: () => {
    if (!copilotClient) {
      copilotClient = new CopilotClient()
    }
    return copilotClient as unknown as CopilotClientHandle
  },
})

// Runtime dispatcher: pick the right SDK adapter based on config.runtime
function runtimeFactory(config: AgentSessionConfig): AgentSession {
  if (config.runtime === 'copilot') {
    return copilotFactory(config)
  }
  return claudeFactory(config)
}

const spawnManager = createSpawnManager({
  serverUrl: `http://localhost:${PORT}`,
  sessionFactory: runtimeFactory,
})

const dependencies = createProjectChatDependencies({ spawnManager })

export const app = createApp(dependencies).listen(PORT)

console.log(`Chatroom server running on http://localhost:${PORT}`)

export type App = typeof app
