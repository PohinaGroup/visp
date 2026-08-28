import { db } from "@VISP/db";
import {
	appUser,
	relayPath,
	studio,
	studioAsset,
	studioLayer,
	studioScene,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createHash, randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { alertText, type ChatAlert, type ChatAlertKind } from "./chat/contract";
import { snapshotReads, snapshotUploads } from "./snapshots";

export { validateBrowserSourceUrl } from "./studio-browser-url";

import { validateBrowserSourceUrl } from "./studio-browser-url";

export const STUDIO_CAPS = {
	scenes: 3,
	layersPerScene: 8,
	browsers: 2,
	alerts: 1,
} as const;
const STUDIO_PNG_MAX_BYTES = 10 * 1024 * 1024;
const STUDIO_PNG_MAX_DECODED_BYTES = 64 * 1024 * 1024;
const STUDIO_ALERT_LIFETIME_MS = 10_000;
const STUDIO_CANVAS_WIDTH = 1920;
const STUDIO_CANVAS_HEIGHT = 1080;
const STUDIO_CANVAS_PIXELS = STUDIO_CANVAS_WIDTH * STUDIO_CANVAS_HEIGHT;

export function studioAlertKind(kind: ChatAlertKind) {
	return kind === "follow"
		? ("follow" as const)
		: kind === "sub" || kind === "gift"
			? ("sub" as const)
			: kind === "cheer"
				? ("donation" as const)
				: null;
}

export function activeStudioAlert(
	event: string | null,
	label: string | null,
	at: Date | null,
	now = new Date(),
) {
	if (!event || !at || now.getTime() - at.getTime() > STUDIO_ALERT_LIFETIME_MS)
		return null;
	return { event, label: label?.trim() || "Alert", at: at.toISOString() };
}

export function renderStudioAlertLabel(
	alert: ChatAlert,
	render: (event: ChatAlert) => string = alertText,
) {
	try {
		return render(alert).trim().slice(0, 120) || "Alert";
	} catch {
		return "Alert";
	}
}

export function studioLayerRuntimeState(
	wasDisabled: boolean,
	requested: boolean | undefined,
) {
	return requested === false ? false : wasDisabled || requested === true;
}

function pngCrc32(bytes: Uint8Array) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++)
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

