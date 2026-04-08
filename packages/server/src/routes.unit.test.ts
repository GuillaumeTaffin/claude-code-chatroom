import { beforeEach, describe, expect, it } from 'vitest'
import {
  createRouteHandlers,
  handleAdvanceRun,
  handleApproveRun,
  handleConnect,
  handleCreateProject,
  handleCreateReviewFeedback,
  handleCreateRole,
  handleCreateRun,
  handleCreateTeam,
  handleCreateWorkspaceAllocation,
  handleDeleteRole,
  handleDeleteTeam,
  handleDeleteWorkspaceAllocation,
  handleGetPlaybook,
  handleGetRole,
  handleGetRun,
  handleGetTeam,
  handleGetTimeline,
  handleListPlaybooks,
  handleListRoles,
  handleListRuns,
  handleListTeams,
  handleListWorkspaceAllocations,
  handleMembers,
  handleProjects,
  handleUpdateRole,
  handleUpdateTeam,
  routeHandlers,
} from './routes.js'
import {
  InMemoryProjectInventory,
  createProject,
  createProjectChatDependencies,
  resetState,
} from './state.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  it('rejects missing fields', () => {
    const set: { status?: number } = {}

    const result = handleConnect(
      { name: '', description: '', project_id: '' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'name, description, and project_id are required',
    })
  })

  it('creates and lists projects with UUID-backed identifiers', () => {
    const set: { status?: number } = {}

    const created = handleCreateProject(
      { name: 'Chatroom', root_path: '/workspace/chatroom' },
      set,
    ) as {
      project: {
        id: string
        name: string
        root_path: string
        channel_id: string
      }
    }

    expect(set.status).toBeUndefined()
    expect(created.project.id).toMatch(UUID)
    expect(created.project.channel_id).toMatch(UUID)
    expect(created.project.name).toBe('Chatroom')
    expect(created.project.root_path).toBe('/workspace/chatroom')

    const listed = handleProjects() as { projects: (typeof created.project)[] }
    expect(listed.projects).toHaveLength(1)
    expect(listed.projects[0]).toEqual(created.project)
  })

  it('rejects project creation when fields are missing', () => {
    const set: { status?: number } = {}

    const result = handleCreateProject({ name: '', root_path: '' }, set)

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'name and root_path are required' })
  })

  it('registers a member in the selected project and returns project context', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: project.id,
      },
      set,
    )

    expect(set.status).toBeUndefined()
    expect(result).toEqual({
      project_id: project.id,
      channel_id: project.channel_id,
    })
  })

  it('rejects duplicate member names only within the same project', () => {
    const alphaProject = createProject({
      name: 'Alpha',
      root_path: '/workspace/alpha',
    })
    const betaProject = createProject({
      name: 'Beta',
      root_path: '/workspace/beta',
    })

    handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: alphaProject.id,
      },
      {},
    )
    const sameProjectSet: { status?: number } = {}
    const sameProjectResult = handleConnect(
      {
        name: 'alpha',
        description: 'duplicate',
        project_id: alphaProject.id,
      },
      sameProjectSet,
    )
    const otherProjectSet: { status?: number } = {}
    const otherProjectResult = handleConnect(
      {
        name: 'alpha',
        description: 'beta project agent',
        project_id: betaProject.id,
      },
      otherProjectSet,
    )

    expect(sameProjectSet.status).toBe(409)
    expect(sameProjectResult).toEqual({
      error: 'name "alpha" is already taken',
    })
    expect(otherProjectSet.status).toBeUndefined()
    expect(otherProjectResult).toEqual({
      project_id: betaProject.id,
      channel_id: betaProject.channel_id,
    })
  })

  it('rejects unknown projects for connect and members', () => {
    const connectSet: { status?: number } = {}
    const connectResult = handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: 'missing',
      },
      connectSet,
    )
    const membersSet: { status?: number } = {}
    const membersResult = handleMembers({ project_id: 'missing' }, membersSet)

    expect(connectSet.status).toBe(404)
    expect(connectResult).toEqual({ error: 'project "missing" was not found' })
    expect(membersSet.status).toBe(404)
    expect(membersResult).toEqual({ error: 'project "missing" was not found' })
  })

  it('returns only members for the selected project', () => {
    const alphaProject = createProject({
      name: 'Alpha',
      root_path: '/workspace/alpha',
    })
    const betaProject = createProject({
      name: 'Beta',
      root_path: '/workspace/beta',
    })
    handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: alphaProject.id,
      },
      {},
    )
    handleConnect(
      {
        name: 'beta',
        description: 'backend agent',
        project_id: betaProject.id,
      },
      {},
    )

    expect(handleMembers({ project_id: alphaProject.id }, {})).toEqual({
      project_id: alphaProject.id,
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: alphaProject.channel_id,
        },
      ],
    })
  })

  it('exposes Elysia route adapters that delegate to the handlers', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const set: { status?: number } = {}

    const created = routeHandlers.projects.create({
      body: { name: 'Another', root_path: '/workspace/another' },
      set: {},
    }) as {
      project: {
        id: string
        name: string
        root_path: string
        channel_id: string
      }
    }

    expect(created.project.id).toMatch(UUID)
    expect(created.project.name).toBe('Another')

    const listed = routeHandlers.projects.list() as {
      projects: (typeof created.project)[]
    }
    expect(listed.projects).toHaveLength(2)
    expect(listed.projects[0]).toEqual(project)
    expect(listed.projects[1]).toEqual(created.project)

    expect(
      routeHandlers.connect({
        body: {
          name: 'alpha',
          description: 'frontend agent',
          project_id: project.id,
        },
        set,
      }),
    ).toEqual({ project_id: project.id, channel_id: project.channel_id })
    expect(
      routeHandlers.members({ query: { project_id: project.id }, set: {} }),
    ).toEqual({
      project_id: project.id,
      members: [
        {
          name: 'alpha',
          description: 'frontend agent',
          channel_id: project.channel_id,
        },
      ],
    })
  })

  it('supports injected project inventories through the route factory', () => {
    const dependencies = createProjectChatDependencies({
      projectInventory: new InMemoryProjectInventory(),
    })
    const handlers = createRouteHandlers(dependencies)

    const created = handlers.projects.create({
      body: { name: 'Injected', root_path: '/workspace/injected' },
      set: {},
    }) as {
      project: {
        id: string
        name: string
        root_path: string
        channel_id: string
      }
    }

    expect(created.project.id).toMatch(UUID)
    expect(created.project.channel_id).toMatch(UUID)
    expect(created.project.name).toBe('Injected')
    expect(created.project.root_path).toBe('/workspace/injected')

    const listed = handlers.projects.list() as {
      projects: (typeof created.project)[]
    }
    expect(listed.projects).toHaveLength(1)
    expect(listed.projects[0]).toEqual(created.project)
  })
})

