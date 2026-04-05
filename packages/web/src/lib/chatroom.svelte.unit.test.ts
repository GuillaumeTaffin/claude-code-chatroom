import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createChatroomModel,
	type ChatroomSocket,
	getChannelId,
	getMembers,
	getMessages,
	getMyName,
	isConnected,
} from './chatroom.svelte.js'

interface MockResponseOptions {
	ok?: boolean
	statusText?: string
	json: unknown
}

function createJsonResponse(options: MockResponseOptions): Response {
	return {
		ok: options.ok ?? true,
		statusText: options.statusText ?? 'OK',
		json: async () => options.json,
	} as Response
}

class MockWebSocket implements ChatroomSocket {
	static instances: MockWebSocket[] = []

	onopen: (() => void) | null = null
	onerror: ((event: unknown) => void) | null = null
	onclose: (() => void) | null = null
	onmessage: ((event: { data: string }) => void) | null = null
	sentMessages: string[] = []
	closed = false

	constructor(readonly url: string) {
		MockWebSocket.instances.push(this)
	}

	send(data: string): void {
		this.sentMessages.push(data)
	}

	close(): void {
		this.closed = true
		this.onclose?.()
	}

	emitOpen() {
		this.onopen?.()
	}

	emitError(event: unknown = new Error('socket error')) {
		this.onerror?.(event)
	}

	emitMessage(payload: unknown) {
		const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
		this.onmessage?.({ data })
	}
}

class SilentCloseWebSocket extends MockWebSocket {
	override close(): void {
		this.closed = true
	}
}

async function settleAsyncWork() {
	await Promise.resolve()
	await Promise.resolve()
}

