import { Elysia, t } from 'elysia'
import type {
  AdvanceRunResponse,
  ApprovalRequest,
  ApproveRunResponse,
  ConnectRequest,
  ConnectResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  CreateReviewFeedbackRequest,
  CreateRoleRequest,
  CreateRoleResponse,
  CreateRunRequest,
  CreateRunResponse,
  CreateTeamRequest,
  CreateTeamResponse,
  CreateWorkspaceAllocationRequest,
  DeleteRoleResponse,
  DeleteTeamResponse,
  DeleteWorkspaceAllocationResponse,
  MembersResponse,
  PhaseTransitionRequest,
  PlaybookResponse,
  PlaybooksResponse,
  ProjectsResponse,
  ReviewFeedbackResponse,
  RoleResponse,
  RolesResponse,
  RunResponse,
  RunsResponse,
  TeamResponse,
  TeamsResponse,
  TimelineResponse,
  UpdateRoleRequest,
  UpdateRoleResponse,
  UpdateTeamRequest,
  UpdateTeamResponse,
  WorkspaceAllocationResponse,
  WorkspaceAllocationsResponse,
} from '@chatroom/shared'
import {
  defaultProjectChatDependencies,
  getPlaybookById,
  getPlaybooks,
  getProjectRoom,
  getRunRoom,
  mapCreateProjectDtoToDomain,
  mapCreateRoleDtoToDomain,
  mapCreateRunDtoToDomain,
  mapCreateTeamDtoToDomain,
  mapCreateWorkspaceAllocationDtoToDomain,
  mapProjectToDto,
  mapRoleToDto,
  mapRunToDto,
  mapTeamToDto,
  mapTimelineEventToDto,
  mapUpdateRoleDtoToDomain,
  mapUpdateTeamDtoToDomain,
  mapWorkspaceAllocationToDto,
  type ProjectChatDependencies,
} from './state.js'

export function handleConnect(
  body: ConnectRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.name || !body.description || !body.project_id) {
    set.status = 400
    return { error: 'name, description, and project_id are required' }
  }

  // When run_id is provided, connect to the run's channel
  if (body.run_id) {
    const run = dependencies.runInventory.getRunById(body.run_id)
    if (!run) {
      set.status = 404
      return { error: `run "${body.run_id}" was not found` }
    }

    if (run.projectId !== body.project_id) {
      set.status = 400
      return {
        error: `run "${body.run_id}" does not belong to project "${body.project_id}"`,
      }
    }

    // getRunRoom always resolves when the run exists (getOrCreateRoom)
    const room = getRunRoom(body.run_id, dependencies)!

    if (
      !room.addMember(
        { name: body.name, description: body.description },
        body.runtime,
      )
    ) {
      set.status = 409
      return { error: `name "${body.name}" is already taken` }
    }

    const runResponse: ConnectResponse = {
      project_id: body.project_id,
      channel_id: room.channelId,
      run_id: body.run_id,
    }
    if (body.runtime) runResponse.runtime = body.runtime
    return runResponse
  }

  const room = getProjectRoom(body.project_id, dependencies)
  if (!room) {
    set.status = 404
    return { error: `project "${body.project_id}" was not found` }
  }

  if (
    !room.addMember(
      { name: body.name, description: body.description },
      body.runtime,
    )
  ) {
    set.status = 409
    return { error: `name "${body.name}" is already taken` }
  }

  const response: ConnectResponse = {
    project_id: body.project_id,
    channel_id: room.channelId,
  }
  if (body.runtime) response.runtime = body.runtime
  return response
}

export function handleCreateProject(
  body: CreateProjectRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.name || !body.root_path) {
    set.status = 400
    return { error: 'name and root_path are required' }
  }

  const project = dependencies.projectInventory.createProject(
    mapCreateProjectDtoToDomain(body),
  )
  dependencies.roomRegistry.getOrCreateRoom(project.channelId)

  return {
    project: mapProjectToDto(project),
  } satisfies CreateProjectResponse
}

export function handleProjects(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  return {
    projects: dependencies.projectInventory.listProjects().map(mapProjectToDto),
  } satisfies ProjectsResponse
}