describe('role route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  it('creates a user-scoped role', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      { name: 'Architect', description: 'Designs systems', scope: 'user' },
      set,
    ) as { role: { id: string; name: string; scope: string; project_id: null } }

    expect(set.status).toBeUndefined()
    expect(result.role.id).toMatch(UUID)
    expect(result.role.name).toBe('Architect')
    expect(result.role.scope).toBe('user')
    expect(result.role.project_id).toBeNull()
  })

  it('creates a project-scoped role when project exists', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const set: { status?: number } = {}

    const result = handleCreateRole(
      {
        name: 'Lead Dev',
        description: 'Leads development',
        scope: 'project',
        project_id: project.id,
      },
      set,
    ) as { role: { id: string; scope: string; project_id: string } }

    expect(set.status).toBeUndefined()
    expect(result.role.id).toMatch(UUID)
    expect(result.role.scope).toBe('project')
    expect(result.role.project_id).toBe(project.id)
  })

  it('rejects role creation when name or description is missing', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      { name: '', description: '', scope: 'user' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'name and description are required' })
  })

  it('rejects role creation with invalid scope', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      {
        name: 'Bad',
        description: 'Bad scope',
        scope: 'invalid' as 'user',
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'scope must be "user" or "project"' })
  })

  it('rejects project-scoped role when project_id is missing', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      { name: 'Dev', description: 'Developer', scope: 'project' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'project_id is required when scope is "project"',
    })
  })

  it('rejects project-scoped role when project does not exist', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      {
        name: 'Dev',
        description: 'Developer',
        scope: 'project',
        project_id: 'nonexistent',
      },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({
      error: 'project "nonexistent" was not found',
    })
  })

  it('rejects user-scoped role when project_id is provided', () => {
    const set: { status?: number } = {}

    const result = handleCreateRole(
      {
        name: 'Dev',
        description: 'Developer',
        scope: 'user',
        project_id: 'some-id',
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'project_id must not be provided when scope is "user"',
    })
  })

  it('lists all roles', () => {
    handleCreateRole({ name: 'A', description: 'Role A', scope: 'user' }, {})
    handleCreateRole({ name: 'B', description: 'Role B', scope: 'user' }, {})

    const result = handleListRoles({}) as { roles: { name: string }[] }

    expect(result.roles).toHaveLength(2)
    expect(result.roles[0].name).toBe('A')
    expect(result.roles[1].name).toBe('B')
  })

  it('lists roles filtered by scope', () => {
    const project = createProject({
      name: 'P',
      root_path: '/p',
    })
    handleCreateRole(
      { name: 'User Role', description: 'Global', scope: 'user' },
      {},
    )
    handleCreateRole(
      {
        name: 'Project Role',
        description: 'Scoped',
        scope: 'project',
        project_id: project.id,
      },
      {},
    )

    const result = handleListRoles({ scope: 'project' }) as {
      roles: { name: string }[]
    }

    expect(result.roles).toHaveLength(1)
    expect(result.roles[0].name).toBe('Project Role')
  })

  it('lists roles filtered by project_id', () => {
    const p1 = createProject({ name: 'P1', root_path: '/p1' })
    const p2 = createProject({ name: 'P2', root_path: '/p2' })
    handleCreateRole(
      {
        name: 'P1 Role',
        description: 'In P1',
        scope: 'project',
        project_id: p1.id,
      },
      {},
    )
    handleCreateRole(
      {
        name: 'P2 Role',
        description: 'In P2',
        scope: 'project',
        project_id: p2.id,
      },
      {},
    )

    const result = handleListRoles({ project_id: p1.id }) as {
      roles: { name: string }[]
    }

    expect(result.roles).toHaveLength(1)
    expect(result.roles[0].name).toBe('P1 Role')
  })

  it('gets a role by id', () => {
    const created = handleCreateRole(
      { name: 'Architect', description: 'Designs systems', scope: 'user' },
      {},
    ) as { role: { id: string; name: string } }
    const set: { status?: number } = {}

    const result = handleGetRole(created.role.id, set) as {
      role: { id: string; name: string }
    }

    expect(set.status).toBeUndefined()
    expect(result.role).toEqual(created.role)
  })

  it('returns 404 for unknown role id', () => {
    const set: { status?: number } = {}

    const result = handleGetRole('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'role "nonexistent" was not found' })
  })

  it('updates a role', () => {
    const created = handleCreateRole(
      { name: 'Original', description: 'Original desc', scope: 'user' },
      {},
    ) as { role: { id: string } }
    const set: { status?: number } = {}

    const result = handleUpdateRole(
      created.role.id,
      { name: 'Updated', description: 'Updated desc' },
      set,
    ) as { role: { id: string; name: string; description: string } }

    expect(set.status).toBeUndefined()
    expect(result.role.id).toBe(created.role.id)
    expect(result.role.name).toBe('Updated')
    expect(result.role.description).toBe('Updated desc')
  })

  it('partially updates a role', () => {
    const created = handleCreateRole(
      { name: 'Original', description: 'Original desc', scope: 'user' },
      {},
    ) as { role: { id: string } }
    const set: { status?: number } = {}

    const result = handleUpdateRole(
      created.role.id,
      { name: 'New Name' },
      set,
    ) as { role: { name: string; description: string } }

    expect(result.role.name).toBe('New Name')
    expect(result.role.description).toBe('Original desc')
  })

  it('returns 404 when updating a nonexistent role', () => {
    const set: { status?: number } = {}

    const result = handleUpdateRole('nonexistent', { name: 'Whatever' }, set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'role "nonexistent" was not found' })
  })

  it('deletes a role', () => {
    const created = handleCreateRole(
      { name: 'To Delete', description: 'Temporary', scope: 'user' },
      {},
    ) as { role: { id: string } }
    const set: { status?: number } = {}

    const result = handleDeleteRole(created.role.id, set) as {
      deleted: boolean
    }

    expect(set.status).toBeUndefined()
    expect(result.deleted).toBe(true)

    const getSet: { status?: number } = {}
    expect(handleGetRole(created.role.id, getSet)).toEqual({
      error: `role "${created.role.id}" was not found`,
    })
    expect(getSet.status).toBe(404)
  })

  it('returns 404 when deleting a nonexistent role', () => {
    const set: { status?: number } = {}

    const result = handleDeleteRole('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'role "nonexistent" was not found' })
  })

  it('exposes role Elysia route adapters that delegate to handlers', () => {
    const created = routeHandlers.roles.create({
      body: {
        name: 'Architect',
        description: 'Designs systems',
        scope: 'user' as const,
      },
      set: {},
    }) as { role: { id: string; name: string } }

    expect(created.role.id).toMatch(UUID)
    expect(created.role.name).toBe('Architect')

    const listed = routeHandlers.roles.list({ query: {} }) as {
      roles: { name: string }[]
    }
    expect(listed.roles).toHaveLength(1)

    const fetched = routeHandlers.roles.get({
      params: { id: created.role.id },
      set: {},
    }) as { role: { id: string } }
    expect(fetched.role.id).toBe(created.role.id)

    const updated = routeHandlers.roles.update({
      params: { id: created.role.id },
      body: { name: 'Senior Architect' },
      set: {},
    }) as { role: { name: string } }
    expect(updated.role.name).toBe('Senior Architect')

    const deleted = routeHandlers.roles.delete({
      params: { id: created.role.id },
      set: {},
    }) as { deleted: boolean }
    expect(deleted.deleted).toBe(true)
  })
})

