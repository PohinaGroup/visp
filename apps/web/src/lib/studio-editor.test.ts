import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
	duplicateStudioLayer,
	editStudioHistory,
	emptyStudioHistory,
	endStudioGesture,
	reorderStudioLayer,
	resizeStudioLayer,
	savedStudioHistory,
	snapStudioPosition,
	travelStudioHistory,
} from "./studio-editor";
import {
	addStudioSource,
	deleteStudioLayer,
	draggedLayerPosition,
	updateStudioLayer,
} from "./studio-model";

const graph = addStudioSource({ activeSceneId: null, scenes: [] }, "text");
const layer = graph.scenes[0]?.layers[0];
assert(layer);

describe("Studio editing", () => {
	test("duplicates content with a fresh id and enforces existing limits", () => {
		const copy = duplicateStudioLayer(graph, layer.id);
		expect(copy.scenes[0]?.layers[1]).toMatchObject({
			text: "Text",
			name: "Text copy",
			x: 60,
			zIndex: 1,
		});
		expect(copy.scenes[0]?.layers[1]?.id).not.toBe(layer.id);
		const alert = addStudioSource({ activeSceneId: null, scenes: [] }, "alert");
		const alertLayer = alert.scenes[0]?.layers[0];
		assert(alertLayer);
		expect(() => duplicateStudioLayer(alert, alertLayer.id)).toThrow(
			"Alert layer limit",
		);
		let full = graph;
		for (let i = 1; i < 8; i++) full = addStudioSource(full, "text");
		expect(() => duplicateStudioLayer(full, layer.id)).toThrow("Layer limit");
		const huge = updateStudioLayer(copy, layer.id, {
			width: 1920,
			height: 1080,
		});
		expect(() => duplicateStudioLayer(huge, layer.id)).toThrow("pixel budget");
	});
	test("reorders without changing the program scene and preserves order after deletion", () => {
		const three = addStudioSource(addStudioSource(graph, "text"), "text");
		const last = three.scenes[0]?.layers[2];
		assert(last);
		const moved = reorderStudioLayer(three, layer.id, last.id);
		expect(moved.activeSceneId).toBe(graph.activeSceneId);
		expect(moved.scenes[0]?.layers.at(-1)?.id).toBe(layer.id);
		const unordered = {
			...moved,
			scenes: moved.scenes.map((scene) => ({
				...scene,
				layers: [...scene.layers].reverse(),
			})),
		};
		expect(
			deleteStudioLayer(unordered, last.id).scenes[0]?.layers.at(-1)?.id,
		).toBe(layer.id);
	});
	test("resizes all corners within the frame, preserving ratio when requested", () => {
		const rect = { x: 100, y: 100, width: 400, height: 200 };
		expect(resizeStudioLayer(rect, "se", 200, 100, true)).toEqual({
			...rect,
			width: 600,
			height: 300,
		});
		expect(resizeStudioLayer(rect, "nw", -100, -50, true)).toEqual({
			x: 0,
			y: 50,
			width: 500,
			height: 250,
		});
		for (const handle of [
			"nw",
			"n",
			"ne",
			"e",
			"se",
			"s",
			"sw",
			"w",
		] as const) {
			for (const delta of [-10000, 10000]) {
				const next = resizeStudioLayer(rect, handle, delta, delta, true);
				expect(next.x).toBeGreaterThanOrEqual(0);
				expect(next.y).toBeGreaterThanOrEqual(0);
				expect(next.x + next.width).toBeLessThanOrEqual(1920);
				expect(next.y + next.height).toBeLessThanOrEqual(1080);
				expect(next.width).toBeGreaterThanOrEqual(1);
				expect(next.height).toBeGreaterThanOrEqual(1);
			}
		}
	});
	test("snaps frame coordinates after converting a zoomed drag", () => {
		const position = draggedLayerPosition(
			{ x: 600, y: 470 },
			{ x: 10, y: 10 },
			{ x: 29, y: 14 },
			0.5,
		);
		expect(snapStudioPosition({ ...layer, ...position }, 12)).toMatchObject({
			x: 640,
			y: 480,
			guideX: 960,
			guideY: 540,
		});
		expect(snapStudioPosition({ ...layer, x: 300, y: 300 }, 6)).toMatchObject({
			x: 300,
			y: 300,
			guideX: undefined,
			guideY: undefined,
		});
	});
	test("records one undo per gesture and clears redo after another edit", () => {
		const start = { ...emptyStudioHistory, graph, version: 4, gesture: graph };
		let history = editStudioHistory(
			start,
			updateStudioLayer(graph, layer.id, { x: 80 }),
		);
		assert(history.graph);
		history = editStudioHistory(
			history,
			updateStudioLayer(history.graph, layer.id, { x: 120 }),
		);
		expect(history.past).toHaveLength(0);
		history = endStudioGesture(history);
		expect(history.past).toHaveLength(1);
		const undone = travelStudioHistory(history, "past");
		expect(undone.graph).toEqual(graph);
		expect(travelStudioHistory(undone, "future").graph).toEqual(history.graph);
		expect(
			editStudioHistory(undone, updateStudioLayer(graph, layer.id, { y: 50 }))
				.future,
		).toHaveLength(0);
		for (let i = 0; i < 100; i++) {
			assert(history.graph);
			history = editStudioHistory(
				history,
				updateStudioLayer(history.graph, layer.id, { x: i }),
			);
		}
		expect(history.past).toHaveLength(50);
	});
	test("a save keeps newer edits and advances only the saved revision", () => {
		const start = { ...emptyStudioHistory, graph, version: 4 };
		const changed = editStudioHistory(
			start,
			updateStudioLayer(graph, layer.id, { x: 60 }),
		);
		assert(changed.graph);
		const newer = editStudioHistory(
			changed,
			updateStudioLayer(changed.graph, layer.id, { x: 80 }),
		);
		assert(newer.graph);
		expect(newer.version).toBe(4);
		const saved = savedStudioHistory(newer, changed.graph, changed.seq, 5);
		expect(saved.graph).toEqual(newer.graph);
		expect(saved.dirty).toBe(true);
		expect(saved.version).toBe(5);
		expect(savedStudioHistory(newer, newer.graph, newer.seq, 5).dirty).toBe(
			false,
		);
	});
});
