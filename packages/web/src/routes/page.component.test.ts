import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const connectMock =
	vi.fn<(name: string, description: string) => Promise<void>>()
const sendMessageMock = vi.fn<(text: string) => Promise<void>>()
const disconnectMock = vi.fn<() => void>()

const mockState = {
	connected: false,
	myName: '',
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
}

vi.mock('$lib/chatroom.svelte.js', () => ({
	connect: (...args: Parameters<typeof connectMock>) => connectMock(...args),
	sendMessage: (...args: Parameters<typeof sendMessageMock>) =>
		sendMessageMock(...args),
	disconnect: () => disconnectMock(),
	getMessages: () => mockState.messages,
	getMembers: () => mockState.members,
	isConnected: () => mockState.connected,
	getMyName: () => mockState.myName,
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
		sendMessageMock.mockReset()
		disconnectMock.mockReset()
		mockState.connected = false
		mockState.myName = ''
		mockState.members = []
		mockState.messages = []
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		}) as typeof requestAnimationFrame
	})

	afterEach(() => {
		cleanup()
	})

	it('submits the join form with trimmed values', async () => {
		connectMock.mockResolvedValue(undefined)
		render(Page)

		const nameInput = screen.getByLabelText('Name')
		const descriptionInput = screen.getByLabelText('Role description')
		const joinButton = screen.getByRole('button', { name: 'Join Chatroom' })

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

	it('renders the connected chatroom state and mention badges', () => {
		mockState.connected = true
		mockState.myName = 'alpha'
		mockState.members = [
			{
				name: 'alpha',
				description: 'frontend agent',
				channel_id: 'general',
			},
			{
				name: 'beta',
				description: 'backend agent',
				channel_id: 'general',
			},
		]
		mockState.messages = [
			{
				id: 'system-1',
				type: 'system',
				text: 'beta joined',
				mentions: [],
				timestamp: '2026-04-04T12:00:00.000Z',
			},
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

		expect(screen.getByText('Members')).toBeTruthy()
		expect(screen.getAllByText('beta')).toHaveLength(2)
		expect(screen.getByText('hello alpha')).toBeTruthy()
		expect(screen.getByText('@alpha')).toBeTruthy()
	})

	it('calls disconnect when the disconnect button is clicked', async () => {
		mockState.connected = true
		mockState.myName = 'alpha'

		render(Page)
		await fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

		expect(disconnectMock).toHaveBeenCalledTimes(1)
	})
})
