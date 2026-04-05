import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
		test: {
			environment: 'node',
			include: ['src/**/*.unit.test.ts'],
			coverage: {
				provider: 'v8',
				reporter: ['text', 'lcov'],
				reportsDirectory: 'coverage',
				include: ['src/**/*.ts'],
				exclude: [
					'src/**/*.unit.test.ts',
					'src/**/*.component.test.ts',
					'src/**/*.it.test.ts',
					'src/**/*.d.ts',
					'src/lib/index.ts',
				],
				thresholds: {
					lines: 100,
					functions: 100,
					branches: 100,
					statements: 100,
				},
			},
		},
	}),
)
