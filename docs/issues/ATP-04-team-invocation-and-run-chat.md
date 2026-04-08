# ATP-04: Team Invocation And Run-Scoped Chat

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

AFK

## Blocked By

- Blocked by `ATP-01`
- Blocked by `ATP-02`
- Blocked by `ATP-03`

## What To Build

Introduce an execution concept such as `Run` and let a user invoke a saved team against a piece of work inside a project. Invocation should create a run-scoped collaboration context where chat, membership, and visible metadata are attached to the active run rather than only to the project.

This slice establishes the first end-to-end execution path: select a project, choose a saved team, create a run, and see a run-specific chat context with the team identity attached.

## Acceptance Criteria

- [ ] A user can invoke a saved team from a project and create a named run or task session.
- [ ] The backend and shared contracts include a run model with UUID-backed stable identity that links project, team, and active chat context.
- [ ] Durable run state is owned by a domain-facing run inventory or equivalent orchestration service boundary rather than by transport handlers depending directly on storage structures.
- [ ] The web UI shows active and past runs for a project and clearly marks the active run.
- [ ] Run-scoped chat metadata exposes the project, team, and run identity in the UI and transport layer.
- [ ] If this slice moves the primary collaboration surface from project chat to run chat, the web client and the shipped agent connectors can all join, message, and observe that run-scoped chat end to end within this same slice.
- [ ] Tests cover run creation, run-scoped message routing, and reloading an existing run context.

## User Stories Addressed

- User story 9
- User story 10
- User story 11
- User story 19
- User story 27
- User story 31

## Notes

- Keep the first run model simple: one active team, one run chat, one human initiator.
- Run names or titles, if present, are labels rather than primary identifiers.
- In the architecture reference, this slice establishes `Run Execution` as a first-class context and moves the primary binding of `Collaborative Spaces` from `Project` to `Run`.
- The run should carry enough team information at invocation time to remain understandable even if saved team definitions evolve later.
- Backend rules are authoritative here, but the frontend should expose separate run-execution and collaboration-space services instead of collapsing run lifecycle, presence, and chat into one undifferentiated store.
- This slice should leave room for later workflow, approval, and workspace features without requiring them yet.
- Do not land a run-chat model that leaves the system without one fully working active chat context for agents and humans.
