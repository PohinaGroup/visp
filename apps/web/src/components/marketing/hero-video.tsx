import { useEffect, useRef, useState } from "react";

import { mktPhone } from "./styles";

// The go-live recording's frame (poster size); keeps the layout from shifting.
const WIDTH = 560;
const HEIGHT = 1213;

/**
 * Product footage in a phone bezel, looping, muted. SSR ships the poster with
 * preload="none". After mount: wide screens fetch metadata and autoplay;
 * phones and Save-Data play once it scrolls into view; reduced motion never
 * autoplays. The loop runs on its own, so the screen itself is a play/pause
 * button (WCAG 2.2.2); its icon shows on hover, focus, or when paused, so no
 * native controls or caption clutter the frame.
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
		<div className={`${mktPhone} relative self-center lg:self-auto`}>
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
				className="block h-auto max-h-[60svh] w-auto max-w-full rounded-[1.75rem] bg-black"
			>
				<source src={src} type="video/mp4" />
			</video>
			<button
				type="button"
				onClick={toggle}
				aria-label={playing ? buttons.pause : buttons.play}
				className="group absolute inset-2 grid place-items-center rounded-[1.75rem] focus-visible:outline-2 focus-visible:outline-offset-4"
			>
				<span
					className={`grid size-12 place-items-center rounded-full bg-black/60 text-white transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${playing ? "opacity-0" : "opacity-100"}`}
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 10 10"
						className="size-3.5 fill-current"
					>
						{playing ? (
							<path d="M1 0h3v10H1zM6 0h3v10H6z" />
						) : (
							<path d="M1 0l9 5-9 5z" />
						)}
					</svg>
				</span>
			</button>
		</div>
	);
}
