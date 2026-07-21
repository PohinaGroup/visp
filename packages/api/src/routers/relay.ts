import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import {
	getObsControlStatus,
	rotateObsControlToken,
	setObsScene,
	setObsStreaming,
} from "../obs-control";
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

export const relayRoutes = {
	obs: router({
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
	}),
	paths: router({
		list: relayProcedure.query(async ({ ctx }) => {
			const paths = await listPaths(ctx.relayUser.id);
			return paths.map((path) => {
				const unknown =
					!path.lastEventAt || Date.now() - path.lastEventAt.getTime() > 60_000;
				return {
					...path,
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
					return await completeOnboarding(ctx.relayUser.id, input);
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
