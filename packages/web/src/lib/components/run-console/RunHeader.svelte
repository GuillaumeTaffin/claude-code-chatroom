<script lang="ts">
	import type { Phase, Run } from '@chatroom/shared'
	import { Button } from '$lib/components/ui/button/index.js'
	import { ArrowLeft, ArrowRight, Check, X } from '@lucide/svelte'

	let {
		run,
		currentPhase,
		onBack,
		onAdvance,
		onApprove,
	}: {
		run: Run
		currentPhase: Phase | null
		onBack: () => void
		onAdvance: () => void | Promise<void>
		onApprove: (decision: 'approved' | 'rejected') => void | Promise<void>
	} = $props()

	const statusLabel = $derived(run.status.replace('_', ' '))
	const isPending = $derived(run.status === 'pending_approval')
	const canAdvance = $derived(run.status === 'active' && run.phases.length > 0)
</script>

<header
	class={[
		'relative z-10 border-b border-ink/8 transition-colors',
		isPending ? 'bg-ember/8' : 'bg-paper-card',
	]}
>
	<div class="flex items-center gap-4 px-5 py-3">
		<button
			type="button"
			onclick={onBack}
			class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors hover:text-ink"
		>
			<ArrowLeft class="h-3 w-3" strokeWidth={2.25} />
			workspace
		</button>

		<div class="h-5 w-px bg-ink/8"></div>

		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="text-[10px] uppercase tracking-[0.18em] text-smoke">
					run · {run.team_snapshot.team_name}
				</span>
				<span
					class={[
						'inline-flex items-center rounded-sm border px-1.5 py-px text-[9px] uppercase tracking-[0.16em]',
						run.status === 'active' && 'border-ember/40 bg-ember/10 text-ember',
						run.status === 'completed' &&
							'border-patina/40 bg-patina/10 text-patina',
						run.status === 'pending_approval' &&
							'border-ember/60 bg-ember/15 text-ember forge-ember-pulse',
					]}
				>
					{statusLabel}
				</span>
			</div>
			<h1 class="mt-0.5 truncate text-sm font-medium text-ink" title={run.name}>
				{run.name}
			</h1>
			{#if currentPhase}
				<p class="mt-0.5 text-[10px] text-smoke">
					now <span class="text-ink">→</span>
					<span class="text-ink">{currentPhase.name}</span>
				</p>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1.5">
			{#if isPending}
				<Button
					size="sm"
					onclick={() => onApprove('approved')}
					class="h-7 gap-1 rounded-sm bg-forge-green px-3 text-[10px] uppercase tracking-[0.14em] text-cream hover:bg-forge-green/90"
				>
					<Check class="h-3 w-3" strokeWidth={2.5} />
					Approve
				</Button>
				<Button
					size="sm"
					onclick={() => onApprove('rejected')}
					class="h-7 gap-1 rounded-sm border border-rust/60 bg-transparent px-3 text-[10px] uppercase tracking-[0.14em] text-rust hover:bg-rust/10"
				>
					<X class="h-3 w-3" strokeWidth={2.5} />
					Reject
				</Button>
			{:else if canAdvance}
				<Button
					size="sm"
					onclick={onAdvance}
					class="h-7 gap-1 rounded-sm border border-ember/40 bg-ember/10 px-3 text-[10px] uppercase tracking-[0.14em] text-ember hover:bg-ember/15"
				>
					Advance
					<ArrowRight class="h-3 w-3" strokeWidth={2.5} />
				</Button>
			{/if}
		</div>
	</div>

	{#if isPending}
		<div
			class="border-t border-ember/20 bg-ember/5 px-5 py-1.5 text-[11px] text-ember"
		>
			This run is paused at an approval gate — cast your verdict.
		</div>
	{/if}
</header>
