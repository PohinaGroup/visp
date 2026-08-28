import { expect, test } from "bun:test";
import {
	authenticatedProgramUrls,
	authenticatedRtspUrl,
	browserRefreshDue,
	compositorExited,
	compositorHasPublisher,
	publisherProbeArgs,
	shouldCrossfadeScenes,
	studioXfadeFilter,
} from "./state";

test("only a completed compositor process triggers failure fallback", () => {
	expect(compositorExited(undefined)).toBe(false);
	expect(compositorExited(null)).toBe(false);
	expect(compositorExited(0)).toBe(true);
	expect(compositorExited(1)).toBe(true);
});

test("probes the local RTSP program before announcing health", () => {
	expect(publisherProbeArgs("rtsp://127.0.0.1:8554/studio/path-1")).toEqual([
		"ffprobe",
		"-v",
		"error",
		"-rtsp_transport",
		"tcp",
		"-show_entries",
		"stream=index",
		"-of",
		"csv=p=0",
		"rtsp://127.0.0.1:8554/studio/path-1",
	]);
});

test("reports healthy only while the whole stable program pipeline is running", () => {
	expect(compositorHasPublisher("passthrough", null, null, null)).toBe(false);
	expect(compositorHasPublisher("program", undefined, null, null)).toBe(false);
	expect(compositorHasPublisher("program", null, null, null)).toBe(true);
	expect(compositorHasPublisher("program", 1, null, null)).toBe(false);
	expect(compositorHasPublisher("program", null, 1, null)).toBe(false);
	expect(compositorHasPublisher("program", null, null, 1)).toBe(false);
});

test("crossfades only when the active scene actually changes to fade", () => {
	expect(shouldCrossfadeScenes("scene-a", "scene-a", "fade")).toBe(false);
	expect(shouldCrossfadeScenes("scene-a", "scene-b", "cut")).toBe(false);
	expect(shouldCrossfadeScenes("scene-a", "scene-b", "fade")).toBe(true);
	expect(shouldCrossfadeScenes(undefined, "scene-a", "fade")).toBe(false);
});

test("refreshes live browser frames continuously but not after runtime failure", () => {
	expect(browserRefreshDue(true, false, 1_000, 7_000)).toBe(true);
	expect(browserRefreshDue(true, false, 5_000, 7_000)).toBe(false);
	expect(browserRefreshDue(true, true, 1_000, 7_000)).toBe(false);
	expect(browserRefreshDue(false, false, 1_000, 7_000)).toBe(false);
});

test("uses a two-input crossfade for scene fades", () => {
	expect(studioXfadeFilter()).toContain("[old][next]xfade=");
	expect(studioXfadeFilter()).toContain("[0:a][1:a]acrossfade=");
});

test("keeps compositor credentials in local media access and out of relay plans", () => {
	const urls = authenticatedProgramUrls(
		"rtsp://127.0.0.1:8554/studio/path-1",
		"studio-compositor",
		"secret pass",
	);
	expect(urls).toEqual({
		publishUrl:
			"rtsp://studio-compositor:secret%20pass@127.0.0.1:8554/studio/path-1",
		readUrl: "rtsp://127.0.0.1:8554/studio/path-1",
	});
	expect(publisherProbeArgs(urls.publishUrl)).toContain(urls.publishUrl);
	expect(
		authenticatedRtspUrl(
			"rtsp://127.0.0.1:8554/path-1",
			"studio:path-1",
			"secret pass",
		),
	).toBe("rtsp://studio%3Apath-1:secret%20pass@127.0.0.1:8554/path-1");
});
