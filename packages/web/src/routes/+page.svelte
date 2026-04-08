<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js'
	import { Badge } from '$lib/components/ui/badge/index.js'
	import { Button } from '$lib/components/ui/button/index.js'
	import * as Card from '$lib/components/ui/card/index.js'
	import * as Dialog from '$lib/components/ui/dialog/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { Label } from '$lib/components/ui/label/index.js'
	import * as ScrollArea from '$lib/components/ui/scroll-area/index.js'
	import * as Select from '$lib/components/ui/select/index.js'
	import { Separator } from '$lib/components/ui/separator/index.js'
	import * as Tabs from '$lib/components/ui/tabs/index.js'
	import { Textarea } from '$lib/components/ui/textarea/index.js'
	import {
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
		listProjects,
		listPlaybooks,
		listRoles,
		listRuns,
		listTeams,
		listWorkspaceAllocations,
		loadTimeline,
		selectProject,
		selectRun,
		sendMessage,
		advanceRun,
		approveRun,
		addReviewFeedback,
	} from '$lib/chatroom.svelte.js'
	import { getMemberInitial, getNameColor } from '$lib/chatroom-ui.js'
	import { cn } from '$lib/utils.js'
	import { onMount } from 'svelte'

	// ── State ────────────────────────────────────────────────────────
	let projectName = $state('')
	let projectRootPath = $state('')
	let joinName = $state('')
	let joinDescription = $state('')
	let messageText = $state('')
	let error = $state('')
	let messagesContainer: HTMLElement | null = $state(null)
	let workspaceTab = $state('chat')

	// Role dialog
	let showRoleDialog = $state(false)
	let newRoleName = $state('')
	let newRoleDescription = $state('')
	let newRoleScope = $state<'user' | 'project'>('project')

	// Team dialog
	let showTeamDialog = $state(false)
	let newTeamName = $state('')
	let selectedRoleIds = $state<string[]>([])

	// Run dialog
	let showRunDialog = $state(false)
	let newRunName = $state('')
	let selectedTeamId = $state('')
	let selectedPlaybookId = $state('')

	// Review dialog
	let reviewComment = $state('')

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

	const currentPhase = $derived(
		selectedRun?.phases.find((p) => p.id === selectedRun.current_phase_id) ??
			null,
	)
	const projectRoles = $derived(
		roles.filter(
			(r) =>
				r.scope === 'user' ||
				(r.scope === 'project' && r.project_id === selectedProject?.id),
		),
	)

	// ── Lifecycle ────────────────────────────────────────────────────
	onMount(() => {
		void fetchProjects()
	})

	$effect(() => {
		if (messages.length && messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight
			})
		}
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
			)
			newRoleName = ''
			newRoleDescription = ''
			showRoleDialog = false
		} catch (err) {
			error = (err as Error).message
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
			workspaceTab = 'chat'
			void loadRunData()
		} catch (err) {
			error = (err as Error).message
		}
	}

	function handleSelectRun(runId: string) {
		selectRun(runId)
		workspaceTab = 'chat'
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

	function toggleRoleInTeam(roleId: string) {
		if (selectedRoleIds.includes(roleId)) {
			selectedRoleIds = selectedRoleIds.filter((id) => id !== roleId)
		} else {
			selectedRoleIds = [...selectedRoleIds, roleId]
		}
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	function formatDateTime(iso: string): string {
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	function getPhaseStatusColor(status: string): string {
		switch (status) {
			case 'active':
				return 'text-emerald-400'
			case 'completed':
				return 'text-blue-400'
			case 'rejected':
				return 'text-rose-400'
			default:
				return 'text-zinc-500'
		}
	}

	function getRunStatusBadge(
		status: string,
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'active':
				return 'default'
			case 'completed':
				return 'secondary'
			case 'pending_approval':
				return 'destructive'
			default:
				return 'outline'
		}
	}

	function getTimelineIcon(type: string): string {
		switch (type) {
			case 'run_created':
				return '▶'
			case 'phase_started':
				return '◆'
			case 'phase_completed':
				return '✓'
			case 'phase_rejected':
				return '✗'
			case 'approval_requested':
				return '⏳'
			case 'approval_granted':
				return '✓'
			case 'approval_rejected':
				return '✗'
			case 'review_feedback':
				return '💬'
			case 'run_completed':
				return '■'
			default:
				return '·'
		}
	}
</script>

<div
	class="dark bg-background text-foreground relative min-h-screen overflow-hidden font-sans"
>
	<!-- Ambient background -->
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.04),_transparent_50%),radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.03),_transparent_50%)]"
	></div>

	<!-- ╔══════════════════════════════════════════════════════════════╗
	     ║  SCREEN 1: PROJECT SELECTION                                ║
	     ╚══════════════════════════════════════════════════════════════╝ -->
	{#if !selectedProject}
		<div
			class="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12"
		>
			<div class="grid w-full gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
				<!-- Create project card -->
				<Card.Root
					class="border-border/50 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur-sm"
				>
					<Card.Header class="space-y-2">
						<Badge
							variant="outline"
							class="w-fit border-blue-500/30 bg-blue-500/10 font-mono text-xs text-blue-400"
						>
							sys::bootstrap
						</Badge>
						<Card.Title class="text-xl font-semibold tracking-tight">
							Register project
						</Card.Title>
						<Card.Description class="text-muted-foreground text-xs">
							Bind a local workspace to the agent collaboration platform.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<form onsubmit={handleCreateProject} class="space-y-4">
							<div class="space-y-1.5">
								<Label for="project-name" class="text-xs">Project name</Label>
								<Input
									id="project-name"
									bind:value={projectName}
									placeholder="chatroom"
									required
									class="h-9 bg-black/20 font-mono text-sm"
								/>
							</div>
							<div class="space-y-1.5">
								<Label for="project-root" class="text-xs">Root path</Label>
								<Input
									id="project-root"
									bind:value={projectRootPath}
									placeholder="/home/user/src/chatroom"
									required
									class="h-9 bg-black/20 font-mono text-sm"
								/>
							</div>
							{#if error}
								<p class="text-destructive text-xs">{error}</p>
							{/if}
							<Button type="submit" class="h-9 w-full text-xs">
								Create Project
							</Button>
						</form>
					</Card.Content>
				</Card.Root>

				<!-- Project list -->
				<Card.Root
					class="border-border/50 bg-card/80 min-h-[28rem] shadow-2xl shadow-black/30 backdrop-blur-sm"
				>
					<Card.Header>
						<div class="flex items-center justify-between">
							<div>
								<Card.Title class="text-xl font-semibold tracking-tight"
									>Workspaces</Card.Title
								>
								<Card.Description class="text-xs"
									>Select a project to open its workspace.</Card.Description
								>
							</div>
							<Badge variant="secondary" class="font-mono"
								>{projects.length}</Badge
							>
						</div>
					</Card.Header>
					<Card.Content>
						{#if projects.length === 0}
							<div
								class="border-border/50 flex min-h-48 items-center justify-center rounded-lg border border-dashed"
							>
								<p class="text-muted-foreground text-xs">
									No projects registered
								</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each projects as project (project.id)}
									<button
										type="button"
										class="border-border/50 hover:border-blue-500/40 hover:bg-blue-500/5 block w-full rounded-lg border p-3 text-left transition-all"
										onclick={() => handleSelectProject(project.id)}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="text-sm font-medium">{project.name}</p>
												<p
													class="text-muted-foreground mt-0.5 truncate font-mono text-xs"
												>
													{project.root_path}
												</p>
											</div>
											<Badge variant="outline" class="shrink-0 text-xs"
												>Open</Badge
											>
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		</div>

		<!-- ╔══════════════════════════════════════════════════════════════╗
	     ║  SCREEN 3: RUN COMMAND CENTER                               ║
	     ╚══════════════════════════════════════════════════════════════╝ -->
	{:else if selectedRun}
		<div class="relative flex h-screen flex-col">
			<!-- Run header bar -->
			<header
				class="border-border/50 bg-card/60 z-10 flex items-center gap-4 border-b px-4 py-2 backdrop-blur-sm"
			>
				<Button
					variant="outline"
					size="sm"
					class="h-7 text-xs"
					onclick={handleBackToWorkspace}
				>
					← Back
				</Button>
				<Separator orientation="vertical" class="h-5" />
				<div class="flex items-center gap-2">
					<span class="font-mono text-xs text-zinc-500">RUN</span>
					<span class="text-sm font-medium">{selectedRun.name}</span>
				</div>
				<Badge variant={getRunStatusBadge(selectedRun.status)} class="text-xs">
					{selectedRun.status.replace('_', ' ')}
				</Badge>
				<span class="text-muted-foreground font-mono text-xs">
					team: {selectedRun.team_snapshot.team_name}
				</span>
				<div class="flex-1"></div>
				{#if selectedRun.status === 'active' && currentPhase}
					<span class="text-xs text-zinc-400">
						Phase: <span class="font-medium text-emerald-400"
							>{currentPhase.name}</span
						>
					</span>
				{/if}
				{#if selectedRun.status === 'pending_approval'}
					<div class="flex gap-1.5">
						<Button
							size="sm"
							class="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
							onclick={() => handleApproveRun('approved')}
						>
							Approve
						</Button>
						<Button
							size="sm"
							variant="destructive"
							class="h-7 text-xs"
							onclick={() => handleApproveRun('rejected')}
						>
							Reject
						</Button>
					</div>
				{:else if selectedRun.status === 'active' && selectedRun.phases.length > 0}
					<Button
						size="sm"
						variant="outline"
						class="h-7 text-xs"
						onclick={handleAdvanceRun}
					>
						Advance Phase →
					</Button>
				{/if}
			</header>

			<!-- Phase progress bar -->
			{#if selectedRun.phases.length > 0}
				<div class="border-border/50 bg-card/40 border-b px-4 py-2">
					<div class="flex items-center gap-1">
						{#each selectedRun.phases as phase, i (phase.id)}
							{#if i > 0}
								<div
									class="h-px w-4 {phase.status === 'completed' ||
									phase.status === 'active'
										? 'bg-blue-500/60'
										: 'bg-zinc-700'}"
								></div>
							{/if}
							<div
								class="flex items-center gap-1.5 rounded-md px-2 py-1 {phase.id ===
								selectedRun.current_phase_id
									? 'bg-blue-500/15 ring-1 ring-blue-500/30'
									: ''}"
							>
								<span
									class="font-mono text-xs {getPhaseStatusColor(phase.status)}"
								>
									{phase.status === 'completed'
										? '✓'
										: phase.status === 'active'
											? '●'
											: phase.status === 'rejected'
												? '✗'
												: '○'}
								</span>
								<span
									class="text-xs {phase.id === selectedRun.current_phase_id
										? 'font-medium text-zinc-200'
										: 'text-zinc-500'}"
								>
									{phase.name}
								</span>
								{#if phase.approval_required}
									<span class="text-[10px] text-amber-500/70">🔒</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Main run content -->
			<div class="flex min-h-0 flex-1">
				<!-- Left: Chat + Join -->
				<div class="flex min-h-0 flex-1 flex-col">
					{#if !connected}
						<!-- Join form for run chat -->
						<div class="flex flex-1 items-center justify-center p-6">
							<Card.Root class="border-border/50 bg-card/80 w-full max-w-sm">
								<Card.Header>
									<Card.Title class="text-lg">Join Run Chat</Card.Title>
									<Card.Description class="text-xs"
										>Connect to participate in this run.</Card.Description
									>
								</Card.Header>
								<Card.Content>
									<form onsubmit={handleJoin} class="space-y-3">
										<div class="space-y-1.5">
											<Label for="run-join-name" class="text-xs">Name</Label>
											<Input
												id="run-join-name"
												bind:value={joinName}
												placeholder="your-name"
												required
												class="h-9 bg-black/20 font-mono text-sm"
											/>
										</div>
										<div class="space-y-1.5">
											<Label for="run-join-desc" class="text-xs">Role</Label>
											<Input
												id="run-join-desc"
												bind:value={joinDescription}
												placeholder="e.g. Lead architect"
												required
												class="h-9 bg-black/20 text-sm"
											/>
										</div>
										{#if error}
											<p class="text-destructive text-xs">{error}</p>
										{/if}
										<Button type="submit" class="h-9 w-full text-xs"
											>Join Chat</Button
										>
									</form>
								</Card.Content>
							</Card.Root>
						</div>
					{:else}
						<!-- Chat messages -->
						<ScrollArea.Root
							bind:viewportRef={messagesContainer}
							class="min-h-0 flex-1"
						>
							<div class="space-y-3 px-4 py-3">
								{#each messages as msg (msg.id)}
									{#if msg.type === 'system'}
										<div class="flex items-center gap-2 py-1">
											<div class="h-px flex-1 bg-zinc-800"></div>
											<span class="text-muted-foreground text-[11px] italic">
												{msg.text}
											</span>
											<div class="h-px flex-1 bg-zinc-800"></div>
										</div>
									{:else}
										<div class="group flex items-start gap-2.5">
											<Avatar.Root size="sm" class="mt-0.5">
												<Avatar.Fallback
													class={cn(
														'bg-muted text-xs font-semibold',
														getNameColor(msg.sender ?? ''),
													)}
												>
													{getMemberInitial(msg.sender)}
												</Avatar.Fallback>
											</Avatar.Root>
											<div class="min-w-0 flex-1">
												<div class="flex items-baseline gap-2">
													<span
														class={cn(
															'text-sm font-semibold',
															getNameColor(msg.sender ?? ''),
														)}
													>
														{msg.sender}
													</span>
													<span class="text-muted-foreground text-[11px]">
														{formatTime(msg.timestamp)}
													</span>
												</div>
												<p
													class="mt-0.5 break-words text-sm leading-relaxed text-zinc-300"
												>
													{msg.text}
												</p>
												{#if msg.mentions.length > 0}
													<div class="mt-1.5 flex flex-wrap gap-1">
														{#each msg.mentions as mention (mention)}
															<Badge
																variant="outline"
																class="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400"
															>
																@{mention}
															</Badge>
														{/each}
													</div>
												{/if}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						</ScrollArea.Root>

						<Separator />

						<!-- Message input -->
						<form onsubmit={handleSend} class="flex gap-2 px-4 py-3">
							<Input
								bind:value={messageText}
								placeholder="Send a message..."
								class="h-9 bg-black/20 text-sm"
							/>
							<Button type="submit" size="sm" class="h-9 px-4 text-xs"
								>Send</Button
							>
						</form>
					{/if}
				</div>

				<!-- Right sidebar: Members + Timeline + Workspaces + Review -->
				<aside
					class="border-border/50 bg-card/40 hidden w-72 flex-col border-l lg:flex"
				>
					<Tabs.Root value="members" class="flex min-h-0 flex-1 flex-col">
						<Tabs.List class="w-full justify-start rounded-none border-b px-2">
							<Tabs.Trigger value="members" class="text-xs"
								>Members</Tabs.Trigger
							>
							<Tabs.Trigger value="timeline" class="text-xs"
								>Timeline</Tabs.Trigger
							>
							<Tabs.Trigger value="review" class="text-xs">Review</Tabs.Trigger>
						</Tabs.List>

						<Tabs.Content value="members" class="mt-0 min-h-0 flex-1">
							<ScrollArea.Root class="h-full">
								<div class="space-y-2 p-3">
									{#each members as member (member.name)}
										<div
											class="border-border/40 flex items-start gap-2 rounded-md border p-2"
										>
											<Avatar.Root size="sm">
												<Avatar.Fallback
													class={cn(
														'bg-muted text-[10px] font-semibold',
														getNameColor(member.name),
													)}
												>
													{getMemberInitial(member.name)}
												</Avatar.Fallback>
											</Avatar.Root>
											<div class="min-w-0">
												<p
													class={cn(
														'truncate text-xs font-medium',
														getNameColor(member.name),
													)}
												>
													{member.name}
												</p>
												<p class="text-muted-foreground text-[10px]">
													{member.description}
												</p>
											</div>
										</div>
									{/each}
									{#if members.length === 0}
										<p class="text-muted-foreground py-4 text-center text-xs">
											No members connected
										</p>
									{/if}

									<!-- Workspace allocations -->
									{#if workspaceAllocations.length > 0}
										<Separator class="my-2" />
										<p
											class="text-muted-foreground text-[10px] uppercase tracking-wider"
										>
											Workspaces
										</p>
										{#each workspaceAllocations as alloc (alloc.id)}
											<div class="border-border/40 rounded-md border p-2">
												<div class="flex items-center gap-1.5">
													<span class="font-mono text-[10px] text-violet-400">
														{alloc.workspace.type === 'worktree' ? '🌿' : '📁'}
													</span>
													<span class="text-xs">
														{alloc.workspace.name ?? 'project root'}
													</span>
												</div>
												{#if alloc.participant_name}
													<p class="text-muted-foreground mt-0.5 text-[10px]">
														→ {alloc.participant_name}
													</p>
												{/if}
											</div>
										{/each}
									{/if}

									{#if connected}
										<Separator class="my-2" />
										<Button
											variant="outline"
											size="sm"
											class="w-full text-xs"
											onclick={handleDisconnect}
										>
											Disconnect
										</Button>
									{/if}
								</div>
							</ScrollArea.Root>
						</Tabs.Content>

						<Tabs.Content value="timeline" class="mt-0 min-h-0 flex-1">
							<ScrollArea.Root class="h-full">
								<div class="space-y-1 p-3">
									{#each timeline as event (event.id)}
										<div class="flex items-start gap-2 py-1">
											<span class="mt-0.5 text-xs">
												{getTimelineIcon(event.type)}
											</span>
											<div class="min-w-0 flex-1">
												<p class="text-xs text-zinc-300">
													{event.type.replace(/_/g, ' ')}
												</p>
												{#if event.data?.phase_name}
													<p class="text-muted-foreground text-[10px]">
														{event.data.phase_name}
													</p>
												{/if}
												{#if event.data?.comment}
													<p class="mt-0.5 text-[10px] text-amber-400/80">
														"{event.data.comment}"
													</p>
												{/if}
												<p class="text-muted-foreground text-[10px]">
													{formatDateTime(event.timestamp)}
												</p>
											</div>
										</div>
									{/each}
									{#if timeline.length === 0}
										<p class="text-muted-foreground py-4 text-center text-xs">
											No events yet
										</p>
									{/if}
								</div>
							</ScrollArea.Root>
						</Tabs.Content>

						<Tabs.Content value="review" class="mt-0 min-h-0 flex-1">
							<div class="flex h-full flex-col p-3">
								<form onsubmit={handleAddReview} class="mt-auto space-y-2 pt-3">
									<Label for="review-comment" class="text-xs"
										>Add review feedback</Label
									>
									<Textarea
										id="review-comment"
										bind:value={reviewComment}
										placeholder="Your feedback..."
										class="min-h-[80px] bg-black/20 text-sm"
									/>
									<Button type="submit" size="sm" class="w-full text-xs">
										Submit Review
									</Button>
								</form>
							</div>
						</Tabs.Content>
					</Tabs.Root>
				</aside>
			</div>
		</div>

		<!-- ╔══════════════════════════════════════════════════════════════╗
	     ║  SCREEN 2: PROJECT WORKSPACE                                ║
	     ╚══════════════════════════════════════════════════════════════╝ -->
	{:else}
		<div class="relative flex h-screen flex-col">
			<!-- Workspace header -->
			<header
				class="border-border/50 bg-card/60 z-10 flex items-center gap-4 border-b px-4 py-2 backdrop-blur-sm"
			>
				<Button
					variant="outline"
					size="sm"
					class="h-7 text-xs"
					onclick={handleBackToProjects}
				>
					← Projects
				</Button>
				<Separator orientation="vertical" class="h-5" />
				<div>
					<span class="text-sm font-medium">{selectedProject.name}</span>
					<span class="text-muted-foreground ml-2 font-mono text-xs"
						>{selectedProject.root_path}</span
					>
				</div>
			</header>

			<!-- Workspace tabs -->
			<Tabs.Root bind:value={workspaceTab} class="flex min-h-0 flex-1 flex-col">
				<div class="border-border/50 border-b px-4">
					<Tabs.List class="h-auto justify-start rounded-none border-0 p-0">
						<Tabs.Trigger value="chat" class="text-xs">Chat</Tabs.Trigger>
						<Tabs.Trigger value="roles" class="text-xs">Roles</Tabs.Trigger>
						<Tabs.Trigger value="teams" class="text-xs">Teams</Tabs.Trigger>
						<Tabs.Trigger value="runs" class="text-xs">Runs</Tabs.Trigger>
					</Tabs.List>
				</div>

				<!-- CHAT TAB -->
				<Tabs.Content value="chat" class="mt-0 min-h-0 flex-1">
					{#if !connected}
						<div class="flex h-full items-center justify-center">
							<Card.Root class="border-border/50 bg-card/80 w-full max-w-sm">
								<Card.Header>
									<Card.Title class="text-lg">Join Project Chat</Card.Title>
									<Card.Description class="text-xs">
										Connect to the project-scoped collaboration channel.
									</Card.Description>
								</Card.Header>
								<Card.Content>
									<form onsubmit={handleJoin} class="space-y-3">
										<div class="space-y-1.5">
											<Label for="proj-join-name" class="text-xs">Name</Label>
											<Input
												id="proj-join-name"
												bind:value={joinName}
												placeholder="your-name"
												required
												class="h-9 bg-black/20 font-mono text-sm"
											/>
										</div>
										<div class="space-y-1.5">
											<Label for="proj-join-desc" class="text-xs"
												>Description</Label
											>
											<Input
												id="proj-join-desc"
												bind:value={joinDescription}
												placeholder="e.g. Frontend engineer"
												required
												class="h-9 bg-black/20 text-sm"
											/>
										</div>
										{#if error}
											<p class="text-destructive text-xs">{error}</p>
										{/if}
										<Button type="submit" class="h-9 w-full text-xs"
											>Join Chat</Button
										>
									</form>
								</Card.Content>
							</Card.Root>
						</div>
					{:else}
						<div class="flex min-h-0 flex-1">
							<!-- Chat messages -->
							<div class="flex min-h-0 flex-1 flex-col">
								<ScrollArea.Root
									bind:viewportRef={messagesContainer}
									class="min-h-0 flex-1"
								>
									<div class="space-y-3 px-4 py-3">
										{#each messages as msg (msg.id)}
											{#if msg.type === 'system'}
												<div class="flex items-center gap-2 py-1">
													<div class="h-px flex-1 bg-zinc-800"></div>
													<span
														class="text-muted-foreground text-[11px] italic"
													>
														{msg.text}
													</span>
													<div class="h-px flex-1 bg-zinc-800"></div>
												</div>
											{:else}
												<div class="group flex items-start gap-2.5">
													<Avatar.Root size="sm" class="mt-0.5">
														<Avatar.Fallback
															class={cn(
																'bg-muted text-xs font-semibold',
																getNameColor(msg.sender ?? ''),
															)}
														>
															{getMemberInitial(msg.sender)}
														</Avatar.Fallback>
													</Avatar.Root>
													<div class="min-w-0 flex-1">
														<div class="flex items-baseline gap-2">
															<span
																class={cn(
																	'text-sm font-semibold',
																	getNameColor(msg.sender ?? ''),
																)}
															>
																{msg.sender}
															</span>
															<span class="text-muted-foreground text-[11px]">
																{formatTime(msg.timestamp)}
															</span>
														</div>
														<p
															class="mt-0.5 break-words text-sm leading-relaxed text-zinc-300"
														>
															{msg.text}
														</p>
													</div>
												</div>
											{/if}
										{/each}
									</div>
								</ScrollArea.Root>
								<Separator />
								<form onsubmit={handleSend} class="flex gap-2 px-4 py-3">
									<Input
										bind:value={messageText}
										placeholder={`Message ${selectedProject.name}...`}
										class="h-9 bg-black/20 text-sm"
									/>
									<Button type="submit" size="sm" class="h-9 px-4 text-xs"
										>Send</Button
									>
								</form>
							</div>

							<!-- Members sidebar -->
							<aside
								class="border-border/50 bg-card/40 hidden w-56 border-l lg:block"
							>
								<div class="p-3">
									<div class="mb-2 flex items-center justify-between">
										<p
											class="text-muted-foreground text-[10px] uppercase tracking-wider"
										>
											Members
										</p>
										<Badge variant="secondary" class="text-[10px]"
											>{members.length}</Badge
										>
									</div>
									<div class="space-y-2">
										{#each members as member (member.name)}
											<div class="flex items-start gap-2">
												<Avatar.Root size="sm">
													<Avatar.Fallback
														class={cn(
															'bg-muted text-[10px] font-semibold',
															getNameColor(member.name),
														)}
													>
														{getMemberInitial(member.name)}
													</Avatar.Fallback>
												</Avatar.Root>
												<div class="min-w-0">
													<p
														class={cn(
															'truncate text-xs font-medium',
															getNameColor(member.name),
														)}
													>
														{member.name}
													</p>
													<p class="text-muted-foreground text-[10px]">
														{member.description}
													</p>
												</div>
											</div>
										{/each}
									</div>
									<Separator class="my-3" />
									<Button
										variant="outline"
										size="sm"
										class="w-full text-xs"
										onclick={handleDisconnect}
									>
										Disconnect
									</Button>
								</div>
							</aside>
						</div>
					{/if}
				</Tabs.Content>

				<!-- ROLES TAB -->
				<Tabs.Content value="roles" class="mt-0 min-h-0 flex-1">
					<ScrollArea.Root class="h-full">
						<div class="mx-auto max-w-3xl p-6">
							<div class="mb-4 flex items-center justify-between">
								<div>
									<h2 class="text-lg font-semibold">Roles</h2>
									<p class="text-muted-foreground text-xs">
										User-global and project-scoped agent personas.
									</p>
								</div>
								<Button
									size="sm"
									class="h-8 text-xs"
									onclick={() => (showRoleDialog = true)}
								>
									+ New Role
								</Button>
							</div>

							{#if projectRoles.length === 0}
								<div
									class="border-border/50 flex min-h-32 items-center justify-center rounded-lg border border-dashed"
								>
									<p class="text-muted-foreground text-xs">
										No roles defined yet
									</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each projectRoles as role (role.id)}
										<div
											class="border-border/50 bg-card/60 flex items-start justify-between rounded-lg border p-3"
										>
											<div>
												<div class="flex items-center gap-2">
													<span class="text-sm font-medium">{role.name}</span>
													<Badge
														variant={role.scope === 'user'
															? 'secondary'
															: 'outline'}
														class="text-[10px]"
													>
														{role.scope}
													</Badge>
												</div>
												<p class="text-muted-foreground mt-0.5 text-xs">
													{role.description}
												</p>
											</div>
											<Button
												variant="outline"
												size="sm"
												class="h-7 text-[10px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
												onclick={() => handleDeleteRole(role.id)}
											>
												Delete
											</Button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</ScrollArea.Root>
				</Tabs.Content>

				<!-- TEAMS TAB -->
				<Tabs.Content value="teams" class="mt-0 min-h-0 flex-1">
					<ScrollArea.Root class="h-full">
						<div class="mx-auto max-w-3xl p-6">
							<div class="mb-4 flex items-center justify-between">
								<div>
									<h2 class="text-lg font-semibold">Teams</h2>
									<p class="text-muted-foreground text-xs">
										Saved role compositions for repeated use.
									</p>
								</div>
								<Button
									size="sm"
									class="h-8 text-xs"
									onclick={() => (showTeamDialog = true)}
								>
									+ New Team
								</Button>
							</div>

							{#if teams.length === 0}
								<div
									class="border-border/50 flex min-h-32 items-center justify-center rounded-lg border border-dashed"
								>
									<p class="text-muted-foreground text-xs">
										No teams saved yet
									</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each teams as team (team.id)}
										<div
											class="border-border/50 bg-card/60 flex items-start justify-between rounded-lg border p-3"
										>
											<div>
												<span class="text-sm font-medium">{team.name}</span>
												<div class="mt-1 flex flex-wrap gap-1">
													{#each team.members as member (member.role_id)}
														{@const role = roles.find(
															(r) => r.id === member.role_id,
														)}
														<Badge variant="outline" class="text-[10px]">
															{role?.name ?? member.role_id.slice(0, 8)}
														</Badge>
													{/each}
												</div>
											</div>
											<Button
												variant="outline"
												size="sm"
												class="h-7 text-[10px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
												onclick={() => handleDeleteTeam(team.id)}
											>
												Delete
											</Button>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</ScrollArea.Root>
				</Tabs.Content>

				<!-- RUNS TAB -->
				<Tabs.Content value="runs" class="mt-0 min-h-0 flex-1">
					<ScrollArea.Root class="h-full">
						<div class="mx-auto max-w-3xl p-6">
							<div class="mb-4 flex items-center justify-between">
								<div>
									<h2 class="text-lg font-semibold">Runs</h2>
									<p class="text-muted-foreground text-xs">
										Active and past execution sessions.
									</p>
								</div>
								<Button
									size="sm"
									class="h-8 text-xs"
									onclick={() => (showRunDialog = true)}
									disabled={teams.length === 0}
								>
									+ New Run
								</Button>
							</div>

							{#if runs.length === 0}
								<div
									class="border-border/50 flex min-h-32 items-center justify-center rounded-lg border border-dashed"
								>
									<p class="text-muted-foreground text-xs">
										{teams.length === 0
											? 'Create a team first to start a run'
											: 'No runs yet'}
									</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each runs as run (run.id)}
										<button
											type="button"
											class="border-border/50 bg-card/60 hover:border-blue-500/40 hover:bg-blue-500/5 block w-full rounded-lg border p-3 text-left transition-all"
											onclick={() => handleSelectRun(run.id)}
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<div class="flex items-center gap-2">
														<span class="text-sm font-medium">{run.name}</span>
														<Badge
															variant={getRunStatusBadge(run.status)}
															class="text-[10px]"
														>
															{run.status.replace('_', ' ')}
														</Badge>
													</div>
													<p
														class="text-muted-foreground mt-0.5 font-mono text-xs"
													>
														team: {run.team_snapshot.team_name} · phases: {run
															.phases.length} · {formatDateTime(run.created_at)}
													</p>
												</div>
												<Badge variant="outline" class="shrink-0 text-xs"
													>Open</Badge
												>
											</div>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</ScrollArea.Root>
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}

	<!-- ╔══════════════════════════════════════════════════════════════╗
	     ║  DIALOGS                                                     ║
	     ╚══════════════════════════════════════════════════════════════╝ -->

	<!-- Create Role Dialog -->
	<Dialog.Root bind:open={showRoleDialog}>
		<Dialog.Content class="border-border/50 bg-card sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>New Role</Dialog.Title>
				<Dialog.Description class="text-xs">
					Define an agent persona for team composition.
				</Dialog.Description>
			</Dialog.Header>
			<form onsubmit={handleCreateRole} class="space-y-3">
				<div class="space-y-1.5">
					<Label for="role-name" class="text-xs">Name</Label>
					<Input
						id="role-name"
						bind:value={newRoleName}
						placeholder="e.g. Frontend Engineer"
						required
						class="h-9 text-sm"
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="role-desc" class="text-xs">Description</Label>
					<Textarea
						id="role-desc"
						bind:value={newRoleDescription}
						placeholder="What this role does..."
						required
						class="min-h-[60px] text-sm"
					/>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Scope</Label>
					<div class="flex gap-2">
						<Button
							type="button"
							variant={newRoleScope === 'project' ? 'default' : 'outline'}
							size="sm"
							class="h-8 flex-1 text-xs"
							onclick={() => (newRoleScope = 'project')}
						>
							Project
						</Button>
						<Button
							type="button"
							variant={newRoleScope === 'user' ? 'default' : 'outline'}
							size="sm"
							class="h-8 flex-1 text-xs"
							onclick={() => (newRoleScope = 'user')}
						>
							Global
						</Button>
					</div>
				</div>
				<Dialog.Footer>
					<Button type="submit" size="sm" class="text-xs">Create Role</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Create Team Dialog -->
	<Dialog.Root bind:open={showTeamDialog}>
		<Dialog.Content class="border-border/50 bg-card sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>New Team</Dialog.Title>
				<Dialog.Description class="text-xs">
					Compose a team from available roles.
				</Dialog.Description>
			</Dialog.Header>
			<form onsubmit={handleCreateTeam} class="space-y-3">
				<div class="space-y-1.5">
					<Label for="team-name" class="text-xs">Team name</Label>
					<Input
						id="team-name"
						bind:value={newTeamName}
						placeholder="e.g. Feature Squad"
						required
						class="h-9 text-sm"
					/>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Select roles</Label>
					{#if projectRoles.length === 0}
						<p class="text-muted-foreground text-xs">
							Create roles first in the Roles tab.
						</p>
					{:else}
						<div class="max-h-48 space-y-1 overflow-y-auto">
							{#each projectRoles as role (role.id)}
								<button
									type="button"
									class="border-border/50 hover:bg-accent/50 flex w-full items-center gap-2 rounded-md border p-2 text-left transition {selectedRoleIds.includes(
										role.id,
									)
										? 'border-blue-500/50 bg-blue-500/10'
										: ''}"
									onclick={() => toggleRoleInTeam(role.id)}
								>
									<span
										class="flex h-4 w-4 items-center justify-center rounded border text-[10px] {selectedRoleIds.includes(
											role.id,
										)
											? 'border-blue-500 bg-blue-500 text-white'
											: 'border-zinc-600'}"
									>
										{selectedRoleIds.includes(role.id) ? '✓' : ''}
									</span>
									<div class="min-w-0 flex-1">
										<span class="text-xs font-medium">{role.name}</span>
										<Badge variant="outline" class="ml-1 text-[9px]"
											>{role.scope}</Badge
										>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<Dialog.Footer>
					<Button
						type="submit"
						size="sm"
						class="text-xs"
						disabled={selectedRoleIds.length === 0}
					>
						Create Team ({selectedRoleIds.length} roles)
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Create Run Dialog -->
	<Dialog.Root bind:open={showRunDialog}>
		<Dialog.Content class="border-border/50 bg-card sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>New Run</Dialog.Title>
				<Dialog.Description class="text-xs">
					Invoke a team for a piece of work.
				</Dialog.Description>
			</Dialog.Header>
			<form onsubmit={handleCreateRun} class="space-y-3">
				<div class="space-y-1.5">
					<Label for="run-name" class="text-xs">Run name</Label>
					<Input
						id="run-name"
						bind:value={newRunName}
						placeholder="e.g. Implement login page"
						required
						class="h-9 text-sm"
					/>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Team</Label>
					<Select.Root type="single" bind:value={selectedTeamId}>
						<Select.Trigger class="h-9 text-sm">
							{teams.find((t) => t.id === selectedTeamId)?.name ||
								'Select a team...'}
						</Select.Trigger>
						<Select.Content>
							{#each teams as team (team.id)}
								<Select.Item value={team.id} class="text-sm"
									>{team.name}</Select.Item
								>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Playbook (optional)</Label>
					<Select.Root type="single" bind:value={selectedPlaybookId}>
						<Select.Trigger class="h-9 text-sm">
							{playbooks.find((p) => p.id === selectedPlaybookId)?.name ||
								'No playbook (manual phases)'}
						</Select.Trigger>
						<Select.Content>
							{#each playbooks as pb (pb.id)}
								<Select.Item value={pb.id} class="text-sm">
									<div>
										<p>{pb.name}</p>
										<p class="text-muted-foreground text-[10px]">
											{pb.description}
										</p>
									</div>
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<Dialog.Footer>
					<Button
						type="submit"
						size="sm"
						class="text-xs"
						disabled={!selectedTeamId}
					>
						Create Run
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
</div>
