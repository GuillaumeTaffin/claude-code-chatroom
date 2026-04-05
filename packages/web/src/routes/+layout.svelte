<script lang="ts">
	import '../app.css'
	let { children } = $props()
</script>

<svelte:head>
	<title>Agent Chatroom</title>
</svelte:head>

{@render children()}
