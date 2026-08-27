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
	return { publishUrl: authenticatedRtspUrl(value, user, password), readUrl: value };
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
