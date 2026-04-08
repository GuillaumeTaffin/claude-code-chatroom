# Amendment: Storage Abstraction And DTO Decoupling

## Parent PRD

[PRD: Agent Team Project Platform](./prd-agent-team-project-platform.md)

## Purpose

Clarify an architectural rule for the server-side domain before the first project, role, and team slices spread a concrete storage shape across the codebase.

The product may start with in-memory implementations for development speed, but the backend must be structured so the storage implementation can be replaced later without rewriting route handlers, websocket handlers, or orchestration logic.

This amendment also clarifies that storage records must not be passed through the system directly as shared-contract DTOs.

## Decisions

- Persistent or catalog-style server state must be accessed through explicit domain-facing interfaces.
- The first implementation may be in-memory.
- In-memory is an adapter choice, not the server architecture.
- Shared-contract DTOs, domain models, and storage records are separate concerns and must not be treated as the same structure by default.
- Mapping between storage records, domain objects, and transport DTOs must happen at explicit boundaries.
- Ephemeral realtime connection state may remain in dedicated in-memory coordination structures and does not need the same abstraction as durable domain state.

## Required Architecture Rule

For each server-side domain collection that is expected to outlive a request or be replaceable by another backend later, define a narrow interface owned by the domain.

Examples for the current roadmap:

- `ProjectInventory`
- `RoleInventory`
- `TeamInventory`
- later: `RunInventory`, `TimelineInventory`, or equivalent interfaces once those concepts become first-class

Each interface should expose domain operations, not storage mechanics.

Good examples:

- `createProject(input)`
- `listProjects()`
- `getProjectById(projectId)`
- `saveRole(role)`
- `listTeamsByProject(projectId)`

Avoid storage-shaped interfaces such as:

- exposing raw maps
- leaking internal storage keys or indexes
- returning storage rows that only exist because of one implementation

## DTO And Storage Decoupling Rule

Do not pass storage structures directly as shared transport DTOs.

Do not design storage structures to be identical to HTTP or websocket payloads just to avoid mapping code.

The expected separation is:

- Storage record: optimized for persistence concerns and backend implementation details
- Domain model: optimized for business rules and server behavior
- DTO / shared contract: optimized for transport clarity and compatibility across packages

Small mapping functions are expected and desirable at these boundaries.

This rule prevents accidental coupling such as:

- a persistence schema becoming the public API by accident
- transport fields dictating storage layout
- later migrations forcing unnecessary shared-contract churn

## Guidance For The Current Codebase

The current project bootstrap work should keep the in-memory implementation, but move the shape behind interfaces early.

That means:

- route handlers should depend on inventory interfaces or a composed server domain service
- websocket handlers should resolve project and run context through those interfaces or services
- tests should prefer injecting in-memory implementations over relying on module-level singleton state
- module-global maps should be treated as a temporary adapter detail, not the long-term contract

This is especially important because the current server work already centralizes project state in module-level maps and imports those helpers directly from transport handlers.

## Impact On Existing Issues

### ATP-01

Update the issue and its implementation plan so the project catalog is described as:

- a `ProjectInventory` interface
- an `InMemoryProjectInventory` implementation for the first slice

Acceptance should require that project-aware routes and websocket flows depend on the abstraction boundary rather than concrete singleton storage.

### ATP-02

Define role persistence through a `RoleInventory` interface with separate handling for user-scoped and project-scoped roles.

Acceptance should require CRUD behavior against the interface and clear scope semantics in the domain layer.

### ATP-03

Define saved team persistence through a `TeamInventory` interface.

Team membership validation should happen in domain logic that depends on role lookup abstractions, not by reaching into another inventory's internal structures.

### ATP-04 And Later

When `Run` and timeline concepts are introduced, follow the same rule instead of letting runtime payloads or event timeline rows become the de facto storage schema.

## Minimum Safe Implementation Strategy

To avoid slowing the current development work:

- keep in-memory storage for now
- add interfaces immediately
- add in-memory adapters that implement those interfaces
- inject dependencies into app, route, and websocket setup
- keep realtime socket membership management separate from persistent inventories

This preserves development speed while preventing the first slices from hard-coding storage assumptions into the transport layer.

## Non-Goals

- This amendment does not require choosing a database now.
- This amendment does not require abstracting every in-memory runtime object.
- This amendment does not require a large repository or ORM layer.

## Recommended Follow-Up Docs Changes

- Add this architectural rule to the PRD implementation decisions section.
- Add a checklist note that each new persistent domain object must define or extend a swappable inventory interface with an in-memory first adapter.
- Update `ATP-01`, `ATP-02`, and `ATP-03` acceptance criteria and implementation notes to reference inventories explicitly.
