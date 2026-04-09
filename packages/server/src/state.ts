import type {
  AgentRuntime,
  ApprovalRecord as ApprovalRecordDto,
  ApprovalStatus,
  Member,
  MemberWithRuntime,
  Phase as PhaseDto,
  PhaseStatus,
  Playbook,
  PlaybookId,
  Project as ProjectDto,
  Role as RoleDto,
  RoleScope,
  Run as RunDto,
  RunTeamSnapshot,
  RunTeamSnapshotMember as RunTeamSnapshotMemberDto,
  RuntimeIdentity,
  RunStatus,
  Team as TeamDto,
  TimelineEvent as TimelineEventDto,
  TimelineEventType,
  Workspace as WorkspaceDto,
  WorkspaceAllocation as WorkspaceAllocationDto,
  WorkspaceType,
} from '@chatroom/shared'
import type { SpawnManager } from '@chatroom/spawner'

const DEFAULT_CHANNEL_ID = 'general'

// ── Playbook constants ──────────────────────────────────────────────────────

export const FEATURE_DELIVERY_PLAYBOOK: Playbook = {
  id: 'feature-delivery',
  name: 'Feature Delivery',
  description:
    'Spec refinement, implementation and testing, review and completion',
  phases: [
    {
      name: 'Specification & Refinement',
      description: 'Multi-role specification session for shared understanding',
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
  ],
}

const PLAYBOOKS: Playbook[] = [FEATURE_DELIVERY_PLAYBOOK]

export function getPlaybooks(): Playbook[] {
  return PLAYBOOKS
}

export function getPlaybookById(id: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.id === id)
}

/** Minimal interface for any WebSocket-like object we need to track and send to */
interface WS {
  send(data: string | ArrayBufferLike | ArrayBufferView): unknown
}

export class Room {
  readonly channelId: string
  private members = new Map<string, Member>()
  private runtimes = new Map<string, RuntimeIdentity>()
  private wsToName = new Map<WS, string>()
  private nameToWs = new Map<string, WS>()

  constructor(channelId: string = DEFAULT_CHANNEL_ID) {
    this.channelId = channelId
  }

  addMember(member: Member, runtime?: RuntimeIdentity): boolean {
    if (this.members.has(member.name)) return false
    this.members.set(member.name, member)
    if (runtime) {
      this.runtimes.set(member.name, runtime)
    }
    return true
  }

  removeMember(name: string): Member | undefined {
    const member = this.members.get(name)
    if (!member) return undefined
    this.members.delete(name)
    this.runtimes.delete(name)
    const ws = this.nameToWs.get(name)
    if (ws) {
      this.wsToName.delete(ws)
      this.nameToWs.delete(name)
    }
    return member
  }

  getMember(name: string): Member | undefined {
    return this.members.get(name)
  }

  getMembers(): MemberWithRuntime[] {
    return Array.from(this.members.values()).map((m) => {
      const result: MemberWithRuntime = {
        ...m,
        channel_id: this.channelId,
      }
      const runtime = this.runtimes.get(m.name)
      if (runtime) {
        result.runtime = runtime
      }
      return result
    })
  }

  isRegistered(name: string): boolean {
    return this.members.has(name)
  }

  hasWebSocket(name: string): boolean {
    return this.nameToWs.has(name)
  }

  registerWebSocket(ws: WS, name: string): boolean {
    if (!this.members.has(name)) return false
    if (this.nameToWs.has(name)) return false
    this.wsToName.set(ws, name)
    this.nameToWs.set(name, ws)
    return true
  }

  unregisterWebSocket(ws: WS): string | undefined {
    const name = this.wsToName.get(ws)
    if (!name) return undefined
    this.wsToName.delete(ws)
    this.nameToWs.delete(name)
    this.members.delete(name)
    return name
  }

  getNameByWebSocket(ws: WS): string | undefined {
    return this.wsToName.get(ws)
  }

  /** Send a message string to all connected members except the excluded name */
  broadcast(message: string, excludeName?: string): void {
    for (const [ws, name] of this.wsToName) {
      if (name === excludeName) continue
      try {
        ws.send(message)
      } catch {
        // ignore send failures on stale connections
      }
    }
  }

  /** Send a message string to all connected members */
  broadcastAll(message: string): void {
    for (const [ws] of this.wsToName) {
      try {
        ws.send(message)
      } catch {
        // ignore
      }
    }
  }
}

export interface ProjectRecord {
  id: string
  name: string
  root_path: string
  channel_id: string
}

export interface ProjectDetails {
  id: string
  name: string
  rootPath: string
  channelId: string
}

export interface CreateProjectInput {
  name: string
  rootPath: string
}

export interface ProjectInventory {
  createProject(input: CreateProjectInput): ProjectDetails
  listProjects(): ProjectDetails[]
  getProjectById(projectId: string): ProjectDetails | undefined
  clear(): void
}

export interface RoomRegistry {
  getOrCreateRoom(channelId?: string): Room
  getRoom(channelId?: string): Room | undefined
  findRoomByWebSocket(ws: WS): Room | undefined
  clear(): void
}

// ── Role storage & domain types ─────────────────────────────────────────────

