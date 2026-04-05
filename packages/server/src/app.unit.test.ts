import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

describe('createApp', () => {
  it('creates an Elysia app instance', () => {
    const app = createApp()

    expect(typeof app.handle).toBe('function')
  })
})
