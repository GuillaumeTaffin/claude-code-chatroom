# ATP-02: Role Catalogs At User And Project Scope

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-01`

## What To Build

Add first-class role definitions with two scopes: reusable user-level roles and project-specific roles. Roles must have stable identity and visible scope so the product can distinguish a project-local role from a user-global role without relying on inheritance or hidden overrides.

This slice should make role management real in the product: shared types, backend storage and CRUD, and a UI for listing and editing role definitions in context.

## Acceptance Criteria

- [ ] The shared contracts and backend domain include a `Role` model with UUID-backed stable identifiers and explicit scope metadata.
- [ ] Durable role state is owned by a `RoleInventory` interface with an in-memory first adapter rather than by transport handlers depending directly on storage structures.
- [ ] A user can create, edit, list, and delete user-scoped roles.
- [ ] A user can create, edit, list, and delete project-scoped roles from within a project.
- [ ] The UI clearly distinguishes user roles from project roles.
- [ ] The existing active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] Tests cover identity stability, scope separation, and CRUD behavior across the server and UI state layer.

## User Stories Addressed

- User story 6
- User story 7
- User story 8
- User story 28

## Notes

- Do not add inheritance in this slice.
- Role names are labels, not identifiers.
- In the architecture reference, this slice belongs to the `Team Composition` context.
- Backend rules are authoritative here, but the frontend should still expose role-management behavior through a team-composition-oriented service or state boundary rather than folding it into unrelated project or run state.
- The role shape should be sufficient to support later team composition and runtime assignment.
- Keep storage records, domain models, and shared DTOs separate at explicit boundaries.
