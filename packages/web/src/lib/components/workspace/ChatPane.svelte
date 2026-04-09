<script lang="ts">
	import type { ChatMember, ChatMessage } from '$lib/chatroom.svelte.js'
	import type { Project, Role } from '@chatroom/shared'
	import MemberRoster from '$lib/components/run-console/MemberRoster.svelte'
	import MessageComposer from '$lib/components/run-console/MessageComposer.svelte'
	import MessageLine from '$lib/components/run-console/MessageLine.svelte'
	import SystemMessageLine from '$lib/components/run-console/SystemMessageLine.svelte'
	import { Button } from '$lib/components/ui/button/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { LogOut, Sparkles } from '@lucide/svelte'

	let {
		project,
		messages,
		members,
		connected,
		agentRoles,
		joinName = $bindable(''),
		joinDescription = $bindable(''),
		messageText = $bindable(''),
		error = '',
		onJoin,
		onSend,
		onDisconnect,
		onSpawnAgent,
	}: {
		project: Project
		messages: ChatMessage[]
		members: ChatMember[]
		connected: boolean
		agentRoles: Role[]
		joinName: string
		joinDescription: string
		messageText: string
		error?: string
		onJoin: (event: SubmitEvent) => void | Promise<void>
		onSend: (event: SubmitEvent) => void | Promise<void>
		onDisconnect: () => void
		onSpawnAgent: () => void
	} = $props()

	let messagesContainer: HTMLElement | null = $state(null)

	$effect(() => {
		if (messages.length && messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight
			})
		}
	})
</script>

{#if !connected}
	<div class="flex h-full items-center justify-center px-6">
		<div class="w-full max-w-sm border border-ink/10 bg-paper-card p-5">
			<p class="text-[10px] uppercase tracking-[0.18em] text-ember">enlist</p>
			<h2 class="mt-1 text-sm font-medium text-ink">join project chat</h2>
			<p class="mt-1 text-[11px] text-smoke">
				connect to {project.name}
			</p>

			<form class="mt-4 space-y-3" onsubmit={onJoin}>
				<div class="space-y-1">
					<label
						for="proj-join-name"
						class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
					>
						Name
					</label>
					<Input
						id="proj-join-name"
						bind:value={joinName}
						placeholder="your-handle"
						required
						aria-label="Name"
						class="h-8 rounded-none border-0 border-b border-ink/15 bg-transparent px-0 text-xs text-ink placeholder:text-smoke focus-visible:border-ember focus-visible:ring-0"
					/>
				</div>
				<div class="space-y-1">
					<label
						for="proj-join-desc"
						class="block text-[10px] uppercase tracking-[0.18em] text-smoke"
					>
						Description
					</label>
					<Input
						id="proj-join-desc"
						bind:value={joinDescription}
						placeholder="frontend engineer"
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
{:else}
	<div class="flex h-full min-h-0">
		<!-- Messages column -->
		<div class="flex min-h-0 flex-1 flex-col">
			<div
				bind:this={messagesContainer}
				class="min-h-0 flex-1 overflow-y-auto px-5 py-4"
			>
				<div class="mx-auto flex max-w-2xl flex-col gap-3">
					{#each messages as msg (msg.id)}
						{#if msg.type === 'system'}
							<SystemMessageLine message={msg} />
						{:else}
							<MessageLine message={msg} {members} />
						{/if}
					{/each}
					{#if messages.length === 0}
						<p class="py-8 text-center text-[11px] text-smoke">
							the room is quiet
						</p>
					{/if}
				</div>
			</div>

			<MessageComposer
				bind:messageText
				onSubmit={onSend}
				placeholder={`message ${project.name}…`}
			/>
		</div>

		<!-- Members rail -->
		<aside
			class="hidden w-64 shrink-0 flex-col border-l border-ink/8 bg-paper-rail lg:flex"
		>
			<div class="min-h-0 flex-1">
				<MemberRoster {members} workspaceAllocations={[]} />
			</div>
			<div class="space-y-2 border-t border-ink/8 px-4 py-3">
				{#if agentRoles.length > 0}
					<button
						type="button"
						onclick={onSpawnAgent}
						class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-ember/30 bg-ember/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-ember transition-colors hover:bg-ember/10"
					>
						<Sparkles class="h-3 w-3" strokeWidth={2.25} />
						Spawn Agent
					</button>
				{/if}
				<button
					type="button"
					onclick={onDisconnect}
					class="flex w-full items-center justify-center gap-1.5 rounded-sm border border-ink/10 bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-smoke transition-colors hover:border-rust/50 hover:text-rust"
				>
					<LogOut class="h-3 w-3" strokeWidth={2.25} />
					Disconnect
				</button>
			</div>
		</aside>
	</div>
{/if}
