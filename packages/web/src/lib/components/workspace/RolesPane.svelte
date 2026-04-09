<script lang="ts">
	import type { Role } from '@chatroom/shared'
	import { Trash2 } from '@lucide/svelte'
	import SectionHeader from './SectionHeader.svelte'

	let {
		roles,
		onCreate,
		onDelete,
	}: {
		roles: Role[]
		onCreate: () => void
		onDelete: (id: string) => void | Promise<void>
	} = $props()
</script>

<div class="flex h-full flex-col">
	<SectionHeader
		eyebrow="personas"
		title="roles"
		description="user-global and project-scoped agent personas"
		actionLabel="New Role"
		onAction={onCreate}
	/>

	<div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
		<div class="mx-auto max-w-3xl">
			{#if roles.length === 0}
				<div
					class="border border-dashed border-ink/15 bg-paper-card px-5 py-8 text-center"
				>
					<p class="text-[11px] text-smoke">no roles defined yet</p>
				</div>
			{:else}
				<ul class="divide-y divide-ink/8 border border-ink/10 bg-paper-card">
					{#each roles as role (role.id)}
						{@const isAgent = role.agent_config !== null}
						<li class="flex items-start justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span
										class={[
											'flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-semibold',
											isAgent
												? 'rounded-sm border border-ember/40 bg-ember/10 text-ember'
												: 'rounded-full border border-ink/15 bg-paper-card text-graphite',
										]}
										aria-hidden="true"
									>
										{isAgent ? '◆' : '○'}
									</span>
									<span class="truncate text-xs font-medium text-ink">
										{role.name}
									</span>
									<span
										class={[
											'rounded-sm border px-1 text-[9px] uppercase tracking-[0.12em]',
											role.scope === 'user'
												? 'border-ink/15 bg-paper-card text-smoke'
												: 'border-patina/30 bg-patina/5 text-patina',
										]}
									>
										{role.scope}
									</span>
									{#if isAgent && role.agent_config}
										<span
											class="rounded-sm border border-ember/30 bg-ember/5 px-1 text-[9px] uppercase tracking-[0.12em] text-ember"
										>
											{role.agent_config.runtime}
										</span>
									{:else}
										<span
											class="rounded-sm border border-ink/10 px-1 text-[9px] uppercase tracking-[0.12em] text-smoke"
										>
											human
										</span>
									{/if}
								</div>
								<p class="mt-1 text-[11px] text-smoke">{role.description}</p>
							</div>
							<button
								type="button"
								onclick={() => onDelete(role.id)}
								aria-label="Delete role"
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
