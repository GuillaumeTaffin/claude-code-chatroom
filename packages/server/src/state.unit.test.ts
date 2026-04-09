import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEATURE_DELIVERY_PLAYBOOK,
  InMemoryProjectInventory,
  InMemoryRoleInventory,
  InMemoryRunInventory,
  InMemoryTeamInventory,
  InMemoryTimelineInventory,
  InMemoryWorkspaceAllocationInventory,
  Room,
  createProject,
  createProjectChatDependencies,
  getOrCreateRoom,
  getPlaybookById,
  getPlaybooks,
  getProject,
  getProjectRoom,
  getRoom,
  getRunRoom,
  listProjects,
  mapAgentConfigRecordToDomain,
  mapAgentConfigToDto,
  mapAgentConfigToRecord,
  mapApprovalRecordToDomain,
  mapApprovalToDto,
  mapCreateWorkspaceAllocationDtoToDomain,
  mapPhaseRecordToDomain,
  mapPhaseToDto,
  mapProjectRecordToDomain,
  mapProjectToDto,
  mapRoleRecordToDomain,
  mapRoleToDto,
  mapRunRecordToDomain,
  mapRunToDto,
  mapTeamRecordToDomain,
  mapTeamToDto,
  mapTimelineEventToDto,
  mapWorkspaceAllocationRecordToDomain,
  mapWorkspaceAllocationToDto,
  mapWorkspaceToDto,
  resetState,
} from './state.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createSocket() {
  return {
    send: vi.fn(),
  }
}

describe('Room', () => {
  beforeEach(() => {
    resetState()
  })

  it('adds members once and exposes them with the channel id', () => {
    const room = new Room('general')

    expect(room.addMember({ name: 'alpha', description: 'first agent' })).toBe(
      true,
    )
    expect(
      room.addMember({ name: 'alpha', description: 'duplicate agent' }),
    ).toBe(false)
    expect(room.getMembers()).toEqual([
      {
        name: 'alpha',
        description: 'first agent',
        channel_id: 'general',
      },
    ])
  })

  it('registers websockets for known members and removes them on disconnect', () => {
    const room = new Room('general')
    const socket = createSocket()

    room.addMember({ name: 'beta', description: 'connected agent' })

    expect(room.registerWebSocket(socket, 'beta')).toBe(true)
    expect(room.hasWebSocket('beta')).toBe(true)
    expect(room.getNameByWebSocket(socket)).toBe('beta')
    expect(room.unregisterWebSocket(socket)).toBe('beta')
    expect(room.hasWebSocket('beta')).toBe(false)
    expect(room.getMember('beta')).toBeUndefined()
  })

  it('broadcasts to every connected socket except the excluded member', () => {
    const room = new Room('general')
    const alpha = createSocket()
    const beta = createSocket()

    room.addMember({ name: 'alpha', description: 'sender' })
    room.addMember({ name: 'beta', description: 'receiver' })
    room.registerWebSocket(alpha, 'alpha')
    room.registerWebSocket(beta, 'beta')

    room.broadcast('hello room', 'alpha')

    expect(alpha.send).not.toHaveBeenCalled()
    expect(beta.send).toHaveBeenCalledWith('hello room')
  })

  it('removes members and associated sockets explicitly', () => {
    const room = new Room('general')
    const socket = createSocket()

    room.addMember({ name: 'gamma', description: 'member to remove' })
    room.registerWebSocket(socket, 'gamma')

    expect(room.removeMember('gamma')).toEqual({
      name: 'gamma',
      description: 'member to remove',
    })
    expect(room.getMember('gamma')).toBeUndefined()
    expect(room.getNameByWebSocket(socket)).toBeUndefined()
  })

  it('returns undefined when removing an unknown member', () => {
    const room = new Room('general')

    expect(room.removeMember('missing')).toBeUndefined()
  })

  it('removes members without requiring an attached websocket', () => {
    const room = new Room('general')

    room.addMember({ name: 'epsilon', description: 'offline member' })

    expect(room.removeMember('epsilon')).toEqual({
      name: 'epsilon',
      description: 'offline member',
    })
  })

  it('rejects websocket registration for unknown or duplicate members', () => {
    const room = new Room('general')
    const alpha = createSocket()
    const beta = createSocket()

    expect(room.registerWebSocket(alpha, 'missing')).toBe(false)

    room.addMember({ name: 'delta', description: 'known member' })
    expect(room.registerWebSocket(alpha, 'delta')).toBe(true)
    expect(room.registerWebSocket(beta, 'delta')).toBe(false)
  })

  it('returns undefined when unregistering an unknown websocket', () => {
    const room = new Room('general')

    expect(room.unregisterWebSocket(createSocket())).toBeUndefined()
  })

  it('broadcastAll sends to every socket and ignores stale failures', () => {
    const room = new Room('general')
    const healthy = createSocket()
    const broken = {
      send: vi.fn(() => {
        throw new Error('socket closed')
      }),
    }

    room.addMember({ name: 'alpha', description: 'healthy' })
    room.addMember({ name: 'beta', description: 'broken' })
    room.registerWebSocket(healthy, 'alpha')
    room.registerWebSocket(broken, 'beta')

    expect(() => room.broadcastAll('announcement')).not.toThrow()
    expect(healthy.send).toHaveBeenCalledWith('announcement')
    expect(broken.send).toHaveBeenCalledWith('announcement')
  })

  it('stores runtime identity alongside member and returns it in getMembers', () => {
    const room = new Room('general')

    const runtime = {
      runtime_id: 'claude',
      runtime_version: null,
      capabilities: {
        can_stream_events: true,
        can_use_tools: true,
        can_manage_files: true,
        can_execute_commands: true,
      },
    }

    room.addMember({ name: 'alpha', description: 'claude agent' }, runtime)
    room.addMember({ name: 'beta', description: 'human user' })

    const members = room.getMembers()
    expect(members).toEqual([
      {
        name: 'alpha',
        description: 'claude agent',
        channel_id: 'general',
        runtime,
      },
      {
        name: 'beta',
        description: 'human user',
        channel_id: 'general',
      },
    ])
  })

  it('removes runtime identity when a member is removed', () => {
    const room = new Room('general')

    const runtime = {
      runtime_id: 'codex',
      runtime_version: null,
      capabilities: {
        can_stream_events: false,
        can_use_tools: true,
        can_manage_files: true,
        can_execute_commands: true,
      },
    }

    room.addMember({ name: 'agent', description: 'codex agent' }, runtime)
    room.removeMember('agent')

    expect(room.getMembers()).toEqual([])
  })

  it('reuses and exposes rooms from the registry', () => {
    const room = getOrCreateRoom('ops')

    expect(getOrCreateRoom('ops')).toBe(room)
    expect(getRoom('ops')).toBe(room)
    expect(getRoom('missing')).toBeUndefined()
  })
})

describe('project registry', () => {
  beforeEach(() => {
    resetState()
  })

  it('creates projects with UUID-backed identifiers', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })

    expect(project.id).toMatch(UUID)
    expect(project.channel_id).toMatch(UUID)
    expect(project.name).toBe('Chatroom')
    expect(project.root_path).toBe('/workspace/chatroom')
  })

  it('lists created projects and exposes each project room', () => {
    const project = createProject({
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
    })

    expect(listProjects()).toEqual([project])
    expect(getProject(project.id)).toEqual(project)
    expect(getProjectRoom(project.id)).toBe(getOrCreateRoom(project.channel_id))
  })

  it('keeps chat membership isolated per project room', () => {
    const alphaProject = createProject({
      name: 'Alpha',
      root_path: '/workspace/alpha',
    })
    const betaProject = createProject({
      name: 'Beta',
      root_path: '/workspace/beta',
    })

    getProjectRoom(alphaProject.id)?.addMember({
      name: 'agent-a',
      description: 'alpha member',
    })
    getProjectRoom(betaProject.id)?.addMember({
      name: 'agent-b',
      description: 'beta member',
    })

    expect(getProjectRoom(alphaProject.id)?.getMembers()).toEqual([
      {
        name: 'agent-a',
        description: 'alpha member',
        channel_id: alphaProject.channel_id,
      },
    ])
    expect(getProjectRoom(betaProject.id)?.getMembers()).toEqual([
      {
        name: 'agent-b',
        description: 'beta member',
        channel_id: betaProject.channel_id,
      },
    ])
  })

  it('maps project storage records to domain objects and DTOs explicitly', () => {
    const inventory = new InMemoryProjectInventory()
    const project = inventory.createProject({
      name: 'Chatroom',
      rootPath: '/workspace/chatroom',
    })

    expect(project.id).toMatch(UUID)
    expect(project.channelId).toMatch(UUID)
    expect(project.name).toBe('Chatroom')
    expect(project.rootPath).toBe('/workspace/chatroom')

    expect(
      mapProjectRecordToDomain({
        id: 'project-9',
        name: 'Alpha',
        root_path: '/workspace/alpha',
        channel_id: 'channel-9',
      }),
    ).toEqual({
      id: 'project-9',
      name: 'Alpha',
      rootPath: '/workspace/alpha',
      channelId: 'channel-9',
    })
    expect(mapProjectToDto(project)).toEqual({
      id: project.id,
      name: 'Chatroom',
      root_path: '/workspace/chatroom',
      channel_id: project.channelId,
    })
  })

  it('returns undefined for unknown project ids', () => {
    expect(getProject('nonexistent')).toBeUndefined()
  })

  it('generates distinct UUIDs for each project', () => {
    const a = createProject({ name: 'A', root_path: '/a' })
    const b = createProject({ name: 'B', root_path: '/b' })

    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(UUID)
    expect(b.id).toMatch(UUID)
  })

  it('supports isolated injected project inventories', () => {
    const alphaDependencies = createProjectChatDependencies()
    const betaDependencies = createProjectChatDependencies()

    const alphaProject = createProject(
      {
        name: 'Alpha',
        root_path: '/workspace/alpha',
      },
      alphaDependencies,
    )

    expect(listProjects(alphaDependencies)).toEqual([alphaProject])
    expect(listProjects(betaDependencies)).toEqual([])
    expect(getProjectRoom(alphaProject.id, betaDependencies)).toBeUndefined()
  })
})

