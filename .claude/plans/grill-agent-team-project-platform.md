# Agent Team Project Platform

## Summary

- Interview paused on 2026-04-05 at the user's request.
- Primary initial user is a software engineer / engineering manager working mostly with local files and code.
- The core product value is reducing manual orchestration overhead when working with multiple agent sessions.
- Shared chat is central, but the product is broader than chat: it should help set up teams, roles, and project work around real codebases.
- The target experience is a superset of a single agent session: agents should be able to work in the codebase with similar freedom, while gaining shared communication and coordination.
- A core workflow target is end-to-end feature delivery with structured phases such as spec/refinement, implementation, testing, and live review.
- Workflow execution may mix sequential gates and concurrent lanes; examples include "3 amigos" style specification and parallel code/test implementation with continuous lead/architect review.
- Humans remain responsible for defining task-resolution flows/phases and can steer execution live through chat and review.
- Approval rules should be configurable per project, with likely default gates around phase transitions and divergence from agreed plans/objectives.
- Roles exist at multiple scopes: user-defined reusable roles and project-specific roles.
- Project-specific roles are separate identifiable roles, not overrides of user-level roles.
- Teams are first-class saved project objects, and a project may contain multiple invokable teams.
- It is unresolved whether workflows, approval rules, and runtime settings belong inside team definitions or should be modeled as separate reusable objects.

## Seed Context

- Current project demonstrates multi-agent chat.
- Long-term goal is broader than Claude-specific chat and should support connecting many agent runtimes, including Codex sessions.
- Core interaction model is a shared/common chat for humans and agent teams.
- Product vision is to help people work on projects with the help of teams of agents, not just chat with a single assistant.
- Teams should be composed of defined roles/personas so work can be decomposed efficiently across agents.
- The application should help users set up teams, define roles, and abstract over technology-specific agent configuration details.
- A project is tied to a place on disk, with likely support for worktrees and parallel work.
- A single project may need multiple teams, or a library of roles that can be assembled into multiple teams depending on the work.

## Product Vision

### Question 2

What is the main outcome this user wants from an agent team that is meaningfully better than working with one strong agent in a single chat?

### User Answer

The user wants to avoid spending large amounts of time manually configuring orchestration around agents while working on tasks. The belief is that, as agents improve, a team of agents with well-encoded roles should be able to find its way toward a solution, and free communication between agents should streamline the work.

### Notes

- Core promise is not merely "more agents" but less manual orchestration burden.
- The product should encode roles clearly enough that coordination emerges from the team structure.
- Shared communication is treated as a first-class mechanism for team effectiveness.
- The desired advantage over a single powerful agent is parallel reasoning and role-specialized collaboration with less user micromanagement.

### Question 3

In one concrete example, what kind of project task should this product make substantially easier end-to-end than today?

### User Answer

Implementing a new feature. The workflow could encode a strict set of activities depending on the feature, such as spec and refinement, implementation and testing, and ongoing review. Some activities could happen sequentially while others happen concurrently. During specification, a "3 amigos" style collaboration could bring together participants with different viewpoints. During implementation, coding and test implementation could happen in parallel while tech lead and architect roles review continuously.

### Notes

- A primary target workflow is end-to-end feature delivery, not isolated code generation.
- The product should support structured phases with explicit expectations per feature.
- Phase execution can be mixed: some steps are sequential gates, others are concurrent lanes.
- The user wants role-specific collaboration patterns such as "3 amigos" built into the system.
- Continuous review during implementation is important; review should not be only a terminal QA step.

## Users And Jobs

### Question 1

Who is the primary user for the first serious version of the product?

### User Answer

The first serious user is the author themself: a software engineer and engineering manager working on many different kinds of things, mostly centered on files and code.

### Notes

- Initial target user is a technical individual contributor who also has management responsibilities.
- Primary working surface is local files and source code, not just chat conversations.
- Early product scope should optimize for real software project work rather than generalized knowledge work.

## Project Model

Pending.

## Team And Role Model

### Question 7

How do you want to model teams: fixed named teams, reusable role libraries, ad hoc team assembly, or all three?

### User Answer

Same as usual: there could be user-defined roles as well as project-specific ones.

### Notes

