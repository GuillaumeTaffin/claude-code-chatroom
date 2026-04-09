import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock =
	vi.fn<(name: string, description: string) => Promise<void>>()
const listProjectsMock = vi.fn<() => Promise<void>>()
const createProjectMock =
	vi.fn<(name: string, rootPath: string) => Promise<unknown>>()
const selectProjectMock = vi.fn<(projectId: string) => void>()
const sendMessageMock = vi.fn<(text: string) => Promise<void>>()
const disconnectMock = vi.fn<() => void>()

const alphaProject = {
	id: 'project-1',
	name: 'Alpha',
	root_path: '/workspace/alpha',
	channel_id: 'project-1',
}

const mockState = {
	connected: false,
	myName: '',
	selectedProject: null as typeof alphaProject | null,
	projects: [] as Array<typeof alphaProject>,
	members: [] as Array<{
		name: string
		description: string
		channel_id: string
	}>,
	messages: [] as Array<{
		id: string
		type: 'message' | 'system'
		sender?: string
		text: string
		mentions: string[]
		timestamp: string
	}>,
	roles: [] as unknown[],
	teams: [] as unknown[],
	runs: [] as unknown[],
	playbooks: [] as unknown[],
	selectedRun: null as unknown,
	timeline: [] as unknown[],
	workspaceAllocations: [] as unknown[],
}

vi.mock('$lib/chatroom.svelte.js', () => ({
	connect: (...args: Parameters<typeof connectMock>) => connectMock(...args),
	listProjects: () => listProjectsMock(),
	createProject: (...args: Parameters<typeof createProjectMock>) =>
		createProjectMock(...args),
	selectProject: (...args: Parameters<typeof selectProjectMock>) =>
		selectProjectMock(...args),
	sendMessage: (...args: Parameters<typeof sendMessageMock>) =>
		sendMessageMock(...args),
	disconnect: () => disconnectMock(),
	getMessages: () => mockState.messages,
	getMembers: () => mockState.members,
	getProjects: () => mockState.projects,
	getSelectedProject: () => mockState.selectedProject,
	isConnected: () => mockState.connected,
	getMyName: () => mockState.myName,
	getRoles: () => mockState.roles,
	getTeams: () => mockState.teams,
	getRuns: () => mockState.runs,
	getPlaybooks: () => mockState.playbooks,
	getSelectedRun: () => mockState.selectedRun,
	getTimeline: () => mockState.timeline,
	getWorkspaceAllocations: () => mockState.workspaceAllocations,
	listRoles: vi.fn().mockResolvedValue(undefined),
	createRole: vi.fn(),
	updateRole: vi.fn(),
	deleteRole: vi.fn(),
	spawnProjectAgent: vi.fn().mockResolvedValue(undefined),
	getProjectAgents: vi.fn().mockResolvedValue([]),
	listTeams: vi.fn().mockResolvedValue(undefined),
	createTeam: vi.fn(),
	updateTeam: vi.fn(),
	deleteTeam: vi.fn(),
	listRuns: vi.fn().mockResolvedValue(undefined),
	createRun: vi.fn(),
	getRun: vi.fn(),
	advanceRun: vi.fn(),
	approveRun: vi.fn(),
	selectRun: vi.fn(),
	listPlaybooks: vi.fn().mockResolvedValue(undefined),
	listWorkspaceAllocations: vi.fn().mockResolvedValue(undefined),
	createWorkspaceAllocation: vi.fn(),
	deleteWorkspaceAllocation: vi.fn(),
	loadTimeline: vi.fn().mockResolvedValue(undefined),
	addReviewFeedback: vi.fn(),
	getChannelId: () => '',
}))

import Page from './+page.svelte'

describe('chatroom page component', () => {
	beforeEach(() => {
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as typeof ResizeObserver
		connectMock.mockReset()
		listProjectsMock.mockReset().mockResolvedValue(undefined)
		createProjectMock.mockReset().mockResolvedValue(alphaProject)
		selectProjectMock.mockReset()
		sendMessageMock.mockReset()
		disconnectMock.mockReset()
		mockState.connected = false
		mockState.myName = ''
		mockState.selectedProject = null
		mockState.projects = []
		mockState.members = []
		mockState.messages = []
		mockState.roles = []
		mockState.teams = []
		mockState.runs = []
		mockState.playbooks = []
		mockState.selectedRun = null
		mockState.timeline = []
		mockState.workspaceAllocations = []
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		}) as typeof requestAnimationFrame
	})

	afterEach(() => {
		cleanup()
	})

	it('submits the project creation form with trimmed values', async () => {
		render(Page)

		expect(listProjectsMock).toHaveBeenCalledTimes(1)

		const nameInput = screen.getByLabelText('Project name')
		const rootPathInput = screen.getByLabelText('Root path')
		const createButton = screen.getByRole('button', { name: 'Create Project' })

		await fireEvent.input(nameInput, {
			target: { value: '  Alpha  ' },
		})
		await fireEvent.input(rootPathInput, {
			target: { value: '  /workspace/alpha  ' },
		})
		await fireEvent.click(createButton)

		expect(createProjectMock).toHaveBeenCalledWith('Alpha', '/workspace/alpha')
	})

	it('renders saved projects and opens the selected workspace', async () => {
		mockState.projects = [alphaProject]

		render(Page)
		await fireEvent.click(screen.getByRole('button', { name: /Open/ }))

		expect(selectProjectMock).toHaveBeenCalledWith('project-1')
	})

	it('submits the join form for the selected project', async () => {
		connectMock.mockResolvedValue(undefined)
		mockState.selectedProject = alphaProject

		render(Page)

		const nameInput = screen.getByLabelText('Name')
		const descriptionInput = screen.getByLabelText('Description')
		const joinButton = screen.getByRole('button', {
			name: 'Join Chat',
		})

		await fireEvent.input(nameInput, {
			target: { value: '  frontend-agent  ' },
		})
		await fireEvent.input(descriptionInput, {
			target: { value: '  Handles UI components  ' },
		})
		await fireEvent.click(joinButton)

		expect(connectMock).toHaveBeenCalledWith(
			'frontend-agent',
			'Handles UI components',
		)
	})

	it('renders connected chat with members and messages', () => {
		mockState.connected = true
		mockState.myName = 'alpha'
		mockState.selectedProject = alphaProject
		mockState.members = [
			{
				name: 'alpha',
				description: 'frontend agent',
				channel_id: 'project-1',
			},
			{
				name: 'beta',
				description: 'backend agent',
				channel_id: 'project-1',
			},
		]
		mockState.messages = [
			{
				id: 'message-1',
				type: 'message',
				sender: 'beta',
				text: 'hello alpha',
				mentions: ['alpha'],
				timestamp: '2026-04-04T12:01:00.000Z',
			},
		]

		render(Page)

		expect(screen.getByText('hello alpha')).toBeTruthy()
	})

	it('calls disconnect when the disconnect button is clicked', async () => {
		mockState.connected = true
		mockState.myName = 'alpha'
		mockState.selectedProject = alphaProject

		render(Page)
		await fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

		expect(disconnectMock).toHaveBeenCalledTimes(1)
	})
})
