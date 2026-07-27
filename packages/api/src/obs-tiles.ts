import { db } from "@VISP/db";
import { obsTile } from "@VISP/db/schema/index";
import { and, asc, eq, max } from "drizzle-orm";

// Kept in sync with the obs_tile_action pg enum.
export type TileAction = (typeof obsTile.action.enumValues)[number];

export type ObsTileRow = {
	id: number;
	position: number;
	label: string;
	color: string | null;
	action: TileAction;
	sceneName: string | null;
};

export type TileInput = {
	label: string;
	color: string | null;
	action: TileAction;
	sceneName: string | null;
};

type Row = typeof obsTile.$inferSelect;

function serialize(row: Row): ObsTileRow {
	return {
		id: row.id,
		position: row.position,
		label: row.label,
		color: row.color,
		action: row.action,
		sceneName: row.sceneName,
	};
}

// A scene tile keeps its target; a stream tile never carries one.
function normalize(input: TileInput): TileInput {
	return { ...input, sceneName: input.action === "scene" ? input.sceneName : null };
}

export async function listObsTiles(userId: string): Promise<ObsTileRow[]> {
	const rows = await db
		.select()
		.from(obsTile)
		.where(eq(obsTile.userId, userId))
		.orderBy(asc(obsTile.position), asc(obsTile.id));
	return rows.map(serialize);
}

export async function createObsTile(
	userId: string,
	input: TileInput,
): Promise<ObsTileRow> {
	const [{ value } = { value: null }] = await db
		.select({ value: max(obsTile.position) })
		.from(obsTile)
		.where(eq(obsTile.userId, userId));
	const position = value === null ? 0 : value + 1;
	const [row] = await db
		.insert(obsTile)
		.values({ userId, position, ...normalize(input) })
		.returning();
	if (!row) throw new Error("Failed to create tile");
	return serialize(row);
}

export async function updateObsTile(
	userId: string,
	id: number,
	input: TileInput,
): Promise<ObsTileRow | null> {
	const [row] = await db
		.update(obsTile)
		.set(normalize(input))
		.where(and(eq(obsTile.id, id), eq(obsTile.userId, userId)))
		.returning();
	return row ? serialize(row) : null;
}

export async function deleteObsTile(
	userId: string,
	id: number,
): Promise<boolean> {
	const [row] = await db
		.delete(obsTile)
		.where(and(eq(obsTile.id, id), eq(obsTile.userId, userId)))
		.returning({ id: obsTile.id });
	return Boolean(row);
}

export async function reorderObsTiles(
	userId: string,
	orderedIds: number[],
): Promise<ObsTileRow[]> {
	// No unique constraint on position, so a single pass per row is safe.
	await db.transaction(async (tx) => {
		for (let i = 0; i < orderedIds.length; i++) {
			const id = orderedIds[i];
			if (id === undefined) continue;
			await tx
				.update(obsTile)
				.set({ position: i })
				.where(and(eq(obsTile.id, id), eq(obsTile.userId, userId)));
		}
	});
	return listObsTiles(userId);
}
