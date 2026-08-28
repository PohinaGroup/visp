import { sql } from "drizzle-orm";
import {
	bigserial,
	boolean,
	check,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const affiliateApplication = pgTable(
	"affiliate_application",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		applicantName: text("applicant_name").notNull(),
		email: text("email").notNull(),
		youtubeChannelUrl: text("youtube_channel_url").notNull(),
		relevantVideoUrl: text("relevant_video_url").notNull(),
		audienceAndSetup: text("audience_and_setup").notNull(),
		disclosureAccepted: boolean("disclosure_accepted").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"affiliate_application_name_length",
			sql`char_length(trim(${table.applicantName})) between 1 and 120`,
		),
		check(
			"affiliate_application_email_length",
			sql`char_length(${table.email}) between 3 and 320`,
		),
		check(
			"affiliate_application_channel_url_length",
			sql`char_length(${table.youtubeChannelUrl}) between 1 and 2048`,
		),
		check(
			"affiliate_application_video_url_length",
			sql`char_length(${table.relevantVideoUrl}) between 1 and 2048`,
		),
		check(
			"affiliate_application_audience_length",
			sql`char_length(trim(${table.audienceAndSetup})) between 1 and 4000`,
		),
		check(
			"affiliate_application_disclosure_accepted",
			sql`${table.disclosureAccepted}`,
		),
	],
);
