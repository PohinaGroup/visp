import { useEffect, useRef, useState } from "react";

import { mktPhone } from "./styles";

// The go-live recording's frame (poster size); keeps the layout from shifting.
const WIDTH = 560;
const HEIGHT = 1213;

/**
 * Product footage in a phone bezel, looping, muted. SSR ships the poster with
 * preload="none". After mount: wide screens fetch metadata and autoplay;
 * phones and Save-Data play once it scrolls into view; reduced motion never
 * autoplays. The loop runs on its own, so a visible play/pause button is
 * always there (WCAG 2.2.2); native controls would clutter the frame.
 */
export function HeroVideo({
	src,
	poster,
	label,
	buttons,
}: {
	src: string;
	poster: string;
	label: string;
	buttons: { pause: string; play: string };
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const [playing, setPlaying] = useState(false);

	useEffect(() => {
		const video = ref.current;
		if (!video) return;
		if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const play = () => {
			video.muted = true;
			video.play().catch(() => {});
		};
		const saveData =
			(navigator as { connection?: { saveData?: boolean } }).connection
				?.saveData === true;
		if (saveData || matchMedia("(max-width: 639px)").matches) {
			const observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((e) => e.isIntersecting)) return;
					observer.disconnect();
					play();
				},
				{ threshold: 0.5 },
			);
			observer.observe(video);
			return () => observer.disconnect();
		}
		video.preload = "metadata";
		play();
	}, []);

	const toggle = () => {
		const video = ref.current;
		if (!video) return;
		if (video.paused) video.play().catch(() => {});
		else video.pause();
	};

	return (
		<div className="flex flex-col items-center gap-3 lg:items-end">
			<div className={mktPhone}>
				<video
					ref={ref}
					loop
					muted
					playsInline
					poster={poster}
					preload="none"
					width={WIDTH}
					height={HEIGHT}
					aria-label={label}
					onPlay={() => setPlaying(true)}
					onPause={() => setPlaying(false)}
					className="block h-auto max-h-[60svh] w-auto max-w-full rounded-[1.75rem] bg-paper"
				>
					<source src={src} type="video/mp4" />
				</video>
			</div>
			<button
				type="button"
				onClick={toggle}
				className="mkt-readout inline-flex min-h-11 items-center gap-2 px-2 text-ink-muted hover:text-ink"
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 10 10"
					className="size-2.5 fill-current"
				>
					{playing ? (
						<path d="M1 0h3v10H1zM6 0h3v10H6z" />
					) : (
						<path d="M1 0l9 5-9 5z" />
					)}
				</svg>
				{playing ? buttons.pause : buttons.play}
			</button>
		</div>
	);
}
