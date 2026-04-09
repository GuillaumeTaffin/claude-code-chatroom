<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js'
	import { Input } from '$lib/components/ui/input/index.js'

	let {
		joinName = $bindable(''),
		joinDescription = $bindable(''),
		onSubmit,
		error = '',
	}: {
		joinName: string
		joinDescription: string
		onSubmit: (event: SubmitEvent) => void | Promise<void>
		error?: string
	} = $props()
</script>

<div class="flex h-full items-center justify-center px-6">
	<div class="w-full max-w-sm">
		<div class="border border-ink/10 bg-paper-card p-5">
			<p class="text-[10px] uppercase tracking-[0.22em] text-ember">enlist</p>
			<h2 class="mt-1 text-base font-medium text-ink">step into the run</h2>
			<p class="mt-1 text-[11px] text-smoke">
				tell the room who's at the bench
			</p>

			<form class="mt-4 space-y-3" onsubmit={onSubmit}>
				<div class="space-y-1">
					<label
						for="run-join-name"
						class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
					>
						Name
					</label>
					<Input
						id="run-join-name"
						bind:value={joinName}
						placeholder="your-handle"
						required
						aria-label="Name"
						class="h-8 rounded-none border-0 border-b border-ink/15 bg-transparent px-0 text-xs text-ink placeholder:text-smoke focus-visible:border-ember focus-visible:ring-0"
					/>
				</div>
				<div class="space-y-1">
					<label
						for="run-join-desc"
						class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
					>
						Description
					</label>
					<Input
						id="run-join-desc"
						bind:value={joinDescription}
						placeholder="lead architect"
						required
						aria-label="Description"
						class="h-8 rounded-none border-0 border-b border-ink/15 bg-transparent px-0 text-xs text-ink placeholder:text-smoke focus-visible:border-ember focus-visible:ring-0"
					/>
				</div>

				{#if error}
					<p class="border-l-2 border-rust pl-2 text-[11px] text-rust">
						{error}
					</p>
				{/if}

				<Button
					type="submit"
					class="h-8 w-full rounded-sm bg-ember text-[10px] uppercase tracking-[0.18em] text-cream hover:bg-ember/90"
				>
					Join Chat
				</Button>
			</form>
		</div>
	</div>
</div>
