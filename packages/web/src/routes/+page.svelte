<script lang="ts">
	import {
		addReviewFeedback,
		advanceRun,
		approveRun,
		connect,
		createProject,
		createRole,
		createRun,
		createTeam,
		deleteRole,
		deleteTeam,
		disconnect,
		getMembers,
		getMessages,
		getMyName,
		getPlaybooks,
		getProjects,
		getRoles,
		getRuns,
		getSelectedProject,
		getSelectedRun,
		getTeams,
		getTimeline,
		getWorkspaceAllocations,
		isConnected,
		listPlaybooks,
		listProjects,
		listRoles,
		listRuns,
		listTeams,
		listWorkspaceAllocations,
		loadTimeline,
		selectProject,
		selectRun,
		sendMessage,
		spawnProjectAgent,
	} from '$lib/chatroom.svelte.js'
	import CreateRoleDialog from '$lib/components/dialogs/CreateRoleDialog.svelte'
	import CreateRunDialog from '$lib/components/dialogs/CreateRunDialog.svelte'
	import CreateTeamDialog from '$lib/components/dialogs/CreateTeamDialog.svelte'
	import SpawnAgentDialog from '$lib/components/dialogs/SpawnAgentDialog.svelte'
	import ProjectPicker from '$lib/components/project-picker/ProjectPicker.svelte'
	import RunConsole from '$lib/components/run-console/RunConsole.svelte'
	import ChatPane from '$lib/components/workspace/ChatPane.svelte'
	import RolesPane from '$lib/components/workspace/RolesPane.svelte'
	import RunsPane from '$lib/components/workspace/RunsPane.svelte'
	import TeamsPane from '$lib/components/workspace/TeamsPane.svelte'
	import WorkspaceShell from '$lib/components/workspace/WorkspaceShell.svelte'
	import { onMount } from 'svelte'

	// ── Form state ───────────────────────────────────────────────────
	let projectName = $state('')
	let projectRootPath = $state('')
	let joinName = $state('')
	let joinDescription = $state('')
	let messageText = $state('')
	let reviewComment = $state('')
	let error = $state('')
	let workspaceSection = $state<'chat' | 'roles' | 'teams' | 'runs'>('chat')

	// Dialog state
	let showRoleDialog = $state(false)
	let newRoleName = $state('')
	let newRoleDescription = $state('')
	let newRoleScope = $state<'user' | 'project'>('project')
	let newRoleIsAgent = $state(true)
	let newRoleRuntime = $state<'claude' | 'copilot'>('claude')
	let newRoleModel = $state('')
	let newRoleSystemPrompt = $state('')

	let showSpawnDialog = $state(false)
	let selectedSpawnRoleId = $state('')
	let spawning = $state(false)

	let showTeamDialog = $state(false)
	let newTeamName = $state('')
	let selectedRoleIds = $state<string[]>([])

	let showRunDialog = $state(false)
	let newRunName = $state('')
	let selectedTeamId = $state('')
	let selectedPlaybookId = $state('')

	// ── Derived ──────────────────────────────────────────────────────
	const projects = $derived(getProjects())
	const selectedProject = $derived(getSelectedProject())
	const messages = $derived(getMessages())
	const members = $derived(getMembers())
	const connected = $derived(isConnected())
	const myName = $derived(getMyName())
	const roles = $derived(getRoles())
	const teams = $derived(getTeams())
	const runs = $derived(getRuns())
	const playbooks = $derived(getPlaybooks())
	const selectedRun = $derived(getSelectedRun())
	const timeline = $derived(getTimeline())
	const workspaceAllocations = $derived(getWorkspaceAllocations())

	const projectRoles = $derived(
		roles.filter(
			(r) =>
				r.scope === 'user' ||
				(r.scope === 'project' && r.project_id === selectedProject?.id),
		),
	)
	const agentRoles = $derived(
		projectRoles.filter((r) => r.agent_config !== null),
	)

	// ── Lifecycle ────────────────────────────────────────────────────
	onMount(() => {
		void fetchProjects()
	})

	async function fetchProjects() {
		try {
			await listProjects()
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function loadProjectData() {
		if (!selectedProject) return
		error = ''
		try {
			await Promise.all([
				listRoles(undefined, undefined),
				listTeams(selectedProject.id),
				listRuns(selectedProject.id),
				listPlaybooks(),
			])
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function loadRunData() {
		if (!selectedRun) return
		try {
			await Promise.all([
				loadTimeline(selectedRun.id),
				listWorkspaceAllocations(selectedRun.id),
			])
		} catch {
			// non-critical
		}
	}

	// ── Handlers ─────────────────────────────────────────────────────

	async function handleCreateProject(event: SubmitEvent) {
		event.preventDefault()
		error = ''
		try {
			await createProject(projectName.trim(), projectRootPath.trim())
			projectName = ''
			projectRootPath = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	function handleSelectProject(projectId: string) {
		error = ''
		selectProject(projectId)
		void loadProjectData()
	}

	function handleBackToProjects() {
		error = ''
		selectProject('')
		selectRun('')
		workspaceSection = 'chat'
	}

	async function handleJoin(event: SubmitEvent) {
		event.preventDefault()
		error = ''
		try {
			await connect(joinName.trim(), joinDescription.trim())
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleSend(event: SubmitEvent) {
		event.preventDefault()
		if (!messageText.trim()) return
		error = ''
		const text = messageText.trim()
		messageText = ''
		try {
			await sendMessage(text)
		} catch (err) {
			error = (err as Error).message
		}
	}

	function handleDisconnect() {
		disconnect()
	}

	async function handleCreateRole(event: SubmitEvent) {
		event.preventDefault()
		error = ''
		try {
			await createRole(
				newRoleName.trim(),
				newRoleDescription.trim(),
				newRoleScope,
				newRoleScope === 'project' ? selectedProject?.id : undefined,
				newRoleIsAgent
					? {
							runtime: newRoleRuntime,
							system_prompt: newRoleSystemPrompt.trim() || null,
							model: newRoleModel.trim() || null,
						}
					: undefined,
			)
			newRoleName = ''
			newRoleDescription = ''
			newRoleIsAgent = true
			newRoleRuntime = 'claude'
			newRoleModel = ''
			newRoleSystemPrompt = ''
			showRoleDialog = false
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleSpawnAgent(event: SubmitEvent) {
		event.preventDefault()
		if (!selectedProject || !selectedSpawnRoleId) return
		spawning = true
		error = ''
		try {
			await spawnProjectAgent(selectedProject.id, selectedSpawnRoleId)
			selectedSpawnRoleId = ''
			showSpawnDialog = false
		} catch (err) {
			error = (err as Error).message
		} finally {
			spawning = false
		}
	}

	async function handleDeleteRole(id: string) {
		try {
			await deleteRole(id)
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleCreateTeam(event: SubmitEvent) {
		event.preventDefault()
		error = ''
		if (!selectedProject) return
		try {
			await createTeam(
				newTeamName.trim(),
				selectedProject.id,
				selectedRoleIds.map((id) => ({ role_id: id })),
			)
			newTeamName = ''
			selectedRoleIds = []
			showTeamDialog = false
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleDeleteTeam(id: string) {
		try {
			await deleteTeam(id)
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleCreateRun(event: SubmitEvent) {
		event.preventDefault()
		error = ''
		if (!selectedProject) return
		try {
			const run = await createRun(
				newRunName.trim(),
				selectedProject.id,
				selectedTeamId,
				selectedPlaybookId
					? (selectedPlaybookId as 'feature-delivery')
					: undefined,
			)
			newRunName = ''
			selectedTeamId = ''
			selectedPlaybookId = ''
			showRunDialog = false
			selectRun(run.id)
			void loadRunData()
		} catch (err) {
			error = (err as Error).message
		}
	}

	function handleSelectRun(runId: string) {
		selectRun(runId)
		void loadRunData()
	}

	function handleBackToWorkspace() {
		selectRun('')
		if (connected) disconnect()
	}

	async function handleAdvanceRun() {
		if (!selectedRun) return
		try {
			await advanceRun(selectedRun.id)
			void loadRunData()
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleApproveRun(decision: 'approved' | 'rejected') {
		if (!selectedRun) return
		try {
			await approveRun(selectedRun.id, decision)
			void loadRunData()
		} catch (err) {
			error = (err as Error).message
		}
	}

	async function handleAddReview(event: SubmitEvent) {
		event.preventDefault()
		if (!selectedRun || !reviewComment.trim()) return
		try {
			await addReviewFeedback(
				selectedRun.id,
				reviewComment.trim(),
				myName || 'reviewer',
			)
			reviewComment = ''
		} catch (err) {
			error = (err as Error).message
		}
	}

	function openSpawnDialog() {
		showSpawnDialog = true
	}
</script>

<div class="min-h-screen bg-paper text-ink">
	{#if !selectedProject}
		<ProjectPicker
			{projects}
			bind:projectName
			bind:projectRootPath
			{error}
			onCreate={handleCreateProject}
			onSelect={handleSelectProject}
		/>
	{:else if selectedRun}
		<RunConsole
			run={selectedRun}
			{messages}
			{members}
			{timeline}
			{workspaceAllocations}
			{connected}
			bind:joinName
			bind:joinDescription
			bind:messageText
			bind:reviewComment
			{error}
			onBack={handleBackToWorkspace}
			onJoin={handleJoin}
			onSend={handleSend}
			onDisconnect={handleDisconnect}
			onAdvance={handleAdvanceRun}
			onApprove={handleApproveRun}
			onSubmitReview={handleAddReview}
		/>
	{:else}
		<WorkspaceShell
			project={selectedProject}
			bind:section={workspaceSection}
			onBack={handleBackToProjects}
		>
			{#if workspaceSection === 'chat'}
				<ChatPane
					project={selectedProject}
					{messages}
					{members}
					{connected}
					{agentRoles}
					bind:joinName
					bind:joinDescription
					bind:messageText
					{error}
					onJoin={handleJoin}
					onSend={handleSend}
					onDisconnect={handleDisconnect}
					onSpawnAgent={openSpawnDialog}
				/>
			{:else if workspaceSection === 'roles'}
				<RolesPane
					roles={projectRoles}
					onCreate={() => (showRoleDialog = true)}
					onDelete={handleDeleteRole}
				/>
			{:else if workspaceSection === 'teams'}
				<TeamsPane
					{teams}
					roles={projectRoles}
					onCreate={() => (showTeamDialog = true)}
					onDelete={handleDeleteTeam}
				/>
			{:else}
				<RunsPane
					{runs}
					hasTeams={teams.length > 0}
					onCreate={() => (showRunDialog = true)}
					onSelect={handleSelectRun}
				/>
			{/if}
		</WorkspaceShell>
	{/if}

	<CreateRoleDialog
		bind:open={showRoleDialog}
		bind:name={newRoleName}
		bind:description={newRoleDescription}
		bind:scope={newRoleScope}
		bind:isAgent={newRoleIsAgent}
		bind:runtime={newRoleRuntime}
		bind:model={newRoleModel}
		bind:systemPrompt={newRoleSystemPrompt}
		onSubmit={handleCreateRole}
	/>

	<CreateTeamDialog
		bind:open={showTeamDialog}
		bind:name={newTeamName}
		bind:selectedRoleIds
		availableRoles={projectRoles}
		onSubmit={handleCreateTeam}
	/>

	<CreateRunDialog
		bind:open={showRunDialog}
		bind:name={newRunName}
		bind:teamId={selectedTeamId}
		bind:playbookId={selectedPlaybookId}
		{teams}
		{playbooks}
		onSubmit={handleCreateRun}
	/>

	<SpawnAgentDialog
		bind:open={showSpawnDialog}
		bind:selectedRoleId={selectedSpawnRoleId}
		{spawning}
		{agentRoles}
		onSubmit={handleSpawnAgent}
	/>
</div>
