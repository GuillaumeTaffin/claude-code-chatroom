# ATP-01: Project Workspace Bootstrap

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

None - can start immediately.

## What To Build

Introduce `Project` as the first project-centered object in the product and move the core chat experience from a single global room to a selected project workspace. A user should be able to register a local project path, browse saved projects, open a project, and use a project-scoped shared chat instead of the current flat `general` room.

This is the first tracer bullet that proves the product is no longer "just a chatroom". It should cut through shared contracts, backend state and APIs, realtime routing, the shipped agent connectors, and the web UI.

## Acceptance Criteria

- [ ] A user can create a project bound to a local filesystem path and see it in the UI.
- [ ] Project metadata has a shared contract, a domain-owned `ProjectInventory` interface, and an in-memory first implementation distinct from room member state.
- [ ] `Project.id` and the project chat `channel_id` are UUID-backed opaque identifiers; project names remain display labels rather than generated identifiers.
- [ ] Storage records, domain models, and transport DTOs for project state are kept separate through explicit boundary mapping rather than being treated as the same shape.
- [ ] Chat membership and messages can be scoped to a selected project instead of only the default global channel.
- [ ] The web UI exposes a project list and a project detail view that makes the active project context explicit.
- [ ] All shipped agent connectors can connect to the selected project chat, list project members, and send and receive project-scoped messages through the same project-aware contract used by the web client.
- [ ] Tests cover project creation, project selection, injected project inventory behavior, and project-scoped chat behavior end to end across the server, connector, and web layers.

## User Stories Addressed

- User story 1
- User story 2
- User story 5
- User story 27

## Notes

- Keep this slice intentionally narrow: one local project root, one active project chat, and no team/run model yet.
- Do not derive project or channel IDs from project names or filesystem paths.
- Reuse as much of the current chat transport as possible, but evolve the contracts away from a single implicit `general` channel.
- In the architecture reference, this slice primarily establishes the `Project Workspace` context and the first project-bound version of `Collaborative Spaces`.
- Backend domain boundaries are authoritative in this slice. The web app should mirror them through project/workspace and collaboration-oriented services or state modules rather than a single flat chatroom model.