describe('role inventory', () => {
  let inventory: InMemoryRoleInventory

  beforeEach(() => {
    inventory = new InMemoryRoleInventory()
  })

  it('creates user-scoped roles with UUID-backed identifiers', () => {
    const role = inventory.createRole({
      name: 'Architect',
      description: 'Designs system architecture',
      scope: 'user',
    })

    expect(role.id).toMatch(UUID)
    expect(role.name).toBe('Architect')
    expect(role.description).toBe('Designs system architecture')
    expect(role.scope).toBe('user')
    expect(role.projectId).toBeNull()
  })

  it('creates project-scoped roles with a project reference', () => {
    const role = inventory.createRole({
      name: 'Lead Dev',
      description: 'Leads development',
      scope: 'project',
      projectId: 'project-123',
    })

    expect(role.id).toMatch(UUID)
    expect(role.name).toBe('Lead Dev')
    expect(role.scope).toBe('project')
    expect(role.projectId).toBe('project-123')
  })

  it('defaults project_id to null for project-scoped roles without a projectId', () => {
    const role = inventory.createRole({
      name: 'Orphaned',
      description: 'No project reference',
      scope: 'project',
    })

    expect(role.scope).toBe('project')
    expect(role.projectId).toBeNull()
  })

  it('generates distinct UUIDs for each role', () => {
    const a = inventory.createRole({
      name: 'A',
      description: 'Role A',
      scope: 'user',
    })
    const b = inventory.createRole({
      name: 'B',
      description: 'Role B',
      scope: 'user',
    })

    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(UUID)
    expect(b.id).toMatch(UUID)
  })

  it('retrieves a role by id', () => {
    const created = inventory.createRole({
      name: 'Tester',
      description: 'Runs tests',
      scope: 'user',
    })

    expect(inventory.getRoleById(created.id)).toEqual(created)
  })

  it('returns undefined for unknown role ids', () => {
    expect(inventory.getRoleById('nonexistent')).toBeUndefined()
  })

  it('lists all roles', () => {
    const a = inventory.createRole({
      name: 'A',
      description: 'Role A',
      scope: 'user',
    })
    const b = inventory.createRole({
      name: 'B',
      description: 'Role B',
      scope: 'project',
      projectId: 'p1',
    })

    expect(inventory.listRoles()).toEqual([a, b])
  })

  it('filters roles by scope', () => {
    inventory.createRole({
      name: 'User Role',
      description: 'Global',
      scope: 'user',
    })
    const projectRole = inventory.createRole({
      name: 'Project Role',
      description: 'Scoped',
      scope: 'project',
      projectId: 'p1',
    })

    expect(inventory.listRoles({ scope: 'project' })).toEqual([projectRole])
  })

  it('filters roles by project_id', () => {
    inventory.createRole({
      name: 'Role A',
      description: 'Project 1',
      scope: 'project',
      projectId: 'p1',
    })
    const roleB = inventory.createRole({
      name: 'Role B',
      description: 'Project 2',
      scope: 'project',
      projectId: 'p2',
    })

    expect(inventory.listRoles({ projectId: 'p2' })).toEqual([roleB])
  })

  it('filters roles by both scope and project_id', () => {
    const userRole = inventory.createRole({
      name: 'User Role',
      description: 'Global',
      scope: 'user',
    })
    inventory.createRole({
      name: 'Project Role',
      description: 'Scoped',
      scope: 'project',
      projectId: 'p1',
    })

    expect(inventory.listRoles({ scope: 'user', projectId: null })).toEqual([
      userRole,
    ])
  })

  it('updates a role name and description', () => {
    const created = inventory.createRole({
      name: 'Original',
      description: 'Original description',
      scope: 'user',
    })

    const updated = inventory.updateRole(created.id, {
      name: 'Updated',
      description: 'Updated description',
    })

    expect(updated).toBeDefined()
    expect(updated!.id).toBe(created.id)
    expect(updated!.name).toBe('Updated')
    expect(updated!.description).toBe('Updated description')
    expect(updated!.scope).toBe('user')
    expect(updated!.projectId).toBeNull()
  })

  it('partially updates a role name only', () => {
    const created = inventory.createRole({
      name: 'Original',
      description: 'Original description',
      scope: 'user',
    })

    const updated = inventory.updateRole(created.id, { name: 'New Name' })

    expect(updated!.name).toBe('New Name')
    expect(updated!.description).toBe('Original description')
  })

  it('partially updates a role description only', () => {
    const created = inventory.createRole({
      name: 'Original',
      description: 'Original description',
      scope: 'user',
    })

    const updated = inventory.updateRole(created.id, {
      description: 'New description',
    })

    expect(updated!.name).toBe('Original')
    expect(updated!.description).toBe('New description')
  })

  it('returns undefined when updating a nonexistent role', () => {
    expect(
      inventory.updateRole('nonexistent', { name: 'Whatever' }),
    ).toBeUndefined()
  })

  it('deletes a role', () => {
    const created = inventory.createRole({
      name: 'To Delete',
      description: 'Temporary',
      scope: 'user',
    })

    expect(inventory.deleteRole(created.id)).toBe(true)
    expect(inventory.getRoleById(created.id)).toBeUndefined()
    expect(inventory.listRoles()).toEqual([])
  })

  it('returns false when deleting a nonexistent role', () => {
    expect(inventory.deleteRole('nonexistent')).toBe(false)
  })

  it('clears all roles', () => {
    inventory.createRole({
      name: 'A',
      description: 'Role A',
      scope: 'user',
    })
    inventory.createRole({
      name: 'B',
      description: 'Role B',
      scope: 'user',
    })

    inventory.clear()

    expect(inventory.listRoles()).toEqual([])
  })

  it('maps role storage records to domain objects and DTOs explicitly', () => {
    const domain = mapRoleRecordToDomain({
      id: 'role-1',
      name: 'Architect',
      description: 'Designs systems',
      scope: 'project',
      project_id: 'proj-1',
      agent_config: null,
    })

    expect(domain).toEqual({
      id: 'role-1',
      name: 'Architect',
      description: 'Designs systems',
      scope: 'project',
      projectId: 'proj-1',
      agentConfig: null,
    })

    expect(mapRoleToDto(domain)).toEqual({
      id: 'role-1',
      name: 'Architect',
      description: 'Designs systems',
      scope: 'project',
      project_id: 'proj-1',
      agent_config: null,
    })
  })

  it('maps user-scoped roles with null project_id', () => {
    const domain = mapRoleRecordToDomain({
      id: 'role-2',
      name: 'Reviewer',
      description: 'Reviews code',
      scope: 'user',
      project_id: null,
      agent_config: null,
    })

    expect(domain.projectId).toBeNull()
    expect(domain.agentConfig).toBeNull()
    expect(mapRoleToDto(domain).project_id).toBeNull()
    expect(mapRoleToDto(domain).agent_config).toBeNull()
  })

  it('maps role with agent_config', () => {
    const domain = mapRoleRecordToDomain({
      id: 'role-3',
      name: 'Claude Agent',
      description: 'AI agent',
      scope: 'user',
      project_id: null,
      agent_config: {
        runtime: 'claude',
        system_prompt: 'You are a helpful assistant',
        model: 'opus',
      },
    })

    expect(domain.agentConfig).toEqual({
      runtime: 'claude',
      systemPrompt: 'You are a helpful assistant',
      model: 'opus',
    })

    expect(mapRoleToDto(domain).agent_config).toEqual({
      runtime: 'claude',
      system_prompt: 'You are a helpful assistant',
      model: 'opus',
    })
  })

  it('creates a role with agent_config', () => {
    const role = inventory.createRole({
      name: 'Claude Agent',
      description: 'AI agent',
      scope: 'user',
      agentConfig: {
        runtime: 'claude',
        systemPrompt: 'You are a helpful assistant',
        model: 'opus',
      },
    })

    expect(role.agentConfig).toEqual({
      runtime: 'claude',
      systemPrompt: 'You are a helpful assistant',
      model: 'opus',
    })
  })

  it('creates a role without agent_config (defaults to null)', () => {
    const role = inventory.createRole({
      name: 'Human',
      description: 'A human role',
      scope: 'user',
    })

    expect(role.agentConfig).toBeNull()
  })

  it('updates a role agent_config (set)', () => {
    const created = inventory.createRole({
      name: 'Human',
      description: 'A human role',
      scope: 'user',
    })

    const updated = inventory.updateRole(created.id, {
      agentConfig: {
        runtime: 'copilot',
        systemPrompt: null,
        model: null,
      },
    })

    expect(updated!.agentConfig).toEqual({
      runtime: 'copilot',
      systemPrompt: null,
      model: null,
    })
  })

  it('updates a role agent_config (clear)', () => {
    const created = inventory.createRole({
      name: 'Agent',
      description: 'An agent',
      scope: 'user',
      agentConfig: {
        runtime: 'claude',
        systemPrompt: null,
        model: null,
      },
    })

    const updated = inventory.updateRole(created.id, { agentConfig: null })

    expect(updated!.agentConfig).toBeNull()
  })

  it('leaves agent_config unchanged when agentConfig is undefined in update', () => {
    const created = inventory.createRole({
      name: 'Agent',
      description: 'An agent',
      scope: 'user',
      agentConfig: {
        runtime: 'claude',
        systemPrompt: 'prompt',
        model: 'opus',
      },
    })

    const updated = inventory.updateRole(created.id, { name: 'Renamed Agent' })

    expect(updated!.agentConfig).toEqual({
      runtime: 'claude',
      systemPrompt: 'prompt',
      model: 'opus',
    })
  })
})

