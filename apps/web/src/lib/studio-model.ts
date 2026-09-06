import type { StudioGraph } from "@VISP/api/studio";
export type StudioScene = StudioGraph["scenes"][number];
export type StudioLayerType = StudioScene["layers"][number]["type"];
export type StudioLayer = StudioScene["layers"][number];
export type StudioLayerUpdate = Partial<
	Pick<
		StudioLayer,
		| "name"
		| "visible"
		| "runtimeDisabled"
		| "x"
		| "y"
		| "width"
		| "height"
		| "zIndex"
	>
> & {
	text?: string;
	url?: string;
	assetId?: string;
	event?: "follow" | "sub" | "donation";
};

function clampInteger(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

const STUDIO_WIDTH = 1920;
const STUDIO_HEIGHT = 1080;
const STUDIO_PIXELS = STUDIO_WIDTH * STUDIO_HEIGHT;

function assertStudioPixelBudget(graph: StudioGraph) {
	const scenePixels = graph.scenes.map((scene) =>
		scene.layers.reduce(
			(total, layer) =>
				total +
				(layer.visible && !layer.runtimeDisabled
					? layer.width * layer.height
					: 0),
			0,
		),
	);
	if (scenePixels.some((pixels) => pixels > STUDIO_PIXELS * 2))
		throw new Error("Studio layer pixel budget exceeded");
	const activeIndex = graph.scenes.findIndex(
		({ id }) => id === graph.activeSceneId,
	);
	if (
		activeIndex >= 0 &&
		graph.scenes[activeIndex]?.transition === "fade" &&
		(scenePixels[activeIndex] ?? 0) +
			Math.max(0, ...scenePixels.filter((_, index) => index !== activeIndex)) >
			STUDIO_PIXELS * 3
	)
		throw new Error("Studio crossfade pixel budget exceeded");
}

export function shouldEnterStudio(settings: {
	available: boolean;
	configured: boolean;
	mode: "cloud_studio" | "obs";
}) {
	return (
		settings.available &&
		settings.mode === "cloud_studio" &&
		!settings.configured
	);
}

export function browserSourceUrlError(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol === "https:" && !url.username && !url.password)
			return null;
	} catch {
		// The server performs the full public-address check at the trust boundary.
	}
	return "Browser source must be a public HTTPS URL";
}

export function studioPreviewUrls(
	preview: { camera?: string; program?: string } | null | undefined,
	live: boolean,
	passthrough: boolean,
) {
	if (!live) return {};
	return {
		...(preview?.camera ? { camera: preview.camera } : {}),
		...(!passthrough && preview?.program ? { program: preview.program } : {}),
	};
}

/** How long a fresh ingest may go without a healthy worker before it is a fallback. */
export const STUDIO_STARTUP_GRACE_MS = 20_000;

export type StudioStreamStatus =
	| "unknown"
	| "idle"
	| "camera-connected"
	| "studio-starting"
	| "overlays-active"
	| "camera-only"
	| "preview-failed";

export type StudioStreamInput = {
	/** False whenever any status query is erroring or has never loaded. */
	statusKnown: boolean;
	mode: "cloud_studio" | "obs";
	/** A path is publishing into VISP right now. */
	cameraLive: boolean;
	/** When that ingest connected, used only to tell "starting" from "fallback". */
	cameraLiveSince?: string | null;
	/** A compositor worker reported a fresh healthy heartbeat. */
	compositorHealthy: boolean;
	/** Platform outputs confirmed live by the destination state, not by the worker. */
	outputsLive: number;
	/** The browser's own WHEP pane failed. Says nothing about the broadcast. */
	previewFailed: boolean;
	now?: number;
};

/**
 * The one place that decides what the Studio page claims about the stream.
 *
 * Two rules it exists to enforce:
 * a worker heartbeat is evidence about overlays, never about viewers — only
 * `outputsLive` may back a "still broadcasting" claim; and a failed browser
 * preview is a fact about this tab, so it never downgrades the stream state.
 */
export function studioStreamStatus(input: StudioStreamInput): {
	status: StudioStreamStatus;
	/** Safe to tell the user their camera is still reaching viewers. */
	broadcastConfirmed: boolean;
} {
	const broadcastConfirmed = input.statusKnown && input.outputsLive > 0;
	if (!input.statusKnown) return { status: "unknown", broadcastConfirmed };
	if (!input.cameraLive)
		return {
			status: input.previewFailed ? "preview-failed" : "idle",
			broadcastConfirmed,
		};
	if (input.mode !== "cloud_studio")
		return {
			status: input.previewFailed ? "preview-failed" : "camera-connected",
			broadcastConfirmed,
		};
	if (input.compositorHealthy)
		return {
			status: input.previewFailed ? "preview-failed" : "overlays-active",
			broadcastConfirmed,
		};
	const connectedAt = input.cameraLiveSince
		? Date.parse(input.cameraLiveSince)
		: Number.NaN;
	const starting =
		Number.isFinite(connectedAt) &&
		(input.now ?? Date.now()) - connectedAt < STUDIO_STARTUP_GRACE_MS;
	return {
		status: starting ? "studio-starting" : "camera-only",
		broadcastConfirmed,
	};
}

