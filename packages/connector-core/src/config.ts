export const DEFAULT_SERVER_URL = 'http://localhost:3000'

export function getServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.CHATROOM_URL || DEFAULT_SERVER_URL
}

export function getProjectId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const projectId = env.CHATROOM_PROJECT_ID?.trim()
  return projectId ? projectId : null
}

export function getRunId(env: NodeJS.ProcessEnv = process.env): string | null {
  const runId = env.CHATROOM_RUN_ID?.trim()
  return runId ? runId : null
}

export function getWsUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, 'ws')
}
