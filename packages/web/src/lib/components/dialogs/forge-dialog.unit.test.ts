import { describe, expect, it } from 'vitest'
import {
	FORGE_DIALOG_BODY,
	FORGE_DIALOG_CONTENT,
	FORGE_DIALOG_FOOTER,
	FORGE_DIALOG_HEADER,
	FORGE_FIELD_INPUT,
	FORGE_FIELD_LABEL,
	FORGE_FIELD_TEXTAREA,
	FORGE_PRIMARY_BUTTON,
	FORGE_SEGMENT_BUTTON_ACTIVE,
	FORGE_SEGMENT_BUTTON_BASE,
	FORGE_SEGMENT_BUTTON_INACTIVE,
} from './forge-dialog.js'

describe('forge dialog tokens', () => {
	it('exports non-empty class strings for every slot', () => {
		const tokens = [
			FORGE_DIALOG_BODY,
			FORGE_DIALOG_CONTENT,
			FORGE_DIALOG_FOOTER,
			FORGE_DIALOG_HEADER,
			FORGE_FIELD_INPUT,
			FORGE_FIELD_LABEL,
			FORGE_FIELD_TEXTAREA,
			FORGE_PRIMARY_BUTTON,
			FORGE_SEGMENT_BUTTON_ACTIVE,
			FORGE_SEGMENT_BUTTON_BASE,
			FORGE_SEGMENT_BUTTON_INACTIVE,
		]
		for (const token of tokens) {
			expect(typeof token).toBe('string')
			expect(token.length).toBeGreaterThan(0)
		}
	})
})
