import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { appUser } from "./relay";

export const studioTransition = pgEnum("studio_transition", ["cut", "fade"]);
export const studioLayerType = pgEnum("studio_layer_type", [
	"text",
	"png",
	"browser",
	"alert",
]);

export const studio = pgTable("studio", {
	userId: text("user_id")
		.primaryKey()
		.references(() => appUser.id, { onDelete: "cascade" }),
	version: integer("version").default(0).notNull(),
	compositorHealthy: boolean("compositor_healthy").default(false).notNull(),
	programUrl: text("program_url"),
	compositorCheckedAt: timestamp("compositor_checked_at", {
		withTimezone: true,
	}),
	lastAlert: text("last_alert"),
	lastAlertEvent: text("last_alert_event"),
	lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const studioScene = pgTable(
	"studio_scene",
	{
		id: text("id").primaryKey(),
		studioUserId: text("studio_user_id")
			.notNull()
			.references(() => studio.userId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		position: integer("position").notNull(),
		transition: studioTransition("transition").notNull(),
		active: boolean("active").default(false).notNull(),
	},
	(table) => [
		unique("studio_scene_position_unique").on(
			table.studioUserId,
			table.position,
		),
		index("studio_scene_owner_idx").on(table.studioUserId),
		check("studio_scene_position_nonnegative", sql`${table.position} >= 0`),
	],
);

export const studioLayer = pgTable(
	"studio_layer",
	{
		id: text("id").primaryKey(),
		sceneId: text("scene_id")
			.notNull()
			.references(() => studioScene.id, { onDelete: "cascade" }),
		type: studioLayerType("type").notNull(),
		name: text("name").notNull(),
		visible: boolean("visible").default(true).notNull(),
		disabledByRuntime: boolean("disabled_by_runtime").default(false).notNull(),
		position: integer("position").notNull(),
		x: integer("x").notNull(),
		y: integer("y").notNull(),
		width: integer("width").notNull(),
		height: integer("height").notNull(),
		text: text("text"),
		assetId: text("asset_id").references(() => studioAsset.id, {
			onDelete: "restrict",
		}),
		browserUrl: text("browser_url"),
		alertEvent: text("alert_event"),
	},
	(table) => [
		unique("studio_layer_position_unique").on(table.sceneId, table.position),
		index("studio_layer_scene_idx").on(table.sceneId),
		check("studio_layer_position_nonnegative", sql`${table.position} >= 0`),
		check(
			"studio_layer_dimensions_positive",
			sql`${table.width} > 0 and ${table.height} > 0`,
		),
		check(
			"studio_layer_config_matches_type",
			sql`(${table.type} = 'text' and ${table.text} is not null) or (${table.type} = 'png' and ${table.assetId} is not null) or (${table.type} = 'browser' and ${table.browserUrl} is not null) or (${table.type} = 'alert' and ${table.alertEvent} is not null)`,
		),
	],
);

export const studioAsset = pgTable(
	"studio_asset",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		contentType: text("content_type").notNull(),
		width: integer("width"),
		height: integer("height"),
		checksum: text("checksum"),
		verifiedAt: timestamp("verified_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("studio_asset_owner_key_unique").on(table.userId, table.key),
		index("studio_asset_owner_idx").on(table.userId),
		check("studio_asset_png_only", sql`${table.contentType} = 'image/png'`),
	],
);

export const studioRelations = relations(studio, ({ many }) => ({
	scenes: many(studioScene),
}));
export const studioSceneRelations = relations(studioScene, ({ one, many }) => ({
	studio: one(studio, {
		fields: [studioScene.studioUserId],
		references: [studio.userId],
	}),
	layers: many(studioLayer),
}));
export const studioLayerRelations = relations(studioLayer, ({ one }) => ({
	scene: one(studioScene, {
		fields: [studioLayer.sceneId],
		references: [studioScene.id],
	}),
}));
