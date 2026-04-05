import {
	type JsonRpcMessage,
	type MemberJoinedParams,
	type MemberLeftParams,
	type NewMessageParams,
	type JsonRpcResponse,
	isNotification,
	isResponse,
	makeRequest,
} from '@chatroom/shared'

export interface ChatMessage {
	id: string
	type: 'message' | 'system'
	sender?: string
	senderRole?: string
	text: string
	mentions: string[]
	timestamp: string
}

export interface ChatMember {
	name: string
	description: string
	channel_id: string
}

interface PendingRequest {
	resolve: (value: unknown) => void
	reject: (error: Error) => void
	timeout: ReturnType<typeof setTimeout>
}

export interface ChatroomSocketMessageEvent {
	data: string
}

export interface ChatroomSocket {
	onopen: (() => void) | null
	onerror: ((event: unknown) => void) | null
	onclose: (() => void) | null
	onmessage: ((event: ChatroomSocketMessageEvent) => void) | null
	send(data: string): void
	close(): void
}

export type ChatroomSocketConstructor = new (url: string) => ChatroomSocket

export interface ChatroomModelDependencies {
	fetchImpl: typeof fetch
	WebSocketImpl?: ChatroomSocketConstructor
	logger: Pick<Console, 'error'>
	now: () => string
	randomUUID: () => string
	serverUrl: string
	wsUrl: string
	requestTimeoutMs: number
}

export interface ChatroomModel {
	readonly messages: ChatMessage[]
	readonly members: ChatMember[]
	readonly connected: boolean
	readonly myName: string
	readonly channelId: string
	connect(name: string, description: string): Promise<void>
	sendMessage(text: string, mentions?: string[]): Promise<void>
	disconnect(): void
	handleNotification(method: string, params: unknown): void
}

const DEFAULT_SERVER_URL = 'http://localhost:3000'
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

function getDefaultDependencies(): ChatroomModelDependencies {
	const serverUrl = DEFAULT_SERVER_URL
	return {
		fetchImpl: fetch,
		WebSocketImpl: globalThis.WebSocket as
			| ChatroomSocketConstructor
			| undefined,
		logger: console,
		now: () => new Date().toISOString(),
		randomUUID: () => crypto.randomUUID(),
		serverUrl,
		wsUrl: serverUrl.replace(/^http/, 'ws'),
		requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
	}
}