describe('createChatroomModel', () => {
	beforeEach(() => {
		MockWebSocket.instances = []
		vi.useRealTimers()
	})

	it('connects successfully, refreshes members, and appends a system message', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: {
						members: [
							{
								name: 'alpha',
								description: 'frontend agent',
								channel_id: 'general',
							},
						],
					},
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => 'uuid-1',
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(fetchImpl).toHaveBeenNthCalledWith(
			1,
			'http://localhost:3000/connect',
			expect.objectContaining({
				method: 'POST',
			}),
		)
		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/members',
		)
		expect(model.connected).toBe(true)
		expect(model.myName).toBe('alpha')
		expect(model.channelId).toBe('general')
		expect(model.members).toEqual([
			{
				name: 'alpha',
				description: 'frontend agent',
				channel_id: 'general',
			},
		])
		expect(model.messages).toEqual([
			{
				id: 'uuid-1',
				type: 'system',
				text: 'You joined the chatroom as "alpha"',
				mentions: [],
				timestamp: '2026-04-04T12:00:00.000Z',
			},
		])
	})

	it('surfaces connect HTTP errors', async () => {
		const model = createChatroomModel({
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				createJsonResponse({
					ok: false,
					statusText: 'Bad Request',
					json: { error: 'name is required' },
				}),
			),
		})

		await expect(model.connect('', '')).rejects.toThrow('name is required')
	})

	it('falls back to the HTTP status text for connect failures without an error payload', async () => {
		const model = createChatroomModel({
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				createJsonResponse({
					ok: false,
					statusText: 'Bad Request',
					json: {},
				}),
			),
		})

		await expect(model.connect('', '')).rejects.toThrow('Bad Request')
	})

	it('rejects connect when WebSocket is unavailable', async () => {
		const model = createChatroomModel({
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			),
			WebSocketImpl: undefined,
		})

		await expect(model.connect('alpha', 'frontend agent')).rejects.toThrow(
			'WebSocket is not available',
		)
	})

	it('surfaces connect websocket failures', async () => {
		const model = createChatroomModel({
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			),
			WebSocketImpl: MockWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitError()

		await expect(connectPromise).rejects.toThrow('WebSocket connection failed')
	})

	it('rejects sendMessage before the model is connected', async () => {
		const model = createChatroomModel()

		await expect(model.sendMessage('hello')).rejects.toThrow('Not connected')
	})

	it('sends messages, defaults mentions, and appends a local echo', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const uuidValues = ['join-message', 'local-message']
		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => uuidValues.shift() ?? 'fallback-id',
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		const sendPromise = model.sendMessage('hello room')
		MockWebSocket.instances[0]?.emitMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { ok: true },
		})
		await sendPromise

		expect(MockWebSocket.instances[0]?.sentMessages).toEqual([
			JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'send_message',
				params: {
					channel_id: 'general',
					text: 'hello room',
					mentions: [],
				},
			}),
		])
		expect(model.messages.at(-1)).toEqual({
			id: 'local-message',
			type: 'message',
			sender: 'alpha',
			senderRole: '',
			text: 'hello room',
			mentions: [],
			timestamp: '2026-04-04T12:00:00.000Z',
		})
	})

	it('rejects timed out RPC requests', async () => {
		vi.useFakeTimers()

		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			requestTimeoutMs: 50,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		const sendPromise = model.sendMessage('hello')
		const rejection = expect(sendPromise).rejects.toThrow('Request timed out')
		await vi.advanceTimersByTimeAsync(50)
		await rejection
	})

	it('rejects RPC error responses', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		const sendPromise = model.sendMessage('hello')
		MockWebSocket.instances[0]?.emitMessage({
			jsonrpc: '2.0',
			id: 1,
			error: {
				code: -32000,
				message: 'send failed',
			},
		})

		await expect(sendPromise).rejects.toThrow('send failed')
	})

	it('logs malformed websocket payloads without crashing', async () => {
		const logger = {
			error: vi.fn(),
		}
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			logger,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(() => {
			MockWebSocket.instances[0]?.emitMessage('{bad json')
		}).not.toThrow()
		expect(logger.error).toHaveBeenCalledWith(
			'Failed to parse WS message:',
			expect.anything(),
		)
		expect(model.messages).toHaveLength(1)
	})

	it('handles websocket notifications and ignores non-response request payloads', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => 'notification-id',
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(() => {
			MockWebSocket.instances[0]?.emitMessage({
				jsonrpc: '2.0',
				method: 'member_joined',
				params: {
					name: 'beta',
					description: 'backend agent',
				},
			})
			MockWebSocket.instances[0]?.emitMessage({
				jsonrpc: '2.0',
				id: 999,
				method: 'ping',
				params: {},
			})
			MockWebSocket.instances[0]?.emitMessage({
				jsonrpc: '2.0',
				id: 999,
				result: { ok: true },
			})
		}).not.toThrow()

		expect(model.members).toEqual([
			{
				name: 'beta',
				description: 'backend agent',
				channel_id: 'general',
			},
		])
		expect(model.messages.at(-1)).toEqual({
			id: 'notification-id',
			type: 'system',
			text: 'beta joined (backend agent)',
			mentions: [],
			timestamp: '2026-04-04T12:00:00.000Z',
		})
	})

	it('handles incoming chatroom notifications', () => {
		const model = createChatroomModel({
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => 'notification-id',
		})

		model.handleNotification('new_message', {
			sender: 'beta',
			sender_role: 'backend agent',
			text: 'hello',
			mentions: ['alpha'],
			timestamp: '2026-04-04T12:01:00.000Z',
		})
		model.handleNotification('member_joined', {
			name: 'beta',
			description: 'backend agent',
		})
		model.handleNotification('member_left', {
			name: 'beta',
		})

		expect(model.messages).toEqual([
			{
				id: 'notification-id',
				type: 'message',
				sender: 'beta',
				senderRole: 'backend agent',
				text: 'hello',
				mentions: ['alpha'],
				timestamp: '2026-04-04T12:01:00.000Z',
			},
			{
				id: 'notification-id',
				type: 'system',
				text: 'beta joined (backend agent)',
				mentions: [],
				timestamp: '2026-04-04T12:00:00.000Z',
			},
			{
				id: 'notification-id',
				type: 'system',
				text: 'beta left the chatroom',
				mentions: [],
				timestamp: '2026-04-04T12:00:00.000Z',
			},
		])
		expect(model.members).toEqual([])
	})

	it('swallows member refresh failures after connect', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockRejectedValueOnce(new Error('members unavailable'))

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await expect(connectPromise).resolves.toBeUndefined()
		expect(model.members).toEqual([])
	})

	it('keeps an empty member list when refreshMembers returns a non-ok response', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					ok: false,
					statusText: 'Service Unavailable',
					json: {},
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await expect(connectPromise).resolves.toBeUndefined()
		expect(model.members).toEqual([])
	})

	it('disconnects, clears state, and closes the websocket', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		model.disconnect()

		expect(MockWebSocket.instances[0]?.closed).toBe(true)
		expect(model.connected).toBe(false)
		expect(model.myName).toBe('')
		expect(model.channelId).toBe('')
		expect(model.messages).toEqual([])
		expect(model.members).toEqual([])
	})

	it('allows disconnect when no websocket is active', () => {
		const model = createChatroomModel()

		expect(() => model.disconnect()).not.toThrow()
		expect(model.connected).toBe(false)
	})

	it('rejects pending RPC requests when disconnecting', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { channel_id: 'general' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: SilentCloseWebSocket,
		})

		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		const sendPromise = model.sendMessage('hello')
		const rejection = expect(sendPromise).rejects.toThrow('Disconnected')
		model.disconnect()
		await rejection
	})

	it('exposes the singleton getter helpers', () => {
		expect(getMessages()).toEqual([])
		expect(getMembers()).toEqual([])
		expect(isConnected()).toBe(false)
		expect(getMyName()).toBe('')
		expect(getChannelId()).toBe('')
	})
})
