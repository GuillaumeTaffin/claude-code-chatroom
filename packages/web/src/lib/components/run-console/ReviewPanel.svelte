<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js'
	import { Textarea } from '$lib/components/ui/textarea/index.js'

	let {
		comment = $bindable(''),
		onSubmit,
		disabled = false,
	}: {
		comment: string
		onSubmit: (event: SubmitEvent) => void | Promise<void>
		disabled?: boolean
	} = $props()
</script>

<section class="flex h-full flex-col">
	<header class="border-b border-ink/8 px-4 py-3">
		<h3 class="text-[10px] uppercase tracking-[0.18em] text-ink">verdict</h3>
		<p class="mt-0.5 text-[10px] text-smoke">review feedback</p>
	</header>

	<form class="flex flex-1 flex-col px-4 py-3" onsubmit={onSubmit}>
		<label
			for="review-comment"
			class="text-[10px] uppercase tracking-[0.16em] text-smoke"
		>
			comment
		</label>
		<Textarea
			id="review-comment"
			bind:value={comment}
			placeholder="be candid…"
			class="mt-1 min-h-[120px] flex-1 resize-none rounded-sm border-ink/10 bg-paper-rail text-[12px] leading-relaxed text-ink placeholder:text-smoke focus-visible:border-ember/60 focus-visible:ring-0"
		/>
		<Button
			type="submit"
			{disabled}
			class="mt-2 h-8 w-full rounded-sm bg-ember text-[10px] uppercase tracking-[0.18em] text-cream hover:bg-ember/90"
		>
			Submit review
		</Button>
	</form>
</section>
