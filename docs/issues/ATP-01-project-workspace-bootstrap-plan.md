# ATP-01 Implementation Plan

## Parent Issue

[ATP-01: Project Workspace Bootstrap](./ATP-01-project-workspace-bootstrap.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Goal

Make the product project-centered instead of room-centered by introducing a first-class `Project` object and scoping chat to the selected project.

This slice should deliver one thin but complete path:

- create a project from the UI
- persist it behind a domain-owned inventory abstraction in the server
- select it in the UI
- connect to that project's chat from the web client and the shipped agent connectors
- see members and messages only for that project

## Current State

- The backend has a `Room` model keyed by `channelId`, but the app hardcodes `general` almost everywhere.
- REST routes only support `POST /connect` and `GET /members`, both tied to the default room.
- WebSocket connections only identify the member by `name`; there is no project or room selection in the handshake.
- Shared contracts do not contain any project model.
- The web app is a single-page join/chat flow with no project list or project detail context.
- The current partial ATP-01 implementation moved the web flow and server routes toward project chat, but the agent connectors still use the old global-room contract and cannot join selected project chats.
- The current server shape also exposes module-global storage directly to transport handlers instead of going through a domain-owned inventory boundary.

## Target Scope For ATP-01

- One project catalog exposed through a `ProjectInventory` interface with an in-memory implementation on the server.
- A project has:
  - `id` as an opaque UUID
  - `name`
  - `root_path`
  - `channel_id` as a UUID-backed room identifier
- One project maps to one chat room for this slice.
- The UI has two major states:
  - project selection / project creation
  - active project chat
- The connector layer must remain able to join the active chat context by the end of the slice.
- No teams, runs, workflows, approvals, or worktrees in this slice.

## Proposed Domain Model

### Shared Types

Add a `Project` model to `packages/shared`:

- `id: string` as a UUID
- `name: string`
- `root_path: string`
- `channel_id: string` as a UUID-backed identifier

Add REST request/response types:

- `CreateProjectRequest`
- `CreateProjectResponse`
- `ProjectsResponse`
- `ConnectRequest` updated to include `project_id`
- `ConnectResponse` updated to include both `project_id` and `channel_id`
- `MembersResponse` updated to be project-scoped

### Server State

Split the current state responsibilities into two boundaries:

- `ProjectInventory`
  - create project
  - list projects
  - lookup project by id
- realtime room coordination
  - get room by project channel
  - keep websocket membership and broadcast state in dedicated in-memory structures

For ATP-01, a project owns a single chat channel. The server may intentionally reuse the project's UUID as the room identity or store a separate UUID-backed `channel_id`, but it should not derive identifiers from project names or other human-readable labels.

Project storage records, domain models, and transport DTOs should not be treated as the same shape. Small mapping functions at the storage/domain/transport boundaries are expected.

## API Plan

### New REST Endpoints

- `POST /projects`
  - creates a project
  - validates `name` and `root_path`
  - generates UUID-backed identifiers server-side
  - returns the created project

- `GET /projects`
  - lists all projects

### Updated REST Endpoints

- `POST /connect`
  - request includes `project_id`
  - member registration happens in the room associated with that project
  - returns the project's `channel_id`

- `GET /members?project_id=<id>`
  - returns members only for the selected project

## WebSocket Plan

Update the websocket handshake to include project context:

- from: `/ws?name=<name>`
- to: `/ws?name=<name>&project_id=<id>`

Server open/message/close handlers should resolve the room from `project_id` instead of using `DEFAULT_CHANNEL_ID`.

This is the narrowest change that makes project-scoped chat real without redesigning transport semantics.

The same project-aware contract must also reach the shipped agent connectors in this slice. A web-only project chat is not sufficient.

## Web App Plan

### State Model Changes

Extend the chatroom model to manage project state:

- available projects
- selected project
- connected project id

Recommended additions:

- `listProjects(): Promise<void>`
- `createProject(name, rootPath): Promise<Project>`
- `selectProject(projectId): void`
- `connect(name, description, projectId): Promise<void>`

The backend domain boundary is authoritative. In the web app, prefer separating project/workspace state from collaboration-space state instead of extending one flat chat store indefinitely.

### Connector Plan

Extend the connector client and MCP tools so external agent sessions can join the selected project chat:

- connector REST connect calls include `project_id`
- connector member-list calls include `project_id`
- websocket URLs include `project_id`
- connector tool surfaces expose enough project context to connect to the active project chat

### UI Changes

Replace the current join-first screen with a two-step experience:

1. Project workspace screen
   - list existing projects
   - create a new project
   - choose one project as active

2. Join project chat screen
   - join the selected project's chat with name and role description

Once connected, the chat view should show project context explicitly:

- project name
- project root path
- project-scoped member list
- project-scoped message timeline

## File-Level Implementation Map

### Shared

- `packages/shared/src/types.ts`
  - add `Project` and project REST contracts

### Server

- `packages/server/src/state.ts`
  - introduce `ProjectInventory` plus an in-memory adapter
  - stop routing everything through `general`
- `packages/server/src/routes.ts`
  - add `/projects`
  - make `/connect` and `/members` project-aware
- `packages/server/src/ws.ts`
  - require `project_id` in the websocket query
  - resolve room by project

### Connector Core / Connectors

- `packages/connector-core/src/chatroom-api.ts`
  - make connect and member listing project-aware
- `packages/connector-core/src/chatroom-client.ts`
  - carry selected project context through the client
- `packages/connector-core/src/chatroom-ws.ts`
  - include `project_id` in websocket connection setup
- `packages/connector/src/*`
  - update the connector-facing tool contract for project-aware chat participation
- `packages/connector-codex/src/*`
  - update the codex connector tool contract for project-aware chat participation

### Web

- `packages/web/src/lib/chatroom.svelte.ts`
  - add project list/create/select behavior
  - make connect/members calls project-aware
  - make websocket URL include `project_id`
- `packages/web/src/routes/+page.svelte`
  - add project creation/list UI
  - separate active project selection from chat join
  - show selected project in the connected view

## Suggested Delivery Steps

1. Add shared `Project` types and project-aware connect/member contracts.
2. Refactor server state to support `ProjectInventory` plus project-backed realtime rooms.
3. Add `/projects` endpoints and update `/connect` and `/members`.
4. Make websocket handlers project-aware.
5. Extend connector-core and the shipped connectors to use the project-aware contract.
6. Extend the web state model for project list/create/select.
7. Update the UI to expose project selection before joining chat.
8. Add and update tests across shared, server, connectors, and web.

## Testing Plan

### Shared

- contract tests for project request/response shapes if needed

### Server

- state tests for project creation and project-to-room mapping
- route tests for:
  - creating a project
  - listing projects
  - connecting to a specific project
  - listing members for a specific project
- websocket tests for:
  - rejecting missing `project_id`
  - joining the correct project room
  - ensuring messages stay inside the selected project

### Connectors

- connector-core tests for:
  - connecting with `project_id`
  - listing members for a selected project
  - opening websocket connections with `project_id`
- connector tests for:
  - project-aware `connect_chat`
  - project-aware member listing and message delivery

### Web

- model tests for:
  - listing projects
  - creating a project
  - connecting with `project_id`
  - refreshing members within a selected project
- component tests for:
  - project creation UI
  - selecting a project
  - rendering the selected project in the chat header

## Risks

- The current code uses `channel_id` as the main room identity. ATP-01 should avoid introducing both `project_id` and a second unrelated room identity without a clear mapping.
- If `project_id` and `channel_id` are both kept, they should both be opaque UUID-backed identifiers with an explicit mapping rather than parallel name-derived schemes.
- Member names are currently only unique inside a room. That is acceptable for ATP-01, but the tests should make that behavior explicit.
- The UI should not over-design the project shell yet; it only needs enough structure to make project context unambiguous.
- Partial delivery is not acceptable for this slice. If agents cannot join the selected project chat, ATP-01 is still incomplete.

## Recommended Constraint

For ATP-01, define:

- one project = one room
- one selected project at a time in the web app
- one active human connection per browser session
- all shipped agent connectors remain able to join the active project chat

That keeps the slice thin and leaves room for `Team` and `Run` to become the next real abstractions in later issues.
