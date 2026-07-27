import { auth } from "@VISP/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DirectError, listDirectOutputs, setDirectOutputs } from "../direct";
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
import { reportLinkStats } from "../report-link-stats";
import { listSnapshots } from "../snapshots";

const relayProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	try {
		const relayUser = await ensureRelayUser(
			ctx.session.user.id,
			ctx.session.user.name,
		);
		return next({ ctx: { ...ctx, relayUser } });
	} catch (error) {
		throw new TRPCError({
			code:
				error instanceof Error && error.message === "Streaming account required"
					? "FORBIDDEN"
					: "INTERNAL_SERVER_ERROR",
			message:
				error instanceof Error && error.message === "Streaming account required"
					? "Sign in with Twitch or Kick to use the relay"
					: "Could not provision relay account",
			cause: error,
		});
	}
});

const pathIdInput = z.object({ pathId: z.number().int().positive() });

const DIRECT_ERROR_CODES = {
	"not-allowed": "FORBIDDEN",
	"not-found": "NOT_FOUND",
	"path-live": "PRECONDITION_FAILED",
	"provider-taken": "CONFLICT",
	"consent-required": "PRECONDITION_FAILED",
} as const;

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
					stale: unknown,
					unknown,
				};
			});
		}),
		create: relayProcedure
			.input(z.object({ label: z.string().trim().min(1).max(64) }))
			.mutation(({ ctx, input }) =>
				createPublishDevice(ctx.relayUser.id, input.label),
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
		list: relayProcedure.query(({ ctx }) =>
			listDirectOutputs(ctx.relayUser.id),
		),
		setOutputs: relayProcedure
			.input(pathIdInput.extend({ twitch: z.boolean(), kick: z.boolean() }))
			.mutation(async ({ ctx, input }) => {
				try {
					return await setDirectOutputs(ctx.relayUser.id, input.pathId, {
						twitch: input.twitch,
						kick: input.kick,
					});
				} catch (error) {
					if (error instanceof DirectError) {
						throw new TRPCError({
							code: DIRECT_ERROR_CODES[error.code],
							message: error.message,
							cause: error,
						});
					}
					throw error;
				}
			}),
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
						"phone_to_obs",
						"remote_guest",
						"multi_cam",
						"other",
					]),
					destination: z.enum(["twitch", "kick", "other"]),
					advancedMode: z.boolean(),
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
