import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Input } from "@VISP/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@VISP/ui/components/native-select";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParam } from "../app/search";
import {
	AUDIT_ACTION_FILTERS,
	AuditActionBadge,
	AuditDiff,
	type AuditRow,
	AuditTarget,
	auditActorName,
} from "../components/audit-log";
import { PageHeader } from "../components/page-header";
import { trpc } from "../lib";
import { formatDate } from "../lib/format";

function AuditTable({
	items,
	onActor,
}: {
	items: AuditRow[];
	onActor: (actorId: string) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="admin-table">
				<thead>
					<tr>
						<th>Time</th>
						<th>Admin</th>
						{/* The shared table hides columns 3 and 5 on narrow screens;
						    here they are the point of the page, so they stay. */}
						<th className="table-cell!">Action</th>
						<th>Target</th>
						<th className="table-cell!">Change</th>
					</tr>
				</thead>
				<tbody>
					{items.map((row) => (
						<tr className="cursor-default!" key={row.id}>
							<td
								className="whitespace-nowrap text-muted-foreground"
								title={row.createdAt}
							>
								{formatDate(row.createdAt)}
							</td>
							<td>
								<button
									className="text-left hover:underline"
									title="Show only this admin's actions"
									type="button"
									onClick={() => onActor(row.actorId)}
								>
									{auditActorName(row)}
								</button>
							</td>
							<td className="table-cell!">
								<AuditActionBadge action={row.action} />
							</td>
							<td>
								<AuditTarget row={row} />
							</td>
							<td className="table-cell!">
								<AuditDiff after={row.after} before={row.before} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{items.length === 0 && (
				<div className="p-10 text-center text-muted-foreground">
					No admin actions match these filters.
				</div>
			)}
		</div>
	);
}

/**
 * The persistent admin audit log. Every filter lives in the query string
 * (`?actor=`, `?targetType=`, `?target=`, `?action=`), so the "View all" link
 * on a user's detail panel and links pasted into a support thread open on the
 * same filtered view.
 */
export function AuditPage() {
	const [actor, setActor] = useSearchParam("actor");
	const [targetTypeParam, setTargetType] = useSearchParam("targetType");
	const [target, setTarget] = useSearchParam("target");
	const [action, setAction] = useSearchParam("action");
	const targetType =
		targetTypeParam === "user" ||
		targetTypeParam === "relay" ||
		targetTypeParam === "setting"
			? targetTypeParam
			: undefined;
	const navigate = useNavigate();
	const [targetDraft, setTargetDraft] = useState(target ?? "");
	useEffect(() => setTargetDraft(target ?? ""), [target]);

	// Pages belong to one filter combination: changing any filter starts again
	// from the newest page instead of keeping a cursor into another result.
	const filterKey = [actor, targetType, target, action].join("\u0000");
	const [paging, setPaging] = useState({ key: filterKey, pages: ["0"] });
	const pages = paging.key === filterKey ? paging.pages : ["0"];
	const setPages = (update: (current: string[]) => string[]) =>
		setPaging({ key: filterKey, pages: update(pages) });
	const cursor = pages.at(-1);

	const log = useQuery({
		queryKey: ["admin-audit", actor, targetType, target, action, cursor],
		queryFn: () =>
			trpc.admin.audit.list.query({
				cursor,
				limit: 50,
				actorId: actor,
				targetType,
				targetId: target,
				action,
			}),
	});

	const filtered = Boolean(actor || targetType || target || action);
	const actorRow = actor
		? log.data?.items.find((row) => row.actorId === actor)
		: undefined;

	return (
		<div className="grid gap-6">
			<PageHeader
				description="Who changed what, when, across admin actions."
				title="Audit log"
			/>
			<Card className="border border-border/60">
				<CardHeader>
					<CardTitle className="text-lg">Admin actions</CardTitle>
					<CardDescription>
						{log.data?.total ?? 0} actions
						{actor && ` by ${actorRow ? auditActorName(actorRow) : actor}`}
					</CardDescription>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<NativeSelect
							aria-label="Action"
							value={action ?? ""}
							onChange={(event) => setAction(event.target.value || undefined)}
						>
							<NativeSelectOption value="">All actions</NativeSelectOption>
							{AUDIT_ACTION_FILTERS.map((option) => (
								<NativeSelectOption key={option.value} value={option.value}>
									{option.label}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="Target type"
							value={targetType ?? ""}
							onChange={(event) =>
								setTargetType(event.target.value || undefined)
							}
						>
							<NativeSelectOption value="">All targets</NativeSelectOption>
							<NativeSelectOption value="user">Users</NativeSelectOption>
							<NativeSelectOption value="relay">Relays</NativeSelectOption>
							<NativeSelectOption value="setting">Settings</NativeSelectOption>
						</NativeSelect>
						<form
							className="flex min-w-0 flex-1 gap-2 sm:max-w-xs"
							onSubmit={(event) => {
								event.preventDefault();
								setTarget(targetDraft.trim() || undefined);
							}}
						>
							<Input
								aria-label="Target ID"
								placeholder="Target user or relay ID"
								value={targetDraft}
								onChange={(event) => setTargetDraft(event.target.value)}
							/>
							<Button type="submit" variant="outline">
								Filter
							</Button>
						</form>
						{filtered && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => void navigate({ to: ".", search: {} })}
							>
								<X />
								Clear filters
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent className="px-0">
					{log.isPending ? (
						<div className="p-10 text-center text-muted-foreground">
							Loading audit log…
						</div>
					) : log.isError ? (
						<div className="p-10 text-center text-destructive">
							{log.error.message}
						</div>
					) : (
						<AuditTable items={log.data.items} onActor={setActor} />
					)}
					<div className="flex items-center justify-between px-4 pt-4">
						<Button
							disabled={pages.length === 1}
							size="sm"
							variant="outline"
							onClick={() => setPages((current) => current.slice(0, -1))}
						>
							<ChevronLeft />
							Previous
						</Button>
						<span className="text-muted-foreground text-xs">
							Page {pages.length}
						</span>
						<Button
							disabled={!log.data?.nextCursor}
							size="sm"
							variant="outline"
							onClick={() => {
								if (log.data?.nextCursor) {
									setPages((current) => [
										...current,
										log.data.nextCursor as string,
									]);
								}
							}}
						>
							Next
							<ChevronRight />
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
