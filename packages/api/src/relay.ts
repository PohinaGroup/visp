import { db } from "@VISP/db";
import {
	account,
	appUser,
	pathState,
	relayPath,
	rttSample,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";

const AUTH_CACHE_TTL_MS = 60_000;

type AuthCacheEntry = {
	expiresAt: number;
	handle: string;
	pathId: number;
	publishSecretHash: string | null;
	readSecretHash: string | null;
	userId: string;
};

type MediaAction = "publish" | "read";
type NetworkProfile = "wired" | "wifi" | "cellular";
type PublishOrigin = "native" | "web";

const authCache = new Map<string, AuthCacheEntry>();
const publishEncryptionKey = Buffer.from(
	env.PUBLISH_URL_ENCRYPTION_KEY,
	"base64",
);

function slugify(value: string) {
	return (
		value
			.normalize("NFKD")
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "streamer"
	);
}

function isUniqueViolation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "23505"
	);
}

function normalizeLabel(label: string) {
	const normalized = label.trim();
	if (normalized.length < 1 || normalized.length > 64) {
		throw new Error("Path labels must be between 1 and 64 characters");
	}
	return normalized;
}

function secret() {
	return randomBytes(24).toString("hex");
}

function encryptSecret(plaintext: string, aad: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", publishEncryptionKey, iv);
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

function decryptSecret(value: string, aad: string) {
	const [version, ivValue, tagValue, encryptedValue] = value.split(".");
	if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
		throw new Error("Stored secret cannot be revealed");
	}
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			publishEncryptionKey,
			Buffer.from(ivValue, "base64url"),
		);
		decipher.setAAD(Buffer.from(aad, "utf8"));
		decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(encryptedValue, "base64url")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new Error("Stored secret cannot be revealed");
	}
}

export function encryptPublishSecret(
	plaintext: string,
	userId: string,
	pathId: number,
) {
	return encryptSecret(plaintext, `${userId}:${pathId}`);
}

export function decryptPublishSecret(
	value: string,
	userId: string,
	pathId: number,
) {
	return decryptSecret(value, `${userId}:${pathId}`);
}

// AAD "read" cannot collide with a pathId, so the read secret shares the key.
function encryptReadSecret(plaintext: string, userId: string) {
	return encryptSecret(plaintext, `${userId}:read`);
}

function decryptReadSecret(value: string, userId: string) {
	return decryptSecret(value, `${userId}:read`);
}

export async function ensureRelayUser(userId: string, displayName: string) {
	const existing = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (existing) {
		return existing;
	}

	const streamingAccount = await db.query.account.findFirst({
		where: and(
			eq(account.userId, userId),
			inArray(account.providerId, ["twitch", "kick"]),
		),
	});
	if (!streamingAccount) {
		throw new Error("Streaming account required");
	}

	const base = slugify(displayName);
	const discriminator =
		userId
			.replace(/[^a-z0-9]/gi, "")
			.toLowerCase()
			.slice(-8) || "user";
	const candidates = [base, `${base}-${discriminator}`];

	for (const handle of candidates) {
		try {
			return await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
				);
				const concurrent = await tx.query.appUser.findFirst({
					where: eq(appUser.id, userId),
				});
				if (concurrent) {
					return concurrent;
				}

				const [created] = await tx
					.insert(appUser)
					.values({ id: userId, handle })
					.returning();
				if (!created) {
					throw new Error("Failed to create relay user");
				}
				await tx.insert(relayPath).values({
					userId,
					seq: 1,
					slug: `${handle}-1`,
					label: "main",
				});
				return created;
			});
		} catch (error) {
			if (!isUniqueViolation(error)) {
				throw error;
			}
		}
	}

	throw new Error("Could not allocate a unique relay handle");
}

export async function listPaths(userId: string) {
	return db
		.select({
			id: relayPath.id,
			label: relayPath.label,
			slug: relayPath.slug,
			seq: relayPath.seq,
			publishOrigin: relayPath.publishOrigin,
			nativeInstallationId: relayPath.nativeInstallationId,
			publishLastConnectedAt: relayPath.publishLastConnectedAt,
			publishRevealable: sql<boolean>`${relayPath.publishSecretEncrypted} is not null`,
			publishing: pathState.publishing,
			readerCount: pathState.readerCount,
			sourceType: pathState.sourceType,
			lastEventAt: pathState.lastEventAt,
		})
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)))
		.orderBy(relayPath.seq);
}