export function validateStudioPng(bytes: Uint8Array) {
	if (bytes.byteLength > STUDIO_PNG_MAX_BYTES)
		throw new Error("PNG must be at most 10 MB");
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	if (
		bytes.byteLength < 24 ||
		!signature.every((value, index) => bytes[index] === value)
	)
		throw new Error("Asset is not a valid PNG");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 8;
	let width = 0;
	let height = 0;
	let sawHeader = false;
	let sawData = false;
	let sawEnd = false;
	let bitDepth = 0;
	let colorType = 0;
	let paletteEntries = 0;
	let sawPalette = false;
	let dataEnded = false;
	const imageData: Uint8Array[] = [];
	while (offset + 12 <= bytes.byteLength) {
		const length = view.getUint32(offset);
		const end = offset + 12 + length;
		if (end > bytes.byteLength) throw new Error("Asset is not a valid PNG");
		const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		if (!/^[A-Za-z]{4}$/.test(type))
			throw new Error("Asset is not a valid PNG");
		const expectedCrc = view.getUint32(offset + 8 + length);
		if (
			pngCrc32(bytes.subarray(offset + 4, offset + 8 + length)) !== expectedCrc
		)
			throw new Error("Asset is not a valid PNG");
		if (!sawHeader) {
			if (type !== "IHDR" || length !== 13)
				throw new Error("Asset is not a valid PNG");
			width = view.getUint32(offset + 8);
			height = view.getUint32(offset + 12);
			bitDepth = bytes[offset + 16] ?? 0;
			colorType = bytes[offset + 17] ?? 0;
			const allowedDepths: Record<number, readonly number[]> = {
				0: [1, 2, 4, 8, 16],
				2: [8, 16],
				3: [1, 2, 4, 8],
				4: [8, 16],
				6: [8, 16],
			};
			if (
				!allowedDepths[colorType]?.includes(bitDepth) ||
				bytes[offset + 18] !== 0 ||
				bytes[offset + 19] !== 0 ||
				bytes[offset + 20] !== 0
			)
				throw new Error("PNG format is unsupported");
			sawHeader = true;
		} else if (type === "IHDR") {
			throw new Error("Asset is not a valid PNG");
		} else if (type === "PLTE") {
			if (
				sawPalette ||
				sawData ||
				colorType === 0 ||
				colorType === 4 ||
				length < 3 ||
				length > 768 ||
				length % 3 !== 0
			)
				throw new Error("Asset is not a valid PNG");
			sawPalette = true;
			paletteEntries = length / 3;
		} else if (type === "IDAT") {
			if (dataEnded || (colorType === 3 && !sawPalette))
				throw new Error("Asset is not a valid PNG");
			sawData = true;
			imageData.push(bytes.slice(offset + 8, offset + 8 + length));
		} else if (type === "IEND") {
			if (length !== 0 || end !== bytes.byteLength)
				throw new Error("Asset is not a valid PNG");
			sawEnd = true;
			break;
		} else {
			if (sawData) dataEnded = true;
			if ((type.charCodeAt(0) & 32) === 0)
				throw new Error("Asset is not a valid PNG");
		}
		offset = end;
	}
	if (!sawHeader || !sawData || !sawEnd)
		throw new Error("Asset is not a valid PNG");
	if (width < 1 || height < 1 || width > 7680 || height > 4320)
		throw new Error("PNG dimensions are unsupported");
	if (
		colorType === 3 &&
		(!sawPalette || paletteEntries < 1 || paletteEntries > 2 ** bitDepth)
	)
		throw new Error("Asset is not a valid PNG");
	const channels =
		colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 1;
	const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
	const decodedBytes = (rowBytes + 1) * height;
	if (decodedBytes > STUDIO_PNG_MAX_DECODED_BYTES)
		throw new Error("PNG dimensions are unsupported");
	let decoded: Uint8Array;
	try {
		decoded = inflateSync(Buffer.concat(imageData), {
			maxOutputLength: decodedBytes + 1,
		});
	} catch {
		throw new Error("Asset is not a valid PNG");
	}
	if (decoded.byteLength !== decodedBytes)
		throw new Error("Asset is not a valid PNG");
	for (let row = 0; row < height; row++) {
		const filter = decoded[row * (rowBytes + 1)];
		if (filter === undefined || filter > 4)
			throw new Error("Asset is not a valid PNG");
	}
	return { width, height };
}

export function studioIsConfigured(
	state: { version: number; compositorHealthy: boolean } | null | undefined,
) {
	return (state?.version ?? 0) > 0;
}

const transform = {
	id: z.uuid(),
	name: z.string().trim().min(1).max(64),
	visible: z.boolean(),
	x: z
		.number()
		.int()
		.min(0)
		.max(STUDIO_CANVAS_WIDTH - 1),
	y: z
		.number()
		.int()
		.min(0)
		.max(STUDIO_CANVAS_HEIGHT - 1),
	width: z.number().int().min(1).max(STUDIO_CANVAS_WIDTH),
	height: z.number().int().min(1).max(STUDIO_CANVAS_HEIGHT),
	zIndex: z.number().int().min(0).max(7),
	runtimeDisabled: z.boolean().optional(),
};

export const studioLayerSchema = z.discriminatedUnion("type", [
	z.object({
		...transform,
		type: z.literal("text"),
		text: z.string().max(500),
	}),
	z.object({ ...transform, type: z.literal("png"), assetId: z.uuid() }),
	z.object({
		...transform,
		type: z.literal("browser"),
		url: z.string().max(2048).transform(validateBrowserSourceUrl),
	}),
	z.object({
		...transform,
		type: z.literal("alert"),
		event: z.enum(["follow", "sub", "donation"]),
	}),
]);

