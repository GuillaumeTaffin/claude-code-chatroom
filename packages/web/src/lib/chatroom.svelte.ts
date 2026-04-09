import {
	type AdvanceRunResponse,
	type ApproveRunResponse,
	type ConnectResponse,
	type CreateProjectResponse,
	type CreateRunResponse,
	type CreateTeamResponse,
	type CreateRoleResponse,
	type CreateWorkspaceAllocationRequest,
	type DeleteRoleResponse,
	type DeleteTeamResponse,
	type DeleteWorkspaceAllocationResponse,
	type JsonRpcMessage,
	type JsonRpcResponse,
	type MemberJoinedParams,
	type MemberLeftParams,
	type MembersResponse,
	type RuntimeIdentity,
	type NewMessageParams,
	type Playbook,
	type PlaybookId,
	type PlaybooksResponse,
	type Project,
	type ProjectsResponse,
	type ReviewFeedbackResponse,
	type Role,
	type RoleScope,
	type RolesResponse,
	type Run,
	type RunResponse,
	type RunStatus,
	type RunsResponse,
	type Team,
	type TeamMember,
	type TeamsResponse,
	type TimelineEvent,
	type TimelineResponse,
	type UpdateRoleResponse,
	type UpdateTeamResponse,
	type WorkspaceAllocation,
	type WorkspaceAllocationResponse,
	type WorkspaceAllocationsResponse,
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
	runtime?: RuntimeIdentity
}

