import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createChatroomModel,
	type ChatroomModel,
	type ChatroomSocket,
	getChannelId,
	getMembers,
	getMessages,
	getMyName,
	getPlaybooks,
	getProjects,
	getRoles,
	getRuns,
	getSelectedProject,
	getSelectedRun,
	getTeams,
	getTimeline,
	getWorkspaceAllocations,
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

const project = {
	id: 'project-1',
	name: 'Chatroom',
	root_path: '/workspace/chatroom',
	channel_id: 'project-1',
}

async function seedSelectedProject(model: ChatroomModel) {
	await model.listProjects()
	model.selectProject(project.id)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: {
						project_id: 'project-1',
						members: [
							{
								name: 'alpha',
								description: 'frontend agent',
								channel_id: 'project-1',
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

		await seedSelectedProject(model)
		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(fetchImpl).toHaveBeenNthCalledWith(
			1,
			'http://localhost:3000/projects',
		)
		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/connect',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'alpha',
					description: 'frontend agent',
					project_id: 'project-1',
				}),
			}),
		)
		expect(fetchImpl).toHaveBeenNthCalledWith(
			3,
			'http://localhost:3000/members?project_id=project-1',
		)
		expect(MockWebSocket.instances[0]?.url).toBe(
			'ws://localhost:3000/ws?name=alpha&project_id=project-1',
		)
		expect(model.connected).toBe(true)
		expect(model.myName).toBe('alpha')
		expect(model.channelId).toBe('project-1')
		expect(model.selectedProjectId).toBe('project-1')
		expect(model.connectedProjectId).toBe('project-1')
		expect(model.members).toEqual([
			{
				name: 'alpha',
				description: 'frontend agent',
				channel_id: 'project-1',
			},
		])
		expect(model.messages).toEqual([
			{
				id: 'uuid-1',
				type: 'system',
				text: 'You joined "Chatroom" as "alpha"',
				mentions: [],
				timestamp: '2026-04-04T12:00:00.000Z',
			},
		])
	})

	it('lists projects, creates a project, and selects it', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: {
						project: {
							id: 'project-2',
							name: 'Docs',
							root_path: '/workspace/docs',
							channel_id: 'project-2',
						},
					},
				}),
			)

		const model = createChatroomModel({ fetchImpl })

		await model.listProjects()
		expect(model.projects).toEqual([project])

		const created = await model.createProject('Docs', '/workspace/docs')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			1,
			'http://localhost:3000/projects',
		)
		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/projects',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Docs',
					root_path: '/workspace/docs',
				}),
			}),
		)
		expect(created).toEqual({
			id: 'project-2',
			name: 'Docs',
			root_path: '/workspace/docs',
			channel_id: 'project-2',
		})
		expect(model.projects).toEqual([
			project,
			{
				id: 'project-2',
				name: 'Docs',
				root_path: '/workspace/docs',
				channel_id: 'project-2',
			},
		])
		expect(model.selectedProject).toEqual({
			id: 'project-2',
			name: 'Docs',
			root_path: '/workspace/docs',
			channel_id: 'project-2',
		})

		model.selectProject(project.id)
		expect(model.selectedProject).toEqual(project)
		expect(model.selectedProjectId).toBe(project.id)
		model.selectProject('missing-project')
		expect(model.selectedProjectId).toBe(project.id)
		model.selectProject('')
		expect(model.selectedProjectId).toBe('')
	})

	it('clears stale selected and connected project ids when the project list refreshes', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		await seedSelectedProject(model)
		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(model.connectedProjectId).toBe(project.id)
		await model.listProjects()
		expect(model.projects).toEqual([])
		expect(model.selectedProjectId).toBe('')
		expect(model.connectedProjectId).toBe('')
		expect(model.selectedProject).toBeNull()
	})

	it('surfaces connect HTTP errors', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					ok: false,
					statusText: 'Bad Request',
					json: { error: 'name is required' },
				}),
			)
		const model = createChatroomModel({
			fetchImpl,
		})

		await seedSelectedProject(model)
		await expect(model.connect('', '')).rejects.toThrow('name is required')
	})

	it('rejects connect when no project is selected', async () => {
		const model = createChatroomModel()

		await expect(model.connect('alpha', 'frontend agent')).rejects.toThrow(
			'Select a project first',
		)
	})

	it('falls back to the HTTP status text for connect failures without an error payload', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					ok: false,
					statusText: 'Bad Request',
					json: {},
				}),
			)
		const model = createChatroomModel({
			fetchImpl,
		})

		await seedSelectedProject(model)
		await expect(model.connect('', '')).rejects.toThrow('Bad Request')
	})

	it('rejects connect when WebSocket is unavailable', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: undefined,
		})

		await seedSelectedProject(model)
		await expect(model.connect('alpha', 'frontend agent')).rejects.toThrow(
			'WebSocket is not available',
		)
	})

	it('surfaces connect websocket failures', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const uuidValues = ['join-message', 'local-message']
		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => uuidValues.shift() ?? 'fallback-id',
		})

		await seedSelectedProject(model)
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
					channel_id: 'project-1',
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			requestTimeoutMs: 50,
		})

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			logger,
		})

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-04T12:00:00.000Z',
			randomUUID: () => 'notification-id',
		})

		await seedSelectedProject(model)
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
				channel_id: 'project-1',
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

		model.selectProject('')
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockRejectedValueOnce(new Error('members unavailable'))

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
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

		await seedSelectedProject(model)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
		})

		await seedSelectedProject(model)
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
		expect(model.selectedProject).toEqual(project)
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
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'project-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: SilentCloseWebSocket,
		})

		await seedSelectedProject(model)
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
		expect(getProjects()).toEqual([])
		expect(getSelectedProject()).toBeNull()
		expect(isConnected()).toBe(false)
		expect(getMyName()).toBe('')
		expect(getChannelId()).toBe('')
		expect(getRoles()).toEqual([])
		expect(getTeams()).toEqual([])
		expect(getRuns()).toEqual([])
		expect(getPlaybooks()).toEqual([])
		expect(getSelectedRun()).toBeNull()
		expect(getTimeline()).toEqual([])
		expect(getWorkspaceAllocations()).toEqual([])
	})

	// ── Roles ────────────────────────────────────────────────────────────────

	const role = {
		id: 'role-1',
		name: 'Frontend Engineer',
		description: 'Handles UI',
		scope: 'project' as const,
		project_id: 'project-1',
	}

	it('lists roles without query params', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { roles: [role] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles()

		expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/roles')
		expect(model.roles).toEqual([role])
	})

	it('lists roles with scope and projectId query params', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { roles: [role] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles('project', 'project-1')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/roles?scope=project&project_id=project-1',
		)
		expect(model.roles).toEqual([role])
	})

	it('creates a role and appends it to state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { roles: [] } }))
			.mockResolvedValueOnce(createJsonResponse({ json: { role } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles()
		const created = await model.createRole(
			'Frontend Engineer',
			'Handles UI',
			'project',
			'project-1',
		)

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/roles',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Frontend Engineer',
					description: 'Handles UI',
					scope: 'project',
					project_id: 'project-1',
				}),
			}),
		)
		expect(created).toEqual(role)
		expect(model.roles).toEqual([role])
	})

	it('creates a role without projectId', async () => {
		const userRole = {
			...role,
			scope: 'user' as const,
			project_id: undefined,
		}
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { role: userRole } }))

		const model = createChatroomModel({ fetchImpl })
		await model.createRole('Frontend Engineer', 'Handles UI', 'user')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/roles',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Frontend Engineer',
					description: 'Handles UI',
					scope: 'user',
				}),
			}),
		)
	})

	it('updates a role and replaces it in state', async () => {
		const otherRole = { ...role, id: 'role-2', name: 'Backend Engineer' }
		const updatedRole = { ...role, name: 'Senior FE' }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { roles: [otherRole, role] } }),
			)
			.mockResolvedValueOnce(
				createJsonResponse({ json: { role: updatedRole } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles()
		const result = await model.updateRole('role-1', 'Senior FE')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/roles/role-1',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ name: 'Senior FE' }),
			}),
		)
		expect(result).toEqual(updatedRole)
		expect(model.roles).toEqual([otherRole, updatedRole])
	})

	it('updates a role with description only', async () => {
		const updatedRole = { ...role, description: 'New desc' }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { roles: [role] } }))
			.mockResolvedValueOnce(
				createJsonResponse({ json: { role: updatedRole } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles()
		const result = await model.updateRole('role-1', undefined, 'New desc')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/roles/role-1',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ description: 'New desc' }),
			}),
		)
		expect(result).toEqual(updatedRole)
	})

	it('deletes a role and removes it from state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { roles: [role] } }))
			.mockResolvedValueOnce(createJsonResponse({ json: { ok: true } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRoles()
		await model.deleteRole('role-1')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/roles/role-1',
			expect.objectContaining({ method: 'DELETE' }),
		)
		expect(model.roles).toEqual([])
	})

	// ── Teams ────────────────────────────────────────────────────────────────

	const team = {
		id: 'team-1',
		name: 'Feature Squad',
		project_id: 'project-1',
		members: [{ role_id: 'role-1' }],
	}

	it('lists teams for a project', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { teams: [team] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listTeams('project-1')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/teams?project_id=project-1',
		)
		expect(model.teams).toEqual([team])
	})

	it('creates a team and appends it to state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { teams: [] } }))
			.mockResolvedValueOnce(createJsonResponse({ json: { team } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listTeams('project-1')
		const created = await model.createTeam('Feature Squad', 'project-1', [
			{ role_id: 'role-1' },
		])

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/teams',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Feature Squad',
					project_id: 'project-1',
					members: [{ role_id: 'role-1' }],
				}),
			}),
		)
		expect(created).toEqual(team)
		expect(model.teams).toEqual([team])
	})

	it('updates a team and replaces it in state', async () => {
		const otherTeam = { ...team, id: 'team-2', name: 'Platform Squad' }
		const updatedTeam = { ...team, name: 'Alpha Squad' }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { teams: [otherTeam, team] } }),
			)
			.mockResolvedValueOnce(
				createJsonResponse({ json: { team: updatedTeam } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.listTeams('project-1')
		const result = await model.updateTeam('team-1', 'Alpha Squad')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/teams/team-1',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ name: 'Alpha Squad' }),
			}),
		)
		expect(result).toEqual(updatedTeam)
		expect(model.teams).toEqual([otherTeam, updatedTeam])
	})

	it('updates a team with members only', async () => {
		const updatedTeam = { ...team, members: [{ role_id: 'role-2' }] }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { teams: [team] } }))
			.mockResolvedValueOnce(
				createJsonResponse({ json: { team: updatedTeam } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.listTeams('project-1')
		const result = await model.updateTeam('team-1', undefined, [
			{ role_id: 'role-2' },
		])

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/teams/team-1',
			expect.objectContaining({
				method: 'PUT',
				body: JSON.stringify({ members: [{ role_id: 'role-2' }] }),
			}),
		)
		expect(result).toEqual(updatedTeam)
	})

	it('deletes a team and removes it from state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { teams: [team] } }))
			.mockResolvedValueOnce(createJsonResponse({ json: { ok: true } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listTeams('project-1')
		await model.deleteTeam('team-1')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/teams/team-1',
			expect.objectContaining({ method: 'DELETE' }),
		)
		expect(model.teams).toEqual([])
	})

	// ── Runs ─────────────────────────────────────────────────────────────────

	const run = {
		id: 'run-1',
		name: 'Implement login',
		project_id: 'project-1',
		team_snapshot: {
			team_id: 'team-1',
			team_name: 'Feature Squad',
			members: [{ role_id: 'role-1' }],
		},
		channel_id: 'run-channel-1',
		status: 'active' as const,
		phases: [],
		current_phase_id: null,
		approval_required: false,
		approvals: [],
		created_at: '2026-04-07T00:00:00.000Z',
	}

	it('lists runs for a project', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { runs: [run] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs?project_id=project-1',
		)
		expect(model.runs).toEqual([run])
	})

	it('lists runs with a status filter', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { runs: [run] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1', 'active')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs?project_id=project-1&status=active',
		)
		expect(model.runs).toEqual([run])
	})

	it('creates a run and appends it to state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { run } }))

		const model = createChatroomModel({ fetchImpl })
		const created = await model.createRun(
			'Implement login',
			'project-1',
			'team-1',
			'feature-delivery',
		)

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Implement login',
					project_id: 'project-1',
					team_id: 'team-1',
					playbook_id: 'feature-delivery',
				}),
			}),
		)
		expect(created).toEqual(run)
		expect(model.runs).toEqual([run])
	})

	it('creates a run with custom phases and no playbookId', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { run } }))

		const model = createChatroomModel({ fetchImpl })
		const phases = [{ name: 'Design', approval_required: true }]
		await model.createRun(
			'Implement login',
			'project-1',
			'team-1',
			undefined,
			phases,
		)

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'Implement login',
					project_id: 'project-1',
					team_id: 'team-1',
					phases,
				}),
			}),
		)
	})

	it('gets a run by id and updates it in state', async () => {
		const otherRun = { ...run, id: 'run-2', name: 'Other run' }
		const updatedRun = { ...run, status: 'completed' as const }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { runs: [otherRun, run] } }),
			)
			.mockResolvedValueOnce(createJsonResponse({ json: { run: updatedRun } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')
		const result = await model.getRun('run-1')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/runs/run-1',
		)
		expect(result).toEqual(updatedRun)
		expect(model.runs).toEqual([otherRun, updatedRun])
	})

	it('advances a run and updates it in state', async () => {
		const otherRun = { ...run, id: 'run-2', name: 'Other run' }
		const advancedRun = { ...run, current_phase_id: 'phase-2' }
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { runs: [otherRun, run] } }),
			)
			.mockResolvedValueOnce(createJsonResponse({ json: { run: advancedRun } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')
		const result = await model.advanceRun('run-1')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/runs/run-1/advance',
			expect.objectContaining({ method: 'POST' }),
		)
		expect(result).toEqual(advancedRun)
		expect(model.runs).toEqual([otherRun, advancedRun])
	})

	it('approves a run with a decision and reason', async () => {
		const otherRun = { ...run, id: 'run-2', name: 'Other run' }
		const approvedRun = {
			...run,
			approvals: [{ decision: 'approved', reason: 'Looks good' }],
		}
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { runs: [otherRun, run] } }),
			)
			.mockResolvedValueOnce(createJsonResponse({ json: { run: approvedRun } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')
		const result = await model.approveRun('run-1', 'approved', 'Looks good')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/runs/run-1/approve',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					decision: 'approved',
					reason: 'Looks good',
				}),
			}),
		)
		expect(result).toEqual(approvedRun)
		expect(model.runs).toEqual([otherRun, approvedRun])
	})

	it('approves a run without a reason', async () => {
		const approvedRun = {
			...run,
			approvals: [{ decision: 'rejected' }],
		}
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { runs: [run] } }))
			.mockResolvedValueOnce(createJsonResponse({ json: { run: approvedRun } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')
		await model.approveRun('run-1', 'rejected')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/runs/run-1/approve',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ decision: 'rejected' }),
			}),
		)
	})

	it('selects a run and derives selectedRun', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createJsonResponse({ json: { runs: [run] } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listRuns('project-1')

		expect(model.selectedRunId).toBe('')
		expect(model.selectedRun).toBeNull()

		model.selectRun('run-1')
		expect(model.selectedRunId).toBe('run-1')
		expect(model.selectedRun).toEqual(run)

		model.selectRun('missing')
		expect(model.selectedRunId).toBe('missing')
		expect(model.selectedRun).toBeNull()
	})

	// ── Playbooks ────────────────────────────────────────────────────────────

	const playbook = {
		id: 'feature-delivery' as const,
		name: 'Feature Delivery',
		description: 'Spec, implement, review',
		phases: [
			{ name: 'Spec', description: 'Specification', approval_required: true },
		],
	}

	it('lists playbooks', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { playbooks: [playbook] } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.listPlaybooks()

		expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/playbooks')
		expect(model.playbooks).toEqual([playbook])
	})

	// ── Workspaces ───────────────────────────────────────────────────────────

	const workspaceAllocation = {
		id: 'ws-1',
		run_id: 'run-1',
		participant_name: 'alpha',
		role_id: null,
		workspace: { type: 'project_root' as const, name: null, path: null },
	}

	it('lists workspace allocations for a run', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
			createJsonResponse({
				json: { allocations: [workspaceAllocation] },
			}),
		)

		const model = createChatroomModel({ fetchImpl })
		await model.listWorkspaceAllocations('run-1')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs/run-1/workspaces',
		)
		expect(model.workspaceAllocations).toEqual([workspaceAllocation])
	})

	it('creates a workspace allocation and appends it to state', async () => {
		const allocationRequest = {
			participant_name: 'alpha',
			workspace: {
				type: 'project_root' as const,
				name: null,
				path: null,
			},
		}
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
			createJsonResponse({
				json: { allocation: workspaceAllocation },
			}),
		)

		const model = createChatroomModel({ fetchImpl })
		const created = await model.createWorkspaceAllocation(
			'run-1',
			allocationRequest,
		)

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs/run-1/workspaces',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(allocationRequest),
			}),
		)
		expect(created).toEqual(workspaceAllocation)
		expect(model.workspaceAllocations).toEqual([workspaceAllocation])
	})

	it('deletes a workspace allocation and removes it from state', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { allocations: [workspaceAllocation] },
				}),
			)
			.mockResolvedValueOnce(createJsonResponse({ json: { ok: true } }))

		const model = createChatroomModel({ fetchImpl })
		await model.listWorkspaceAllocations('run-1')
		await model.deleteWorkspaceAllocation('ws-1')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/workspaces/ws-1',
			expect.objectContaining({ method: 'DELETE' }),
		)
		expect(model.workspaceAllocations).toEqual([])
	})

	// ── Timeline ─────────────────────────────────────────────────────────────

	const timelineEvent = {
		id: 'evt-1',
		run_id: 'run-1',
		type: 'run_created' as const,
		timestamp: '2026-04-07T00:00:00.000Z',
		data: {},
	}

	it('loads timeline events for a run', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { events: [timelineEvent] } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.loadTimeline('run-1')

		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:3000/runs/run-1/timeline',
		)
		expect(model.timeline).toEqual([timelineEvent])
	})

	// ── Reviews ──────────────────────────────────────────────────────────────

	it('adds review feedback and appends event to timeline', async () => {
		const reviewEvent = {
			id: 'evt-2',
			run_id: 'run-1',
			type: 'review_feedback' as const,
			timestamp: '2026-04-07T01:00:00.000Z',
			data: { comment: 'Great work', author: 'alice' },
		}
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({ json: { events: [timelineEvent] } }),
			)
			.mockResolvedValueOnce(
				createJsonResponse({ json: { event: reviewEvent } }),
			)

		const model = createChatroomModel({ fetchImpl })
		await model.loadTimeline('run-1')
		const result = await model.addReviewFeedback('run-1', 'Great work', 'alice')

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/runs/run-1/reviews',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					run_id: 'run-1',
					comment: 'Great work',
					author: 'alice',
				}),
			}),
		)
		expect(result).toEqual(reviewEvent)
		expect(model.timeline).toEqual([timelineEvent, reviewEvent])
	})

	// ── Connect with run_id ──────────────────────────────────────────────────

	it('passes run_id in connect body and WS URL when selectedRunId is set', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { projects: [project] },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', channel_id: 'run-channel-1' },
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					json: { project_id: 'project-1', members: [] },
				}),
			)

		const model = createChatroomModel({
			fetchImpl,
			WebSocketImpl: MockWebSocket,
			now: () => '2026-04-07T00:00:00.000Z',
			randomUUID: () => 'uuid-run',
		})

		await seedSelectedProject(model)
		model.selectRun('run-1')
		const connectPromise = model.connect('alpha', 'frontend agent')
		await settleAsyncWork()
		MockWebSocket.instances[0]?.emitOpen()
		await connectPromise

		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'http://localhost:3000/connect',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					name: 'alpha',
					description: 'frontend agent',
					project_id: 'project-1',
					run_id: 'run-1',
				}),
			}),
		)
		expect(MockWebSocket.instances[0]?.url).toBe(
			'ws://localhost:3000/ws?name=alpha&project_id=project-1&run_id=run-1',
		)
	})
})
