# PRD: Agent Team Project Platform

## Problem Statement

The current product proves that humans and multiple agents can share a chatroom, but it stops at communication. For real project work, especially software work on local files and code, the user still has to manually assemble agent sessions, decide which role should do what, manage parallel execution, keep track of review loops, and translate project context into each tool/runtime separately.

For a technical user who works across many codebases and sometimes also operates as an engineering manager, this creates too much orchestration overhead. A single strong agent session can help with isolated tasks, but it is not the right abstraction for work that naturally decomposes into roles such as product/specification, architecture, implementation, testing, and live review. The user wants an application where the shared chat remains the center of collaboration, but where projects, teams, roles, and execution flows are first-class so that agent teams can operate effectively with less manual coordination.

The product must also move beyond a Claude-specific framing. It should support the idea that different agent runtimes can connect into the same collaborative system, with the application abstracting over runtime-specific configuration details where possible.

The product must remain usable while it evolves. Each implementation slice has to preserve a fully working active chat context for humans and the shipped agent connectors. If a slice changes the collaboration model from one active chat context to another, for example from project chat to run chat, that migration must be completed end-to-end in the same slice rather than leaving agents unable to participate between issues.

## Solution

Build the current chatroom into a project-centered agent teamwork application.

In this product, a project is anchored to a location on disk and can expose one or more execution workspaces, including worktrees for parallel work. Each project can contain multiple saved teams. A team is composed of clearly identified roles, where roles may come from a reusable user-level library or from project-specific definitions. Project-specific roles are independent identities, not overrides of global roles.

The common chat remains the primary interaction surface, but it becomes attached to project work rather than existing as a standalone room. Humans can define or choose a task-resolution flow, invoke a team, interact with the team in real time, review progress continuously, and steer execution when needed. Agents are allowed to work with broad autonomy inside a phase, roughly as capable as a normal single-agent session, while gaining the benefit of parallel collaboration and live feedback from other roles.

The initial product focus is feature delivery. A user should be able to run a team through a flow that includes activities such as specification/refinement, implementation, testing, and live review. Some activities may be sequential and gated; others may run concurrently. The system should support collaboration patterns such as a "3 amigos" style specification phase and parallel implementation/testing with ongoing lead or architect review.

Approval and control should remain human-configurable. Humans define the overall flow and can intervene live. Projects may configure gates such as requiring approval before phase transitions or before deviating from the agreed objective, but the product should not impose heavy global workflow bureaucracy by default.

Delivery should proceed through thin vertical slices that always leave the application in a usable state. At the end of every slice, the current active collaboration context must support end-to-end participation from the web client and the shipped agent connectors.

## User Stories

1. As a software engineer, I want to attach the application to a local project directory, so that agent collaboration is grounded in the real codebase I am working on.
2. As a software engineer, I want to use the application on code-and-files work rather than generic chat, so that the product fits my actual daily workflow.
3. As an engineering manager who still codes, I want one place to coordinate specialist agents, so that I do not have to manually orchestrate many sessions.
4. As a user, I want the system to support more than one agent runtime, so that my project workflow is not tied to a single vendor or tool.
5. As a user, I want shared chat to remain the center of collaboration, so that I can understand what the team is doing in one common thread.
6. As a user, I want to define reusable roles for myself, so that I can keep a personal library of agent personas I trust.
7. As a user, I want to define project-specific roles, so that each codebase can have roles tailored to its architecture and conventions.
8. As a user, I want global roles and project roles to remain distinct identities, so that project-local changes do not silently mutate my reusable role library.
9. As a user, I want to create and save named teams inside a project, so that I can invoke the right collaboration setup for different types of work.
10. As a user, I want multiple teams per project, so that I can switch between different team compositions depending on the task.
11. As a user, I want to invoke a saved team for a new piece of work, so that I do not have to rebuild the same lineup every time.
12. As a user, I want a team to feel like a superset of a normal single-agent session, so that I do not lose existing capabilities when I move to multi-agent work.
13. As a user, I want agents to work in the codebase with broad autonomy inside a phase, so that the system is actually useful for real implementation work.
14. As a user, I want to define the phases of task resolution, so that the team follows a structure I trust.
15. As a user, I want to decide when work should be sequential versus concurrent, so that the collaboration flow matches the task.
16. As a user, I want to run a "3 amigos" style specification session, so that multiple viewpoints refine the feature before coding starts.
17. As a user, I want implementation and testing to happen in parallel when appropriate, so that delivery moves faster without dropping quality.
18. As a user, I want lead or architect roles to review continuously during execution, so that course corrections happen early instead of only at the end.
19. As a user, I want to talk directly to the team in chat while work is in progress, so that I can clarify intent without reconfiguring everything.
20. As a user, I want to steer live orchestration, so that I can respond when the work uncovers new information.
21. As a user, I want configurable approval gates, so that I can decide how much autonomy a given project or task should have.
22. As a user, I want phase transitions to optionally require approval, so that I can control when the team moves forward.
23. As a user, I want deviation from the agreed objective to surface as a control point, so that agents do not drift silently.
24. As a user, I want some workflows to be pre-approved, so that repeated work can run with less friction.
25. As a user, I want workspaces or worktrees to be available for parallel work, so that multiple agents can operate simultaneously without stepping on each other.
26. As a user, I want the system to understand that one project may have several execution contexts, so that parallel implementation is practical.
27. As a user, I want to see which team, roles, and execution context are attached to a conversation, so that the state of the work is obvious.
28. As a user, I want to reuse proven collaboration setups across tasks, so that the product reduces orchestration overhead over time.
29. As a user, I want the application to abstract over runtime-specific setup details where possible, so that I think in terms of roles and teams rather than tool syntax.
30. As a user, I want to know when a capability is runtime-specific, so that abstractions do not hide important constraints.
31. As a user, I want an execution record tied to the chat, so that I can understand how a feature moved from idea to implementation.
32. As a user, I want project work to remain inspectable while agents collaborate freely, so that I can trust the system enough to use it on bigger projects.
33. As a user, I want the active collaboration chat to remain usable for humans and agent participants throughout the product's incremental rollout, so that I can validate and rely on the system at every step rather than only after the full roadmap is done.

