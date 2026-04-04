import type { Member } from '@chatroom/shared'

const DEFAULT_CHANNEL_ID = 'general'

/** Minimal interface for any WebSocket-like object we need to track and send to */
interface WS {
  send(data: string | ArrayBufferLike | ArrayBufferView): unknown
}

export class Room {
  readonly channelId: string
  private members = new Map<string, Member>()
  private wsToName = new Map<WS, string>()
  private nameToWs = new Map<string, WS>()

  constructor(channelId: string = DEFAULT_CHANNEL_ID) {
    this.channelId = channelId
  }

  addMember(member: Member): boolean {
    if (this.members.has(member.name)) return false
    this.members.set(member.name, member)
    return true
  }

  removeMember(name: string): Member | undefined {
    const member = this.members.get(name)
    if (!member) return undefined
    this.members.delete(name)
    const ws = this.nameToWs.get(name)
    if (ws) {
      this.wsToName.delete(ws)
      this.nameToWs.delete(name)
    }
    return member
  }

  getMember(name: string): Member | undefined {
    return this.members.get(name)
  }

  getMembers(): Array<Member & { channel_id: string }> {
    return Array.from(this.members.values()).map((m) => ({
      ...m,
      channel_id: this.channelId,
    }))
  }

  isRegistered(name: string): boolean {
    return this.members.has(name)
  }

  hasWebSocket(name: string): boolean {
    return this.nameToWs.has(name)
  }

  registerWebSocket(ws: WS, name: string): boolean {
    if (!this.members.has(name)) return false
    if (this.nameToWs.has(name)) return false
    this.wsToName.set(ws, name)
    this.nameToWs.set(name, ws)
    return true
  }

  unregisterWebSocket(ws: WS): string | undefined {
    const name = this.wsToName.get(ws)
    if (!name) return undefined
    this.wsToName.delete(ws)
    this.nameToWs.delete(name)
    this.members.delete(name)
    return name
  }

  getNameByWebSocket(ws: WS): string | undefined {
    return this.wsToName.get(ws)
  }

  /** Send a message string to all connected members except the excluded name */
  broadcast(message: string, excludeName?: string): void {
    for (const [ws, name] of this.wsToName) {
      if (name === excludeName) continue
      try {
        ws.send(message)
      } catch {
        // ignore send failures on stale connections
      }
    }
  }

  /** Send a message string to all connected members */
  broadcastAll(message: string): void {
    for (const [ws] of this.wsToName) {
      try {
        ws.send(message)
      } catch {
        // ignore
      }
    }
  }
}

// ── Room registry (multi-room ready) ────────────────────────────────────────

const rooms = new Map<string, Room>()

export function getOrCreateRoom(channelId: string = DEFAULT_CHANNEL_ID): Room {
  let room = rooms.get(channelId)
  if (!room) {
    room = new Room(channelId)
    rooms.set(channelId, room)
  }
  return room
}

export function getRoom(channelId: string = DEFAULT_CHANNEL_ID): Room | undefined {
  return rooms.get(channelId)
}

export { DEFAULT_CHANNEL_ID }
