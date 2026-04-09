// ── Runtime capability model ─────────────────────────────────────────────────

export interface RuntimeCapabilities {
  can_stream_events: boolean
  can_use_tools: boolean
  can_manage_files: boolean
  can_execute_commands: boolean
}

export interface RuntimeIdentity {
  runtime_id: string
  runtime_version: string | null
  capabilities: RuntimeCapabilities
}

// ── Member identity ──────────────────────────────────────────────────────────

export interface Member {
  name: string
  description: string
}

export interface MemberWithRuntime extends Member {
  channel_id: string
  runtime?: RuntimeIdentity
}

export interface Project {
  id: string
  name: string
  root_path: string
  channel_id: string
}

// ── Role definitions ────────────────────────────────────────────────────────

export type RoleScope = 'user' | 'project'

export type AgentRuntime = 'claude' | 'copilot'

export interface AgentConfig {
  runtime: AgentRuntime
  system_prompt: string | null
  model: string | null
}

export interface Role {
  id: string
  name: string
  description: string
  scope: RoleScope
  project_id: string | null
  agent_config: AgentConfig | null
}

export interface CreateRoleRequest {
  name: string
  description: string
  scope: RoleScope
  project_id?: string
  agent_config?: AgentConfig
}

export interface CreateRoleResponse {
  role: Role
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  agent_config?: AgentConfig | null
}

export interface UpdateRoleResponse {
  role: Role
}

export interface RolesResponse {
  roles: Role[]
}

export interface RoleResponse {
  role: Role
}

export interface DeleteRoleResponse {
  deleted: boolean
}

// ── Team definitions ───────────────────────────────────────────────────────

export interface TeamMember {
  role_id: string
}

export interface Team {
  id: string
  name: string
  project_id: string
  members: TeamMember[]
}

export interface CreateTeamRequest {
  name: string
  project_id: string
  members: TeamMember[]
}

export interface CreateTeamResponse {
  team: Team
}

export interface UpdateTeamRequest {
  name?: string
  members?: TeamMember[]
}

export interface UpdateTeamResponse {
  team: Team
}

export interface TeamsResponse {
  teams: Team[]
}

export interface TeamResponse {
  team: Team
}

export interface DeleteTeamResponse {
  deleted: boolean
}

// ── Playbook definitions ──────────────────────────────────────────────────

export type PlaybookId = 'feature-delivery'

export interface Playbook {
  id: PlaybookId
  name: string
  description: string
  phases: Array<{
    name: string
    description: string
    approval_required: boolean
  }>
}

export interface PlaybooksResponse {
  playbooks: Playbook[]
}

export interface PlaybookResponse {
  playbook: Playbook
}

// ── Run definitions ────────────────────────────────────────────────────────

export type RunStatus = 'active' | 'completed' | 'pending_approval'

export type PhaseStatus = 'pending' | 'active' | 'completed' | 'rejected'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface Phase {
  id: string
  name: string
  status: PhaseStatus
  approval_required: boolean
  started_at: string | null
  completed_at: string | null
}

export interface PhaseTransitionRequest {
  action: 'advance'
}

export interface ApprovalRequest {
  decision: 'approved' | 'rejected'
  reason?: string
}

export interface ApprovalRecord {
  phase_id: string
  decision: ApprovalStatus
  reason: string | null
  decided_at: string
}

export interface RunTeamSnapshotMember {
  role_id: string
  role_name: string
  role_description: string
  agent_config: AgentConfig | null
}

export interface RunTeamSnapshot {
  team_id: string
  team_name: string
  members: RunTeamSnapshotMember[]
}

export interface Run {
  id: string
  name: string
  project_id: string
  team_snapshot: RunTeamSnapshot
  channel_id: string
  status: RunStatus
  phases: Phase[]
  current_phase_id: string | null
  approval_required: boolean
  approvals: ApprovalRecord[]
  created_at: string
}

export interface CreateRunRequest {
  name: string
  project_id: string
  team_id: string
  phases?: Array<{ name: string; approval_required?: boolean }>
  playbook_id?: PlaybookId
  approval_required?: boolean
}

export interface CreateRunResponse {
  run: Run
}

export interface RunsResponse {
  runs: Run[]
}

export interface RunResponse {
  run: Run
}

export interface AdvanceRunResponse {
  run: Run
}

export interface ApproveRunResponse {
  run: Run
}

// ── Workspace allocation definitions ──────────────────────────────────────────

export type WorkspaceType = 'project_root' | 'worktree'

export interface Workspace {
  type: WorkspaceType
  name: string | null // null for project_root
  path: string | null // null for project_root
}

export interface WorkspaceAllocation {
  id: string
  run_id: string
  participant_name: string | null // assigned to a participant
  role_id: string | null // assigned to a role
  workspace: Workspace
}

export interface CreateWorkspaceAllocationRequest {
  participant_name?: string
  role_id?: string
  workspace: Workspace
}

export interface WorkspaceAllocationResponse {
  allocation: WorkspaceAllocation
}

export interface WorkspaceAllocationsResponse {
  allocations: WorkspaceAllocation[]
}

export interface DeleteWorkspaceAllocationResponse {
  deleted: boolean
}

// ── REST API types ──────────────────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string
  root_path: string
}

export interface CreateProjectResponse {
  project: Project
}

export interface ProjectsResponse {
  projects: Project[]
}

export interface ConnectRequest {
  name: string
  description: string
  project_id: string
  run_id?: string
  runtime?: RuntimeIdentity
}

export interface ConnectResponse {
  project_id: string
  channel_id: string
  run_id?: string
  runtime?: RuntimeIdentity
}

export interface MembersResponse {
  project_id: string
  run_id?: string
  members: MemberWithRuntime[]
}

// ── WebSocket message payloads ──────────────────────────────────────────────

/** Client → Server: send a message to the room */
export interface SendMessageParams {
  channel_id: string
  text: string
  mentions?: string[]
}

/** Server → Client: a new message was posted */
export interface NewMessageParams {
  sender: string
  sender_role: string
  text: string
  mentions: string[]
  timestamp: string
}

/** Server → Client: a member joined the room */
export interface MemberJoinedParams {
  name: string
  description: string
  timestamp: string
}

/** Server → Client: a member left the room */
export interface MemberLeftParams {
  name: string
  timestamp: string
}

// ── Normalized chat events ──────────────────────────────────────────────────

export interface ChatMessageEvent extends NewMessageParams {
  type: 'message'
}

export interface ChatMemberJoinedEvent extends MemberJoinedParams {
  type: 'member_joined'
}

export interface ChatMemberLeftEvent extends MemberLeftParams {
  type: 'member_left'
}

export type ChatEvent =
  | ChatMessageEvent
  | ChatMemberJoinedEvent
  | ChatMemberLeftEvent

// ── Timeline event types ──────────────────────────────────────────────────

export type TimelineEventType =
  | 'run_created'
  | 'phase_started'
  | 'phase_completed'
  | 'phase_rejected'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'review_feedback'
  | 'run_completed'

export interface TimelineEvent {
  id: string
  run_id: string
  type: TimelineEventType
  timestamp: string
  data: Record<string, unknown>
}

export interface CreateReviewFeedbackRequest {
  run_id: string
  comment: string
  author: string
}

export interface TimelineResponse {
  events: TimelineEvent[]
}

export interface ReviewFeedbackResponse {
  event: TimelineEvent
}
