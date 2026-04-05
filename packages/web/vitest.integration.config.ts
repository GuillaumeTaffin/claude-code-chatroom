import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
		test: {
			environment: 'node',
			include: ['src/**/*.it.test.ts'],
			passWithNoTests: true,
		},
	}),
)
