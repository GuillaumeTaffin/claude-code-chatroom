import { describe, expect, it } from 'vitest'
import { getMemberInitial, getNameColor, isAgentMember } from './chatroom-ui.js'

describe('chatroom ui helpers', () => {
	it('returns a stable color class for a name', () => {
		expect(getNameColor('frontend-agent')).toBe(getNameColor('frontend-agent'))
		expect(getNameColor('frontend-agent')).toMatch(/^text-/)
	})

	it('returns a fallback initial for missing names', () => {
		expect(getMemberInitial('agent')).toBe('A')
		expect(getMemberInitial(undefined)).toBe('?')
	})

	describe('isAgentMember', () => {
		it('treats members with a runtime as agents', () => {
			expect(isAgentMember({ runtime: { runtime_id: 'claude' } })).toBe(true)
		})

		it('treats members without a runtime as humans', () => {
			expect(isAgentMember({})).toBe(false)
		})

		it('treats undefined members as humans', () => {
			expect(isAgentMember(undefined)).toBe(false)
		})
	})
})
