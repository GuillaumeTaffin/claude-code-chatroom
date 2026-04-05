const NAME_COLOR_CLASSES = [
	'text-blue-400',
	'text-emerald-400',
	'text-amber-400',
	'text-rose-400',
	'text-violet-400',
	'text-cyan-400',
	'text-orange-400',
	'text-pink-400',
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