describe('team route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedProjectAndRole() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      {
        name: 'Architect',
        description: 'Designs systems',
        scope: 'user',
      },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    return { project, roleId: roles[0].id }
  }

  it('creates a team', () => {
    const { project, roleId } = seedProjectAndRole()
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      set,
    ) as {
      team: {
        id: string
        name: string
        project_id: string
        members: { role_id: string }[]
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.team.id).toMatch(UUID)
    expect(result.team.name).toBe('Alpha Team')
    expect(result.team.project_id).toBe(project.id)
    expect(result.team.members).toEqual([{ role_id: roleId }])
  })

  it('rejects team creation when name is missing', () => {
    const { project, roleId } = seedProjectAndRole()
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: '',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'name is required' })
  })

  it('rejects team creation when project_id is missing', () => {
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: 'Team',
        project_id: '',
        members: [],
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'project_id is required' })
  })

  it('rejects team creation when project does not exist', () => {
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: 'Team',
        project_id: 'nonexistent',
        members: [],
      },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'project "nonexistent" was not found' })
  })

  it('rejects team creation when a role does not exist', () => {
    const { project } = seedProjectAndRole()
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: 'bad-role' }],
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'role "bad-role" was not found' })
  })

  it('rejects team creation when a role is not visible to the project', () => {
    const project = createProject({
      name: 'Project A',
      root_path: '/workspace/a',
    })
    const projectB = createProject({
      name: 'Project B',
      root_path: '/workspace/b',
    })
    const roleResult = handleCreateRole(
      {
        name: 'B Role',
        description: 'Scoped to B',
        scope: 'project',
        project_id: projectB.id,
      },
      {},
    ) as { role: { id: string } }
    const set: { status?: number } = {}

    const result = handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: roleResult.role.id }],
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: `role "${roleResult.role.id}" is not visible to project "${project.id}"`,
    })
  })

  it('lists teams for a project', () => {
    const { project, roleId } = seedProjectAndRole()
    handleCreateTeam(
      {
        name: 'Team 1',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    )

    const result = handleListTeams({ project_id: project.id }) as {
      teams: { name: string }[]
    }

    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].name).toBe('Team 1')
  })

  it('lists all teams when no project_id filter is provided', () => {
    const { project, roleId } = seedProjectAndRole()
    handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    )

    const result = handleListTeams({}) as { teams: { name: string }[] }

    expect(result.teams).toHaveLength(1)
  })

  it('gets a team by id', () => {
    const { project, roleId } = seedProjectAndRole()
    const created = handleCreateTeam(
      {
        name: 'Alpha',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const set: { status?: number } = {}

    const result = handleGetTeam(created.team.id, set) as {
      team: { id: string; name: string }
    }

    expect(set.status).toBeUndefined()
    expect(result.team.id).toBe(created.team.id)
    expect(result.team.name).toBe('Alpha')
  })

  it('returns 404 for unknown team id', () => {
    const set: { status?: number } = {}

    const result = handleGetTeam('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'team "nonexistent" was not found' })
  })

  it('updates a team', () => {
    const { project, roleId } = seedProjectAndRole()
    const created = handleCreateTeam(
      {
        name: 'Original',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const set: { status?: number } = {}

    const result = handleUpdateTeam(
      created.team.id,
      { name: 'Renamed' },
      set,
    ) as { team: { name: string; members: { role_id: string }[] } }

    expect(set.status).toBeUndefined()
    expect(result.team.name).toBe('Renamed')
    expect(result.team.members).toEqual([{ role_id: roleId }])
  })

  it('updates team members', () => {
    const { project, roleId } = seedProjectAndRole()
    handleCreateRole(
      { name: 'Tester', description: 'Tests', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const newRoleId = roles.find((r) => r.id !== roleId)!.id

    const created = handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const set: { status?: number } = {}

    const result = handleUpdateTeam(
      created.team.id,
      { members: [{ role_id: newRoleId }] },
      set,
    ) as { team: { members: { role_id: string }[] } }

    expect(result.team.members).toEqual([{ role_id: newRoleId }])
  })

  it('returns 404 when updating a nonexistent team', () => {
    const set: { status?: number } = {}

    const result = handleUpdateTeam('nonexistent', { name: 'Whatever' }, set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'team "nonexistent" was not found' })
  })

  it('returns 400 when update has invalid role references', () => {
    const { project, roleId } = seedProjectAndRole()
    const created = handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const set: { status?: number } = {}

    const result = handleUpdateTeam(
      created.team.id,
      { members: [{ role_id: 'bad-role' }] },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'role "bad-role" was not found' })
  })

  it('deletes a team', () => {
    const { project, roleId } = seedProjectAndRole()
    const created = handleCreateTeam(
      {
        name: 'Doomed',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const set: { status?: number } = {}

    const result = handleDeleteTeam(created.team.id, set) as {
      deleted: boolean
    }

    expect(set.status).toBeUndefined()
    expect(result.deleted).toBe(true)

    const getSet: { status?: number } = {}
    expect(handleGetTeam(created.team.id, getSet)).toEqual({
      error: `team "${created.team.id}" was not found`,
    })
    expect(getSet.status).toBe(404)
  })

  it('returns 404 when deleting a nonexistent team', () => {
    const set: { status?: number } = {}

    const result = handleDeleteTeam('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'team "nonexistent" was not found' })
  })

  it('exposes team Elysia route adapters that delegate to handlers', () => {
    const { project, roleId } = seedProjectAndRole()

    const created = routeHandlers.teams.create({
      body: {
        name: 'Alpha',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      set: {},
    }) as { team: { id: string; name: string } }

    expect(created.team.id).toMatch(UUID)
    expect(created.team.name).toBe('Alpha')

    const listed = routeHandlers.teams.list({
      query: { project_id: project.id },
    }) as { teams: { name: string }[] }
    expect(listed.teams).toHaveLength(1)

    const fetched = routeHandlers.teams.get({
      params: { id: created.team.id },
      set: {},
    }) as { team: { id: string } }
    expect(fetched.team.id).toBe(created.team.id)

    const updated = routeHandlers.teams.update({
      params: { id: created.team.id },
      body: { name: 'Beta' },
      set: {},
    }) as { team: { name: string } }
    expect(updated.team.name).toBe('Beta')

    const deleted = routeHandlers.teams.delete({
      params: { id: created.team.id },
      set: {},
    }) as { deleted: boolean }
    expect(deleted.deleted).toBe(true)
  })
})

describe('run route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedProjectTeamAndRole() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      {
        name: 'Architect',
        description: 'Designs systems',
        scope: 'user',
      },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const roleId = roles[0].id
    const teamResult = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    return { project, roleId, teamId: teamResult.team.id }
  }

  it('creates a run', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: teamId,
      },
      set,
    ) as {
      run: {
        id: string
        name: string
        project_id: string
        channel_id: string
        status: string
        team_snapshot: {
          team_id: string
          team_name: string
          members: { role_id: string }[]
        }
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.id).toMatch(UUID)
    expect(result.run.channel_id).toMatch(UUID)
    expect(result.run.name).toBe('Sprint 1')
    expect(result.run.project_id).toBe(project.id)
    expect(result.run.status).toBe('active')
    expect(result.run.team_snapshot.team_id).toBe(teamId)
    expect(result.run.team_snapshot.team_name).toBe('Alpha Team')
  })

  it('rejects run creation when name is missing', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: '', project_id: project.id, team_id: teamId },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'name is required' })
  })

  it('rejects run creation when project_id is missing', () => {
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: 'Run', project_id: '', team_id: 'team-1' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'project_id is required' })
  })

  it('rejects run creation when team_id is missing', () => {
    const { project } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: 'Run', project_id: project.id, team_id: '' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'team_id is required' })
  })

  it('rejects run creation when project does not exist', () => {
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: 'Run', project_id: 'nonexistent', team_id: 'team-1' },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'project "nonexistent" was not found' })
  })

  it('rejects run creation when team does not exist', () => {
    const { project } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: 'Run', project_id: project.id, team_id: 'nonexistent' },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'team "nonexistent" was not found' })
  })

  it('rejects run creation when team does not belong to project', () => {
    const { teamId } = seedProjectTeamAndRole()
    const otherProject = createProject({
      name: 'Other',
      root_path: '/workspace/other',
    })
    const set: { status?: number } = {}

    const result = handleCreateRun(
      { name: 'Run', project_id: otherProject.id, team_id: teamId },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: `team "${teamId}" does not belong to project "${otherProject.id}"`,
    })
  })

  it('lists runs with project_id and status filters', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    handleCreateRun(
      { name: 'Run 1', project_id: project.id, team_id: teamId },
      {},
    )
    handleCreateRun(
      { name: 'Run 2', project_id: project.id, team_id: teamId },
      {},
    )

    const result = handleListRuns({
      project_id: project.id,
    }) as { runs: { name: string }[] }

    expect(result.runs).toHaveLength(2)
    expect(result.runs[0].name).toBe('Run 1')
    expect(result.runs[1].name).toBe('Run 2')
  })

  it('lists runs filtered by status', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    handleCreateRun(
      { name: 'Run 1', project_id: project.id, team_id: teamId },
      {},
    )

    const result = handleListRuns({
      status: 'active',
    }) as { runs: { name: string }[] }

    expect(result.runs).toHaveLength(1)
    expect(result.runs[0].name).toBe('Run 1')
  })

  it('lists all runs when no filter is provided', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    handleCreateRun(
      { name: 'Run 1', project_id: project.id, team_id: teamId },
      {},
    )

    const result = handleListRuns({}) as { runs: { name: string }[] }

    expect(result.runs).toHaveLength(1)
  })

  it('gets a run by id', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const created = handleCreateRun(
      { name: 'Sprint 1', project_id: project.id, team_id: teamId },
      {},
    ) as { run: { id: string; name: string } }
    const set: { status?: number } = {}

    const result = handleGetRun(created.run.id, set) as {
      run: { id: string; name: string }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.id).toBe(created.run.id)
    expect(result.run.name).toBe('Sprint 1')
  })

  it('returns 404 for unknown run id', () => {
    const set: { status?: number } = {}

    const result = handleGetRun('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('exposes run Elysia route adapters that delegate to handlers', () => {
    const { project, teamId } = seedProjectTeamAndRole()

    const created = routeHandlers.runs.create({
      body: {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: teamId,
      },
      set: {},
    }) as { run: { id: string; name: string } }

    expect(created.run.id).toMatch(UUID)
    expect(created.run.name).toBe('Sprint 1')

    const listed = routeHandlers.runs.list({
      query: { project_id: project.id },
    }) as { runs: { name: string }[] }
    expect(listed.runs).toHaveLength(1)

    const fetched = routeHandlers.runs.get({
      params: { id: created.run.id },
      set: {},
    }) as { run: { id: string } }
    expect(fetched.run.id).toBe(created.run.id)
  })
})

