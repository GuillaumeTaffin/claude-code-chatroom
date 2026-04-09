<script lang="ts">
	import type { Role } from '@chatroom/shared'
	import * as Dialog from '$lib/components/ui/dialog/index.js'
	import { cn } from '$lib/utils.js'
	import {
		FORGE_DIALOG_BODY,
		FORGE_DIALOG_CONTENT,
		FORGE_DIALOG_FOOTER,
		FORGE_DIALOG_HEADER,
		FORGE_FIELD_LABEL,
		FORGE_PRIMARY_BUTTON,
	} from './forge-dialog.js'

	let {
		open = $bindable(false),
		selectedRoleId = $bindable(''),
		spawning = false,
		agentRoles,
		onSubmit,
	}: {
		open: boolean
		selectedRoleId: string
		spawning?: boolean
		agentRoles: Role[]
		onSubmit: (event: SubmitEvent) => void | Promise<void>
	} = $props()
</script>

<Dialog.Root bind:open>
	<Dialog.Content class={FORGE_DIALOG_CONTENT}>
		<Dialog.Header class={FORGE_DIALOG_HEADER}>
			<p class="text-[10px] uppercase tracking-[0.18em] text-ember">forge</p>
			<Dialog.Title class="mt-0.5 text-sm font-medium text-ink">
				spawn agent
			</Dialog.Title>
			<Dialog.Description class="mt-0.5 text-[11px] text-smoke">
				select an agent role to spawn into the project
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={onSubmit}>
			<div class={FORGE_DIALOG_BODY}>
				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Agent role</span>
					{#if agentRoles.length === 0}
						<p class="text-[11px] text-smoke">
							no agent roles available — create one with an agent runtime first
						</p>
					{:else}
						<ul class="max-h-56 space-y-1 overflow-y-auto">
							{#each agentRoles as role (role.id)}
								{@const selected = selectedRoleId === role.id}
								<li>
									<button
										type="button"
										onclick={() => (selectedRoleId = role.id)}
										class={cn(
											'flex w-full items-start gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
											selected
												? 'border-ember/60 bg-ember/10'
												: 'border-ink/10 bg-paper-card hover:border-ink/20',
										)}
									>
										<span
											class={cn(
												'mt-1.5 h-2 w-2 shrink-0 rounded-full',
												selected ? 'bg-ember' : 'bg-ink/15',
											)}
											aria-hidden="true"
										></span>
										<span class="min-w-0 flex-1">
											<span class="flex items-center gap-1.5">
												<span class="text-[11px] font-medium text-ink">
													{role.name}
												</span>
												{#if role.agent_config}
													<span
														class="rounded-sm border border-ember/30 bg-ember/5 px-1 text-[9px] uppercase tracking-[0.12em] text-ember"
													>
														{role.agent_config.runtime}
													</span>
												{/if}
											</span>
											<span class="mt-0.5 block text-[10px] text-smoke">
												{role.description}
											</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			<div class={FORGE_DIALOG_FOOTER}>
				<button
					type="submit"
					disabled={!selectedRoleId || spawning}
					class={cn(
						FORGE_PRIMARY_BUTTON,
						'disabled:cursor-not-allowed disabled:opacity-40',
					)}
				>
					{spawning ? 'Spawning…' : 'Spawn Agent'}
				</button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