describe('team inventory', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
  })

  function seedProject(name = 'Test Project') {
    return projectInventory.createProject({
      name,
      rootPath: `/workspace/${name.toLowerCase().replace(/ /g, '-')}`,
    })
  }

  function seedRole(
    name: string,
    scope: 'user' | 'project' = 'user',
    projectId?: string,
  ) {
    return roleInventory.createRole({
      name,
      description: `${name} description`,
      scope,
      projectId,
    })
  }

  it('creates a team with UUID-backed identifier', () => {
    const project = seedProject()
    const role = seedRole('Architect')

    const team = teamInventory.createTeam({
      name: 'Alpha Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    expect(team.id).toMatch(UUID)
    expect(team.name).toBe('Alpha Team')
    expect(team.projectId).toBe(project.id)
    expect(team.members).toEqual([{ roleId: role.id }])
  })

  it('creates a team with no members', () => {
    const project = seedProject()

    const team = teamInventory.createTeam({
      name: 'Empty Team',
      projectId: project.id,
      members: [],
    })

    expect(team.members).toEqual([])
  })

  it('creates a team with multiple members', () => {
    const project = seedProject()
    const roleA = seedRole('Architect')
    const roleB = seedRole('Tester')

    const team = teamInventory.createTeam({
      name: 'Full Team',
      projectId: project.id,
      members: [{ roleId: roleA.id }, { roleId: roleB.id }],
    })

    expect(team.members).toEqual([{ roleId: roleA.id }, { roleId: roleB.id }])
  })

  it('rejects team creation when project does not exist', () => {
    const role = seedRole('Architect')

    expect(() =>
      teamInventory.createTeam({
        name: 'Bad Team',
        projectId: 'nonexistent',
        members: [{ roleId: role.id }],
      }),
    ).toThrow('project "nonexistent" was not found')
  })

  it('rejects team creation when a role does not exist', () => {
    const project = seedProject()

    expect(() =>
      teamInventory.createTeam({
        name: 'Bad Team',
        projectId: project.id,
        members: [{ roleId: 'nonexistent' }],
      }),
    ).toThrow('role "nonexistent" was not found')
  })

  it('rejects team creation when a role is not visible to the project', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const roleB = seedRole('B-only Role', 'project', projectB.id)

    expect(() =>
      teamInventory.createTeam({
        name: 'Cross Team',
        projectId: projectA.id,
        members: [{ roleId: roleB.id }],
      }),
    ).toThrow(`role "${roleB.id}" is not visible to project "${projectA.id}"`)
  })

  it('accepts user-scoped roles for any project', () => {
    const project = seedProject()
    const userRole = seedRole('Global Role', 'user')

    const team = teamInventory.createTeam({
      name: 'User Role Team',
      projectId: project.id,
      members: [{ roleId: userRole.id }],
    })

    expect(team.members).toEqual([{ roleId: userRole.id }])
  })

  it('accepts project-scoped roles that belong to the target project', () => {
    const project = seedProject()
    const projectRole = seedRole('Project Role', 'project', project.id)

    const team = teamInventory.createTeam({
      name: 'Project Role Team',
      projectId: project.id,
      members: [{ roleId: projectRole.id }],
    })

    expect(team.members).toEqual([{ roleId: projectRole.id }])
  })

  it('retrieves a team by id', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const created = teamInventory.createTeam({
      name: 'Alpha',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    expect(teamInventory.getTeamById(created.id)).toEqual(created)
  })

  it('returns undefined for unknown team ids', () => {
    expect(teamInventory.getTeamById('nonexistent')).toBeUndefined()
  })

  it('lists teams filtered by project_id', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const role = seedRole('Role')

    const teamA = teamInventory.createTeam({
      name: 'Team A',
      projectId: projectA.id,
      members: [{ roleId: role.id }],
    })
    teamInventory.createTeam({
      name: 'Team B',
      projectId: projectB.id,
      members: [{ roleId: role.id }],
    })

    expect(teamInventory.listTeams({ projectId: projectA.id })).toEqual([teamA])
  })

  it('lists all teams when no filter is provided', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const role = seedRole('Role')

    const teamA = teamInventory.createTeam({
      name: 'Team A',
      projectId: projectA.id,
      members: [{ roleId: role.id }],
    })
    const teamB = teamInventory.createTeam({
      name: 'Team B',
      projectId: projectB.id,
      members: [{ roleId: role.id }],
    })

    expect(teamInventory.listTeams()).toEqual([teamA, teamB])
  })

  it('supports multiple teams per project', () => {
    const project = seedProject()
    const roleA = seedRole('A')
    const roleB = seedRole('B')

    const team1 = teamInventory.createTeam({
      name: 'Team 1',
      projectId: project.id,
      members: [{ roleId: roleA.id }],
    })
    const team2 = teamInventory.createTeam({
      name: 'Team 2',
      projectId: project.id,
      members: [{ roleId: roleB.id }],
    })

    const teams = teamInventory.listTeams({ projectId: project.id })
    expect(teams).toEqual([team1, team2])
  })

  it('updates a team name', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const created = teamInventory.createTeam({
      name: 'Original',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    const updated = teamInventory.updateTeam(created.id, {
      name: 'Renamed',
    })

    expect(updated).toBeDefined()
    expect(updated!.name).toBe('Renamed')
    expect(updated!.members).toEqual([{ roleId: role.id }])
  })

  it('updates team members', () => {
    const project = seedProject()
    const roleA = seedRole('A')
    const roleB = seedRole('B')
    const created = teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: roleA.id }],
    })

    const updated = teamInventory.updateTeam(created.id, {
      members: [{ roleId: roleB.id }],
    })

    expect(updated).toBeDefined()
    expect(updated!.members).toEqual([{ roleId: roleB.id }])
  })

  it('updates both name and members', () => {
    const project = seedProject()
    const roleA = seedRole('A')
    const roleB = seedRole('B')
    const created = teamInventory.createTeam({
      name: 'Original',
      projectId: project.id,
      members: [{ roleId: roleA.id }],
    })

    const updated = teamInventory.updateTeam(created.id, {
      name: 'Updated',
      members: [{ roleId: roleB.id }],
    })

    expect(updated!.name).toBe('Updated')
    expect(updated!.members).toEqual([{ roleId: roleB.id }])
  })

  it('rejects update when a role does not exist', () => {
    const project = seedProject()
    const role = seedRole('A')
    const created = teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    expect(() =>
      teamInventory.updateTeam(created.id, {
        members: [{ roleId: 'nonexistent' }],
      }),
    ).toThrow('role "nonexistent" was not found')
  })

  it('rejects update when a role is not visible to the project', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const roleA = seedRole('A')
    const roleB = seedRole('B-only', 'project', projectB.id)
    const created = teamInventory.createTeam({
      name: 'Team',
      projectId: projectA.id,
      members: [{ roleId: roleA.id }],
    })

    expect(() =>
      teamInventory.updateTeam(created.id, {
        members: [{ roleId: roleB.id }],
      }),
    ).toThrow(`role "${roleB.id}" is not visible to project "${projectA.id}"`)
  })

  it('returns undefined when updating a nonexistent team', () => {
    expect(
      teamInventory.updateTeam('nonexistent', { name: 'Whatever' }),
    ).toBeUndefined()
  })

  it('deletes a team', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const created = teamInventory.createTeam({
      name: 'Doomed',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    expect(teamInventory.deleteTeam(created.id)).toBe(true)
    expect(teamInventory.getTeamById(created.id)).toBeUndefined()
    expect(teamInventory.listTeams()).toEqual([])
  })

  it('returns false when deleting a nonexistent team', () => {
    expect(teamInventory.deleteTeam('nonexistent')).toBe(false)
  })

  it('clears all teams', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    teamInventory.createTeam({
      name: 'Team 1',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    teamInventory.createTeam({
      name: 'Team 2',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    teamInventory.clear()

    expect(teamInventory.listTeams()).toEqual([])
  })

  it('generates distinct UUIDs for each team', () => {
    const project = seedProject()

    const a = teamInventory.createTeam({
      name: 'A',
      projectId: project.id,
      members: [],
    })
    const b = teamInventory.createTeam({
      name: 'B',
      projectId: project.id,
      members: [],
    })

    expect(a.id).not.toBe(b.id)
    expect(a.id).toMatch(UUID)
    expect(b.id).toMatch(UUID)
  })

  it('maps team storage records to domain objects and DTOs explicitly', () => {
    const domain = mapTeamRecordToDomain({
      id: 'team-1',
      name: 'Alpha Team',
      project_id: 'proj-1',
      members: [{ role_id: 'role-1' }, { role_id: 'role-2' }],
    })

    expect(domain).toEqual({
      id: 'team-1',
      name: 'Alpha Team',
      projectId: 'proj-1',
      members: [{ roleId: 'role-1' }, { roleId: 'role-2' }],
    })

    expect(mapTeamToDto(domain)).toEqual({
      id: 'team-1',
      name: 'Alpha Team',
      project_id: 'proj-1',
      members: [{ role_id: 'role-1' }, { role_id: 'role-2' }],
    })
  })

  it('maps team with empty members', () => {
    const domain = mapTeamRecordToDomain({
      id: 'team-2',
      name: 'Empty Team',
      project_id: 'proj-2',
      members: [],
    })

    expect(domain.members).toEqual([])
    expect(mapTeamToDto(domain).members).toEqual([])
  })

  it('resets team state alongside other dependencies', () => {
    const deps = createProjectChatDependencies()
    const project = deps.projectInventory.createProject({
      name: 'Test',
      rootPath: '/test',
    })
    const role = deps.roleInventory.createRole({
      name: 'R',
      description: 'R',
      scope: 'user',
    })
    deps.teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })

    resetState(deps)

    expect(deps.teamInventory.listTeams()).toEqual([])
  })
})

