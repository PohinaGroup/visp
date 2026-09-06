import type { StudioGraph } from "@VISP/api/studio";
import { useCallback, useEffect, useRef, useState } from "react";
import { editStudioHistory, emptyStudioHistory, endStudioGesture, savedStudioHistory, type StudioHistory, travelStudioHistory } from "@/lib/studio-editor";

export function useStudioDraft(remote?: { graph: StudioGraph; settings: { version: number } }) {
	const [state, setState] = useState(emptyStudioHistory);
	const current = useRef(state);
	const commit = useCallback((next: StudioHistory) => {
		current.current = next;
		setState(next);
	}, []);
	useEffect(() => {
		const previous = current.current;
		if (!remote || previous.dirty || previous.gesture || remote.settings.version < (previous.version ?? 0)) return;
		commit({ ...previous, graph: remote.graph, version: remote.settings.version,
			...(previous.version !== remote.settings.version ? { past: [], future: [] } : {}) });
	}, [remote, commit]);
	return {
		...state,
		current,
		edit: (updater: (graph: StudioGraph) => StudioGraph) => {
			if (current.current.graph) commit(editStudioHistory(current.current, updater(current.current.graph)));
		},
		beginGesture: () => commit({ ...current.current, gesture: current.current.graph }),
		endGesture: () => commit(endStudioGesture(current.current)),
		undo: () => commit(travelStudioHistory(current.current, "past")),
		redo: () => commit(travelStudioHistory(current.current, "future")),
		saved: (graph: StudioGraph, seq: number, version: number) => commit(savedStudioHistory(current.current, graph, seq, version)),
	};
}
