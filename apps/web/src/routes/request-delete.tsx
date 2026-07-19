import { Button, buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/request-delete")({
	validateSearch: z.object({
		deleted: z
			.literal("1")
			.optional()
			.transform((value) => (value === "1" ? true : undefined)),
	}),
	head: () => ({
		meta: [
			{ title: "Delete your VISP account" },
			{
				name: "description",
				content: "Request deletion of your VISP account and associated data.",
			},
		],
	}),
	component: RequestDelete,
});

function RequestDelete() {
	const { deleted } = Route.useSearch();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [pending, setPending] = useState(false);
	const [signingProvider, setSigningProvider] = useState<"twitch" | "kick">();

	const signIn = async (provider: "twitch" | "kick") => {
		setPending(true);
		setSigningProvider(provider);
		const result =
			provider === "twitch"
				? await authClient.signIn.social({
						provider,
						callbackURL: "/request-delete",
					})
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL: "/request-delete",
					});
		if (result.error) {
			toast.error(result.error.message ?? `${provider} sign-in failed`);
			setPending(false);
			setSigningProvider(undefined);
		}
	};

	const deleteAccount = async () => {
		if (!window.confirm("Permanently delete your VISP account and its data?")) {
			return;
		}

		setPending(true);
		const result = await authClient.deleteUser({
			callbackURL: "/request-delete?deleted=1",
		});
		if (result.error) {
			toast.error(result.error.message ?? "Account deletion failed");
			setPending(false);
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:py-16">
			<header className="flex flex-col gap-4">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					VISP account management
				</p>
				<h1 className="font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					Delete your account
				</h1>
				<p className="max-w-prose text-muted-foreground">
					Use this page to permanently delete your VISP account and the data
					associated with it. You do not need to uninstall the VISP app first.
				</p>
			</header>

			{deleted ? (
				<p className="border border-border bg-card p-4" role="status">
					Your VISP account and its active data have been deleted.
				</p>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Request account deletion</CardTitle>
					<CardDescription>
						Deletion is permanent and cannot be undone.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
						<li>Sign in with a Twitch or Kick account connected to VISP.</li>
						<li>Select “Delete my VISP account” below.</li>
						<li>Confirm the deletion in your browser.</li>
					</ol>
				</CardContent>
				<CardFooter className="flex flex-wrap gap-3">
					{sessionPending ? (
						<Button disabled>Checking account...</Button>
					) : session ? (
						<Button
							disabled={pending}
							onClick={deleteAccount}
							variant="destructive"
						>
							{pending ? "Deleting account..." : "Delete my VISP account"}
						</Button>
					) : (
						<>
							<Button disabled={pending} onClick={() => void signIn("twitch")}>
								{signingProvider === "twitch"
									? "Opening Twitch..."
									: "Sign in with Twitch"}
							</Button>
							<Button
								disabled={pending}
								onClick={() => void signIn("kick")}
								variant="outline"
							>
								{signingProvider === "kick"
									? "Opening Kick..."
									: "Sign in with Kick"}
							</Button>
						</>
					)}
					<Link className={buttonVariants({ variant: "outline" })} to="/">
						Cancel
					</Link>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Data deleted</CardTitle>
					<CardDescription>
						Deletion removes the following data from VISP’s active systems.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
						<li>
							Your VISP profile, including name, email address, profile image,
							and linked Twitch or Kick accounts and tokens
						</li>
						<li>Sign-in sessions and related device or browser information</li>
						<li>
							Relay credentials, stream paths and labels, and setup preferences
						</li>
						<li>
							Connection and latency measurements associated with your account
						</li>
						<li>Latest stream snapshots shown in the VISP dashboard</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Data kept and retention periods</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
					<p>
						VISP relays video and audio live and stores one private 640-pixel
						snapshot per publishing path for the dashboard. It is replaced about
						once a minute while live and expires within one day after updates
						stop. VISP does not retain continuous stream recordings or chat
						content.
					</p>
					<p>
						Account data is deleted from active systems immediately. Encrypted
						backup copies may remain for up to 30 days before they are
						overwritten.
					</p>
					<p>
						Security and service logs may be retained for up to 90 days. They
						are kept only for security, fraud prevention, and service
						reliability, and do not include stream content. Data required by law
						may be retained for the legally required period.
					</p>
				</CardContent>
			</Card>

			<p className="text-muted-foreground text-sm">
				If you cannot sign in, email{" "}
				<a
					className="text-foreground underline underline-offset-4"
					href={`mailto:${legalEntity.email}?subject=VISP%20account%20deletion`}
				>
					{legalEntity.email}
				</a>{" "}
				({legalEntity.companyName}) with your Twitch or Kick username and the
				subject “VISP account deletion.” See also{" "}
				<Link
					className="text-foreground underline underline-offset-4"
					to="/contact"
				>
					Contact
				</Link>{" "}
				and the{" "}
				<Link
					className="text-foreground underline underline-offset-4"
					to="/privacy"
				>
					Privacy Policy
				</Link>
				.
			</p>
		</main>
	);
}