const sceneSchema = z.object({
	id: z.uuid(),
	name: z.string().trim().min(1).max(64),
	order: z.number().int().min(0).max(2),
	transition: z.enum(["cut", "fade"]),
	layers: z.array(studioLayerSchema),
});

export const studioGraphSchema = z
	.object({ activeSceneId: z.uuid().nullable(), scenes: z.array(sceneSchema) })
	.superRefine((graph, context) => {
		if (graph.scenes.length > STUDIO_CAPS.scenes) {
			context.addIssue({ code: "custom", message: "Scene limit reached (3)" });
		}
		if (
			graph.activeSceneId &&
			!graph.scenes.some((scene) => scene.id === graph.activeSceneId)
		) {
			context.addIssue({ code: "custom", message: "Active scene is missing" });
		}
		const ids = new Set<string>();
		const sceneOrders = new Set<number>();
		let browsers = 0;
		let alerts = 0;
		const scenePixels = new Map<string, number>();
		for (const scene of graph.scenes) {
			if (sceneOrders.has(scene.order))
				context.addIssue({
					code: "custom",
					message: "Scene orders must be unique",
				});
			sceneOrders.add(scene.order);
			if (ids.has(scene.id))
				context.addIssue({
					code: "custom",
					message: "Scene IDs must be unique",
				});
			ids.add(scene.id);
			if (scene.layers.length > STUDIO_CAPS.layersPerScene) {
				context.addIssue({
					code: "custom",
					message: "Layer limit reached (8)",
				});
			}
			const layerZIndices = new Set<number>();
			for (const layer of scene.layers) {
				if (layerZIndices.has(layer.zIndex))
					context.addIssue({
						code: "custom",
						message: "Layer z-indexes must be unique within a scene",
					});
				layerZIndices.add(layer.zIndex);
				if (
					layer.x + layer.width > STUDIO_CANVAS_WIDTH ||
					layer.y + layer.height > STUDIO_CANVAS_HEIGHT
				)
					context.addIssue({
						code: "custom",
						message: "Layer must fit the 1920×1080 canvas",
					});
				if (layer.visible && layer.runtimeDisabled !== true)
					scenePixels.set(
						scene.id,
						(scenePixels.get(scene.id) ?? 0) + layer.width * layer.height,
					);
				if (ids.has(layer.id))
					context.addIssue({
						code: "custom",
						message: "Layer IDs must be unique",
					});
				ids.add(layer.id);
				if (layer.type === "browser") browsers++;
				if (layer.type === "alert") alerts++;
			}
		}
		for (const pixels of scenePixels.values()) {
			if (pixels > STUDIO_CANVAS_PIXELS * 2)
				context.addIssue({
					code: "custom",
					message: "Active scene pixel budget exceeded",
				});
		}
		const activeScene = graph.scenes.find(
			(scene) => scene.id === graph.activeSceneId,
		);
		if (activeScene?.transition === "fade") {
			const otherPixels = Math.max(
				0,
				...graph.scenes
					.filter((scene) => scene.id !== activeScene.id)
					.map((scene) => scenePixels.get(scene.id) ?? 0),
			);
			if (
				(scenePixels.get(activeScene.id) ?? 0) + otherPixels >
				STUDIO_CANVAS_PIXELS * 3
			)
				context.addIssue({
					code: "custom",
					message: "Crossfade pixel budget exceeded",
				});
		}
		if (browsers > STUDIO_CAPS.browsers)
			context.addIssue({
				code: "custom",
				message: "Browser source limit reached (2)",
			});
		if (alerts > STUDIO_CAPS.alerts)
			context.addIssue({
				code: "custom",
				message: "Alert layer limit reached (1)",
			});
	});