export function handleMembers(
  query: { project_id: string; run_id?: string },
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (query.run_id) {
    const room = getRunRoom(query.run_id, dependencies)
    if (!room) {
      set.status = 404
      return { error: `run "${query.run_id}" was not found` }
    }

    return {
      project_id: query.project_id,
      run_id: query.run_id,
      members: room.getMembers(),
    } satisfies MembersResponse
  }

  const room = getProjectRoom(query.project_id, dependencies)
  if (!room) {
    set.status = 404
    return { error: `project "${query.project_id}" was not found` }
  }

  return {
    project_id: query.project_id,
    members: room.getMembers(),
  } satisfies MembersResponse
}

export function handleCreateRole(
  body: CreateRoleRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.name || !body.description) {
    set.status = 400
    return { error: 'name and description are required' }
  }

  if (body.scope !== 'user' && body.scope !== 'project') {
    set.status = 400
    return { error: 'scope must be "user" or "project"' }
  }

  if (body.scope === 'project' && !body.project_id) {
    set.status = 400
    return { error: 'project_id is required when scope is "project"' }
  }

  if (body.scope === 'user' && body.project_id) {
    set.status = 400
    return { error: 'project_id must not be provided when scope is "user"' }
  }

  if (body.agent_config) {
    if (
      !body.agent_config.runtime ||
      (body.agent_config.runtime !== 'claude' &&
        body.agent_config.runtime !== 'copilot')
    ) {
      set.status = 400
      return { error: 'agent_config.runtime must be "claude" or "copilot"' }
    }
  }

  if (body.scope === 'project') {
    const project = dependencies.projectInventory.getProjectById(
      body.project_id!,
    )
    if (!project) {
      set.status = 404
      return { error: `project "${body.project_id}" was not found` }
    }
  }

  const role = dependencies.roleInventory.createRole(
    mapCreateRoleDtoToDomain(body),
  )

  return { role: mapRoleToDto(role) } satisfies CreateRoleResponse
}

export function handleListRoles(
  query: { scope?: string; project_id?: string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const filter: { scope?: 'user' | 'project'; projectId?: string } = {}
  if (query.scope) filter.scope = query.scope as 'user' | 'project'
  if (query.project_id) filter.projectId = query.project_id

  return {
    roles: dependencies.roleInventory.listRoles(filter).map(mapRoleToDto),
  } satisfies RolesResponse
}

export function handleGetRole(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const role = dependencies.roleInventory.getRoleById(id)
  if (!role) {
    set.status = 404
    return { error: `role "${id}" was not found` }
  }

  return { role: mapRoleToDto(role) } satisfies RoleResponse
}

export function handleUpdateRole(
  id: string,
  body: UpdateRoleRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (
    body.agent_config !== undefined &&
    body.agent_config !== null &&
    (!body.agent_config.runtime ||
      (body.agent_config.runtime !== 'claude' &&
        body.agent_config.runtime !== 'copilot'))
  ) {
    set.status = 400
    return { error: 'agent_config.runtime must be "claude" or "copilot"' }
  }

  const role = dependencies.roleInventory.updateRole(
    id,
    mapUpdateRoleDtoToDomain(body),
  )
  if (!role) {
    set.status = 404
    return { error: `role "${id}" was not found` }
  }

  return { role: mapRoleToDto(role) } satisfies UpdateRoleResponse
}

export function handleDeleteRole(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const deleted = dependencies.roleInventory.deleteRole(id)
  if (!deleted) {
    set.status = 404
    return { error: `role "${id}" was not found` }
  }

  return { deleted: true } satisfies DeleteRoleResponse
}

// ── Team route handlers ────────────────────────────────────────────────────

export function handleCreateTeam(
  body: CreateTeamRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.name) {
    set.status = 400
    return { error: 'name is required' }
  }

  if (!body.project_id) {
    set.status = 400
    return { error: 'project_id is required' }
  }

  try {
    const team = dependencies.teamInventory.createTeam(
      mapCreateTeamDtoToDomain(body),
    )
    return { team: mapTeamToDto(team) } satisfies CreateTeamResponse
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('was not found') && message.startsWith('project')) {
      set.status = 404
      return { error: message }
    }
    set.status = 400
    return { error: message }
  }
}