describe('connect with run_id', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRunContext() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      { name: 'Architect', description: 'Designs systems', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const roleId = roles[0].id
    const teamResult = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const runResult = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: teamResult.team.id,
      },
      {},
    ) as { run: { id: string; channel_id: string } }
    return {
      project,
      runId: runResult.run.id,
      runChannelId: runResult.run.channel_id,
    }
  }

  it('connects to a run-scoped chat', () => {
    const { project, runId, runChannelId } = seedRunContext()
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: project.id,
        run_id: runId,
      },
      set,
    )

    expect(set.status).toBeUndefined()
    expect(result).toEqual({
      project_id: project.id,
      channel_id: runChannelId,
      run_id: runId,
    })
  })

  it('rejects connect when run does not exist', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: project.id,
        run_id: 'nonexistent',
      },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('rejects connect when run does not belong to project', () => {
    const { runId } = seedRunContext()
    const otherProject = createProject({
      name: 'Other',
      root_path: '/workspace/other',
    })
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: otherProject.id,
        run_id: runId,
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: `run "${runId}" does not belong to project "${otherProject.id}"`,
    })
  })

  it('rejects duplicate member names in run chat', () => {
    const { project, runId } = seedRunContext()

    handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: project.id,
        run_id: runId,
      },
      {},
    )
    const set: { status?: number } = {}
    const result = handleConnect(
      {
        name: 'alpha',
        description: 'duplicate',
        project_id: project.id,
        run_id: runId,
      },
      set,
    )

    expect(set.status).toBe(409)
    expect(result).toEqual({ error: 'name "alpha" is already taken' })
  })

  it('returns run-scoped members when run_id is provided', () => {
    const { project, runId } = seedRunContext()

    handleConnect(
      {
        name: 'alpha',
        description: 'frontend agent',
        project_id: project.id,
        run_id: runId,
      },
      {},
    )

    const result = handleMembers(
      { project_id: project.id, run_id: runId },
      {},
    ) as { project_id: string; run_id: string; members: unknown[] }

    expect(result.project_id).toBe(project.id)
    expect(result.run_id).toBe(runId)
    expect(result.members).toHaveLength(1)
  })

  it('returns 404 for members when run does not exist', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })
    const set: { status?: number } = {}

    const result = handleMembers(
      { project_id: project.id, run_id: 'nonexistent' },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('keeps run and project chat isolated', () => {
    const { project, runId } = seedRunContext()

    // Connect to run chat
    handleConnect(
      {
        name: 'run-agent',
        description: 'run member',
        project_id: project.id,
        run_id: runId,
      },
      {},
    )

    // Connect to project chat
    handleConnect(
      {
        name: 'project-agent',
        description: 'project member',
        project_id: project.id,
      },
      {},
    )

    const runMembers = handleMembers(
      { project_id: project.id, run_id: runId },
      {},
    ) as { members: { name: string }[] }
    const projectMembers = handleMembers({ project_id: project.id }, {}) as {
      members: { name: string }[]
    }

    expect(runMembers.members).toHaveLength(1)
    expect(runMembers.members[0].name).toBe('run-agent')
    expect(projectMembers.members).toHaveLength(1)
    expect(projectMembers.members[0].name).toBe('project-agent')
  })
})

