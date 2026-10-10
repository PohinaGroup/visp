/**
 * Display helpers shared by every admin page. Kept free of React so pages,
 * tables, and future chart tooltips format values identically.
 */

export function formatDate(value: string | null | undefined) {
	if (!value) return "Never";
	return new Intl.DateTimeFormat("en-FI", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export function formatDuration(seconds: number) {
	const rounded = Math.max(0, Math.round(seconds));
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	if (hours) return `${hours}h ${minutes}m`;
	if (minutes) return `${minutes}m`;
	return `${rounded}s`;
}

export function formatAge(iso: string) {
	return formatDuration((Date.now() - new Date(iso).getTime()) / 1000);
}

export function percent(used: number, total: number) {
	return total > 0 ? Math.round((used / total) * 100) : 0;
}

export function formatGiB(kb: number) {
	return `${(kb / 1024 / 1024).toFixed(1)} GiB`;
}

/** Load is only readable against the core count it is competing for. */
export function loadTone(load: number, cpuCount: number) {
	if (load >= cpuCount) return "text-destructive";
	if (load >= cpuCount * 0.7) return "text-amber-500";
	return "text-muted-foreground";
}

export function usageTone(usedPct: number) {
	if (usedPct >= 90) return "text-destructive";
	if (usedPct >= 75) return "text-amber-500";
	return "text-muted-foreground";
}

/** `<input type="datetime-local">` wants local wall-clock time without a zone. */
export function localDateTimeInput(value: string | null) {
	if (!value) return "";
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}
