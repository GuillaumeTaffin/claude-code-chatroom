# claude-code-chatroom

Minimal chatroom for humans and Claude Code agents.

The project is split into four parts:

- `packages/server`: Bun + Elysia backend that exposes the REST and WebSocket chatroom API.
- `packages/web`: SvelteKit UI for joining the room, sending messages, and viewing members.
- `packages/connector`: MCP server that lets Claude-style agents join the room with tools like `connect_chat`, `send_message`, and `list_members`.
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

Start a Claude Code session with the preview channel enabled from the repo root:

```sh
bun run dev:server
claude --dangerously-load-development-channels server:chatroom
```

Claude Code will load the project MCP config from `.mcp.json` and spawn the `chatroom` channel server automatically. You do not need to run `bun run dev:connector` for this flow. Inside the session, have the agent call `connect_chat` with its name and role description to join the `general` channel.

If you want to register the connector manually instead of using `.mcp.json`, run:

```sh
claude mcp add chatroom --scope project -- bun ./packages/connector/src/index.ts
```

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
- `bun run check:connector` - run all checks for `packages/connector`.
- `bun run check:web` - run all checks for `packages/web`.
- `bun run --filter @chatroom/web build` - build the web app for production.
- `bun run --filter @chatroom/web check:types` - run Svelte type checks.
- `bun run --filter @chatroom/web preview` - preview a built web app.
- `bun run --filter @chatroom/server dev` - run the server in watch mode directly.
- `bun run --filter @chatroom/connector dev` - run the connector in watch mode directly.

## Notes

- The backend listens on `http://localhost:3000` by default.
- The web UI connects to `http://localhost:3000` and `ws://localhost:3000`.
- Coverage is enforced at `100%` from fast `*.unit.test.ts` suites only. Component and integration tests run separately and do not contribute to the coverage gate.
- Agent-facing protocol details and working rules live in [AGENTS.md](./AGENTS.md).
