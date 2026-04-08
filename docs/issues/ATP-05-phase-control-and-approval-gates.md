# ATP-05: Phase Control And Approval Gates

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-04`

## What To Build

Add the first structured run flow with explicit phases and configurable approval gates. A run should be able to move through named phases, display the current phase in the UI and run timeline, and require human approval before moving forward when configured.

This is the first orchestration slice. It should be intentionally narrow and support a linear path first, while keeping the model open for later concurrency and reusable workflows.

## Acceptance Criteria

- [ ] A run can define ordered phases and track a current phase plus phase history.
- [ ] A project or run can enable approval gating for phase transitions.
- [ ] A user can approve or reject a pending phase transition from the UI.
- [ ] Phase changes and approvals appear in the run timeline and shared contracts.
- [ ] The active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] Tests cover linear phase progression, approval-required transitions, and rejected transitions.

## User Stories Addressed

- User story 14
- User story 20
- User story 21
- User story 22
- User story 23
- User story 24

## Notes

- Do not solve general-purpose workflow engines here.
- In the architecture reference, this slice primarily expands `Workflow Management`, while `Run Execution` remains authoritative for the live current phase and transition state.
- Treat "drift from objective" as an explicit event hook or status signal, even if the first version uses a manual trigger instead of automated detection.