export interface AgentConfigRecord {
  runtime: string
  system_prompt: string | null
  model: string | null
}

export interface AgentConfigDetails {
  runtime: AgentRuntime
  systemPrompt: string | null
  model: string | null
}

export interface RoleRecord {
  id: string
  name: string
  description: string
  scope: RoleScope
  project_id: string | null
  agent_config: AgentConfigRecord | null
}

export interface RoleDetails {
  id: string
  name: string
  description: string
  scope: RoleScope
  projectId: string | null
  agentConfig: AgentConfigDetails | null
}

export interface CreateRoleInput {
  name: string
  description: string
  scope: RoleScope
  projectId?: string
  agentConfig?: AgentConfigDetails
}

export interface UpdateRoleInput {
  name?: string
  description?: string
  agentConfig?: AgentConfigDetails | null
}

export interface RoleFilter {
  scope?: RoleScope
  projectId?: string | null
}

export interface RoleInventory {
  createRole(input: CreateRoleInput): RoleDetails
  getRoleById(id: string): RoleDetails | undefined
  listRoles(filter?: RoleFilter): RoleDetails[]
  updateRole(id: string, input: UpdateRoleInput): RoleDetails | undefined
  deleteRole(id: string): boolean
  clear(): void
}

// ── Team storage & domain types ──────────────────────────────────────────────

export interface TeamMemberRecord {
  role_id: string
}

export interface TeamRecord {
  id: string
  name: string
  project_id: string
  members: TeamMemberRecord[]
}

export interface TeamMemberDetails {
  roleId: string
}

export interface TeamDetails {
  id: string
  name: string
  projectId: string
  members: TeamMemberDetails[]
}

export interface CreateTeamInput {
  name: string
  projectId: string
  members: TeamMemberDetails[]
}

export interface UpdateTeamInput {
  name?: string
  members?: TeamMemberDetails[]
}

export interface TeamFilter {
  projectId?: string
}

export interface TeamInventory {
  createTeam(input: CreateTeamInput): TeamDetails
  getTeamById(id: string): TeamDetails | undefined
  listTeams(filter?: TeamFilter): TeamDetails[]
  updateTeam(id: string, input: UpdateTeamInput): TeamDetails | undefined
  deleteTeam(id: string): boolean
  clear(): void
}

// ── Run storage & domain types ──────────────────────────────────────────────

export interface RunTeamSnapshotMemberRecord {
  role_id: string
  role_name: string
  role_description: string
  agent_config: AgentConfigRecord | null
}

export interface RunTeamSnapshotRecord {
  team_id: string
  team_name: string
  members: RunTeamSnapshotMemberRecord[]
}

export interface PhaseRecord {
  id: string
  name: string
  status: PhaseStatus
  approval_required: boolean
  started_at: string | null
  completed_at: string | null
}

export interface ApprovalRecordEntry {
  phase_id: string
  decision: ApprovalStatus
  reason: string | null
  decided_at: string
}

export interface RunRecord {
  id: string
  name: string
  project_id: string
  team_snapshot: RunTeamSnapshotRecord
  channel_id: string
  status: RunStatus
  phases: PhaseRecord[]
  current_phase_id: string | null
  approval_required: boolean
  approvals: ApprovalRecordEntry[]
  created_at: string
}

export interface RunTeamMemberDetails {
  roleId: string
  roleName: string
  roleDescription: string
  agentConfig: AgentConfigDetails | null
}

export interface RunTeamSnapshotDetails {
  teamId: string
  teamName: string
  members: RunTeamMemberDetails[]
}

export interface PhaseDetails {
  id: string
  name: string
  status: PhaseStatus
  approvalRequired: boolean
  startedAt: string | null
  completedAt: string | null
}

export interface ApprovalDetails {
  phaseId: string
  decision: ApprovalStatus
  reason: string | null
  decidedAt: string
}

export interface RunDetails {
  id: string
  name: string
  projectId: string
  teamSnapshot: RunTeamSnapshotDetails
  channelId: string
  status: RunStatus
  phases: PhaseDetails[]
  currentPhaseId: string | null
  approvalRequired: boolean
  approvals: ApprovalDetails[]
  createdAt: string
}

export interface PhaseInput {
  name: string
  approvalRequired?: boolean
}

export interface CreateRunInput {
  name: string
  projectId: string
  teamId: string
  phases?: PhaseInput[]
  playbookId?: PlaybookId
  approvalRequired?: boolean
}

export interface RunFilter {
  projectId?: string
  status?: RunStatus
}

export interface RunInventory {
  createRun(input: CreateRunInput): RunDetails
  getRunById(id: string): RunDetails | undefined
  listRuns(filter?: RunFilter): RunDetails[]
  updateRunStatus(id: string, status: RunStatus): RunDetails | undefined
  advancePhase(id: string): RunDetails
  approvePhase(
    id: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): RunDetails
  clear(): void
}

// ── Workspace allocation storage & domain types ───────────────────────────

export interface WorkspaceRecord {
  type: WorkspaceType
  name: string | null
  path: string | null
}

export interface WorkspaceAllocationRecord {
  id: string
  run_id: string
  participant_name: string | null
  role_id: string | null
  workspace: WorkspaceRecord
}