export async function createPath(userId: string, label: string) {
	const normalizedLabel = normalizeLabel(label);
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const owner = await tx.query.appUser.findFirst({
			where: eq(appUser.id, userId),
		});
		if (!owner) {
			throw new Error("Relay user not found");
		}
		const [current] = await tx
			.select({ max: max(relayPath.seq) })
			.from(relayPath)
			.where(eq(relayPath.userId, userId));
		const seq = Number(current?.max ?? 0) + 1;
		const [created] = await tx
			.insert(relayPath)
			.values({
				userId,
				seq,
				slug: `${owner.handle}-${seq}`,
				label: normalizedLabel,
			})
			.returning();
		if (!created) {
			throw new Error("Failed to create path");
		}
		return created;
	});
}

export async function renamePath(
	userId: string,
	pathId: number,
	label: string,
) {
	const [updated] = await db
		.update(relayPath)
		.set({ label: normalizeLabel(label) })
		.where(
			and(
				eq(relayPath.id, pathId),
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
			),
		)
		.returning();
	return updated;
}

export async function revokePath(userId: string, pathId: number) {
	const [revoked] = await db
		.update(relayPath)
		.set({ revokedAt: new Date(), nativeInstallationId: null })
		.where(
			and(
				eq(relayPath.id, pathId),
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
			),
		)
		.returning({ slug: relayPath.slug });
	if (revoked) {
		authCache.delete(revoked.slug);
	}
	return revoked;
}

