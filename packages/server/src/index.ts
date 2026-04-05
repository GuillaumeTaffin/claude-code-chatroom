import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 3000

export const app = createApp().listen(PORT)

console.log(`Chatroom server running on http://localhost:${PORT}`)

export type App = typeof app