describe('runtime capability route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  const claudeRuntime = {
    runtime_id: 'claude',
    runtime_version: null,
    capabilities: {
      can_stream_events: true,
      can_use_tools: true,
      can_manage_files: true,
      can_execute_commands: true,
    },
  }

  it('connects with runtime identity and echoes it back', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'alpha',
        description: 'claude agent',
        project_id: project.id,
        runtime: claudeRuntime,
      },
      set,
    ) as { project_id: string; channel_id: string; runtime: unknown }

    expect(set.status).toBeUndefined()
    expect(result.project_id).toBe(project.id)
    expect(result.runtime).toEqual(claudeRuntime)
  })

  it('connects without runtime identity (backward compatible)', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })
    const set: { status?: number } = {}

    const result = handleConnect(
      {
        name: 'human',
        description: 'human user',
        project_id: project.id,
      },
      set,
    ) as { project_id: string; channel_id: string; runtime?: unknown }

    expect(set.status).toBeUndefined()
    expect(result.runtime).toBeUndefined()
  })

  it('returns runtime identity in members response', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })

    handleConnect(
      {
        name: 'alpha',
        description: 'claude agent',
        project_id: project.id,
        runtime: claudeRuntime,
      },
      {},
    )
    handleConnect(
      {
        name: 'human',
        description: 'human user',
        project_id: project.id,
      },
      {},
    )

    const membersResult = handleMembers({ project_id: project.id }, {}) as {
      members: Array<{
        name: string
        description: string
        channel_id: string
        runtime?: unknown
      }>
    }

    expect(membersResult.members).toHaveLength(2)
    expect(membersResult.members[0].runtime).toEqual(claudeRuntime)
    expect(membersResult.members[1].runtime).toBeUndefined()
  })

  it('echoes runtime in run-scoped connect response', () => {
    const project = createProject({
      name: 'Test',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      { name: 'Agent', description: 'ai agent', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const teamResult = handleCreateTeam(
      {
        name: 'Team',
        project_id: project.id,
        members: [{ role_id: roles[0].id }],
      },
      {},
    ) as { team: { id: string } }
    const runResult = handleCreateRun(
      {
        name: 'Run',
        project_id: project.id,
        team_id: teamResult.team.id,
      },
      {},
    ) as { run: { id: string; channel_id: string } }

    const set: { status?: number } = {}
    const result = handleConnect(
      {
        name: 'alpha',
        description: 'claude agent',
        project_id: project.id,
        run_id: runResult.run.id,
        runtime: claudeRuntime,
      },
      set,
    ) as { runtime: unknown; run_id: string }

    expect(set.status).toBeUndefined()
    expect(result.runtime).toEqual(claudeRuntime)
    expect(result.run_id).toBe(runResult.run.id)
  })
})

describe('phase control route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRunWithPhases(
    phases?: Array<{ name: string; approval_required?: boolean }>,
    approval_required?: boolean,
  ) {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      { name: 'Architect', description: 'Designs systems', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const roleId = roles[0].id
    const teamResult = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const runResult = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: teamResult.team.id,
        phases,
        approval_required,
      },
      {},
    ) as {
      run: {
        id: string
        phases: Array<{
          id: string
          name: string
          status: string
          approval_required: boolean
        }>
        current_phase_id: string | null
        approval_required: boolean
        approvals: unknown[]
        status: string
      }
    }
    return { project, run: runResult.run }
  }

  it('creates a run with phases via the route handler', () => {
    const { run } = seedRunWithPhases([
      { name: 'Design' },
      { name: 'Build' },
      { name: 'Review' },
    ])

    expect(run.phases).toHaveLength(3)
    expect(run.phases[0].name).toBe('Design')
    expect(run.phases[0].status).toBe('active')
    expect(run.phases[1].status).toBe('pending')
    expect(run.phases[2].status).toBe('pending')
    expect(run.current_phase_id).toBe(run.phases[0].id)
    expect(run.approval_required).toBe(false)
    expect(run.approvals).toEqual([])
  })

  it('creates a run with global approval_required', () => {
    const { run } = seedRunWithPhases(
      [{ name: 'Design' }, { name: 'Build' }],
      true,
    )

    expect(run.approval_required).toBe(true)
    expect(run.phases[0].approval_required).toBe(true)
    expect(run.phases[1].approval_required).toBe(true)
  })

  it('advances a run phase via POST /runs/:id/advance', () => {
    const { run } = seedRunWithPhases([{ name: 'Design' }, { name: 'Build' }])
    const set: { status?: number } = {}

    const result = handleAdvanceRun(run.id, { action: 'advance' }, set) as {
      run: {
        phases: Array<{ status: string }>
        current_phase_id: string | null
        status: string
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.phases[0].status).toBe('completed')
    expect(result.run.phases[1].status).toBe('active')
    expect(result.run.status).toBe('active')
  })

  it('rejects advance with invalid action', () => {
    const { run } = seedRunWithPhases([{ name: 'Design' }])
    const set: { status?: number } = {}

    const result = handleAdvanceRun(
      run.id,
      { action: 'invalid' as 'advance' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'action must be "advance"' })
  })

  it('returns 404 when advancing a nonexistent run', () => {
    const set: { status?: number } = {}

    const result = handleAdvanceRun('nonexistent', { action: 'advance' }, set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('returns 409 when advancing a run with no phases', () => {
    const { run } = seedRunWithPhases()
    const set: { status?: number } = {}

    const result = handleAdvanceRun(run.id, { action: 'advance' }, set)

    expect(set.status).toBe(409)
    expect(result).toEqual({ error: 'run has no phases to advance' })
  })

  it('returns 409 when advancing a completed run', () => {
    const { run } = seedRunWithPhases([{ name: 'Design' }])
    handleAdvanceRun(run.id, { action: 'advance' }, {})
    const set: { status?: number } = {}

    const result = handleAdvanceRun(run.id, { action: 'advance' }, set)

    expect(set.status).toBe(409)
    expect(result).toEqual({ error: 'run is already completed' })
  })

  it('puts run into pending_approval and then approves via route', () => {
    const { run } = seedRunWithPhases([
      { name: 'Design', approval_required: true },
      { name: 'Build' },
    ])

    // Advance to pending_approval
    const advanced = handleAdvanceRun(run.id, { action: 'advance' }, {}) as {
      run: { status: string }
    }
    expect(advanced.run.status).toBe('pending_approval')

    // Approve
    const set: { status?: number } = {}
    const result = handleApproveRun(
      run.id,
      { decision: 'approved', reason: 'LGTM' },
      set,
    ) as {
      run: {
        phases: Array<{ status: string }>
        approvals: Array<{ decision: string; reason: string | null }>
        status: string
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.status).toBe('active')
    expect(result.run.phases[0].status).toBe('completed')
    expect(result.run.phases[1].status).toBe('active')
    expect(result.run.approvals).toHaveLength(1)
    expect(result.run.approvals[0].decision).toBe('approved')
    expect(result.run.approvals[0].reason).toBe('LGTM')
  })

  it('rejects a phase transition via route', () => {
    const { run } = seedRunWithPhases([
      { name: 'Design', approval_required: true },
      { name: 'Build' },
    ])

    handleAdvanceRun(run.id, { action: 'advance' }, {})

    const set: { status?: number } = {}
    const result = handleApproveRun(
      run.id,
      { decision: 'rejected', reason: 'Needs work' },
      set,
    ) as {
      run: {
        phases: Array<{ status: string }>
        approvals: Array<{ decision: string }>
        status: string
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.status).toBe('active')
    expect(result.run.phases[0].status).toBe('rejected')
    expect(result.run.approvals[0].decision).toBe('rejected')
  })

  it('rejects approve with invalid decision', () => {
    const { run } = seedRunWithPhases([
      { name: 'Design', approval_required: true },
    ])
    handleAdvanceRun(run.id, { action: 'advance' }, {})
    const set: { status?: number } = {}

    const result = handleApproveRun(
      run.id,
      { decision: 'invalid' as 'approved' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'decision must be "approved" or "rejected"',
    })
  })

  it('returns 404 when approving a nonexistent run', () => {
    const set: { status?: number } = {}

    const result = handleApproveRun(
      'nonexistent',
      { decision: 'approved' },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('returns 409 when approving a run not in pending_approval state', () => {
    const { run } = seedRunWithPhases([{ name: 'Design' }])
    const set: { status?: number } = {}

    const result = handleApproveRun(run.id, { decision: 'approved' }, set)

    expect(set.status).toBe(409)
    expect(result).toEqual({ error: 'run is not pending approval' })
  })

  it('exposes advance and approve via Elysia route adapters', () => {
    const { run } = seedRunWithPhases([
      { name: 'Design', approval_required: true },
      { name: 'Build' },
    ])

    const advanced = routeHandlers.runs.advance({
      params: { id: run.id },
      body: { action: 'advance' },
      set: {},
    }) as { run: { status: string } }

    expect(advanced.run.status).toBe('pending_approval')

    const approved = routeHandlers.runs.approve({
      params: { id: run.id },
      body: { decision: 'approved' },
      set: {},
    }) as {
      run: {
        phases: Array<{ status: string }>
        status: string
      }
    }

    expect(approved.run.status).toBe('active')
    expect(approved.run.phases[0].status).toBe('completed')
    expect(approved.run.phases[1].status).toBe('active')
  })
})

describe('workspace allocation route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRun() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      {
        name: 'Architect',
        description: 'Designs systems',
        scope: 'user',
      },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const roleId = roles[0].id
    const teamResult = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const runResult = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: teamResult.team.id,
      },
      {},
    ) as { run: { id: string } }
    return {
      project,
      roleId,
      teamId: teamResult.team.id,
      runId: runResult.run.id,
    }
  }

  it('creates a workspace allocation for a participant', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      runId,
      {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      set,
    ) as {
      allocation: {
        id: string
        run_id: string
        participant_name: string
        role_id: string | null
        workspace: { type: string; name: string | null; path: string | null }
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.allocation.id).toMatch(UUID)
    expect(result.allocation.run_id).toBe(runId)
    expect(result.allocation.participant_name).toBe('agent-1')
    expect(result.allocation.role_id).toBeNull()
    expect(result.allocation.workspace).toEqual({
      type: 'project_root',
      name: null,
      path: null,
    })
  })

  it('creates a worktree allocation for a role', () => {
    const { runId, roleId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      runId,
      {
        role_id: roleId,
        workspace: {
          type: 'worktree',
          name: 'feature-x',
          path: '/workspace/.worktrees/feature-x',
        },
      },
      set,
    ) as {
      allocation: {
        role_id: string
        workspace: { type: string; name: string; path: string }
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.allocation.role_id).toBe(roleId)
    expect(result.allocation.workspace.type).toBe('worktree')
    expect(result.allocation.workspace.name).toBe('feature-x')
    expect(result.allocation.workspace.path).toBe(
      '/workspace/.worktrees/feature-x',
    )
  })

  it('rejects when neither participant nor role is provided', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      runId,
      {
        workspace: { type: 'project_root', name: null, path: null },
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'at least one of participant_name or role_id is required',
    })
  })

  it('rejects when workspace is missing', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      runId,
      { participant_name: 'agent-1' } as unknown as {
        participant_name: string
        workspace: { type: 'project_root'; name: null; path: null }
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'workspace is required' })
  })

  it('propagates non-404 errors from inventory as 400', () => {
    const deps = createProjectChatDependencies()
    const project = deps.projectInventory.createProject({
      name: 'P',
      rootPath: '/p',
    })
    const role = deps.roleInventory.createRole({
      name: 'R',
      description: 'd',
      scope: 'user',
    })
    const team = deps.teamInventory.createTeam({
      name: 'T',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    const run = deps.runInventory.createRun({
      name: 'Run',
      projectId: project.id,
      teamId: team.id,
    })

    // Mock the inventory to throw a non-404 error
    const original = deps.workspaceAllocationInventory.createAllocation.bind(
      deps.workspaceAllocationInventory,
    )
    deps.workspaceAllocationInventory.createAllocation = () => {
      throw new Error('unexpected error')
    }

    const set: { status?: number } = {}
    const result = handleCreateWorkspaceAllocation(
      run.id,
      {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      set,
      deps,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'unexpected error' })

    // Restore
    deps.workspaceAllocationInventory.createAllocation = original
  })

  it('rejects invalid workspace type', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      runId,
      {
        participant_name: 'agent-1',
        workspace: {
          type: 'invalid' as 'project_root',
          name: null,
          path: null,
        },
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'workspace type must be "project_root" or "worktree"',
    })
  })

  it('returns 404 when run does not exist on create', () => {
    const set: { status?: number } = {}

    const result = handleCreateWorkspaceAllocation(
      'nonexistent',
      {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('lists workspace allocations for a run', () => {
    const { runId } = seedRun()

    handleCreateWorkspaceAllocation(
      runId,
      {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      {},
    )
    handleCreateWorkspaceAllocation(
      runId,
      {
        participant_name: 'agent-2',
        workspace: {
          type: 'worktree',
          name: 'wt-1',
          path: '/workspace/.worktrees/wt-1',
        },
      },
      {},
    )

    const set: { status?: number } = {}
    const result = handleListWorkspaceAllocations(runId, set) as {
      allocations: Array<{ participant_name: string }>
    }

    expect(set.status).toBeUndefined()
    expect(result.allocations).toHaveLength(2)
    expect(result.allocations[0].participant_name).toBe('agent-1')
    expect(result.allocations[1].participant_name).toBe('agent-2')
  })

  it('returns 404 when listing allocations for nonexistent run', () => {
    const set: { status?: number } = {}

    const result = handleListWorkspaceAllocations('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('deletes a workspace allocation', () => {
    const { runId } = seedRun()

    const created = handleCreateWorkspaceAllocation(
      runId,
      {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      {},
    ) as { allocation: { id: string } }

    const set: { status?: number } = {}
    const result = handleDeleteWorkspaceAllocation(created.allocation.id, set)

    expect(set.status).toBeUndefined()
    expect(result).toEqual({ deleted: true })

    const listResult = handleListWorkspaceAllocations(runId, {}) as {
      allocations: unknown[]
    }
    expect(listResult.allocations).toHaveLength(0)
  })

  it('returns 404 when deleting nonexistent allocation', () => {
    const set: { status?: number } = {}

    const result = handleDeleteWorkspaceAllocation('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({
      error: 'workspace allocation "nonexistent" was not found',
    })
  })
})

describe('workspace allocation via createRouteHandlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRun() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      {
        name: 'Dev',
        description: 'Developer',
        scope: 'user',
      },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const roleId = roles[0].id
    const teamResult = handleCreateTeam(
      {
        name: 'Team A',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    const runResult = handleCreateRun(
      {
        name: 'Run 1',
        project_id: project.id,
        team_id: teamResult.team.id,
      },
      {},
    ) as { run: { id: string } }
    return { project, roleId, runId: runResult.run.id }
  }

  it('creates and lists workspace allocations via route handlers object', () => {
    const { runId, roleId } = seedRun()

    const created = routeHandlers.runs.workspaces.create({
      params: { id: runId },
      body: {
        participant_name: 'agent-1',
        role_id: roleId,
        workspace: { type: 'project_root', name: null, path: null },
      },
      set: {},
    }) as {
      allocation: { id: string; participant_name: string; role_id: string }
    }

    expect(created.allocation.id).toMatch(UUID)
    expect(created.allocation.participant_name).toBe('agent-1')
    expect(created.allocation.role_id).toBe(roleId)

    const listed = routeHandlers.runs.workspaces.list({
      params: { id: runId },
      set: {},
    }) as { allocations: Array<{ id: string }> }

    expect(listed.allocations).toHaveLength(1)
    expect(listed.allocations[0].id).toBe(created.allocation.id)
  })

  it('deletes a workspace allocation via route handlers object', () => {
    const { runId } = seedRun()

    const created = routeHandlers.runs.workspaces.create({
      params: { id: runId },
      body: {
        participant_name: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      },
      set: {},
    }) as { allocation: { id: string } }

    const deleted = routeHandlers.workspaces.delete({
      params: { id: created.allocation.id },
      set: {},
    })

    expect(deleted).toEqual({ deleted: true })
  })
})

describe('timeline route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRun(
    phases?: Array<{ name: string; approval_required?: boolean }>,
  ) {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      { name: 'Dev', description: 'Developer', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const team = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roles[0].id }],
      },
      {},
    ) as { team: { id: string } }
    const run = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: team.team.id,
        ...(phases ? { phases } : {}),
      },
      {},
    ) as { run: { id: string } }
    return { project, runId: run.run.id }
  }

  it('returns timeline events for a run', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleGetTimeline(runId, set) as {
      events: Array<{
        id: string
        run_id: string
        type: string
        timestamp: string
        data: Record<string, unknown>
      }>
    }

    expect(set.status).toBeUndefined()
    expect(result.events).toHaveLength(1)
    expect(result.events[0].type).toBe('run_created')
    expect(result.events[0].run_id).toBe(runId)
    expect(result.events[0].data).toEqual({ name: 'Sprint 1' })
  })

  it('returns 404 for unknown run', () => {
    const set: { status?: number } = {}

    const result = handleGetTimeline('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('returns timeline with phase events after advancing', () => {
    const { runId } = seedRun([{ name: 'Design' }, { name: 'Build' }])

    handleAdvanceRun(runId, { action: 'advance' }, {})

    const result = handleGetTimeline(runId, {}) as {
      events: Array<{ type: string }>
    }

    // run_created + phase_started(Design) + phase_completed(Design) + phase_started(Build)
    expect(result.events).toHaveLength(4)
    expect(result.events.map((e) => e.type)).toEqual([
      'run_created',
      'phase_started',
      'phase_completed',
      'phase_started',
    ])
  })

  it('returns timeline with approval events', () => {
    const { runId } = seedRun([
      { name: 'Design', approval_required: true },
      { name: 'Build' },
    ])

    handleAdvanceRun(runId, { action: 'advance' }, {})
    handleApproveRun(runId, { decision: 'approved', reason: 'LGTM' }, {})

    const result = handleGetTimeline(runId, {}) as {
      events: Array<{ type: string }>
    }

    expect(result.events.map((e) => e.type)).toEqual([
      'run_created',
      'phase_started',
      'approval_requested',
      'approval_granted',
      'phase_completed',
      'phase_started',
    ])
  })
})

