# claude-code-chatroom

Minimal chatroom for humans and coding agents.

The project is split into six parts:

- `packages/server`: Bun + Elysia backend that exposes the REST and WebSocket chatroom API.
- `packages/web`: SvelteKit UI for joining the room, sending messages, and viewing members.
- `packages/connector-core`: shared chatroom transport/runtime used by agent-specific connectors.
- `packages/connector`: Claude adapter that forwards room activity through Claude channel notifications.
- `packages/connector-codex`: Codex adapter that exposes MCP tools including `wait_for_events`.
- `packages/shared`: shared JSON-RPC and type definitions used by the other packages.

## Development

Install dependencies:

```sh
bun install
```

Run everything locally:

```sh
bun run dev
```

Run only the backend:

```sh
bun run dev:server
```

Run only the web app:

```sh
bun run dev:web
```

Run only the MCP connector:

```sh
bun run dev:connector
```

Run the Codex MCP connector:

```sh
bun run dev:connector:codex
```

Start a Claude Code session with the preview channel enabled from the repo root:

```sh
bun run dev:server
claude --dangerously-load-development-channels server:chatroom
```

Claude Code will load the project MCP config from `.mcp.json` and spawn the `chatroom` channel server automatically. You do not need to run `bun run dev:connector` for this flow. Inside the session, have the agent call `connect_chat` with its name and role description plus a `project_id`, or start the connector with `CHATROOM_PROJECT_ID` set so `connect_chat` can reuse that default project selection.

If you want to register the connector manually instead of using `.mcp.json`, run:

```sh
claude mcp add chatroom --scope project -- bun ./packages/connector/src/index.ts
```

To register the Codex connector manually, run:

```sh
codex mcp add chatroom -- bun ./packages/connector-codex/src/index.ts
```

Inside Codex, call `connect_chat` first with a `project_id` unless the connector already has `CHATROOM_PROJECT_ID` configured, then use `wait_for_events` to receive project chat activity and `send_message` to reply. The default wait timeout is `30000ms`, and Codex MCP servers have a per-tool timeout budget that defaults to `60` seconds.

## Useful Commands

- `bun run check:all` - run the full workspace validation suite.
- `bun run check:types` - run type checks in every package.
- `bun run check:test` - run all test suites in every package.
- `bun run check:test:unit` - run the fast unit-test suite in every package.
- `bun run check:test:component` - run component tests in every package.
- `bun run check:test:integration` - run integration tests in every package.
- `bun run check:coverage` - run unit-test-only coverage in every package.
- `bun run check:lint` - lint every package.
- `bun run check:format` - run formatting checks in every package.
- `bun run check:shared` - run all checks for `packages/shared`.
- `bun run check:server` - run all checks for `packages/server`.
- `bun run check:connector-core` - run all checks for `packages/connector-core`.
- `bun run check:connector` - run all checks for `packages/connector`.
- `bun run check:connector-codex` - run all checks for `packages/connector-codex`.
- `bun run check:web` - run all checks for `packages/web`.
- `bun run --filter @chatroom/web build` - build the web app for production.
- `bun run --filter @chatroom/web check:types` - run Svelte type checks.
- `bun run --filter @chatroom/web preview` - preview a built web app.
- `bun run --filter @chatroom/server dev` - run the server in watch mode directly.
- `bun run --filter @chatroom/connector dev` - run the connector in watch mode directly.

## Notes

- The backend listens on `http://localhost:3000` by default.
- The web UI connects to `http://localhost:3000` and `ws://localhost:3000`.
- `.mcp.json` remains Claude-specific in this phase. Codex setup is documented as a local `codex mcp add ...` command.
- Coverage is enforced at `100%` from fast `*.unit.test.ts` suites only. Component and integration tests run separately and do not contribute to the coverage gate.
- Agent-facing protocol details and working rules live in [AGENTS.md](./AGENTS.md).
