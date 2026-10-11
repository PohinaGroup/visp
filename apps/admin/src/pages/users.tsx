import { Badge } from "@VISP/ui/components/badge";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronLeft,
	ChevronRight,
	CircleUserRound,
	Database,
	Search,
	UserX,
} from "lucide-react";
import { useState } from "react";
import { useSearchParam } from "../app/search";
import { useAdminSession } from "../app/session";
import { PageHeader } from "../components/page-header";
import { UserDetailPanel } from "../components/user-detail-panel";
import { trpc } from "../lib";
import { formatDate } from "../lib/format";

type UsersResult = Awaited<ReturnType<typeof trpc.admin.users.list.query>>;
type UserRow = UsersResult["items"][number];

function UserTable({
	items,
	selectedId,
	onSelect,
}: {
	items: UserRow[];
	selectedId?: string;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="admin-table">
				<thead>
					<tr>
						<th>User</th>
						<th>Status</th>
						<th>Joined</th>
						<th>Devices</th>
						<th>Last stream</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr
							data-selected={item.id === selectedId}
							key={item.id}
							onClick={() => onSelect(item.id)}
						>
							<td>
								<div className="flex items-center gap-3">
									{item.image ? (
										<img
											alt=""
											className="size-8 object-cover"
											src={item.image}
										/>
									) : (
										<div className="flex size-8 items-center justify-center bg-muted">
											<CircleUserRound className="size-4" />
										</div>
									)}
									<div className="min-w-0">
										<p className="truncate font-medium">{item.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{item.email}
										</p>
									</div>
								</div>
							</td>
							<td>
								<div className="flex flex-wrap gap-1">
									<Badge
										variant={item.role === "admin" ? "default" : "outline"}
									>
										{item.role}
									</Badge>
									{item.banned && <Badge variant="destructive">banned</Badge>}
									{item.live && <Badge variant="secondary">live</Badge>}
								</div>
							</td>
							<td className="text-muted-foreground">
								{formatDate(item.createdAt)}
							</td>
							<td>
								<span className="font-mono">{item.activeDeviceCount}</span>
								{item.activeDeviceCount !== item.deviceCount && (
									<span className="text-muted-foreground">
										{" "}
										/ {item.deviceCount}
									</span>
								)}
							</td>
							<td className="text-muted-foreground">
								{formatDate(item.lastStreamedAt)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{items.length === 0 && (
				<div className="p-10 text-center text-muted-foreground">
					No users match these filters.
				</div>
			)}
		</div>
	);
}

/**
 * Users list plus detail. The selected user lives in `?user=` so a support
 * link opens straight onto that account; nothing is selected until an admin
 * picks a row, which avoids loading an arbitrary user's detail on every visit.
 */
export function UsersPage() {
	const session = useAdminSession();
	const queryClient = useQueryClient();
	const [query, setQuery] = useState("");
	const [search, setSearch] = useState("");
	const [role, setRole] = useState("");
	const [status, setStatus] = useState("");
	const [usage, setUsage] = useState("");
	const [selectedId, setSelectedId] = useSearchParam("user");
	const [pages, setPages] = useState<string[]>(["0"]);
	const cursor = pages.at(-1);

	const users = useQuery({
		queryKey: ["admin-users", search, role, status, usage, cursor],
		queryFn: () =>
			trpc.admin.users.list.query({
				cursor,
				limit: 50,
				query: search || undefined,
				role: role ? (role as "user" | "admin") : undefined,
				status: status ? (status as "active" | "banned") : undefined,
				usage: usage
					? (usage as
							| "no-device"
							| "device"
							| "never-streamed"
							| "streamed"
							| "live")
					: undefined,
			}),
	});
	const detail = useQuery({
		queryKey: ["admin-user", selectedId],
		queryFn: () => trpc.admin.users.get.query({ userId: selectedId as string }),
		enabled: Boolean(selectedId),
		retry: false,
	});

	const resetPage = () => setPages(["0"]);

	return (
		<div className="grid gap-6">
			<PageHeader
				description="Search accounts, inspect setup and usage, and take support actions."
				title="Users"
			/>
			<section className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(430px,0.65fr)]">
				<Card className="h-fit border border-border/60">
					<CardHeader>
						<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
							<div>
								<CardTitle className="text-lg">Accounts</CardTitle>
								<CardDescription>
									{users.data?.total ?? 0} accounts
								</CardDescription>
							</div>
							<form
								className="flex min-w-0 flex-1 gap-2 xl:max-w-sm"
								onSubmit={(event) => {
									event.preventDefault();
									setSearch(query.trim());
									resetPage();
								}}
							>
								<div className="relative flex-1">
									<Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
									<Input
										className="pl-8"
										placeholder="Name, email, or user ID"
										value={query}
										onChange={(event) => setQuery(event.target.value)}
									/>
								</div>
								<Button type="submit">Search</Button>
							</form>
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							<NativeSelect
								value={role}
								onChange={(event) => {
									setRole(event.target.value);
									resetPage();
								}}
							>
								<NativeSelectOption value="">All roles</NativeSelectOption>
								<NativeSelectOption value="user">User</NativeSelectOption>
								<NativeSelectOption value="admin">Admin</NativeSelectOption>
							</NativeSelect>
							<NativeSelect
								value={status}
								onChange={(event) => {
									setStatus(event.target.value);
									resetPage();
								}}
							>
								<NativeSelectOption value="">All statuses</NativeSelectOption>
								<NativeSelectOption value="active">Active</NativeSelectOption>
								<NativeSelectOption value="banned">Banned</NativeSelectOption>
							</NativeSelect>
							<NativeSelect
								value={usage}
								onChange={(event) => {
									setUsage(event.target.value);
									resetPage();
								}}
							>
								<NativeSelectOption value="">All usage</NativeSelectOption>
								<NativeSelectOption value="no-device">
									No device
								</NativeSelectOption>
								<NativeSelectOption value="device">
									Has device
								</NativeSelectOption>
								<NativeSelectOption value="never-streamed">
									Never streamed
								</NativeSelectOption>
								<NativeSelectOption value="streamed">
									Has streamed
								</NativeSelectOption>
								<NativeSelectOption value="live">Live now</NativeSelectOption>
							</NativeSelect>
						</div>
					</CardHeader>
					<CardContent className="px-0">
						{users.isPending ? (
							<div className="p-10 text-center text-muted-foreground">
								Loading users…
							</div>
						) : (
							<UserTable
								items={users.data?.items ?? []}
								selectedId={selectedId}
								onSelect={setSelectedId}
							/>
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
								disabled={!users.data?.nextCursor}
								size="sm"
								variant="outline"
								onClick={() => {
									if (users.data?.nextCursor) {
										setPages((current) => [
											...current,
											users.data.nextCursor as string,
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

				<aside>
					{detail.isPending && selectedId ? (
						<Card className="border border-border/60 p-10 text-center text-muted-foreground">
							Loading user…
						</Card>
					) : detail.isError && selectedId ? (
						<Card className="border border-border/60 p-10 text-center">
							<UserX className="mx-auto mb-3 size-8 text-destructive" />
							<p className="font-medium">Could not load this user</p>
							<p className="mt-1 text-muted-foreground text-xs">
								{detail.error.message}
							</p>
							<Button
								className="mx-auto mt-4"
								size="sm"
								variant="outline"
								onClick={() => setSelectedId(undefined)}
							>
								Clear selection
							</Button>
						</Card>
					) : detail.data ? (
						<UserDetailPanel
							currentUserId={session.user.id}
							detail={detail.data}
							onChanged={async () => {
								await Promise.all([
									queryClient.invalidateQueries({
										queryKey: ["admin-user", selectedId],
									}),
									queryClient.invalidateQueries({
										queryKey: ["admin-users"],
									}),
									queryClient.invalidateQueries({
										queryKey: ["admin-overview"],
									}),
								]);
							}}
						/>
					) : (
						<Card className="border border-border/60 p-10 text-center">
							<Database className="mx-auto mb-3 size-8 text-muted-foreground" />
							<p className="font-medium">Select a user</p>
							<p className="mt-1 text-muted-foreground text-xs">
								Account and relay details appear here.
							</p>
						</Card>
					)}
				</aside>
			</section>
		</div>
	);
}
