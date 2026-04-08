# ATP-08: Execution Timeline And Live Review

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-04`
- Blocked by `ATP-05`

## What To Build

Turn the run view into an inspectable execution timeline that merges chat, lifecycle events, approvals, and review activity. The result should let a user see not only what agents said, but how the run progressed and where human steering or review happened.

This slice should make the run feel like a collaboration record rather than a transient chat transcript.

## Acceptance Criteria

- [ ] The run timeline includes chat messages, run lifecycle events, phase transitions, approvals, and review events in one ordered view.
- [ ] A human can add review feedback tied to the active run context and see it reflected in the timeline.
- [ ] The UI distinguishes plain chat from system and review events.
- [ ] The shared contracts and backend event model can represent the merged timeline semantics.
- [ ] The active chat context remains fully usable from the web client and the shipped agent connectors after this slice lands.
- [ ] Tests cover timeline ordering, mixed event rendering, and persistence or reconstruction of a prior run timeline.

## User Stories Addressed

- User story 5
- User story 18
- User story 19
- User story 20
- User story 31
- User story 32

## Notes

- In the architecture reference, the timeline is an integration read model over `Collaborative Spaces`, `Run Execution`, and review activity rather than the primary write authority for those concerns.
- Keep this slice tightly focused on visibility and inspectability. It does not need to solve notification strategy or analytics.
