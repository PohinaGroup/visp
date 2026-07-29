import { db } from "@VISP/db";
import {
	account,
	appUser,
	chatConnection,
	pathState,
	relay,
	relayPath,
	relayStreamSession,
	session,
	user,
} from "@VISP/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../index";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const LIVE_AFTER_MS = 60_000;

const pageInput = z.object({
	cursor: z.string().regex(/^\d+$/).optional(),
	limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(PAGE_SIZE),
});

const relayFields = z.object({
	name: z.string().trim().min(1).max(64),
	host: z.string().trim().min(1).max(255),
	apiUrl: z.url(),
	pingUrl: z.url(),
	region: z.string().trim().min(1).max(64),
	capacityPaths: z.number().int().min(1),
	maxForwarders: z.number().int().min(0),
	publicIp: z.string().trim().min(1).max(255),
});

function iso(value: Date | string | null | undefined) {
	return value ? new Date(value).toISOString() : null;
}

function audit(actorId: string, targetId: string, action: string) {
	console.info(
		JSON.stringify({ event: "admin_action", actorId, targetId, action }),
	);
}

const hasDevice = sql<boolean>`exists (
	select 1 from "path" admin_path where admin_path.user_id = ${user.id}
)`;
const hasStreamed = sql<boolean>`exists (
	select 1
	from "path" admin_path
	where admin_path.user_id = ${user.id}
	  and (
	    admin_path.publish_last_connected_at is not null
	    or exists (
	      select 1 from relay_stream_session admin_session
	      where admin_session.path_id = admin_path.id
	    )
	  )
)`;
const isLive = sql<boolean>`exists (
	select 1
	from "path" admin_path
	join path_state admin_state on admin_state.path_id = admin_path.id
	where admin_path.user_id = ${user.id}
	  and admin_state.publishing = true
	  and admin_state.last_event_at >= now() - interval '60 seconds'
)`;