/**
 * Copy per state. Both strings are English source keys; `t()` supplies Finnish.
 * `camera-only` never claims viewers are receiving video — the caller appends
 * the broadcast line only when `broadcastConfirmed` is true.
 */
export function studioStreamCopy(status: StudioStreamStatus): {
	title: string;
	description: string;
	tone: "info" | "warning" | "error" | "success";
} {
	switch (status) {
		case "unknown":
			return {
				title: "Stream status unavailable",
				description:
					"VISP cannot read your stream status right now. Retrying automatically.",
				tone: "warning",
			};
		case "idle":
			return {
				title: "Nothing is streaming right now",
				description:
					"Start publishing from the VISP app or OBS to see live status here.",
				tone: "info",
			};
		case "camera-connected":
			return {
				title: "Camera connected",
				description:
					"VISP is receiving your camera. Cloud Studio is off, so overlays are not applied.",
				tone: "info",
			};
		case "studio-starting":
			return {
				title: "Cloud Studio is starting",
				description:
					"VISP is bringing up the compositor for this camera. Overlays appear in a few seconds.",
				tone: "info",
			};
		case "overlays-active":
			return {
				title: "Overlays are being applied",
				description:
					"Cloud Studio is compositing your saved program onto the camera.",
				tone: "success",
			};
		case "camera-only":
			return {
				title: "Cloud Studio is temporarily unavailable",
				description:
					"Overlays aren't being applied. VISP will retry automatically.",
				tone: "warning",
			};
		case "preview-failed":
			return {
				title: "Preview unavailable",
				description:
					"This browser could not connect to the preview. Stream status is shown separately below.",
				tone: "warning",
			};
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

export function newStudioScene(
	id: string = crypto.randomUUID(),
	name = "Scene",
): StudioScene {
	return { id, name, order: 0, transition: "cut", layers: [] };
}

export function addStudioScene(
	graph: StudioGraph,
	id: string = crypto.randomUUID(),
) {
	if (graph.scenes.length >= 3) throw new Error("Scene limit reached (3)");
	const scene = { ...newStudioScene(id), order: graph.scenes.length };
	// Adding a scene is an edit, not a cut: whatever is on air stays on air until
	// the user puts the new scene on air on purpose.
	return {
		activeSceneId: graph.activeSceneId ?? scene.id,
		scenes: [...graph.scenes, scene],
	};
}

export function renameStudioScene(
	graph: StudioGraph,
	sceneId: string,
	name: string,
) {
	const trimmed = name.trim();
	if (!trimmed) throw new Error("Scene name is required");
	return {
		...graph,
		scenes: graph.scenes.map((scene) =>
			scene.id === sceneId ? { ...scene, name: trimmed.slice(0, 64) } : scene,
		),
	};
}

export function deleteStudioScene(graph: StudioGraph, sceneId: string) {
	const scenes = graph.scenes
		.filter(({ id }) => id !== sceneId)
		.map((scene, order) => ({ ...scene, order }));
	return {
		activeSceneId:
			graph.activeSceneId === sceneId
				? (scenes[0]?.id ?? null)
				: graph.activeSceneId,
		scenes,
	};
}

export function addStudioLayer(
	scenes: StudioScene[],
	sceneId: string,
	type: StudioLayerType,
	assetId?: string,
): StudioScene[] {
	const browsers = scenes
		.flatMap(({ layers }) => layers)
		.filter((layer) => layer.type === "browser").length;
	const alerts = scenes
		.flatMap(({ layers }) => layers)
		.filter((layer) => layer.type === "alert").length;
	if (type === "browser" && browsers >= 2)
		throw new Error("Browser source limit reached (2)");
	if (type === "alert" && alerts >= 1)
		throw new Error("Alert layer limit reached (1)");
	return scenes.map((scene) => {
		if (scene.id !== sceneId) return scene;
		if (scene.layers.length >= 8) throw new Error("Layer limit reached (8)");
		const base = {
			id: crypto.randomUUID(),
			name: type[0]?.toUpperCase() + type.slice(1),
			visible: true,
			x: 40,
			y: 40,
			width: 640,
			height: type === "text" ? 120 : 360,
			zIndex: scene.layers.length,
		};
		const layer =
			type === "text"
				? { ...base, type, text: "Text" }
				: type === "png"
					? { ...base, type, assetId: assetId ?? crypto.randomUUID() }
					: type === "browser"
						? { ...base, type, url: "https://example.com/" }
						: { ...base, type, event: "follow" as const };
		return { ...scene, layers: [...scene.layers, layer] };
	});
}

export function addStudioSource(
	graph: StudioGraph,
	type: StudioLayerType,
	assetId?: string,
	firstSceneId: string = crypto.randomUUID(),
) {
	const scene =
		graph.scenes.find(({ id }) => id === graph.activeSceneId) ??
		graph.scenes[0] ??
		newStudioScene(firstSceneId, "Main");
	const scenes = graph.scenes.length ? graph.scenes : [scene];
	return {
		activeSceneId: scene.id,
		scenes: addStudioLayer(scenes, scene.id, type, assetId),
	};
}

export function selectStudioScene(graph: StudioGraph, sceneId: string) {
	return graph.scenes.some(({ id }) => id === sceneId)
		? { ...graph, activeSceneId: sceneId }
		: graph;
}

export function updateStudioLayer(
	graph: StudioGraph,
	layerId: string,
	update: StudioLayerUpdate,
) {
	const next = {
		...graph,
		scenes: graph.scenes.map((scene) => ({
			...scene,
			layers: scene.layers.map((layer) => {
				if (layer.id !== layerId) return layer;
				const width = clampInteger(
					update.width ?? layer.width,
					1,
					STUDIO_WIDTH,
				);
				const height = clampInteger(
					update.height ?? layer.height,
					1,
					STUDIO_HEIGHT,
				);
				const common = {
					...layer,
					...(update.name === undefined ? {} : { name: update.name }),
					...(update.visible === undefined ? {} : { visible: update.visible }),
					...(update.runtimeDisabled === undefined
						? {}
						: { runtimeDisabled: update.runtimeDisabled }),
					x: clampInteger(update.x ?? layer.x, 0, STUDIO_WIDTH - width),
					y: clampInteger(update.y ?? layer.y, 0, STUDIO_HEIGHT - height),
					width,
					height,
					...(update.zIndex === undefined
						? {}
						: { zIndex: clampInteger(update.zIndex, 0, 7) }),
				};
				switch (layer.type) {
					case "text":
						return {
							...common,
							type: "text" as const,
							text: update.text ?? layer.text,
						};
					case "browser":
						return {
							...common,
							type: "browser" as const,
							url: update.url ?? layer.url,
						};
					case "alert":
						return {
							...common,
							type: "alert" as const,
							event: update.event ?? layer.event,
						};
					case "png":
						return {
							...common,
							type: "png" as const,
							assetId: update.assetId ?? layer.assetId,
						};
					default:
						throw new Error("Unknown Studio layer type");
				}
			}),
		})),
	};
	assertStudioPixelBudget(next);
	return next;
}

export function deleteStudioLayer(graph: StudioGraph, layerId: string) {
	return {
		...graph,
		scenes: graph.scenes.map((scene) => ({
			...scene,
			layers: scene.layers
				.filter(({ id }) => id !== layerId)
				.map((layer, zIndex) => ({ ...layer, zIndex })),
		})),
	};
}

export function moveStudioLayer(
	graph: StudioGraph,
	layerId: string,
	direction: "up" | "down",
) {
	return {
		...graph,
		scenes: graph.scenes.map((scene) => {
			const layers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
			const from = layers.findIndex(({ id }) => id === layerId);
			const to = direction === "up" ? from + 1 : from - 1;
			if (from < 0 || to < 0 || to >= layers.length) return scene;
			const source = layers[from];
			const target = layers[to];
			if (!source || !target) return scene;
			layers[from] = target;
			layers[to] = source;
			return {
				...scene,
				layers: layers.map((layer, zIndex) => ({ ...layer, zIndex })),
			};
		}),
	};
}

export function navigationChoice(choice: "save" | "discard" | "cancel") {
	return choice === "save"
		? ("save-before-leaving" as const)
		: choice === "discard"
			? ("leave-without-saving" as const)
			: ("stay" as const);
}

export function studioLayerDisplayState(layer: {
	visible: boolean;
	runtimeDisabled?: boolean;
}) {
	return {
		failed: layer.runtimeDisabled === true,
		visible: layer.visible && layer.runtimeDisabled !== true,
	};
}

export type StudioPreviewReason =
	| "idle"
	| "passthrough"
	| "no-path"
	| "offline";
export type StudioPreviewPane =
	| { url: string; reason?: undefined }
	| { url?: undefined; reason: StudioPreviewReason };

/**
 * Every preview pane carries either a URL or the reason it has none, so the UI
 * never shows a black box without saying why it is black.
 */
export function studioPreviewPanes(
	preview: { camera?: string; program?: string } | null | undefined,
	live: boolean,
	passthrough: boolean,
	online = true,
): { camera: StudioPreviewPane; program: StudioPreviewPane } {
	const urls = studioPreviewUrls(preview, live, passthrough);
	const blocked: StudioPreviewReason | null = !online
		? "offline"
		: live
			? null
			: "idle";
	return {
		camera: blocked
			? { reason: blocked }
			: urls.camera
				? { url: urls.camera }
				: { reason: "no-path" },
		program: blocked
			? { reason: blocked }
			: passthrough
				? { reason: "passthrough" }
				: urls.program
					? { url: urls.program }
					: { reason: "no-path" },
	};
}

/**
 * Turns a raw model or server error into the next thing the user can do about
 * it. Unknown messages fall through unchanged.
 */
/**
 * Seconds a rate-limited request must wait, taken from the server's own limiter
 * rather than guessed, so the UI can name the real number.
 */
export function rateLimitRetrySeconds(error: unknown) {
	const data = (error as { data?: { retryAfterMs?: unknown } } | null)?.data;
	return typeof data?.retryAfterMs === "number"
		? Math.max(1, Math.ceil(data.retryAfterMs / 1_000))
		: null;
}

export function studioErrorHint(message: string) {
	switch (message) {
		case "Studio layer pixel budget exceeded":
			return "Sources cover too much of the frame. Make one smaller or hide it, then try again.";
		case "Studio crossfade pixel budget exceeded":
			return "Fade renders two scenes at once. Shrink a source, or set this scene to Cut.";
		case "Scene limit reached (3)":
			return "Delete a scene before adding another. Cloud Studio allows 3.";
		case "Layer limit reached (8)":
			return "This scene is full. Delete a source before adding another. Each scene allows 8.";
		case "Browser source limit reached (2)":
			return "Delete a browser source before adding another. Cloud Studio allows 2 in total.";
		case "Alert layer limit reached (1)":
			return "You already have a VISP alert. One alert source covers every event.";
		case "Browser source must be a public HTTPS URL":
			return "Use an https:// address that opens in a normal browser tab, with no username or password in it.";
		default:
			return message;
	}
}

export type StudioSaveBlocker = {
	sceneId: string;
	sceneName: string;
	layerId: string;
	layerName: string;
	message: string;
};

/**
 * Problems the server would reject on save, named per source so the UI can say
 * which one to fix. Only real rejections belong here — an empty text layer is
 * legal, and is surfaced as a warning on the field instead.
 */
export function studioSaveBlockers(graph: StudioGraph): StudioSaveBlocker[] {
	return graph.scenes.flatMap((scene) =>
		scene.layers.flatMap((layer) => {
			const message =
				layer.type === "browser" ? browserSourceUrlError(layer.url) : null;
			return message
				? [
						{
							sceneId: scene.id,
							sceneName: scene.name,
							layerId: layer.id,
							layerName: layer.name,
							message,
						},
					]
				: [];
		}),
	);
}

/** Remaining headroom per source type, so limits are visible before they bite. */
export function studioSourceCapacity(
	graph: StudioGraph,
	sceneId: string | undefined,
) {
	const layers = graph.scenes.flatMap(({ layers }) => layers);
	const scene = graph.scenes.find(({ id }) => id === sceneId);
	return {
		layers: { used: scene?.layers.length ?? 0, max: 8 },
		browser: {
			used: layers.filter(({ type }) => type === "browser").length,
			max: 2,
		},
		alert: {
			used: layers.filter(({ type }) => type === "alert").length,
			max: 1,
		},
		scenes: { used: graph.scenes.length, max: 3 },
	};
}

/**
 * Where a dragged layer lands: pointer travel is in rendered pixels, the graph
 * is in frame pixels, so the delta is divided by the canvas scale.
 * `updateStudioLayer` does the clamping into the frame.
 */
export function draggedLayerPosition(
	origin: { x: number; y: number },
	start: { x: number; y: number },
	pointer: { x: number; y: number },
	scale: number,
) {
	if (scale <= 0) return origin;
	return {
		x: Math.round(origin.x + (pointer.x - start.x) / scale),
		y: Math.round(origin.y + (pointer.y - start.y) / scale),
	};
}
