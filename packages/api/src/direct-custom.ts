import { db } from "@VISP/db";
import {
	customDirectDestination,
	customDirectOutput,
	pathState,
	relayPath,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import {
	type HostResolver,
	resolveHost,
	validateCustomDestinationForStorage,
} from "./direct-custom-destination";
import type { DirectState } from "./direct-model";
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
		readonly code: "conflict" | "invalid" | "limit" | "not-found" | "path-live",
		message: string,
	) {
		super(message);
	}
}

type DestinationRow = typeof customDirectDestination.$inferSelect;

async function assertDestinationEditable(
	userId: string,
	destinationId: string,
) {
	const [live] = await db
		.select({ id: customDirectOutput.id })
		.from(customDirectOutput)
		.innerJoin(pathState, eq(pathState.pathId, customDirectOutput.pathId))
		.where(
			and(
				eq(customDirectOutput.userId, userId),
				eq(customDirectOutput.destinationId, destinationId),
				eq(pathState.publishing, true),
			),
		)
		.limit(1);
	if (live) {
		throw new DirectCustomError(
			"path-live",
			"Stop the publishing device before changing this destination",
		);
	}
}

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
	await assertDestinationEditable(userId, input.destinationId);
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
	await assertDestinationEditable(userId, destinationId);
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

export async function listCustomDirectOutputs(userId: string) {
	return db
		.select({
			id: customDirectOutput.id,
			destinationId: customDirectOutput.destinationId,
			name: customDirectDestination.name,
			protocol: customDirectDestination.protocol,
			endpointSummary: customDirectDestination.endpointSummary,
			pathId: customDirectOutput.pathId,
			role: customDirectOutput.role,
			state: customDirectOutput.state,
			error: customDirectOutput.error,
		})
		.from(customDirectOutput)
		.innerJoin(
			customDirectDestination,
			eq(customDirectDestination.id, customDirectOutput.destinationId),
		)
		.where(eq(customDirectOutput.userId, userId))
		.orderBy(asc(customDirectOutput.createdAt));
}

export async function setCustomDirectOutput(
	userId: string,
	input: { destinationId: string; pathId: number; enabled: boolean },
) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const [path] = await tx
			.select({ id: relayPath.id, publishing: pathState.publishing })
			.from(relayPath)
			.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
			.where(
				and(
					eq(relayPath.id, input.pathId),
					eq(relayPath.userId, userId),
					isNull(relayPath.revokedAt),
				),
			)
			.limit(1);
		const [destination] = await tx
			.select({ id: customDirectDestination.id })
			.from(customDirectDestination)
			.where(
				and(
					eq(customDirectDestination.id, input.destinationId),
					eq(customDirectDestination.userId, userId),
				),
			)
			.limit(1);
		if (!path || !destination) {
			throw new DirectCustomError(
				"not-found",
				"Destination or device not found",
			);
		}
		const [existing] = await tx
			.select({
				id: customDirectOutput.id,
				pathId: customDirectOutput.pathId,
				state: customDirectOutput.state,
				publishing: pathState.publishing,
			})
			.from(customDirectOutput)
			.leftJoin(pathState, eq(pathState.pathId, customDirectOutput.pathId))
			.where(
				and(
					eq(customDirectOutput.userId, userId),
					eq(customDirectOutput.destinationId, input.destinationId),
					eq(customDirectOutput.role, "landscape"),
				),
			)
			.limit(1);

		if (!input.enabled) {
			if (!existing) return { outputId: null, enabled: false as const };
			if (existing.pathId !== input.pathId) {
				throw new DirectCustomError(
					"conflict",
					"Destination belongs to another device",
				);
			}
			if (
				existing.publishing &&
				existing.state &&
				existing.state !== "stopped"
			) {
				await tx
					.update(customDirectOutput)
					.set({ state: "stopping", error: null })
					.where(eq(customDirectOutput.id, existing.id));
				return { outputId: existing.id, enabled: false as const };
			}
			await tx
				.delete(customDirectOutput)
				.where(eq(customDirectOutput.id, existing.id));
			return { outputId: existing.id, enabled: false as const };
		}

		if (path.publishing || existing?.publishing) {
			throw new DirectCustomError(
				"path-live",
				"Stop the publishing device before changing its Direct outputs",
			);
		}
		const [total] = await tx
			.select({ value: count() })
			.from(customDirectOutput)
			.where(
				and(
					eq(customDirectOutput.pathId, input.pathId),
					eq(customDirectOutput.role, "landscape"),
					existing ? ne(customDirectOutput.id, existing.id) : undefined,
				),
			);
		if ((total?.value ?? 0) >= env.MAX_CUSTOM_OUTPUTS_PER_PATH) {
			throw new DirectCustomError("limit", "Custom output limit reached");
		}
		const id = existing?.id ?? randomUUID();
		if (existing) {
			await tx
				.update(customDirectOutput)
				.set({
					pathId: input.pathId,
					state: null,
					error: null,
					reservedRelayId: null,
					reservedUntil: null,
				})
				.where(eq(customDirectOutput.id, id));
		} else {
			await tx.insert(customDirectOutput).values({
				id,
				userId,
				destinationId: input.destinationId,
				pathId: input.pathId,
				role: "landscape",
			});
		}
		return { outputId: id, enabled: true as const };
	});
}

export async function customDirectOutputActive(slug: string, outputId: string) {
	const [row] = await db
		.select({ state: customDirectOutput.state })
		.from(customDirectOutput)
		.innerJoin(relayPath, eq(relayPath.id, customDirectOutput.pathId))
		.where(
			and(
				eq(customDirectOutput.id, outputId),
				eq(relayPath.slug, slug),
				isNull(relayPath.revokedAt),
			),
		)
		.limit(1);
	return Boolean(row && row.state !== "stopping");
}

export async function applyCustomDirectState(input: {
	slug: string;
	outputId: string;
	state: DirectState;
	error?: string | null;
}) {
	const [row] = await db
		.select({ id: customDirectOutput.id, state: customDirectOutput.state })
		.from(customDirectOutput)
		.innerJoin(relayPath, eq(relayPath.id, customDirectOutput.pathId))
		.where(
			and(
				eq(customDirectOutput.id, input.outputId),
				eq(relayPath.slug, input.slug),
			),
		)
		.limit(1);
	if (!row) return false;
	if (input.state === "stopped" && row.state === "stopping") {
		await db
			.delete(customDirectOutput)
			.where(eq(customDirectOutput.id, row.id));
		return true;
	}
	await db
		.update(customDirectOutput)
		.set({
			state: input.state,
			error: input.error
				? input.error
						.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, "[url]")
						.replace(/\s+/g, " ")
						.trim()
						.slice(0, 200) || null
				: null,
			...(input.state === "failed" || input.state === "stopped"
				? { reservedRelayId: null, reservedUntil: null }
				: {}),
		})
		.where(eq(customDirectOutput.id, row.id));
	return true;
}
