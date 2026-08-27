import { relations, sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const streamingSoftware = pgEnum("streaming_software", [
	"obs",
	"visp",
	"larix",
	"moblin",
	"other",
]);

export const setupUseCase = pgEnum("setup_use_case", [
	"direct",
	"phone_to_obs",
	"remote_guest",
	"multi_cam",
	"other",
]);

export const streamDestination = pgEnum("stream_destination", [
	"twitch",
	"kick",
	"youtube",
	"other",
]);

export const publishOrigin = pgEnum("publish_origin", ["native", "web"]);

export const directRole = pgEnum("direct_role", ["landscape", "portrait"]);

export type DirectCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

export const obsTileAction = pgEnum("obs_tile_action", [
	"scene",
	"stream",
	"recording",
	"virtualcam",
	"replaybuffer",
	"recordpause",
]);

export const relay = pgTable(
	"relay",
	{
		id: serial("id").primaryKey(),
		name: text("name").notNull().unique(),
		host: text("host").notNull(),
		apiUrl: text("api_url").notNull(),
		pingUrl: text("ping_url").notNull(),
		region: text("region").notNull(),
		capacityPaths: integer("capacity_paths").notNull(),
		maxForwarders: integer("max_forwarders").notNull(),
		publicIp: text("public_ip").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		drainedAt: timestamp("drained_at", { withTimezone: true }),
	},
	(table) => [
		check("relay_capacity_paths_positive", sql`${table.capacityPaths} > 0`),
		check("relay_max_forwarders_nonnegative", sql`${table.maxForwarders} >= 0`),
	],
);

export const appUser = pgTable(
	"app_user",
	{
		id: text("id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		handle: text("handle").notNull().unique(),
		publishSecretHash: text("publish_secret_hash"),
		readSecretHash: text("read_secret_hash"),
		readSecretEncrypted: text("read_secret_encrypted"),
		secretsRotatedAt: timestamp("secrets_rotated_at", { withTimezone: true }),
		deviceCount: integer("device_count"),
		streamingSoftware: streamingSoftware("streaming_software"),
		setupUseCase: setupUseCase("setup_use_case"),
		streamDestination: streamDestination("stream_destination"),
		advancedMode: boolean("advanced_mode").default(false).notNull(),
		obsControlTokenId: text("obs_control_token_id").unique(),
		obsControlTokenHash: text("obs_control_token_hash"),
		// Separate from the OBS control token: rotating that one resets scene and
		// toggle state, so the browser-source URL gets its own revocable credential.
		chatOverlayTokenId: text("chat_overlay_token_id").unique(),
		chatOverlayTokenHash: text("chat_overlay_token_hash"),
		obsDesiredStreaming: boolean("obs_desired_streaming")
			.default(false)
			.notNull(),
		obsStreaming: boolean("obs_streaming").default(false).notNull(),
		obsScenes: text("obs_scenes")
			.array()
			.default(sql`ARRAY[]::text[]`)
			.notNull(),
		obsCurrentScene: text("obs_current_scene"),
		obsDesiredScene: text("obs_desired_scene"),
		obsCommandVersion: integer("obs_command_version").default(0).notNull(),
		obsAppliedVersion: integer("obs_applied_version").default(0).notNull(),
		obsDesiredRecording: boolean("obs_desired_recording")
			.default(false)
			.notNull(),
		obsRecording: boolean("obs_recording").default(false).notNull(),
		obsDesiredVirtualCam: boolean("obs_desired_virtual_cam")
			.default(false)
			.notNull(),
		obsVirtualCam: boolean("obs_virtual_cam").default(false).notNull(),
		obsDesiredReplayBuffer: boolean("obs_desired_replay_buffer")
			.default(false)
			.notNull(),
		obsReplayBuffer: boolean("obs_replay_buffer").default(false).notNull(),
		obsDesiredRecordPaused: boolean("obs_desired_record_paused")
			.default(false)
			.notNull(),
		obsRecordPaused: boolean("obs_record_paused").default(false).notNull(),
		obsLastSeenAt: timestamp("obs_last_seen_at", { withTimezone: true }),
		// Nullable distinguishes existing users who have not chosen a new default
		// from users who explicitly chose OBS-only (false/false).
		directTwitch: boolean("direct_twitch"),
		directKick: boolean("direct_kick"),
		directYoutube: boolean("direct_youtube"),
		directYoutubeTitle: text("direct_youtube_title")
			.default("Live from VISP")
			.notNull(),
		directYoutubeStreamId: text("direct_youtube_stream_id"),
		// VISP Direct admission control. The relay is one node and Direct always
		// runs distribution encode there. Kept for one rollback window; unused.
		directBeta: boolean("direct_beta").default(false).notNull(),
		directDualOutput: boolean("direct_dual_output").default(false).notNull(),
		// Hosted text-to-speech for reading chat aloud. Every utterance costs money
		// per character, so this gates spend, not capacity.
		betterTts: boolean("better_tts").default(false).notNull(),
		// Hosted ElevenLabs noise isolation for the live mic. Every second billed is
		// a second of someone's stream, so this gates spend, not capacity.
		betterAudioIsolation: boolean("better_audio_isolation")
			.default(false)
			.notNull(),
		// Hosted realtime speech-to-text for burned-in captions. Bills per minute of
		// live audio, so this gates spend, not capacity.
		betterSubtitles: boolean("better_subtitles").default(false).notNull(),
		// "Never drop again". When the ingest drops, the relay holds the outgoing
		// stream up on a BRB card instead of letting the platform end the broadcast.
		// Off by default; `snapshot` needs no setup, so enabling it is one toggle.
		brbEnabled: boolean("brb_enabled").default(false).notNull(),
		brbMessage: text("brb_message"),
		brbSource: text("brb_source").default("snapshot").notNull(),
		brbImageKey: text("brb_image_key"),
		onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"app_user_brb_source_known",
			sql`${table.brbSource} in ('snapshot', 'image', 'color')`,
		),
	],
);

export const relayPath = pgTable(
	"path",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		relayId: integer("relay_id")
			.notNull()
			.references(() => relay.id),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		slug: text("slug").notNull().unique(),
		label: text("label").notNull(),
		publishSecretHash: text("publish_secret_hash"),
		publishSecretEncrypted: text("publish_secret_encrypted"),
		publishOrigin: publishOrigin("publish_origin"),
		nativeInstallationId: text("native_installation_id"),
		publishLastConnectedAt: timestamp("publish_last_connected_at", {
			withTimezone: true,
		}),
		directTwitch: boolean("direct_twitch").default(false).notNull(),
		directKick: boolean("direct_kick").default(false).notNull(),
		directYoutube: boolean("direct_youtube").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(table) => [
		unique("path_user_seq_unique").on(table.userId, table.seq),
		unique("path_user_native_installation_unique").on(
			table.userId,
			table.nativeInstallationId,
		),
		// One live source per provider per customer. Partial indexes also make
		// stale "disabled" rows impossible.
		uniqueIndex("path_direct_twitch_owner")
			.on(table.userId)
			.where(sql`${table.directTwitch}`),
		uniqueIndex("path_direct_kick_owner")
			.on(table.userId)
			.where(sql`${table.directKick}`),
		uniqueIndex("path_direct_youtube_owner")
			.on(table.userId)
			.where(sql`${table.directYoutube}`),
		check("path_seq_positive", sql`${table.seq} > 0`),
		check(
			"path_label_length",
			sql`char_length(trim(${table.label})) between 1 and 64`,
		),
	],
);

export const pathState = pgTable(
	"path_state",
	{
		pathId: bigint("path_id", { mode: "number" })
			.primaryKey()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		publishing: boolean("publishing").default(false).notNull(),
		readerCount: integer("reader_count").default(0).notNull(),
		sourceType: text("source_type"),
		lastEventAt: timestamp("last_event_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		linkBitrateKbps: integer("link_bitrate_kbps"),
		linkTargetBitrateKbps: integer("link_target_bitrate_kbps"),
		linkRttMs: integer("link_rtt_ms"),
		linkPacketLossPct: real("link_packet_loss_pct"),
		linkCount: integer("link_count"),
		linkDegraded: boolean("link_degraded"),
		linkStatsAt: timestamp("link_stats_at", { withTimezone: true }),
		// starting|live|retrying|failed|stopped. Errors are sanitized — never a
		// destination URL, never a stream key.
		directTwitchState: text("direct_twitch_state"),
		directTwitchError: text("direct_twitch_error"),
		directKickState: text("direct_kick_state"),
		directKickError: text("direct_kick_error"),
		directTwitchReservedUntil: timestamp("direct_twitch_reserved_until", {
			withTimezone: true,
		}),
		directKickReservedUntil: timestamp("direct_kick_reserved_until", {
			withTimezone: true,
		}),
		directYoutubeState: text("direct_youtube_state"),
		directYoutubeError: text("direct_youtube_error"),
		directYoutubeReservedUntil: timestamp("direct_youtube_reserved_until", {
			withTimezone: true,
		}),
		directYoutubeBroadcastId: text("direct_youtube_broadcast_id"),
		// Non-null means the source is gone but the forwarders are still up on
		// the BRB card. The single live flag for "never drop again": everything
		// else about BRB derives from it.
		brbSince: timestamp("brb_since", { withTimezone: true }),
	},
	(table) => [
		check(
			"path_state_reader_count_nonnegative",
			sql`${table.readerCount} >= 0`,
		),
	],
);

/** Additive portrait rows; legacy provider booleans remain landscape output. */
export const directDestination = pgTable(
	"direct_destination",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		pathId: bigint("path_id", { mode: "number" })
			.notNull()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		role: directRole("role").default("landscape").notNull(),
		crop: jsonb("crop").$type<DirectCrop>(),
		state: text("state"),
		error: text("error"),
		reservedUntil: timestamp("reserved_until", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("direct_destination_user_provider_role_unique").on(
			table.userId,
			table.provider,
			table.role,
		),
		index("direct_destination_path_idx").on(table.pathId),
		check(
			"direct_destination_provider_known",
			sql`${table.provider} in ('twitch', 'kick', 'youtube')`,
		),
		check(
			"direct_destination_crop_role",
			sql`(${table.role} = 'landscape' and ${table.crop} is null) or (${table.role} = 'portrait' and ${table.crop} is not null)`,
		),
	],
);

export const relayStreamSession = pgTable(
	"relay_stream_session",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		pathId: bigint("path_id", { mode: "number" })
			.notNull()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		sourceType: text("source_type"),
	},
	(table) => [
		index("relay_stream_session_path_started_idx").on(
			table.pathId,
			table.startedAt,
		),
		uniqueIndex("relay_stream_session_one_open_per_path")
			.on(table.pathId)
			.where(sql`${table.endedAt} is null`),
		check(
			"relay_stream_session_valid_range",
			sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
		),
	],
);

export const rttSample = pgTable(
	"rtt_sample",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		relayId: integer("relay_id").references(() => relay.id),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		rttMs: integer("rtt_ms").notNull(),
		method: text("method").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("rtt_sample_user_created_idx").on(table.userId, table.createdAt),
		check("rtt_sample_range", sql`${table.rttMs} between 1 and 10000`),
		check(
			"rtt_sample_method",
			sql`${table.method} in ('browser-probe', 'manual')`,
		),
	],
);

