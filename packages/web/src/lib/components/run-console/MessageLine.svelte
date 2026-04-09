<script lang="ts">
	import type { ChatMember, ChatMessage } from '$lib/chatroom.svelte.js'
	import {
		getMemberInitial,
		getNameColor,
		isAgentMember,
	} from '$lib/chatroom-ui.js'
	import { cn } from '$lib/utils.js'

	let {
		message,
		members,
	}: {
		message: ChatMessage
		members: ChatMember[]
	} = $props()

	const sender = $derived(
		members.find((member) => member.name === message.sender),
	)
	const isAgent = $derived(isAgentMember(sender))
	const senderName = $derived(message.sender ?? 'unknown')
	const colorClass = $derived(getNameColor(senderName))

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		})
	}
</script>

<!--
  Forge message line — mono everywhere.
  Agent vs human is read from the avatar shape and the runtime chip:
  agents get a square avatar + runtime chip; humans get a round avatar.
  Same font, same weight — the structural cue is shape, not type.
-->
<article class="forge-rise group flex items-start gap-2.5">
	<div
		class={cn(
			'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold',
			isAgent
				? 'rounded-sm border border-ink/15 bg-paper-bright'
				: 'rounded-full border border-ink/10 bg-paper-card',
			colorClass,
		)}
		aria-hidden="true"
	>
		{getMemberInitial(senderName)}
	</div>

	<div class="min-w-0 flex-1">
		<header class="flex items-baseline gap-2">
			<span class={cn('text-xs font-semibold', colorClass)}>
				{senderName}
			</span>
			{#if isAgent && sender?.runtime}
				<span
					class="rounded-sm border border-ember/30 bg-ember/5 px-1 text-[9px] uppercase tracking-[0.12em] text-ember"
				>
					{sender.runtime.runtime_id}
				</span>
			{/if}
			<span class="text-[10px] text-smoke">
				{formatTime(message.timestamp)}
			</span>
		</header>

		<div
			class="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-[1.55] text-graphite"
		>
			{message.text}
		</div>

		{#if message.mentions.length > 0}
			<div class="mt-1 flex flex-wrap gap-1">
				{#each message.mentions as mention (mention)}
					<span
						class="rounded-sm border border-ember/30 bg-ember/5 px-1 text-[9px] text-ember"
					>
						@{mention}
					</span>
				{/each}
			</div>
		{/if}
	</div>
</article>
