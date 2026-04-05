import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { routes } from './routes.js'
import { ws } from './ws.js'

export function createApp() {
  return new Elysia().use(cors()).use(routes).use(ws)
}
