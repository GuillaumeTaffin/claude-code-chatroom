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
- `bun run check:test` for workspace tests.
- `bun run check:coverage` for workspace coverage.
- `bun run check:lint` for workspace linting.
- `bun run check:format` for workspace formatting checks.
- `bun run --filter @chatroom/web build` for a production build of the UI.
- `bun run --filter @chatroom/web check:types` for Svelte and TypeScript validation.
