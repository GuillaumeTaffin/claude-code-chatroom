import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import {
  createProjectChatDependencies,
  createProject,
  resetState,
} from './state.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('createApp', () => {
  beforeEach(() => {
    resetState()
  })

  it('creates an Elysia app instance', () => {
    const app = createApp()

    expect(typeof app.handle).toBe('function')
  })

  it('serves the project routes through the composed app', async () => {
    const app = createApp()

    const emptyProjectsResponse = await app.handle(
      new Request('http://localhost/projects'),
    )
    expect(emptyProjectsResponse.status).toBe(200)
    expect(await emptyProjectsResponse.json()).toEqual({ projects: [] })

    const createProjectResponse = await app.handle(
      new Request('http://localhost/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Chatroom',
          root_path: '/workspace/chatroom',
        }),
      }),
    )

    expect(createProjectResponse.status).toBe(200)
    const created = (await createProjectResponse.json()) as {
      project: {
        id: string
        name: string
        root_path: string
        channel_id: string
      }
    }
    expect(created.project.id).toMatch(UUID)
    expect(created.project.channel_id).toMatch(UUID)
    expect(created.project.name).toBe('Chatroom')
    expect(created.project.root_path).toBe('/workspace/chatroom')
  })

  it('can serve routes with injected project dependencies', async () => {
    const dependencies = createProjectChatDependencies()
    const project = createProject(
      {
        name: 'Injected',
        root_path: '/workspace/injected',
      },
      dependencies,
    )
    const app = createApp(dependencies)

    const response = await app.handle(new Request('http://localhost/projects'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      projects: [project],
    })
  })

  it('serves role CRUD routes through the composed app', async () => {
    const app = createApp()

    // Create a user-scoped role
    const createResponse = await app.handle(
      new Request('http://localhost/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Architect',
          description: 'Designs systems',
          scope: 'user',
        }),
      }),
    )

    expect(createResponse.status).toBe(200)
    const created = (await createResponse.json()) as {
      role: { id: string; name: string; scope: string; project_id: null }
    }
    expect(created.role.id).toMatch(UUID)
    expect(created.role.name).toBe('Architect')
    expect(created.role.scope).toBe('user')
    expect(created.role.project_id).toBeNull()

    // List roles
    const listResponse = await app.handle(new Request('http://localhost/roles'))
    expect(listResponse.status).toBe(200)
    const listed = (await listResponse.json()) as {
      roles: { id: string }[]
    }
    expect(listed.roles).toHaveLength(1)
    expect(listed.roles[0].id).toBe(created.role.id)

    // Get role by id
    const getResponse = await app.handle(
      new Request(`http://localhost/roles/${created.role.id}`),
    )
    expect(getResponse.status).toBe(200)
    const fetched = (await getResponse.json()) as {
      role: { id: string; name: string }
    }
    expect(fetched.role.id).toBe(created.role.id)

    // Update role
    const updateResponse = await app.handle(
      new Request(`http://localhost/roles/${created.role.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Senior Architect' }),
      }),
    )
    expect(updateResponse.status).toBe(200)
    const updated = (await updateResponse.json()) as {
      role: { name: string }
    }
    expect(updated.role.name).toBe('Senior Architect')

    // Delete role
    const deleteResponse = await app.handle(
      new Request(`http://localhost/roles/${created.role.id}`, {
        method: 'DELETE',
      }),
    )
    expect(deleteResponse.status).toBe(200)
    const deleted = (await deleteResponse.json()) as { deleted: boolean }
    expect(deleted.deleted).toBe(true)

    // Verify deleted
    const getDeletedResponse = await app.handle(
      new Request(`http://localhost/roles/${created.role.id}`),
    )
    expect(getDeletedResponse.status).toBe(404)
  })

  it('serves team CRUD routes through the composed app', async () => {
    const app = createApp()

    // Create a project first
    const projectResponse = await app.handle(
      new Request('http://localhost/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Chatroom',
          root_path: '/workspace/chatroom',
        }),
      }),
    )
    const { project } = (await projectResponse.json()) as {
      project: { id: string }
    }

    // Create a role
    const roleResponse = await app.handle(
      new Request('http://localhost/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Architect',
          description: 'Designs systems',
          scope: 'user',
        }),
      }),
    )
    const { role } = (await roleResponse.json()) as {
      role: { id: string }
    }

    // Create a team
    const createTeamResponse = await app.handle(
      new Request('http://localhost/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Alpha Team',
          project_id: project.id,
          members: [{ role_id: role.id }],
        }),
      }),
    )
    expect(createTeamResponse.status).toBe(200)
    const created = (await createTeamResponse.json()) as {
      team: {
        id: string
        name: string
        project_id: string
        members: { role_id: string }[]
      }
    }
    expect(created.team.id).toMatch(UUID)
    expect(created.team.name).toBe('Alpha Team')
    expect(created.team.project_id).toBe(project.id)
    expect(created.team.members).toEqual([{ role_id: role.id }])

    // List teams
    const listResponse = await app.handle(
      new Request(`http://localhost/teams?project_id=${project.id}`),
    )
    expect(listResponse.status).toBe(200)
    const listed = (await listResponse.json()) as {
      teams: { id: string }[]
    }
    expect(listed.teams).toHaveLength(1)
    expect(listed.teams[0].id).toBe(created.team.id)

    // Get team by id
    const getResponse = await app.handle(
      new Request(`http://localhost/teams/${created.team.id}`),
    )
    expect(getResponse.status).toBe(200)
    const fetched = (await getResponse.json()) as {
      team: { id: string; name: string }
    }
    expect(fetched.team.id).toBe(created.team.id)

    // Update team
    const updateResponse = await app.handle(
      new Request(`http://localhost/teams/${created.team.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Beta Team' }),
      }),
    )
    expect(updateResponse.status).toBe(200)
    const updated = (await updateResponse.json()) as {
      team: { name: string }
    }
    expect(updated.team.name).toBe('Beta Team')

    // Delete team
    const deleteResponse = await app.handle(
      new Request(`http://localhost/teams/${created.team.id}`, {
        method: 'DELETE',
      }),
    )
    expect(deleteResponse.status).toBe(200)
    const deleted = (await deleteResponse.json()) as { deleted: boolean }
    expect(deleted.deleted).toBe(true)

    // Verify deleted
    const getDeletedResponse = await app.handle(
      new Request(`http://localhost/teams/${created.team.id}`),
    )
    expect(getDeletedResponse.status).toBe(404)
  })
})