async function credentialForSlug(slug: string) {
	const cached = authCache.get(slug);
	if (cached && cached.expiresAt > Date.now()) {
		return cached;
	}
	authCache.delete(slug);

	const [record] = await db
		.select({
			userId: appUser.id,
			handle: appUser.handle,
			pathId: relayPath.id,
			pathPublishSecretHash: relayPath.publishSecretHash,
			legacyPublishSecretHash: appUser.publishSecretHash,
			readSecretHash: appUser.readSecretHash,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.where(and(eq(relayPath.slug, slug), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!record) {
		return null;
	}

	const entry = {
		expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
		handle: record.handle,
		pathId: record.pathId,
		publishSecretHash:
			record.pathPublishSecretHash ?? record.legacyPublishSecretHash,
		readSecretHash: record.readSecretHash,
		userId: record.userId,
	};
	authCache.set(slug, entry);
	return entry;
}

export async function authenticateMedia(input: {
	action: MediaAction;
	password: string;
	path: string;
	user: string;
}) {
	const credential = await credentialForSlug(input.path);
	if (!credential || input.user !== credential.handle) {
		return false;
	}
	const hash =
		input.action === "publish"
			? credential.publishSecretHash
			: credential.readSecretHash;
	const authenticated = hash
		? await Bun.password.verify(input.password, hash)
		: false;
	if (authenticated && input.action === "publish") {
		await db
			.update(relayPath)
			.set({ publishLastConnectedAt: new Date() })
			.where(eq(relayPath.id, credential.pathId));
	}
	return authenticated;
}

export function invalidateAuthCacheForUser(userId: string) {
	for (const [slug, entry] of authCache) {
		if (entry.userId === userId) {
			authCache.delete(slug);
		}
	}
}

function buildSrtUrl(
	action: MediaAction,
	slug: string,
	handle: string,
	plaintext: string,
	latencyMicros?: number,
) {
	const latency = latencyMicros ? `&latency=${latencyMicros}` : "";
	return `srt://${env.RELAY_HOST}:8890?streamid=${action}:${slug}:${handle}:${plaintext}&pkt_size=1316${latency}`;
}

function buildRtmpUrl(slug: string, handle: string, plaintext: string) {
	return `rtmp://${env.RELAY_HOST}:1935/${slug}?user=${encodeURIComponent(handle)}&pass=${encodeURIComponent(plaintext)}`;
}

function buildPublishUrls(
	path: { slug: string },
	handle: string,
	value: string,
) {
	return {
		slug: path.slug,
		srt: buildSrtUrl("publish", path.slug, handle, value),
		rtmp: buildRtmpUrl(path.slug, handle, value),
	};
}

async function ownedPath(userId: string, pathId: number) {
	const [record] = await db
		.select({
			id: relayPath.id,
			label: relayPath.label,
			slug: relayPath.slug,
			publishOrigin: relayPath.publishOrigin,
			publishSecretEncrypted: relayPath.publishSecretEncrypted,
			handle: appUser.handle,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.where(
			and(
				eq(relayPath.id, pathId),
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
			),
		)
		.limit(1);
	return record;
}

function publicPublishPath(path: {
	id: number;
	label: string;
	publishOrigin: PublishOrigin | null;
	slug: string;
}) {
	return {
		id: path.id,
		label: path.label,
		publishOrigin: path.publishOrigin,
		slug: path.slug,
	};
}

async function storePublishSecret(input: {
	installationId?: string;
	origin: PublishOrigin;
	pathId: number;
	plaintext: string;
	secretHash?: string;
	userId: string;
}) {
	const path = await ownedPath(input.userId, input.pathId);
	if (!path) return null;
	const secretHash =
		input.secretHash ??
		(await Bun.password.hash(input.plaintext, { algorithm: "argon2id" }));
	const [updated] = await db
		.update(relayPath)
		.set({
			publishSecretHash: secretHash,
			publishSecretEncrypted: encryptPublishSecret(
				input.plaintext,
				input.userId,
				input.pathId,
			),
			publishOrigin: path.publishOrigin ?? input.origin,
			...(input.installationId
				? { nativeInstallationId: input.installationId }
				: {}),
		})
		.where(
			and(
				eq(relayPath.id, input.pathId),
				eq(relayPath.userId, input.userId),
				isNull(relayPath.revokedAt),
			),
		)
		.returning();
	if (!updated) return null;
	authCache.delete(updated.slug);
	return {
		path: publicPublishPath(updated),
		urls: buildPublishUrls(updated, path.handle, input.plaintext),
	};
}

export async function revealPublishPath(userId: string, pathId: number) {
	const path = await ownedPath(userId, pathId);
	if (!path?.publishSecretEncrypted) return null;
	const plaintext = decryptPublishSecret(
		path.publishSecretEncrypted,
		userId,
		path.id,
	);
	return {
		path: publicPublishPath(path),
		urls: buildPublishUrls(path, path.handle, plaintext),
	};
}

export async function rotatePublishPath(userId: string, pathId: number) {
	return storePublishSecret({
		origin: "web",
		pathId,
		plaintext: secret(),
		userId,
	});
}

export async function createPublishDevice(userId: string, label: string) {
	const path = await createPath(userId, label);
	const device = await rotatePublishPath(userId, path.id);
	if (!device) throw new Error("Failed to create publishing device");

	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	let read = null;
	if (owner?.readSecretEncrypted) {
		try {
			const readSecret = decryptReadSecret(owner.readSecretEncrypted, userId);
			read = {
				slug: path.slug,
				srt: buildSrtUrl("read", path.slug, owner.handle, readSecret, 300_000),
				rtmp: buildRtmpUrl(path.slug, owner.handle, readSecret),
			};
		} catch {
			// Read secret predates encrypted storage; device creation still succeeds.
		}
	}
	return { ...device, read };
}

function parseLegacyPublishUrl(value: string) {
	try {
		const url = new URL(value);
		const [action, slug, handle, plaintext, extra] =
			url.searchParams.get("streamid")?.split(":") ?? [];
		if (
			url.protocol !== "srt:" ||
			action !== "publish" ||
			!slug ||
			!handle ||
			!plaintext ||
			extra
		) {
			return null;
		}
		return { slug, handle, plaintext };
	} catch {
		return null;
	}
}

export async function claimNativePublishDevice(input: {
	installationId: string;
	label: string;
	legacyUrl?: string;
	userId: string;
}) {
	const existing = await db.query.relayPath.findFirst({
		where: and(
			eq(relayPath.userId, input.userId),
			eq(relayPath.nativeInstallationId, input.installationId),
			isNull(relayPath.revokedAt),
		),
	});
	if (existing) return revealPublishPath(input.userId, existing.id);

	const legacy = input.legacyUrl
		? parseLegacyPublishUrl(input.legacyUrl)
		: null;
	if (legacy) {
		const [path] = await db
			.select({
				id: relayPath.id,
				handle: appUser.handle,
				legacyHash: appUser.publishSecretHash,
				publishSecretHash: relayPath.publishSecretHash,
			})
			.from(relayPath)
			.innerJoin(appUser, eq(appUser.id, relayPath.userId))
			.where(
				and(
					eq(relayPath.userId, input.userId),
					eq(relayPath.slug, legacy.slug),
					isNull(relayPath.revokedAt),
				),
			)
			.limit(1);
		if (
			path &&
			!path.publishSecretHash &&
			path.handle === legacy.handle &&
			path.legacyHash &&
			(await Bun.password.verify(legacy.plaintext, path.legacyHash))
		) {
			return storePublishSecret({
				installationId: input.installationId,
				origin: "native",
				pathId: path.id,
				plaintext: legacy.plaintext,
				secretHash: path.legacyHash,
				userId: input.userId,
			});
		}
	}
	if (input.legacyUrl) return null;

	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, input.userId),
	});
	let path = owner?.publishSecretHash
		? undefined
		: await db.query.relayPath.findFirst({
				where: and(
					eq(relayPath.userId, input.userId),
					isNull(relayPath.publishSecretHash),
					isNull(relayPath.revokedAt),
				),
			});
	path ??= await createPath(input.userId, input.label);
	return storePublishSecret({
		installationId: input.installationId,
		origin: "native",
		pathId: path.id,
		plaintext: secret(),
		userId: input.userId,
	});
}

export function buildSceneCollection(input: {
	handle: string;
	latencyMicros: number;
	paths: Array<{ label: string; slug: string }>;
	readSecret: string;
}) {
	const mediaSource = (path: { label: string; slug: string }) => ({
		name: `${path.label} feed`,
		id: "ffmpeg_source",
		settings: {
			is_local_file: false,
			input: buildSrtUrl(
				"read",
				path.slug,
				input.handle,
				input.readSecret,
				input.latencyMicros,
			),
			input_format: "mpegts",
			reconnect_delay_sec: 1,
			restart_on_activate: false,
			clear_on_media_end: true,
			hw_decode: true,
			buffering_mb: 1,
		},
	});

	return {
		name: `${input.handle} relay`,
		current_scene: "Fallback",
		current_program_scene: "Fallback",
		scene_order: [
			{ name: "Fallback" },
			...input.paths.map((path) => ({ name: path.label })),
		],
		sources: [
			{ name: "Fallback", id: "scene", settings: { items: [] } },
			...input.paths.map((path) => ({
				name: path.label,
				id: "scene",
				settings: { items: [{ name: `${path.label} feed`, visible: true }] },
			})),
			...input.paths.map(mediaSource),
		],
	};
}

async function buildReadBundle(
	userId: string,
	handle: string,
	readSecret: string,
) {
	const paths = await listPaths(userId);
	const readUrls = paths.map((path) => ({
		slug: path.slug,
		srt: buildSrtUrl("read", path.slug, handle, readSecret, 300_000),
		rtmp: buildRtmpUrl(path.slug, handle, readSecret),
	}));

	return {
		handle,
		revealed: { read: readSecret },
		urls: { read: readUrls },
		sceneCollection: {
			filename: `${handle}-relay.json`,
			json: buildSceneCollection({
				handle,
				latencyMicros: 300_000,
				paths,
				readSecret,
			}),
		},
	};
}

export async function rotateReadSecret(userId: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner) {
		throw new Error("Relay user not found");
	}

	const readSecret = secret();
	const readSecretHash = await Bun.password.hash(readSecret, {
		algorithm: "argon2id",
	});

	await db
		.update(appUser)
		.set({
			readSecretHash,
			readSecretEncrypted: encryptReadSecret(readSecret, userId),
			secretsRotatedAt: new Date(),
		})
		.where(eq(appUser.id, userId));
	invalidateAuthCacheForUser(userId);

	return buildReadBundle(userId, owner.handle, readSecret);
}

export async function revealReadUrls(userId: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner?.readSecretEncrypted) return null;
	const readSecret = decryptReadSecret(owner.readSecretEncrypted, userId);
	return buildReadBundle(userId, owner.handle, readSecret);
}