## Implementation Decisions

- Reframe the product from a standalone chatroom into a project workspace centered on local disk-backed projects.
- Preserve the existing shared-chat model as a core primitive, but attach it to project execution rather than treating it as the whole product.
- Keep the current four broad codebase responsibilities and expand them:
  - A backend domain for project state, team state, workflow/run state, approvals, and realtime coordination.
  - A web application for project setup, team/role management, run orchestration, approvals, and shared execution visibility.
  - A connector/runtime integration layer that lets external agent sessions join project chats and receive richer execution context.
  - A shared contract layer for project objects, run events, role metadata, workflow state, and approval messages.
- Introduce first-class domain objects for at least `Project`, `Role`, `Team`, and an execution concept such as `Run` or `Task Session`.
- Use opaque UUIDs for first-class entity identifiers. Human-readable names remain mutable display fields and must not be used as primary IDs or as the source for generated IDs.
- Treat user-defined roles and project-specific roles as separate addressable entities with stable identity.
- Treat teams as first-class saved project entities that can be invoked repeatedly.
- Keep the exact ownership boundary between `Team`, `Workflow`, and `Run` intentionally open for now, but design toward separation of concerns rather than a single overloaded team object.
- Shape the backend domain around bounded contexts rather than one flat collaboration model. The early context split is:
  - `Project Workspace` for project registration and root binding.
  - `Team Composition` for role definitions and saved teams.
  - `Workflow Management` for phases, approvals, and lane design.
  - `Run Execution` for live invocation, transitions, assignments, and execution state.
  - `Collaborative Spaces` for chat, presence, and shared active conversation surfaces.
  - `Runtime Integration` as the anti-corruption layer around external agent runtimes.
- Treat those domain boundaries as backend-first. The frontend may mirror them through well-shaped application services or state modules, but should not collapse them back into one flat transport-driven model or redefine ownership rules independently of the backend.
- Likely introduce a reusable workflow/playbook concept, but do not block the first version on fully resolving that model.
- Design for one chat to be associated with an invoked team and an active piece of work, rather than only with a single flat room/channel.
- Evolve the server from a single default channel model into a project-aware, multi-context coordination model.
- Expand the event model beyond join/leave/message to include run lifecycle events, phase transitions, approvals, role assignments, and workspace/worktree context.
- Add an orchestration layer that can represent sequential phases, concurrent lanes, and project-configured approval gates.
- Keep humans as workflow authors and live supervisors; do not design the system around fully self-authoring agent plans.
- Preserve broad in-phase autonomy for agents, matching the baseline expectation of a normal coding session as closely as possible.
- Introduce a workspace execution model that can represent the project root plus parallel work contexts such as worktrees.
- Design runtime adapters so multiple agent runtimes can connect with a common conceptual model while still exposing runtime-specific constraints where needed.
- For durable server-side domain collections, define narrow domain-owned inventory interfaces with in-memory-first adapters. Expected early interfaces include `ProjectInventory`, `RoleInventory`, `TeamInventory`, and later `RunInventory` or `TimelineInventory` once those concepts become first-class.
- Keep storage records, domain models, and shared transport DTOs as separate concerns with explicit mapping at each boundary.
- Treat ephemeral realtime connection state as a separate in-memory coordination concern rather than forcing it into the same abstraction as durable domain state.
- Route handlers, websocket handlers, and orchestration logic should depend on domain services or inventory interfaces rather than importing module-global storage as their contract.
- Frontend state and service layers should follow the same boundary direction where it improves clarity: project setup, team composition, run execution, and collaboration should not all accumulate inside one monolithic UI model by default.
- Each issue must be a thin vertical slice that preserves a working active chat context for the web client and all shipped agent connectors.
- If the primary collaboration context changes, for example from project chat to run chat, the connector, transport, server, and UI changes must land together in the same slice so the system never spends an issue in a partially broken state.
- Favor deep modules with narrow interfaces:
  - A project catalog module that owns project metadata and local workspace bindings.
  - A role/team catalog module that owns role identity, scope, and team composition.
  - A run orchestration module that owns phases, concurrency, approvals, and status transitions.
  - A runtime session adapter module that maps external agent sessions into the internal role/run model.
  - A collaboration timeline module that merges chat events, execution state, and review/approval events into one inspectable stream.
  - A workspace allocation module that assigns project roots or worktrees to agents/runs.