export type StudioGraph = z.infer<typeof studioGraphSchema>;
export type DirectProductionMode = "cloud_studio" | "obs";

const COMPOSITOR_HEARTBEAT_TIMEOUT_MS = 5_000;

export function compositorIsHealthy(
	healthy: boolean,
	checkedAt: Date | null | undefined,
	now = new Date(),
) {
	return (
		healthy &&
		checkedAt instanceof Date &&
		now.getTime() - checkedAt.getTime() <= COMPOSITOR_HEARTBEAT_TIMEOUT_MS
	);
}

export function studioRelayPlan(input: {
	cloudEnabled: boolean;
	compositorHealthy: boolean;
	mode: DirectProductionMode;
	programUrl?: string | null;
}) {
	return input.cloudEnabled &&
		input.compositorHealthy &&
		input.mode === "cloud_studio" &&
		input.programUrl
		? { mode: "program" as const, inputUrl: input.programUrl }
		: { mode: "passthrough" as const };
}

export async function getStudioGraph(userId: string): Promise<StudioGraph> {
	const [scenes, layers] = await Promise.all([
		db
			.select()
			.from(studioScene)
			.where(eq(studioScene.studioUserId, userId))
			.orderBy(asc(studioScene.position)),
		db
			.select({ layer: studioLayer, sceneOwner: studioScene.studioUserId })
			.from(studioLayer)
			.innerJoin(studioScene, eq(studioLayer.sceneId, studioScene.id))
			.where(eq(studioScene.studioUserId, userId))
			.orderBy(asc(studioLayer.position)),
	]);
	const active = scenes.find((scene) => scene.active)?.id ?? null;
	return {
		activeSceneId: active,
		scenes: scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			order: scene.position,
			transition: scene.transition,
			layers: layers
				.filter(({ layer }) => layer.sceneId === scene.id)
				.map(({ layer }) => {
					const base = {
						id: layer.id,
						name: layer.name,
						visible: layer.visible,
						...(layer.disabledByRuntime ? { runtimeDisabled: true } : {}),
						x: layer.x,
						y: layer.y,
						width: layer.width,
						height: layer.height,
						zIndex: layer.position,
					};
					switch (layer.type) {
						case "text":
							return { ...base, type: "text" as const, text: layer.text ?? "" };
						case "png":
							return {
								...base,
								type: "png" as const,
								assetId: layer.assetId ?? "",
							};
						case "browser":
							return {
								...base,
								type: "browser" as const,
								url: layer.browserUrl ?? "",
							};
						case "alert":
							return {
								...base,
								type: "alert" as const,
								event: (layer.alertEvent ?? "follow") as
									| "follow"
									| "sub"
									| "donation",
							};
						default:
							throw new Error("Unknown Studio layer type");
					}
				}),
		})),
	};
}

