import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MeterMark } from "@/components/meter-mark";
import { onAirLabel, rotationIndex } from "@/lib/on-air";
import { useTRPC } from "@/utils/trpc";

// Rendered 1920x1080 by Cloud Studio into the showcase channel's broadcast.
// A fixed canvas, no chrome, nothing interactive: it only has to look right
// in a headless Chromium screenshot every five seconds.
export const Route = createFileRoute("/live")({
	head: () => ({
		meta: [
			{ title: "VISP is always on" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: LivePage,
});

// PageHeader's EYEBROW pins 12px; the broadcast canvas needs the same voice at 20px.
const EYEBROW =
	"font-mono text-xl uppercase tracking-[0.2em] text-muted-foreground";

const PITCH_MS = 12_000;
const PITCHES = [
	{
		hook: "You don't need OBS for this.",
		feature: "Stream from your phone to Twitch, Kick, and YouTube",
	},
	{
		hook: "Lost phone at a festival.",
		feature: "Your stream key is never on the phone. Revoke the device, done.",
	},
	{
		hook: "Battery at 3%.",
		feature: "Start on a second phone; it takes over the stream.",
	},
	{
		hook: "Twitch and Kick at once.",
		feature: "One upload from the phone, every platform from the relay.",
	},
	{
		hook: "Signal dropped in the tunnel.",
		feature:
			"Never drop again: the BRB card holds your stream until you're back.",
	},
	{
		hook: "Nobody at the desk.",
		feature:
			"The chat bot posts live, BRB, and back alerts with your computer off.",
	},
];

function useNow(tickMs: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), tickMs);
		return () => clearInterval(timer);
	}, [tickMs]);
	return now;
}

function LivePage() {
	const trpc = useTRPC();
	const summary = useQuery({
		...trpc.live.summary.queryOptions(),
		refetchInterval: 10_000,
	});
	const now = useNow(1_000);
	const pitch = PITCHES[rotationIndex(now, PITCHES.length, PITCH_MS)];
	const onAir = onAirLabel(summary.data?.onAirSince ?? null, now);
	const channels = summary.data?.channels ?? [];
	const clock = new Date(now).toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "UTC",
	});

	return (
		<main className="flex h-[1080px] w-[1920px] flex-col overflow-hidden bg-background px-24 py-20 text-foreground">
			<header className="flex items-center justify-between border-border border-b pb-8">
				<div className="flex items-center gap-6">
					<span className="inline-flex w-20">
						<MeterMark className="origin-left scale-[2.2]" />
					</span>
					<span className="font-display font-semibold text-5xl uppercase leading-none tracking-tight">
						VISP
					</span>
					<span className={EYEBROW}>always on · visp-stream.com</span>
				</div>
				<div className="flex items-center gap-10 font-mono text-2xl uppercase tracking-[0.2em]">
					<span className="text-muted-foreground">{clock} UTC</span>
					{onAir ? (
						<span className="flex items-center gap-4">
							<span className="size-4 animate-pulse rounded-full bg-tally" />
							on air {onAir}
						</span>
					) : null}
				</div>
			</header>

			<section className="flex flex-1 flex-col justify-center gap-8">
				<p className={`${EYEBROW} text-2xl`}>Phone-only live streaming</p>
				<h1
					key={pitch?.hook}
					className="max-w-6xl font-display font-semibold text-[10rem] uppercase leading-[0.9] tracking-tight"
				>
					{pitch?.hook}
				</h1>
				<p className="max-w-5xl text-4xl text-muted-foreground leading-snug">
					{pitch?.feature}
				</p>
			</section>

			<footer className="flex flex-col gap-6 border-border border-t pt-8">
				<div className="flex items-baseline justify-between">
					<span className={EYEBROW}>Live through VISP right now</span>
					{summary.data ? (
						<span className={EYEBROW}>
							{summary.data.liveNow} devices publishing
						</span>
					) : null}
				</div>
				<ul className="flex min-h-14 flex-wrap gap-4 font-mono text-2xl">
					{channels.length ? (
						channels.map((channel) => (
							<li
								key={channel.login}
								className="flex items-center gap-3 rounded border border-border px-5 py-2"
							>
								<span className="size-3 rounded-full bg-tally" />
								twitch.tv/{channel.login}
							</li>
						))
					) : (
						<li className="text-muted-foreground">
							Quiet right now. Yours could be the first chip here.
						</li>
					)}
				</ul>
			</footer>
		</main>
	);
}
