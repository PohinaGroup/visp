import { Button } from "@VISP/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const reasons = [
	[
		"Look produced",
		"Alerts, overlays, stingers, scene switches — viewers see your full show, not a raw phone feed.",
	],
	[
		"No backpack",
		"The phone you own and the OBS you already run. No encoder box, no IRL rig, nothing new to buy.",
	],
	[
		"Survive dead zones",
		"A signal dip doesn't kill the broadcast. Viewers stay in the stream while your phone recovers.",
	],
	[
		"Keep your key safe",
		"Your stream key stays in OBS at home — never on your phone, never lost with it.",
	],
	[
		"Bring a guest",
		"A friend's phone drops into your show as a proper scene, not a call window.",
	],
	[
		"Go live everywhere",
		"One phone feed, and OBS pushes the show to Twitch and every other platform at once.",
	],
] as const;

function HomeComponent() {
	const { data: session, isPending } = authClient.useSession();
	const signedIn = Boolean(session);

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 sm:py-24">
			<div className="flex flex-col gap-5">
				<img
					src="/visp-logo.png"
					alt="VISP"
					className="-ml-2 h-24 w-24 object-contain"
				/>
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					IRL streaming for OBS
				</p>
				<h1 className="font-bold font-display text-6xl uppercase leading-[0.92] tracking-tight sm:text-7xl">
					Go outside.
					<br />
					Keep the whole show.
				</h1>
				<p className="max-w-prose text-lg text-muted-foreground">
					Stream IRL from just your phone — and still look like the produced
					broadcast your viewers expect. Your alerts, overlays, and scenes stay
					in, your stream survives bad signal, and you don't buy any new gear.
				</p>
			</div>

			<dl className="flex flex-col border-t">
				{reasons.map(([term, detail]) => (
					<div
						className="grid gap-1 border-b py-3 sm:grid-cols-[11rem_1fr] sm:gap-4"
						key={term}
					>
						<dt className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em] sm:pt-0.5">
							{term}
						</dt>
						<dd>{detail}</dd>
					</div>
				))}
			</dl>

			<div className="flex flex-col gap-4">
				<div className="flex flex-wrap gap-3">
					{isPending ? (
						<Button disabled>Loading...</Button>
					) : signedIn ? (
						<Link to="/dashboard">
							<Button>Open dashboard</Button>
						</Link>
					) : (
						<Link to="/login">
							<Button>Continue with Twitch</Button>
						</Link>
					)}
				</div>
				<p className="font-mono text-muted-foreground/70 text-xs uppercase tracking-[0.2em]">
					SRT/RTMP · no re-encode · open source
				</p>
			</div>
		</main>
	);
}
