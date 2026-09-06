import type { StudioGraph } from "@VISP/api/studio";
import { addStudioLayer, type StudioLayer, updateStudioLayer } from "./studio-model";

export function duplicateStudioLayer(graph: StudioGraph, layerId: string) {
	const scene = graph.scenes.find((scene) => scene.layers.some(({ id }) => id === layerId));
	const layer = scene?.layers.find(({ id }) => id === layerId);
	if (!scene || !layer) return graph;
	const scenes = addStudioLayer(graph.scenes, scene.id, layer.type, layer.type === "png" ? layer.assetId : undefined);
	const copy = scenes.find(({ id }) => id === scene.id)?.layers.at(-1);
	if (!copy) return graph;
	return updateStudioLayer({ ...graph, scenes }, copy.id, {
		...layer, name: `${layer.name.slice(0, 59)} copy`, zIndex: copy.zIndex,
		x: layer.x + 20, y: layer.y + 20,
	});
}

export function reorderStudioLayer(graph: StudioGraph, layerId: string, targetId: string) {
	return { ...graph, scenes: graph.scenes.map((scene) => {
		const layers = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);
		const from = layers.findIndex(({ id }) => id === layerId);
		const to = layers.findIndex(({ id }) => id === targetId);
		if (from < 0 || to < 0 || from === to) return scene;
		const [layer] = layers.splice(from, 1);
		if (!layer) return scene;
		layers.splice(to, 0, layer);
		return { ...scene, layers: layers.reverse().map((layer, zIndex) => ({ ...layer, zIndex })) };
	}) };
}

export type LayerRect = Pick<StudioLayer, "x" | "y" | "width" | "height">;
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function resizeStudioLayer(origin: LayerRect, handle: ResizeHandle, dx: number, dy: number, ratio: boolean): LayerRect {
	const west = handle.includes("w");
	const north = handle.includes("n");
	let width = handle === "n" || handle === "s" ? origin.width : origin.width + (west ? -dx : dx);
	let height = handle === "e" || handle === "w" ? origin.height : origin.height + (north ? -dy : dy);
	const maxWidth = west ? origin.x + origin.width : 1920 - origin.x;
	const maxHeight = north ? origin.y + origin.height : 1080 - origin.y;
	if (ratio) {
		const aspect = origin.width / origin.height;
		if (handle === "n" || handle === "s") width = height * aspect;
		else height = width / aspect;
		const scale = Math.max(1 / Math.min(origin.width, origin.height), Math.min(width / origin.width, maxWidth / origin.width, maxHeight / origin.height));
		width = origin.width * scale;
		height = origin.height * scale;
	}
	width = Math.max(1, Math.min(maxWidth, Math.round(width)));
	height = Math.max(1, Math.min(maxHeight, Math.round(height)));
	return { x: west ? origin.x + origin.width - width : origin.x, y: north ? origin.y + origin.height - height : origin.y, width, height };
}

export function snapStudioPosition(rect: LayerRect, tolerance: number) {
	const snap = (position: number, size: number, frame: number) => {
		const candidates = [{ position: 0, guide: 0 }, { position: (frame - size) / 2, guide: frame / 2 }, { position: frame - size, guide: frame }];
		const closest = candidates.sort((a, b) => Math.abs(position - a.position) - Math.abs(position - b.position))[0];
		return closest && Math.abs(position - closest.position) <= tolerance ? closest : { position, guide: undefined };
	};
	const x = snap(rect.x, rect.width, 1920);
	const y = snap(rect.y, rect.height, 1080);
	return { x: Math.round(x.position), y: Math.round(y.position), guideX: x.guide, guideY: y.guide };
}

export type StudioHistory = {
	graph?: StudioGraph;
	past: StudioGraph[];
	future: StudioGraph[];
	gesture?: StudioGraph;
	dirty: boolean;
	seq: number;
	version?: number;
};
export const emptyStudioHistory: StudioHistory = { past: [], future: [], dirty: false, seq: 0 };

export function editStudioHistory(state: StudioHistory, graph: StudioGraph): StudioHistory {
	if (JSON.stringify(state.graph) === JSON.stringify(graph)) return state;
	return { ...state, graph, dirty: true, seq: state.seq + 1, future: [],
		past: state.graph && !state.gesture ? [...state.past, state.graph].slice(-50) : state.past };
}
export function endStudioGesture(state: StudioHistory): StudioHistory {
	return { ...state, gesture: undefined, past: state.gesture && JSON.stringify(state.gesture) !== JSON.stringify(state.graph) ? [...state.past, state.gesture].slice(-50) : state.past };
}
export function travelStudioHistory(state: StudioHistory, direction: "past" | "future"): StudioHistory {
	if (state.gesture || !state.graph) return state;
	const graph = state[direction].at(-1);
	if (!graph) return state;
	const opposite = direction === "past" ? "future" : "past";
	return { ...state, graph, dirty: true, seq: state.seq + 1,
		[direction]: state[direction].slice(0, -1), [opposite]: [...state[opposite], state.graph].slice(-50) };
}
export function savedStudioHistory(state: StudioHistory, graph: StudioGraph, seq: number, version: number): StudioHistory {
	return { ...state, version, ...(state.seq === seq ? { graph, dirty: false } : {}) };
}
