import type { StudioGraph } from "@VISP/api/studio";
import { describe, expect, test } from "bun:test";
import {
	addStudioLayer,
	addStudioScene,
	addStudioSource,
	browserSourceUrlError,
	deleteStudioLayer,
	deleteStudioScene,
	draggedLayerPosition,
	moveStudioLayer,
	navigationChoice,
	newStudioScene,
	renameStudioScene,
	selectStudioScene,
	shouldEnterStudio,
	showStudioPassthroughWarning,
	studioErrorHint,
	studioLayerDisplayState,
	studioPreviewPanes,
	studioPreviewUrls,
	studioSaveBlockers,
	studioSourceCapacity,
	updateStudioLayer,
} from "./studio-model";

describe("Studio editor model", () => {
	test("sends a new cloud-mode user to Studio on first Direct entry", () => {
		expect(
			shouldEnterStudio({
				available: true,
				mode: "cloud_studio",
				configured: false,
			}),
		).toBe(true);
		expect(
			shouldEnterStudio({
				available: true,
				mode: "cloud_studio",
				configured: true,
			}),
		).toBe(false);
		expect(
			shouldEnterStudio({
				available: false,
				mode: "cloud_studio",
				configured: false,
			}),
		).toBe(false);
	});
	test("adds final-form sources locally without saving", () => {
		const scene = newStudioScene("scene-1", "Main");
		const next = addStudioLayer([scene], "scene-1", "text");
		expect(next[0]?.layers).toHaveLength(1);
		expect(scene.layers).toHaveLength(0);
	});

	test("blocks the ninth layer in the UI model", () => {
		let scenes = [newStudioScene("scene-1", "Main")];
		for (let index = 0; index < 8; index++)
			scenes = addStudioLayer(scenes, "scene-1", "text");
		expect(() => addStudioLayer(scenes, "scene-1", "text")).toThrow(
			"Layer limit reached (8)",
		);
	});

	test("creates and selects the first scene when adding from an empty Studio", () => {
		const sceneId = "11111111-1111-4111-8111-111111111111";
		const next = addStudioSource(
			{ activeSceneId: null, scenes: [] },
			"text",
			undefined,
			sceneId,
		);
		expect(next.activeSceneId).toBe(sceneId);
		expect(next.scenes[0]?.layers[0]?.type).toBe("text");
	});

	test("scene selection changes the saved active scene", () => {
		const first = newStudioScene("scene-1", "One");
		const second = newStudioScene("scene-2", "Two");
		expect(
			selectStudioScene(
				{ activeSceneId: "scene-1", scenes: [first, second] },
				"scene-2",
			).activeSceneId,
		).toBe("scene-2");
	});

	test("creates, names, and deletes scenes while preserving an active scene", () => {
		const first = newStudioScene("scene-1", "One");
		const graph = addStudioScene(
			{ activeSceneId: first.id, scenes: [first] },
			"scene-2",
		);
		expect(
			renameStudioScene(graph, "scene-2", "Interview").scenes[1]?.name,
		).toBe("Interview");
		expect(deleteStudioScene(graph, "scene-1").activeSceneId).toBe("scene-2");
		expect(() =>
			addStudioScene(addStudioScene(graph, "scene-3"), "scene-4"),
		).toThrow("Scene limit reached (3)");
	});

	test("edits transforms, alert rules, ordering, and layer deletion", () => {
		let graph: StudioGraph = addStudioSource(
			{ activeSceneId: null, scenes: [] },
			"alert",
			undefined,
			"scene-1",
		);
		graph = addStudioSource(graph, "text");
		const alertId = graph.scenes[0]?.layers[0]?.id ?? "";
		const textId = graph.scenes[0]?.layers[1]?.id ?? "";
		graph = updateStudioLayer(graph, alertId, {
			x: 120,
			y: 80,
			width: 800,
			height: 180,
			event: "donation",
		});
		expect(graph.scenes[0]?.layers[0]).toMatchObject({
			x: 120,
			y: 80,
			width: 800,
			height: 180,
			event: "donation",
		});
		graph = updateStudioLayer(graph, alertId, { x: 99_999, width: 0 });
		expect(graph.scenes[0]?.layers[0]).toMatchObject({ x: 1919, width: 1 });
		graph = updateStudioLayer(graph, alertId, {
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
		});
		expect(() =>
			updateStudioLayer(graph, textId, {
				x: 0,
				y: 0,
				width: 1920,
				height: 1080,
			}),
		).not.toThrow();
		graph = updateStudioLayer(graph, textId, {
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
		});
		graph = addStudioSource(graph, "text");
		const thirdId = graph.scenes[0]?.layers[2]?.id ?? "";
		expect(() =>
			updateStudioLayer(graph, thirdId, { width: 1920, height: 1080 }),
		).toThrow("pixel budget");
		graph = deleteStudioLayer(graph, thirdId);
		graph = moveStudioLayer(graph, textId, "down");
		expect(
			graph.scenes[0]?.layers.map(({ id, zIndex }) => [id, zIndex]),
		).toEqual([
			[textId, 0],
			[alertId, 1],
		]);
		expect(deleteStudioLayer(graph, alertId).scenes[0]?.layers).toHaveLength(1);
	});

	test("navigation choices are truthful and runtime failures remain selectable", () => {
		expect(navigationChoice("save")).toBe("save-before-leaving");
		expect(navigationChoice("discard")).toBe("leave-without-saving");
		expect(navigationChoice("cancel")).toBe("stay");
		expect(
			studioLayerDisplayState({ visible: true, runtimeDisabled: true }),
		).toEqual({
			failed: true,
			visible: false,
		});
	});

	test("only opens WHEP previews for paths that can exist", () => {
		const preview = { camera: "camera", program: "program" };
		expect(studioPreviewUrls(preview, false, false)).toEqual({});
		expect(studioPreviewUrls(preview, true, true)).toEqual({
			camera: "camera",
		});
		expect(studioPreviewUrls(preview, true, false)).toEqual(preview);
	});

	test("does not report an idle compositor as unavailable", () => {
		expect(showStudioPassthroughWarning(false, true)).toBe(false);
		expect(showStudioPassthroughWarning(true, true)).toBe(true);
		expect(showStudioPassthroughWarning(true, false)).toBe(false);
	});

	test("reports unsafe browser source URLs before save", () => {
		expect(browserSourceUrlError("not-a-url")).toBe(
			"Browser source must be a public HTTPS URL",
		);
		expect(
			browserSourceUrlError("https://widgets.example.com/live"),
		).toBeNull();
	});
	test("always explains why a preview pane is empty", () => {
		const preview = { camera: "camera", program: "program" };
		expect(studioPreviewPanes(preview, true, false)).toEqual({
			camera: { url: "camera" },
			program: { url: "program" },
		});
		expect(studioPreviewPanes(preview, false, false).camera).toEqual({
			reason: "idle",
		});
		expect(studioPreviewPanes(preview, true, true).program).toEqual({
			reason: "passthrough",
		});
		expect(studioPreviewPanes(null, true, false).camera).toEqual({
			reason: "no-path",
		});
		expect(studioPreviewPanes(preview, true, false, false).program).toEqual({
			reason: "offline",
		});
	});

	test("turns raw limit errors into a next step", () => {
		expect(studioErrorHint("Layer limit reached (8)")).toContain(
			"Delete a source",
		);
		expect(studioErrorHint("Something unmapped")).toBe("Something unmapped");
	});

	test("names the source that blocks a save", () => {
		const withBrowser = addStudioSource(
			{ activeSceneId: null, scenes: [] },
			"browser",
		);
		const layer = withBrowser.scenes[0]?.layers[0];
		expect(studioSaveBlockers(withBrowser)).toEqual([]);
		const broken = updateStudioLayer(withBrowser, layer?.id ?? "", {
			url: "http://insecure.example.com/",
		});
		expect(studioSaveBlockers(broken)).toEqual([
			{
				sceneId: withBrowser.scenes[0]?.id ?? "",
				sceneName: "Main",
				layerId: layer?.id ?? "",
				layerName: "Browser",
				message: "Browser source must be a public HTTPS URL",
			},
		]);
	});

	test("reports how much source headroom is left", () => {
		const graph = addStudioSource({ activeSceneId: null, scenes: [] }, "alert");
		const capacity = studioSourceCapacity(graph, graph.activeSceneId ?? "");
		expect(capacity.alert).toEqual({ used: 1, max: 1 });
		expect(capacity.layers).toEqual({ used: 1, max: 8 });
		expect(capacity.scenes).toEqual({ used: 1, max: 3 });
	});
	test("translates pointer travel into frame pixels", () => {
		// A canvas rendered at 960px is half frame scale, so 30px of pointer
		// travel is 60 frame pixels.
		expect(
			draggedLayerPosition(
				{ x: 100, y: 40 },
				{ x: 500, y: 300 },
				{ x: 530, y: 285 },
				960 / 1920,
			),
		).toEqual({ x: 160, y: 10 });
		expect(
			draggedLayerPosition(
				{ x: 100, y: 40 },
				{ x: 0, y: 0 },
				{ x: 9, y: 9 },
				0,
			),
		).toEqual({ x: 100, y: 40 });
	});

	test("keeps a dragged layer inside the frame", () => {
		const graph = addStudioSource({ activeSceneId: null, scenes: [] }, "text");
		const layer = graph.scenes[0]?.layers[0];
		const moved = updateStudioLayer(graph, layer?.id ?? "", {
			x: 5_000,
			y: -200,
		});
		expect(moved.scenes[0]?.layers[0]).toMatchObject({ x: 1280, y: 0 });
	});
});