export interface WorkspaceDetails {
  type: WorkspaceType
  name: string | null
  path: string | null
}

export interface WorkspaceAllocationDetails {
  id: string
  runId: string
  participantName: string | null
  roleId: string | null
  workspace: WorkspaceDetails
}

export interface CreateWorkspaceAllocationInput {
  participantName?: string
  roleId?: string
  workspace: WorkspaceDetails
}

export interface WorkspaceAllocationInventory {
  createAllocation(
    runId: string,
    input: CreateWorkspaceAllocationInput,
  ): WorkspaceAllocationDetails
  listAllocations(runId: string): WorkspaceAllocationDetails[]
  getAllocationById(id: string): WorkspaceAllocationDetails | undefined
  deleteAllocation(id: string): boolean
  clear(): void
}

// ── Timeline storage & domain types ─────────────────────────────────────────

export interface TimelineEventRecord {
  id: string
  run_id: string
  type: TimelineEventType
  timestamp: string
  data: Record<string, unknown>
}

export interface TimelineEventDetails {
  id: string
  runId: string
  type: TimelineEventType
  timestamp: string
  data: Record<string, unknown>
}

export interface TimelineInventory {
  addEvent(
    runId: string,
    type: TimelineEventType,
    data: Record<string, unknown>,
  ): TimelineEventDetails
  getTimeline(runId: string): TimelineEventDetails[]
  clear(): void
}

export interface ProjectChatDependencies {
  projectInventory: ProjectInventory
  roomRegistry: RoomRegistry
  roleInventory: RoleInventory
  teamInventory: TeamInventory
  runInventory: RunInventory
  workspaceAllocationInventory: WorkspaceAllocationInventory
  timelineInventory: TimelineInventory
  spawnManager?: SpawnManager
}

export function mapProjectRecordToDomain(
  record: ProjectRecord,
): ProjectDetails {
  return {
    id: record.id,
    name: record.name,
    rootPath: record.root_path,
    channelId: record.channel_id,
  }
}

export function mapCreateProjectInputToRecord(
  id: string,
  input: CreateProjectInput,
): ProjectRecord {
  return {
    id,
    name: input.name,
    root_path: input.rootPath,
    channel_id: id,
  }
}

export function mapProjectToDto(project: ProjectDetails): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    root_path: project.rootPath,
    channel_id: project.channelId,
  }
}

export function mapCreateProjectDtoToDomain(
  input: Pick<ProjectDto, 'name' | 'root_path'>,
): CreateProjectInput {
  return {
    name: input.name,
    rootPath: input.root_path,
  }
}

// ── Role mapping functions ──────────────────────────────────────────────────

export function mapAgentConfigRecordToDomain(
  record: AgentConfigRecord | null,
): AgentConfigDetails | null {
  if (!record) return null
  return {
    runtime: record.runtime as AgentRuntime,
    systemPrompt: record.system_prompt,
    model: record.model,
  }
}

export function mapAgentConfigToRecord(
  config: AgentConfigDetails | null,
): AgentConfigRecord | null {
  if (!config) return null
  return {
    runtime: config.runtime,
    system_prompt: config.systemPrompt,
    model: config.model,
  }
}

export function mapRoleRecordToDomain(record: RoleRecord): RoleDetails {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    scope: record.scope,
    projectId: record.project_id,
    agentConfig: mapAgentConfigRecordToDomain(record.agent_config),
  }
}

export function mapAgentConfigToDto(
  config: AgentConfigDetails | null,
): RoleDto['agent_config'] {
  if (!config) return null
  return {
    runtime: config.runtime,
    system_prompt: config.systemPrompt,
    model: config.model,
  }
}

export function mapRoleToDto(role: RoleDetails): RoleDto {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    scope: role.scope,
    project_id: role.projectId,
    agent_config: mapAgentConfigToDto(role.agentConfig),
  }
}

export function mapCreateRoleDtoToDomain(input: {
  name: string
  description: string
  scope: RoleScope
  project_id?: string
  agent_config?: {
    runtime: string
    system_prompt: string | null
    model: string | null
  }
}): CreateRoleInput {
  return {
    name: input.name,
    description: input.description,
    scope: input.scope,
    projectId: input.project_id,
    ...(input.agent_config !== undefined && {
      agentConfig: {
        runtime: input.agent_config.runtime as AgentRuntime,
        systemPrompt: input.agent_config.system_prompt,
        model: input.agent_config.model,
      },
    }),
  }
}

export function mapUpdateRoleDtoToDomain(input: {
  name?: string
  description?: string
  agent_config?: {
    runtime: string
    system_prompt: string | null
    model: string | null
  } | null
}): UpdateRoleInput {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.agent_config !== undefined && {
      agentConfig:
        input.agent_config === null
          ? null
          : {
              runtime: input.agent_config.runtime as AgentRuntime,
              systemPrompt: input.agent_config.system_prompt,
              model: input.agent_config.model,
            },
    }),
  }
}

// ── Team mapping functions ─────────────────────────────────────────────────

export function mapTeamMemberRecordToDomain(
  record: TeamMemberRecord,
): TeamMemberDetails {
  return { roleId: record.role_id }
}

