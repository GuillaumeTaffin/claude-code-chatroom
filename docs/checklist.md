# Implementation Checklist

## Parent PRD

[PRD: Agent Team Project Platform](./prd-agent-team-project-platform.md)

## Legend

- `AFK`: can be implemented without a human decision once accepted.
- `HITL`: requires a human product or architecture decision before it should be considered complete.

## Issue Checklist

- [x] `ATP-01` Project Workspace Bootstrap
  Type: `AFK`
  Blocked by: none
  File: [docs/issues/ATP-01-project-workspace-bootstrap.md](./issues/ATP-01-project-workspace-bootstrap.md)

- [x] `ATP-02` Role Catalogs At User And Project Scope
  Type: `AFK`
  Blocked by: `ATP-01`
  File: [docs/issues/ATP-02-role-catalogs.md](./issues/ATP-02-role-catalogs.md)

- [x] `ATP-03` Saved Team Catalog Per Project
  Type: `AFK`
  Blocked by: `ATP-01`, `ATP-02`
  File: [docs/issues/ATP-03-saved-team-catalog.md](./issues/ATP-03-saved-team-catalog.md)

- [x] `ATP-04` Team Invocation And Run-Scoped Chat
  Type: `AFK`
  Blocked by: `ATP-01`, `ATP-02`, `ATP-03`
  File: [docs/issues/ATP-04-team-invocation-and-run-chat.md](./issues/ATP-04-team-invocation-and-run-chat.md)

- [x] `ATP-05` Phase Control And Approval Gates
  Type: `AFK`
  Blocked by: `ATP-04`
  File: [docs/issues/ATP-05-phase-control-and-approval-gates.md](./issues/ATP-05-phase-control-and-approval-gates.md)

- [x] `ATP-06` Feature Delivery Playbook
  Type: `HITL`
  Blocked by: `ATP-05`
  File: [docs/issues/ATP-06-feature-delivery-playbook.md](./issues/ATP-06-feature-delivery-playbook.md)

- [x] `ATP-07` Workspace And Worktree Allocation
  Type: `AFK`
  Blocked by: `ATP-04`
  File: [docs/issues/ATP-07-workspace-and-worktree-allocation.md](./issues/ATP-07-workspace-and-worktree-allocation.md)

- [x] `ATP-08` Execution Timeline And Live Review
  Type: `AFK`
  Blocked by: `ATP-04`, `ATP-05`
  File: [docs/issues/ATP-08-execution-timeline-and-live-review.md](./issues/ATP-08-execution-timeline-and-live-review.md)

- [x] `ATP-09` Runtime Capability Model And Connector Generalization
  Type: `HITL`
  Blocked by: `ATP-01`, `ATP-04`, `ATP-07`
  File: [docs/issues/ATP-09-runtime-capability-model.md](./issues/ATP-09-runtime-capability-model.md)

## Suggested Execution Order

1. `ATP-01`
2. `ATP-02`
3. `ATP-03`
4. `ATP-04`
5. `ATP-05`
6. `ATP-07`
7. `ATP-08`
8. `ATP-06`
9. `ATP-09`

## Notes

- This checklist tracks the file-based issue set derived from the PRD.
- The shared model and design reference for those issues lives in [docs/architecture-reference.md](./architecture-reference.md).
- `ATP-01` is considered reopened: the current implementation predates the UUID-backed identifier rule and the backend-first context boundary rules now captured in the architecture reference.
- The issue set favors thin vertical slices over horizontal backend-only or UI-only tasks.
- Every issue must preserve one fully working active chat context end to end for the web client and the shipped agent connectors.
- Each persistent server-side domain object should be introduced behind a swappable domain-owned inventory interface with an in-memory first adapter.
- `ATP-06` and `ATP-09` are marked `HITL` because the PRD still leaves some product-level choices open in those areas.