export async function saveStudioGraph(userId: string, input: StudioGraph) {
	const graph = studioGraphSchema.parse(input);
	const assetIds = graph.scenes.flatMap((scene) =>
		scene.layers.flatMap((layer) =>
			layer.type === "png" ? [layer.assetId] : [],
		),
	);
	if (assetIds.length) {
		const owned = await db
			.select({ id: studioAsset.id })
			.from(studioAsset)
			.where(
				and(
					eq(studioAsset.userId, userId),
					inArray(studioAsset.id, assetIds),
					isNotNull(studioAsset.verifiedAt),
				),
			);
		if (owned.length !== new Set(assetIds).size)
			throw new Error("PNG asset not found");
	}
	await db.transaction(async (tx) => {
		const previouslyDisabled = new Set(
			(
				await tx
					.select({ id: studioLayer.id })
					.from(studioLayer)
					.innerJoin(studioScene, eq(studioScene.id, studioLayer.sceneId))
					.where(
						and(
							eq(studioScene.studioUserId, userId),
							eq(studioLayer.disabledByRuntime, true),
						),
					)
			).map(({ id }) => id),
		);
		await tx
			.insert(studio)
			.values({ userId, version: 1 })
			.onConflictDoUpdate({
				target: studio.userId,
				set: { version: sql`${studio.version} + 1`, updatedAt: new Date() },
			});
		await tx.delete(studioScene).where(eq(studioScene.studioUserId, userId));
		if (!graph.scenes.length) return;
		await tx.insert(studioScene).values(
			graph.scenes.map((scene) => ({
				id: scene.id,
				studioUserId: userId,
				name: scene.name,
				position: scene.order,
				transition: scene.transition,
				active: scene.id === graph.activeSceneId,
			})),
		);
		const layers = graph.scenes.flatMap((scene) =>
			scene.layers.map((layer) => ({
				id: layer.id,
				sceneId: scene.id,
				type: layer.type,
				name: layer.name,
				visible: layer.visible,
				position: layer.zIndex,
				x: layer.x,
				y: layer.y,
				width: layer.width,
				height: layer.height,
				text: layer.type === "text" ? layer.text : null,
				assetId: layer.type === "png" ? layer.assetId : null,
				browserUrl: layer.type === "browser" ? layer.url : null,
				alertEvent: layer.type === "alert" ? layer.event : null,
				disabledByRuntime: studioLayerRuntimeState(
					previouslyDisabled.has(layer.id),
					layer.runtimeDisabled,
				),
			})),
		);
		if (layers.length) await tx.insert(studioLayer).values(layers);
	});
	return getStudioGraph(userId);
}

export async function getStudioSettings(userId: string) {
	const [owner] = await db
		.select({
			mode: appUser.directProductionMode,
			emptyWarningDismissed: appUser.studioEmptyWarningDismissed,
		})
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	const [state] = await db
		.select({
			healthy: studio.compositorHealthy,
			checkedAt: studio.compositorCheckedAt,
			version: studio.version,
		})
		.from(studio)
		.where(eq(studio.userId, userId))
		.limit(1);
	const mode = (owner?.mode ?? "obs") as DirectProductionMode;
	const healthy = compositorIsHealthy(
		state?.healthy ?? false,
		state?.checkedAt,
	);
	return {
		available: env.CLOUD_STUDIO_ENABLED,
		configured: studioIsConfigured({
			version: state?.version ?? 0,
			compositorHealthy: healthy,
		}),
		mode,
		effectiveMode: env.CLOUD_STUDIO_ENABLED ? mode : ("obs" as const),
		emptyWarningDismissed: owner?.emptyWarningDismissed ?? false,
		compositorHealthy: healthy,
		compositorCheckedAt: state?.checkedAt?.toISOString() ?? null,
		passthrough:
			mode === "cloud_studio" && (!env.CLOUD_STUDIO_ENABLED || !healthy),
	};
}

export async function setStudioMode(
	userId: string,
	mode: DirectProductionMode,
) {
	if (mode === "cloud_studio" && !env.CLOUD_STUDIO_ENABLED)
		throw new Error("Cloud Studio is not available");
	await db
		.update(appUser)
		.set({ directProductionMode: mode })
		.where(eq(appUser.id, userId));
	return getStudioSettings(userId);
}

export async function setEmptyStudioWarning(
	userId: string,
	dismissed: boolean,
) {
	await db
		.update(appUser)
		.set({ studioEmptyWarningDismissed: dismissed })
		.where(eq(appUser.id, userId));
	return { dismissed };
}

export function studioAssetKey(userId: string, assetId: string) {
	return `studio-staging/${userId}/${assetId}/${randomUUID()}.png`;
}