export function mapTeamRecordToDomain(record: TeamRecord): TeamDetails {
  return {
    id: record.id,
    name: record.name,
    projectId: record.project_id,
    members: record.members.map(mapTeamMemberRecordToDomain),
  }
}

export function mapTeamMemberToDto(
  member: TeamMemberDetails,
): TeamMemberRecord {
  return { role_id: member.roleId }
}

export function mapTeamToDto(team: TeamDetails): TeamDto {
  return {
    id: team.id,
    name: team.name,
    project_id: team.projectId,
    members: team.members.map(mapTeamMemberToDto),
  }
}

export function mapCreateTeamDtoToDomain(input: {
  name: string
  project_id: string
  members: { role_id: string }[]
}): CreateTeamInput {
  return {
    name: input.name,
    projectId: input.project_id,
    members: input.members.map((m) => ({ roleId: m.role_id })),
  }
}

export function mapUpdateTeamDtoToDomain(input: {
  name?: string
  members?: { role_id: string }[]
}): UpdateTeamInput {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.members !== undefined && {
      members: input.members.map((m) => ({ roleId: m.role_id })),
    }),
  }
}

// ── Run mapping functions ──────────────────────────────────────────────────

export function mapRunTeamSnapshotRecordToDomain(
  record: RunTeamSnapshotRecord,
): RunTeamSnapshotDetails {
  return {
    teamId: record.team_id,
    teamName: record.team_name,
    members: record.members.map((m) => ({
      roleId: m.role_id,
      roleName: m.role_name,
      roleDescription: m.role_description,
      agentConfig: mapAgentConfigRecordToDomain(m.agent_config),
    })),
  }
}

export function mapPhaseRecordToDomain(record: PhaseRecord): PhaseDetails {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    approvalRequired: record.approval_required,
    startedAt: record.started_at,
    completedAt: record.completed_at,
  }
}

export function mapApprovalRecordToDomain(
  record: ApprovalRecordEntry,
): ApprovalDetails {
  return {
    phaseId: record.phase_id,
    decision: record.decision,
    reason: record.reason,
    decidedAt: record.decided_at,
  }
}

export function mapRunRecordToDomain(record: RunRecord): RunDetails {
  return {
    id: record.id,
    name: record.name,
    projectId: record.project_id,
    teamSnapshot: mapRunTeamSnapshotRecordToDomain(record.team_snapshot),
    channelId: record.channel_id,
    status: record.status,
    phases: record.phases.map(mapPhaseRecordToDomain),
    currentPhaseId: record.current_phase_id,
    approvalRequired: record.approval_required,
    approvals: record.approvals.map(mapApprovalRecordToDomain),
    createdAt: record.created_at,
  }
}

export function mapRunTeamSnapshotToDto(
  snapshot: RunTeamSnapshotDetails,
): RunTeamSnapshot {
  return {
    team_id: snapshot.teamId,
    team_name: snapshot.teamName,
    members: snapshot.members.map(
      (m): RunTeamSnapshotMemberDto => ({
        role_id: m.roleId,
        role_name: m.roleName,
        role_description: m.roleDescription,
        agent_config: mapAgentConfigToDto(m.agentConfig),
      }),
    ),
  }
}

export function mapPhaseToDto(phase: PhaseDetails): PhaseDto {
  return {
    id: phase.id,
    name: phase.name,
    status: phase.status,
    approval_required: phase.approvalRequired,
    started_at: phase.startedAt,
    completed_at: phase.completedAt,
  }
}

export function mapApprovalToDto(approval: ApprovalDetails): ApprovalRecordDto {
  return {
    phase_id: approval.phaseId,
    decision: approval.decision,
    reason: approval.reason,
    decided_at: approval.decidedAt,
  }
}

export function mapRunToDto(run: RunDetails): RunDto {
  return {
    id: run.id,
    name: run.name,
    project_id: run.projectId,
    team_snapshot: mapRunTeamSnapshotToDto(run.teamSnapshot),
    channel_id: run.channelId,
    status: run.status,
    phases: run.phases.map(mapPhaseToDto),
    current_phase_id: run.currentPhaseId,
    approval_required: run.approvalRequired,
    approvals: run.approvals.map(mapApprovalToDto),
    created_at: run.createdAt,
  }
}

// ── Workspace allocation mapping functions ────────────────────────────────

export function mapWorkspaceAllocationRecordToDomain(
  record: WorkspaceAllocationRecord,
): WorkspaceAllocationDetails {
  return {
    id: record.id,
    runId: record.run_id,
    participantName: record.participant_name,
    roleId: record.role_id,
    workspace: { ...record.workspace },
  }
}

export function mapWorkspaceToDto(workspace: WorkspaceDetails): WorkspaceDto {
  return {
    type: workspace.type,
    name: workspace.name,
    path: workspace.path,
  }
}

export function mapWorkspaceAllocationToDto(
  allocation: WorkspaceAllocationDetails,
): WorkspaceAllocationDto {
  return {
    id: allocation.id,
    run_id: allocation.runId,
    participant_name: allocation.participantName,
    role_id: allocation.roleId,
    workspace: mapWorkspaceToDto(allocation.workspace),
  }
}

