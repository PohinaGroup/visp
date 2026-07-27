// Pure grid math for the draggable deck — no React Native imports so it stays testable.

// Which grid slot a dragged tile's top-left corner currently sits over.
export function slotIndex(
	x: number,
	y: number,
	columns: number,
	cellWidth: number,
	cellHeight: number,
	gap: number,
	count: number,
): number {
	const col = Math.max(
		0,
		Math.min(columns - 1, Math.round(x / (cellWidth + gap))),
	);
	const row = Math.max(0, Math.round(y / (cellHeight + gap)));
	return Math.max(0, Math.min(count - 1, row * columns + col));
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0) return items;
	const next = items.slice();
	const [moved] = next.splice(from, 1);
	if (moved === undefined) return items;
	next.splice(to, 0, moved);
	return next;
}
