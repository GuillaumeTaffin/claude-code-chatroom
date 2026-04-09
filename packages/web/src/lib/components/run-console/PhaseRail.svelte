<script lang="ts">
	import type { Phase, Run } from '@chatroom/shared'
	import { Lock } from '@lucide/svelte'

	let { run }: { run: Run } = $props()

	function isCurrent(phase: Phase) {
		return phase.id === run.current_phase_id
	}

	function stationGlyph(phase: Phase): string {
		switch (phase.status) {
			case 'completed':
				return '◆'
			case 'active':
				return '●'
			case 'rejected':
				return '✕'
			default:
				return '○'
		}
	}
</script>

<!--
  Forge phase rail — horizontal track of phase stations.
  Compact: stations sit on a hairline; labels below in tiny mono caps.
-->
<div class="forge-phase-rail relative overflow-x-auto">
	<div class="relative flex min-w-max items-center px-5 py-4">
		<!-- the hairline that runs behind every station -->
		<div
			class="absolute left-5 right-5 top-[1.375rem] h-px bg-ink/15"
			aria-hidden="true"
		></div>

		{#each run.phases as phase, index (phase.id)}
			<div
				class="forge-rise relative flex flex-col items-center"
				style="animation-delay: {index * 60}ms"
			>
				<div class="relative flex h-7 w-7 items-center justify-center">
					<div
						class="absolute inset-0 rounded-full bg-paper-rail"
						aria-hidden="true"
					></div>
					<div
						class={[
							'relative flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-colors',
							phase.status === 'active' &&
								'border border-ember/70 bg-ember/15 text-ember forge-ember-pulse',
							phase.status === 'completed' &&
								'border border-patina/50 bg-patina/10 text-patina',
							phase.status === 'rejected' &&
								'border border-rust/60 bg-rust/15 text-rust',
							phase.status === 'pending' &&
								'border border-ink/15 bg-paper-card text-smoke',
						]}
						aria-current={isCurrent(phase) ? 'step' : undefined}
					>
						{stationGlyph(phase)}
					</div>

					{#if phase.approval_required}
						<span
							class="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-paper-rail text-ember-dim"
							title="approval gate"
						>
							<Lock class="h-2 w-2" strokeWidth={2.5} />
						</span>
					{/if}
				</div>

				<div class="mt-1.5 max-w-[8rem] text-center">
					<div class="text-[8px] uppercase tracking-[0.16em] text-smoke">
						p{String(index + 1).padStart(2, '0')}
					</div>
					<div
						class={[
							'truncate text-[10px]',
							phase.status === 'active'
								? 'text-ink'
								: phase.status === 'completed'
									? 'text-graphite'
									: phase.status === 'rejected'
										? 'text-rust'
										: 'text-smoke',
						]}
						title={phase.name}
					>
						{phase.name}
					</div>
				</div>
			</div>

			{#if index < run.phases.length - 1}
				<div
					class={[
						'mx-1.5 mt-[-1.75rem] h-px w-8 transition-colors',
						run.phases[index + 1].status === 'pending'
							? 'bg-ink/15'
							: 'bg-patina/40',
					]}
					aria-hidden="true"
				></div>
			{/if}
		{/each}
	</div>
</div>