describe('run inventory', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory
  let runInventory: InMemoryRunInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
    runInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
      undefined,
      roleInventory,
    )
  })

  function seedProject(name = 'Test Project') {
    return projectInventory.createProject({
      name,
      rootPath: `/workspace/${name.toLowerCase().replace(/ /g, '-')}`,
    })
  }

  function seedRole(name: string) {
    return roleInventory.createRole({
      name,
      description: `${name} description`,
      scope: 'user',
    })
  }

  function seedTeam(projectId: string, roleIds: string[], name = 'Alpha Team') {
    return teamInventory.createTeam({
      name,
      projectId,
      members: roleIds.map((id) => ({ roleId: id })),
    })
  }

  it('creates a run with UUID-backed identifier and channel', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    expect(run.id).toMatch(UUID)
    expect(run.channelId).toMatch(UUID)
    expect(run.name).toBe('Sprint 1')
    expect(run.projectId).toBe(project.id)
    expect(run.status).toBe('active')
    expect(run.createdAt).toBeDefined()
    expect(run.teamSnapshot).toEqual({
      teamId: team.id,
      teamName: 'Alpha Team',
      members: [
        {
          roleId: role.id,
          roleName: 'Architect',
          roleDescription: 'Architect description',
          agentConfig: null,
        },
      ],
    })
  })

  it('generates distinct UUIDs for each run and channel', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const a = runInventory.createRun({
      name: 'Run A',
      projectId: project.id,
      teamId: team.id,
    })
    const b = runInventory.createRun({
      name: 'Run B',
      projectId: project.id,
      teamId: team.id,
    })

    expect(a.id).not.toBe(b.id)
    expect(a.channelId).not.toBe(b.channelId)
    expect(a.id).toMatch(UUID)
    expect(b.id).toMatch(UUID)
  })

  it('snapshots the team at creation time', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    // Mutate the team after the run is created
    const role2 = seedRole('Tester')
    teamInventory.updateTeam(team.id, {
      name: 'Renamed Team',
      members: [{ roleId: role2.id }],
    })

    // The run's snapshot should remain unchanged
    expect(run.teamSnapshot.teamName).toBe('Alpha Team')
    expect(run.teamSnapshot.members).toEqual([
      {
        roleId: role.id,
        roleName: 'Architect',
        roleDescription: 'Architect description',
        agentConfig: null,
      },
    ])
  })

  it('rejects run creation when project does not exist', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    expect(() =>
      runInventory.createRun({
        name: 'Bad Run',
        projectId: 'nonexistent',
        teamId: team.id,
      }),
    ).toThrow('project "nonexistent" was not found')
  })

  it('rejects run creation when team does not exist', () => {
    const project = seedProject()

    expect(() =>
      runInventory.createRun({
        name: 'Bad Run',
        projectId: project.id,
        teamId: 'nonexistent',
      }),
    ).toThrow('team "nonexistent" was not found')
  })

  it('rejects run creation when team does not belong to project', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const role = seedRole('Architect')
    const teamB = seedTeam(projectB.id, [role.id])

    expect(() =>
      runInventory.createRun({
        name: 'Cross Run',
        projectId: projectA.id,
        teamId: teamB.id,
      }),
    ).toThrow(`team "${teamB.id}" does not belong to project "${projectA.id}"`)
  })

  it('retrieves a run by id', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])
    const created = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    expect(runInventory.getRunById(created.id)).toEqual(created)
  })

  it('returns undefined for unknown run ids', () => {
    expect(runInventory.getRunById('nonexistent')).toBeUndefined()
  })

  it('lists runs filtered by project_id', () => {
    const projectA = seedProject('Project A')
    const projectB = seedProject('Project B')
    const role = seedRole('Architect')
    const teamA = seedTeam(projectA.id, [role.id], 'Team A')
    const teamB = seedTeam(projectB.id, [role.id], 'Team B')

    const runA = runInventory.createRun({
      name: 'Run A',
      projectId: projectA.id,
      teamId: teamA.id,
    })
    runInventory.createRun({
      name: 'Run B',
      projectId: projectB.id,
      teamId: teamB.id,
    })

    expect(runInventory.listRuns({ projectId: projectA.id })).toEqual([runA])
  })

  it('lists runs filtered by status', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const activeRun = runInventory.createRun({
      name: 'Active Run',
      projectId: project.id,
      teamId: team.id,
    })
    const completedRun = runInventory.createRun({
      name: 'Completed Run',
      projectId: project.id,
      teamId: team.id,
    })
    runInventory.updateRunStatus(completedRun.id, 'completed')

    expect(runInventory.listRuns({ status: 'active' })).toEqual([activeRun])
    const completedRuns = runInventory.listRuns({ status: 'completed' })
    expect(completedRuns).toHaveLength(1)
    expect(completedRuns[0].status).toBe('completed')
  })

  it('lists all runs when no filter is provided', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run1 = runInventory.createRun({
      name: 'Run 1',
      projectId: project.id,
      teamId: team.id,
    })
    const run2 = runInventory.createRun({
      name: 'Run 2',
      projectId: project.id,
      teamId: team.id,
    })

    expect(runInventory.listRuns()).toEqual([run1, run2])
  })

  it('updates run status', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])
    const created = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    const updated = runInventory.updateRunStatus(created.id, 'completed')

    expect(updated).toBeDefined()
    expect(updated!.status).toBe('completed')
    expect(updated!.id).toBe(created.id)
  })

  it('returns undefined when updating status of a nonexistent run', () => {
    expect(
      runInventory.updateRunStatus('nonexistent', 'completed'),
    ).toBeUndefined()
  })

  it('clears all runs', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    runInventory.createRun({
      name: 'Run 1',
      projectId: project.id,
      teamId: team.id,
    })
    runInventory.createRun({
      name: 'Run 2',
      projectId: project.id,
      teamId: team.id,
    })

    runInventory.clear()

    expect(runInventory.listRuns()).toEqual([])
  })

  it('maps run storage records to domain objects and DTOs explicitly', () => {
    const domain = mapRunRecordToDomain({
      id: 'run-1',
      name: 'Sprint 1',
      project_id: 'proj-1',
      team_snapshot: {
        team_id: 'team-1',
        team_name: 'Alpha Team',
        members: [
          {
            role_id: 'role-1',
            role_name: 'Architect',
            role_description: 'Designs systems',
            agent_config: null,
          },
        ],
      },
      channel_id: 'channel-1',
      status: 'active',
      phases: [],
      current_phase_id: null,
      approval_required: false,
      approvals: [],
      created_at: '2026-04-07T00:00:00.000Z',
    })

    expect(domain).toEqual({
      id: 'run-1',
      name: 'Sprint 1',
      projectId: 'proj-1',
      teamSnapshot: {
        teamId: 'team-1',
        teamName: 'Alpha Team',
        members: [
          {
            roleId: 'role-1',
            roleName: 'Architect',
            roleDescription: 'Designs systems',
            agentConfig: null,
          },
        ],
      },
      channelId: 'channel-1',
      status: 'active',
      phases: [],
      currentPhaseId: null,
      approvalRequired: false,
      approvals: [],
      createdAt: '2026-04-07T00:00:00.000Z',
    })

    expect(mapRunToDto(domain)).toEqual({
      id: 'run-1',
      name: 'Sprint 1',
      project_id: 'proj-1',
      team_snapshot: {
        team_id: 'team-1',
        team_name: 'Alpha Team',
        members: [
          {
            role_id: 'role-1',
            role_name: 'Architect',
            role_description: 'Designs systems',
            agent_config: null,
          },
        ],
      },
      channel_id: 'channel-1',
      status: 'active',
      phases: [],
      current_phase_id: null,
      approval_required: false,
      approvals: [],
      created_at: '2026-04-07T00:00:00.000Z',
    })
  })

  it('enriches run team snapshot with role details and agent_config', () => {
    const project = seedProject()
    const agentRole = roleInventory.createRole({
      name: 'Claude Dev',
      description: 'An AI developer',
      scope: 'user',
      agentConfig: {
        runtime: 'claude',
        systemPrompt: 'You write code',
        model: 'opus',
      },
    })
    const humanRole = seedRole('Human Lead')
    const team = seedTeam(project.id, [agentRole.id, humanRole.id])

    const run = runInventory.createRun({
      name: 'Feature Sprint',
      projectId: project.id,
      teamId: team.id,
    })

    expect(run.teamSnapshot.members).toEqual([
      {
        roleId: agentRole.id,
        roleName: 'Claude Dev',
        roleDescription: 'An AI developer',
        agentConfig: {
          runtime: 'claude',
          systemPrompt: 'You write code',
          model: 'opus',
        },
      },
      {
        roleId: humanRole.id,
        roleName: 'Human Lead',
        roleDescription: 'Human Lead description',
        agentConfig: null,
      },
    ])
  })

  it('maps run snapshot with enriched members including agent_config', () => {
    const domain = mapRunRecordToDomain({
      id: 'run-2',
      name: 'Sprint 2',
      project_id: 'proj-1',
      team_snapshot: {
        team_id: 'team-1',
        team_name: 'Alpha Team',
        members: [
          {
            role_id: 'role-1',
            role_name: 'Claude Dev',
            role_description: 'AI dev',
            agent_config: {
              runtime: 'copilot',
              system_prompt: null,
              model: 'gpt-4',
            },
          },
        ],
      },
      channel_id: 'channel-2',
      status: 'active',
      phases: [],
      current_phase_id: null,
      approval_required: false,
      approvals: [],
      created_at: '2026-04-07T00:00:00.000Z',
    })

    expect(domain.teamSnapshot.members[0]).toEqual({
      roleId: 'role-1',
      roleName: 'Claude Dev',
      roleDescription: 'AI dev',
      agentConfig: {
        runtime: 'copilot',
        systemPrompt: null,
        model: 'gpt-4',
      },
    })

    const dto = mapRunToDto(domain)
    expect(dto.team_snapshot.members[0]).toEqual({
      role_id: 'role-1',
      role_name: 'Claude Dev',
      role_description: 'AI dev',
      agent_config: {
        runtime: 'copilot',
        system_prompt: null,
        model: 'gpt-4',
      },
    })
  })

  it('maps agent config helpers correctly', () => {
    expect(mapAgentConfigRecordToDomain(null)).toBeNull()
    expect(
      mapAgentConfigRecordToDomain({
        runtime: 'claude',
        system_prompt: 'prompt',
        model: 'opus',
      }),
    ).toEqual({ runtime: 'claude', systemPrompt: 'prompt', model: 'opus' })

    expect(mapAgentConfigToRecord(null)).toBeNull()
    expect(
      mapAgentConfigToRecord({
        runtime: 'copilot',
        systemPrompt: null,
        model: null,
      }),
    ).toEqual({ runtime: 'copilot', system_prompt: null, model: null })

    expect(mapAgentConfigToDto(null)).toBeNull()
    expect(
      mapAgentConfigToDto({
        runtime: 'claude',
        systemPrompt: 'hi',
        model: 'opus',
      }),
    ).toEqual({ runtime: 'claude', system_prompt: 'hi', model: 'opus' })
  })

  it('falls back to empty strings when roleInventory is not provided', () => {
    const localRunInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
    )
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = localRunInventory.createRun({
      name: 'Sprint',
      projectId: project.id,
      teamId: team.id,
    })

    expect(run.teamSnapshot.members[0]).toEqual({
      roleId: role.id,
      roleName: '',
      roleDescription: '',
      agentConfig: null,
    })
  })

  it('resets run state alongside other dependencies', () => {
    const deps = createProjectChatDependencies()
    const project = deps.projectInventory.createProject({
      name: 'Test',
      rootPath: '/test',
    })
    const role = deps.roleInventory.createRole({
      name: 'R',
      description: 'R',
      scope: 'user',
    })
    const team = deps.teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    deps.runInventory.createRun({
      name: 'Run',
      projectId: project.id,
      teamId: team.id,
    })

    resetState(deps)

    expect(deps.runInventory.listRuns()).toEqual([])
  })

  it('provides a run room via getRunRoom', () => {
    const deps = createProjectChatDependencies()
    const project = deps.projectInventory.createProject({
      name: 'Test',
      rootPath: '/test',
    })
    const role = deps.roleInventory.createRole({
      name: 'R',
      description: 'R',
      scope: 'user',
    })
    const team = deps.teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    const run = deps.runInventory.createRun({
      name: 'Run',
      projectId: project.id,
      teamId: team.id,
    })

    const room = getRunRoom(run.id, deps)
    expect(room).toBeDefined()
    expect(room!.channelId).toBe(run.channelId)
    expect(getRunRoom('nonexistent', deps)).toBeUndefined()
  })
})

