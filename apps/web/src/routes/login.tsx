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

import { authClient, authRedirectURL } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		error: z.string().optional(),
		lang: z.literal("fi").optional(),
		redirect: z.string().optional(),
	}),
	component: RouteComponent,
});

function safeReturnPath(value: string | undefined) {
	return value?.startsWith("/") && !value.startsWith("//") ? value : "/setup";
}

function RouteComponent() {
	const { error, redirect } = Route.useSearch();
	const locale = useLocale();
	const fi = locale === "fi";
	const [pending, setPending] = useState<"twitch" | "kick">();
	const returnPath = safeReturnPath(
		redirect ?? (fi ? "/setup?lang=fi" : undefined),
	);
	const errorReturnPath = `/login?redirect=${encodeURIComponent(returnPath)}${fi ? "&lang=fi" : ""}`;

	const signIn = async (provider: "twitch" | "kick") => {
		setPending(provider);
		const result =
			provider === "twitch"
				? await authClient.signIn.social({
						provider,
						callbackURL: authRedirectURL(returnPath),
						errorCallbackURL: authRedirectURL(errorReturnPath),
					})
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL: authRedirectURL(returnPath),
						errorCallbackURL: authRedirectURL(errorReturnPath),
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
					<CardTitle>{fi ? "Kirjaudu VISPiin" : "Sign in to VISP"}</CardTitle>
					<CardDescription>
						{fi
							? "Twitchiä tai Kickiä käytetään vain relay-tilisi tunnistamiseen. VISP ei koskaan saa lähetysavaintasi."
							: "Twitch or Kick is used only to identify your relay account. VISP never receives your stream key."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error === "account_not_linked" && (
						<p className="mb-4 text-destructive">
							{fi
								? "Tämä tunnus vastaa olemassa olevaa VISP-tiliä. Kirjaudu ensin käyttämälläsi palvelulla ja yhdistä tämä tunnus hallintapaneelista."
								: "That account matches an existing VISP account. Sign in with the provider you first used, then connect this one from the dashboard."}
						</p>
					)}
					<p className="text-muted-foreground">
						{fi
							? "Syötteesi pysyvät omalla OBS-koneellasi; palvelu vain välittää SRT- tai RTMP-liikenteen."
							: "Your feeds remain on your own OBS machine; the service only relays SRT or RTMP traffic."}
					</p>
				</CardContent>
				<CardFooter className="flex flex-col gap-2">
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						onClick={() => signIn("twitch")}
					>
						{pending === "twitch"
							? fi
								? "Avataan Twitchiä..."
								: "Opening Twitch..."
							: fi
								? "Jatka Twitchillä"
								: "Continue with Twitch"}
					</Button>
					<Button
						className="w-full"
						disabled={Boolean(pending)}
						variant="outline"
						onClick={() => signIn("kick")}
					>
						{pending === "kick"
							? fi
								? "Avataan Kickiä..."
								: "Opening Kick..."
							: fi
								? "Jatka Kickillä"
								: "Continue with Kick"}
					</Button>
					<p className="pt-2 text-center text-muted-foreground text-xs leading-relaxed">
						{fi ? "Jatkamalla hyväksyt " : "By continuing, you agree to the "}
						<Link
							className="underline underline-offset-4"
							to={fi ? "/fi/terms" : "/terms"}
						>
							{fi ? "käyttöehdot" : "Terms of Service"}
						</Link>{" "}
						{fi ? "ja " : "and "}
						<Link
							className="underline underline-offset-4"
							to={fi ? "/fi/privacy" : "/privacy"}
						>
							{fi ? "tietosuojaselosteen" : "Privacy Policy"}
						</Link>
						.
					</p>
				</CardFooter>
			</Card>
		</main>
	);
}