export function handleListTeams(
  query: { project_id?: string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const filter: { projectId?: string } = {}
  if (query.project_id) filter.projectId = query.project_id

  return {
    teams: dependencies.teamInventory.listTeams(filter).map(mapTeamToDto),
  } satisfies TeamsResponse
}

export function handleGetTeam(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const team = dependencies.teamInventory.getTeamById(id)
  if (!team) {
    set.status = 404
    return { error: `team "${id}" was not found` }
  }

  return { team: mapTeamToDto(team) } satisfies TeamResponse
}

export function handleUpdateTeam(
  id: string,
  body: UpdateTeamRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  try {
    const team = dependencies.teamInventory.updateTeam(
      id,
      mapUpdateTeamDtoToDomain(body),
    )
    if (!team) {
      set.status = 404
      return { error: `team "${id}" was not found` }
    }

    return { team: mapTeamToDto(team) } satisfies UpdateTeamResponse
  } catch (err) {
    set.status = 400
    return { error: (err as Error).message }
  }
}

export function handleDeleteTeam(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const deleted = dependencies.teamInventory.deleteTeam(id)
  if (!deleted) {
    set.status = 404
    return { error: `team "${id}" was not found` }
  }

  return { deleted: true } satisfies DeleteTeamResponse
}

// ── Playbook route handlers ───────────────────────────────────────────────

export function handleListPlaybooks() {
  return { playbooks: getPlaybooks() } satisfies PlaybooksResponse
}

export function handleGetPlaybook(
  id: string,
  set: { status?: number | string },
) {
  const playbook = getPlaybookById(id)
  if (!playbook) {
    set.status = 404
    return { error: `playbook "${id}" was not found` }
  }

  return { playbook } satisfies PlaybookResponse
}

// ── Run route handlers ─────────────────────────────────────────────────────

export function handleCreateRun(
  body: CreateRunRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.name) {
    set.status = 400
    return { error: 'name is required' }
  }

  if (!body.project_id) {
    set.status = 400
    return { error: 'project_id is required' }
  }

  if (!body.team_id) {
    set.status = 400
    return { error: 'team_id is required' }
  }

  if (body.playbook_id && body.phases) {
    set.status = 400
    return { error: 'cannot specify both phases and playbook_id' }
  }

  if (body.playbook_id && !getPlaybookById(body.playbook_id)) {
    set.status = 404
    return { error: `playbook "${body.playbook_id}" was not found` }
  }

  try {
    const run = dependencies.runInventory.createRun(
      mapCreateRunDtoToDomain(body),
    )
    dependencies.roomRegistry.getOrCreateRoom(run.channelId)
    return { run: mapRunToDto(run) } satisfies CreateRunResponse
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('was not found')) {
      set.status = 404
      return { error: message }
    }
    set.status = 400
    return { error: message }
  }
}

export function handleListRuns(
  query: { project_id?: string; status?: string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const filter: {
    projectId?: string
    status?: 'active' | 'completed' | 'pending_approval'
  } = {}
  if (query.project_id) filter.projectId = query.project_id
  if (query.status)
    filter.status = query.status as 'active' | 'completed' | 'pending_approval'

  return {
    runs: dependencies.runInventory.listRuns(filter).map(mapRunToDto),
  } satisfies RunsResponse
}

export function handleGetRun(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const run = dependencies.runInventory.getRunById(id)
  if (!run) {
    set.status = 404
    return { error: `run "${id}" was not found` }
  }

  return { run: mapRunToDto(run) } satisfies RunResponse
}

export function handleAdvanceRun(
  id: string,
  body: PhaseTransitionRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (body.action !== 'advance') {
    set.status = 400
    return { error: 'action must be "advance"' }
  }

  try {
    const run = dependencies.runInventory.advancePhase(id)
    return { run: mapRunToDto(run) } satisfies AdvanceRunResponse
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('was not found')) {
      set.status = 404
      return { error: message }
    }
    set.status = 409
    return { error: message }
  }
}

