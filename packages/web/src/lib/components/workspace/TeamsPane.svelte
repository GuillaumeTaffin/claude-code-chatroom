<script lang="ts">
	import type { Role, Team } from '@chatroom/shared'
	import { Trash2 } from '@lucide/svelte'
	import SectionHeader from './SectionHeader.svelte'

	let {
		teams,
		roles,
		onCreate,
		onDelete,
	}: {
		teams: Team[]
		roles: Role[]
		onCreate: () => void
		onDelete: (id: string) => void | Promise<void>
	} = $props()

	function roleName(roleId: string): string {
		return roles.find((r) => r.id === roleId)?.name ?? roleId.slice(0, 8)
	}
</script>

<div class="flex h-full flex-col">
	<SectionHeader
		eyebrow="compositions"
		title="teams"
		description="saved role compositions for repeated runs"
		actionLabel="New Team"
		onAction={onCreate}
	/>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
		<div class="mx-auto max-w-3xl">
			{#if teams.length === 0}
				<div
					class="border border-dashed border-ink/15 bg-paper-card px-5 py-8 text-center"
				>
					<p class="text-[11px] text-smoke">no teams saved yet</p>
				</div>
			{:else}
				<ul class="divide-y divide-ink/8 border border-ink/10 bg-paper-card">
					{#each teams as team (team.id)}
						<li class="flex items-start justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<p class="text-xs font-medium text-ink">{team.name}</p>
								<div class="mt-1.5 flex flex-wrap gap-1">
									{#each team.members as member (member.role_id)}
										<span
											class="rounded-sm border border-ink/15 bg-paper-card px-1.5 py-px text-[9px] uppercase tracking-[0.1em] text-graphite"
										>
											{roleName(member.role_id)}
										</span>
									{/each}
								</div>
							</div>
							<button
								type="button"
								onclick={() => onDelete(team.id)}
								aria-label="Delete team"
								class="shrink-0 rounded-sm border border-ink/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-smoke transition-colors hover:border-rust/50 hover:text-rust"
							>
								<Trash2 class="h-3 w-3" strokeWidth={2.25} />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