- Role definitions should exist at more than one scope.
- At minimum, the system needs reusable user-level roles and project-specific roles.
- This implies some inheritance or override model between global and project-local configuration.
- Team construction may be based on selecting from these role sets rather than relying only on fixed built-in teams.

### Question 8

When a project-specific role differs from a user-defined role, should it extend or override the base role, or should it be treated as a separate role entirely?

### User Answer

It should be treated as a separate role entirely. The system should be able to identify the roles distinctly.

### Notes

- Roles need stable identity.
- Project-specific roles should not implicitly inherit from or overwrite user-defined roles.
- Role reuse, if needed, should likely happen through explicit duplication or composition rather than hidden inheritance.

### Question 9

Do you want teams themselves to be first-class saved objects, or should a team just be a temporary selection of roles for a given task or run?

### User Answer

Teams should be a savable structure. A project could have multiple teams that can be invoked.

### Notes

- Teams are first-class entities.
- Multiple saved teams per project are required.
- Invocation of a team should be an explicit operation in the product.
- A project likely needs a catalog/list of available teams.

### Question 10

What exactly is stored in a team definition: only the member roles, or also workflow phases, approval rules, workspace assignment, and runtime settings?

### User Answer

Unclear. It is not obvious that workflow phases and rules are team-specific. The user is not sure yet and does not want to force the wrong answer.

### Notes

- Team definition scope is currently unresolved.
- There is uncertainty about whether workflows and approval rules belong to teams or should be modeled separately.
- This suggests the product may need separate concepts for team composition and workflow/playbook configuration.

### Question 11

Do you think a workflow should be its own reusable object that can be attached to different teams, or do you want workflow to emerge ad hoc from the human each time?

### User Answer

The user thinks it is possible a priori.

### Notes

- Tentative lean toward workflows being their own reusable concept.
- Confidence is low; this remains an unresolved modeling decision.
- Worth testing an object model where workflows/playbooks are attachable to teams but not owned by them.

## Agent Runtime And Integration Model

Pending.

## Workspace And Execution Model

Pending.

### Question 5

Within a phase, what should agents be free to decide without asking the human first?

### User Answer

They should be able to work on the codebase as if they were one session. The product should be a superset on top of using one session at a time with more manual orchestration.

### Notes

- Agent autonomy inside a phase should be broad by default.
- The team experience should preserve the baseline capability of a single agent session working directly in the codebase.
- Product value comes from adding coordination and structure above that baseline, not from limiting what an agent can already do alone.
- Important product constraint: multi-agent mode should feel like a superset of existing single-session workflows.

## Collaboration UX

Pending.

### Question 4

In that feature-delivery workflow, what decisions should the human remain responsible for versus what should the agent team be allowed to decide on its own?

### User Answer

The human is responsible for designing the task-resolution flows, including the phases. The human can interact with the team in chat, review what is being done, and steer the live orchestration.

### Notes

- The human defines the workflow structure rather than delegating workflow design entirely to agents.
- Human involvement remains active during execution through chat, review, and steering.
- The product should support live intervention, not just preconfigured automation.
- A key design boundary is "human-designed flow, agent-executed work."

### Question 6

What actions, if any, should require an explicit human approval gate before agents can proceed?

### User Answer

Phase transitions should require approval unless there are pre-approved steps configured. Divergence from a plan or agreed objective is another likely approval point. But this should mostly be a project-by-project setting. The intended model should still feel like using a single session, except with configuration and chat layered on top of several sessions working simultaneously and giving each other live feedback.

### Notes

- Approval rules should be configurable per project.
- Candidate default approval gates are phase transitions and deviations from the agreed plan or objective.
- The user does not want heavy approval bureaucracy imposed globally.
- A core framing is "single-session capability plus multi-session coordination and live feedback."

## Open Questions

- What are the first-class project objects in the product model beyond projects, roles, and teams?
- Should workflows/playbooks be reusable first-class objects attachable to teams, or mostly ad hoc per run?
- What belongs in a team definition versus a workflow definition versus a run/task definition?
- How should projects, chats, tasks, and worktrees relate to each other in the execution model?
- At the project level, what are the first-class objects you expect to manage: project, roles, teams, workflows, chats, worktrees, tasks, or something else?
