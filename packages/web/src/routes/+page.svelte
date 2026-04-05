<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js'
	import { Badge } from '$lib/components/ui/badge/index.js'
	import { Button } from '$lib/components/ui/button/index.js'
	import * as Card from '$lib/components/ui/card/index.js'
	import { Input } from '$lib/components/ui/input/index.js'
	import { Label } from '$lib/components/ui/label/index.js'
	import * as ScrollArea from '$lib/components/ui/scroll-area/index.js'
	import { Separator } from '$lib/components/ui/separator/index.js'
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
	import { cn } from '$lib/utils.js'

	let joinName = $state('')
	let joinDescription = $state('')
	let messageText = $state('')
	let joinError = $state('')
	let sendError = $state('')
	let messagesContainer: HTMLElement | null = $state(null)

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
	<div
		class="dark bg-background text-foreground relative min-h-screen overflow-hidden"
	>
		<div class="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_40%),linear-gradient(180deg,_rgba(24,24,27,0.98),_rgba(9,9,11,1))]"></div>
		<div class="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,_rgba(63,63,70,0.18),_transparent)]"></div>

		<div class="relative flex min-h-screen items-center justify-center px-4 py-12">
			<Card.Root
				class="w-full max-w-md border-border/60 bg-card/95 shadow-2xl shadow-black/35 backdrop-blur"
			>
				<Card.Header class="space-y-2">
					<Badge variant="outline" class="border-primary/25 bg-primary/10 text-primary">
						Dark-first UI
					</Badge>
					<Card.Title class="text-2xl font-semibold tracking-tight">
						Agent Chatroom
					</Card.Title>
					<Card.Description>
						Join the chatroom to communicate with agents and humans.
					</Card.Description>
				</Card.Header>

				<Card.Content>
					<form onsubmit={handleJoin} class="space-y-4">
						<div class="space-y-2">
							<Label for="name">Name</Label>
							<Input
								id="name"
								type="text"
								bind:value={joinName}
								placeholder="e.g. frontend-agent"
								required
								autocomplete="nickname"
								class="h-10 bg-input/30"
							/>
						</div>

						<div class="space-y-2">
							<Label for="desc">Role description</Label>
							<Input
								id="desc"
								type="text"
								bind:value={joinDescription}
								placeholder="e.g. Handles UI components and styling"
								required
								class="h-10 bg-input/30"
							/>
						</div>

						{#if joinError}
							<p class="text-destructive text-sm">{joinError}</p>
						{/if}

						<Button type="submit" class="h-10 w-full">
							Join Chatroom
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
{:else}
	<div class="dark bg-background text-foreground h-screen">
		<div
			class="from-background via-background to-muted/20 grid h-full min-h-0 bg-gradient-to-br md:grid-cols-[18rem_minmax(0,1fr)]"
		>
			<aside
				class="bg-sidebar/80 border-border/80 flex min-h-0 flex-col border-b backdrop-blur md:border-r md:border-b-0"
			>
				<div class="flex items-center justify-between px-4 py-4">
					<div>
						<h2 class="text-sidebar-foreground text-sm font-semibold">Members</h2>
						<p class="text-muted-foreground text-xs">Live room presence</p>
					</div>
					<Badge variant="secondary">{members.length}</Badge>
				</div>

				<Separator />

				<ScrollArea.Root class="min-h-0 flex-1">
					<div class="space-y-3 p-3">
						{#each members as member (member.name)}
							<div
								class="bg-card/75 ring-border/70 rounded-xl p-3 shadow-sm ring-1"
							>
								<div class="flex items-start gap-3">
									<Avatar.Root size="sm" class="mt-0.5">
										<Avatar.Fallback
											class={cn('bg-muted text-xs font-semibold', getNameColor(member.name))}
										>
											{getMemberInitial(member.name)}
										</Avatar.Fallback>
									</Avatar.Root>

									<div class="min-w-0 flex-1">
										<div
											class={cn('truncate text-sm font-medium', getNameColor(member.name))}
										>
											{member.name}
										</div>
										<p class="text-muted-foreground mt-1 text-xs leading-relaxed">
											{member.description}
										</p>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</ScrollArea.Root>

				<Separator />

				<div class="space-y-3 p-3">
					<div class="bg-card/65 ring-border/70 flex items-center gap-3 rounded-xl p-3 ring-1">
						<Avatar.Root size="sm">
							<Avatar.Fallback
								class={cn('bg-primary/15 text-xs font-semibold text-primary', getNameColor(myName))}
							>
								{getMemberInitial(myName)}
							</Avatar.Fallback>
						</Avatar.Root>

						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{myName}</p>
							<p class="text-muted-foreground text-xs">Connected</p>
						</div>
					</div>

					<Button
						variant="outline"
						class="w-full justify-center"
						onclick={handleDisconnect}
					>
						Disconnect
					</Button>
				</div>
			</aside>

			<main class="flex min-h-0 flex-col">
				<header
					class="border-border/80 bg-background/75 flex items-center justify-between border-b px-4 py-4 backdrop-blur md:px-6"
				>
					<div>
						<h1 class="text-sm font-semibold tracking-wide text-zinc-200">
							#general
						</h1>
						<p class="text-muted-foreground text-xs">
							Local chat for humans and agents
						</p>
					</div>
					<Badge variant="outline" class="hidden sm:inline-flex">
						{messages.length} messages
					</Badge>
				</header>

				<ScrollArea.Root bind:viewportRef={messagesContainer} class="min-h-0 flex-1">
					<div class="space-y-4 px-4 py-4 md:px-6">
						{#each messages as msg (msg.id)}
							{#if msg.type === 'system'}
								<div class="flex items-center gap-3 py-2">
									<Separator class="flex-1" />
									<span class="text-muted-foreground text-xs italic">
										{msg.text}
									</span>
									<Separator class="flex-1" />
								</div>
							{:else}
								<div class="group flex items-start gap-3">
									<Avatar.Root class="mt-0.5">
										<Avatar.Fallback
											class={cn('bg-card text-sm font-semibold', getNameColor(msg.sender ?? ''))}
										>
											{getMemberInitial(msg.sender)}
										</Avatar.Fallback>
									</Avatar.Root>

									<div class="min-w-0 flex-1 rounded-xl border border-transparent px-1 py-0.5">
										<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
											<span
												class={cn('text-sm font-semibold', getNameColor(msg.sender ?? ''))}
											>
												{msg.sender}
											</span>
											<span class="text-muted-foreground text-xs">
												{formatTime(msg.timestamp)}
											</span>
										</div>

										<p class="mt-1 break-words text-sm leading-relaxed text-zinc-200">
											{msg.text}
										</p>

										{#if msg.mentions.length > 0}
											<div class="mt-2 flex flex-wrap gap-1.5">
												{#each msg.mentions as mention (mention)}
													<Badge
														variant="outline"
														class="border-primary/30 bg-primary/10 text-primary"
													>
														@{mention}
													</Badge>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</ScrollArea.Root>

				<Separator />

				<form
					onsubmit={handleSend}
					class="bg-background/80 px-4 py-4 backdrop-blur md:px-6"
				>
					{#if sendError}
						<p class="text-destructive mb-2 text-xs">{sendError}</p>
					{/if}

					<div class="flex gap-3">
						<Input
							type="text"
							bind:value={messageText}
							placeholder="Type a message..."
							class="h-10 flex-1 bg-input/30"
						/>
						<Button type="submit" class="h-10 px-4" disabled={!messageText.trim()}>
							Send
						</Button>
					</div>
				</form>
			</main>
		</div>
	</div>
{/if}
