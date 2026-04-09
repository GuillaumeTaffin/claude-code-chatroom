<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { Textarea } from '$lib/components/ui/textarea/index.js'
	import { cn } from '$lib/utils.js'
	import {
		FORGE_DIALOG_BODY,
		FORGE_DIALOG_CONTENT,
		FORGE_DIALOG_FOOTER,
		FORGE_DIALOG_HEADER,
		FORGE_FIELD_INPUT,
		FORGE_FIELD_LABEL,
		FORGE_FIELD_TEXTAREA,
		FORGE_PRIMARY_BUTTON,
		FORGE_SEGMENT_BUTTON_ACTIVE,
		FORGE_SEGMENT_BUTTON_BASE,
		FORGE_SEGMENT_BUTTON_INACTIVE,
	} from './forge-dialog.js'

	let {
		open = $bindable(false),
		name = $bindable(''),
		description = $bindable(''),
		scope = $bindable<'user' | 'project'>('project'),
		isAgent = $bindable(true),
		runtime = $bindable<'claude' | 'copilot'>('claude'),
		model = $bindable(''),
		systemPrompt = $bindable(''),
		onSubmit,
	}: {
		open: boolean
		name: string
		description: string
		scope: 'user' | 'project'
		isAgent: boolean
		runtime: 'claude' | 'copilot'
		model: string
		systemPrompt: string
		onSubmit: (event: SubmitEvent) => void | Promise<void>
	} = $props()

	function segmentClass(active: boolean) {
		return cn(
			FORGE_SEGMENT_BUTTON_BASE,
			active ? FORGE_SEGMENT_BUTTON_ACTIVE : FORGE_SEGMENT_BUTTON_INACTIVE,
		)
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class={FORGE_DIALOG_CONTENT}>
		<Dialog.Header class={FORGE_DIALOG_HEADER}>
			<p class="text-[10px] uppercase tracking-[0.18em] text-ember">forge</p>
			<Dialog.Title class="mt-0.5 text-sm font-medium text-ink">
				new role
			</Dialog.Title>
			<Dialog.Description class="mt-0.5 text-[11px] text-smoke">
				define an agent persona or human seat
			</Dialog.Description>
		</Dialog.Header>

		<form onsubmit={onSubmit}>
			<div class={FORGE_DIALOG_BODY}>
				<div class="space-y-1">
					<label for="role-name" class={FORGE_FIELD_LABEL}>Name</label>
					<Input
						id="role-name"
						bind:value={name}
						placeholder="frontend engineer"
						required
						class={FORGE_FIELD_INPUT}
					/>
				</div>

				<div class="space-y-1">
					<label for="role-desc" class={FORGE_FIELD_LABEL}>Description</label>
					<Textarea
						id="role-desc"
						bind:value={description}
						placeholder="what this role does"
						required
						class={FORGE_FIELD_TEXTAREA}
					/>
				</div>

				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Type</span>
					<div class="flex gap-2">
						<button
							type="button"
							class={segmentClass(isAgent)}
							onclick={() => (isAgent = true)}
						>
							Agent
						</button>
						<button
							type="button"
							class={segmentClass(!isAgent)}
							onclick={() => (isAgent = false)}
						>
							Human
						</button>
					</div>
				</div>

				<div class="space-y-1">
					<span class={FORGE_FIELD_LABEL}>Scope</span>
					<div class="flex gap-2">
						<button
							type="button"
							class={segmentClass(scope === 'project')}
							onclick={() => (scope = 'project')}
						>
							Project
						</button>
						<button
							type="button"
							class={segmentClass(scope === 'user')}
							onclick={() => (scope = 'user')}
						>
							Global
						</button>
					</div>
				</div>

				{#if isAgent}
					<div class="space-y-1">
						<span class={FORGE_FIELD_LABEL}>Runtime</span>
						<div class="flex gap-2">
							<button
								type="button"
								class={segmentClass(runtime === 'claude')}
								onclick={() => (runtime = 'claude')}
							>
								Claude
							</button>
							<button
								type="button"
								class={segmentClass(runtime === 'copilot')}
								onclick={() => (runtime = 'copilot')}
							>
								Copilot
							</button>
						</div>
					</div>

					<div class="space-y-1">
						<label for="role-model" class={FORGE_FIELD_LABEL}>
							Model (optional)
						</label>
						<Input
							id="role-model"
							bind:value={model}
							placeholder="opus, sonnet, haiku…"
							class={FORGE_FIELD_INPUT}
						/>
					</div>

					<div class="space-y-1">
						<label for="role-system-prompt" class={FORGE_FIELD_LABEL}>
							System prompt (optional)
						</label>
						<Textarea
							id="role-system-prompt"
							bind:value={systemPrompt}
							placeholder="custom instructions for the agent"
							class={FORGE_FIELD_TEXTAREA}
						/>
					</div>
				{/if}
			</div>

			<div class={FORGE_DIALOG_FOOTER}>
				<button type="submit" class={FORGE_PRIMARY_BUTTON}>Create Role</button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
