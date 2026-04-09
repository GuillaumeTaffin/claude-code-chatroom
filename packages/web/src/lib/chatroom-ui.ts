/**
 * Forge identity palette — eight mineral-tuned OKLCH hues chosen to sit
 * harmoniously against the ink background. Deterministic per name.
 */
const NAME_COLOR_CLASSES = [
	'text-[oklch(0.78_0.14_45)]', // ember
	'text-[oklch(0.78_0.12_165)]', // patina
	'text-[oklch(0.82_0.13_85)]', // brass
	'text-[oklch(0.74_0.14_355)]', // madder
	'text-[oklch(0.78_0.1_205)]', // slate-blue
	'text-[oklch(0.82_0.12_125)]', // moss
	'text-[oklch(0.8_0.13_25)]', // rust
	'text-[oklch(0.78_0.11_295)]', // iris
]

export function getNameColor(name: string): string {
	let hash = 0
	for (let i = 0; i < name.length; i += 1) {
		hash = (hash * 31 + name.charCodeAt(i)) | 0
	}
	return NAME_COLOR_CLASSES[Math.abs(hash) % NAME_COLOR_CLASSES.length]
}

export function getMemberInitial(name: string | undefined): string {
	return name?.[0]?.toUpperCase() ?? '?'
}

/**
 * In Forge, agents and humans are visually distinct: agents speak in mono,
 * humans in italic serif. The runtime field on a member is the source of truth
 * — humans never have one.
 */
export function isAgentMember(
	member: { runtime?: unknown } | undefined,
): boolean {
	return Boolean(member?.runtime)
}