export function handleApproveRun(
  id: string,
  body: ApprovalRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    set.status = 400
    return { error: 'decision must be "approved" or "rejected"' }
  }

  try {
    const run = dependencies.runInventory.approvePhase(
      id,
      body.decision,
      body.reason,
    )
    return { run: mapRunToDto(run) } satisfies ApproveRunResponse
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('was not found')) {
      set.status = 404
      return { error: message }
    }
    set.status = 409
    return { error: message }
  }
}

// ── Workspace allocation route handlers ───────────────────────────────────

export function handleCreateWorkspaceAllocation(
  runId: string,
  body: CreateWorkspaceAllocationRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.workspace) {
    set.status = 400
    return { error: 'workspace is required' }
  }

  if (
    body.workspace.type !== 'project_root' &&
    body.workspace.type !== 'worktree'
  ) {
    set.status = 400
    return { error: 'workspace type must be "project_root" or "worktree"' }
  }

  if (!body.participant_name && !body.role_id) {
    set.status = 400
    return {
      error: 'at least one of participant_name or role_id is required',
    }
  }

  try {
    const allocation =
      dependencies.workspaceAllocationInventory.createAllocation(
        runId,
        mapCreateWorkspaceAllocationDtoToDomain(body),
      )
    return {
      allocation: mapWorkspaceAllocationToDto(allocation),
    } satisfies WorkspaceAllocationResponse
  } catch (err) {
    const message = (err as Error).message
    if (message.includes('was not found')) {
      set.status = 404
      return { error: message }
    }
    set.status = 400
    return { error: message }
  }
}

export function handleListWorkspaceAllocations(
  runId: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const run = dependencies.runInventory.getRunById(runId)
  if (!run) {
    set.status = 404
    return { error: `run "${runId}" was not found` }
  }

  return {
    allocations: dependencies.workspaceAllocationInventory
      .listAllocations(runId)
      .map(mapWorkspaceAllocationToDto),
  } satisfies WorkspaceAllocationsResponse
}

export function handleDeleteWorkspaceAllocation(
  id: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const deleted = dependencies.workspaceAllocationInventory.deleteAllocation(id)
  if (!deleted) {
    set.status = 404
    return { error: `workspace allocation "${id}" was not found` }
  }

  return { deleted: true } satisfies DeleteWorkspaceAllocationResponse
}

// ── Timeline route handlers ──────────────────────────────────────────────

export function handleGetTimeline(
  runId: string,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const run = dependencies.runInventory.getRunById(runId)
  if (!run) {
    set.status = 404
    return { error: `run "${runId}" was not found` }
  }

  return {
    events: dependencies.timelineInventory
      .getTimeline(runId)
      .map(mapTimelineEventToDto),
  } satisfies TimelineResponse
}

export function handleCreateReviewFeedback(
  runId: string,
  body: CreateReviewFeedbackRequest,
  set: { status?: number | string },
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  if (!body.comment || !body.author) {
    set.status = 400
    return { error: 'comment and author are required' }
  }

  const run = dependencies.runInventory.getRunById(runId)
  if (!run) {
    set.status = 404
    return { error: `run "${runId}" was not found` }
  }

  const event = dependencies.timelineInventory.addEvent(
    runId,
    'review_feedback',
    {
      comment: body.comment,
      author: body.author,
    },
  )

  return {
    event: mapTimelineEventToDto(event),
  } satisfies ReviewFeedbackResponse
}

