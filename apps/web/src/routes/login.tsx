import { Button } from "@VISP/ui/components/button";
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

export const Route = createFileRoute("/login")({
	validateSearch: z.object({ error: z.string().optional() }),
	component: RouteComponent,
});

function RouteComponent() {
	const { error } = Route.useSearch();
	const [pending, setPending] = useState<"twitch" | "kick">();

	const signIn = async (provider: "twitch" | "kick") => {
		setPending(provider);
		const result =
			provider === "twitch"
				? await authClient.signIn.social({
						provider,
						callbackURL: "/setup",
						errorCallbackURL: "/login",
					})
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL: "/setup",
						errorCallbackURL: "/login",
					});
		if (result.error) {
			toast.error(result.error.message ?? `${provider} sign-in failed`);
			setPending(undefined);
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-md items-center px-4 py-12">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Sign in to VISP</CardTitle>
					<CardDescription>
						Twitch or Kick is used only to identify your relay account. VISP
						never receives your stream key.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error === "account_not_linked" && (
						<p className="mb-4 text-destructive">
							That account matches an existing VISP account. Sign in with
							the provider you first used, then connect this one from the
							dashboard.
						</p>
					)}
					<p className="text-muted-foreground">
						Your feeds remain on your own OBS machine; the service only relays
						SRT or RTMP traffic.
					</p>
				</CardContent>
				<CardFooter className="flex flex-col gap-2">
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						onClick={() => signIn("twitch")}
					>
						{pending === "twitch"
							? "Opening Twitch..."
							: "Continue with Twitch"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("kick")}
					>
						{pending === "kick" ? "Opening Kick..." : "Continue with Kick"}
					</Button>
					<p className="pt-2 text-center text-muted-foreground text-xs leading-relaxed">
						By continuing, you agree to the{" "}
						<Link className="underline underline-offset-4" to="/terms">
							Terms of Service
						</Link>{" "}
						and{" "}
						<Link className="underline underline-offset-4" to="/privacy">
							Privacy Policy
						</Link>
						.
					</p>
				</CardFooter>
			</Card>
		</main>
	);
}