export const adminRouter = router({
	overview: adminProcedure.query(async () => {
		const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const [result] = await db
			.select({
				totalUsers: count(user.id),
				recentUsers: sql<number>`count(*) filter (where ${user.createdAt} >= ${recentSince})::int`,
				usersWithDevices: sql<number>`count(*) filter (where ${hasDevice})::int`,
				everStreamed: sql<number>`count(*) filter (where ${hasStreamed})::int`,
				liveNow: sql<number>`count(*) filter (where ${isLive})::int`,
			})
			.from(user);
		if (!result) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Could not load admin overview",
			});
		}
		return result;
	}),

	relays: router({
		list: adminProcedure.query(() =>
			db
				.select({
					id: relay.id,
					name: relay.name,
					host: relay.host,
					apiUrl: relay.apiUrl,
					pingUrl: relay.pingUrl,
					region: relay.region,
					capacityPaths: relay.capacityPaths,
					maxForwarders: relay.maxForwarders,
					publicIp: relay.publicIp,
					enabled: relay.enabled,
					drainedAt: relay.drainedAt,
					assignedPaths: sql<number>`(
						select count(*)::int from "path" admin_relay_path
						where admin_relay_path.relay_id = ${relay.id}
							and admin_relay_path.revoked_at is null
					)`,
				})
				.from(relay)
				.orderBy(relay.name),
		),
		create: adminProcedure
			.input(relayFields)
			.mutation(async ({ ctx, input }) => {
				const [created] = await db.insert(relay).values(input).returning();
				if (!created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Could not create relay",
					});
				}
				audit(ctx.session.user.id, `relay:${created.id}`, "create");
				return created;
			}),
		update: adminProcedure
			.input(
				relayFields
					.partial()
					.extend({
						id: z.number().int().positive(),
						enabled: z.boolean().optional(),
						drained: z.boolean().optional(),
					})
					.refine(
						({ id: _id, ...changes }) =>
							Object.values(changes).some((value) => value !== undefined),
						"At least one relay field is required",
					),
			)
			.mutation(async ({ ctx, input }) => {
				const { id, drained, ...fields } = input;
				const [updated] = await db
					.update(relay)
					.set({
						...fields,
						...(drained === undefined
							? {}
							: { drainedAt: drained ? new Date() : null }),
					})
					.where(eq(relay.id, id))
					.returning();
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Relay not found",
					});
				}
				audit(ctx.session.user.id, `relay:${id}`, "update");
				return updated;
			}),
	}),

	users: router({
		list: adminProcedure
			.input(
				pageInput.extend({
					query: z.string().trim().max(200).optional(),
					role: z.enum(["user", "admin"]).optional(),
					status: z.enum(["active", "banned"]).optional(),
					usage: z
						.enum(["no-device", "device", "never-streamed", "streamed", "live"])
						.optional(),
				}),
			)
			.query(async ({ input }) => {
				const conditions: SQL[] = [];
				if (input.query) {
					const search = `%${input.query}%`;
					conditions.push(
						or(
							ilike(user.name, search),
							ilike(user.email, search),
							ilike(user.id, search),
						) as SQL,
					);
				}
				if (input.role) conditions.push(eq(user.role, input.role));
				if (input.status === "banned") conditions.push(eq(user.banned, true));
				if (input.status === "active") conditions.push(eq(user.banned, false));
				if (input.usage === "no-device") conditions.push(sql`not ${hasDevice}`);
				if (input.usage === "device") conditions.push(hasDevice);
				if (input.usage === "never-streamed") {
					conditions.push(and(hasDevice, sql`not ${hasStreamed}`) as SQL);
				}
				if (input.usage === "streamed") conditions.push(hasStreamed);
				if (input.usage === "live") conditions.push(isLive);

				const where = conditions.length ? and(...conditions) : undefined;
				const offset = Number(input.cursor ?? "0");
				const [rows, totals] = await Promise.all([
					db
						.select({
							id: user.id,
							name: user.name,
							email: user.email,
							image: user.image,
							role: user.role,
							banned: user.banned,
							createdAt: user.createdAt,
							onboardedAt: appUser.onboardedAt,
							deviceCount: sql<number>`(
								select count(*)::int from "path" admin_path
								where admin_path.user_id = ${user.id}
							)`,
							activeDeviceCount: sql<number>`(
								select count(*)::int from "path" admin_path
								where admin_path.user_id = ${user.id}
								  and admin_path.revoked_at is null
							)`,
							everStreamed: hasStreamed,
							live: isLive,
							lastStreamedAt: sql<Date | null>`(
								select max(streamed_at) from (
									select admin_path.publish_last_connected_at as streamed_at
									from "path" admin_path
									where admin_path.user_id = ${user.id}
									union all
									select coalesce(admin_session.ended_at, admin_session.started_at)
									from relay_stream_session admin_session
									join "path" admin_path on admin_path.id = admin_session.path_id
									where admin_path.user_id = ${user.id}
								) admin_streams
							)`,
						})
						.from(user)
						.leftJoin(appUser, eq(appUser.id, user.id))
						.where(where)
						.orderBy(desc(user.createdAt), desc(user.id))
						.limit(input.limit)
						.offset(offset),
					db.select({ count: count() }).from(user).where(where),
				]);

				const total = totals[0]?.count ?? 0;
				return {
					items: rows.map((row) => ({
						...row,
						createdAt: row.createdAt.toISOString(),
						onboardedAt: iso(row.onboardedAt),
						lastStreamedAt: iso(row.lastStreamedAt),
					})),
					nextCursor:
						offset + rows.length < total ? String(offset + rows.length) : null,
					total,
				};
			}),

		get: adminProcedure
			.input(z.object({ userId: z.string().min(1) }))
			.query(async ({ input }) => {
				const [identity] = await db
					.select({
						id: user.id,
						name: user.name,
						email: user.email,
						emailVerified: user.emailVerified,
						image: user.image,
						role: user.role,
						banned: user.banned,
						banReason: user.banReason,
						banExpires: user.banExpires,
						createdAt: user.createdAt,
						updatedAt: user.updatedAt,
						handle: appUser.handle,
						deviceCountPreference: appUser.deviceCount,
						streamingSoftware: appUser.streamingSoftware,
						setupUseCase: appUser.setupUseCase,
						streamDestination: appUser.streamDestination,
						advancedMode: appUser.advancedMode,
						onboardedAt: appUser.onboardedAt,
						obsStreaming: appUser.obsStreaming,
						obsSceneCount: sql<number>`coalesce(array_length(${appUser.obsScenes}, 1), 0)`,
						obsCurrentScene: appUser.obsCurrentScene,
						obsLastSeenAt: appUser.obsLastSeenAt,
					})
					.from(user)
					.leftJoin(appUser, eq(appUser.id, user.id))
					.where(eq(user.id, input.userId))
					.limit(1);
				if (!identity) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}

				const [providers, authSessions, devices, chats] = await Promise.all([
					db
						.select({ provider: account.providerId })
						.from(account)
						.where(eq(account.userId, input.userId)),
					db
						.select({
							count: count(),
							lastUpdatedAt: sql<Date | null>`max(${session.updatedAt})`,
						})
						.from(session)
						.where(eq(session.userId, input.userId)),
					db
						.select({
							id: relayPath.id,
							label: relayPath.label,
							seq: relayPath.seq,
							publishOrigin: relayPath.publishOrigin,
							createdAt: relayPath.createdAt,
							revokedAt: relayPath.revokedAt,
							publishLastConnectedAt: relayPath.publishLastConnectedAt,
							publishing: pathState.publishing,
							lastEventAt: pathState.lastEventAt,
							sourceType: pathState.sourceType,
							trackedSessions: sql<number>`(
								select count(*)::int from relay_stream_session admin_session
								where admin_session.path_id = ${relayPath.id}
							)`,
							trackedSeconds: sql<number>`(
								select coalesce(sum(extract(epoch from (
									coalesce(admin_session.ended_at, now()) - admin_session.started_at
								))), 0)::double precision
								from relay_stream_session admin_session
								where admin_session.path_id = ${relayPath.id}
							)`,
							lastTrackedAt: sql<Date | null>`(
								select max(coalesce(admin_session.ended_at, admin_session.started_at))
								from relay_stream_session admin_session
								where admin_session.path_id = ${relayPath.id}
							)`,
						})
						.from(relayPath)
						.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
						.where(eq(relayPath.userId, input.userId))
						.orderBy(relayPath.seq),
					db
						.select({ provider: chatConnection.provider })
						.from(chatConnection)
						.where(eq(chatConnection.userId, input.userId)),
				]);

				const mappedDevices = devices.map((device) => ({
					...device,
					createdAt: device.createdAt.toISOString(),
					revokedAt: iso(device.revokedAt),
					publishLastConnectedAt: iso(device.publishLastConnectedAt),
					lastEventAt: iso(device.lastEventAt),
					lastTrackedAt: iso(device.lastTrackedAt),
					live:
						Boolean(device.publishing) &&
						Boolean(
							device.lastEventAt &&
								Date.now() - device.lastEventAt.getTime() < LIVE_AFTER_MS,
						),
				}));

				return {
					identity: {
						...identity,
						createdAt: identity.createdAt.toISOString(),
						updatedAt: identity.updatedAt.toISOString(),
						banExpires: iso(identity.banExpires),
						onboardedAt: iso(identity.onboardedAt),
						obsLastSeenAt: iso(identity.obsLastSeenAt),
					},
					providers: [...new Set(providers.map(({ provider }) => provider))],
					auth: {
						activeSessions: authSessions[0]?.count ?? 0,
						lastSessionRefreshAt: iso(authSessions[0]?.lastUpdatedAt),
					},
					devices: mappedDevices,
					chatProviders: chats.map(({ provider }) => provider),
					usage: {
						everStreamed: mappedDevices.some(
							(device) =>
								Boolean(device.publishLastConnectedAt) ||
								device.trackedSessions > 0,
						),
						live: mappedDevices.some((device) => device.live),
						trackedSessions: mappedDevices.reduce(
							(total, device) => total + device.trackedSessions,
							0,
						),
						trackedSeconds: mappedDevices.reduce(
							(total, device) => total + device.trackedSeconds,
							0,
						),
						lastStreamedAt:
							mappedDevices
								.flatMap((device) => [
									device.publishLastConnectedAt,
									device.lastTrackedAt,
								])
								.filter((value): value is string => Boolean(value))
								.sort()
								.at(-1) ?? null,
					},
				};
			}),

		streams: adminProcedure
			.input(pageInput.extend({ userId: z.string().min(1) }))
			.query(async ({ input }) => {
				const offset = Number(input.cursor ?? "0");
				const where = eq(relayPath.userId, input.userId);
				const [rows, totals] = await Promise.all([
					db
						.select({
							id: relayStreamSession.id,
							deviceId: relayPath.id,
							deviceLabel: relayPath.label,
							startedAt: relayStreamSession.startedAt,
							endedAt: relayStreamSession.endedAt,
							sourceType: relayStreamSession.sourceType,
							durationSeconds: sql<number>`extract(epoch from (
								coalesce(${relayStreamSession.endedAt}, now()) -
								${relayStreamSession.startedAt}
							))::double precision`,
						})
						.from(relayStreamSession)
						.innerJoin(relayPath, eq(relayPath.id, relayStreamSession.pathId))
						.where(where)
						.orderBy(desc(relayStreamSession.startedAt))
						.limit(input.limit)
						.offset(offset),
					db
						.select({ count: count() })
						.from(relayStreamSession)
						.innerJoin(relayPath, eq(relayPath.id, relayStreamSession.pathId))
						.where(where),
				]);
				const total = totals[0]?.count ?? 0;
				return {
					items: rows.map((row) => ({
						...row,
						startedAt: row.startedAt.toISOString(),
						endedAt: iso(row.endedAt),
						live: !row.endedAt,
					})),
					nextCursor:
						offset + rows.length < total ? String(offset + rows.length) : null,
					total,
				};
			}),

		setRole: adminProcedure
			.input(
				z.object({
					userId: z.string().min(1),
					role: z.enum(["user", "admin"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (ctx.session.user.id === input.userId && input.role !== "admin") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot remove your own administrator role",
					});
				}
				const [result] = await db
					.update(user)
					.set({ role: input.role })
					.where(eq(user.id, input.userId))
					.returning({ id: user.id, role: user.role });
				if (!result) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}
				audit(ctx.session.user.id, input.userId, `set_role:${input.role}`);
				return result;
			}),

		// The only admission control VISP Direct has. Hand it out deliberately:
		// every Direct forwarder is a full distribution encode on one relay node.
		setDirectBeta: adminProcedure
			.input(
				z.object({
					userId: z.string().min(1),
					directBeta: z.boolean(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const [result] = await db
					.update(appUser)
					.set({ directBeta: input.directBeta })
					.where(eq(appUser.id, input.userId))
					.returning({ id: appUser.id, directBeta: appUser.directBeta });
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Relay user not found",
					});
				}
				audit(
					ctx.session.user.id,
					input.userId,
					`set_direct_beta:${input.directBeta}`,
				);
				return result;
			}),

		ban: adminProcedure
			.input(
				z.object({
					userId: z.string().min(1),
					reason: z.string().trim().max(500).optional(),
					expiresAt: z.iso.datetime().optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (ctx.session.user.id === input.userId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "You cannot ban your own account",
					});
				}
				const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
				if (expiresAt && expiresAt.getTime() <= Date.now()) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Ban expiry must be in the future",
					});
				}
				const result = await db.transaction(async (tx) => {
					const [updated] = await tx
						.update(user)
						.set({
							banned: true,
							banReason: input.reason ?? null,
							banExpires: expiresAt,
						})
						.where(eq(user.id, input.userId))
						.returning({ id: user.id });
					if (!updated) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "User not found",
						});
					}
					await tx.delete(session).where(eq(session.userId, input.userId));
					return updated;
				});
				audit(ctx.session.user.id, input.userId, "ban");
				return result;
			}),

		unban: adminProcedure
			.input(z.object({ userId: z.string().min(1) }))
			.mutation(async ({ ctx, input }) => {
				const [result] = await db
					.update(user)
					.set({ banned: false, banReason: null, banExpires: null })
					.where(eq(user.id, input.userId))
					.returning({ id: user.id });
				if (!result) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}
				audit(ctx.session.user.id, input.userId, "unban");
				return result;
			}),

		revokeSessions: adminProcedure
			.input(z.object({ userId: z.string().min(1) }))
			.mutation(async ({ ctx, input }) => {
				const result = await db
					.delete(session)
					.where(eq(session.userId, input.userId))
					.returning({ id: session.id });
				audit(ctx.session.user.id, input.userId, "revoke_sessions");
				return { revoked: result.length };
			}),
	}),
});
