<script lang="ts">
	import type { Playbook, Team } from '@chatroom/shared'
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
		teamId = $bindable(''),
		playbookId = $bindable(''),
		teams,
		playbooks,
		onSubmit,
	}: {
		open: boolean
		name: string
		teamId: string
		playbookId: string
		teams: Team[]
		playbooks: Playbook[]
		onSubmit: (event: SubmitEvent) => void | Promise<void>
	} = $props()
</script>

<Dialog.Root bind:open>
	<Dialog.Content class={FORGE_DIALOG_CONTENT}>
		<Dialog.Header class={FORGE_DIALOG_HEADER}>
			<p class="text-[10px] uppercase tracking-[0.18em] text-ember">forge</p>
			<Dialog.Title class="mt-0.5 text-sm font-medium text-ink">
				new run
			</Dialog.Title>
			<Dialog.Description class="mt-0.5 text-[11px] text-smoke">
				invoke a team for a piece of work
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={onSubmit}>
			<div class={FORGE_DIALOG_BODY}>
				<div class="space-y-1">
					<label for="run-name" class={FORGE_FIELD_LABEL}>Run name</label>
					<Input
						id="run-name"
						bind:value={name}
						placeholder="implement login page"
						required
						class={FORGE_FIELD_INPUT}
					/>
				</div>

				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Team</span>
					<div class="space-y-1">
						{#each teams as team (team.id)}
							{@const selected = teamId === team.id}
							<button
								type="button"
								onclick={() => (teamId = team.id)}
								class={cn(
									'flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
									selected
										? 'border-ember/60 bg-ember/10'
										: 'border-ink/10 bg-paper-card hover:border-ink/20',
								)}
							>
								<span
									class={cn(
										'h-2 w-2 shrink-0 rounded-full',
										selected ? 'bg-ember' : 'bg-ink/15',
									)}
									aria-hidden="true"
								></span>
								<span class="text-[11px] text-ink">{team.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Playbook (optional)</span>
					<div class="space-y-1">
						<button
							type="button"
							onclick={() => (playbookId = '')}
							class={cn(
								'flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors',
								playbookId === ''
									? 'border-ember/60 bg-ember/10'
									: 'border-ink/10 bg-paper-card hover:border-ink/20',
							)}
						>
							<span
								class={cn(
									'h-2 w-2 shrink-0 rounded-full',
									playbookId === '' ? 'bg-ember' : 'bg-ink/15',
								)}
								aria-hidden="true"
							></span>
							<span class="text-[11px] text-ink">no playbook</span>
							<span class="text-[10px] text-smoke">manual phases</span>
						</button>
						{#each playbooks as pb (pb.id)}
							{@const selected = playbookId === pb.id}
							<button
								type="button"
								onclick={() => (playbookId = pb.id)}
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
									<span class="block text-[11px] text-ink">{pb.name}</span>
									<span class="block text-[10px] text-smoke">
										{pb.description}
									</span>
								</span>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class={FORGE_DIALOG_FOOTER}>
				<button
					type="submit"
					disabled={!teamId}
					class={cn(
						FORGE_PRIMARY_BUTTON,
						'disabled:cursor-not-allowed disabled:opacity-40',
					)}
				>
					Create Run
				</button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
