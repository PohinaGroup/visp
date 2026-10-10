import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Toaster } from "@VISP/ui/components/sonner";
import { useQuery } from "@tanstack/react-query";
import { Ban, LogOut, MonitorUp, RefreshCw, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { authClient, trpc } from "../lib";
import type { AdminSession } from "./session";

function Loading() {
	return (
		<div className="flex min-h-screen items-center justify-center text-muted-foreground">
			<RefreshCw className="mr-2 size-4 animate-spin" />
			Loading VISP Admin
		</div>
	);
}

function SignIn() {
	const [pending, setPending] = useState<"twitch" | "kick" | "google">();

	const signIn = async (provider: "twitch" | "kick" | "google") => {
		setPending(provider);
		// Return to the page that was opened so deep links survive sign-in.
		const callbackURL = window.location.href;
		const result =
			provider !== "kick"
				? await authClient.signIn.social({ provider, callbackURL })
				: await authClient.signIn.social({
						provider: provider,
						callbackURL,
					});
		if (result.error) {
			toast.error(result.error.message ?? "Sign in failed");
			setPending(undefined);
		}
	};

	return (
		<main className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md border border-border/70 bg-card/95 shadow-2xl">
				<CardHeader>
					<div className="mb-4 flex size-10 items-center justify-center bg-primary text-primary-foreground">
						<ShieldCheck className="size-5" />
					</div>
					<CardTitle className="text-xl">VISP Admin</CardTitle>
					<CardDescription>
						Sign in with the same Twitch, Kick, or Google account you use with
						VISP.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						onClick={() => signIn("twitch")}
					>
						{pending === "twitch" ? "Opening Twitch…" : "Continue with Twitch"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("google")}
					>
						{pending === "google" ? "Opening Google…" : "Continue with Google"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("kick")}
					>
						{pending === "kick" ? "Opening Kick…" : "Continue with Kick"}
					</Button>
					<p className="pt-3 text-center text-muted-foreground text-xs">
						Administrator role required.
					</p>
				</CardContent>
			</Card>
		</main>
	);
}

function AccessDenied() {
	return (
		<main className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md border border-border/70">
				<CardHeader>
					<Ban className="mb-3 size-8 text-destructive" />
					<CardTitle className="text-xl">
						Administrator access required
					</CardTitle>
					<CardDescription>
						This VISP account is valid, but it does not have access to the
						support console.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						onClick={async () => {
							await authClient.signOut();
							window.location.reload();
						}}
					>
						<LogOut />
						Sign out
					</Button>
				</CardContent>
			</Card>
		</main>
	);
}

/**
 * Renders `children` only for a signed-in administrator. Access is probed with
 * `admin.overview` because the session alone cannot prove the admin role (it
 * may also come from the server's `ADMIN_USER_IDS`).
 */
export function AuthGate({
	children,
}: {
	children: (session: AdminSession) => ReactNode;
}) {
	const session = authClient.useSession();
	const access = useQuery({
		queryKey: ["admin-access", session.data?.user.id],
		queryFn: () => trpc.admin.overview.query(),
		enabled: Boolean(session.data),
		retry: false,
	});

	if (session.isPending) return <Loading />;
	if (!session.data) {
		return (
			<>
				<SignIn />
				<Toaster />
			</>
		);
	}
	if (access.isPending) return <Loading />;
	if (access.isError) {
		const code =
			"data" in access.error
				? (access.error.data as { code?: string } | undefined)?.code
				: undefined;
		if (code === "FORBIDDEN") {
			return (
				<>
					<AccessDenied />
					<Toaster />
				</>
			);
		}
		return (
			<main className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-md border border-border/60">
					<CardHeader>
						<MonitorUp className="mb-3 size-8 text-destructive" />
						<CardTitle>Admin API unavailable</CardTitle>
						<CardDescription>{access.error.message}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => access.refetch()}>Try again</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	return children(session.data);
}
