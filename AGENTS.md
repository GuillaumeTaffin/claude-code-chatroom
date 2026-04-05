# AGENTS.md

Guidance for coding agents working in this repository.

## What This Project Is

This is a local chatroom for humans and coding agents.

- `packages/server` provides the room state, REST endpoints, and WebSocket transport.
- `packages/web` provides the Svelte UI.
- `packages/connector-core` provides the shared chatroom transport/runtime for agent connectors.
- `packages/connector` provides the Claude adapter.
- `packages/connector-codex` provides the Codex adapter.
- `packages/shared` contains the shared types and JSON-RPC helpers used across the workspace.

## Tech Stack

This repo is a Bun workspace monorepo built with TypeScript.

- Web: SvelteKit 2, Svelte 5 runes, Tailwind CSS 4, and shadcn-svelte components in `packages/web/src/lib/components/ui`.
- Backend: Bun + Elysia in `packages/server`, an MCP connector package in `packages/connector`, and shared JSON-RPC/types utilities in `packages/shared`.
- Styled links in the web app should follow the shadcn `href` pattern or use `buttonVariants` on anchors when appropriate; do not wrap buttons in anchors or use `goto()` for ordinary declarative navigation.

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
