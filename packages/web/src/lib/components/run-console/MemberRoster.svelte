<script lang="ts">
	import type { ChatMember } from '$lib/chatroom.svelte.js'
	import type { WorkspaceAllocation } from '@chatroom/shared'
	import {
		getMemberInitial,
		getNameColor,
		isAgentMember,
	} from '$lib/chatroom-ui.js'
	import { cn } from '$lib/utils.js'
	import { GitBranch, FolderTree } from '@lucide/svelte'

	let {
		members,
		workspaceAllocations,
	}: {
		members: ChatMember[]
		workspaceAllocations: WorkspaceAllocation[]
	} = $props()

	function allocationsFor(memberName: string) {
		return workspaceAllocations.filter(
			(alloc) => alloc.participant_name === memberName,
		)
	}

	const humanCount = $derived(
		members.filter((member) => !isAgentMember(member)).length,
	)
	const agentCount = $derived(members.length - humanCount)
</script>

<section class="flex h-full flex-col">
	<header
		class="flex items-baseline justify-between border-b border-ink/8 px-4 py-3"
	>
		<div>
			<h3 class="text-[10px] uppercase tracking-[0.18em] text-ink">crew</h3>
			<p class="mt-0.5 text-[10px] text-smoke">
				{humanCount} human · {agentCount} agent{agentCount === 1 ? '' : 's'}
			</p>
		</div>
		<div class="text-[10px] text-smoke" aria-label="member count">
			{String(members.length).padStart(2, '0')}
		</div>
	</header>

	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if members.length === 0}
			<p class="py-4 text-center text-[11px] text-smoke">room is empty</p>
		{:else}
			<ul class="space-y-2.5">
				{#each members as member (member.name)}
					{@const isAgent = isAgentMember(member)}
					{@const colorClass = getNameColor(member.name)}
					{@const allocs = allocationsFor(member.name)}
					<li class="flex items-start gap-2">
						<div
							class={cn(
								'flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold',
								isAgent
									? 'rounded-sm border border-ink/15 bg-paper-bright'
									: 'rounded-full border border-ink/10 bg-paper-card',
								colorClass,
							)}
							aria-hidden="true"
						>
							{getMemberInitial(member.name)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-1.5">
								<span class={cn('truncate text-xs font-semibold', colorClass)}>
									{member.name}
								</span>
								{#if isAgent && member.runtime}
									<span
										class="rounded-sm border border-ember/30 bg-ember/5 px-1 text-[9px] uppercase tracking-[0.12em] text-ember"
									>
										{member.runtime.runtime_id}
									</span>
								{/if}
							</div>
							<p class="mt-0.5 text-[10px] text-smoke">
								{member.description}
							</p>
							{#if allocs.length > 0}
								<ul class="mt-1 space-y-0.5">
									{#each allocs as alloc (alloc.id)}
										<li
											class="flex items-center gap-1 text-[9px] text-patina-dim"
										>
											{#if alloc.workspace.type === 'worktree'}
												<GitBranch class="h-2.5 w-2.5" strokeWidth={1.75} />
											{:else}
												<FolderTree class="h-2.5 w-2.5" strokeWidth={1.75} />
											{/if}
											<span class="truncate">
												{alloc.workspace.name ?? 'project root'}
											</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
