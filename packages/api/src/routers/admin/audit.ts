import { db } from "@VISP/db";
import { adminAuditLog, relay, user } from "@VISP/db/schema/index";
import { and, count, desc, eq, like, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { adminProcedure, router } from "../../index";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** `like` treats `%`, `_` and `\` as syntax; an action prefix is literal. */
function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const actor = alias(user, "audit_actor");
const targetUser = alias(user, "audit_target_user");

export const adminAuditRouter = router({
	/**
	 * Newest-first page of admin actions. Same offset cursor as
	 * `admin.users.list`: the log is append-only and read by humans paging a
	 * few screens back, so an offset that drifts by the rows written meanwhile
	 * is acceptable and keeps the total countable.
	 *
	 * Actor and target names are joined at read time and are null once that
	 * user or relay is deleted; the IDs in the row are the durable record.
	 */
	list: adminProcedure
		.input(
			z.object({
				cursor: z.string().regex(/^\d+$/).optional(),
				limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(PAGE_SIZE),
				actorId: z.string().trim().min(1).max(200).optional(),
				targetType: z.enum(["user", "relay", "setting"]).optional(),
				targetId: z.string().trim().min(1).max(200).optional(),
				action: z.string().trim().min(1).max(100).optional(),
			}),
		)
		.query(async ({ input }) => {
			const conditions: SQL[] = [];
			if (input.actorId) {
				conditions.push(eq(adminAuditLog.actorId, input.actorId));
			}
			if (input.targetType) {
				conditions.push(eq(adminAuditLog.targetType, input.targetType));
			}
			if (input.targetId) {
				conditions.push(eq(adminAuditLog.targetId, input.targetId));
			}
			if (input.action) {
				conditions.push(
					like(adminAuditLog.action, `${escapeLike(input.action)}%`),
				);
			}
			const where = conditions.length ? and(...conditions) : undefined;
			const offset = Number(input.cursor ?? "0");

			const [rows, totals] = await Promise.all([
				db
					.select({
						id: adminAuditLog.id,
						createdAt: adminAuditLog.createdAt,
						actorId: adminAuditLog.actorId,
						actorName: actor.name,
						actorEmail: actor.email,
						targetType: adminAuditLog.targetType,
						targetId: adminAuditLog.targetId,
						targetUserName: targetUser.name,
						targetUserEmail: targetUser.email,
						targetRelayName: relay.name,
						action: adminAuditLog.action,
						before: adminAuditLog.before,
						after: adminAuditLog.after,
					})
					.from(adminAuditLog)
					.leftJoin(actor, eq(actor.id, adminAuditLog.actorId))
					.leftJoin(
						targetUser,
						and(
							eq(adminAuditLog.targetType, "user"),
							eq(targetUser.id, adminAuditLog.targetId),
						),
					)
					.leftJoin(
						relay,
						and(
							eq(adminAuditLog.targetType, "relay"),
							sql`${relay.id}::text = ${adminAuditLog.targetId}`,
						),
					)
					.where(where)
					.orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
					.limit(input.limit)
					.offset(offset),
				db.select({ count: count() }).from(adminAuditLog).where(where),
			]);

			const total = totals[0]?.count ?? 0;
			return {
				items: rows.map(
					({ targetUserName, targetUserEmail, targetRelayName, ...row }) => ({
						...row,
						createdAt: row.createdAt.toISOString(),
						targetName:
							row.targetType === "relay" ? targetRelayName : targetUserName,
						targetEmail: row.targetType === "user" ? targetUserEmail : null,
					}),
				),
				nextCursor:
					offset + rows.length < total ? String(offset + rows.length) : null,
				total,
			};
		}),
});
