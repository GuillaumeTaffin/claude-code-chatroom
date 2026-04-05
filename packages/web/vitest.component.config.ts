import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
		test: {
			environment: 'jsdom',
			include: ['src/**/*.component.test.ts'],
			passWithNoTests: true,
		},
	}),
)