export function mapCreateWorkspaceAllocationDtoToDomain(input: {
  participant_name?: string
  role_id?: string
  workspace: { type: WorkspaceType; name: string | null; path: string | null }
}): CreateWorkspaceAllocationInput {
  return {
    ...(input.participant_name !== undefined && {
      participantName: input.participant_name,
    }),
    ...(input.role_id !== undefined && { roleId: input.role_id }),
    workspace: {
      type: input.workspace.type,
      name: input.workspace.name,
      path: input.workspace.path,
    },
  }
}

// ── Timeline mapping functions ────────────────────────────────────────────

export function mapTimelineEventToDto(
  event: TimelineEventDetails,
): TimelineEventDto {
  return {
    id: event.id,
    run_id: event.runId,
    type: event.type,
    timestamp: event.timestamp,
    data: event.data,
  }
}

export function mapCreateRunDtoToDomain(input: {
  name: string
  project_id: string
  team_id: string
  phases?: Array<{ name: string; approval_required?: boolean }>
  playbook_id?: PlaybookId
  approval_required?: boolean
}): CreateRunInput {
  return {
    name: input.name,
    projectId: input.project_id,
    teamId: input.team_id,
    ...(input.phases !== undefined && {
      phases: input.phases.map((p) => ({
        name: p.name,
        approvalRequired: p.approval_required,
      })),
    }),
    ...(input.playbook_id !== undefined && {
      playbookId: input.playbook_id,
    }),
    ...(input.approval_required !== undefined && {
      approvalRequired: input.approval_required,
    }),
  }
}

/** Check whether a role is visible to a given project */
export function isRoleVisibleToProject(
  role: RoleDetails,
  projectId: string,
): boolean {
  if (role.scope === 'user') return true
  return role.projectId === projectId
}

/** Validate that all role references in a member list are valid and visible to the project */
function validateTeamMembers(
  members: TeamMemberDetails[],
  projectId: string,
  roleInventory: RoleInventory,
): void {
  for (const member of members) {
    const role = roleInventory.getRoleById(member.roleId)
    if (!role) {
      throw new Error(`role "${member.roleId}" was not found`)
    }
    if (!isRoleVisibleToProject(role, projectId)) {
      throw new Error(
        `role "${member.roleId}" is not visible to project "${projectId}"`,
      )
    }
  }
}

export class InMemoryProjectInventory implements ProjectInventory {
  private readonly records = new Map<string, ProjectRecord>()

  createProject(input: CreateProjectInput): ProjectDetails {
    const id = crypto.randomUUID()
    const record = mapCreateProjectInputToRecord(id, input)

    this.records.set(record.id, record)

    return mapProjectRecordToDomain(record)
  }

  listProjects(): ProjectDetails[] {
    return Array.from(this.records.values(), mapProjectRecordToDomain)
  }

  getProjectById(projectId: string): ProjectDetails | undefined {
    const record = this.records.get(projectId)
    return record ? mapProjectRecordToDomain(record) : undefined
  }

  clear(): void {
    this.records.clear()
  }
}

export class InMemoryRoleInventory implements RoleInventory {
  private readonly records = new Map<string, RoleRecord>()

  createRole(input: CreateRoleInput): RoleDetails {
    const id = crypto.randomUUID()
    const record: RoleRecord = {
      id,
      name: input.name,
      description: input.description,
      scope: input.scope,
      project_id: input.scope === 'project' ? (input.projectId ?? null) : null,
      agent_config: input.agentConfig
        ? mapAgentConfigToRecord(input.agentConfig)
        : null,
    }

    this.records.set(id, record)

    return mapRoleRecordToDomain(record)
  }

  getRoleById(id: string): RoleDetails | undefined {
    const record = this.records.get(id)
    return record ? mapRoleRecordToDomain(record) : undefined
  }

  listRoles(filter?: RoleFilter): RoleDetails[] {
    let results = Array.from(this.records.values())

    if (filter?.scope !== undefined) {
      results = results.filter((r) => r.scope === filter.scope)
    }
    if (filter?.projectId !== undefined) {
      results = results.filter((r) => r.project_id === filter.projectId)
    }

    return results.map(mapRoleRecordToDomain)
  }

  updateRole(id: string, input: UpdateRoleInput): RoleDetails | undefined {
    const record = this.records.get(id)
    if (!record) return undefined

    if (input.name !== undefined) record.name = input.name
    if (input.description !== undefined) record.description = input.description
    if (input.agentConfig !== undefined) {
      record.agent_config = mapAgentConfigToRecord(input.agentConfig)
    }

    return mapRoleRecordToDomain(record)
  }

  deleteRole(id: string): boolean {
    return this.records.delete(id)
  }

  clear(): void {
    this.records.clear()
  }
}

export class InMemoryTeamInventory implements TeamInventory {
  private readonly records = new Map<string, TeamRecord>()

  constructor(
    private readonly projectInventory: ProjectInventory,
    private readonly roleInventory: RoleInventory,
  ) {}

