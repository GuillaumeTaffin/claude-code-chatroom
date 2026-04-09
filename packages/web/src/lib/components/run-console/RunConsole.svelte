<script lang="ts">
	import type {
		Run,
		TimelineEvent,
		WorkspaceAllocation,
	} from '@chatroom/shared'
	import type { ChatMember, ChatMessage } from '$lib/chatroom.svelte.js'
	import MemberRoster from './MemberRoster.svelte'
	import MessageComposer from './MessageComposer.svelte'
	import MessageLine from './MessageLine.svelte'
	import PhaseRail from './PhaseRail.svelte'
	import ReviewPanel from './ReviewPanel.svelte'
	import RunHeader from './RunHeader.svelte'
	import RunJoinForm from './RunJoinForm.svelte'
	import RunTimeline from './RunTimeline.svelte'
	import SystemMessageLine from './SystemMessageLine.svelte'
	import { LogOut } from '@lucide/svelte'

	let {
		run,
		messages,
		members,
		timeline,
		workspaceAllocations,
		connected,
		joinName = $bindable(''),
		joinDescription = $bindable(''),
		messageText = $bindable(''),
		reviewComment = $bindable(''),
		error = '',
		onBack,
		onJoin,
		onSend,
		onDisconnect,
		onAdvance,
		onApprove,
		onSubmitReview,
	}: {
		run: Run
		messages: ChatMessage[]
		members: ChatMember[]
		timeline: TimelineEvent[]
		workspaceAllocations: WorkspaceAllocation[]
		connected: boolean
		joinName: string
		joinDescription: string
		messageText: string
		reviewComment: string
		error?: string
		onBack: () => void
		onJoin: (event: SubmitEvent) => void | Promise<void>
		onSend: (event: SubmitEvent) => void | Promise<void>
		onDisconnect: () => void
		onAdvance: () => void | Promise<void>
		onApprove: (decision: 'approved' | 'rejected') => void | Promise<void>
		onSubmitReview: (event: SubmitEvent) => void | Promise<void>
	} = $props()

	const currentPhase = $derived(
		run.phases.find((phase) => phase.id === run.current_phase_id) ?? null,
	)

	let messagesContainer: HTMLElement | null = $state(null)

	$effect(() => {
		if (messages.length && messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight
			})
		}
	})

	let sidePanel: 'crew' | 'ledger' | 'verdict' = $state('crew')
</script>

<div class="forge-atmosphere relative flex h-screen flex-col">
	<RunHeader {run} {currentPhase} {onBack} {onAdvance} {onApprove} />

	{#if run.phases.length > 0}
		<div class="border-b border-ink/8 bg-paper-rail">
			<PhaseRail {run} />
		</div>
	{/if}

	<div class="flex min-h-0 flex-1">
		<!-- Chat column -->
		<main class="flex min-h-0 flex-1 flex-col">
			{#if !connected}
				<RunJoinForm
					bind:joinName
					bind:joinDescription
					onSubmit={onJoin}
					{error}
				/>
			{:else}
				<div
					bind:this={messagesContainer}
					class="min-h-0 flex-1 overflow-y-auto px-5 py-4"
				>
					<div class="mx-auto flex max-w-2xl flex-col gap-3">
						{#each messages as msg (msg.id)}
							{#if msg.type === 'system'}
								<SystemMessageLine message={msg} />
							{:else}
								<MessageLine message={msg} {members} />
							{/if}
						{/each}
						{#if messages.length === 0}
							<p class="py-8 text-center text-[11px] text-smoke">
								the room is quiet
							</p>
						{/if}
					</div>
				</div>

				<MessageComposer bind:messageText onSubmit={onSend} />
			{/if}
		</main>

		<!-- Side column: crew / ledger / verdict -->
		<aside
			class="hidden w-72 shrink-0 flex-col border-l border-ink/8 bg-paper-rail lg:flex"
		>
			<nav class="flex border-b border-ink/8" aria-label="Side panel">
				{#each ['crew', 'ledger', 'verdict'] as const as panel (panel)}
					<button
						type="button"
						onclick={() => (sidePanel = panel)}
						class={[
							'flex-1 px-2 py-2.5 text-[10px] uppercase tracking-[0.16em] transition-colors',
							sidePanel === panel
								? 'bg-paper-card text-ember'
								: 'text-smoke hover:text-ink',
						]}
						aria-pressed={sidePanel === panel}
					>
						{panel}
					</button>
				{/each}
			</nav>

			<div class="min-h-0 flex-1">
				{#if sidePanel === 'crew'}
					<MemberRoster {members} {workspaceAllocations} />
				{:else if sidePanel === 'ledger'}
					<RunTimeline {timeline} />
				{:else}
					<ReviewPanel bind:comment={reviewComment} onSubmit={onSubmitReview} />
				{/if}
			</div>

			{#if connected}
				<div class="border-t border-ink/8 px-4 py-3">
					<button
						type="button"
						onclick={onDisconnect}
						class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-ink/10 bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors hover:border-rust/50 hover:text-rust"
					>
						<LogOut class="h-3 w-3" strokeWidth={2.25} />
						Disconnect
					</button>
				</div>
			{/if}
		</aside>
	</div>
</div>
