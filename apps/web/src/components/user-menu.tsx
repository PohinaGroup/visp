import { Button } from "@VISP/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@VISP/ui/components/dropdown-menu";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { localeSearch, useLocale } from "@/lib/i18n";

// `studioLabel` adds a Cloud Studio item (set when the account has access).
export default function UserMenu({ studioLabel }: { studioLabel?: string }) {
	const locale = useLocale();
	const fi = locale === "fi";
	const navigate = useNavigate();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className="h-9 w-24" />;
	}

	if (!session) {
		return (
			<Link to="/login" search={localeSearch(locale)}>
				<Button variant="outline">{fi ? "Kirjaudu" : "Sign In"}</Button>
			</Link>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="outline" className="max-w-40" />}
			>
				<span className="truncate">{session.user.name}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						{fi ? "Oma tili" : "My Account"}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>{session.user.email}</DropdownMenuItem>
					{studioLabel ? (
						<DropdownMenuItem
							onClick={() =>
								navigate({ to: "/studio", search: localeSearch(locale) })
							}
						>
							{studioLabel}
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										navigate({
											to: fi ? "/fi" : "/",
										});
									},
								},
							});
						}}
					>
						{fi ? "Kirjaudu ulos" : "Sign Out"}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