  createTeam(input: CreateTeamInput): TeamDetails {
    const project = this.projectInventory.getProjectById(input.projectId)
    if (!project) {
      throw new Error(`project "${input.projectId}" was not found`)
    }

    validateTeamMembers(input.members, input.projectId, this.roleInventory)

    const id = crypto.randomUUID()
    const record: TeamRecord = {
      id,
      name: input.name,
      project_id: input.projectId,
      members: input.members.map((m) => ({ role_id: m.roleId })),
    }

    this.records.set(id, record)

    return mapTeamRecordToDomain(record)
  }

  getTeamById(id: string): TeamDetails | undefined {
    const record = this.records.get(id)
    return record ? mapTeamRecordToDomain(record) : undefined
  }

  listTeams(filter?: TeamFilter): TeamDetails[] {
    let results = Array.from(this.records.values())

    if (filter?.projectId !== undefined) {
      results = results.filter((r) => r.project_id === filter.projectId)
    }

    return results.map(mapTeamRecordToDomain)
  }

  updateTeam(id: string, input: UpdateTeamInput): TeamDetails | undefined {
    const record = this.records.get(id)
    if (!record) return undefined

    if (input.members !== undefined) {
      validateTeamMembers(input.members, record.project_id, this.roleInventory)
    }

    if (input.name !== undefined) record.name = input.name
    if (input.members !== undefined) {
      record.members = input.members.map((m) => ({ role_id: m.roleId }))
    }

    return mapTeamRecordToDomain(record)
  }

  deleteTeam(id: string): boolean {
    return this.records.delete(id)
  }

  clear(): void {
    this.records.clear()
  }
}

export class InMemoryRunInventory implements RunInventory {
  private readonly records = new Map<string, RunRecord>()

  constructor(
    private readonly projectInventory: ProjectInventory,
    private readonly teamInventory: TeamInventory,
    private readonly timelineInventory?: TimelineInventory,
    private readonly roleInventory?: RoleInventory,
  ) {}

  createRun(input: CreateRunInput): RunDetails {
    if (input.playbookId && input.phases) {
      throw new Error('cannot specify both phases and playbook_id')
    }

    if (input.playbookId) {
      const playbook = getPlaybookById(input.playbookId)
      if (!playbook) {
        throw new Error(`playbook "${input.playbookId}" was not found`)
      }
    }

    const project = this.projectInventory.getProjectById(input.projectId)
    if (!project) {
      throw new Error(`project "${input.projectId}" was not found`)
    }

    const team = this.teamInventory.getTeamById(input.teamId)
    if (!team) {
      throw new Error(`team "${input.teamId}" was not found`)
    }

    if (team.projectId !== input.projectId) {
      throw new Error(
        `team "${input.teamId}" does not belong to project "${input.projectId}"`,
      )
    }

    const id = crypto.randomUUID()
    const channelId = crypto.randomUUID()
    const now = new Date().toISOString()
    const approvalRequired = input.approvalRequired ?? false

    // Resolve phase definitions from either manual phases or playbook
    let phaseInputs: PhaseInput[] = input.phases ?? []
    if (input.playbookId) {
      const playbook = getPlaybookById(input.playbookId)!
      phaseInputs = playbook.phases.map((p) => ({
        name: p.name,
        approvalRequired: p.approval_required,
      }))
    }

    const phases: PhaseRecord[] = phaseInputs.map((p, idx) => ({
      id: crypto.randomUUID(),
      name: p.name,
      status: idx === 0 ? 'active' : 'pending',
      approval_required: p.approvalRequired ?? approvalRequired,
      started_at: idx === 0 ? now : null,
      completed_at: null,
    }))

    const snapshotMembers: RunTeamSnapshotMemberRecord[] = team.members.map(
      (m) => {
        const role = this.roleInventory?.getRoleById(m.roleId)
        return {
          role_id: m.roleId,
          role_name: role?.name ?? '',
          role_description: role?.description ?? '',
          agent_config: role?.agentConfig
            ? mapAgentConfigToRecord(role.agentConfig)
            : null,
        }
      },
    )

    const record: RunRecord = {
      id,
      name: input.name,
      project_id: input.projectId,
      team_snapshot: {
        team_id: team.id,
        team_name: team.name,
        members: snapshotMembers,
      },
      channel_id: channelId,
      status: 'active',
      phases,
      current_phase_id: phases.length > 0 ? phases[0].id : null,
      approval_required: approvalRequired,
      approvals: [],
      created_at: now,
    }

    this.records.set(id, record)

    this.timelineInventory?.addEvent(id, 'run_created', { name: input.name })
    if (phases.length > 0) {
      this.timelineInventory?.addEvent(id, 'phase_started', {
        phase_name: phases[0].name,
      })
    }

    return mapRunRecordToDomain(record)
  }

  getRunById(id: string): RunDetails | undefined {
    const record = this.records.get(id)
    return record ? mapRunRecordToDomain(record) : undefined
  }

  listRuns(filter?: RunFilter): RunDetails[] {
    let results = Array.from(this.records.values())

    if (filter?.projectId !== undefined) {
      results = results.filter((r) => r.project_id === filter.projectId)
    }
    if (filter?.status !== undefined) {
      results = results.filter((r) => r.status === filter.status)
    }

    return results.map(mapRunRecordToDomain)
  }

  updateRunStatus(id: string, status: RunStatus): RunDetails | undefined {
    const record = this.records.get(id)
    if (!record) return undefined

    record.status = status

    return mapRunRecordToDomain(record)
  }

