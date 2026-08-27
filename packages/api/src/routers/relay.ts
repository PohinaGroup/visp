import { auth } from "@VISP/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	DIRECT_PROVIDERS,
	DirectError,
	listDirectOutputs,
	prepareDirect,
	reportFirstLiveActivation,
	saveDirectCrop,
	saveDirectPreferences,
	setDirectOutputs,
	setDirectRole,
	setYoutubeSettings,
} from "../direct";
import {
	createCustomDirectDestination,
	DirectCustomError,
	deleteCustomDirectDestination,
	listCustomDirectDestinations,
	saveCustomDirectCrop,
	setCustomDirectOutput,
	setCustomDirectRole,
	updateCustomDirectDestination,
} from "../direct-custom";
import { protectedProcedure, router } from "../index";
import { linkStatsFromPath } from "../link-stats";
import {
	getObsControlStatus,
	rotateObsControlToken,
	setObsScene,
	setObsStreaming,
	setObsToggle,
} from "../obs-control";
import { OBS_TOGGLES, obsLiveTickets } from "../obs-live";
import {
	createObsTile,
	deleteObsTile,
	listObsTiles,
	reorderObsTiles,
	updateObsTile,
} from "../obs-tiles";
import { fixedWindow } from "../rate-limit";
import {
	buildMaskedPathUrls,
	claimNativePublishDevice,
	completeOnboarding,
	createPublishDevice,
	ensureRelayUser,
	listPaths,
	renamePath,
	revealPublishPath,
	revealReadUrls,
	revokePath,
	rotatePublishPath,
	rotateReadSecret,
	setAdvancedMode,
	submitRtt,
} from "../relay";
import { listRelaysForProbing } from "../relays";
import { reportLinkStats } from "../report-link-stats";
import { listSnapshots } from "../snapshots";

// ponytail: per-instance limit allows N× traffic on N app instances; move to
// Postgres or the cache bus only if a strict global request cap is needed.
const relayMutations = fixedWindow(20, 60_000);

export function resetRelayMutationLimitForTests() {
	relayMutations.reset();
}

export const relayProcedure = protectedProcedure.use(
	async ({ ctx, next, type }) => {
		let relayUser: Awaited<ReturnType<typeof ensureRelayUser>>;
		try {
			relayUser = await ensureRelayUser(
				ctx.session.user.id,
				ctx.session.user.name,
			);
		} catch (error) {
			console.error(error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Relay account unavailable",
				cause: error,
			});
		}
		if (type === "mutation" && !relayMutations.take(ctx.session.user.id)) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Too many relay changes; try again in a minute",
			});
		}
		const result = await next({ ctx: { ...ctx, relayUser } });
		if (
			!result.ok &&
			result.error.cause instanceof Error &&
			result.error.cause.message === "Path limit reached"
		) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Path limit reached",
				cause: result.error.cause,
			});
		}
		return result;
	},
);

const pathIdInput = z.object({ pathId: z.number().int().positive() });
const directDestinationInput = pathIdInput.extend({
	provider: z.enum(DIRECT_PROVIDERS),
});

const DIRECT_ERROR_CODES = {
	"not-found": "NOT_FOUND",
	invalid: "BAD_REQUEST",
	"path-live": "PRECONDITION_FAILED",
	"provider-taken": "CONFLICT",
	"consent-required": "PRECONDITION_FAILED",
	capacity: "TOO_MANY_REQUESTS",
} as const;

function directError(error: unknown): never {
	if (error instanceof DirectCustomError) {
		const code = {
			conflict: "CONFLICT",
			invalid: "BAD_REQUEST",
			limit: "TOO_MANY_REQUESTS",
			"not-found": "NOT_FOUND",
			"path-live": "PRECONDITION_FAILED",
		} as const;
		throw new TRPCError({
			code: code[error.code],
			message: error.message,
			cause: error,
		});
	}
	if (error instanceof DirectError) {
		throw new TRPCError({
			code: DIRECT_ERROR_CODES[error.code],
			message: error.message,
			cause: error,
		});
	}
	throw error;
}

