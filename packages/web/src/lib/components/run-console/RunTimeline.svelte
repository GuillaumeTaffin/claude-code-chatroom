<script lang="ts">
	import type { TimelineEvent } from '@chatroom/shared'
	import {
		CheckCircle2,
		CircleDot,
		Flag,
		MessageSquareQuote,
		Play,
		ShieldAlert,
		XCircle,
	} from '@lucide/svelte'

	let { timeline }: { timeline: TimelineEvent[] } = $props()

	function eventLabel(type: string): string {
		switch (type) {
			case 'run_created':
				return 'run created'
			case 'phase_started':
				return 'phase started'
			case 'phase_completed':
				return 'phase completed'
			case 'phase_rejected':
				return 'phase rejected'
			case 'approval_requested':
				return 'approval requested'
			case 'approval_granted':
				return 'approved'
			case 'approval_rejected':
				return 'rejected'
			case 'review_feedback':
				return 'review feedback'
			case 'run_completed':
				return 'run completed'
			default:
				return type.replace(/_/g, ' ')
		}
	}

	function eventTone(type: string): string {
		switch (type) {
			case 'phase_started':
			case 'approval_requested':
				return 'text-ember'
			case 'phase_completed':
			case 'approval_granted':
			case 'run_completed':
				return 'text-patina'
			case 'phase_rejected':
			case 'approval_rejected':
				return 'text-rust'
			case 'review_feedback':
				return 'text-graphite'
			default:
				return 'text-smoke'
		}
	}

	function formatTimestamp(iso: string): string {
		return new Date(iso).toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}
</script>

<section class="flex h-full flex-col">
	<header class="border-b border-ink/8 px-4 py-3">
		<h3 class="text-[10px] uppercase tracking-[0.18em] text-ink">ledger</h3>
		<p class="mt-0.5 text-[10px] text-smoke">run history</p>
	</header>

	<div class="flex-1 overflow-y-auto px-4 py-3">
		{#if timeline.length === 0}
			<p class="py-4 text-center text-[11px] text-smoke">nothing yet</p>
		{:else}
			<ol class="relative space-y-3 border-l border-ink/8 pl-4">
				{#each timeline as event (event.id)}
					{@const tone = eventTone(event.type)}
					<li class="forge-rise relative">
						<span
							class={[
								'absolute -left-[1.375rem] top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-paper',
								tone,
							]}
							aria-hidden="true"
						>
							{#if event.type === 'phase_completed' || event.type === 'approval_granted' || event.type === 'run_completed'}
								<CheckCircle2 class="h-3 w-3" strokeWidth={2} />
							{:else if event.type === 'phase_rejected' || event.type === 'approval_rejected'}
								<XCircle class="h-3 w-3" strokeWidth={2} />
							{:else if event.type === 'phase_started'}
								<CircleDot class="h-3 w-3" strokeWidth={2} />
							{:else if event.type === 'approval_requested'}
								<ShieldAlert class="h-3 w-3" strokeWidth={2} />
							{:else if event.type === 'review_feedback'}
								<MessageSquareQuote class="h-3 w-3" strokeWidth={2} />
							{:else if event.type === 'run_created'}
								<Play class="h-3 w-3" strokeWidth={2} />
							{:else}
								<Flag class="h-3 w-3" strokeWidth={2} />
							{/if}
						</span>

						<div class={['text-[10px] uppercase tracking-[0.12em]', tone]}>
							{eventLabel(event.type)}
						</div>
						{#if event.data?.phase_name}
							<div class="mt-0.5 text-[11px] text-ink">
								{event.data.phase_name}
							</div>
						{/if}
						{#if event.data?.comment}
							<blockquote
								class="mt-1 border-l-2 border-ember/40 pl-2 text-[11px] text-graphite"
							>
								&ldquo;{event.data.comment}&rdquo;
							</blockquote>
						{/if}
						<p class="mt-0.5 text-[9px] text-smoke">
							{formatTimestamp(event.timestamp)}
						</p>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</section>