type StudioAssetStore = {
	read(key: string, maxBytes: number): Promise<Uint8Array>;
	write(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
	delete(key: string): Promise<void>;
};

export async function promoteStudioPng(
	stagingKey: string,
	verifiedPrefix: string,
	store: StudioAssetStore = snapshotReads,
) {
	const bytes = await store.read(stagingKey, STUDIO_PNG_MAX_BYTES + 1);
	const dimensions = validateStudioPng(bytes);
	const checksum = createHash("sha256").update(bytes).digest("hex");
	const key = `${verifiedPrefix}/${checksum}.png`;
	await store.write(key, bytes, "image/png");
	await store.delete(stagingKey);
	return { ...dimensions, checksum, key };
}

export async function createStudioAssetUpload(userId: string, assetId: string) {
	const key = studioAssetKey(userId, assetId);
	await db
		.insert(studioAsset)
		.values({ id: assetId, userId, key, contentType: "image/png" });
	return {
		assetId,
		uploadUrl: await snapshotUploads.presign(key, {
			expiresIn: 60,
			method: "PUT",
		}),
	};
}

export async function getStudioAssetUrl(userId: string, assetId: string) {
	const [asset] = await db
		.select({ key: studioAsset.key })
		.from(studioAsset)
		.where(
			and(
				eq(studioAsset.id, assetId),
				eq(studioAsset.userId, userId),
				isNotNull(studioAsset.verifiedAt),
			),
		)
		.limit(1);
	return asset
		? snapshotReads.presign(asset.key, { expiresIn: 120, method: "GET" })
		: null;
}

export async function finalizeStudioAsset(userId: string, assetId: string) {
	const result = await db.transaction(async (tx) => {
		const [asset] = await tx
			.select({
				key: studioAsset.key,
				verifiedAt: studioAsset.verifiedAt,
				width: studioAsset.width,
				height: studioAsset.height,
			})
			.from(studioAsset)
			.where(and(eq(studioAsset.id, assetId), eq(studioAsset.userId, userId)))
			.limit(1)
			.for("update");
		if (!asset) throw new Error("Studio asset not found");
		if (asset.verifiedAt && asset.width && asset.height)
			return { value: { width: asset.width, height: asset.height } };
		let cleanupKey = asset.key;
		try {
			const verified = await promoteStudioPng(
				asset.key,
				`studio-verified/${userId}/${assetId}`,
			);
			cleanupKey = verified.key;
			await tx
				.update(studioAsset)
				.set({ ...verified, verifiedAt: new Date() })
				.where(
					and(eq(studioAsset.id, assetId), eq(studioAsset.userId, userId)),
				);
			return { value: { width: verified.width, height: verified.height } };
		} catch (error) {
			await snapshotReads.delete(cleanupKey).catch(() => undefined);
			await tx
				.delete(studioAsset)
				.where(
					and(
						eq(studioAsset.id, assetId),
						eq(studioAsset.userId, userId),
						eq(studioAsset.key, asset.key),
						isNull(studioAsset.verifiedAt),
					),
				);
			return { error };
		}
	});
	if ("error" in result) throw result.error;
	return result.value;
}

export async function compositorDesiredState(path: string) {
	const [record] = await db
		.select({
			userId: relayPath.userId,
			mode: appUser.directProductionMode,
			healthy: studio.compositorHealthy,
			checkedAt: studio.compositorCheckedAt,
			programUrl: studio.programUrl,
			version: studio.version,
			lastAlert: studio.lastAlert,
			lastAlertEvent: studio.lastAlertEvent,
			lastAlertAt: studio.lastAlertAt,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.leftJoin(studio, eq(studio.userId, relayPath.userId))
		.where(eq(relayPath.slug, path))
		.limit(1);
	if (!record) return null;
	const plan = studioRelayPlan({
		cloudEnabled: env.CLOUD_STUDIO_ENABLED,
		compositorHealthy: compositorIsHealthy(
			record.healthy ?? false,
			record.checkedAt,
		),
		mode: record.mode as DirectProductionMode,
		programUrl: record.programUrl,
	});
	const graph = await getStudioGraph(record.userId);
	const scenes = await Promise.all(
		graph.scenes.map(async (scene) => ({
			...scene,
			layers: await Promise.all(
				scene.layers.map(async (layer) =>
					layer.type === "png"
						? {
								...layer,
								url: await getStudioAssetUrl(record.userId, layer.assetId),
							}
						: layer,
				),
			),
		})),
	);
	return {
		...plan,
		requestedMode:
			env.CLOUD_STUDIO_ENABLED && record.mode === "cloud_studio"
				? ("program" as const)
				: ("passthrough" as const),
		version: record.version ?? 0,
		graph: { ...graph, scenes },
		alert: activeStudioAlert(
			record.lastAlertEvent,
			record.lastAlert,
			record.lastAlertAt,
		),
	};
}

export async function reportCompositorHealth(
	path: string,
	healthy: boolean,
	programUrl?: string,
) {
	if (healthy) {
		const url = programUrl ? new URL(programUrl) : null;
		if (
			url?.protocol !== "rtsp:" ||
			url.hostname !== "127.0.0.1" ||
			url.username ||
			url.password ||
			url.pathname !== `/studio/${path}`
		) {
			throw new Error("Program URL must be a local Studio RTSP path");
		}
	}
	const [owner] = await db
		.select({ userId: relayPath.userId })
		.from(relayPath)
		.where(eq(relayPath.slug, path))
		.limit(1);
	if (!owner) return false;
	await db
		.insert(studio)
		.values({
			userId: owner.userId,
			compositorHealthy: healthy,
			programUrl: healthy ? programUrl : null,
			compositorCheckedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: studio.userId,
			set: {
				compositorHealthy: healthy,
				programUrl: healthy ? programUrl : null,
				compositorCheckedAt: new Date(),
			},
		});
	return true;
}

export async function reportBrowserFailure(path: string, layerId: string) {
	const [owner] = await db
		.select({ userId: relayPath.userId })
		.from(relayPath)
		.where(eq(relayPath.slug, path))
		.limit(1);
	if (!owner) return false;
	const [disabled] = await db
		.update(studioLayer)
		.set({ disabledByRuntime: true })
		.from(studioScene)
		.where(
			and(
				eq(studioLayer.id, layerId),
				eq(studioLayer.sceneId, studioScene.id),
				eq(studioScene.studioUserId, owner.userId),
				eq(studioLayer.type, "browser"),
			),
		)
		.returning({ id: studioLayer.id });
	return Boolean(disabled);
}

export async function deliverStudioAlert(
	path: string,
	event: "follow" | "sub" | "donation",
	label?: string,
) {
	const [owner] = await db
		.select({ userId: relayPath.userId })
		.from(relayPath)
		.where(eq(relayPath.slug, path))
		.limit(1);
	if (!owner) return false;
	await db
		.insert(studio)
		.values({
			userId: owner.userId,
			lastAlert: label?.trim().slice(0, 120) || null,
			lastAlertEvent: event,
			lastAlertAt: new Date(),
		})
		.onConflictDoUpdate({
			target: studio.userId,
			set: {
				lastAlert: label?.trim().slice(0, 120) || null,
				lastAlertEvent: event,
				lastAlertAt: new Date(),
			},
		});
	return { event, fallback: null };
}

export async function deliverStudioProviderAlert(
	userId: string,
	alert: ChatAlert,
) {
	const event = studioAlertKind(alert.kind);
	if (!event) return false;
	const [configured] = await db
		.select({ id: studioLayer.id })
		.from(studioLayer)
		.innerJoin(studioScene, eq(studioScene.id, studioLayer.sceneId))
		.where(
			and(
				eq(studioScene.studioUserId, userId),
				eq(studioLayer.type, "alert"),
				eq(studioLayer.alertEvent, event),
			),
		)
		.limit(1);
	if (!configured) return false;
	await db
		.update(studio)
		.set({
			lastAlert: renderStudioAlertLabel(alert),
			lastAlertEvent: event,
			lastAlertAt: new Date(),
		})
		.where(eq(studio.userId, userId));
	return true;
}