export type ChatProject = Project

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
	readonly projects: ChatProject[]
	readonly connected: boolean
	readonly myName: string
	readonly channelId: string
	readonly selectedProjectId: string
	readonly selectedProject: ChatProject | null
	readonly connectedProjectId: string
	readonly roles: Role[]
	readonly teams: Team[]
	readonly runs: Run[]
	readonly playbooks: Playbook[]
	readonly selectedRunId: string
	readonly selectedRun: Run | null
	readonly timeline: TimelineEvent[]
	readonly workspaceAllocations: WorkspaceAllocation[]
	listProjects(): Promise<void>
	createProject(name: string, rootPath: string): Promise<ChatProject>
	selectProject(projectId: string): void
	connect(name: string, description: string): Promise<void>
	sendMessage(text: string, mentions?: string[]): Promise<void>
	disconnect(): void
	handleNotification(method: string, params: unknown): void
	// Roles
	listRoles(scope?: RoleScope, projectId?: string): Promise<void>
	createRole(
		name: string,
		description: string,
		scope: RoleScope,
		projectId?: string,
		agentConfig?: {
			runtime: string
			system_prompt: string | null
			model: string | null
		},
	): Promise<Role>
	updateRole(id: string, name?: string, description?: string): Promise<Role>
	deleteRole(id: string): Promise<void>
	// Teams
	listTeams(projectId: string): Promise<void>
	createTeam(
		name: string,
		projectId: string,
		members: TeamMember[],
	): Promise<Team>
	updateTeam(id: string, name?: string, members?: TeamMember[]): Promise<Team>
	deleteTeam(id: string): Promise<void>
	// Runs
	listRuns(projectId: string, status?: RunStatus): Promise<void>
	createRun(
		name: string,
		projectId: string,
		teamId: string,
		playbookId?: PlaybookId,
		phases?: Array<{ name: string; approval_required?: boolean }>,
	): Promise<Run>
	getRun(id: string): Promise<Run>
	advanceRun(id: string): Promise<Run>
	approveRun(
		id: string,
		decision: 'approved' | 'rejected',
		reason?: string,
	): Promise<Run>
	selectRun(runId: string): void
	// Agents
	spawnProjectAgent(projectId: string, roleId: string): Promise<unknown>
	getProjectAgents(projectId: string): Promise<
		Array<{
			role_id: string
			agent_name: string
			runtime: string
			status: string
		}>
	>
	// Playbooks
	listPlaybooks(): Promise<void>
	// Workspaces
	listWorkspaceAllocations(runId: string): Promise<void>
	createWorkspaceAllocation(
		runId: string,
		allocation: CreateWorkspaceAllocationRequest,
	): Promise<WorkspaceAllocation>
	deleteWorkspaceAllocation(id: string): Promise<void>
	// Timeline
	loadTimeline(runId: string): Promise<void>
	// Reviews
	addReviewFeedback(
		runId: string,
		comment: string,
		author: string,
	): Promise<TimelineEvent>
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
	let projects = $state<ChatProject[]>([])
	let connected = $state(false)
	let myName = $state('')
	let channelId = $state('')
	let selectedProjectId = $state('')
	let connectedProjectId = $state('')
	let socket = $state<ChatroomSocket | null>(null)
	let roles = $state<Role[]>([])
	let teams = $state<Team[]>([])
	let runs = $state<Run[]>([])
	let playbooks = $state<Playbook[]>([])
	let selectedRunId = $state('')
	let timeline = $state<TimelineEvent[]>([])
	let workspaceAllocations = $state<WorkspaceAllocation[]>([])
	let rpcIdCounter = 0
	const pendingRequests = new Map<string | number, PendingRequest>()

	function getSelectedProjectById(projectId: string): ChatProject | null {
		return projects.find((project) => project.id === projectId) ?? null
	}

	function getActiveProject(): ChatProject | null {
		return (
			getSelectedProjectById(connectedProjectId) ??
			getSelectedProjectById(selectedProjectId)
		)
	}

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

	async function readJsonOrThrow<T>(response: Response): Promise<T> {
		if (!response.ok) {
			const error = (await response.json()) as { error?: string }
			throw new Error(error.error || response.statusText)
		}

		return (await response.json()) as T
	}

	async function listProjects() {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/projects`,
		)
		const data = await readJsonOrThrow<ProjectsResponse>(response)
		projects = data.projects

		if (selectedProjectId && !getSelectedProjectById(selectedProjectId)) {
			selectedProjectId = ''
		}

		if (connectedProjectId && !getSelectedProjectById(connectedProjectId)) {
			connectedProjectId = ''
		}
	}

	async function createProject(
		name: string,
		rootPath: string,
	): Promise<ChatProject> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/projects`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, root_path: rootPath }),
			},
		)
		const data = await readJsonOrThrow<CreateProjectResponse>(response)

		projects = [...projects, data.project]
		selectedProjectId = data.project.id

		return data.project
	}

	function selectProject(projectId: string): void {
		if (!projectId) {
			selectedProjectId = ''
			return
		}

		if (getSelectedProjectById(projectId)) {
			selectedProjectId = projectId
		}
	}

	async function refreshMembers(projectId: string) {
		try {
			const response = await dependencies.fetchImpl(
				`${dependencies.serverUrl}/members?project_id=${encodeURIComponent(projectId)}`,
			)
			if (!response.ok) return

			const data = (await response.json()) as MembersResponse
			members = data.members.map((member) => ({
				name: member.name,
				description: member.description,
				channel_id: member.channel_id,
				...(member.runtime ? { runtime: member.runtime } : {}),
			}))
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

	function connectWebSocket(name: string, projectId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!dependencies.WebSocketImpl) {
				reject(new Error('WebSocket is not available'))
				return
			}

			let wsUrlStr = `${dependencies.wsUrl}/ws?name=${encodeURIComponent(name)}&project_id=${encodeURIComponent(projectId)}`
			if (selectedRunId) {
				wsUrlStr += `&run_id=${encodeURIComponent(selectedRunId)}`
			}

			const nextSocket = new dependencies.WebSocketImpl(wsUrlStr)

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
				connectedProjectId = ''
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
		const projectId = selectedProjectId
		const project = getSelectedProjectById(projectId)

		if (!projectId || !project) {
			throw new Error('Select a project first')
		}

		const connectBody: Record<string, string> = {
			name,
			description,
			project_id: projectId,
		}
		if (selectedRunId) {
			connectBody.run_id = selectedRunId
		}

		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/connect`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(connectBody),
			},
		)
		const data = await readJsonOrThrow<ConnectResponse>(response)
		myName = name
		channelId = data.channel_id
		selectedProjectId = data.project_id
		connectedProjectId = data.project_id

		await connectWebSocket(name, data.project_id)
		connected = true
		await refreshMembers(data.project_id)
		addSystemMessage(`You joined "${project.name}" as "${name}"`)
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
		connectedProjectId = ''
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
						channel_id:
							channelId || getActiveProject()?.channel_id || connectedProjectId,
					},
				]
				// Backfill runtime info (member_joined notifications don't carry it,
				// but the /members endpoint does — needed for the agent vs human split).
				const projectIdForRefresh = connectedProjectId
				if (projectIdForRefresh) {
					void refreshMembers(projectIdForRefresh)
				}
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

	// ── Roles ──────────────────────────────────────────────────────────────────

	async function listRoles(
		scope?: RoleScope,
		projectId?: string,
	): Promise<void> {
		const params = new URLSearchParams()
		if (scope) params.set('scope', scope)
		if (projectId) params.set('project_id', projectId)
		const qs = params.toString()
		const url = `${dependencies.serverUrl}/roles${qs ? `?${qs}` : ''}`
		const response = await dependencies.fetchImpl(url)
		const data = await readJsonOrThrow<RolesResponse>(response)
		roles = data.roles
	}

	async function createRole(
		name: string,
		description: string,
		scope: RoleScope,
		projectId?: string,
		agentConfig?: {
			runtime: string
			system_prompt: string | null
			model: string | null
		},
	): Promise<Role> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/roles`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					description,
					scope,
					...(projectId ? { project_id: projectId } : {}),
					...(agentConfig ? { agent_config: agentConfig } : {}),
				}),
			},
		)
		const data = await readJsonOrThrow<CreateRoleResponse>(response)
		roles = [...roles, data.role]
		return data.role
	}

	async function updateRole(
		id: string,
		name?: string,
		description?: string,
	): Promise<Role> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/roles/${encodeURIComponent(id)}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...(name !== undefined ? { name } : {}),
					...(description !== undefined ? { description } : {}),
				}),
			},
		)
		const data = await readJsonOrThrow<UpdateRoleResponse>(response)
		roles = roles.map((r) => (r.id === id ? data.role : r))
		return data.role
	}

	async function deleteRole(id: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/roles/${encodeURIComponent(id)}`,
			{ method: 'DELETE' },
		)
		await readJsonOrThrow<DeleteRoleResponse>(response)
		roles = roles.filter((r) => r.id !== id)
	}

	// ── Agents ─────────────────────────────────────────────────────────────────

	async function spawnProjectAgent(
		projectId: string,
		roleId: string,
	): Promise<unknown> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/projects/${encodeURIComponent(projectId)}/agents/spawn`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role_id: roleId }),
			},
		)
		return readJsonOrThrow<unknown>(response)
	}

	async function getProjectAgents(projectId: string): Promise<
		Array<{
			role_id: string
			agent_name: string
			runtime: string
			status: string
		}>
	> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/projects/${encodeURIComponent(projectId)}/agents`,
		)
		const data = await readJsonOrThrow<{
			agents: Array<{
				role_id: string
				agent_name: string
				runtime: string
				status: string
			}>
		}>(response)
		return data.agents
	}

	// ── Teams ──────────────────────────────────────────────────────────────────

	async function listTeams(projectId: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/teams?project_id=${encodeURIComponent(projectId)}`,
		)
		const data = await readJsonOrThrow<TeamsResponse>(response)
		teams = data.teams
	}

	async function createTeam(
		name: string,
		projectId: string,
		teamMembers: TeamMember[],
	): Promise<Team> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/teams`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					project_id: projectId,
					members: teamMembers,
				}),
			},
		)
		const data = await readJsonOrThrow<CreateTeamResponse>(response)
		teams = [...teams, data.team]
		return data.team
	}

	async function updateTeam(
		id: string,
		name?: string,
		teamMembers?: TeamMember[],
	): Promise<Team> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/teams/${encodeURIComponent(id)}`,
			{
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...(name !== undefined ? { name } : {}),
					...(teamMembers !== undefined ? { members: teamMembers } : {}),
				}),
			},
		)
		const data = await readJsonOrThrow<UpdateTeamResponse>(response)
		teams = teams.map((t) => (t.id === id ? data.team : t))
		return data.team
	}

	async function deleteTeam(id: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/teams/${encodeURIComponent(id)}`,
			{ method: 'DELETE' },
		)
		await readJsonOrThrow<DeleteTeamResponse>(response)
		teams = teams.filter((t) => t.id !== id)
	}

	// ── Runs ───────────────────────────────────────────────────────────────────

	async function listRuns(
		projectId: string,
		status?: RunStatus,
	): Promise<void> {
		const params = new URLSearchParams({ project_id: projectId })
		if (status) params.set('status', status)
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs?${params.toString()}`,
		)
		const data = await readJsonOrThrow<RunsResponse>(response)
		runs = data.runs
	}

	async function createRun(
		name: string,
		projectId: string,
		teamId: string,
		playbookId?: PlaybookId,
		phases?: Array<{ name: string; approval_required?: boolean }>,
	): Promise<Run> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					project_id: projectId,
					team_id: teamId,
					...(playbookId ? { playbook_id: playbookId } : {}),
					...(phases ? { phases } : {}),
				}),
			},
		)
		const data = await readJsonOrThrow<CreateRunResponse>(response)
		runs = [...runs, data.run]
		return data.run
	}

	async function getRun(id: string): Promise<Run> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(id)}`,
		)
		const data = await readJsonOrThrow<RunResponse>(response)
		runs = runs.map((r) => (r.id === id ? data.run : r))
		return data.run
	}

	async function advanceRun(id: string): Promise<Run> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(id)}/advance`,
			{ method: 'POST' },
		)
		const data = await readJsonOrThrow<AdvanceRunResponse>(response)
		runs = runs.map((r) => (r.id === id ? data.run : r))
		return data.run
	}

	async function approveRun(
		id: string,
		decision: 'approved' | 'rejected',
		reason?: string,
	): Promise<Run> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(id)}/approve`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					decision,
					...(reason !== undefined ? { reason } : {}),
				}),
			},
		)
		const data = await readJsonOrThrow<ApproveRunResponse>(response)
		runs = runs.map((r) => (r.id === id ? data.run : r))
		return data.run
	}

	function selectRun(runId: string): void {
		selectedRunId = runId
	}

	function getSelectedRunById(): Run | null {
		return runs.find((r) => r.id === selectedRunId) ?? null
	}

	// ── Playbooks ──────────────────────────────────────────────────────────────

	async function listPlaybooks(): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/playbooks`,
		)
		const data = await readJsonOrThrow<PlaybooksResponse>(response)
		playbooks = data.playbooks
	}

	// ── Workspaces ─────────────────────────────────────────────────────────────

	async function listWorkspaceAllocations(runId: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(runId)}/workspaces`,
		)
		const data = await readJsonOrThrow<WorkspaceAllocationsResponse>(response)
		workspaceAllocations = data.allocations
	}

	async function createWorkspaceAllocation(
		runId: string,
		allocation: CreateWorkspaceAllocationRequest,
	): Promise<WorkspaceAllocation> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(runId)}/workspaces`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(allocation),
			},
		)
		const data = await readJsonOrThrow<WorkspaceAllocationResponse>(response)
		workspaceAllocations = [...workspaceAllocations, data.allocation]
		return data.allocation
	}

	async function deleteWorkspaceAllocation(id: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/workspaces/${encodeURIComponent(id)}`,
			{ method: 'DELETE' },
		)
		await readJsonOrThrow<DeleteWorkspaceAllocationResponse>(response)
		workspaceAllocations = workspaceAllocations.filter((a) => a.id !== id)
	}

	// ── Timeline ───────────────────────────────────────────────────────────────

	async function loadTimeline(runId: string): Promise<void> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(runId)}/timeline`,
		)
		const data = await readJsonOrThrow<TimelineResponse>(response)
		timeline = data.events
	}

	// ── Reviews ────────────────────────────────────────────────────────────────

	async function addReviewFeedback(
		runId: string,
		comment: string,
		author: string,
	): Promise<TimelineEvent> {
		const response = await dependencies.fetchImpl(
			`${dependencies.serverUrl}/runs/${encodeURIComponent(runId)}/reviews`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ run_id: runId, comment, author }),
			},
		)
		const data = await readJsonOrThrow<ReviewFeedbackResponse>(response)
		timeline = [...timeline, data.event]
		return data.event
	}

	return {
		get messages() {
			return messages
		},
		get members() {
			return members
		},
		get projects() {
			return projects
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
		get selectedProjectId() {
			return selectedProjectId
		},
		get selectedProject() {
			return getSelectedProjectById(selectedProjectId)
		},
		get connectedProjectId() {
			return connectedProjectId
		},
		get roles() {
			return roles
		},
		get teams() {
			return teams
		},
		get runs() {
			return runs
		},
		get playbooks() {
			return playbooks
		},
		get selectedRunId() {
			return selectedRunId
		},
		get selectedRun() {
			return getSelectedRunById()
		},
		get timeline() {
			return timeline
		},
		get workspaceAllocations() {
			return workspaceAllocations
		},
		listProjects,
		createProject,
		selectProject,
		connect,
		sendMessage,
		disconnect,
		handleNotification,
		listRoles,
		createRole,
		updateRole,
		deleteRole,
		spawnProjectAgent,
		getProjectAgents,
		listTeams,
		createTeam,
		updateTeam,
		deleteTeam,
		listRuns,
		createRun,
		getRun,
		advanceRun,
		approveRun,
		selectRun,
		listPlaybooks,
		listWorkspaceAllocations,
		createWorkspaceAllocation,
		deleteWorkspaceAllocation,
		loadTimeline,
		addReviewFeedback,
	}
}