export function createRouteHandlers(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  return {
    projects: {
      create({
        body,
        set,
      }: {
        body: CreateProjectRequest
        set: { status?: number | string }
      }) {
        return handleCreateProject(body, set, dependencies)
      },
      list() {
        return handleProjects(dependencies)
      },
    },
    connect({
      body,
      set,
    }: {
      body: ConnectRequest
      set: { status?: number | string }
    }) {
      return handleConnect(body, set, dependencies)
    },
    members({
      query,
      set,
    }: {
      query: { project_id: string; run_id?: string }
      set: { status?: number | string }
    }) {
      return handleMembers(query, set, dependencies)
    },
    playbooks: {
      list() {
        return handleListPlaybooks()
      },
      get({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleGetPlaybook(params.id, set)
      },
    },
    roles: {
      create({
        body,
        set,
      }: {
        body: {
          name: string
          description: string
          scope: string
          project_id?: string
          agent_config?: {
            runtime: string
            system_prompt: string | null
            model: string | null
          }
        }
        set: { status?: number | string }
      }) {
        return handleCreateRole(body as CreateRoleRequest, set, dependencies)
      },
      list({ query }: { query: { scope?: string; project_id?: string } }) {
        return handleListRoles(query, dependencies)
      },
      get({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleGetRole(params.id, set, dependencies)
      },
      update({
        params,
        body,
        set,
      }: {
        params: { id: string }
        body: {
          name?: string
          description?: string
          agent_config?: {
            runtime: string
            system_prompt: string | null
            model: string | null
          } | null
        }
        set: { status?: number | string }
      }) {
        return handleUpdateRole(
          params.id,
          body as UpdateRoleRequest,
          set,
          dependencies,
        )
      },
      delete({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleDeleteRole(params.id, set, dependencies)
      },
    },
    teams: {
      create({
        body,
        set,
      }: {
        body: CreateTeamRequest
        set: { status?: number | string }
      }) {
        return handleCreateTeam(body, set, dependencies)
      },
      list({ query }: { query: { project_id?: string } }) {
        return handleListTeams(query, dependencies)
      },
      get({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleGetTeam(params.id, set, dependencies)
      },
      update({
        params,
        body,
        set,
      }: {
        params: { id: string }
        body: UpdateTeamRequest
        set: { status?: number | string }
      }) {
        return handleUpdateTeam(params.id, body, set, dependencies)
      },
      delete({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleDeleteTeam(params.id, set, dependencies)
      },
    },
    runs: {
      create({
        body,
        set,
      }: {
        body: {
          name: string
          project_id: string
          team_id: string
          phases?: Array<{ name: string; approval_required?: boolean }>
          playbook_id?: string
          approval_required?: boolean
        }
        set: { status?: number | string }
      }) {
        return handleCreateRun(body as CreateRunRequest, set, dependencies)
      },
      list({ query }: { query: { project_id?: string; status?: string } }) {
        return handleListRuns(query, dependencies)
      },
      get({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleGetRun(params.id, set, dependencies)
      },
      advance({
        params,
        body,
        set,
      }: {
        params: { id: string }
        body: { action: string }
        set: { status?: number | string }
      }) {
        return handleAdvanceRun(
          params.id,
          body as PhaseTransitionRequest,
          set,
          dependencies,
        )
      },
      approve({
        params,
        body,
        set,
      }: {
        params: { id: string }
        body: { decision: string; reason?: string }
        set: { status?: number | string }
      }) {
        return handleApproveRun(
          params.id,
          body as ApprovalRequest,
          set,
          dependencies,
        )
      },
      workspaces: {
        create({
          params,
          body,
          set,
        }: {
          params: { id: string }
          body: {
            participant_name?: string
            role_id?: string
            workspace: {
              type: string
              name: string | null
              path: string | null
            }
          }
          set: { status?: number | string }
        }) {
          return handleCreateWorkspaceAllocation(
            params.id,
            body as CreateWorkspaceAllocationRequest,
            set,
            dependencies,
          )
        },
        list({
          params,
          set,
        }: {
          params: { id: string }
          set: { status?: number | string }
        }) {
          return handleListWorkspaceAllocations(params.id, set, dependencies)
        },
      },
      timeline({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleGetTimeline(params.id, set, dependencies)
      },
      reviews: {
        create({
          params,
          body,
          set,
        }: {
          params: { id: string }
          body: { run_id: string; comment: string; author: string }
          set: { status?: number | string }
        }) {
          return handleCreateReviewFeedback(
            params.id,
            body as CreateReviewFeedbackRequest,
            set,
            dependencies,
          )
        },
      },
    },
    workspaces: {
      delete({
        params,
        set,
      }: {
        params: { id: string }
        set: { status?: number | string }
      }) {
        return handleDeleteWorkspaceAllocation(params.id, set, dependencies)
      },
    },
  }
}

export const routeHandlers = createRouteHandlers()

export function createRoutes(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
) {
  const handlers = createRouteHandlers(dependencies)

  return new Elysia()
    .post('/projects', handlers.projects.create, {
      body: t.Object({
        name: t.String(),
        root_path: t.String(),
      }),
    })
    .get('/projects', handlers.projects.list)
    .post('/connect', handlers.connect, {
      body: t.Object({
        name: t.String(),
        description: t.String(),
        project_id: t.String(),
        run_id: t.Optional(t.String()),
        runtime: t.Optional(
          t.Object({
            runtime_id: t.String(),
            runtime_version: t.Union([t.String(), t.Null()]),
            capabilities: t.Object({
              can_stream_events: t.Boolean(),
              can_use_tools: t.Boolean(),
              can_manage_files: t.Boolean(),
              can_execute_commands: t.Boolean(),
            }),
          }),
        ),
      }),
    })
    .get('/members', handlers.members, {
      query: t.Object({
        project_id: t.String(),
        run_id: t.Optional(t.String()),
      }),
    })
    .post('/roles', handlers.roles.create, {
      body: t.Object({
        name: t.String(),
        description: t.String(),
        scope: t.String(),
        project_id: t.Optional(t.String()),
        agent_config: t.Optional(
          t.Object({
            runtime: t.String(),
            system_prompt: t.Union([t.String(), t.Null()]),
            model: t.Union([t.String(), t.Null()]),
          }),
        ),
      }),
    })
    .get('/roles', handlers.roles.list, {
      query: t.Object({
        scope: t.Optional(t.String()),
        project_id: t.Optional(t.String()),
      }),
    })
    .get('/roles/:id', handlers.roles.get, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .put('/roles/:id', handlers.roles.update, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        agent_config: t.Optional(
          t.Union([
            t.Object({
              runtime: t.String(),
              system_prompt: t.Union([t.String(), t.Null()]),
              model: t.Union([t.String(), t.Null()]),
            }),
            t.Null(),
          ]),
        ),
      }),
    })
    .delete('/roles/:id', handlers.roles.delete, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .post('/teams', handlers.teams.create, {
      body: t.Object({
        name: t.String(),
        project_id: t.String(),
        members: t.Array(
          t.Object({
            role_id: t.String(),
          }),
        ),
      }),
    })
    .get('/teams', handlers.teams.list, {
      query: t.Object({
        project_id: t.Optional(t.String()),
      }),
    })
    .get('/teams/:id', handlers.teams.get, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .put('/teams/:id', handlers.teams.update, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        members: t.Optional(
          t.Array(
            t.Object({
              role_id: t.String(),
            }),
          ),
        ),
      }),
    })
    .delete('/teams/:id', handlers.teams.delete, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .get('/playbooks', handlers.playbooks.list)
    .get('/playbooks/:id', handlers.playbooks.get, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .post('/runs', handlers.runs.create, {
      body: t.Object({
        name: t.String(),
        project_id: t.String(),
        team_id: t.String(),
        phases: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              approval_required: t.Optional(t.Boolean()),
            }),
          ),
        ),
        playbook_id: t.Optional(t.String()),
        approval_required: t.Optional(t.Boolean()),
      }),
    })
    .get('/runs', handlers.runs.list, {
      query: t.Object({
        project_id: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    })
    .get('/runs/:id', handlers.runs.get, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .post('/runs/:id/advance', handlers.runs.advance, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        action: t.String(),
      }),
    })
    .post('/runs/:id/approve', handlers.runs.approve, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        decision: t.String(),
        reason: t.Optional(t.String()),
      }),
    })
    .post('/runs/:id/workspaces', handlers.runs.workspaces.create, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        participant_name: t.Optional(t.String()),
        role_id: t.Optional(t.String()),
        workspace: t.Object({
          type: t.String(),
          name: t.Union([t.String(), t.Null()]),
          path: t.Union([t.String(), t.Null()]),
        }),
      }),
    })
    .get('/runs/:id/workspaces', handlers.runs.workspaces.list, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .get('/runs/:id/timeline', handlers.runs.timeline, {
      params: t.Object({
        id: t.String(),
      }),
    })
    .post('/runs/:id/reviews', handlers.runs.reviews.create, {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        run_id: t.String(),
        comment: t.String(),
        author: t.String(),
      }),
    })
    .delete('/workspaces/:id', handlers.workspaces.delete, {
      params: t.Object({
        id: t.String(),
      }),
    })
}

export const routes = createRoutes()
