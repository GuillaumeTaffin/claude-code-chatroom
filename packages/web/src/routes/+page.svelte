<script lang="ts">
	import {
		connect,
		sendMessage,
		disconnect,
		getMessages,
		getMembers,
		isConnected,
		getMyName,
	} from '$lib/chatroom.svelte.js'
	import { getMemberInitial, getNameColor } from '$lib/chatroom-ui.js'

	let joinName = $state('')
	let joinDescription = $state('')
	let messageText = $state('')
	let joinError = $state('')
	let sendError = $state('')
	let messagesContainer: HTMLDivElement | undefined = $state()

	const messages = $derived(getMessages())
	const members = $derived(getMembers())
	const connected = $derived(isConnected())
	const myName = $derived(getMyName())

	// Auto-scroll when new messages arrive
	$effect(() => {
		if (messages.length && messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight
			})
		}
	})

	async function handleJoin(e: SubmitEvent) {
		e.preventDefault()
		joinError = ''
		try {
			await connect(joinName.trim(), joinDescription.trim())
		} catch (err) {
			joinError = (err as Error).message
		}
	}

	async function handleSend(e: SubmitEvent) {
		e.preventDefault()
		if (!messageText.trim()) return
		sendError = ''

		const text = messageText.trim()
		messageText = ''

		try {
			await sendMessage(text)
		} catch (err) {
			sendError = (err as Error).message
		}
	}

	function handleDisconnect() {
		disconnect()
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
		})
	}
</script>

{#if !connected}
	<!-- Join screen -->
	<div
		class="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100"
	>
		<div
			class="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl"
		>
			<h1 class="mb-2 text-2xl font-semibold tracking-tight">Agent Chatroom</h1>
			<p class="mb-6 text-sm text-zinc-400">
				Join the chatroom to communicate with agents and humans.
			</p>

			<form onsubmit={handleJoin} class="space-y-4">
				<div>
					<label for="name" class="mb-1 block text-sm font-medium text-zinc-300"
						>Name</label
					>
					<input
						id="name"
						type="text"
						bind:value={joinName}
						placeholder="e.g. frontend-agent"
						required
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label for="desc" class="mb-1 block text-sm font-medium text-zinc-300"
						>Role description</label
					>
					<input
						id="desc"
						type="text"
						bind:value={joinDescription}
						placeholder="e.g. Handles UI components and styling"
						required
						class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
					/>
				</div>

				{#if joinError}
					<p class="text-sm text-red-400">{joinError}</p>
				{/if}

				<button
					type="submit"
					class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
				>
					Join Chatroom
				</button>
			</form>
		</div>
	</div>
{:else}
	<!-- Chat UI -->
	<div class="flex h-screen bg-zinc-950 text-zinc-100">
		<!-- Sidebar: Members -->
		<aside
			class="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
		>
			<div
				class="flex items-center justify-between border-b border-zinc-800 px-4 py-3"
			>
				<h2 class="text-sm font-semibold text-zinc-300">Members</h2>
				<span class="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
					>{members.length}</span
				>
			</div>

			<div class="flex-1 overflow-y-auto p-3 space-y-2">
				{#each members as member (member.name)}
					<div class="rounded-lg bg-zinc-800/50 p-2.5">
						<div class="flex items-center gap-2">
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium"
							>
								{getMemberInitial(member.name)}
							</div>
							<span class="text-sm font-medium {getNameColor(member.name)}"
								>{member.name}</span
							>
						</div>
						<p class="mt-1 pl-8 text-xs text-zinc-500">{member.description}</p>
					</div>
				{/each}
			</div>

			<div class="border-t border-zinc-800 p-3">
				<div class="mb-2 flex items-center gap-2">
					<div
						class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-medium"
					>
						{getMemberInitial(myName)}
					</div>
					<span class="text-sm font-medium">{myName}</span>
				</div>
				<button
					onclick={handleDisconnect}
					class="w-full rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
				>
					Disconnect
				</button>
			</div>
		</aside>

		<!-- Main chat area -->
		<main class="flex flex-1 flex-col">
			<!-- Header -->
			<header class="flex items-center border-b border-zinc-800 px-6 py-3">
				<h1 class="text-sm font-semibold text-zinc-300">#general</h1>
			</header>

			<!-- Messages -->
			<div
				bind:this={messagesContainer}
				class="flex-1 overflow-y-auto px-6 py-4 space-y-3"
			>
				{#each messages as msg (msg.id)}
					{#if msg.type === 'system'}
						<div class="flex items-center gap-3 py-1">
							<div class="h-px flex-1 bg-zinc-800"></div>
							<span class="text-xs text-zinc-600 italic">{msg.text}</span>
							<div class="h-px flex-1 bg-zinc-800"></div>
						</div>
					{:else}
						<div class="group flex items-start gap-3">
							<div
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium {getNameColor(
									msg.sender ?? '',
								)}"
							>
								{getMemberInitial(msg.sender)}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span
										class="text-sm font-semibold {getNameColor(
											msg.sender ?? '',
										)}">{msg.sender}</span
									>
									<span class="text-xs text-zinc-600"
										>{formatTime(msg.timestamp)}</span
									>
								</div>
								<p class="mt-0.5 text-sm text-zinc-300 break-words">
									{msg.text}
								</p>
								{#if msg.mentions.length > 0}
									<div class="mt-1 flex gap-1">
										{#each msg.mentions as mention (mention)}
											<span
												class="rounded bg-blue-600/20 px-1.5 py-0.5 text-xs text-blue-400"
												>@{mention}</span
											>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			</div>

			<!-- Input -->
			<form onsubmit={handleSend} class="border-t border-zinc-800 px-6 py-4">
				{#if sendError}
					<p class="mb-2 text-xs text-red-400">{sendError}</p>
				{/if}
				<div class="flex gap-3">
					<input
						type="text"
						bind:value={messageText}
						placeholder="Type a message..."
						class="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
					/>
					<button
						type="submit"
						disabled={!messageText.trim()}
						class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
					>
						Send
					</button>
				</div>
			</form>
		</main>
	</div>
{/if}
