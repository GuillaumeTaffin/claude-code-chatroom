<script lang="ts">
	import type { Project } from '@chatroom/shared'
	import { Button } from '$lib/components/ui/button/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { ArrowRight, Plus } from '@lucide/svelte'

	let {
		projects,
		projectName = $bindable(''),
		projectRootPath = $bindable(''),
		error = '',
		onCreate,
		onSelect,
	}: {
		projects: Project[]
		projectName: string
		projectRootPath: string
		error?: string
		onCreate: (event: SubmitEvent) => void | Promise<void>
		onSelect: (projectId: string) => void
	} = $props()
</script>

<div class="forge-atmosphere relative min-h-screen overflow-hidden">
	<!-- Top brand bar -->
	<header
		class="border-b border-ink/8 bg-paper-rail px-6 py-3 backdrop-blur-sm"
	>
		<div class="mx-auto flex max-w-5xl items-center justify-between">
			<div class="flex items-center gap-2">
				<div
					class="flex h-5 w-5 items-center justify-center rounded-sm bg-ember text-[10px] font-bold text-cream"
					aria-hidden="true"
				>
					F
				</div>
				<span class="text-[11px] uppercase tracking-[0.22em] text-ink">
					forge
				</span>
				<span class="text-[10px] text-smoke">
					· build anything · with agent teams
				</span>
			</div>
			<span class="text-[9px] uppercase tracking-[0.18em] text-smoke">
				v0 · localhost
			</span>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-12">
		<div class="mb-8">
			<p class="text-[10px] uppercase tracking-[0.22em] text-ember">
				the bench
			</p>
			<h1 class="mt-1 text-2xl font-medium tracking-tight text-ink">
				pick a project, or register a new one
			</h1>
		</div>

		<div class="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
			<!-- Register card -->
			<aside class="border border-ink/10 bg-paper-card p-5">
				<p class="text-[10px] uppercase tracking-[0.18em] text-ember">
					register
				</p>
				<h2 class="mt-1 text-sm font-medium text-ink">new project</h2>
				<p class="mt-1 text-[11px] text-smoke">
					bind a local workspace to forge
				</p>

				<form class="mt-4 space-y-3" onsubmit={onCreate}>
					<div class="space-y-1">
						<label
							for="project-name"
							class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
						>
							Project name
						</label>
						<Input
							id="project-name"
							bind:value={projectName}
							placeholder="chatroom"
							required
							class="h-8 rounded-none border-0 border-b border-ink/15 bg-transparent px-0 text-xs text-ink placeholder:text-smoke focus-visible:border-ember focus-visible:ring-0"
						/>
					</div>
					<div class="space-y-1">
						<label
							for="project-root"
							class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
						>
							Root path
						</label>
						<Input
							id="project-root"
							bind:value={projectRootPath}
							placeholder="/home/you/src/chatroom"
							required
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
						class="h-8 w-full gap-1.5 rounded-sm bg-ember text-[10px] uppercase tracking-[0.18em] text-cream hover:bg-ember/90"
					>
						<Plus class="h-3 w-3" strokeWidth={2.5} />
						Create Project
					</Button>
				</form>
			</aside>

			<!-- Project ledger -->
			<section class="border border-ink/10 bg-paper-card">
				<header
					class="flex items-baseline justify-between border-b border-ink/8 px-5 py-3"
				>
					<div>
						<p class="text-[10px] uppercase tracking-[0.18em] text-ink">
							ledger
						</p>
						<p class="mt-0.5 text-[10px] text-smoke">registered workspaces</p>
					</div>
					<span class="text-[10px] text-smoke">
						{String(projects.length).padStart(2, '0')}
					</span>
				</header>

				{#if projects.length === 0}
					<div class="flex min-h-48 items-center justify-center px-5 py-8">
						<p class="text-[11px] text-smoke">no projects registered yet</p>
					</div>
				{:else}
					<ul class="divide-y divide-ink/8">
						{#each projects as project (project.id)}
							<li>
								<button
									type="button"
									onclick={() => onSelect(project.id)}
									class="group flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-ember/5"
								>
									<div class="min-w-0">
										<p class="truncate text-xs font-medium text-ink">
											{project.name}
										</p>
										<p class="mt-0.5 truncate text-[10px] text-smoke">
											{project.root_path}
										</p>
									</div>
									<span
										class="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors group-hover:text-ember"
									>
										Open
										<ArrowRight class="h-3 w-3" strokeWidth={2.25} />
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	</main>
</div>
