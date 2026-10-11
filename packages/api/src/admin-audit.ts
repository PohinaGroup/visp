import { db } from "@VISP/db";
import { type AdminAuditSnapshot, adminAuditLog } from "@VISP/db/schema/index";

/** The transaction handle `db.transaction()` passes to its callback. */
export type AuditTransaction = Parameters<
	Parameters<typeof db.transaction>[0]
>[0];

export type AdminAuditEntry = {
	actorId: string;
	targetType: "user" | "relay" | "setting";
	targetId: string;
	action: string;
	before?: AdminAuditSnapshot | null;
	after?: AdminAuditSnapshot | null;
};

/**
 * Records one admin action: a structured stdout line (always, first, so log
 * shipping keeps a trail even when Postgres is the thing that is broken) and
 * a row in `admin_audit_log`.
 *
 * Pass `tx` when the action runs in a transaction so the row commits or rolls
 * back with the change it describes. The insert then runs in a savepoint: a
 * failed insert aborts only the savepoint, not the admin's transaction.
 *
 * Tradeoff: a failed audit write is logged and swallowed, never thrown. The
 * actions audited here are mostly safety actions (ban, revoke sessions,
 * demote), and refusing to ban an abuser because the audit table is
 * unavailable is worse than an action that only reached the stdout trail.
 * The `admin_audit_write_failed` line carries the full entry so the row can
 * be reconstructed from logs.
 */
export async function writeAdminAudit(
	entry: AdminAuditEntry,
	tx?: AuditTransaction,
): Promise<boolean> {
	const row = {
		actorId: entry.actorId,
		targetType: entry.targetType,
		targetId: entry.targetId,
		action: entry.action,
		before: entry.before ?? null,
		after: entry.after ?? null,
	};
	console.info(JSON.stringify({ event: "admin_action", ...row }));
	try {
		if (tx) {
			await tx.transaction(async (savepoint) => {
				await savepoint.insert(adminAuditLog).values(row);
			});
		} else {
			await db.insert(adminAuditLog).values(row);
		}
		return true;
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "admin_audit_write_failed",
				...row,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		return false;
	}
}
