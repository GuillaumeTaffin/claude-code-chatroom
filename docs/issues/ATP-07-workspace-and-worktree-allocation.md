# ATP-07: Workspace And Worktree Allocation

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-04`

## What To Build

Add execution context assignment for runs and participants so the system can represent work happening in the project root or in separate worktrees. The user should be able to see which workspace context is assigned to a participant or lane, and the runtime-facing contracts should expose that context clearly.

This slice establishes the minimal parallel-work substrate required by the PRD without requiring the full multi-lane orchestration model to be finished first.

## Acceptance Criteria

- [ ] The backend and shared contracts include a workspace allocation model that can represent the project root and named worktrees.
- [ ] A run can assign a workspace context to a participant, role, or lane.
- [ ] The UI shows the active workspace context for the run and its participants.
- [ ] Runtime-facing context includes enough workspace information for an agent session to understand where it should operate.
- [ ] The active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] Tests cover workspace assignment, worktree identity handling, and visibility in run-scoped views.

## User Stories Addressed

- User story 25
- User story 26
- User story 27

## Notes

- Do not try to automate worktree lifecycle management beyond what the repo already supports until the execution model is stable.
- In the architecture reference, workspace allocation currently belongs inside `Run Execution` rather than as an independent write-authority context.
- This slice is about representation and assignment first.
