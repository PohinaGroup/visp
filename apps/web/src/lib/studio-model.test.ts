import type { StudioGraph } from "@VISP/api/studio";
import { describe, expect, test } from "bun:test";
import {
	addStudioLayer,
	addStudioScene,
	addStudioSource,
	deleteStudioLayer,
	deleteStudioScene,
	moveStudioLayer,
	navigationChoice,
	newStudioScene,
	renameStudioScene,
	selectStudioScene,
	shouldEnterStudio,
	studioLayerDisplayState,
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
});