describe('phase control', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory
  let runInventory: InMemoryRunInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
    runInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
      undefined,
      roleInventory,
    )
  })

  function seedProject(name = 'Test Project') {
    return projectInventory.createProject({
      name,
      rootPath: `/workspace/${name.toLowerCase().replace(/ /g, '-')}`,
    })
  }

  function seedRole(name: string) {
    return roleInventory.createRole({
      name,
      description: `${name} description`,
      scope: 'user',
    })
  }

  function seedTeam(projectId: string, roleIds: string[], name = 'Alpha Team') {
    return teamInventory.createTeam({
      name,
      projectId,
      members: roleIds.map((id) => ({ roleId: id })),
    })
  }

  it('creates a run with phases and sets the first phase as active', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }, { name: 'Build' }, { name: 'Review' }],
    })

    expect(run.phases).toHaveLength(3)
    expect(run.phases[0].name).toBe('Design')
    expect(run.phases[0].status).toBe('active')
    expect(run.phases[0].startedAt).toBeDefined()
    expect(run.phases[0].completedAt).toBeNull()
    expect(run.phases[1].name).toBe('Build')
    expect(run.phases[1].status).toBe('pending')
    expect(run.phases[1].startedAt).toBeNull()
    expect(run.phases[2].name).toBe('Review')
    expect(run.phases[2].status).toBe('pending')
    expect(run.currentPhaseId).toBe(run.phases[0].id)
    expect(run.approvalRequired).toBe(false)
    expect(run.approvals).toEqual([])
  })

  it('creates a run without phases (empty phases array)', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    expect(run.phases).toEqual([])
    expect(run.currentPhaseId).toBeNull()
    expect(run.approvalRequired).toBe(false)
    expect(run.approvals).toEqual([])
    expect(run.status).toBe('active')
  })

  it('advances through phases linearly without approval gates', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }, { name: 'Build' }, { name: 'Review' }],
    })

    // Advance: Design -> Build
    const afterFirst = runInventory.advancePhase(run.id)
    expect(afterFirst.phases[0].status).toBe('completed')
    expect(afterFirst.phases[0].completedAt).toBeDefined()
    expect(afterFirst.phases[1].status).toBe('active')
    expect(afterFirst.phases[1].startedAt).toBeDefined()
    expect(afterFirst.currentPhaseId).toBe(afterFirst.phases[1].id)
    expect(afterFirst.status).toBe('active')

    // Advance: Build -> Review
    const afterSecond = runInventory.advancePhase(run.id)
    expect(afterSecond.phases[1].status).toBe('completed')
    expect(afterSecond.phases[2].status).toBe('active')
    expect(afterSecond.currentPhaseId).toBe(afterSecond.phases[2].id)
    expect(afterSecond.status).toBe('active')

    // Advance: Review -> completed
    const afterThird = runInventory.advancePhase(run.id)
    expect(afterThird.phases[2].status).toBe('completed')
    expect(afterThird.currentPhaseId).toBeNull()
    expect(afterThird.status).toBe('completed')
  })

  it('puts run into pending_approval when phase requires approval', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    expect(run.phases[0].approvalRequired).toBe(true)
    expect(run.phases[1].approvalRequired).toBe(false)

    const advanced = runInventory.advancePhase(run.id)
    expect(advanced.status).toBe('pending_approval')
    // Phase is still active, not yet completed
    expect(advanced.phases[0].status).toBe('active')
    expect(advanced.currentPhaseId).toBe(advanced.phases[0].id)
  })

  it('applies global approval_required to all phases', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }, { name: 'Build' }],
      approvalRequired: true,
    })

    expect(run.approvalRequired).toBe(true)
    expect(run.phases[0].approvalRequired).toBe(true)
    expect(run.phases[1].approvalRequired).toBe(true)
  })

  it('per-phase approval_required overrides global setting', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: false }, { name: 'Build' }],
      approvalRequired: true,
    })

    expect(run.phases[0].approvalRequired).toBe(false)
    expect(run.phases[1].approvalRequired).toBe(true)
  })

  it('approves a pending phase transition and moves to next phase', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    const run = runInventory.listRuns()[0]

    // Advance puts it into pending_approval
    runInventory.advancePhase(run.id)

    // Approve moves to next phase
    const approved = runInventory.approvePhase(run.id, 'approved', 'Looks good')
    expect(approved.status).toBe('active')
    expect(approved.phases[0].status).toBe('completed')
    expect(approved.phases[0].completedAt).toBeDefined()
    expect(approved.phases[1].status).toBe('active')
    expect(approved.phases[1].startedAt).toBeDefined()
    expect(approved.currentPhaseId).toBe(approved.phases[1].id)
    expect(approved.approvals).toHaveLength(1)
    expect(approved.approvals[0].phaseId).toBe(approved.phases[0].id)
    expect(approved.approvals[0].decision).toBe('approved')
    expect(approved.approvals[0].reason).toBe('Looks good')
    expect(approved.approvals[0].decidedAt).toBeDefined()
  })

  it('rejects a pending phase transition', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    // Advance to pending_approval
    runInventory.advancePhase(run.id)

    // Reject
    const rejected = runInventory.approvePhase(
      run.id,
      'rejected',
      'Needs rework',
    )
    expect(rejected.status).toBe('active')
    expect(rejected.phases[0].status).toBe('rejected')
    expect(rejected.phases[0].completedAt).toBeDefined()
    expect(rejected.phases[1].status).toBe('pending')
    expect(rejected.approvals).toHaveLength(1)
    expect(rejected.approvals[0].decision).toBe('rejected')
    expect(rejected.approvals[0].reason).toBe('Needs rework')
  })

  it('approves the last phase and completes the run', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Review', approvalRequired: true }],
    })

    runInventory.advancePhase(run.id)
    const approved = runInventory.approvePhase(run.id, 'approved')

    expect(approved.status).toBe('completed')
    expect(approved.phases[0].status).toBe('completed')
    expect(approved.currentPhaseId).toBeNull()
    expect(approved.approvals[0].reason).toBeNull()
  })

  it('throws when advancing a run with no phases', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    expect(() => runInventory.advancePhase(run.id)).toThrow(
      'run has no phases to advance',
    )
  })

  it('throws when advancing a completed run', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }],
    })

    runInventory.advancePhase(run.id)
    expect(() => runInventory.advancePhase(run.id)).toThrow(
      'run is already completed',
    )
  })

  it('throws when advancing a run in pending_approval state', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }],
    })

    runInventory.advancePhase(run.id)
    expect(() => runInventory.advancePhase(run.id)).toThrow(
      'run is pending approval',
    )
  })

  it('throws when advancing a nonexistent run', () => {
    expect(() => runInventory.advancePhase('nonexistent')).toThrow(
      'run "nonexistent" was not found',
    )
  })

  it('throws when approving a run not in pending_approval state', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }],
    })

    expect(() => runInventory.approvePhase(run.id, 'approved')).toThrow(
      'run is not pending approval',
    )
  })

  it('throws when approving a nonexistent run', () => {
    expect(() => runInventory.approvePhase('nonexistent', 'approved')).toThrow(
      'run "nonexistent" was not found',
    )
  })

  it('maps phase records to domain objects and DTOs explicitly', () => {
    const phaseRecord = {
      id: 'phase-1',
      name: 'Design',
      status: 'active' as const,
      approval_required: true,
      started_at: '2026-04-07T00:00:00.000Z',
      completed_at: null,
    }

    const domain = mapPhaseRecordToDomain(phaseRecord)
    expect(domain).toEqual({
      id: 'phase-1',
      name: 'Design',
      status: 'active',
      approvalRequired: true,
      startedAt: '2026-04-07T00:00:00.000Z',
      completedAt: null,
    })

    expect(mapPhaseToDto(domain)).toEqual({
      id: 'phase-1',
      name: 'Design',
      status: 'active',
      approval_required: true,
      started_at: '2026-04-07T00:00:00.000Z',
      completed_at: null,
    })
  })

  it('maps approval records to domain objects and DTOs explicitly', () => {
    const approvalRecord = {
      phase_id: 'phase-1',
      decision: 'approved' as const,
      reason: 'Looks good',
      decided_at: '2026-04-07T00:00:00.000Z',
    }

    const domain = mapApprovalRecordToDomain(approvalRecord)
    expect(domain).toEqual({
      phaseId: 'phase-1',
      decision: 'approved',
      reason: 'Looks good',
      decidedAt: '2026-04-07T00:00:00.000Z',
    })

    expect(mapApprovalToDto(domain)).toEqual({
      phase_id: 'phase-1',
      decision: 'approved',
      reason: 'Looks good',
      decided_at: '2026-04-07T00:00:00.000Z',
    })
  })
})