describe('review feedback route handlers', () => {
  beforeEach(() => {
    resetState()
  })

  function seedRun() {
    const project = createProject({
      name: 'Test Project',
      root_path: '/workspace/test',
    })
    handleCreateRole(
      { name: 'Dev', description: 'Developer', scope: 'user' },
      {},
    )
    const roles = (handleListRoles({}) as { roles: { id: string }[] }).roles
    const team = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roles[0].id }],
      },
      {},
    ) as { team: { id: string } }
    const run = handleCreateRun(
      {
        name: 'Sprint 1',
        project_id: project.id,
        team_id: team.team.id,
      },
      {},
    ) as { run: { id: string } }
    return { project, runId: run.run.id }
  }

  it('adds review feedback to a run', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateReviewFeedback(
      runId,
      { run_id: runId, comment: 'Looks great!', author: 'reviewer-1' },
      set,
    ) as {
      event: {
        id: string
        run_id: string
        type: string
        timestamp: string
        data: Record<string, unknown>
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.event.type).toBe('review_feedback')
    expect(result.event.run_id).toBe(runId)
    expect(result.event.data).toEqual({
      comment: 'Looks great!',
      author: 'reviewer-1',
    })
  })

  it('returns 404 for unknown run', () => {
    const set: { status?: number } = {}

    const result = handleCreateReviewFeedback(
      'nonexistent',
      { run_id: 'nonexistent', comment: 'Hello', author: 'reviewer' },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'run "nonexistent" was not found' })
  })

  it('returns 400 when comment is missing', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateReviewFeedback(
      runId,
      { run_id: runId, comment: '', author: 'reviewer' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'comment and author are required' })
  })

  it('returns 400 when author is missing', () => {
    const { runId } = seedRun()
    const set: { status?: number } = {}

    const result = handleCreateReviewFeedback(
      runId,
      { run_id: runId, comment: 'Hello', author: '' },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({ error: 'comment and author are required' })
  })

  it('review feedback appears in the timeline', () => {
    const { runId } = seedRun()

    handleCreateReviewFeedback(
      runId,
      { run_id: runId, comment: 'Great work!', author: 'reviewer-1' },
      {},
    )

    const result = handleGetTimeline(runId, {}) as {
      events: Array<{ type: string; data: Record<string, unknown> }>
    }

    // run_created + review_feedback
    expect(result.events).toHaveLength(2)
    expect(result.events[1].type).toBe('review_feedback')
    expect(result.events[1].data).toEqual({
      comment: 'Great work!',
      author: 'reviewer-1',
    })
  })

  it('exposes timeline and review routes via route handlers object', () => {
    const { runId } = seedRun()

    // Get timeline
    const timeline = routeHandlers.runs.timeline({
      params: { id: runId },
      set: {},
    }) as {
      events: Array<{ type: string }>
    }
    expect(timeline.events).toHaveLength(1)
    expect(timeline.events[0].type).toBe('run_created')

    // Add review
    const review = routeHandlers.runs.reviews.create({
      params: { id: runId },
      body: { run_id: runId, comment: 'Noted', author: 'human' },
      set: {},
    }) as {
      event: { type: string }
    }
    expect(review.event.type).toBe('review_feedback')

    // Verify review in timeline
    const updatedTimeline = routeHandlers.runs.timeline({
      params: { id: runId },
      set: {},
    }) as {
      events: Array<{ type: string }>
    }
    expect(updatedTimeline.events).toHaveLength(2)
  })
})

