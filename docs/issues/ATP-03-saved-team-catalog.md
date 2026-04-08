# ATP-03: Saved Team Catalog Per Project

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-01`
- Blocked by `ATP-02`

## What To Build

Introduce `Team` as a saved project object composed of selected roles. A project should be able to hold multiple named teams that a user can browse, create, edit, and remove. This slice stops short of active execution; its goal is to make team composition and persistence a first-class concept in the product.

The slice should wire through shared models, backend storage and validation, and UI flows for managing teams in a project.

## Acceptance Criteria

- [ ] The shared contracts and backend domain include a `Team` model with UUID-backed stable identity and a project association.
- [ ] Durable team state is owned by a `TeamInventory` interface with an in-memory first adapter rather than by transport handlers depending directly on storage structures.
- [ ] A user can create a named team from a set of roles available to the project.
- [ ] A user can edit team membership and remove a team.
- [ ] A project can hold multiple saved teams and display them in a dedicated UI area.
- [ ] The existing active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] Tests cover team CRUD, role membership validation, and multiple-team behavior per project.

## User Stories Addressed

- User story 9
- User story 10
- User story 27
- User story 28

## Notes

- Keep the team object focused on composition. Do not overload it yet with workflow ownership or runtime settings.
- Team names are labels, not identifiers.
- In the architecture reference, this slice extends the `Team Composition` context and should not absorb workflow or run concerns.
- Backend rules are authoritative here, but the frontend should still expose saved-team behavior through the same team-composition boundary rather than mixing it into run execution state.
- Team membership validation should happen in domain logic that depends on role lookup abstractions, not by reaching into another inventory's internal storage.