export async function completeOnboarding(
	userId: string,
	input: {
		deviceCount: number;
		software: "obs" | "larix" | "moblin" | "other";
	},
) {
	let paths = await listPaths(userId);
	for (let seq = paths.length + 1; seq <= input.deviceCount; seq += 1) {
		await createPath(userId, `device ${seq}`);
	}
	paths = await listPaths(userId);
	const publish = [];
	for (const path of paths.slice(0, input.deviceCount)) {
		const device = path.publishRevealable
			? await revealPublishPath(userId, path.id)
			: await rotatePublishPath(userId, path.id);
		if (!device) throw new Error("Failed to configure publishing device");
		publish.push(device.urls);
	}
	await db
		.update(appUser)
		.set({
			deviceCount: input.deviceCount,
			streamingSoftware: input.software,
			onboardedAt: new Date(),
		})
		.where(eq(appUser.id, userId));
	const read = await rotateReadSecret(userId);
	return { ...read, urls: { ...read.urls, publish } };
}

export function recommendLatency(rttMs: number, profile: NetworkProfile) {
	const multiplier = { wired: 3, wifi: 4, cellular: 6 }[profile];
	const floor = { wired: 120, wifi: 300, cellular: 600 }[profile];
	const ms = Math.max(floor, Math.ceil((rttMs * multiplier) / 50) * 50);
	return {
		ms,
		micros: ms * 1000,
		larixMs: ms,
		note:
			profile === "cellular"
				? "Cellular jitter is large and bursty; do not tune this down."
				: undefined,
	};
}

