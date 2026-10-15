import { useEffect, useRef } from "react";

// The go-live recording's frame (poster size); keeps the layout from shifting.
const WIDTH = 560;
const HEIGHT = 1213;

/**
 * Product footage, played once, muted. SSR ships the poster with
 * preload="none". After mount: wide screens fetch metadata and autoplay;
 * phones and Save-Data play once it scrolls into view; reduced motion never
 * autoplays. Native controls are always on: the clip runs 8s, so viewers
 * need a way to pause it (WCAG 2.2.2).
 */
export function HeroVideo({
	src,
	poster,
	label,
}: {
	src: string;
	poster: string;
	label: string;
}) {
	const ref = useRef<HTMLVideoElement>(null);

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

	return (
		<video
			ref={ref}
			controls
			muted
			playsInline
			poster={poster}
			preload="none"
			width={WIDTH}
			height={HEIGHT}
			aria-label={label}
			className="h-auto max-h-[60svh] w-auto max-w-full rounded-xl bg-surface"
		>
			<source src={src} type="video/mp4" />
		</video>
	);
}