export const chatroomModel = createChatroomModel()

export function getMessages() {
	return chatroomModel.messages
}

export function getMembers() {
	return chatroomModel.members
}

export function getProjects() {
	return chatroomModel.projects
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

export function getSelectedProject() {
	return chatroomModel.selectedProject
}

export function getRoles() {
	return chatroomModel.roles
}

export function getTeams() {
	return chatroomModel.teams
}

export function getRuns() {
	return chatroomModel.runs
}

export function getPlaybooks() {
	return chatroomModel.playbooks
}

export function getSelectedRun() {
	return chatroomModel.selectedRun
}

export function getTimeline() {
	return chatroomModel.timeline
}

export function getWorkspaceAllocations() {
	return chatroomModel.workspaceAllocations
}

export const connect = chatroomModel.connect
export const listProjects = chatroomModel.listProjects
export const createProject = chatroomModel.createProject
export const selectProject = chatroomModel.selectProject
export const sendMessage = chatroomModel.sendMessage
export const disconnect = chatroomModel.disconnect
export const listRoles = chatroomModel.listRoles
export const createRole = chatroomModel.createRole
export const updateRole = chatroomModel.updateRole
export const deleteRole = chatroomModel.deleteRole
export const spawnProjectAgent = chatroomModel.spawnProjectAgent
export const getProjectAgents = chatroomModel.getProjectAgents
export const listTeams = chatroomModel.listTeams
export const createTeam = chatroomModel.createTeam
export const updateTeam = chatroomModel.updateTeam
export const deleteTeam = chatroomModel.deleteTeam
export const listRuns = chatroomModel.listRuns
export const createRun = chatroomModel.createRun
export const getRun = chatroomModel.getRun
export const advanceRun = chatroomModel.advanceRun
export const approveRun = chatroomModel.approveRun
export const selectRun = chatroomModel.selectRun
export const listPlaybooks = chatroomModel.listPlaybooks
export const listWorkspaceAllocations = chatroomModel.listWorkspaceAllocations
export const createWorkspaceAllocation = chatroomModel.createWorkspaceAllocation
export const deleteWorkspaceAllocation = chatroomModel.deleteWorkspaceAllocation
export const loadTimeline = chatroomModel.loadTimeline
export const addReviewFeedback = chatroomModel.addReviewFeedback