describe('workspace allocation inventory', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory
  let runInventory: InMemoryRunInventory
  let allocationInventory: InMemoryWorkspaceAllocationInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
    runInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
      undefined,
      roleInventory,
    )
    allocationInventory = new InMemoryWorkspaceAllocationInventory(runInventory)
  })

  function seedRun() {
    const project = projectInventory.createProject({
      name: 'Test Project',
      rootPath: '/workspace/test',
    })
    const role = roleInventory.createRole({
      name: 'Dev',
      description: 'Developer',
      scope: 'user',
    })
    const team = teamInventory.createTeam({
      name: 'Alpha Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })
    return { project, role, team, run }
  }

  it('creates a workspace allocation with UUID', () => {
    const { run } = seedRun()

    const allocation = allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })

    expect(allocation.id).toMatch(UUID)
    expect(allocation.runId).toBe(run.id)
    expect(allocation.participantName).toBe('agent-1')
    expect(allocation.roleId).toBeNull()
    expect(allocation.workspace).toEqual({
      type: 'project_root',
      name: null,
      path: null,
    })
  })

  it('creates a worktree allocation with name and path', () => {
    const { run, role } = seedRun()

    const allocation = allocationInventory.createAllocation(run.id, {
      roleId: role.id,
      workspace: {
        type: 'worktree',
        name: 'feature-branch',
        path: '/workspace/test/.worktrees/feature-branch',
      },
    })

    expect(allocation.id).toMatch(UUID)
    expect(allocation.participantName).toBeNull()
    expect(allocation.roleId).toBe(role.id)
    expect(allocation.workspace).toEqual({
      type: 'worktree',
      name: 'feature-branch',
      path: '/workspace/test/.worktrees/feature-branch',
    })
  })

  it('creates allocation with both participant and role', () => {
    const { run, role } = seedRun()

    const allocation = allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      roleId: role.id,
      workspace: { type: 'project_root', name: null, path: null },
    })

    expect(allocation.participantName).toBe('agent-1')
    expect(allocation.roleId).toBe(role.id)
  })

  it('throws when run does not exist', () => {
    expect(() =>
      allocationInventory.createAllocation('nonexistent', {
        participantName: 'agent-1',
        workspace: { type: 'project_root', name: null, path: null },
      }),
    ).toThrow('run "nonexistent" was not found')
  })

  it('throws when neither participant nor role is provided', () => {
    const { run } = seedRun()

    expect(() =>
      allocationInventory.createAllocation(run.id, {
        workspace: { type: 'project_root', name: null, path: null },
      }),
    ).toThrow('at least one of participantName or roleId is required')
  })

  it('throws for invalid workspace type', () => {
    const { run } = seedRun()

    expect(() =>
      allocationInventory.createAllocation(run.id, {
        participantName: 'agent-1',
        workspace: {
          type: 'invalid' as 'project_root',
          name: null,
          path: null,
        },
      }),
    ).toThrow('workspace type must be "project_root" or "worktree"')
  })

  it('lists allocations for a run', () => {
    const { run } = seedRun()

    allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })
    allocationInventory.createAllocation(run.id, {
      participantName: 'agent-2',
      workspace: {
        type: 'worktree',
        name: 'wt-1',
        path: '/workspace/.worktrees/wt-1',
      },
    })

    const allocations = allocationInventory.listAllocations(run.id)
    expect(allocations).toHaveLength(2)
    expect(allocations[0].participantName).toBe('agent-1')
    expect(allocations[1].participantName).toBe('agent-2')
  })

  it('returns empty list for run with no allocations', () => {
    const { run } = seedRun()
    expect(allocationInventory.listAllocations(run.id)).toEqual([])
  })

  it('does not mix allocations across runs', () => {
    const { run } = seedRun()
    // Create a second run
    const project2 = projectInventory.createProject({
      name: 'Project 2',
      rootPath: '/workspace/p2',
    })
    const role2 = roleInventory.createRole({
      name: 'QA',
      description: 'Quality',
      scope: 'user',
    })
    const team2 = teamInventory.createTeam({
      name: 'Beta Team',
      projectId: project2.id,
      members: [{ roleId: role2.id }],
    })
    const run2 = runInventory.createRun({
      name: 'Sprint 2',
      projectId: project2.id,
      teamId: team2.id,
    })

    allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })
    allocationInventory.createAllocation(run2.id, {
      participantName: 'agent-2',
      workspace: { type: 'project_root', name: null, path: null },
    })

    expect(allocationInventory.listAllocations(run.id)).toHaveLength(1)
    expect(allocationInventory.listAllocations(run2.id)).toHaveLength(1)
  })

  it('gets an allocation by id', () => {
    const { run } = seedRun()

    const created = allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })

    const found = allocationInventory.getAllocationById(created.id)
    expect(found).toEqual(created)
  })

  it('returns undefined for nonexistent allocation id', () => {
    expect(allocationInventory.getAllocationById('nonexistent')).toBeUndefined()
  })

  it('deletes an allocation', () => {
    const { run } = seedRun()

    const created = allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })

    expect(allocationInventory.deleteAllocation(created.id)).toBe(true)
    expect(allocationInventory.getAllocationById(created.id)).toBeUndefined()
    expect(allocationInventory.listAllocations(run.id)).toEqual([])
  })

  it('returns false when deleting nonexistent allocation', () => {
    expect(allocationInventory.deleteAllocation('nonexistent')).toBe(false)
  })

  it('clears all allocations', () => {
    const { run } = seedRun()

    allocationInventory.createAllocation(run.id, {
      participantName: 'agent-1',
      workspace: { type: 'project_root', name: null, path: null },
    })

    allocationInventory.clear()
    expect(allocationInventory.listAllocations(run.id)).toEqual([])
  })
})