  advancePhase(id: string): RunDetails {
    const record = this.records.get(id)
    if (!record) {
      throw new Error(`run "${id}" was not found`)
    }

    if (record.phases.length === 0) {
      throw new Error('run has no phases to advance')
    }

    if (record.status === 'completed') {
      throw new Error('run is already completed')
    }

    if (record.status === 'pending_approval') {
      throw new Error('run is pending approval')
    }

    // current_phase_id is always kept in sync with phases by this class
    const currentPhase = record.phases.find(
      (p) => p.id === record.current_phase_id,
    )!

    // If approval is required for current phase, go to pending_approval
    if (currentPhase.approval_required) {
      record.status = 'pending_approval'
      this.timelineInventory?.addEvent(id, 'approval_requested', {
        phase_name: currentPhase.name,
      })
      return mapRunRecordToDomain(record)
    }

    // Complete current phase and move to next
    return this.completeCurrentAndActivateNext(record)
  }

  approvePhase(
    id: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ): RunDetails {
    const record = this.records.get(id)
    if (!record) {
      throw new Error(`run "${id}" was not found`)
    }

    if (record.status !== 'pending_approval') {
      throw new Error('run is not pending approval')
    }

    // current_phase_id is always kept in sync with phases by this class
    const currentPhase = record.phases.find(
      (p) => p.id === record.current_phase_id,
    )!

    const now = new Date().toISOString()

    record.approvals.push({
      phase_id: currentPhase.id,
      decision,
      reason: reason ?? null,
      decided_at: now,
    })

    if (decision === 'rejected') {
      currentPhase.status = 'rejected'
      currentPhase.completed_at = now
      record.status = 'active'
      this.timelineInventory?.addEvent(id, 'approval_rejected', {
        phase_name: currentPhase.name,
        reason: reason ?? null,
      })
      this.timelineInventory?.addEvent(id, 'phase_rejected', {
        phase_name: currentPhase.name,
      })
      return mapRunRecordToDomain(record)
    }

    // Approved: complete current phase and move to next
    this.timelineInventory?.addEvent(id, 'approval_granted', {
      phase_name: currentPhase.name,
      reason: reason ?? null,
    })
    return this.completeCurrentAndActivateNext(record)
  }

  private completeCurrentAndActivateNext(record: RunRecord): RunDetails {
    const now = new Date().toISOString()
    const currentPhase = record.phases.find(
      (p) => p.id === record.current_phase_id,
    )!

    currentPhase.status = 'completed'
    currentPhase.completed_at = now

    this.timelineInventory?.addEvent(record.id, 'phase_completed', {
      phase_name: currentPhase.name,
    })

    const currentIdx = record.phases.indexOf(currentPhase)
    const nextPhase = record.phases[currentIdx + 1]

    if (nextPhase) {
      nextPhase.status = 'active'
      nextPhase.started_at = now
      record.current_phase_id = nextPhase.id
      record.status = 'active'
      this.timelineInventory?.addEvent(record.id, 'phase_started', {
        phase_name: nextPhase.name,
      })
    } else {
      record.current_phase_id = null
      record.status = 'completed'
      this.timelineInventory?.addEvent(record.id, 'run_completed', {})
    }

    return mapRunRecordToDomain(record)
  }

  clear(): void {
    this.records.clear()
  }
}

export class InMemoryWorkspaceAllocationInventory implements WorkspaceAllocationInventory {
  private readonly records = new Map<string, WorkspaceAllocationRecord>()

  constructor(private readonly runInventory: RunInventory) {}

  createAllocation(
    runId: string,
    input: CreateWorkspaceAllocationInput,
  ): WorkspaceAllocationDetails {
    const run = this.runInventory.getRunById(runId)
    if (!run) {
      throw new Error(`run "${runId}" was not found`)
    }

    if (!input.participantName && !input.roleId) {
      throw new Error('at least one of participantName or roleId is required')
    }

    if (
      input.workspace.type !== 'project_root' &&
      input.workspace.type !== 'worktree'
    ) {
      throw new Error('workspace type must be "project_root" or "worktree"')
    }

    const id = crypto.randomUUID()
    const record: WorkspaceAllocationRecord = {
      id,
      run_id: runId,
      participant_name: input.participantName ?? null,
      role_id: input.roleId ?? null,
      workspace: {
        type: input.workspace.type,
        name: input.workspace.name,
        path: input.workspace.path,
      },
    }

    this.records.set(id, record)

    return mapWorkspaceAllocationRecordToDomain(record)
  }

  listAllocations(runId: string): WorkspaceAllocationDetails[] {
    return Array.from(this.records.values())
      .filter((r) => r.run_id === runId)
      .map(mapWorkspaceAllocationRecordToDomain)
  }

  getAllocationById(id: string): WorkspaceAllocationDetails | undefined {
    const record = this.records.get(id)
    return record ? mapWorkspaceAllocationRecordToDomain(record) : undefined
  }

  deleteAllocation(id: string): boolean {
    return this.records.delete(id)
  }

  clear(): void {
    this.records.clear()
  }
}

