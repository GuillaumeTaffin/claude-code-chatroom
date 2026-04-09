<script lang="ts">
	import type { Run } from '@chatroom/shared'
	import { ArrowRight } from '@lucide/svelte'
	import SectionHeader from './SectionHeader.svelte'

	let {
		runs,
		hasTeams,
		onCreate,
		onSelect,
	}: {
		runs: Run[]
		hasTeams: boolean
		onCreate: () => void
		onSelect: (runId: string) => void
	} = $props()

	function statusToken(status: string) {
		switch (status) {
			case 'active':
				return 'border-ember/40 bg-ember/10 text-ember'
			case 'completed':
				return 'border-patina/40 bg-patina/10 text-patina'
			case 'pending_approval':
				return 'border-ember/60 bg-ember/15 text-ember forge-ember-pulse'
			default:
				return 'border-ink/15 bg-paper-card text-smoke'
		}
	}

	function formatDateTime(iso: string): string {
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}
</script>

<div class="flex h-full flex-col">
	<SectionHeader
		eyebrow="execution"
		title="runs"
		description="active and past sessions"
		actionLabel="New Run"
		actionDisabled={!hasTeams}
		onAction={onCreate}
	/>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
		<div class="mx-auto max-w-3xl">
			{#if runs.length === 0}
				<div
					class="border border-dashed border-ink/15 bg-paper-card px-5 py-8 text-center"
				>
					<p class="text-[11px] text-smoke">
						{hasTeams ? 'no runs yet' : 'create a team first to start a run'}
					</p>
				</div>
			{:else}
				<ul class="divide-y divide-ink/8 border border-ink/10 bg-paper-card">
					{#each runs as run (run.id)}
						<li>
							<button
								type="button"
								onclick={() => onSelect(run.id)}
								class="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-ember/5"
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="truncate text-xs font-medium text-ink">
											{run.name}
										</span>
										<span
											class={[
												'rounded-sm border px-1 text-[9px] uppercase tracking-[0.12em]',
												statusToken(run.status),
											]}
										>
											{run.status.replace('_', ' ')}
										</span>
									</div>
									<p class="mt-0.5 text-[10px] text-smoke">
										team {run.team_snapshot.team_name} · {run.phases.length} phase{run
											.phases.length === 1
											? ''
											: 's'} · {formatDateTime(run.created_at)}
									</p>
								</div>
								<span
									class="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors group-hover:text-ember"
								>
									Open
									<ArrowRight class="h-3 w-3" strokeWidth={2.25} />
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