describe('workspace allocation mapping', () => {
  it('maps workspace allocation record to domain', () => {
    const record = {
      id: 'alloc-1',
      run_id: 'run-1',
      participant_name: 'agent-1',
      role_id: 'role-1',
      workspace: {
        type: 'worktree' as const,
        name: 'feature-x',
        path: '/workspace/.worktrees/feature-x',
      },
    }

    const domain = mapWorkspaceAllocationRecordToDomain(record)
    expect(domain).toEqual({
      id: 'alloc-1',
      runId: 'run-1',
      participantName: 'agent-1',
      roleId: 'role-1',
      workspace: {
        type: 'worktree',
        name: 'feature-x',
        path: '/workspace/.worktrees/feature-x',
      },
    })
  })

  it('maps workspace to DTO', () => {
    const workspace = {
      type: 'project_root' as const,
      name: null,
      path: null,
    }

    expect(mapWorkspaceToDto(workspace)).toEqual({
      type: 'project_root',
      name: null,
      path: null,
    })
  })

  it('maps workspace allocation to DTO', () => {
    const domain = {
      id: 'alloc-1',
      runId: 'run-1',
      participantName: 'agent-1',
      roleId: null,
      workspace: {
        type: 'project_root' as const,
        name: null,
        path: null,
      },
    }

    expect(mapWorkspaceAllocationToDto(domain)).toEqual({
      id: 'alloc-1',
      run_id: 'run-1',
      participant_name: 'agent-1',
      role_id: null,
      workspace: {
        type: 'project_root',
        name: null,
        path: null,
      },
    })
  })

  it('maps create workspace allocation DTO to domain', () => {
    const dto = {
      participant_name: 'agent-1',
      role_id: 'role-1',
      workspace: {
        type: 'worktree' as const,
        name: 'wt-1',
        path: '/ws/.worktrees/wt-1',
      },
    }

    expect(mapCreateWorkspaceAllocationDtoToDomain(dto)).toEqual({
      participantName: 'agent-1',
      roleId: 'role-1',
      workspace: {
        type: 'worktree',
        name: 'wt-1',
        path: '/ws/.worktrees/wt-1',
      },
    })
  })

  it('maps create workspace allocation DTO with only participant', () => {
    const dto = {
      participant_name: 'agent-1',
      workspace: {
        type: 'project_root' as const,
        name: null,
        path: null,
      },
    }

    const result = mapCreateWorkspaceAllocationDtoToDomain(dto)
    expect(result.participantName).toBe('agent-1')
    expect(result.roleId).toBeUndefined()
  })

  it('maps create workspace allocation DTO with only role', () => {
    const dto = {
      role_id: 'role-1',
      workspace: {
        type: 'project_root' as const,
        name: null,
        path: null,
      },
    }

    const result = mapCreateWorkspaceAllocationDtoToDomain(dto)
    expect(result.participantName).toBeUndefined()
    expect(result.roleId).toBe('role-1')
  })
})

describe('createProjectChatDependencies includes workspace allocation inventory', () => {
  it('creates dependencies with workspace allocation inventory', () => {
    const deps = createProjectChatDependencies()
    expect(deps.workspaceAllocationInventory).toBeDefined()
    expect(deps.workspaceAllocationInventory.listAllocations('any')).toEqual([])
  })
})

describe('timeline inventory', () => {
  let timelineInventory: InMemoryTimelineInventory

  beforeEach(() => {
    timelineInventory = new InMemoryTimelineInventory()
  })

  it('adds a timeline event with UUID and timestamp', () => {
    const event = timelineInventory.addEvent('run-1', 'run_created', {
      name: 'Sprint 1',
    })

    expect(event.id).toMatch(UUID)
    expect(event.runId).toBe('run-1')
    expect(event.type).toBe('run_created')
    expect(event.timestamp).toBeDefined()
    expect(event.data).toEqual({ name: 'Sprint 1' })
  })

  it('returns events ordered by timestamp', () => {
    timelineInventory.addEvent('run-1', 'run_created', {})
    timelineInventory.addEvent('run-1', 'phase_started', {
      phase_name: 'Design',
    })
    timelineInventory.addEvent('run-1', 'phase_completed', {
      phase_name: 'Design',
    })

    const events = timelineInventory.getTimeline('run-1')
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('run_created')
    expect(events[1].type).toBe('phase_started')
    expect(events[2].type).toBe('phase_completed')
    // Verify ordering
    expect(events[0].timestamp <= events[1].timestamp).toBe(true)
    expect(events[1].timestamp <= events[2].timestamp).toBe(true)
  })

  it('returns empty array for unknown run', () => {
    expect(timelineInventory.getTimeline('nonexistent')).toEqual([])
  })

  it('isolates events by run id', () => {
    timelineInventory.addEvent('run-1', 'run_created', {})
    timelineInventory.addEvent('run-2', 'run_created', {})

    expect(timelineInventory.getTimeline('run-1')).toHaveLength(1)
    expect(timelineInventory.getTimeline('run-2')).toHaveLength(1)
  })

  it('clears all events', () => {
    timelineInventory.addEvent('run-1', 'run_created', {})
    timelineInventory.addEvent('run-2', 'run_created', {})

    timelineInventory.clear()

    expect(timelineInventory.getTimeline('run-1')).toEqual([])
    expect(timelineInventory.getTimeline('run-2')).toEqual([])
  })

  it('maps timeline event details to DTO', () => {
    const dto = mapTimelineEventToDto({
      id: 'evt-1',
      runId: 'run-1',
      type: 'run_created',
      timestamp: '2026-04-07T00:00:00.000Z',
      data: { name: 'Sprint 1' },
    })

    expect(dto).toEqual({
      id: 'evt-1',
      run_id: 'run-1',
      type: 'run_created',
      timestamp: '2026-04-07T00:00:00.000Z',
      data: { name: 'Sprint 1' },
    })
  })
})

