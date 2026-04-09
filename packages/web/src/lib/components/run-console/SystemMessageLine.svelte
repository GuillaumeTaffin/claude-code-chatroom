<script lang="ts">
	import type { ChatMessage } from '$lib/chatroom.svelte.js'

	let { message }: { message: ChatMessage } = $props()
</script>

<div class="forge-rise flex items-center gap-2 py-0.5" role="status">
	<div class="h-px flex-1 bg-ink/8"></div>
	<span class="text-[9px] uppercase tracking-[0.18em] text-smoke">
		{message.text}
	</span>
	<div class="h-px flex-1 bg-ink/8"></div>
</div>