export function createChatroomModel(
	overrides: Partial<ChatroomModelDependencies> = {},
): ChatroomModel {
	const dependencies = { ...getDefaultDependencies(), ...overrides }

	let messages = $state<ChatMessage[]>([])
	let members = $state<ChatMember[]>([])
	let connected = $state(false)
	let myName = $state('')
	let channelId = $state('')
	let socket = $state<ChatroomSocket | null>(null)
	let rpcIdCounter = 0
	const pendingRequests = new Map<string | number, PendingRequest>()

	function addSystemMessage(text: string) {
		messages = [
			...messages,
			{
				id: dependencies.randomUUID(),
				type: 'system',
				text,
				mentions: [],
				timestamp: dependencies.now(),
			},
		]
	}

	async function refreshMembers() {
		try {
			const response = await dependencies.fetchImpl(
				`${dependencies.serverUrl}/members`,
			)
			if (!response.ok) return

			const data = (await response.json()) as { members: ChatMember[] }
			members = data.members
		} catch {
			// Deliberately swallow member refresh failures. A stale member list is better
			// than failing the connection flow after registration succeeded.
		}
	}

	function clearPendingRequests(error: Error) {
		for (const pending of pendingRequests.values()) {
			clearTimeout(pending.timeout)
			pending.reject(error)
		}
		pendingRequests.clear()
	}

	function handleResponse(message: JsonRpcResponse) {
		const pending = pendingRequests.get(message.id)
		if (!pending) return

		pendingRequests.delete(message.id)
		clearTimeout(pending.timeout)

		if ('error' in message && message.error) {
			pending.reject(new Error(message.error.message))
			return
		}

		pending.resolve(message.result)
	}

	function connectWebSocket(name: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!dependencies.WebSocketImpl) {
				reject(new Error('WebSocket is not available'))
				return
			}

			const nextSocket = new dependencies.WebSocketImpl(
				`${dependencies.wsUrl}/ws?name=${encodeURIComponent(name)}`,
			)

			nextSocket.onopen = () => {
				socket = nextSocket
				resolve()
			}

			nextSocket.onerror = () => {
				reject(new Error('WebSocket connection failed'))
			}

			nextSocket.onclose = () => {
				socket = null
				connected = false
				clearPendingRequests(new Error('WebSocket connection closed'))
			}

			nextSocket.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data) as JsonRpcMessage

					if (isResponse(message)) {
						handleResponse(message)
						return
					}

					if (isNotification(message)) {
						handleNotification(message.method, message.params)
					}
				} catch (error) {
					dependencies.logger.error('Failed to parse WS message:', error)
				}
			}
		})
	}

	function sendRpcRequest(id: number, request: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				pendingRequests.delete(id)
				reject(new Error('Request timed out'))
			}, dependencies.requestTimeoutMs)

			pendingRequests.set(id, {
				resolve,
				reject,
				timeout,
			})

			socket!.send(JSON.stringify(request))
		})
	}

	async function connect(name: string, description: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/connect`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, description }),
			},
		)

		if (!response.ok) {
			const error = (await response.json()) as { error?: string }
			throw new Error(error.error || response.statusText)
		}

		const data = (await response.json()) as { channel_id: string }
		myName = name
		channelId = data.channel_id

		await connectWebSocket(name)
		connected = true
		await refreshMembers()
		addSystemMessage(`You joined the chatroom as "${name}"`)
	}

	async function sendMessage(
		text: string,
		mentions: string[] = [],
	): Promise<void> {
		if (!socket || !connected) {
			throw new Error('Not connected')
		}

		const id = ++rpcIdCounter
		const request = makeRequest(id, 'send_message', {
			channel_id: channelId,
			text,
			mentions,
		})

		await sendRpcRequest(id, request)

		messages = [
			...messages,
			{
				id: dependencies.randomUUID(),
				type: 'message',
				sender: myName,
				senderRole: '',
				text,
				mentions,
				timestamp: dependencies.now(),
			},
		]
	}

	function disconnect(): void {
		if (socket) {
			socket.close()
			socket = null
		}

		clearPendingRequests(new Error('Disconnected'))
		connected = false
		myName = ''
		channelId = ''
		messages = []
		members = []
	}

	function handleNotification(method: string, params: unknown): void {
		switch (method) {
			case 'new_message': {
				const payload = params as NewMessageParams
				messages = [
					...messages,
					{
						id: dependencies.randomUUID(),
						type: 'message',
						sender: payload.sender,
						senderRole: payload.sender_role,
						text: payload.text,
						mentions: payload.mentions,
						timestamp: payload.timestamp,
					},
				]
				break
			}

			case 'member_joined': {
				const payload = params as MemberJoinedParams
				addSystemMessage(`${payload.name} joined (${payload.description})`)
				members = [
					...members,
					{
						name: payload.name,
						description: payload.description,
						channel_id: channelId,
					},
				]
				break
			}

			case 'member_left': {
				const payload = params as MemberLeftParams
				addSystemMessage(`${payload.name} left the chatroom`)
				members = members.filter((member) => member.name !== payload.name)
				break
			}
		}
	}

	return {
		get messages() {
			return messages
		},
		get members() {
			return members
		},
		get connected() {
			return connected
		},
		get myName() {
			return myName
		},
		get channelId() {
			return channelId
		},
		connect,
		sendMessage,
		disconnect,
		handleNotification,
	}
}

export const chatroomModel = createChatroomModel()

export function getMessages() {
	return chatroomModel.messages
}

export function getMembers() {
	return chatroomModel.members
}

export function isConnected() {
	return chatroomModel.connected
}

export function getMyName() {
	return chatroomModel.myName
}

export function getChannelId() {
	return chatroomModel.channelId
}

export const connect = chatroomModel.connect
export const sendMessage = chatroomModel.sendMessage
export const disconnect = chatroomModel.disconnect
