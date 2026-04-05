export interface MemberSummary {
  name: string
  description: string
}

export function serverUrlToWsUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, 'ws')
}

export function formatMemberList(members: MemberSummary[]): string {
  return members
    .map((member) => `- ${member.name}: ${member.description}`)
    .join('\n')
}
