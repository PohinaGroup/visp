import { buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";

import { getObsPluginRelease } from "@/functions/get-obs-releases";
import { legalEntity } from "@/lib/legal";
import type { ObsPluginRelease } from "@/lib/obs-releases";

export const Route = createFileRoute("/download")({
	head: () => ({
		meta: [
			{ title: "Download & beta access — VISP" },
			{
				name: "description",
				content:
					"Join the VISP hosted beta and get the phone apps, browser publisher, and OBS plugin.",
			},
		],
	}),
	loader: () => getObsPluginRelease(),
	component: DownloadPage,
});

function DownloadPage() {
	const obsRelease = Route.useLoaderData();

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-16">
			<header className="flex flex-col gap-4">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					Get started
				</p>
				<h1 className="font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					Download & beta
				</h1>
				<p className="max-w-prose text-muted-foreground">
					The hosted beta at visp-stream.com is the fastest way to try VISP.
					Sign in, pick a client, and send a phone or browser camera into your
					home OBS setup. Self-hosting is available for operators who want to
					run their own relay.
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>1. Join the hosted beta</CardTitle>
					<CardDescription>
						Free while in beta. No credit card. Twitch or Kick sign-in only.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
					<ol className="list-decimal space-y-2 pl-5">
						<li>Sign in with Twitch or Kick to create your VISP account.</li>
						<li>
							Answer the short setup questions so your relay path and OBS read
							credentials are ready.
						</li>
						<li>
							Publish from a supported client below, then watch the feed in OBS.
						</li>
					</ol>
					<div className="flex flex-wrap gap-2">
						<Link className={buttonVariants()} to="/login">
							Sign in to start
						</Link>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={`${legalEntity.docsUrl}/docs/get-started`}
							rel="noreferrer"
							target="_blank"
						>
							Get started docs
						</a>
					</div>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-4">
				<h2 className="font-display text-2xl uppercase tracking-tight">
					2. Supported clients
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Browser app</CardTitle>
							<CardDescription>
								Publish from Chrome, Edge, or Safari over WebRTC — no install.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<a
								className={buttonVariants({ variant: "outline" })}
								href={legalEntity.browserAppUrl}
								rel="noreferrer"
								target="_blank"
							>
								Open stream.visp-stream.com
							</a>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>OBS plugin</CardTitle>
							<CardDescription>
								Remote start/stop and scene control. Live in beta.
								{obsRelease ? ` Latest: ${obsRelease.tagName}.` : null}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<ObsPluginDownloadLinks release={obsRelease} />
							<p className="text-muted-foreground text-xs">
								Install, then pair from the dashboard OBS card. Docs:{" "}
								<a
									className="text-foreground underline underline-offset-4"
									href={`${legalEntity.docsUrl}/docs/obs-remote-control`}
									rel="noreferrer"
									target="_blank"
								>
									OBS remote control
								</a>
								.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>iOS app</CardTitle>
							<CardDescription>
								iOS 16.4+ via the VISP Internal TestFlight group. SRT publish
								from a real iPhone.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
							<p>
								Ask for a TestFlight invite after you have a VISP account, or
								email{" "}
								<a
									className="text-foreground underline underline-offset-4"
									href={`mailto:${legalEntity.email}?subject=VISP%20TestFlight%20access`}
								>
									{legalEntity.email}
								</a>{" "}
								with your Apple ID email.
							</p>
							<Link
								className={buttonVariants({ variant: "outline" })}
								to="/contact"
							>
								Contact for TestFlight
							</Link>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Android app</CardTitle>
							<CardDescription>
								Android 7+ via Play internal testing. SRT publish from a
								physical device.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
							<p>
								Request Play internal testing access after sign-in, or email{" "}
								<a
									className="text-foreground underline underline-offset-4"
									href={`mailto:${legalEntity.email}?subject=VISP%20Play%20internal%20testing`}
								>
									{legalEntity.email}
								</a>{" "}
								with the Google account email you use for Play.
							</p>
							<Link
								className={buttonVariants({ variant: "outline" })}
								to="/contact"
							>
								Contact for Play access
							</Link>
						</CardContent>
					</Card>
				</div>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>3. Docs, source, and self-hosting</CardTitle>
					<CardDescription>
						You do not need to self-host to use the beta.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
					<p>
						<strong className="text-foreground">Hosted beta</strong> — use
						visp-stream.com, the browser publisher, and the clients above. Best
						for creators testing the workflow.
					</p>
					<p>
						<strong className="text-foreground">Self-host</strong> — the full
						stack is open source under {legalEntity.license}. Aimed at technical
						operators; current deployment assumes a two-host relay + app setup.
					</p>
					<div className="flex flex-wrap gap-2">
						<a
							className={buttonVariants({ variant: "outline" })}
							href={legalEntity.docsUrl}
							rel="noreferrer"
							target="_blank"
						>
							Documentation
						</a>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={legalEntity.sourceUrl}
							rel="noreferrer"
							target="_blank"
						>
							GitHub
						</a>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={`${legalEntity.docsUrl}/docs/self-hosting`}
							rel="noreferrer"
							target="_blank"
						>
							Self-hosting docs
						</a>
					</div>
				</CardContent>
			</Card>

			<nav
				aria-label="Site links"
				className="flex flex-wrap gap-x-4 gap-y-2 border-border border-t pt-6 font-mono text-muted-foreground text-xs"
			>
				<Link className="hover:text-foreground" to="/privacy">
					Privacy
				</Link>
				<Link className="hover:text-foreground" to="/terms">
					Terms
				</Link>
				<Link className="hover:text-foreground" to="/cookies">
					Cookies
				</Link>
				<Link className="hover:text-foreground" to="/contact">
					Contact
				</Link>
				<a
					className="hover:text-foreground"
					href={legalEntity.sourceUrl}
					rel="noreferrer"
					target="_blank"
				>
					Source
				</a>
				<a
					className="hover:text-foreground"
					href={legalEntity.docsUrl}
					rel="noreferrer"
					target="_blank"
				>
					Docs
				</a>
			</nav>
		</main>
	);
}

function ObsPluginDownloadLinks({
	release,
}: {
	release: ObsPluginRelease | null;
}) {
	if (!release || release.assets.length === 0) {
		return (
			<a
				className={buttonVariants({ variant: "outline" })}
				href={legalEntity.releasesUrl}
				rel="noreferrer"
				target="_blank"
			>
				Download from GitHub Releases
			</a>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				{release.assets.map((asset) => (
					<a
						key={asset.platform}
						className={buttonVariants({ variant: "outline" })}
						download={asset.fileName}
						href={asset.downloadUrl}
						rel="noreferrer"
						target="_blank"
					>
						{asset.label}
					</a>
				))}
			</div>
			<a
				className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
				href={release.htmlUrl}
				rel="noreferrer"
				target="_blank"
			>
				All assets on GitHub ({release.tagName})
			</a>
		</div>
	);
}
