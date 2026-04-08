# ATP-09: Runtime Capability Model And Connector Generalization

## Parent PRD

[PRD: Agent Team Project Platform](../prd-agent-team-project-platform.md)

## Architecture Reference

[Architecture Reference](../architecture-reference.md)

## Type

HITL

## Blocked By

- Blocked by `ATP-01`
- Blocked by `ATP-04`
- Blocked by `ATP-07`

## What To Build

Generalize the runtime integration model so the system can support more than one agent runtime with a shared conceptual contract. The product should stop assuming a Claude-only connection model and instead introduce runtime capability metadata, runtime-specific constraints, and a connector handshake that can express what an attached session can and cannot do.

This slice is HITL because it needs an explicit product-level decision on what the minimum cross-runtime abstraction should be before more connectors are built.

## Acceptance Criteria

- [ ] The shared contracts include runtime identity and capability metadata that can be attached to a participant or session.
- [ ] The connector layer can expose runtime-specific capabilities without breaking the shared project/team/run model.
- [ ] The UI surfaces runtime identity and relevant capability constraints where they matter for team execution.
- [ ] The first generalized connector contract is documented clearly enough to support a second runtime implementation later.
- [ ] The active chat context remains fully usable from the web client and the shipped agent connectors while the capability model is introduced.
- [ ] The abstraction boundary and minimum capability model are reviewed and approved before implementation is considered complete.

## User Stories Addressed

- User story 4
- User story 12
- User story 13
- User story 29
- User story 30

## Notes

- This issue is about the contract and system shape, not shipping every runtime integration immediately.
- In the architecture reference, this slice primarily expands the `Runtime Integration` context as an anti-corruption layer around the core domain contexts.
- Prefer a small capability vocabulary over a large speculative schema.
