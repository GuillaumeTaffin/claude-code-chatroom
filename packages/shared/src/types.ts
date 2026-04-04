// ── Member identity ──────────────────────────────────────────────────────────

export interface Member {
  name: string
  description: string
}

// ── REST API types ──────────────────────────────────────────────────────────

export interface ConnectRequest {
  name: string
  description: string
}

export interface ConnectResponse {
  channel_id: string
}

export interface MembersResponse {
  members: Array<Member & { channel_id: string }>
}

// ── WebSocket message payloads ──────────────────────────────────────────────

/** Client → Server: send a message to the room */
export interface SendMessageParams {
  channel_id: string
  text: string
  mentions?: string[]
}

/** Server → Client: a new message was posted */
export interface NewMessageParams {
  sender: string
  sender_role: string
  text: string
  mentions: string[]
  timestamp: string
}

/** Server → Client: a member joined the room */
export interface MemberJoinedParams {
  name: string
  description: string
}

/** Server → Client: a member left the room */
export interface MemberLeftParams {
  name: string
}
