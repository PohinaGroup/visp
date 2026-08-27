import { db } from "@VISP/db";
import { customDirectDestination } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import {
	type HostResolver,
	resolveHost,
	validateCustomDestinationForStorage,
} from "./direct-custom-destination";
import { encryptSecret } from "./encrypted-secret";
import { uniqueViolation } from "./pg-errors";

export type CustomDestinationSummary = {
	id: string;
	name: string;
	protocol: "rtmp" | "rtmps" | "srt";
	endpointSummary: string;
	createdAt: string;
	updatedAt: string;
};

export class DirectCustomError extends Error {
	constructor(
		readonly code: "conflict" | "invalid" | "limit" | "not-found",
		message: string,
	) {
		super(message);
	}
}

type DestinationRow = typeof customDirectDestination.$inferSelect;

export function customDestinationAad(userId: string, destinationId: string) {
	return `custom-direct:${userId}:${destinationId}`;
}

export function normalizeCustomDestinationName(name: string) {
	const normalized = name.trim();
	if (!normalized || normalized.length > 64) {
		throw new DirectCustomError(
			"invalid",
			"Destination name must be between 1 and 64 characters",
		);
	}
	return normalized;
}

async function validateDestinationUrl(url: string, resolver: HostResolver) {
	try {
		return await validateCustomDestinationForStorage(url, resolver);
	} catch {
		throw new DirectCustomError("invalid", "Destination URL is not valid");
	}
}

export function serializeCustomDestination(
	row: Pick<
		DestinationRow,
		"createdAt" | "endpointSummary" | "id" | "name" | "protocol" | "updatedAt"
	>,
): CustomDestinationSummary {
	return {
		id: row.id,
		name: row.name,
		protocol: row.protocol as CustomDestinationSummary["protocol"],
		endpointSummary: row.endpointSummary,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function databaseError(error: unknown): never {
	if (uniqueViolation(error) !== null) {
		throw new DirectCustomError(
			"conflict",
			"A destination with this name already exists",
		);
	}
	throw error;
}

export async function listCustomDirectDestinations(userId: string) {
	const rows = await db
		.select()
		.from(customDirectDestination)
		.where(eq(customDirectDestination.userId, userId))
		.orderBy(
			asc(customDirectDestination.name),
			asc(customDirectDestination.id),
		);
	return rows.map(serializeCustomDestination);
}

export async function createCustomDirectDestination(
	userId: string,
	input: { name: string; url: string },
	resolver: HostResolver = resolveHost,
) {
	const name = normalizeCustomDestinationName(input.name);
	const validated = await validateDestinationUrl(input.url, resolver);
	const id = randomUUID();
	const encryptedUrl = encryptSecret(
		input.url,
		customDestinationAad(userId, id),
	);
	try {
		const row = await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
			const [total] = await tx
				.select({ value: count() })
				.from(customDirectDestination)
				.where(eq(customDirectDestination.userId, userId));
			if ((total?.value ?? 0) >= env.MAX_CUSTOM_DESTINATIONS_PER_USER) {
				throw new DirectCustomError(
					"limit",
					"Custom destination limit reached",
				);
			}
			const [created] = await tx
				.insert(customDirectDestination)
				.values({
					id,
					userId,
					name,
					protocol: validated.protocol,
					encryptedUrl,
					endpointSummary: validated.endpointSummary,
				})
				.returning();
			if (!created) throw new Error("Failed to create custom destination");
			return created;
		});
		return serializeCustomDestination(row);
	} catch (error) {
		databaseError(error);
	}
}

export async function updateCustomDirectDestination(
	userId: string,
	input: { destinationId: string; name: string; url?: string },
	resolver: HostResolver = resolveHost,
) {
	const name = normalizeCustomDestinationName(input.name);
	const validated = input.url
		? await validateDestinationUrl(input.url, resolver)
		: null;
	try {
		const [row] = await db
			.update(customDirectDestination)
			.set({
				name,
				updatedAt: new Date(),
				...(input.url && validated
					? {
							encryptedUrl: encryptSecret(
								input.url,
								customDestinationAad(userId, input.destinationId),
							),
							protocol: validated.protocol,
							endpointSummary: validated.endpointSummary,
						}
					: {}),
			})
			.where(
				and(
					eq(customDirectDestination.id, input.destinationId),
					eq(customDirectDestination.userId, userId),
				),
			)
			.returning();
		if (!row) throw new DirectCustomError("not-found", "Destination not found");
		return serializeCustomDestination(row);
	} catch (error) {
		if (error instanceof DirectCustomError) throw error;
		databaseError(error);
	}
}

export async function deleteCustomDirectDestination(
	userId: string,
	destinationId: string,
) {
	const [row] = await db
		.delete(customDirectDestination)
		.where(
			and(
				eq(customDirectDestination.id, destinationId),
				eq(customDirectDestination.userId, userId),
			),
		)
		.returning({ id: customDirectDestination.id });
	if (!row) throw new DirectCustomError("not-found", "Destination not found");
	return row.id;
}