export async function submitRtt(input: {
	method: "browser-probe" | "manual";
	profile: NetworkProfile;
	rttMs: number;
	userId: string;
}) {
	await db.insert(rttSample).values({
		userId: input.userId,
		rttMs: input.rttMs,
		method: input.method,
	});
	return {
		...recommendLatency(input.rttMs, input.profile),
		bitrateKbps: {
			"720p30": input.profile === "cellular" ? 2500 : 3500,
			"1080p30": input.profile === "cellular" ? 4500 : 6000,
			"1080p60": input.profile === "cellular" ? null : 8000,
		},
	};
}

export async function applyPathHook(
	event: "ready" | "not-ready" | "read" | "unread",
	input: { path: string; sourceType?: string },
) {
	const [path] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(and(eq(relayPath.slug, input.path), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!path) {
		return false;
	}

	const now = new Date();
	if (event === "ready" || event === "not-ready") {
		const publishing = event === "ready";
		await db
			.insert(pathState)
			.values({
				pathId: path.id,
				publishing,
				readerCount: 0,
				sourceType: publishing ? input.sourceType : null,
				lastEventAt: now,
			})
			.onConflictDoUpdate({
				target: pathState.pathId,
				set: {
					publishing,
					sourceType: publishing ? input.sourceType : null,
					lastEventAt: now,
				},
			});
		return true;
	}

	const readerCount = event === "read" ? 1 : 0;
	await db
		.insert(pathState)
		.values({ pathId: path.id, readerCount, lastEventAt: now })
		.onConflictDoUpdate({
			target: pathState.pathId,
			set: {
				readerCount:
					event === "read"
						? sql`${pathState.readerCount} + 1`
						: sql`greatest(${pathState.readerCount} - 1, 0)`,
				lastEventAt: now,
			},
		});
	return true;
}

type MediaMtxPath = {
	name?: string;
	readers?: unknown[];
	ready?: boolean;
	source?: { type?: string } | null;
};

export async function reconcilePathState(apiUrl = env.MEDIAMTX_API_URL) {
	const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v3/paths/list`, {
		signal: AbortSignal.timeout(2000),
	});
	if (!response.ok) {
		throw new Error(`MediaMTX reconciliation failed with ${response.status}`);
	}
	const payload = (await response.json()) as { items?: MediaMtxPath[] };
	if (!Array.isArray(payload.items)) {
		throw new Error("MediaMTX reconciliation returned an invalid payload");
	}

	const live = new Map(
		payload.items.flatMap((item) => (item.name ? [[item.name, item]] : [])),
	);
	const paths = await db
		.select({ id: relayPath.id, slug: relayPath.slug })
		.from(relayPath)
		.where(isNull(relayPath.revokedAt));
	const now = new Date();

	await db.transaction(async (tx) => {
		// ponytail: O(n) upserts are fine for trusted v1; bulk-upsert when path count becomes material.
		for (const path of paths) {
			const state = live.get(path.slug);
			await tx
				.insert(pathState)
				.values({
					pathId: path.id,
					publishing: state?.ready ?? false,
					readerCount: state?.readers?.length ?? 0,
					sourceType: state?.source?.type ?? null,
					lastEventAt: now,
				})
				.onConflictDoUpdate({
					target: pathState.pathId,
					set: {
						publishing: state?.ready ?? false,
						readerCount: state?.readers?.length ?? 0,
						sourceType: state?.source?.type ?? null,
						lastEventAt: now,
					},
				});
		}
	});
}

export function clearAuthCacheForTests() {
	authCache.clear();
}
