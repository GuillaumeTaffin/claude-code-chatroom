# ATP-06: Feature Delivery Playbook

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

HITL

## Blocked By

- Blocked by `ATP-05`

## What To Build

Ship the first opinionated feature-delivery playbook for the product. This playbook should encode the initial target workflow described in the PRD: specification and refinement, implementation and testing, and live review. It should support a "3 amigos" style specification phase and a later phase where coding and testing can proceed in parallel while review remains visible.

This slice is marked HITL because it requires an explicit product decision about the first supported workflow shape and the minimum concurrency model worth productizing in v1.

## Acceptance Criteria

- [ ] The product ships with one named built-in feature-delivery playbook a user can select when creating a run.
- [ ] The playbook includes a spec/refinement phase, an implementation/testing phase, and a review or completion phase.
- [ ] The spec phase supports explicit multi-role participation semantics suitable for a "3 amigos" session.
- [ ] The implementation/testing phase supports at least one parallel lane model that is visible in the UI and timeline.
- [ ] The active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] The final playbook shape and terminology are reviewed and approved before implementation is considered complete.

## User Stories Addressed

- User story 15
- User story 16
- User story 17
- User story 18
- User story 24

## Notes

- Keep the first playbook opinionated. The goal is a useful default, not a workflow designer.
- In the architecture reference, this slice belongs to `Workflow Management` and should avoid pushing reusable workflow concerns into `Team` or `Run` by accident.
- The output of this issue should clarify whether workflows remain embedded in runs for now or become a reusable first-class object immediately.