export const obsTile = pgTable(
	"obs_tile",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		label: text("label").notNull(),
		color: text("color"),
		action: obsTileAction("action").notNull(),
		sceneName: text("scene_name"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("obs_tile_user_position_idx").on(table.userId, table.position),
		check(
			"obs_tile_label_length",
			sql`char_length(trim(${table.label})) between 1 and 64`,
		),
		check(
			"obs_tile_scene_requires_name",
			sql`${table.action} <> 'scene' or ${table.sceneName} is not null`,
		),
	],
);

export const appUserRelations = relations(appUser, ({ one, many }) => ({
	user: one(user, { fields: [appUser.id], references: [user.id] }),
	paths: many(relayPath),
	rttSamples: many(rttSample),
	tiles: many(obsTile),
}));

export const relayRelations = relations(relay, ({ many }) => ({
	paths: many(relayPath),
	rttSamples: many(rttSample),
}));

export const obsTileRelations = relations(obsTile, ({ one }) => ({
	user: one(appUser, { fields: [obsTile.userId], references: [appUser.id] }),
}));

export const relayPathRelations = relations(relayPath, ({ one, many }) => ({
	relay: one(relay, {
		fields: [relayPath.relayId],
		references: [relay.id],
	}),
	user: one(appUser, { fields: [relayPath.userId], references: [appUser.id] }),
	state: one(pathState),
	sessions: many(relayStreamSession),
}));

export const pathStateRelations = relations(pathState, ({ one }) => ({
	path: one(relayPath, {
		fields: [pathState.pathId],
		references: [relayPath.id],
	}),
}));

export const rttSampleRelations = relations(rttSample, ({ one }) => ({
	relay: one(relay, {
		fields: [rttSample.relayId],
		references: [relay.id],
	}),
	user: one(appUser, {
		fields: [rttSample.userId],
		references: [appUser.id],
	}),
}));

export const relayStreamSessionRelations = relations(
	relayStreamSession,
	({ one }) => ({
		path: one(relayPath, {
			fields: [relayStreamSession.pathId],
			references: [relayPath.id],
		}),
	}),
);
