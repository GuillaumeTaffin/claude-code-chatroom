import { describe, expect, it } from 'vitest'
import { getMemberInitial, getNameColor } from './chatroom-ui.js'

describe('chatroom ui helpers', () => {
	it('returns a stable color class for a name', () => {
		expect(getNameColor('frontend-agent')).toBe(getNameColor('frontend-agent'))
		expect(getNameColor('frontend-agent')).toMatch(/^text-/)
	})

	it('returns a fallback initial for missing names', () => {
		expect(getMemberInitial('agent')).toBe('A')
		expect(getMemberInitial(undefined)).toBe('?')
	})
})
