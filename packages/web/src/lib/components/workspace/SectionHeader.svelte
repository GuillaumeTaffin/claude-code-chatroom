<script lang="ts">
	let {
		eyebrow,
		title,
		description = '',
		actionLabel = '',
		actionDisabled = false,
		onAction,
	}: {
		eyebrow: string
		title: string
		description?: string
		actionLabel?: string
		actionDisabled?: boolean
		onAction?: () => void
	} = $props()
</script>

<header class="flex items-end justify-between border-b border-ink/8 px-6 py-4">
	<div>
		<p class="text-[10px] uppercase tracking-[0.18em] text-ember">
			{eyebrow}
		</p>
		<h2 class="mt-0.5 text-base font-medium text-ink">{title}</h2>
		{#if description}
			<p class="mt-0.5 text-[11px] text-smoke">{description}</p>
		{/if}
	</div>
	{#if actionLabel && onAction}
		<button
			type="button"
			disabled={actionDisabled}
			onclick={onAction}
			class="rounded-sm border border-ember/40 bg-ember/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ember transition-colors hover:bg-ember/15 disabled:cursor-not-allowed disabled:opacity-40"
		>
			+ {actionLabel}
		</button>
	{/if}
</header>
