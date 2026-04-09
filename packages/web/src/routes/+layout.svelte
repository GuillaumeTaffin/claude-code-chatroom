<script lang="ts">
	import '../app.css'
	let { children } = $props()
</script>

<svelte:head>
	<title>Forge — Workshop for agent teams</title>
	<meta
		name="description"
		content="A local workshop where teams of humans and agents build anything — software, and beyond."
	/>
</svelte:head>

{@render children()}
