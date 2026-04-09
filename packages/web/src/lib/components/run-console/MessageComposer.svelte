<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js'
	import { Send } from '@lucide/svelte'

	let {
		messageText = $bindable(''),
		onSubmit,
		placeholder = 'send a message…',
	}: {
		messageText: string
		onSubmit: (event: SubmitEvent) => void | Promise<void>
		placeholder?: string
	} = $props()
</script>

<form
	onsubmit={onSubmit}
	class="flex items-end gap-2 border-t border-ink/8 bg-paper-rail px-5 py-3"
>
	<input
		type="text"
		bind:value={messageText}
		{placeholder}
		class="h-8 flex-1 border-0 border-b border-ink/15 bg-transparent px-0 text-xs text-ink placeholder:text-smoke focus:border-ember focus:outline-none focus:ring-0"
		aria-label="Message"
	/>
	<Button
		type="submit"
		class="h-8 gap-1.5 rounded-sm bg-ember px-3 text-[10px] uppercase tracking-[0.18em] text-cream hover:bg-ember/90"
	>
		Send
		<Send class="h-3 w-3" strokeWidth={2.5} />
	</Button>
</form>
