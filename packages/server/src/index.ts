import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { routes } from './routes.js'
import { ws } from './ws.js'

const PORT = Number(process.env.PORT) || 3000

export const app = new Elysia().use(cors()).use(routes).use(ws).listen(PORT)

console.log(`Chatroom server running on http://localhost:${PORT}`)

export type App = typeof app
