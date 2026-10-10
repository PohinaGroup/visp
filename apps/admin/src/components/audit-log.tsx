import { Badge } from "@VISP/ui/components/badge";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { trpc } from "../lib";
import { formatDate } from "../lib/format";

export type AuditResult = Awaited<
	ReturnType<typeof trpc.admin.audit.list.query>
>;
export type AuditRow = AuditResult["items"][number];

/** Action prefixes the audit page filters on; `set_flag:` covers every flag. */
export const AUDIT_ACTION_FILTERS = [
	{ value: "ban", label: "Ban" },
	{ value: "unban", label: "Unban" },
	{ value: "set_role", label: "Role change" },
	{ value: "set_flag:", label: "Feature flag" },
	{ value: "revoke_sessions", label: "Revoke sessions" },
	{ value: "relay_", label: "Relay change" },
	{ value: "spend_budget_", label: "Budget change" },
] as const;

const ACTION_LABELS: Record<string, string> = {
	ban: "Ban",
	unban: "Unban",
	set_role: "Set role",
	revoke_sessions: "Revoke sessions",
	relay_create: "Create relay",
	relay_update: "Update relay",
	spend_budget_set: "Set budget",
	spend_budget_clear: "Clear budget",
};

export function AuditActionBadge({ action }: { action: string }) {
	const flag = action.startsWith("set_flag:")
		? action.slice("set_flag:".length)
		: undefined;
	return (
		<Badge
			className="font-mono"
			title={action}
			variant={
				action === "ban" || action === "revoke_sessions"
					? "destructive"
					: "outline"
			}
		>
			{flag ? `Flag · ${flag}` : (ACTION_LABELS[action] ?? action)}
		</Badge>
	);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function formatValue(value: unknown) {
	if (value === null || value === undefined || value === "") return "none";
	if (typeof value === "string") {
		return ISO_DATE.test(value) ? formatDate(value) : value;
	}
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

/** `banExpires` reads as "ban expires"; the stored keys are API field names. */
function formatKey(key: string) {
	return key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);
}

/**
 * Compact before → after view of one audit row. Only keys present in either
 * side are shown; the server already drops unchanged relay fields, so each
 * line is something the action actually changed (or, for a create, set).
 */
export function AuditDiff({
	before,
	after,
}: {
	before: AuditRow["before"];
	after: AuditRow["after"];
}) {
	const keys = [
		...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
	];
	if (keys.length === 0) {
		return <span className="text-muted-foreground text-xs">No changes</span>;
	}
	return (
		<ul className="grid gap-0.5 text-xs">
			{keys.map((key) => {
				const hasBefore = Boolean(before && key in before);
				const hasAfter = Boolean(after && key in after);
				const old = formatValue(before?.[key]);
				const next = formatValue(after?.[key]);
				return (
					<li className="flex min-w-0 flex-wrap items-center gap-1" key={key}>
						<span className="text-muted-foreground">{formatKey(key)}</span>
						{hasBefore && (
							<span
								className="max-w-48 truncate font-mono text-muted-foreground line-through"
								title={old}
							>
								{old}
							</span>
						)}
						{hasBefore && hasAfter && (
							<ArrowRight className="size-3 shrink-0 text-muted-foreground" />
						)}
						{hasAfter && (
							<span className="max-w-48 truncate font-mono" title={next}>
								{next}
							</span>
						)}
					</li>
				);
			})}
		</ul>
	);
}

const linkClass = "text-primary underline-offset-4 hover:underline";

/**
 * Where the target lives in the console. Names come from a read-time join and
 * are null once the user or relay is deleted, so the ID is the fallback.
 */
export function AuditTarget({ row }: { row: AuditRow }) {
	if (row.targetType === "setting") {
		// Settings are named by their key, e.g. `spend_budget:tts`.
		return (
			<Link className={linkClass} to="/usage">
				<span className="font-mono text-xs">{row.targetId}</span>
			</Link>
		);
	}
	if (row.targetType === "relay") {
		return (
			<Link className={linkClass} to="/relays">
				{row.targetName ?? `Relay #${row.targetId}`}
			</Link>
		);
	}
	return (
		<div className="min-w-0">
			<Link className={linkClass} search={{ user: row.targetId }} to="/users">
				{row.targetName ?? row.targetId}
			</Link>
			{row.targetEmail && (
				<p className="truncate text-muted-foreground text-xs">
					{row.targetEmail}
				</p>
			)}
		</div>
	);
}

export function auditActorName(row: AuditRow) {
	return row.actorName ?? row.actorId;
}
