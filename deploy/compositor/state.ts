export function compositorExited(exitCode: number | null | undefined) {
	return exitCode !== null && exitCode !== undefined;
}

export function compositorHasPublisher(
	requestedMode: "program" | "passthrough",
	publisherExitCode: number | null | undefined,
	rendererExitCode: number | null | undefined,
	outputExitCode: number | null | undefined,
) {
	return (
		requestedMode === "program" &&
		publisherExitCode === null &&
		rendererExitCode === null &&
		outputExitCode === null
	);
}

export function shouldCrossfadeScenes(
	previousSceneId: string | undefined,
	nextSceneId: string | null,
	transition: "cut" | "fade",
) {
	return (
		previousSceneId !== undefined &&
		nextSceneId !== null &&
		previousSceneId !== nextSceneId &&
		transition === "fade"
	);
}

export function publisherProbeArgs(readUrl: string) {
	return [
		"ffprobe",
		"-v",
		"error",
		"-rtsp_transport",
		"tcp",
		"-analyzeduration",
		"1",
		"-probesize",
		"32",
		"-show_entries",
		"stream=index",
		"-of",
		"csv=p=0",
		readUrl,
	];
}

export function authenticatedProgramUrls(
	value: string,
	user: string,
	password: string,
) {
	return {
		publishUrl: authenticatedRtspUrl(value, user, password),
		readUrl: value,
	};
}

export function authenticatedRtspUrl(
	value: string,
	user: string,
	password: string,
) {
	const url = new URL(value);
	url.username = user;
	url.password = password;
	return url.toString();
}

export function studioXfadeFilter() {
	return "[0:v]setpts=PTS-STARTPTS[old];[1:v]setpts=PTS-STARTPTS[next];[old][next]xfade=transition=fade:duration=0.5:offset=0[video];[0:a][1:a]acrossfade=d=0.5[audio]";
}

export function browserRefreshDue(
	hasBrowser: boolean,
	runtimeDisabled: boolean,
	lastRefreshMs: number,
	nowMs: number,
) {
	return hasBrowser && !runtimeDisabled && nowMs - lastRefreshMs >= 5_000;
}

// About 1.5 MiB per receiver. Overflow is fatal so the supervisor restarts
// instead of continuing to show a stale queue of frames.
export function studioReceiveUrl(
	url: string,
	packets = process.env.STUDIO_FIFO_PACKETS ?? "8192",
) {
	if (
		!/^\d+$/.test(packets) ||
		Number(packets) < 128 ||
		Number(packets) > 65536
	)
		throw new Error("STUDIO_FIFO_PACKETS must be between 128 and 65536");
	return `${url}&fifo_size=${packets}&overrun_nonfatal=0`;
}

export function studioVideoArgs() {
	const encoder = process.env.STUDIO_VIDEO_ENCODER ?? "libx264";
	return [
		"-c:v",
		encoder,
		"-preset",
		"veryfast",
		"-bf",
		"0",
		...(encoder === "libx264"
			? ["-tune", "zerolatency", "-crf", process.env.STUDIO_CRF ?? "18"]
			: []),
		"-maxrate",
		process.env.STUDIO_MAXRATE ?? "12000k",
		"-bufsize",
		process.env.STUDIO_BUFSIZE ?? "12000k",
		"-pix_fmt",
		"yuv420p",
		"-r",
		process.env.STUDIO_FPS ?? "30",
		"-g",
		process.env.STUDIO_GOP ?? "60",
	];
}

// RTSP requires AAC extradata before its header is written. aac_adtstoasc
// discovers it too late on the live MPEG-TS input, so keep this encode.
export const STUDIO_AUDIO_PUBLISH_ARGS = [
	"-c:a",
	"aac",
	"-b:a",
	"192k",
	"-ac",
	"2",
	"-ar",
	"48000",
	"-flags:a",
	"+global_header",
];

export function studioImageArgs(
	source: string,
	fps = process.env.STUDIO_FPS ?? "30",
) {
	// image2 reopens the filename; the automatic png_pipe demuxer retains the
	// old inode after an atomic rename. Keep probing and decode queues short.
	return [
		"-f",
		"image2",
		"-pattern_type",
		"none",
		"-loop",
		"1",
		"-framerate",
		fps,
		"-analyzeduration",
		"1",
		"-probesize",
		"32",
		"-threads",
		"1",
		"-i",
		source,
	];
}

/**
 * Frames ffmpeg reports through `-progress`. Zero means the encoder has not
 * produced a frame yet, so switching the program feed to it would go silent.
 */
export function rendererProgressFrames(text: string) {
	const frames = [...text.matchAll(/^frame=\s*(\d+)\s*$/gm)];
	return Number(frames.at(-1)?.[1] ?? 0);
}