const tileFields = z.object({
	label: z.string().trim().min(1).max(64),
	color: z
		.string()
		.regex(/^#[0-9a-fA-F]{6}$/)
		.nullable()
		.default(null),
	action: z.enum([
		"scene",
		"stream",
		"recording",
		"virtualcam",
		"replaybuffer",
		"recordpause",
	]),
	sceneName: z.string().trim().min(1).max(512).nullable().default(null),
});
type TileFields = z.infer<typeof tileFields>;

function requireSceneTarget(input: TileFields) {
	if (input.action === "scene" && !input.sceneName) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Pick a scene for this tile",
		});
	}
	return input;
}

export const relayRoutes = {
	relays: router({
		list: relayProcedure.query(() => listRelaysForProbing()),
	}),
	obs: router({
		liveTicket: relayProcedure.mutation(({ ctx }) =>
			obsLiveTickets.issue({ role: "user", userId: ctx.relayUser.id }),
		),
		status: relayProcedure.query(({ ctx }) =>
			getObsControlStatus(ctx.relayUser.id),
		),
		snapshots: relayProcedure.query(({ ctx }) =>
			listSnapshots(ctx.relayUser.id),
		),
		pair: relayProcedure.mutation(({ ctx }) =>
			rotateObsControlToken(ctx.relayUser.id),
		),
		setStreaming: relayProcedure
			.input(z.object({ streaming: z.boolean() }))
			.mutation(({ ctx, input }) =>
				setObsStreaming(ctx.relayUser.id, input.streaming),
			),
		setScene: relayProcedure
			.input(z.object({ scene: z.string().min(1).max(512) }))
			.mutation(async ({ ctx, input }) => {
				const result = await setObsScene(ctx.relayUser.id, input.scene);
				if (!result) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "OBS scene is no longer available",
					});
				}
				return result;
			}),
		setToggle: relayProcedure
			.input(z.object({ toggle: z.enum(OBS_TOGGLES), on: z.boolean() }))
			.mutation(({ ctx, input }) =>
				setObsToggle(ctx.relayUser.id, input.toggle, input.on),
			),
		tiles: router({
			list: relayProcedure.query(({ ctx }) => listObsTiles(ctx.relayUser.id)),
			create: relayProcedure
				.input(tileFields)
				.mutation(({ ctx, input }) =>
					createObsTile(ctx.relayUser.id, requireSceneTarget(input)),
				),
			update: relayProcedure
				.input(tileFields.extend({ id: z.number().int().positive() }))
				.mutation(async ({ ctx, input }) => {
					const { id, ...fields } = input;
					const tile = await updateObsTile(
						ctx.relayUser.id,
						id,
						requireSceneTarget(fields),
					);
					if (!tile) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Tile not found",
						});
					}
					return tile;
				}),
			delete: relayProcedure
				.input(z.object({ id: z.number().int().positive() }))
				.mutation(async ({ ctx, input }) => {
					if (!(await deleteObsTile(ctx.relayUser.id, input.id))) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Tile not found",
						});
					}
					return { id: input.id };
				}),
			reorder: relayProcedure
				.input(z.object({ ids: z.array(z.number().int().positive()).max(200) }))
				.mutation(({ ctx, input }) =>
					reorderObsTiles(ctx.relayUser.id, input.ids),
				),
		}),
	}),
	paths: router({
		list: relayProcedure.query(async ({ ctx }) => {
			const paths = await listPaths(ctx.relayUser.id);
			return paths.map((path) => {
				const unknown =
					!path.lastEventAt || Date.now() - path.lastEventAt.getTime() > 60_000;
				return {
					id: path.id,
					label: path.label,
					slug: path.slug,
					seq: path.seq,
					nativeInstallationId: path.nativeInstallationId,
					publishRevealable: path.publishRevealable,
					directTwitch: path.directTwitch,
					directKick: path.directKick,
					directYoutube: path.directYoutube,
					publishing: path.publishing,
					readerCount: path.readerCount,
					sourceType: path.sourceType,
					linkStats: linkStatsFromPath(path),
					maskedUrls: buildMaskedPathUrls(
						path,
						ctx.relayUser.handle,
						Boolean(ctx.relayUser.readSecretEncrypted),
					),
					lastEventAt: path.lastEventAt?.toISOString() ?? null,
					publishLastConnectedAt:
						path.publishLastConnectedAt?.toISOString() ?? null,
					publishOrigin: path.publishOrigin ?? "legacy",
					relay: {
						id: path.relayId,
						name: path.relayName,
						pingUrl: path.relayPingUrl,
						region: path.relayRegion,
					},
					stale: unknown,
					unknown,
				};
			});
		}),
		create: relayProcedure
			.input(
				z.object({
					label: z.string().trim().min(1).max(64),
					relayId: z.number().int().positive().optional(),
				}),
			)
			.mutation(({ ctx, input }) =>
				createPublishDevice(ctx.relayUser.id, input.label, input.relayId),
			),
		reveal: relayProcedure
			.input(pathIdInput)
			.mutation(async ({ ctx, input }) => {
				const path = await revealPublishPath(ctx.relayUser.id, input.pathId);
				if (!path) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Publish URL is not available",
					});
				}
				return path;
			}),
		rotatePublish: relayProcedure
			.input(pathIdInput)
			.mutation(async ({ ctx, input }) => {
				const path = await rotatePublishPath(ctx.relayUser.id, input.pathId);
				if (!path) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });
				}
				return path;
			}),
		claimNative: relayProcedure
			.input(
				z.object({
					installationId: z.uuid(),
					label: z.string().trim().min(1).max(64).default("VISP Native"),
					legacyUrl: z.string().max(2048).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const path = await claimNativePublishDevice({
					...input,
					userId: ctx.relayUser.id,
				});
				if (!path) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Could not link this device",
					});
				}
				return path;
			}),
		rename: relayProcedure
			.input(pathIdInput.extend({ label: z.string().trim().min(1).max(64) }))
			.mutation(async ({ ctx, input }) => {
				const path = await renamePath(
					ctx.relayUser.id,
					input.pathId,
					input.label,
				);
				if (!path) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });
				}
				return path;
			}),
		revoke: relayProcedure
			.input(pathIdInput)
			.mutation(async ({ ctx, input }) => {
				const path = await revokePath(ctx.relayUser.id, input.pathId);
				if (!path) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });
				}
				return path;
			}),
		reportLinkStats: relayProcedure
			.input(
				z.object({
					pathId: z.number().int().positive(),
					bitrateKbps: z.number().int().min(0).max(50_000),
					linkCount: z.number().int().min(1).max(8).default(1),
					linkDegraded: z.boolean().default(false),
					targetBitrateKbps: z.number().int().min(0).max(50_000),
					rttMs: z.number().int().min(0).max(60_000),
					packetLossPct: z.number().min(0).max(100),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const result = await reportLinkStats({
					...input,
					userId: ctx.relayUser.id,
				});
				if (!result) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });
				}
				return result;
			}),
	}),
	direct: router({
		custom: router({
			list: relayProcedure.query(async ({ ctx }) => ({
				destinations: await listCustomDirectDestinations(ctx.relayUser.id),
			})),
			create: relayProcedure
				.input(
					z.object({
						name: z.string().trim().min(1).max(64),
						url: z.string().min(1).max(4096),
					}),
				)
				.mutation(async ({ ctx, input }) => {
					try {
						return {
							destination: await createCustomDirectDestination(
								ctx.relayUser.id,
								input,
							),
						};
					} catch (error) {
						directError(error);
					}
				}),
			update: relayProcedure
				.input(
					z.object({
						destinationId: z.uuid(),
						name: z.string().trim().min(1).max(64),
						url: z.string().min(1).max(4096).optional(),
					}),
				)
				.mutation(async ({ ctx, input }) => {
					try {
						return {
							destination: await updateCustomDirectDestination(
								ctx.relayUser.id,
								input,
							),
						};
					} catch (error) {
						directError(error);
					}
				}),
			delete: relayProcedure
				.input(z.object({ destinationId: z.uuid() }))
				.mutation(async ({ ctx, input }) => {
					try {
						await deleteCustomDirectDestination(
							ctx.relayUser.id,
							input.destinationId,
						);
						return { destinationId: input.destinationId };
					} catch (error) {
						directError(error);
					}
				}),
			assign: relayProcedure
				.input(
					z.object({
						destinationId: z.uuid(),
						pathId: z.number().int().positive(),
						enabled: z.boolean(),
					}),
				)
				.mutation(async ({ ctx, input }) => {
					try {
						return await setCustomDirectOutput(ctx.relayUser.id, input);
					} catch (error) {
						directError(error);
					}
				}),
		}),
		list: relayProcedure.query(({ ctx }) =>
			listDirectOutputs(ctx.relayUser.id),
		),
		setMode: relayProcedure
			.input(z.object({ mode: z.literal("obs") }))
			.mutation(async ({ ctx }) => {
				try {
					await saveDirectPreferences(ctx.relayUser.id, {
						twitch: false,
						kick: false,
						youtube: false,
					});
					return { mode: "obs" as const };
				} catch (error) {
					directError(error);
				}
			}),
		setOutputs: relayProcedure
			.input(
				pathIdInput.extend({
					twitch: z.boolean(),
					kick: z.boolean(),
					youtube: z.boolean(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await setDirectOutputs(ctx.relayUser.id, input.pathId, {
						twitch: input.twitch,
						kick: input.kick,
						youtube: input.youtube,
					});
				} catch (error) {
					directError(error);
				}
			}),
		setRole: relayProcedure
			.input(
				directDestinationInput.extend({
					role: z.enum(["landscape", "portrait"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await setDirectRole(
						ctx.relayUser.id,
						input.pathId,
						input.provider,
						input.role,
					);
				} catch (error) {
					directError(error);
				}
			}),
		setCustomRole: relayProcedure
			.input(
				pathIdInput.extend({
					outputId: z.uuid(),
					role: z.enum(["landscape", "portrait"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await setCustomDirectRole(ctx.relayUser.id, input);
				} catch (error) {
					directError(error);
				}
			}),
		saveCrop: relayProcedure
			.input(
				directDestinationInput.extend({
					crop: z.object({
						x: z.number(),
						y: z.number(),
						w: z.number(),
						h: z.number(),
						aspect: z.string().regex(/^\d+:\d+$/),
					}),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await saveDirectCrop(
						ctx.relayUser.id,
						input.pathId,
						input.provider,
						input.crop,
					);
				} catch (error) {
					directError(error);
				}
			}),
		saveCustomCrop: relayProcedure
			.input(
				pathIdInput.extend({
					outputId: z.uuid(),
					crop: z.object({
						x: z.number(),
						y: z.number(),
						w: z.number(),
						h: z.number(),
						aspect: z.string().regex(/^\d+:\d+$/),
					}),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await saveCustomDirectCrop(ctx.relayUser.id, input);
				} catch (error) {
					directError(error);
				}
			}),
		setYoutubeSettings: relayProcedure
			.input(z.object({ title: z.string().trim().min(1).max(100) }))
			.mutation(async ({ ctx, input }) => {
				try {
					return await setYoutubeSettings(ctx.relayUser.id, input.title);
				} catch (error) {
					directError(error);
				}
			}),
		prepare: relayProcedure
			.input(pathIdInput)
			.mutation(async ({ ctx, input }) => {
				try {
					return await prepareDirect(ctx.relayUser.id, input.pathId);
				} catch (error) {
					directError(error);
				}
			}),
		trackFirstLive: relayProcedure
			.input(
				pathIdInput.extend({
					provider: z.enum(DIRECT_PROVIDERS),
				}),
			)
			.mutation(async ({ ctx, input }) =>
				reportFirstLiveActivation(
					ctx.relayUser.id,
					input.pathId,
					input.provider,
				),
			),
	}),
	secrets: router({
		status: relayProcedure.query(({ ctx }) => ({
			handle: ctx.relayUser.handle,
			readConfigured: Boolean(ctx.relayUser.readSecretHash),
			readRevealable: Boolean(ctx.relayUser.readSecretEncrypted),
			rotatedAt: ctx.relayUser.secretsRotatedAt?.toISOString() ?? null,
			onboardedAt: ctx.relayUser.onboardedAt?.toISOString() ?? null,
			deviceCount: ctx.relayUser.deviceCount,
			streamingSoftware: ctx.relayUser.streamingSoftware,
			setupUseCase: ctx.relayUser.setupUseCase,
			streamDestination: ctx.relayUser.streamDestination,
			advancedMode: ctx.relayUser.advancedMode,
		})),
		setAdvancedMode: relayProcedure
			.input(z.object({ advancedMode: z.boolean() }))
			.mutation(({ ctx, input }) =>
				setAdvancedMode(ctx.relayUser.id, input.advancedMode),
			),
		rotate: relayProcedure
			.input(z.object({ kind: z.literal("read") }))
			.mutation(({ ctx }) => rotateReadSecret(ctx.relayUser.id)),
		revealRead: relayProcedure.mutation(async ({ ctx }) => {
			const bundle = await revealReadUrls(ctx.relayUser.id);
			if (!bundle) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Rotate read credentials once to make them revealable",
				});
			}
			return bundle;
		}),
	}),
	onboarding: router({
		complete: relayProcedure
			.input(
				z.object({
					software: z.enum(["obs", "visp", "larix", "moblin", "other"]),
					useCase: z.enum([
						"direct",
						"phone_to_obs",
						"remote_guest",
						"multi_cam",
						"other",
					]),
					destination: z.enum(["twitch", "kick", "youtube", "other"]),
					advancedMode: z.boolean(),
					direct: z.object({
						twitch: z.boolean(),
						kick: z.boolean(),
						youtube: z.boolean(),
					}),
					youtubeTitle: z.string().trim().min(1).max(100).optional(),
					prepareObs: z.boolean(),
					createDevice: z.boolean().optional(),
					redoMode: z.enum(["additive", "wipe"]).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const result = await completeOnboarding(ctx.relayUser.id, input);
					if (input.redoMode === "wipe") {
						await auth.api.revokeOtherSessions({ headers: ctx.headers });
					}
					return result;
				} catch (error) {
					if (error instanceof DirectError) directError(error);
					if (
						error instanceof Error &&
						error.message ===
							"Choose wipe or keep existing devices to redo setup"
					) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: error.message,
						});
					}
					throw error;
				}
			}),
	}),
	status: router({
		get: relayProcedure.query(async ({ ctx }) => {
			const paths = await listPaths(ctx.relayUser.id);
			return paths.map((path) => {
				const unknown =
					!path.lastEventAt || Date.now() - path.lastEventAt.getTime() > 60_000;
				return {
					id: path.id,
					lastEventAt: path.lastEventAt?.toISOString() ?? null,
					publishing: path.publishing ?? false,
					readerCount: path.readerCount ?? 0,
					slug: path.slug,
					stale: unknown,
					unknown,
				};
			});
		}),
	}),
	rtt: router({
		submit: relayProcedure
			.input(
				z.object({
					relayId: z.number().int().positive(),
					rttMs: z.number().int().min(1).max(10_000),
					profile: z.enum(["wired", "wifi", "cellular"]),
					method: z.enum(["browser-probe", "manual"]),
				}),
			)
			.mutation(({ ctx, input }) =>
				submitRtt({ ...input, userId: ctx.relayUser.id }),
			),
	}),
};
