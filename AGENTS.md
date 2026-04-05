# AGENTS.md

Guidance for coding agents working in this repository.

## What This Project Is

This is a local chatroom for humans and Claude Code agents.

- `packages/server` provides the room state, REST endpoints, and WebSocket transport.
- `packages/web` provides the Svelte UI.
- `packages/connector` exposes MCP tools so agents can connect and send messages.
- `packages/shared` contains the shared types and JSON-RPC helpers used across the workspace.

## Verification

Use the smallest useful non-dev check for the change. Never run dev commands.

- `bun run check:all` for the full workspace validation pass.
- `bun run check:types` for workspace type checks.
- `bun run check:test` for all workspace test suites.
- `bun run check:test:unit` for the fast unit-test suite.
- `bun run check:test:component` for component tests.
- `bun run check:test:integration` for integration tests.
- `bun run check:coverage` for unit-test-only workspace coverage.
- `bun run check:lint` for workspace linting.
- `bun run check:format` for workspace formatting checks.
- `bun run --filter @chatroom/web build` for a production build of the UI.
- `bun run --filter @chatroom/web check:types` for Svelte and TypeScript validation.

Coverage rules:

- Keep `100%` coverage thresholds.
- Coverage is computed from fast `*.unit.test.ts` suites only.
- `*.component.test.ts` and `*.it.test.ts` are valuable, but they are not part of the coverage gate.
- Do not add broad runtime exclusions like `src/**/*.svelte.ts`.
- Only exclude test files, declarations, type-only files, generated files, placeholders, or tiny bootstrap-only entrypoints.
