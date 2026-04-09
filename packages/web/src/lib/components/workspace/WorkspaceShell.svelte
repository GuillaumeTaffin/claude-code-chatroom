<script lang="ts">
	import type { Project } from '@chatroom/shared'
	import { ArrowLeft, Hammer, MessageSquare, Play, Users } from '@lucide/svelte'

	type Section = 'chat' | 'roles' | 'teams' | 'runs'

	let {
		project,
		section = $bindable<Section>('chat'),
		onBack,
		children,
	}: {
		project: Project
		section: Section
		onBack: () => void
		children: import('svelte').Snippet
	} = $props()

	const sections: Array<{
		id: Section
		label: string
		icon: typeof Hammer
	}> = [
		{ id: 'chat', label: 'chat', icon: MessageSquare },
		{ id: 'roles', label: 'roles', icon: Users },
		{ id: 'teams', label: 'teams', icon: Hammer },
		{ id: 'runs', label: 'runs', icon: Play },
	]
</script>

<div class="forge-atmosphere relative flex h-screen flex-col">
	<!-- Header -->
	<header
		class="flex items-center gap-4 border-b border-ink/8 bg-paper-rail px-5 py-3"
	>
		<button
			type="button"
			onclick={onBack}
			class="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors hover:text-ink"
		>
			<ArrowLeft class="h-3 w-3" strokeWidth={2.25} />
			projects
		</button>
		<div class="h-5 w-px bg-ink/8"></div>
		<div class="min-w-0 flex-1">
			<p class="text-[10px] uppercase tracking-[0.18em] text-smoke">project</p>
			<div class="flex items-baseline gap-2">
				<h1 class="truncate text-sm font-medium text-ink">
					{project.name}
				</h1>
				<span class="truncate text-[10px] text-smoke">
					{project.root_path}
				</span>
			</div>
		</div>
	</header>

	<div class="flex min-h-0 flex-1">
		<!-- Left rail -->
		<nav
			class="flex w-44 shrink-0 flex-col border-r border-ink/8 bg-paper-rail py-3"
			aria-label="Workspace sections"
		>
			{#each sections as item (item.id)}
				{@const Icon = item.icon}
				{@const active = section === item.id}
				<button
					type="button"
					onclick={() => (section = item.id)}
					class={[
						'group relative flex items-center gap-2.5 px-5 py-2 text-left text-[11px] uppercase tracking-[0.16em] transition-colors',
						active ? 'text-ember' : 'text-smoke hover:text-ink',
					]}
					aria-pressed={active}
				>
					{#if active}
						<span
							class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ember"
							aria-hidden="true"
						></span>
					{/if}
					<Icon class="h-3.5 w-3.5" strokeWidth={2} />
					{item.label}
				</button>
			{/each}
		</nav>

		<!-- Content -->
		<main class="min-h-0 flex-1">
			{@render children()}
		</main>
	</div>
</div>
