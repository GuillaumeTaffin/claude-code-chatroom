<script lang="ts">
	import type { Role } from '@chatroom/shared'
	import * as Dialog from '$lib/components/ui/dialog/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { cn } from '$lib/utils.js'
	import {
		FORGE_DIALOG_BODY,
		FORGE_DIALOG_CONTENT,
		FORGE_DIALOG_FOOTER,
		FORGE_DIALOG_HEADER,
		FORGE_FIELD_INPUT,
		FORGE_FIELD_LABEL,
		FORGE_PRIMARY_BUTTON,
	} from './forge-dialog.js'

	let {
		open = $bindable(false),
		name = $bindable(''),
		selectedRoleIds = $bindable<string[]>([]),
		availableRoles,
		onSubmit,
	}: {
		open: boolean
		name: string
		selectedRoleIds: string[]
		availableRoles: Role[]
		onSubmit: (event: SubmitEvent) => void | Promise<void>
	} = $props()

	function toggleRole(id: string) {
		if (selectedRoleIds.includes(id)) {
			selectedRoleIds = selectedRoleIds.filter((x) => x !== id)
		} else {
			selectedRoleIds = [...selectedRoleIds, id]
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class={FORGE_DIALOG_CONTENT}>
		<Dialog.Header class={FORGE_DIALOG_HEADER}>
			<p class="text-[10px] uppercase tracking-[0.18em] text-ember">forge</p>
			<Dialog.Title class="mt-0.5 text-sm font-medium text-ink">
				new team
			</Dialog.Title>
			<Dialog.Description class="mt-0.5 text-[11px] text-smoke">
				compose a team from available roles
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={onSubmit}>
			<div class={FORGE_DIALOG_BODY}>
				<div class="space-y-1">
					<label for="team-name" class={FORGE_FIELD_LABEL}>Team name</label>
					<Input
						id="team-name"
						bind:value={name}
						placeholder="feature squad"
						required
						class={FORGE_FIELD_INPUT}
					/>
				</div>

				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Select roles</span>
					{#if availableRoles.length === 0}
						<p class="text-[11px] text-smoke">
							create roles first in the roles section
						</p>
					{:else}
						<ul class="max-h-56 space-y-1 overflow-y-auto">
							{#each availableRoles as role (role.id)}
								{@const selected = selectedRoleIds.includes(role.id)}
								<li>
									<button
										type="button"
										onclick={() => toggleRole(role.id)}
										class={cn(
											'flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
											selected
												? 'border-ember/60 bg-ember/10'
												: 'border-ink/10 bg-paper-card hover:border-ink/20',
										)}
									>
										<span
											class={cn(
												'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px]',
												selected
													? 'border-ember bg-ember text-cream'
													: 'border-ink/20',
											)}
											aria-hidden="true"
										>
											{selected ? '✓' : ''}
										</span>
										<span class="min-w-0 flex-1">
											<span class="text-[11px] font-medium text-ink">
												{role.name}
											</span>
											<span
												class="ml-1.5 text-[9px] uppercase tracking-[0.12em] text-smoke"
											>
												{role.scope}
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
					disabled={selectedRoleIds.length === 0}
					class={cn(
						FORGE_PRIMARY_BUTTON,
						'disabled:cursor-not-allowed disabled:opacity-40',
					)}
				>
					Create Team ({selectedRoleIds.length})
				</button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