describe('run inventory emits timeline events', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory
  let timelineInventory: InMemoryTimelineInventory
  let runInventory: InMemoryRunInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
    timelineInventory = new InMemoryTimelineInventory()
    runInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
      timelineInventory,
      roleInventory,
    )
  })

  function seedProject(name = 'Test Project') {
    return projectInventory.createProject({
      name,
      rootPath: `/workspace/${name.toLowerCase().replace(/ /g, '-')}`,
    })
  }

  function seedRole(name: string) {
    return roleInventory.createRole({
      name,
      description: `${name} description`,
      scope: 'user',
    })
  }

  function seedTeam(projectId: string, roleIds: string[], name = 'Alpha Team') {
    return teamInventory.createTeam({
      name,
      projectId,
      members: roleIds.map((id) => ({ roleId: id })),
    })
  }

  it('emits run_created when a run is created', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
    })

    const events = timelineInventory.getTimeline(run.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('run_created')
    expect(events[0].runId).toBe(run.id)
    expect(events[0].data).toEqual({ name: 'Sprint 1' })
  })

  it('emits run_created and phase_started when a run is created with phases', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }, { name: 'Build' }],
    })

    const events = timelineInventory.getTimeline(run.id)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('run_created')
    expect(events[1].type).toBe('phase_started')
    expect(events[1].data).toEqual({ phase_name: 'Design' })
  })

  it('emits phase_completed and phase_started when advancing phases', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)

    const events = timelineInventory.getTimeline(run.id)
    // run_created + phase_started(Design) + phase_completed(Design) + phase_started(Build)
    expect(events).toHaveLength(4)
    expect(events[2].type).toBe('phase_completed')
    expect(events[2].data).toEqual({ phase_name: 'Design' })
    expect(events[3].type).toBe('phase_started')
    expect(events[3].data).toEqual({ phase_name: 'Build' })
  })

  it('emits run_completed when advancing past the last phase', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design' }],
    })

    runInventory.advancePhase(run.id)

    const events = timelineInventory.getTimeline(run.id)
    // run_created + phase_started(Design) + phase_completed(Design) + run_completed
    expect(events).toHaveLength(4)
    expect(events[3].type).toBe('run_completed')
  })

  it('emits approval_requested when phase requires approval', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)

    const events = timelineInventory.getTimeline(run.id)
    // run_created + phase_started(Design) + approval_requested
    expect(events).toHaveLength(3)
    expect(events[2].type).toBe('approval_requested')
    expect(events[2].data).toEqual({ phase_name: 'Design' })
  })

  it('emits approval_granted when phase is approved', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)
    runInventory.approvePhase(run.id, 'approved', 'Looks good')

    const events = timelineInventory.getTimeline(run.id)
    // run_created + phase_started(Design) + approval_requested + approval_granted + phase_completed(Design) + phase_started(Build)
    expect(events).toHaveLength(6)
    expect(events[3].type).toBe('approval_granted')
    expect(events[3].data).toEqual({
      phase_name: 'Design',
      reason: 'Looks good',
    })
    expect(events[4].type).toBe('phase_completed')
    expect(events[5].type).toBe('phase_started')
  })

  it('emits approval_rejected when phase is rejected', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)
    runInventory.approvePhase(run.id, 'rejected', 'Needs rework')

    const events = timelineInventory.getTimeline(run.id)
    // run_created + phase_started(Design) + approval_requested + approval_rejected + phase_rejected(Design)
    expect(events).toHaveLength(5)
    expect(events[3].type).toBe('approval_rejected')
    expect(events[3].data).toEqual({
      phase_name: 'Design',
      reason: 'Needs rework',
    })
    expect(events[4].type).toBe('phase_rejected')
    expect(events[4].data).toEqual({ phase_name: 'Design' })
  })

  it('emits approval_rejected with null reason when no reason is provided', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)
    runInventory.approvePhase(run.id, 'rejected')

    const events = timelineInventory.getTimeline(run.id)
    const rejectedEvent = events.find((e) => e.type === 'approval_rejected')!
    expect(rejectedEvent.data).toEqual({
      phase_name: 'Design',
      reason: null,
    })
  })

  it('emits approval_granted with null reason when no reason is provided', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Design', approvalRequired: true }, { name: 'Build' }],
    })

    runInventory.advancePhase(run.id)
    runInventory.approvePhase(run.id, 'approved')

    const events = timelineInventory.getTimeline(run.id)
    const grantedEvent = events.find((e) => e.type === 'approval_granted')!
    expect(grantedEvent.data).toEqual({
      phase_name: 'Design',
      reason: null,
    })
  })

  it('emits run_completed when last phase is approved', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Sprint 1',
      projectId: project.id,
      teamId: team.id,
      phases: [{ name: 'Review', approvalRequired: true }],
    })

    runInventory.advancePhase(run.id)
    runInventory.approvePhase(run.id, 'approved')

    const events = timelineInventory.getTimeline(run.id)
    const lastEvent = events[events.length - 1]
    expect(lastEvent.type).toBe('run_completed')
  })
})

describe('createProjectChatDependencies includes timeline inventory', () => {
  it('creates dependencies with timeline inventory', () => {
    const deps = createProjectChatDependencies()
    expect(deps.timelineInventory).toBeDefined()
    expect(deps.timelineInventory.getTimeline('any')).toEqual([])
  })

  it('resets timeline state alongside other dependencies', () => {
    const deps = createProjectChatDependencies()
    const project = deps.projectInventory.createProject({
      name: 'Test',
      rootPath: '/test',
    })
    const role = deps.roleInventory.createRole({
      name: 'R',
      description: 'R',
      scope: 'user',
    })
    const team = deps.teamInventory.createTeam({
      name: 'Team',
      projectId: project.id,
      members: [{ roleId: role.id }],
    })
    const run = deps.runInventory.createRun({
      name: 'Run',
      projectId: project.id,
      teamId: team.id,
    })

    // There should be a run_created timeline event
    expect(deps.timelineInventory.getTimeline(run.id).length).toBeGreaterThan(0)

    resetState(deps)

    expect(deps.timelineInventory.getTimeline(run.id)).toEqual([])
  })
})

describe('playbook retrieval', () => {
  it('returns all available playbooks', () => {
    const playbooks = getPlaybooks()

    expect(playbooks).toHaveLength(1)
    expect(playbooks[0].id).toBe('feature-delivery')
    expect(playbooks[0].name).toBe('Feature Delivery')
    expect(playbooks[0].phases).toHaveLength(3)
  })

  it('returns the feature-delivery playbook by id', () => {
    const playbook = getPlaybookById('feature-delivery')

    expect(playbook).toBeDefined()
    expect(playbook!.id).toBe('feature-delivery')
    expect(playbook!.name).toBe('Feature Delivery')
    expect(playbook!.description).toBe(
      'Spec refinement, implementation and testing, review and completion',
    )
    expect(playbook!.phases).toEqual([
      {
        name: 'Specification & Refinement',
        description:
          'Multi-role specification session for shared understanding',
        approval_required: true,
      },
      {
        name: 'Implementation & Testing',
        description: 'Parallel coding and testing with broad autonomy',
        approval_required: false,
      },
      {
        name: 'Review & Completion',
        description: 'Final review, sign-off, and delivery',
        approval_required: true,
      },
    ])
  })

  it('returns undefined for unknown playbook id', () => {
    const playbook = getPlaybookById('nonexistent')

    expect(playbook).toBeUndefined()
  })

  it('exports the FEATURE_DELIVERY_PLAYBOOK constant', () => {
    expect(FEATURE_DELIVERY_PLAYBOOK.id).toBe('feature-delivery')
    expect(FEATURE_DELIVERY_PLAYBOOK.phases).toHaveLength(3)
  })
})

describe('run creation with playbook', () => {
  let projectInventory: InMemoryProjectInventory
  let roleInventory: InMemoryRoleInventory
  let teamInventory: InMemoryTeamInventory
  let runInventory: InMemoryRunInventory

  beforeEach(() => {
    projectInventory = new InMemoryProjectInventory()
    roleInventory = new InMemoryRoleInventory()
    teamInventory = new InMemoryTeamInventory(projectInventory, roleInventory)
    runInventory = new InMemoryRunInventory(
      projectInventory,
      teamInventory,
      undefined,
      roleInventory,
    )
  })

  function seedProject(name = 'Test Project') {
    return projectInventory.createProject({
      name,
      rootPath: `/workspace/${name.toLowerCase().replace(/ /g, '-')}`,
    })
  }

  function seedRole(name: string) {
    return roleInventory.createRole({
      name,
      description: `${name} description`,
      scope: 'user',
    })
  }

  function seedTeam(projectId: string, roleIds: string[], name = 'Alpha Team') {
    return teamInventory.createTeam({
      name,
      projectId,
      members: roleIds.map((id) => ({ roleId: id })),
    })
  }

  it('creates a run with playbook_id and materializes phases from playbook', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'Feature Sprint',
      projectId: project.id,
      teamId: team.id,
      playbookId: 'feature-delivery',
    })

    expect(run.phases).toHaveLength(3)
    expect(run.phases[0].name).toBe('Specification & Refinement')
    expect(run.phases[0].status).toBe('active')
    expect(run.phases[0].approvalRequired).toBe(true)
    expect(run.phases[0].startedAt).toBeDefined()
    expect(run.phases[1].name).toBe('Implementation & Testing')
    expect(run.phases[1].status).toBe('pending')
    expect(run.phases[1].approvalRequired).toBe(false)
    expect(run.phases[2].name).toBe('Review & Completion')
    expect(run.phases[2].status).toBe('pending')
    expect(run.phases[2].approvalRequired).toBe(true)
    expect(run.currentPhaseId).toBe(run.phases[0].id)
  })

  it('throws when both phases and playbookId are provided', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    expect(() =>
      runInventory.createRun({
        name: 'Conflict Run',
        projectId: project.id,
        teamId: team.id,
        playbookId: 'feature-delivery',
        phases: [{ name: 'Manual Phase' }],
      }),
    ).toThrow('cannot specify both phases and playbook_id')
  })

  it('throws when playbook_id does not exist', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    expect(() =>
      runInventory.createRun({
        name: 'Bad Playbook',
        projectId: project.id,
        teamId: team.id,
        playbookId: 'nonexistent' as 'feature-delivery',
      }),
    ).toThrow('playbook "nonexistent" was not found')
  })

  it('creates a run with no phases when neither phases nor playbookId provided', () => {
    const project = seedProject()
    const role = seedRole('Architect')
    const team = seedTeam(project.id, [role.id])

    const run = runInventory.createRun({
      name: 'No Phases',
      projectId: project.id,
      teamId: team.id,
    })

    expect(run.phases).toHaveLength(0)
    expect(run.currentPhaseId).toBeNull()
  })
})