- Keep the first product slice focused on feature delivery workflows rather than generalized enterprise process modeling.
- Preserve compatibility with the current minimal chat experience where possible, but treat it as the seed capability rather than the end-state product.

## Testing Decisions

- Good tests should validate externally visible behavior and state transitions, not implementation details or incidental internal structure.
- The backend domain should be covered with focused tests around project creation/binding, role and team registration, run orchestration, phase transitions, approvals, and event emission.
- Workflow/orchestration tests should emphasize behavior under concurrency, approval gates, and divergence handling because these are the highest-risk product behaviors.
- Workspace/worktree allocation should be tested as a policy boundary: given project state and run constraints, the module should return the correct workspace assignment decisions.
- Shared contract tests should validate the project/run/event schemas and JSON-RPC or transport payload compatibility.
- Connector/runtime adapter tests should verify that agent runtimes can join the right project/run context, receive the right events, and send messages/actions with the expected semantics.
- Web tests should focus on the user-visible behavior of project setup, team invocation, live chat execution views, and approval flows.
- Prior art should follow the current style already present in the repo: small backend state tests, backend route/websocket handler tests, connector utility tests, and UI state/behavior tests.
- Introduce isolated tests for deep modules before adding broad integration tests; then add end-to-end integration coverage for the core happy path of "create project -> define team -> invoke run -> move through phases -> approve transition -> complete run".
- The first integration suite should cover the canonical feature-delivery path because that is the primary user workflow in this PRD.
- Each slice should include enough verification to prove that the active collaboration chat still works end to end for the web client and the shipped agent connectors.
- Tests should prefer injecting in-memory inventory implementations into domain services and transport setup rather than relying on module-level singleton state.

## Out of Scope

- Full autonomous workflow authoring by agents.
- General-purpose non-project chat products.
- Solving every runtime-specific abstraction difference in the first version.
- Enterprise multi-user governance, permissions matrices, or organizational administration.
- Cloud-hosted project storage or remote repository management as a first requirement.
- Rich analytics, reporting, or management dashboards beyond what is needed to understand active work.
- Arbitrary workflow engines for every possible business process.
- Automatic inheritance or override semantics between global roles and project roles.
- Final resolution of every long-term object-model question before building the first vertical slice.

## Further Notes

- A lightweight shared model and architecture reference lives in [Architecture Reference](./architecture-reference.md). It defines the bounded contexts and interaction rules that the issue set should follow.
- This PRD intentionally captures a product direction with some unresolved modeling questions. The biggest open area is the boundary between team composition, reusable workflows/playbooks, and per-task execution runs.
- The current project-workspace slice is not complete until the active project chat works for the shipped agent connectors as well as the web client, and until project persistence sits behind a domain-owned inventory interface rather than transport handlers depending directly on module-global storage.
- Every subsequent slice should preserve that same invariant in whatever collaboration context is active at the time.
- The recommended first vertical slices after the reopened project-workspace work are: role definitions at user/project scope, project-scoped saved teams, a single feature-delivery run model with explicit phases, configurable approval at phase transitions, and shared chat attached to the active run.
- The current repository already contains the seeds of the required architecture: realtime coordination, a web client, an agent connector, and shared transport contracts. The work is primarily to elevate the domain model from "room + members + messages" to "project + teams + runs + execution context + chat".
- The interview notes that informed this PRD are captured separately in the planning document created during the grilling session.