export class InMemoryTimelineInventory implements TimelineInventory {
  private readonly records: TimelineEventRecord[] = []

  addEvent(
    runId: string,
    type: TimelineEventType,
    data: Record<string, unknown>,
  ): TimelineEventDetails {
    const record: TimelineEventRecord = {
      id: crypto.randomUUID(),
      run_id: runId,
      type,
      timestamp: new Date().toISOString(),
      data,
    }

    this.records.push(record)

    return {
      id: record.id,
      runId: record.run_id,
      type: record.type,
      timestamp: record.timestamp,
      data: record.data,
    }
  }

  getTimeline(runId: string): TimelineEventDetails[] {
    return this.records
      .filter((r) => r.run_id === runId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((r) => ({
        id: r.id,
        runId: r.run_id,
        type: r.type,
        timestamp: r.timestamp,
        data: r.data,
      }))
  }

  clear(): void {
    this.records.length = 0
  }
}

class InMemoryRoomRegistry implements RoomRegistry {
  private readonly rooms = new Map<string, Room>()

  getOrCreateRoom(channelId: string = DEFAULT_CHANNEL_ID): Room {
    let room = this.rooms.get(channelId)
    if (!room) {
      room = new Room(channelId)
      this.rooms.set(channelId, room)
    }
    return room
  }

  getRoom(channelId: string = DEFAULT_CHANNEL_ID): Room | undefined {
    return this.rooms.get(channelId)
  }

  findRoomByWebSocket(ws: WS): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.getNameByWebSocket(ws)) {
        return room
      }
    }

    return undefined
  }

  clear(): void {
    this.rooms.clear()
  }
}

export function createProjectChatDependencies({
  projectInventory = new InMemoryProjectInventory(),
  roomRegistry = new InMemoryRoomRegistry(),
  roleInventory = new InMemoryRoleInventory(),
  teamInventory,
  runInventory,
  workspaceAllocationInventory,
  timelineInventory,
  spawnManager,
}: Partial<ProjectChatDependencies> = {}): ProjectChatDependencies {
  const resolvedTeamInventory =
    teamInventory ?? new InMemoryTeamInventory(projectInventory, roleInventory)
  const resolvedTimelineInventory =
    timelineInventory ?? new InMemoryTimelineInventory()
  const resolvedRunInventory =
    runInventory ??
    new InMemoryRunInventory(
      projectInventory,
      resolvedTeamInventory,
      resolvedTimelineInventory,
      roleInventory,
    )
  return {
    projectInventory,
    roomRegistry,
    roleInventory,
    teamInventory: resolvedTeamInventory,
    runInventory: resolvedRunInventory,
    workspaceAllocationInventory:
      workspaceAllocationInventory ??
      new InMemoryWorkspaceAllocationInventory(resolvedRunInventory),
    timelineInventory: resolvedTimelineInventory,
    spawnManager,
  }
}

export const defaultProjectChatDependencies = createProjectChatDependencies()

function resolveProjectRoom(
  projectId: string,
  dependencies: ProjectChatDependencies,
): Room | undefined {
  const project = dependencies.projectInventory.getProjectById(projectId)
  if (!project) return undefined

  return dependencies.roomRegistry.getOrCreateRoom(project.channelId)
}

export function getOrCreateRoom(
  channelId: string = DEFAULT_CHANNEL_ID,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): Room {
  return dependencies.roomRegistry.getOrCreateRoom(channelId)
}

export function getRoom(
  channelId: string = DEFAULT_CHANNEL_ID,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): Room | undefined {
  return dependencies.roomRegistry.getRoom(channelId)
}

export function createProject(
  input: Pick<ProjectDto, 'name' | 'root_path'>,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): ProjectDto {
  const project = dependencies.projectInventory.createProject(
    mapCreateProjectDtoToDomain(input),
  )
  dependencies.roomRegistry.getOrCreateRoom(project.channelId)

  return mapProjectToDto(project)
}

export function listProjects(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): ProjectDto[] {
  return dependencies.projectInventory.listProjects().map(mapProjectToDto)
}

export function getProject(
  projectId: string,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): ProjectDto | undefined {
  const project = dependencies.projectInventory.getProjectById(projectId)
  return project ? mapProjectToDto(project) : undefined
}

export function getProjectRoom(
  projectId: string,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): Room | undefined {
  return resolveProjectRoom(projectId, dependencies)
}

export function findRoomByWebSocket(
  ws: WS,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): Room | undefined {
  return dependencies.roomRegistry.findRoomByWebSocket(ws)
}

export function resetState(
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): void {
  dependencies.roomRegistry.clear()
  dependencies.projectInventory.clear()
  dependencies.roleInventory.clear()
  dependencies.teamInventory.clear()
  dependencies.runInventory.clear()
  dependencies.workspaceAllocationInventory.clear()
  dependencies.timelineInventory.clear()
}

export function getRunRoom(
  runId: string,
  dependencies: ProjectChatDependencies = defaultProjectChatDependencies,
): Room | undefined {
  const run = dependencies.runInventory.getRunById(runId)
  if (!run) return undefined

  return dependencies.roomRegistry.getOrCreateRoom(run.channelId)
}

export { DEFAULT_CHANNEL_ID }
