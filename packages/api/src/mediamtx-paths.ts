export type MediaMtxPath = {
	name?: string;
	readers?: unknown[];
	ready?: boolean;
	source?: { type?: string } | null;
};

export class MediaMtxPathsError extends Error {
	constructor(
		readonly reason: "http" | "invalid" | "incomplete",
		message: string,
	) {
		super(message);
		this.name = "MediaMtxPathsError";
	}
}

// MediaMTX defaults to 100 per page; 1000 keeps a busy relay to one or two
// requests.
const ITEMS_PER_PAGE = 1000;
// Guards against a relay that reports a nonsensical pageCount.
const MAX_PAGES = 100;

type Page = { items: MediaMtxPath[]; pageCount: number; itemCount?: number };

function parsePage(payload: unknown): Page {
	const body = payload as {
		items?: unknown;
		pageCount?: unknown;
		itemCount?: unknown;
	} | null;
	if (!body || !Array.isArray(body.items)) {
		throw new MediaMtxPathsError("invalid", "MediaMTX returned no items list");
	}
	const isCount = (value: unknown): value is number =>
		typeof value === "number" && Number.isInteger(value) && value >= 0;
	// Real MediaMTX always sends both counts. A body with neither is treated as
	// an unpaginated list; a body with a malformed one is rejected.
	if (body.pageCount !== undefined && !isCount(body.pageCount)) {
		throw new MediaMtxPathsError(
			"invalid",
			"MediaMTX returned a bad pageCount",
		);
	}
	if (body.itemCount !== undefined && !isCount(body.itemCount)) {
		throw new MediaMtxPathsError(
			"invalid",
			"MediaMTX returned a bad itemCount",
		);
	}
	return {
		items: body.items as MediaMtxPath[],
		pageCount: (body.pageCount as number | undefined) ?? 1,
		itemCount: body.itemCount as number | undefined,
	};
}

/**
 * Every path on a MediaMTX relay, across all pages of `/v3/paths/list`.
 * Throws unless the whole list was read consistently: callers treat a path
 * missing from the result as stopped, so a partial list must never escape.
 * `timeoutMs` bounds the whole walk, not each request.
 */
export async function fetchMediaMtxPaths(
	apiUrl: string,
	timeoutMs: number,
): Promise<MediaMtxPath[]> {
	const signal = AbortSignal.timeout(timeoutMs);
	const base = `${apiUrl.replace(/\/$/, "")}/v3/paths/list`;
	const items: MediaMtxPath[] = [];
	let first: Page | undefined;
	for (let page = 0; page < (first?.pageCount ?? 1); page++) {
		if (page >= MAX_PAGES) {
			throw new MediaMtxPathsError(
				"invalid",
				`MediaMTX reported ${first?.pageCount} pages`,
			);
		}
		const response = await fetch(
			`${base}?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}`,
			{ signal },
		);
		if (!response.ok) {
			throw new MediaMtxPathsError(
				"http",
				`MediaMTX paths list page ${page} failed with ${response.status}`,
			);
		}
		const current = parsePage(await response.json());
		// Paths added or removed mid-walk shift items between pages, so a
		// changed total means this read may have skipped one.
		if (
			first &&
			(current.pageCount !== first.pageCount ||
				current.itemCount !== first.itemCount)
		) {
			throw new MediaMtxPathsError(
				"incomplete",
				"MediaMTX paths list changed while it was being read",
			);
		}
		first ??= current;
		items.push(...current.items);
	}
	if (first?.itemCount !== undefined) {
		const names = new Set(items.map((item) => item.name));
		if (items.length !== first.itemCount || names.size !== items.length) {
			throw new MediaMtxPathsError(
				"incomplete",
				`MediaMTX listed ${items.length} of ${first.itemCount} paths`,
			);
		}
	}
	return items;
}