describe('playbook route handlers', () => {
  it('lists all playbooks', () => {
    const result = handleListPlaybooks() as {
      playbooks: Array<{
        id: string
        name: string
        description: string
        phases: Array<{
          name: string
          description: string
          approval_required: boolean
        }>
      }>
    }

    expect(result.playbooks).toHaveLength(1)
    expect(result.playbooks[0].id).toBe('feature-delivery')
    expect(result.playbooks[0].name).toBe('Feature Delivery')
    expect(result.playbooks[0].phases).toHaveLength(3)
  })

  it('gets a playbook by id', () => {
    const set: { status?: number } = {}

    const result = handleGetPlaybook('feature-delivery', set) as {
      playbook: {
        id: string
        name: string
        phases: Array<{ name: string }>
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.playbook.id).toBe('feature-delivery')
    expect(result.playbook.name).toBe('Feature Delivery')
    expect(result.playbook.phases).toHaveLength(3)
  })

  it('returns 404 for unknown playbook id', () => {
    const set: { status?: number } = {}

    const result = handleGetPlaybook('nonexistent', set)

    expect(set.status).toBe(404)
    expect(result).toEqual({ error: 'playbook "nonexistent" was not found' })
  })

  it('exposes playbook Elysia route adapters that delegate to handlers', () => {
    const listed = routeHandlers.playbooks.list() as {
      playbooks: Array<{ id: string }>
    }
    expect(listed.playbooks).toHaveLength(1)

    const got = routeHandlers.playbooks.get({
      params: { id: 'feature-delivery' },
      set: {},
    }) as { playbook: { id: string } }
    expect(got.playbook.id).toBe('feature-delivery')

    const notFound = routeHandlers.playbooks.get({
      params: { id: 'nope' },
      set: { status: undefined },
    }) as { error: string }
    expect(notFound.error).toContain('was not found')
  })
})

describe('run creation with playbook_id via route handler', () => {
  beforeEach(() => {
    resetState()
  })

  function seedProjectTeamAndRole() {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })
    const roleResult = handleCreateRole(
      {
        name: 'Architect',
        description: 'Plans the system',
        scope: 'user',
      },
      {},
    ) as { role: { id: string } }
    const roleId = roleResult.role.id
    const teamResult = handleCreateTeam(
      {
        name: 'Alpha Team',
        project_id: project.id,
        members: [{ role_id: roleId }],
      },
      {},
    ) as { team: { id: string } }
    return { project, roleId, teamId: teamResult.team.id }
  }

  it('creates a run with playbook_id and materializes phases', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      {
        name: 'Feature Sprint',
        project_id: project.id,
        team_id: teamId,
        playbook_id: 'feature-delivery',
      },
      set,
    ) as {
      run: {
        id: string
        name: string
        phases: Array<{
          id: string
          name: string
          status: string
          approval_required: boolean
        }>
        current_phase_id: string | null
      }
    }

    expect(set.status).toBeUndefined()
    expect(result.run.name).toBe('Feature Sprint')
    expect(result.run.phases).toHaveLength(3)
    expect(result.run.phases[0].name).toBe('Specification & Refinement')
    expect(result.run.phases[0].status).toBe('active')
    expect(result.run.phases[0].approval_required).toBe(true)
    expect(result.run.phases[1].name).toBe('Implementation & Testing')
    expect(result.run.phases[1].approval_required).toBe(false)
    expect(result.run.phases[2].name).toBe('Review & Completion')
    expect(result.run.phases[2].approval_required).toBe(true)
    expect(result.run.current_phase_id).toBe(result.run.phases[0].id)
  })

  it('rejects run creation when both phases and playbook_id are provided', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      {
        name: 'Conflict Run',
        project_id: project.id,
        team_id: teamId,
        playbook_id: 'feature-delivery',
        phases: [{ name: 'Manual Phase' }],
      },
      set,
    )

    expect(set.status).toBe(400)
    expect(result).toEqual({
      error: 'cannot specify both phases and playbook_id',
    })
  })

  it('rejects run creation when playbook_id does not exist', () => {
    const { project, teamId } = seedProjectTeamAndRole()
    const set: { status?: number } = {}

    const result = handleCreateRun(
      {
        name: 'Bad Playbook',
        project_id: project.id,
        team_id: teamId,
        playbook_id: 'nonexistent' as 'feature-delivery',
      },
      set,
    )

    expect(set.status).toBe(404)
    expect(result).toEqual({
      error: 'playbook "nonexistent" was not found',
    })
  })
})
