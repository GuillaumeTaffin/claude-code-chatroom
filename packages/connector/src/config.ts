export const DEFAULT_SERVER_URL = 'http://localhost:3000'

export function getServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CHATROOM_URL || DEFAULT_SERVER_URL
}

export function getWsUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, 'ws')
}
