import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import {
  defaultProjectChatDependencies,
  type ProjectChatDependencies,
} from './state.js'
import { createRoutes } from './routes.js'
import { createWs } from './ws.js'

export function createApp(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  return new Elysia()
    .use(cors())
    .use(createRoutes(dependencies))
    .use(createWs(dependencies))
}
